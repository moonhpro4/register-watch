// Hik-Connect cloud live relay (VTM) client, ported from the open-source pyezvizapi / hikcloudstream code.
// Platform neutral: you give it a `connect(host, port)` that returns { write(u8), next() -> Promise<u8|null>, close() }.
const { hdrs } = require("./hikcloud");
const enc = new TextEncoder(), dec = new TextDecoder();
const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };

// ---- tiny protobuf ----
function varint(n) { const o = []; while (n > 0x7f) { o.push((n % 128) | 0x80); n = Math.floor(n / 128); } o.push(n); return Uint8Array.from(o); }
const pBytes = (f, b) => cat(varint(f * 8 + 2), varint(b.length), b);
const pStr = (f, s) => pBytes(f, enc.encode(s));
const pVar = (f, v) => cat(varint(f * 8), varint(v));
function rdVar(d, pos) { let shift = 0, v = 0; while (pos < d.length) { const b = d[pos++]; v += (b & 0x7f) * 2 ** shift; if (!(b & 0x80)) return [v, pos]; shift += 7; if (shift >= 64) break; } throw new Error("varint"); }
function fields(d) {
  const f = {}; let pos = 0;
  while (pos < d.length) {
    let key; [key, pos] = rdVar(d, pos); const field = Math.floor(key / 8), wt = key & 7; if (!f[field]) f[field] = [];
    if (wt === 0) { let v; [v, pos] = rdVar(d, pos); f[field].push(v); }
    else if (wt === 2) { let n; [n, pos] = rdVar(d, pos); if (pos + n > d.length) throw new Error("proto length"); f[field].push(d.subarray(pos, pos + n)); pos += n; }
    else throw new Error("wire type " + wt);
  }
  return f;
}
const lastInt = (f, k) => (f[k] && typeof f[k][f[k].length - 1] === "number" ? f[k][f[k].length - 1] : null);
const lastStr = (f, k) => (f[k] && f[k][f[k].length - 1] instanceof Uint8Array ? dec.decode(f[k][f[k].length - 1]) : null);

