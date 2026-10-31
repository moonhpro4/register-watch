export interface Env { DB: D1Database; AI: any; APP_KEY: string; AI_MODEL: string; OLLAMA_API_KEY?: string; OLLAMA_MODEL?: string; AI_STAGE1?: string; AI_STAGE2?: string; AI_FIND?: string }
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });
const rand = () => [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, "0")).join("");
function b64(buf: ArrayBuffer) { let s = ""; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }
const img = (b: string) => new Response(Uint8Array.from(atob(b), c => c.charCodeAt(0)), { headers: { "content-type": "image/jpeg" } });
const isJpeg = (u: Uint8Array) => u.length > 3 && u[0] === 0xff && u[1] === 0xd8;
const DAY = 86_400_000, FRAME_MS = 30_000, KEEP_FRAMES_MS = 2 * DAY; // one saved picture per camera every 30 s, kept 2 days
const MAX_IMG = 1_400_000; // D1 rows are limited to 2 MB (base64 adds a third)

// Ask the vision model about one or more base64 JPEGs (in time order). If the model's message format differs, only askText changes.
async function askText(env: Env, imgs: string | string[], prompt: string): Promise<string> {
  const list = Array.isArray(imgs) ? imgs : [imgs];
  const r = await env.AI.run(env.AI_MODEL, { messages: [{ role: "user", content: [
    { type: "text", text: prompt }, ...list.map(i => ({ type: "image_url", image_url: { url: "data:image/jpeg;base64," + i } }))] }] });
  return String(r?.response ?? r?.choices?.[0]?.message?.content ?? "");
}
const parse = (text: string) => { const m = text.match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } };
const ask = async (env: Env, imgs: string | string[], prompt: string) => parse(await askText(env, imgs, prompt));
// ---- Two AI providers that share the work: Cloudflare Gemma (small, cheap, fast) and Ollama gemma4:31b (bigger). Each job has a preferred one; the other is the automatic fallback. ----
type Prov = "cf" | "ollama";
const hashS = (x: string) => [...x].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
function route(env: Env, job: "STAGE1" | "STAGE2" | "FIND", camId: string): Prov[] {
  if (!env.OLLAMA_API_KEY) return ["cf"];
  const v = (env as any)["AI_" + job] || (job === "STAGE2" ? "ollama" : "cf"); // cf | ollama | mix (mix = split cameras between the two)
  const first: Prov = v === "mix" ? (hashS(camId) % 2 ? "ollama" : "cf") : v === "ollama" ? "ollama" : "cf";
  return [first, first === "cf" ? "ollama" : "cf"];
}
async function askOllama(env: Env, imgs: string | string[], prompt: string): Promise<string> {
  const list = Array.isArray(imgs) ? imgs : [imgs], ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 25_000);
  try {
    const r = await fetch("https://ollama.com/api/chat", { method: "POST", signal: ctl.signal, headers: { authorization: `Bearer ${env.OLLAMA_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: env.OLLAMA_MODEL || "gemma4:31b", stream: false, messages: [{ role: "user", content: prompt, ...(list.length ? { images: list } : {}) }] }) });
    if (!r.ok) throw new Error(`ollama ${r.status} ${(await r.text()).slice(0, 120)}`);
    return String(((await r.json()) as any)?.message?.content ?? "");
  } finally { clearTimeout(to); }
}
async function askVia(env: Env, order: Prov[], imgs: string | string[], prompt: string): Promise<{ text: string; via: Prov }> {
  let last: any = null;
  for (const pv of order) { try { const text = pv === "cf" ? await askText(env, imgs, prompt) : await askOllama(env, imgs, prompt); if (text.trim()) return { text, via: pv }; } catch (e) { last = e; console.log("ai provider failed", pv, String(e).slice(0, 160)); } }
  throw last || new Error("no answer");
}
const askJ = async (env: Env, job: "STAGE1" | "STAGE2" | "FIND", camId: string, imgs: string | string[], prompt: string) => parse((await askVia(env, route(env, job, camId), imgs, prompt)).text);
const regPrompt = (z: any) => `Security camera frame. The cash register is inside the box x:${z.x}% y:${z.y}% w:${z.w}% h:${z.h}% of the image. Decide: "theft" = a person takes money out of the register or drawer into their hand or pocket; "blocked" = something or someone is covering or blocking the register area so it cannot be seen; "handoff" = an employee is handing goods or an item to a customer, or a customer is walking away holding goods; otherwise "none". Customers paying are "none" unless goods are being handed over. Reply ONLY JSON: {"event":"theft|blocked|handoff|none","confidence":0-1,"note":"short reason"}`;
const unpaidPrompt = (z: any, n: number) => `These ${n} frames are from one shop security camera, in time order (oldest first), spanning about a minute. The cash register is inside the box x:${z.x}% y:${z.y}% w:${z.w}% h:${z.h}% of the image. Decide whether a customer received goods or an item from an employee and did NOT pay: no cash handed to the employee or put on the counter, no card or phone tapped on a payment terminal, the register drawer never opened and no cash was added. If a customer clearly paid (cash or card), or no goods were handed over, or you cannot tell, answer "ok". Reply ONLY JSON: {"event":"unpaid|ok","confidence":0-1,"note":"short reason"}`;

// A "shift" is one 24-hour recording. Closing it stamps closed_at and starts a new one on the next picture.
async function closeShift(env: Env, sh: any) {
  const r = await env.DB.prepare("UPDATE shifts SET ended_at=?, closed_at=? WHERE id=? AND ended_at IS NULL").bind(sh.started_at + DAY, Date.now(), sh.id).run();
  if (r.meta.changes) await env.DB.prepare("UPDATE cameras SET shift_id=NULL WHERE id=? AND shift_id=?").bind(sh.camera_id, sh.id).run();
}
async function currentShift(env: Env, cam: any, now: number): Promise<string> {
  if (cam.shift_id) {
    const cur = await env.DB.prepare("SELECT * FROM shifts WHERE id=?").bind(cam.shift_id).first<any>();
    if (cur && now - cur.started_at < DAY) return cur.id;
    if (cur) await closeShift(env, cur);
  }
  const id = rand().slice(0, 12);
  await env.DB.prepare("INSERT INTO shifts(id,camera_id,started_at,frames) VALUES(?,?,?,0)").bind(id, cam.id, now).run();
  await env.DB.prepare("UPDATE cameras SET shift_id=? WHERE id=?").bind(id, cam.id).run();
  return id;
}

// ---- Login with Hik-Connect: the Worker checks the account with Hik-Connect itself, then issues its own signed token ----
const te = new TextEncoder();
const hexOf = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const md5hex = async (s: string) => hexOf(await crypto.subtle.digest("MD5", te.encode(s)));
const sha256hex = async (s: string) => hexOf(await crypto.subtle.digest("SHA-256", te.encode(s)));
async function hmac(key: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", te.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hexOf(await crypto.subtle.sign("HMAC", k, te.encode(msg)));
}
const HIK_HOSTS = [".hik-connect.com", ".hikvision.com", ".ezvizlife.com"];
async function hikLogin(email: string, password: string): Promise<number> { // returns Hik-Connect's own result code (200 = ok)
  let base = "https://api.hik-connect.com"; const fc = rand().slice(0, 32);
  for (let hop = 0; hop < 3; hop++) {
    const r = await fetch(`${base}/v3/users/login/v2`, { method: "POST", headers: { clientType: "55", clientVersion: "6.0.0.20250101", featureCode: fc, lang: "en-US", clientNo: "shadicam", clientName: "shadicam", osVersion: "Android", netType: "WIFI", "content-type": "application/x-www-form-urlencoded" },
      body: `account=${encodeURIComponent(email)}&password=${await md5hex(password)}&featureCode=${fc}` });
    const p: any = await r.json(); const c = p?.meta?.code, d = p?.loginArea?.apiDomain;
    if (c === 1100 && d && HIK_HOSTS.some(h => String(d).endsWith(h))) { base = `https://${d}`; continue; }
    return c;
  }
  return -1;
}
async function makeToken(env: Env, email: string) {
  const body = `${btoa(encodeURIComponent(email))}.${Date.now() + 90 * DAY}`;
  return `${body}.${await hmac(env.APP_KEY, body)}`;
}
async function tokenSigOk(env: Env, tok: string) {
  const [e, exp, sig] = tok.split(".");
  return !!sig && Number(exp) > Date.now() && sig === await hmac(env.APP_KEY, `${e}.${exp}`);
}
async function tokenOk(env: Env, tok: string) { // valid signature AND it belongs to the owner account
  if (!(await tokenSigOk(env, tok))) return false;
  const own = await env.DB.prepare("SELECT v FROM meta WHERE k='owner'").first<any>();
  return !!own && own.v === await sha256hex(decodeURIComponent(atob(tok.split(".")[0])));
}

async function ingest(req: Request, env: Env, ctx: ExecutionContext, id: string, token: string) {
  const cam = await env.DB.prepare("SELECT * FROM cameras WHERE id=?").bind(id).first<any>();
  if (!cam || cam.token !== token) return json({ error: "unauthorized" }, 401);
  let buf: ArrayBuffer;
  if ((req.headers.get("content-type") || "").includes("multipart")) {
    const f = [...(await req.formData()).values()].find(v => typeof v !== "string") as File | undefined;
    if (!f) return json({ error: "no image" }, 400); buf = await f.arrayBuffer();
  } else buf = await req.arrayBuffer();
  if (!isJpeg(new Uint8Array(buf)) || buf.byteLength > MAX_IMG) return json({ error: "not a jpeg, or larger than 1.4 MB (use the camera's smaller stream)" }, 400);
  const now = Date.now(), data = b64(buf);
  await env.DB.prepare("INSERT OR REPLACE INTO latest(camera_id,data,ts) VALUES(?,?,?)").bind(id, data, now).run();
  await env.DB.prepare("INSERT OR REPLACE INTO recent(camera_id,ts,data) VALUES(?,?,?)").bind(id, now, data).run();
  if (!cam.verified_at) await env.DB.prepare("UPDATE cameras SET verified_at=? WHERE id=?").bind(now, id).run();
  const sid = await currentShift(env, cam, now);
  if (now - (cam.last_frame || 0) >= FRAME_MS) {
    await env.DB.prepare("INSERT OR REPLACE INTO frames(shift_id,camera_id,ts,data) VALUES(?,?,?,?)").bind(sid, id, now, data).run();
    await env.DB.prepare("UPDATE cameras SET last_frame=? WHERE id=?").bind(now, id).run();
    await env.DB.prepare("UPDATE shifts SET frames=frames+1 WHERE id=?").bind(sid).run();
  }
  if (!cam.zone || now - cam.last_ai < 10_000) return json({ ok: true });
  await env.DB.prepare("UPDATE cameras SET last_ai=? WHERE id=?").bind(now, id).run();
  ctx.waitUntil(analyze(env, id, JSON.parse(cam.zone), data, now).catch(e => console.log("analyze error", String(e))));
  return json({ ok: true }); // the phone doesn't wait for the AI
}

async function analyze(env: Env, id: string, z: any, data: string, now: number) {
  const addAlert = async (kind: string, note: string, img: string) => { // one alert per kind per camera per 2 minutes
    const lk = `last:${id}:${kind}`, last = Number((await env.DB.prepare("SELECT v FROM meta WHERE k=?").bind(lk).first<any>())?.v || 0);
    if (now - last < 120_000) return;
    await env.DB.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)").bind(lk, String(now)).run();
    const aid = rand();
    await env.DB.prepare("INSERT INTO alerts(id,camera_id,kind,note,image_key,created_at) VALUES(?,?,?,?,?,?)").bind(aid, id, kind, note, "", now).run();
    await env.DB.prepare("INSERT INTO alert_images(alert_id,data) VALUES(?,?)").bind(aid, img).run();
  };
  // Stage 2: ~40 s after an item was handed over, look at the frames around it and ask whether it was paid for.
  const pk = `pend:${id}`; let pend = Number((await env.DB.prepare("SELECT v FROM meta WHERE k=?").bind(pk).first<any>())?.v || 0);
  if (pend && now - pend >= 40_000) {
    await env.DB.prepare("DELETE FROM meta WHERE k=?").bind(pk).run();
    const started = pend; pend = 0;
    try {
      const { results } = await env.DB.prepare("SELECT data FROM recent WHERE camera_id=? AND ts>=? ORDER BY ts").bind(id, started - 20_000).all<any>();
      const all = results.map(r => r.data as string), pick = all.length <= 6 ? all : Array.from({ length: 6 }, (_, i) => all[Math.round(i * (all.length - 1) / 5)]);
      if (pick.length >= 2) {
        const u = await askJ(env, "STAGE2", id, pick, unpaidPrompt(z, pick.length));
        if (u && u.event === "unpaid" && u.confidence >= 0.6) await addAlert("unpaid", u.note ?? "", pick[Math.floor(pick.length / 2)]);
      }
    } catch (e) { console.log("ai error (seq)", String(e)); }
  }
  // Stage 1: look at the newest frame.
  let v: any = null;
  try { v = await askJ(env, "STAGE1", id, data, regPrompt(z)); } catch (e) { console.log("ai error", String(e)); }
  if (v && (v.event === "theft" || v.event === "blocked") && v.confidence >= 0.6) await addAlert(v.event, v.note ?? "", data);
  else if (v && v.event === "handoff" && v.confidence >= 0.6 && !pend) await env.DB.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)").bind(pk, String(now)).run();
}


