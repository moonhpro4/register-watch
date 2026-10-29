// Talking to a Hikvision NVR/DVR over its local ISAPI (HTTP + digest login). No RN imports so it can be tested in Node.
const _md5 = require("js-md5"); const md5 = typeof _md5 === "function" ? _md5 : _md5.md5;
const hex = (n) => [...Array(n)].map(() => Math.floor(Math.random() * 16).toString(16)).join("");

// Makes one request to get the NVR's challenge, then returns the Authorization header for this URL.
async function digestHeaders(url, user, pass, method = "GET") {
  const r = await fetch(url, { method });
  if (r.status !== 401) return { auth: null, status: r.status };
  const h = r.headers.get("www-authenticate") || "";
  if (/^Basic/i.test(h)) return { auth: "Basic " + btoa(`${user}:${pass}`) };
  const p = {}; h.replace(/(\w+)=(?:"([^"]*)"|([^,\s]*))/g, (_, k, a, b) => { p[k] = a !== undefined ? a : b; });
  if (/sha-256/i.test(p.algorithm || "")) throw new Error("sha256");
  const uri = (url.match(/^https?:\/\/[^\/]+(\/.*)?$/) || [])[1] || "/";
  const nc = "00000001", cn = hex(16), ha1 = md5(`${user}:${p.realm}:${pass}`), ha2 = md5(`${method}:${uri}`);
  const resp = p.qop ? md5(`${ha1}:${p.nonce}:${nc}:${cn}:auth:${ha2}`) : md5(`${ha1}:${p.nonce}:${ha2}`);
  return { auth: `Digest username="${user}", realm="${p.realm}", nonce="${p.nonce}", uri="${uri}", algorithm=MD5, response="${resp}"` + (p.qop ? `, qop=auth, nc=${nc}, cnonce="${cn}"` : "") + (p.opaque ? `, opaque="${p.opaque}"` : "") };
}
async function isapi(nvr, path) {
  const url = `http://${nvr.host}:${nvr.port || 80}${path}`;
  const d = await digestHeaders(url, nvr.user, nvr.pass);
  const r = await fetch(url, d.auth ? { headers: { Authorization: d.auth } } : {});
  if (r.status === 401) throw new Error("auth");
  if (!r.ok) throw new Error("http" + r.status);
  return r.text();
}
const tag = (x, n) => (x.match(new RegExp(`<${n}>([^<]*)</${n}>`)) || [])[1] || "";
const parseDevice = (x) => ({ model: tag(x, "model"), serial: tag(x, "serialNumber"), name: tag(x, "deviceName") });
const parseChannels = (x) => [...x.matchAll(/<StreamingChannel(?:\s[^>]*)?>([\s\S]*?)<\/StreamingChannel>/g)]
  .map((m) => ({ id: tag(m[1], "id"), name: tag(m[1], "channelName") })).filter((c) => /^\d+01$/.test(c.id))
  .map((c) => ({ ...c, name: c.name || `Camera ${c.id.slice(0, -2)}` }));
module.exports = { digestHeaders, isapi, parseDevice, parseChannels };