// ---- VTM packet framing: 0x24 | channel | len(2) | seq(2) | code(2) | body ----
const CH = { MESSAGE: 0, STREAM: 1, ENC_MESSAGE: 0x0a, ENC_STREAM: 0x0b }, CODE = { KA_REQ: 0x132, KA_RSP: 0x133, INFO_REQ: 0x13b, INFO_RSP: 0x13c };
const packet = (body, channel, code, seq) => cat(Uint8Array.of(0x24, channel, body.length >> 8, body.length & 255, (seq >> 8) & 255, seq & 255, code >> 8, code & 255), body);
class Reader {
  constructor(sock, timeoutMs) { this.sock = sock; this.buf = new Uint8Array(0); this.timeoutMs = timeoutMs; }
  async chunk() { return Promise.race([this.sock.next(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout: device offline or unreachable")), this.timeoutMs))]); }
  async exact(n) { while (this.buf.length < n) { const c = await this.chunk(); if (!c) throw new Error("socket closed"); this.buf = cat(this.buf, c); } const o = this.buf.subarray(0, n); this.buf = this.buf.subarray(n); return o; }
}
async function readPacket(r) {
  const h = await r.exact(8); if (h[0] !== 0x24) throw new Error("bad magic");
  const len = (h[2] << 8) | h[3], body = len ? await r.exact(len) : new Uint8Array(0);
  return { channel: h[1], seq: (h[4] << 8) | h[5], code: (h[6] << 8) | h[7], body };
}

// ---- cloud API bits ----
const qp = (v) => encodeURIComponent(v).replace(/%20/g, "+").replace(/[!*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
async function jget(st, path, params, base) {
  const q = params ? "?" + Object.entries(params).map(([k, v]) => `${k}=${qp(String(v))}`).join("&") : "";
  const r = await fetch(`${base || st.base}${path}${q}`, { headers: hdrs(st) }); return r.json();
}
function jwtClaim(jwt, name) { try { const p = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(atob(p + "=".repeat((4 - (p.length % 4)) % 4)))[name]; } catch { return null; } }
async function vtduTokens(st) {
  let last = "";
  try {
    const r = await fetch(`${st.base}/api/user/token/get`, { method: "POST", headers: { ...hdrs(st), "Content-Type": "application/x-www-form-urlencoded" }, body: `sessionId=${qp(st.session)}&count=5` });
    const j = await r.json(), t = j.tokenArray || j.tokens; if (Array.isArray(t) && t.length) return t.map(String); last = JSON.stringify(j).slice(0, 120);
  } catch (e) { last = String(e); }
  const sign = jwtClaim(st.session, "s"), host = new URL(st.base).hostname, cands = [];
  try { const si = (await jget(st, "/v3/configurations/system/info")).systemConfigInfo || {}; if (si.authAddr && !/null|none/i.test(si.authAddr)) cands.push(/^https?:/.test(si.authAddr) ? si.authAddr : "https://" + si.authAddr); } catch {}
  const m = host.match(/^api(.*)\.hik-connect\.com$/); if (m) cands.push(`https://${m[1]}auth.hik-connect.com`, `https://auth${m[1]}.hik-connect.com`, `https://${m[1]}auth.ezvizlife.com`);
  for (const b of cands) { try { const j = await jget(st, "/vtdutoken2", { ssid: st.session, sign }, b.replace(/\/$/, "")); if ((j.retcode === 0 || j.retcode === "0") && j.tokens && j.tokens.length) return j.tokens.map(String); } catch (e) { last = String(e); } }
  throw new Error("no VTDU token: " + last);
}
async function streamUrl(st, serial, ch, stream) {
  const pl = await jget(st, "/v3/userdevices/v1/resources/pagelist", { groupId: -1, limit: 50, offset: 0, filter: "VTM" });
  const res = (pl.resourceInfos || []).find((x) => x.deviceSerial === serial && String(x.localIndex) === String(ch));
  if (!res) throw new Error(`no VTM resource for channel ${ch} (empty slot or not streamable)`);
  let vtm = (pl.VTM || {})[res.resourceId]; if (!vtm) throw new Error("no VTM server for resource");
  try { const cfg = (await jget(st, `/v3/streaming/vtm/${serial}/${ch}`)).streamServerConfig; if (cfg) vtm = { ...vtm, ...cfg }; } catch {}
  const host = String(vtm.externalIp || vtm.domain || vtm.internalIp || "").trim(), port = Number(vtm.port);
  if (!host || !port) throw new Error("no VTM endpoint");
  const token = (await vtduTokens(st))[0];
  const biz = String(res.streamBizUrl || ""), bq = biz.includes("?") ? biz.split("?")[1] : biz.replace(/^\?/, "");
  const params = []; for (const [k, v] of new URLSearchParams(bq)) params.push([k, v]);
  for (const kv of [["dev", serial], ["chn", String(ch)], ["stream", String(stream)], ["cln", "55"], ["isp", "0"], ["auth", "1"], ["ssn", token], ["vip", "0"], ["timestamp", String(Date.now())]]) {
    const i = params.findIndex((p) => p[0] === kv[0]); if (i >= 0) params.splice(i, 1); params.push(kv);
  }
  return { host, port, url: `ysproto://${host.includes(":") ? "[" + host + "]" : host}:${port}/live?` + params.map(([k, v]) => `${qp(k)}=${qp(v)}`).join("&") };
}
function parseUrl(u) { const m = u.match(/^ysproto:\/\/(\[[^\]]+\]|[^:\/]+):(\d+)\//); if (!m) throw new Error("bad VTM url"); return { host: m[1].replace(/^\[|\]$/g, ""), port: Number(m[2]) }; }

// ---- open a live stream; returns an async iterator of RTP packet bodies ----
const CLIENT_VERSION = "v3.6.3.20221124";
async function openLive(st, serial, ch, connect, opts = {}) {
  const stream = opts.stream || 2, timeout = opts.timeoutMs || 12000;
  const target = await streamUrl(st, serial, ch, stream);
  let url = target.url, host = target.host, port = target.port, key = null, sock, reader, seq = 0, info = null;
  for (let hop = 0; hop < 4; hop++) {
    sock = await connect(host, port); reader = new Reader(sock, timeout);
    const body = cat(pStr(1, url), key ? pStr(2, key) : new Uint8Array(0), pStr(3, CLIENT_VERSION), pVar(4, 0), pStr(6, CLIENT_VERSION));
    await sock.write(packet(body, CH.MESSAGE, CODE.INFO_REQ, seq++ & 0xffff));
    let redirect = false;
    for (let i = 0; i < 20 && !redirect && !info; i++) {
      const p = await readPacket(reader);
      if (p.code !== CODE.INFO_RSP) continue;
      const f = fields(p.body), r = { result: lastInt(f, 1), ssn: lastStr(f, 4), vkey: lastStr(f, 5), url: lastStr(f, 7) };
      if (r.result && r.url && r.vkey && hop < 3) { sock.close(); url = r.url; key = r.vkey; ({ host, port } = parseUrl(url)); redirect = true; }
      else info = r;
    }
    if (info) break; if (!redirect) throw new Error("no stream info response");
  }
  if (!info) throw new Error("too many redirects");
  let lastKa = Date.now(), closed = false;
  async function* packets() {
    try {
      for (;;) {
        if (info.ssn && Date.now() - lastKa >= 5000) { await sock.write(packet(pBytes(1, enc.encode(info.ssn)), CH.MESSAGE, CODE.KA_REQ, seq++ & 0xffff)); lastKa = Date.now(); }
        const p = await readPacket(reader);
        if (p.code === CODE.KA_REQ) { await sock.write(packet(pBytes(1, enc.encode(info.ssn || "")), CH.MESSAGE, CODE.KA_RSP, seq++ & 0xffff)); lastKa = Date.now(); continue; }
        if ((p.channel === CH.STREAM || p.channel === CH.ENC_STREAM) && p.body.length) yield { body: p.body, encrypted: p.channel === CH.ENC_STREAM };
      }
    } finally { if (!closed) { closed = true; sock.close(); } }
  }
  return { info, stream, packets, close() { if (!closed) { closed = true; sock.close(); } } };
}

// ---- RTP (H.265 / RFC 7798) -> Annex-B ----
function rtpPayload(d) {
  if (d.length < 12 || d[0] >> 6 !== 2) return null;
  let off = 12 + (d[0] & 0x0f) * 4;
  if (d[0] & 0x10) { if (d.length < off + 4) return null; off += 4 + ((d[off + 2] << 8) | d[off + 3]) * 4; }
  let end = d.length; if (d[0] & 0x20) { const pad = d[d.length - 1]; if (!pad || pad > d.length) return null; end -= pad; }
  return off <= end ? d.subarray(off, end) : null;
}
const SC = Uint8Array.of(0, 0, 0, 1);
function hevcDepay(rtp) { // returns Annex-B bytes (maybe empty); only payload type 96 is video on these devices
  if (rtp.length < 13 || (rtp[1] & 0x7f) !== 96) return new Uint8Array(0);
  const p = rtpPayload(rtp); if (!p || p.length < 3) return new Uint8Array(0);
  const t = (p[0] >> 1) & 0x3f;
  if (t === 49) { const fu = p[2], ft = fu & 0x3f; return fu & 0x80 ? cat(SC, Uint8Array.of((p[0] & 0x81) | (ft << 1), p[1]), p.subarray(3)) : p.subarray(3); }
  if (t === 48) { const out = []; let i = 2; while (i + 2 <= p.length) { const n = (p[i] << 8) | p[i + 1]; i += 2; out.push(SC, p.subarray(i, i + n)); i += n; } return cat(...out); }
  return t <= 47 ? cat(SC, p) : new Uint8Array(0);
}
module.exports = { openLive, hevcDepay, rtpPayload, cat };
