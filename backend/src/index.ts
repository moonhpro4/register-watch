export interface Env { DB: D1Database; AI: any; APP_KEY: string; AI_MODEL: string }
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });
const rand = () => [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, "0")).join("");
function b64(buf: ArrayBuffer) { let s = ""; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }
const img = (b: string) => new Response(Uint8Array.from(atob(b), c => c.charCodeAt(0)), { headers: { "content-type": "image/jpeg" } });
const isJpeg = (u: Uint8Array) => u.length > 3 && u[0] === 0xff && u[1] === 0xd8;
const DAY = 86_400_000, FRAME_MS = 30_000, KEEP_FRAMES_MS = 2 * DAY; // one saved picture per camera every 30 s, kept 2 days
const MAX_IMG = 1_400_000; // D1 rows are limited to 2 MB (base64 adds a third)

// Ask the vision model about a base64 JPEG. If the model's message format differs, only askText changes.
async function askText(env: Env, imgB64: string, prompt: string): Promise<string> {
  const r = await env.AI.run(env.AI_MODEL, { messages: [{ role: "user", content: [
    { type: "text", text: prompt }, { type: "image_url", image_url: { url: "data:image/jpeg;base64," + imgB64 } }] }] });
  return String(r?.response ?? r?.choices?.[0]?.message?.content ?? "");
}
const parse = (text: string) => { const m = text.match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } };
const ask = async (env: Env, imgB64: string, prompt: string) => parse(await askText(env, imgB64, prompt));
const regPrompt = (z: any) => `Security camera frame. The cash register is inside the box x:${z.x}% y:${z.y}% w:${z.w}% h:${z.h}% of the image. Decide: "theft" = a person takes money out of the register or drawer into their hand or pocket; "blocked" = something or someone is covering or blocking the register area so it cannot be seen; otherwise "none". Normal sales and customers paying are "none". Reply ONLY JSON: {"event":"theft|blocked|none","confidence":0-1,"note":"short reason"}`;

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

async function ingest(req: Request, env: Env, id: string, token: string) {
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
  if (!cam.verified_at) await env.DB.prepare("UPDATE cameras SET verified_at=? WHERE id=?").bind(now, id).run();
  const sid = await currentShift(env, cam, now);
  if (now - (cam.last_frame || 0) >= FRAME_MS) {
    await env.DB.prepare("INSERT OR REPLACE INTO frames(shift_id,camera_id,ts,data) VALUES(?,?,?,?)").bind(sid, id, now, data).run();
    await env.DB.prepare("UPDATE cameras SET last_frame=? WHERE id=?").bind(now, id).run();
    await env.DB.prepare("UPDATE shifts SET frames=frames+1 WHERE id=?").bind(sid).run();
  }
  if (!cam.zone || now - cam.last_ai < 10_000) return json({ ok: true });
  await env.DB.prepare("UPDATE cameras SET last_ai=? WHERE id=?").bind(now, id).run();
  const z = JSON.parse(cam.zone);
  let v: any = null;
  try {
    v = await ask(env, data, regPrompt(z));
  } catch (e) { console.log("ai error", String(e)); }
  if (v && (v.event === "theft" || v.event === "blocked") && v.confidence >= 0.6) {
    const aid = rand();
    await env.DB.prepare("INSERT INTO alerts(id,camera_id,kind,note,image_key,created_at) VALUES(?,?,?,?,?,?)").bind(aid, id, v.event, v.note ?? "", "", now).run();
    await env.DB.prepare("INSERT INTO alert_images(alert_id,data) VALUES(?,?)").bind(aid, data).run();
  }
  return json({ ok: true });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url), p = url.pathname.split("/").filter(Boolean);
    if (p[0] === "ingest" && req.method === "POST") return ingest(req, env, p[1], url.searchParams.get("token") ?? "");
    if (req.headers.get("authorization") !== `Bearer ${env.APP_KEY}`) return json({ error: "unauthorized" }, 401);
    if (p[0] !== "api") return json({ error: "not found" }, 404);

    if (p[1] === "analyze" && req.method === "POST") { // test helper: POST a JPEG, ?x&y&w&h = register box in %
      const buf = await req.arrayBuffer();
      if (!isJpeg(new Uint8Array(buf)) || buf.byteLength > MAX_IMG) return json({ error: "jpeg up to 1.4 MB" }, 400);
      const q = url.searchParams, z = { x: +(q.get("x") || 0), y: +(q.get("y") || 0), w: +(q.get("w") || 100), h: +(q.get("h") || 100) };
      try { const raw = await askText(env, b64(buf), regPrompt(z)); return json({ raw, parsed: parse(raw) }); } catch (e) { return json({ error: String(e) }, 502); }
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
      for (const q of ["DELETE FROM alert_images WHERE alert_id IN (SELECT id FROM alerts WHERE camera_id=?)", "DELETE FROM alerts WHERE camera_id=?", "DELETE FROM frames WHERE camera_id=?", "DELETE FROM latest WHERE camera_id=?", "DELETE FROM shifts WHERE camera_id=?", "DELETE FROM cameras WHERE id=?"])
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
      try { v = await ask(env, o.data, `Find the cash register in this image. Reply ONLY JSON {"found":true|false,"x":0-100,"y":0-100,"w":0-100,"h":0-100} as percentages of image width/height.`); }
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
  },
};
