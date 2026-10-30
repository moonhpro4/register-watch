// Hik-Connect cloud client (port of the community "hikcloudstream" REST parts). Unofficial: may break if Hikvision changes the service.
const _md5 = require("js-md5"); const md5 = typeof _md5 === "function" ? _md5 : _md5.md5;
const aesjs = require("aes-js");
const hex = (n) => [...Array(n)].map(() => Math.floor(Math.random() * 16).toString(16)).join("");
const isJpeg = (u) => u.length > 2 && u[0] === 0xff && u[1] === 0xd8;
const newState = (base) => ({ base: base || "https://api.hik-connect.com", fc: hex(32), session: null });
const hdr = (st, withSession = true) => ({ clientType: "55", clientVersion: "6.0.0.20250101", featureCode: st.fc, lang: "en-US", clientNo: "shadicam", clientName: "shadicam", osVersion: "Android", netType: "WIFI", ...(withSession && st.session ? { sessionId: st.session } : {}) });

async function login(st, email, password) {
  for (let hop = 0; hop < 3; hop++) {
    const r = await fetch(`${st.base}/v3/users/login/v2`, { method: "POST", headers: { ...hdr(st, false), "Content-Type": "application/x-www-form-urlencoded" },
      body: `account=${encodeURIComponent(email)}&password=${md5(password)}&featureCode=${st.fc}` });
    const p = await r.json(), m = p.meta || {};
    if (m.code === 1100) { const d = p.loginArea && p.loginArea.apiDomain; if (!d) throw new Error("login"); st.base = `https://${d}`; continue; } // account lives in another region
    if (m.code === 1013 || m.code === 1014) throw new Error("badlogin");
    if (m.code === 1015) throw new Error("captcha");
    if (m.code !== 200) throw new Error("api" + m.code);
    st.session = p.loginSession && p.loginSession.sessionId; if (!st.session) throw new Error("nosession");
    return;
  }
  throw new Error("redirect");
}
async function api(st, method, path, params) {
  const q = params ? "?" + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&") : "";
  const r = await fetch(`${st.base}${path}${q}`, { method, headers: hdr(st) }); const p = await r.json();
  if ((p.meta || {}).code !== 200) throw new Error("api" + (p.meta || {}).code);
  return p;
}
async function listCameras(st) {
  const out = []; let offset = 0;
  for (;;) {
    const p = await api(st, "GET", "/v3/userdevices/v1/devices/pagelist", { groupId: -1, limit: 50, offset, filter: "TIME_PLAN,CONNECTION,SWITCH,STATUS,STATUS_EXT,WIFI,NODISTURB,P2P,KMS,HIDDNS" });
    for (const d of p.deviceInfos || []) {
      if (!d.deviceSerial) continue;
      const ci = await api(st, "GET", "/v3/userdevices/v1/cameras/info", { deviceSerial: d.deviceSerial });
      for (const c of ci.cameraInfos || []) if (c.channelNo != null) out.push({ serial: d.deviceSerial, device: d.name || d.deviceSerial, ch: Number(c.channelNo), name: c.cameraName || `Channel ${c.channelNo}` });
    }
    if (!(p.page && p.page.hasNext)) break; offset += 50;
  }
  return out;
}
const pad16 = (s) => { const b = aesjs.utils.utf8.toBytes(s || ""); if (b.length >= 16) return b.slice(0, 16); const o = new Uint8Array(16); o.set(b); return o; };
const PREFIX = "hikencodepicture";
const isEncoded = (u) => u.length > 48 && [...PREFIX].every((c, i) => u[i] === c.charCodeAt(0));
function decryptCapture(raw, code) {
  if (isJpeg(raw)) return raw;
  if (!isEncoded(raw)) throw new Error("fmt");
  const body = raw.slice(48), usable = body.slice(0, body.length - (body.length % 16));
  let out = new aesjs.ModeOfOperation.cbc(pad16(code), pad16("01234567")).decrypt(usable);
  const n = out[out.length - 1];
  if (n >= 1 && n <= 16 && out.slice(out.length - n).every((x) => x === n)) out = out.slice(0, out.length - n);
  return out;
}
// download(url) -> Uint8Array. Returns JPEG bytes (cloud pictures are small, about 352x288) or null.
async function snapshot(st, serial, ch, code, download) {
  let last = null;
  for (const enc of [0, 1]) {
    try {
      const p = await api(st, "PUT", "/v3/devices/security/capture", { deviceSerial: serial, channelNo: ch, isEncrypted: enc });
      const url = p.captureInfo && p.captureInfo.picUrl; if (!url) continue;
      const raw = await download(url);
      if (isJpeg(raw)) return raw;
      const dec = decryptCapture(raw, code); if (isJpeg(dec)) return dec;
    } catch (e) { last = e; }
  }
  if (last) throw last; return null;
}
const b64ToBytes = (s) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const bytesToB64 = (u) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
module.exports = { newState, login, listCameras, snapshot, decryptCapture, b64ToBytes, bytesToB64 };
