export interface Env { DB: D1Database; BUCKET: R2Bucket; AI: any; APP_KEY: string; AI_MODEL: string }
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });
const rand = () => [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, "0")).join("");
function b64(buf: ArrayBuffer) { let s = ""; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }
const isJpeg = (u: Uint8Array) => u.length > 3 && u[0] === 0xff && u[1] === 0xd8;

// Ask the vision model. If the model's message format differs, only this function changes.
async function ask(env: Env, img: ArrayBuffer, prompt: string) {
  const r = await env.AI.run(env.AI_MODEL, { messages: [{ role: "user", content: [
    { type: "text", text: prompt }, { type: "image_url", image_url: { url: "data:image/jpeg;base64," + b64(img) } }] }] });
  const text = r?.response ?? r?.choices?.[0]?.message?.content ?? "";
  const m = String(text).match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
}

async function push(env: Env, title: string, body: string, data: object) {
  const { results } = await env.DB.prepare("SELECT token FROM devices").all<{ token: string }>();
  if (!results.length) return;
  await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(results.map(d => ({ to: d.token, title, body, data, sound: "default", priority: "high" }))) });
}

async function ingest(req: Request, env: Env, id: string, token: string) {
  const cam = await env.DB.prepare("SELECT * FROM cameras WHERE id=?").bind(id).first<any>();
  if (!cam || cam.token !== token) return json({ error: "unauthorized" }, 401);
  let buf: ArrayBuffer;
  if ((req.headers.get("content-type") || "").includes("multipart")) {
    const f = [...(await req.formData()).values()].find(v => typeof v !== "string") as File | undefined;
    if (!f) return json({ error: "no image" }, 400); buf = await f.arrayBuffer();
  } else buf = await req.arrayBuffer();
  if (!isJpeg(new Uint8Array(buf)) || buf.byteLength > 5_000_000) return json({ error: "not a jpeg" }, 400);
  const now = Date.now();
  await env.BUCKET.put(`latest/${id}.jpg`, buf);
  if (!cam.verified_at) await env.DB.prepare("UPDATE cameras SET verified_at=? WHERE id=?").bind(now, id).run();
  if (!cam.zone || now - cam.last_ai < 10_000) return json({ ok: true });
  await env.DB.prepare("UPDATE cameras SET last_ai=? WHERE id=?").bind(now, id).run();
  const z = JSON.parse(cam.zone);
  const v = await ask(env, buf, `Security camera frame. The cash register is inside the box x:${z.x}% y:${z.y}% w:${z.w}% h:${z.h}% of the image. Reply ONLY JSON: {"event":"none|drawer_open|hand_in_drawer|item_taken|covered","confidence":0-1,"note":"short"}`);
  if (v && v.event !== "none" && v.confidence >= 0.6) {
    const aid = rand(), key = `alerts/${aid}.jpg`;
    await env.BUCKET.put(key, buf);
    await env.DB.prepare("INSERT INTO alerts VALUES(?,?,?,?,?,?)").bind(aid, id, v.event, v.note ?? "", key, now).run();
    await push(env, `${cam.store}: ${cam.name}`, v.note || v.event, { alertId: aid, cameraId: id });
  }
  return json({ ok: true });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url), p = url.pathname.split("/").filter(Boolean);
    if (p[0] === "ingest" && req.method === "POST") return ingest(req, env, p[1], url.searchParams.get("token") ?? "");
    if (req.headers.get("authorization") !== `Bearer ${env.APP_KEY}`) return json({ error: "unauthorized" }, 401);
    if (p[0] !== "api") return json({ error: "not found" }, 404);

    if (p[1] === "cameras" && !p[2]) {
      if (req.method === "POST") {
        const { store, name } = await req.json<any>(); const id = rand().slice(0, 12), token = rand();
        await env.DB.prepare("INSERT INTO cameras(id,store,name,token) VALUES(?,?,?,?)").bind(id, store, name, token).run();
        // Put this link in the camera's HTTP upload / "snapshot push" settings (or encode it in a QR code).
        return json({ id, uploadUrl: `${url.origin}/ingest/${id}?token=${token}` });
      }
      const { results } = await env.DB.prepare("SELECT id,store,name,zone,verified_at FROM cameras ORDER BY store").all();
      return json(results.map((c: any) => ({ ...c, zone: c.zone ? JSON.parse(c.zone) : null, verified: !!c.verified_at })));
    }
    if (p[1] === "cameras" && p[3] === "zone" && req.method === "PUT") {
      const { zone } = await req.json<any>();
      await env.DB.prepare("UPDATE cameras SET zone=? WHERE id=?").bind(zone ? JSON.stringify(zone) : null, p[2]).run();
      return json({ ok: true });
    }
    if (p[1] === "cameras" && p[3] === "find-register" && req.method === "POST") {
      const o = await env.BUCKET.get(`latest/${p[2]}.jpg`);
      if (!o) return json({ error: "no picture yet" }, 409);
      const v = await ask(env, await o.arrayBuffer(), `Find the cash register in this image. Reply ONLY JSON {"found":true|false,"x":0-100,"y":0-100,"w":0-100,"h":0-100} as percentages of image width/height.`);
      return json(v?.found ? { zone: { x: v.x, y: v.y, w: v.w, h: v.h } } : { zone: null });
    }
    if (p[1] === "cameras" && p[3] === "latest") {
      const o = await env.BUCKET.get(`latest/${p[2]}.jpg`);
      return o ? new Response(o.body, { headers: { "content-type": "image/jpeg" } }) : json({ error: "no picture yet" }, 404);
    }
    if (p[1] === "devices" && req.method === "POST") {
      const { token } = await req.json<any>(); await env.DB.prepare("INSERT OR IGNORE INTO devices VALUES(?)").bind(token).run(); return json({ ok: true });
    }
    if (p[1] === "alerts" && !p[2]) {
      const cam = url.searchParams.get("camera");
      const q = cam ? env.DB.prepare("SELECT * FROM alerts WHERE camera_id=? ORDER BY created_at DESC LIMIT 100").bind(cam) : env.DB.prepare("SELECT * FROM alerts ORDER BY created_at DESC LIMIT 100");
      return json((await q.all()).results);
    }
    if (p[1] === "alerts" && p[3] === "image") {
      const o = await env.BUCKET.get(`alerts/${p[2]}.jpg`);
      return o ? new Response(o.body, { headers: { "content-type": "image/jpeg" } }) : json({ error: "not found" }, 404);
    }
    return json({ error: "not found" }, 404);
  },
};
