// Proves the JS port of the Hik-Connect relay against the real service, then checks the video decodes.
const net = require("net"), fs = require("fs"), { execFileSync } = require("child_process");
const H = require("../app/hikcloud.js"), R = require("../app/hikrelay.js");
function nodeConnect(host, port) {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host, port }, () => {
      const q = []; let waiter = null, ended = false;
      s.on("data", (d) => { q.push(new Uint8Array(d)); if (waiter) { const w = waiter; waiter = null; w(); } });
      s.on("close", () => { ended = true; if (waiter) { const w = waiter; waiter = null; w(); } }); s.on("error", () => { ended = true; if (waiter) { const w = waiter; waiter = null; w(); } });
      resolve({ write: (b) => new Promise((r) => s.write(b, r)), close: () => s.destroy(),
        next: async () => { while (!q.length) { if (ended) return null; await new Promise((r) => (waiter = r)); } return q.shift(); } });
    }); s.on("error", reject);
  });
}
const lines = []; const log = (x) => { lines.push(x); console.log(x); };
(async () => {
  const st = H.newState(); await H.login(st, process.env.HIK_EMAIL, process.env.HIK_PASSWORD);
  const cams = await H.listCameras(st), devs = {}; for (const c of cams) (devs[c.serial] = devs[c.serial] || []).push(c);
  log(`JS login ok: ${cams.length} channel slots on ${Object.keys(devs).length} devices`);
  const pick = []; for (const [ser, l] of Object.entries(devs)) for (const c of l) if ([1, 10, 12].includes(c.ch) && (ser.endsWith("245") || c.ch === 1)) pick.push(c);
  for (const c of pick) {
    const tag = `dev..${c.serial.slice(-3)} ch${c.ch}`, t0 = Date.now();
    try {
      const live = await R.openLive(st, c.serial, c.ch, nodeConnect, { stream: 2 });
      const chunks = []; let first = 0, n = 0;
      for await (const p of live.packets()) { const a = R.hevcDepay(p.body); if (a.length) { if (!first) first = Date.now() - t0; chunks.push(a); n++; } if (Date.now() - t0 > 7000) break; }
      live.close(); const data = Buffer.concat(chunks.map((x) => Buffer.from(x))); fs.writeFileSync("t.hevc", data);
      let probe = ""; try { probe = execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,nb_read_frames", "-of", "csv=p=0", "-f", "hevc", "t.hevc"]).toString().trim(); } catch (e) { probe = "ffprobe failed"; }
      log(`${tag}: ${data.length}B, first video after ${first}ms, ${n} video pkts -> ${probe}`);
    } catch (e) { log(`${tag}: ${String(e.message).slice(0, 110)}`); }
  }
  console.log("::notice::JS RELAY TEST%0A" + lines.join("%0A"));
})().catch((e) => { console.log("::error::" + String(e.stack || e).slice(0, 300)); process.exit(1); });
