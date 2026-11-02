// Turns the relay's RTP/H.265 packets into a live MPEG-TS byte stream that Android's player (ExoPlayer) can play.
const { hevcDepay, cat } = require("./hikrelay");
const crcT = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i << 24; for (let k = 0; k < 8; k++) c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1; t[i] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (const x of b) c = ((c << 8) ^ crcT[((c >>> 24) ^ x) & 255]) >>> 0; return c; }
const PMT_PID = 0x1000, VID_PID = 0x100;
class LiveTs {
  constructor(onChunk) { this.out = onChunk; this.cc = { 0: 0, [PMT_PID]: 0, [VID_PID]: 0 }; this.au = []; this.t0 = null; this.last = 0; this.pts = 0; this.frames = 0; }
  section(pid, sec) { // single-packet PSI section with pointer_field
    const body = cat(sec, Uint8Array.of(...[24, 16, 8, 0].map((s) => (crc32(sec) >>> s) & 255)));
    const p = new Uint8Array(188).fill(0xff); p[0] = 0x47; p[1] = 0x40 | (pid >> 8); p[2] = pid & 255; p[3] = 0x10 | (this.cc[pid]++ & 15); p[4] = 0; p.set(body, 5); return p;
  }
  psi() {
    const pat = Uint8Array.of(0x00, 0xb0, 13, 0, 1, 0xc1, 0, 0, 0, 1, 0xe0 | (PMT_PID >> 8), PMT_PID & 255);
    const pmt = Uint8Array.of(0x02, 0xb0, 18, 0, 1, 0xc1, 0, 0, 0xe0 | (VID_PID >> 8), VID_PID & 255, 0xf0, 0, 0x24, 0xe0 | (VID_PID >> 8), VID_PID & 255, 0xf0, 0);
    return cat(this.section(0, pat), this.section(PMT_PID, pmt));
  }
  writeAu(annexB, pts) {
    const p = pts % 0x200000000, pb = (b, i) => b;
    const ptsB = Uint8Array.of(0x21 | ((p / 0x40000000) & 0x0e), (p / 0x400000) & 255 /*bits 29..22*/, (((p / 0x8000) & 0x7f) << 1) | 1, (p / 128) & 255, ((p & 0x7f) << 1) | 1);
    // PTS layout (33 bits): 4 | [32..30] | 1, [29..22], [21..15] | 1, [14..7], [6..0] | 1
    const hi = Math.floor(p / 0x40000000) & 7, mid1 = Math.floor(p / 0x400000) & 255, mid2 = Math.floor(p / 0x8000) & 127, lo1 = Math.floor(p / 128) & 255, lo2 = p & 127;
    const pesHdr = Uint8Array.of(0, 0, 1, 0xe0, 0, 0, 0x84, 0x80, 5, 0x21 | (hi << 1), mid1, (mid2 << 1) | 1, lo1, (lo2 << 1) | 1);
    const pes = cat(pesHdr, annexB), parts = [this.psi()];
    const pcr = Math.max(0, p - 4500); let off = 0, first = true;
    while (off < pes.length) {
      const t = new Uint8Array(188); t[0] = 0x47; t[1] = (first ? 0x40 : 0) | (VID_PID >> 8); t[2] = VID_PID & 255;
      let af = first ? 8 : 0; // adaptation: flags + 6 PCR bytes (+length byte)
      const room = 184 - af, take = Math.min(room, pes.length - off), pad = room - take;
      if (pad > 0 && af === 0) af = pad === 1 ? 1 : 2; // need an adaptation field for stuffing
      let afLen = first ? 7 + Math.max(0, pad) : pad; // total adaptation bytes after the length byte
      if (first || pad > 0) {
        t[3] = 0x30 | (this.cc[VID_PID]++ & 15); t[4] = first ? 7 + pad : pad - 1 < 0 ? 0 : pad - 1;
        let pos = 5;
        if (first) { t[pos++] = 0x50; const b = pcr; t[pos++] = (Math.floor(b / 0x1000000) >> 1) & 255; t[pos++] = (Math.floor(b / 0x20000)) & 255; t[pos++] = (Math.floor(b / 512)) & 255; t[pos++] = (Math.floor(b / 2)) & 255; t[pos++] = ((b & 1) << 7) | 0x7e; t[pos++] = 0; for (let i = 0; i < pad; i++) t[pos++] = 0xff; }
        else { if (pad >= 2) { t[pos++] = 0; for (let i = 0; i < pad - 2; i++) t[pos++] = 0xff; } }
        t.set(pes.subarray(off, off + take), 4 + 1 + (first ? 7 + pad : Math.max(0, pad - 1)));
      } else { t[3] = 0x10 | (this.cc[VID_PID]++ & 15); t.set(pes.subarray(off, off + take), 4); }
      parts.push(t); off += take; first = false;
    }
    this.out(cat(...parts));
  }
  feed(rtp) { // one RTP packet body from the relay
    if (rtp.length < 13 || (rtp[1] & 0x7f) !== 96) return;
    const ts = ((rtp[4] << 24) | (rtp[5] << 16) | (rtp[6] << 8) | rtp[7]) >>> 0, marker = rtp[1] >> 7;
    if (this.t0 === null) { this.t0 = ts; this.last = ts; this.pts = 90000; }
    this.pts += ((ts - this.last) | 0); this.last = ts; this.pts = Math.max(0, this.pts);
    const a = hevcDepay(rtp); if (a.length) this.au.push(a);
    if (marker && this.au.length) { this.writeAu(cat(...this.au), this.pts); this.au = []; this.frames++; }
  }
}
module.exports = { LiveTs };
