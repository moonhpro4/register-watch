// End-to-end: real Hik-Connect cloud -> JS relay -> MPEG-TS over local HTTP -> ffmpeg decodes it like a player would.
const net = require("net"), http = require("http"), { spawn } = require("child_process");
const H = require("../app/hikcloud.js"), R = require("../app/hikrelay.js"), { LiveTs } = require("../app/hikts.js");
function nodeConnect(host, port) {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host, port }, () => {
      const q = []; let waiter = null, ended = false; const wake = () => { if (waiter) { const w = waiter; waiter = null; w(); } };
      s.on("data", (d) => { q.push(new Uint8Array(d)); wake(); }); s.on("close", () => { ended = true; wake(); }); s.on("error", () => { ended = true; wake(); });
      resolve({ write: (b) => new Promise((r) => s.write(b, r)), close: () => s.destroy(), next: async () => { while (!q.length) { if (ended) return null; await new Promise((r) => (waiter = r)); } return q.shift(); } });
    }); s.on("error", reject);
  });
}
(async () => {
  const st = H.newState(); await H.login(st, process.env.HIK_EMAIL, process.env.HIK_PASSWORD);
  const cams = await H.listCameras(st), cam = cams.find((c) => c.serial.endsWith("245") && c.ch === 1);
  const server = http.createServer(async (req, res) => {
    res.writeHead(200, { "Content-Type": "video/mp2t", "Cache-Control": "no-store" });
    const live = await R.openLive(st, cam.serial, cam.ch, nodeConnect, { stream: 2 }), mux = new LiveTs((b) => res.write(Buffer.from(b)));
    res.on("close", () => live.close());
    try { for await (const p of live.packets()) mux.feed(p.body); } catch (e) { res.end(); }
  }).listen(0, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${server.address().port}/live.ts`, t0 = Date.now();
    const ff = spawn("ffmpeg", ["-v", "info", "-stats", "-i", url, "-t", "8", "-f", "null", "-"]); let err = "";
    ff.stderr.on("data", (d) => (err += d)); 
    ff.on("close", () => {
      const video = (err.match(/Stream #0:0.*Video:[^\n]*/) || ["no video stream found"])[0].replace(/\s+/g, " ").slice(0, 150);
      const frames = [...err.matchAll(/frame=\s*(\d+)\s+fps=\s*([\d.]+)/g)].pop() || [0, "0", "0"];
      const errs = [...new Set((err.match(/\[(hevc|mpegts)[^\n]*(error|invalid|corrupt|missing|non-existing)[^\n]*/gi) || []).slice(0, 3))].join(" | ").slice(0, 200);
      const out = `TS over HTTP: ${video}%0Adecoded ${frames[1]} frames, ${frames[2]} fps in ${((Date.now() - t0) / 1000).toFixed(1)}s%0Adecoder complaints: ${errs || "none"}`;
      console.log("::notice::TS END-TO-END TEST%0A" + out); console.log(err.slice(-600)); server.close(); process.exit(0);
    });
  });
})().catch((e) => { console.log("::error::" + String(e.stack || e).slice(0, 300)); process.exit(1); });