export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url), p = url.pathname.split("/").filter(Boolean);
    if (p[0] === "ingest" && req.method === "POST") return ingest(req, env, ctx, p[1], url.searchParams.get("token") ?? "");
    if (p[0] === "auth" && p[1] === "hik" && req.method === "POST") {
      const b = await req.json<any>().catch(() => ({})); const e = String(b.email || "").trim().toLowerCase(), pw = String(b.password || "");
      if (!e || !pw) return json({ error: "bad request" }, 400);
      const fk = `fails:${Math.floor(Date.now() / 3_600_000)}`;
      const f = Number((await env.DB.prepare("SELECT v FROM meta WHERE k=?").bind(fk).first<any>())?.v || 0);
      if (f >= 20) return json({ error: "too many attempts" }, 429);
      let code = -2; try { code = await hikLogin(e, pw); } catch {}
      if (code !== 200) {
        await env.DB.prepare("INSERT INTO meta(k,v) VALUES(?,'1') ON CONFLICT(k) DO UPDATE SET v=CAST(v AS INTEGER)+1").bind(fk).run();
        return json({ error: code === 1013 || code === 1014 ? "badlogin" : code === 1015 ? "captcha" : "hik" + code }, 401);
      }
      const h = await sha256hex(e), own = await env.DB.prepare("SELECT v FROM meta WHERE k='owner'").first<any>();
      if (!own) await env.DB.prepare("INSERT INTO meta(k,v) VALUES('owner',?)").bind(h).run();
      else if (own.v !== h) return json({ error: "not the owner" }, 403);
      return json({ token: await makeToken(env, e) });
    }
    const au = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
    if (au !== env.APP_KEY && !(await tokenOk(env, au))) return json({ error: "unauthorized" }, 401);
    if (p[0] !== "api") return json({ error: "not found" }, 404);
    if (p[1] === "selftest") { // checks MD5, token signing, and that this Worker can reach the real Hik-Connect
      let hik: any = null; try { hik = await hikLogin("nobody@example.invalid", "x"); } catch (e) { hik = "error:" + String(e).slice(0, 80); }
      const t = await makeToken(env, "a@b.c");
      let ollama = "off"; if (env.OLLAMA_API_KEY) { try { ollama = "ok:" + (await askOllama(env, [], "Reply with the single word OK.")).slice(0, 30); } catch (e) { ollama = "error: " + String(e).slice(0, 140); } }
      return json({ md5: (await md5hex("secret")) === "5ebe2294ecd0e0f08eab7690d2a6ee69", token: await tokenSigOk(env, t), hik, ollama });
    }

    if (p[1] === "analyze" && req.method === "POST") { // test helper: POST a JPEG, ?x&y&w&h = register box in %
      const buf = await req.arrayBuffer();
      if (!isJpeg(new Uint8Array(buf)) || buf.byteLength > MAX_IMG) return json({ error: "jpeg up to 1.4 MB" }, 400);
      const q = url.searchParams, z = { x: +(q.get("x") || 0), y: +(q.get("y") || 0), w: +(q.get("w") || 100), h: +(q.get("h") || 100) };
      try { const via = q.get("via") as Prov | null, out = await askVia(env, via ? [via] : route(env, "STAGE1", "test"), b64(buf), regPrompt(z)); return json({ raw: out.text, parsed: parse(out.text), via: out.via }); } catch (e) { return json({ error: String(e) }, 502); }
    }
    if (p[1] === "analyze-seq" && req.method === "POST") { // test helper: {images:[base64...], x,y,w,h}
      const b = await req.json<any>().catch(() => ({})); const imgs: string[] = (b.images || []).slice(0, 8);
      if (imgs.length < 2) return json({ error: "send 2-8 base64 images" }, 400);
      const z = { x: +(b.x || 0), y: +(b.y || 0), w: +(b.w || 100), h: +(b.h || 100) };
      try { const via = b.via as Prov | undefined, out = await askVia(env, via ? [via] : route(env, "STAGE2", "test"), imgs, unpaidPrompt(z, imgs.length)); return json({ raw: out.text, parsed: parse(out.text), via: out.via }); } catch (e) { return json({ error: String(e) }, 502); }
    }
    if (p[1] === "cameras" && !p[2]) {
      if (req.method === "POST") {
        const { store, name } = await req.json<any>(); const id = rand().slice(0, 12), token = rand();
        await env.DB.prepare("INSERT INTO cameras(id,store,name,token) VALUES(?,?,?,?)").bind(id, store, name, token).run();
        // Paste this link into the camera's HTTP upload / snapshot push settings.
        return json({ id, uploadUrl: `${url.origin}/ingest/${id}?token=${token}` });
      }
      const { results } = await env.DB.prepare("SELECT id,store,name,zone,verified_at FROM cameras ORDER BY store").all();
      return json(results.map((c: any) => ({ ...c, zone: c.zone ? JSON.parse(c.zone) : null, verified: !!c.verified_at })));
    }
    if (p[1] === "cameras" && p[2] && !p[3] && req.method === "DELETE") {
      for (const q of ["DELETE FROM alert_images WHERE alert_id IN (SELECT id FROM alerts WHERE camera_id=?)", "DELETE FROM alerts WHERE camera_id=?", "DELETE FROM frames WHERE camera_id=?", "DELETE FROM latest WHERE camera_id=?", "DELETE FROM recent WHERE camera_id=?", "DELETE FROM shifts WHERE camera_id=?", "DELETE FROM cameras WHERE id=?"])
        await env.DB.prepare(q).bind(p[2]).run();
      return json({ ok: true });
    }
    if (p[1] === "cameras" && p[3] === "zone" && req.method === "PUT") {
      const { zone } = await req.json<any>();
      await env.DB.prepare("UPDATE cameras SET zone=? WHERE id=?").bind(zone ? JSON.stringify(zone) : null, p[2]).run();
      return json({ ok: true });
    }
    if (p[1] === "cameras" && p[3] === "find-register" && req.method === "POST") {
      const o = await env.DB.prepare("SELECT data FROM latest WHERE camera_id=?").bind(p[2]).first<any>();
      if (!o) return json({ error: "no picture yet" }, 409);
      let v: any;
      try { v = await askJ(env, "FIND", p[2], o.data, `Find the cash register in this image. Reply ONLY JSON {"found":true|false,"x":0-100,"y":0-100,"w":0-100,"h":0-100} as percentages of image width/height.`); }
      catch (e) { return json({ error: "ai: " + String(e) }, 502); }
      return json(v?.found ? { zone: { x: v.x, y: v.y, w: v.w, h: v.h } } : { zone: null });
    }
    if (p[1] === "cameras" && p[3] === "latest") {
      const o = await env.DB.prepare("SELECT data FROM latest WHERE camera_id=?").bind(p[2]).first<any>();
      return o ? img(o.data) : json({ error: "no picture yet" }, 404);
    }
    if (p[1] === "cameras" && p[3] === "shifts") {
      return json((await env.DB.prepare("SELECT id,started_at,ended_at,frames FROM shifts WHERE camera_id=? ORDER BY started_at DESC LIMIT 60").bind(p[2]).all()).results);
    }
    if (p[1] === "shifts" && p[3] === "frames") {
      const { results } = await env.DB.prepare("SELECT ts FROM frames WHERE shift_id=? ORDER BY ts LIMIT 5000").bind(p[2]).all<any>();
      return json(results.map(r => r.ts));
    }
    if (p[1] === "shifts" && p[3] === "frame") {
      const o = await env.DB.prepare("SELECT data FROM frames WHERE shift_id=? AND ts=?").bind(p[2], Number(p[4])).first<any>();
      return o ? img(o.data) : json({ error: "not found" }, 404);
    }
    if (p[1] === "events") {
      const since = Number(url.searchParams.get("since") || 0);
      const a = await env.DB.prepare("SELECT a.id,a.note,a.kind,a.created_at ts,c.store,c.name FROM alerts a JOIN cameras c ON c.id=a.camera_id WHERE a.created_at>? ORDER BY ts LIMIT 50").bind(since).all<any>();
      return json(a.results.map(x => ({ id: x.id, type: x.kind, title: `${x.store}: ${x.name}`, body: x.note || "", ts: x.ts })));
    }
    if (p[1] === "alerts" && !p[2]) {
      const cam = url.searchParams.get("camera");
      const base = "SELECT id,camera_id,kind,note,created_at FROM alerts";
      const q = cam ? env.DB.prepare(base + " WHERE camera_id=? ORDER BY created_at DESC LIMIT 100").bind(cam) : env.DB.prepare(base + " ORDER BY created_at DESC LIMIT 100");
      return json((await q.all()).results);
    }
    if (p[1] === "alerts" && p[3] === "image") {
      const o = await env.DB.prepare("SELECT data FROM alert_images WHERE alert_id=?").bind(p[2]).first<any>();
      return o ? img(o.data) : json({ error: "not found" }, 404);
    }
    return json({ error: "not found" }, 404);
  },
  // Every 15 min: close 24-hour recordings that are done, and delete pictures older than 2 days.
  async scheduled(_e: ScheduledController, env: Env) {
    const { results } = await env.DB.prepare("SELECT * FROM shifts WHERE ended_at IS NULL AND started_at < ?").bind(Date.now() - DAY).all();
    for (const sh of results) await closeShift(env, sh);
    await env.DB.prepare("DELETE FROM frames WHERE ts < ?").bind(Date.now() - KEEP_FRAMES_MS).run();
    await env.DB.prepare("DELETE FROM recent WHERE ts < ?").bind(Date.now() - 600_000).run();
  },
};
