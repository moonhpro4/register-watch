import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Image, PanResponder, StyleSheet, SafeAreaView, Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import { getLocales } from "expo-localization";
import * as Notifications from "expo-notifications";
import BackgroundService from "react-native-background-actions";
import * as FileSystem from "expo-file-system";
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }) });

const ar = getLocales()[0]?.languageCode === "ar";
const D = {
  en: { title: "Your stores", none: "No cameras yet", noneSub: "Add a camera from any brand. It works with any camera that can send pictures.", add: "Add camera", store: "Store name", cname: "Camera name", create: "Create", cancel: "Cancel", server: "Server address", key: "App key", save: "Save", live: "Live", thefts: "Past thefts", waiting: "Waiting for the first picture from the camera…", url: "Paste this link into the camera’s HTTP upload (snapshot push) setting:", verified: "Verified: camera is sending pictures", unverified: "Not verified yet", find: "Find register with AI", mark: "Mark it myself", remove: "No register on this camera", saveArea: "Save area", drag: "Drag over the register. The AI watches only this spot.", nothing: "No theft alerts.", noreg: "No register area set. This camera only records; alerts are off.", shifts: "24-hour recordings", recording: "Recording now", savedv: "Saved", play: "Play", pause: "Pause", back5: "−5 min", fwd5: "+5 min", frames: "pictures", noshifts: "No recordings yet. They start when the camera sends its first picture.", n24: "24 hours saved. Starting a new recording.", theft: "Possible theft at the register", svc: "Watching your cameras", camAddr: "Camera address (optional)", bad: "That address isn’t valid. Use http://… or rtsp://…", down: "Can’t reach this address. It may be fake or wrong, or you may be away from the store’s Wi‑Fi.", downBtn: "Add anyway", blocked: "Someone is blocking the register", app: "Shadi Cam", pickT: "Where should recordings be saved?", pickD: "Choose a folder on your phone (for example Documents). The app creates a folder called “Shadi Cam” inside it and saves every recording and theft picture there. Nothing is deleted from your phone.", pickB: "Choose folder", skip: "Skip", back: "Back", noimg: "No picture yet. Check that the camera sends pictures.", fail: "Could not reach the server. Check the address and key." },
  ar: { title: "متاجرك", none: "لا توجد كاميرات بعد", noneSub: "أضف كاميرا من أي علامة تجارية. تعمل مع أي كاميرا تستطيع إرسال الصور.", add: "إضافة كاميرا", store: "اسم المتجر", cname: "اسم الكاميرا", create: "إنشاء", cancel: "إلغاء", server: "عنوان الخادم", key: "مفتاح التطبيق", save: "حفظ", live: "مباشر", thefts: "السرقات السابقة", waiting: "في انتظار أول صورة من الكاميرا…", url: "الصق هذا الرابط في إعدادات رفع الصور (HTTP) في الكاميرا:", verified: "تم التحقق: الكاميرا ترسل الصور", unverified: "لم يتم التحقق بعد", find: "البحث عن الصندوق بالذكاء الاصطناعي", mark: "تحديده بنفسي", remove: "لا يوجد صندوق في هذه الكاميرا", saveArea: "حفظ المنطقة", drag: "اسحب فوق الصندوق. يراقب الذكاء الاصطناعي هذا المكان فقط.", nothing: "لا توجد تنبيهات سرقة.", noreg: "لا توجد منطقة صندوق. هذه الكاميرا تسجّل فقط وبدون تنبيهات.", shifts: "تسجيلات 24 ساعة", recording: "جارٍ التسجيل", savedv: "تم الحفظ", play: "تشغيل", pause: "إيقاف", back5: "−5 د", fwd5: "+5 د", frames: "صورة", noshifts: "لا توجد تسجيلات بعد. تبدأ عند وصول أول صورة من الكاميرا.", n24: "تم حفظ 24 ساعة. بدء تسجيل جديد.", theft: "احتمال سرقة عند الصندوق", svc: "مراقبة الكاميرات", camAddr: "عنوان الكاميرا (اختياري)", bad: "العنوان غير صالح. استخدم http://… أو rtsp://…", down: "تعذّر الوصول إلى هذا العنوان. قد يكون مزيفًا أو خاطئًا، أو أنك بعيد عن شبكة المتجر.", downBtn: "إضافة على أي حال", blocked: "شخص يحجب الصندوق", app: "كمرت شادي", pickT: "أين تريد حفظ التسجيلات؟", pickD: "اختر مجلدًا على هاتفك (مثل Documents). سينشئ التطبيق بداخله مجلدًا باسم «Shadi Cam» ويحفظ فيه كل تسجيل وكل صورة سرقة. لا يتم حذف أي شيء من هاتفك.", pickB: "اختيار المجلد", skip: "تخطي", back: "رجوع", noimg: "لا توجد صورة بعد. تأكد أن الكاميرا ترسل الصور.", fail: "تعذّر الوصول إلى الخادم. تحقق من العنوان والمفتاح." },
};
const t = (k) => D[ar ? "ar" : "en"][k];
const Btn = ({ children, onPress, ghost }) => (
  <Pressable onPress={onPress} style={[s.btn, ghost && s.ghost]}><Text style={[s.bt, ghost && { color: "#17212b" }]}>{children}</Text></Pressable>
);

export default function App() {
  const [cfg, setCfg] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [cams, setCams] = useState([]);
  const [scr, setScr] = useState({ n: "home" });
  const [f, setF] = useState({});
  const [root, setRoot] = useState("");

  useEffect(() => { (async () => {
    const b = await SecureStore.getItemAsync("base"), k = await SecureStore.getItemAsync("key");
    if (b && k) setCfg({ base: b, key: k }); setRoot((await SecureStore.getItemAsync("root")) || ""); setLoaded(true);
  })(); }, []);

  const api = useCallback(async (path, opt = {}) => {
    const r = await fetch(cfg.base.replace(/\/$/, "") + path, { ...opt, headers: { authorization: "Bearer " + cfg.key, "content-type": "application/json" } });
    return r.json();
  }, [cfg]);
  const load = useCallback(async () => { try { setCams(await api("/api/cameras")); } catch { Alert.alert(t("fail")); } }, [api]);
  useEffect(() => { if (cfg && root) { load(); startWatcher(cfg, root); } else if (cfg) load(); }, [cfg, root]);

  if (!loaded) return null;
  if (!cfg) return (
    <SafeAreaView style={s.app}><Text style={s.h1}>{t("app")}</Text><DevBanner />
      <Text>{t("server")}</Text><TextInput style={s.in} autoCapitalize="none" value={f.base} onChangeText={(v) => setF({ ...f, base: v })} placeholder="https://….workers.dev" />
      <Text>{t("key")}</Text><TextInput style={s.in} autoCapitalize="none" secureTextEntry value={f.key} onChangeText={(v) => setF({ ...f, key: v })} />
      <Btn onPress={async () => { await SecureStore.setItemAsync("base", f.base.trim()); await SecureStore.setItemAsync("key", f.key.trim()); setCfg({ base: f.base.trim(), key: f.key.trim() }); }}>{t("save")}</Btn>
    </SafeAreaView>);

  if (root === "") return <PickFolder done={setRoot} />;
  if (scr.n === "add") return <AddCam api={api} done={(c) => { load(); setScr({ n: "created", c }); }} back={() => setScr({ n: "home" })} />;
  if (scr.n === "created") return <Created api={api} c={scr.c} back={() => { load(); setScr({ n: "home" }); }} />;
  if (scr.n === "cam") return <Cam api={api} cfg={cfg} cam={cams.find((c) => c.id === scr.id)} reload={load} back={() => setScr({ n: "home" })} />;

  const stores = [...new Set(cams.map((c) => c.store))];
  return (
    <SafeAreaView style={s.app}><ScrollView>
      <Text style={s.h1}>{t("title")}</Text><DevBanner />
      {!cams.length ? (
        <View style={{ alignItems: "center", padding: 40 }}><Text style={{ fontSize: 56 }}>📹</Text><Text style={s.h2}>{t("none")}</Text><Text style={s.mute}>{t("noneSub")}</Text><Btn onPress={() => setScr({ n: "add" })}>+ {t("add")}</Btn></View>
      ) : (<>
        {stores.map((st) => (<View key={st}><Text style={s.h2}>{st}</Text>
          {cams.filter((c) => c.store === st).map((c) => (
            <Pressable key={c.id} style={s.card} onPress={() => setScr({ n: "cam", id: c.id })}>
              <Text style={{ fontWeight: "700" }}>{c.name}</Text><Text style={s.mute}>{c.verified ? "● " + t("verified") : "○ " + t("unverified")}</Text></Pressable>))}</View>))}
        <Btn ghost onPress={() => setScr({ n: "add" })}>+ {t("add")}</Btn></>)}
    </ScrollView></SafeAreaView>);
}

// Pings the address the owner typed. Any HTTP answer (even 401) means something real is there.
async function pingAddress(addr) {
  const m = addr.trim().match(/^(https?|rtsp):\/\/(?:[^@\/]*@)?([^\/:?#]+)(?::(\d+))?/i);
  if (!m) return "bad";
  const sc = m[1].toLowerCase(), url = sc === "rtsp" ? `http://${m[2]}` : `${sc}://${m[2]}${m[3] ? ":" + m[3] : ""}`;
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 6000);
  try { await fetch(url, { signal: ctl.signal }); return "ok"; } catch { return "down"; } finally { clearTimeout(to); }
}
function AddCam({ api, done, back }) {
  const [st, setSt] = useState(""), [nm, setNm] = useState(""), [ad, setAd] = useState(""), [busy, setBusy] = useState(false);
  const create = async () => { const r = await api("/api/cameras", { method: "POST", body: JSON.stringify({ store: st.trim() || "—", name: nm.trim() }) }); done({ id: r.id, uploadUrl: r.uploadUrl }); };
  const submit = async () => {
    if (!nm.trim()) return;
    if (ad.trim()) {
      setBusy(true); const res = await pingAddress(ad); setBusy(false);
      if (res === "bad") return Alert.alert(t("bad"));
      if (res === "down") return Alert.alert(t("down"), "", [{ text: t("cancel"), style: "cancel" }, { text: t("downBtn"), onPress: create }]);
    }
    create();
  };
  return (<SafeAreaView style={s.app}>
    <Text>{t("store")}</Text><TextInput style={s.in} value={st} onChangeText={setSt} />
    <Text>{t("cname")}</Text><TextInput style={s.in} value={nm} onChangeText={setNm} />
    <Text>{t("camAddr")}</Text><TextInput style={s.in} autoCapitalize="none" value={ad} onChangeText={setAd} placeholder="rtsp://192.168.1.20/…" />
    <Btn onPress={submit}>{busy ? "…" : t("create")}</Btn>
    <Btn ghost onPress={back}>{t("cancel")}</Btn></SafeAreaView>);
}

// Shows the private upload link, then polls until the camera really sends a picture.
function Created({ api, c, back }) {
  const [ok, setOk] = useState(false);
  useEffect(() => { const i = setInterval(async () => { const l = await api("/api/cameras"); if (l.find((x) => x.id === c.id)?.verified) { setOk(true); clearInterval(i); } }, 4000); return () => clearInterval(i); }, []);
  return (<SafeAreaView style={s.app}><Text style={s.h2}>{t("url")}</Text>
    <Text selectable style={[s.card, { writingDirection: "ltr", textAlign: "left" }]}>{c.uploadUrl}</Text>
    <Text style={{ marginVertical: 12 }}>{ok ? "✅ " + t("verified") : "⏳ " + t("waiting")}</Text>
    <Btn onPress={back}>{t("back")}</Btn></SafeAreaView>);
}

function Cam({ api, cfg, cam, reload, back }) {
  const [tab, setTab] = useState("live"), [edit, setEdit] = useState(false), [tmp, setTmp] = useState(null), [alerts, setAlerts] = useState([]);
  const size = useRef({ w: 1, h: 1 }), st = useRef(null);
  const hdr = { Authorization: "Bearer " + cfg.key };
  useEffect(() => { api("/api/alerts?camera=" + cam.id).then(setAlerts).catch(() => {}); }, []);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => { st.current = { x: e.nativeEvent.locationX / size.current.w * 100, y: e.nativeEvent.locationY / size.current.h * 100 }; },
    onPanResponderMove: (e, g) => {
      const cx = Math.min(100, Math.max(0, st.current.x + g.dx / size.current.w * 100)), cy = Math.min(100, Math.max(0, st.current.y + g.dy / size.current.h * 100));
      setTmp({ x: Math.min(st.current.x, cx), y: Math.min(st.current.y, cy), w: Math.abs(cx - st.current.x), h: Math.abs(cy - st.current.y) });
    } })).current;
  const z = edit ? tmp || cam.zone : cam.zone;
  const putZone = async (zone) => { await api(`/api/cameras/${cam.id}/zone`, { method: "PUT", body: JSON.stringify({ zone }) }); setEdit(false); setTmp(null); reload(); };
  const find = async () => { const r = await api(`/api/cameras/${cam.id}/find-register`, { method: "POST" }); if (r.zone) { setTmp(r.zone); setEdit(true); } else Alert.alert(t("noimg")); };
  return (<SafeAreaView style={s.app}><ScrollView>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Pressable onPress={back}><Text style={{ fontSize: 18 }}>{t("back")}</Text></Pressable><Text style={s.h2}>{cam.name}</Text></View>
    <View style={{ flexDirection: "row", gap: 8, marginVertical: 8 }}>
      {["live", "shifts", "thefts"].map((k) => <Pressable key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && s.tabOn]}><Text>{t(k)}</Text></Pressable>)}</View>
    {tab === "live" && (<>
      <View style={s.scene} onLayout={(e) => (size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} {...(edit ? pan.panHandlers : {})}>
        <Image source={{ uri: `${cfg.base.replace(/\/$/, "")}/api/cameras/${cam.id}/latest?t=${Date.now()}`, headers: hdr }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        {z && <View pointerEvents="none" style={[s.zone, { left: z.x + "%", top: z.y + "%", width: z.w + "%", height: z.h + "%" }]} />}</View>
      {edit ? (<><Text style={s.mute}>{t("drag")}</Text><Btn onPress={() => tmp && putZone(tmp)}>{t("saveArea")}</Btn><Btn ghost onPress={() => { setEdit(false); setTmp(null); }}>{t("cancel")}</Btn></>) : (<>
        {!cam.zone && <Text style={s.mute}>{t("noreg")}</Text>}
        <Btn onPress={find}>{t("find")}</Btn><Btn ghost onPress={() => setEdit(true)}>{t("mark")}</Btn>{cam.zone && <Btn ghost onPress={() => putZone(null)}>{t("remove")}</Btn>}</>)}</>)}
    {tab === "shifts" && <Shifts api={api} cfg={cfg} cam={cam} />}
    {tab === "thefts" && (alerts.length ? alerts.map((a) => (
      <View key={a.id} style={s.card}><Image source={{ uri: `${cfg.base.replace(/\/$/, "")}/api/alerts/${a.id}/image`, headers: hdr }} style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 8 }} />
        <Text style={{ fontWeight: "700", marginTop: 6 }}>{a.note || a.kind}</Text><Text style={s.mute}>{new Date(a.created_at).toLocaleString(ar ? "ar" : "en")}</Text></View>)) : <Text style={s.mute}>{t("nothing")}</Text>)}
  </ScrollView></SafeAreaView>);
}

function Shifts({ api, cfg, cam }) {
  const [list, setList] = useState([]), [sel, setSel] = useState(null);
  useEffect(() => { api(`/api/cameras/${cam.id}/shifts`).then(setList).catch(() => {}); }, []);
  if (sel) return <Player api={api} cfg={cfg} shift={sel} back={() => setSel(null)} />;
  if (!list.length) return <Text style={s.mute}>{t("noshifts")}</Text>;
  return list.map((x) => (
    <View key={x.id} style={s.card}>
      <Text style={{ fontWeight: "700" }}>{new Date(x.started_at).toLocaleString(ar ? "ar" : "en")}</Text>
      <Text style={s.mute}>{x.ended_at ? "✅ " + t("savedv") : "● " + t("recording")} · {x.frames} {t("frames")}</Text>
      <Btn ghost onPress={() => setSel(x)}>{t("play")}</Btn></View>));
}

// Plays the shift's saved pictures like a fast time-lapse (5 pictures per second).
function Player({ api, cfg, shift, back }) {
  const [ts, setTs] = useState([]), [i, setI] = useState(0), [on, setOn] = useState(false);
  useEffect(() => { api(`/api/shifts/${shift.id}/frames`).then(setTs).catch(() => {}); }, []);
  useEffect(() => { if (!on) return; const h = setInterval(() => setI((v) => Math.min(v + 1, ts.length - 1)), 200); return () => clearInterval(h); }, [on, ts.length]);
  const cur = ts[i];
  return (<View>
    <View style={s.scene}>{cur && <Image source={{ uri: `${cfg.base.replace(/\/$/, "")}/api/shifts/${shift.id}/frame/${cur}`, headers: { Authorization: "Bearer " + cfg.key } }} style={StyleSheet.absoluteFill} resizeMode="cover" />}</View>
    <Text style={s.mute}>{cur ? new Date(cur).toLocaleString(ar ? "ar" : "en") : ""}</Text>
    <View style={{ flexDirection: "row", gap: 8 }}>
      <View style={{ flex: 1 }}><Btn ghost onPress={() => setI((v) => Math.max(0, v - 30))}>{t("back5")}</Btn></View>
      <View style={{ flex: 1 }}><Btn onPress={() => setOn(!on)}>{on ? t("pause") : t("play")}</Btn></View>
      <View style={{ flex: 1 }}><Btn ghost onPress={() => setI((v) => Math.min(ts.length - 1, v + 30))}>{t("fwd5")}</Btn></View></View>
    <Btn ghost onPress={back}>{t("back")}</Btn></View>);
}

function DevBanner() {
  return (<View style={s.dev}>
    <Text style={{ fontWeight: "700" }}>This app is still in development and may not work correctly.</Text>
    <Text style={{ fontWeight: "700", writingDirection: "rtl", textAlign: "right", marginTop: 4 }}>هذا التطبيق ما زال قيد التطوير وقد لا يعمل بشكل صحيح.</Text></View>);
}
function PickFolder({ done }) {
  const choose = async () => {
    try {
      const SAF = FileSystem.StorageAccessFramework;
      const p = await SAF.requestDirectoryPermissionsAsync();
      if (!p.granted) return;
      const last = decodeURIComponent(p.directoryUri).split(/[\/:]/).filter(Boolean).pop();
      const dir = last === "Shadi Cam" ? p.directoryUri : await SAF.makeDirectoryAsync(p.directoryUri, "Shadi Cam");
      await SecureStore.setItemAsync("root", dir); done(dir);
    } catch { Alert.alert(t("fail")); }
  };
  return (<SafeAreaView style={s.app}><Text style={s.h1}>{t("app")}</Text><DevBanner /><Text style={s.h2}>{t("pickT")}</Text><Text style={s.mute}>{t("pickD")}</Text>
    <Btn onPress={choose}>{t("pickB")}</Btn>
    <Btn ghost onPress={async () => { await SecureStore.setItemAsync("root", "skip"); done("skip"); }}>{t("skip")}</Btn></SafeAreaView>);
}

// ---- Saving to the phone: <chosen folder>/Shadi Cam/<store - camera>/<date time of recording>/<time>.jpg ----
const SAF = FileSystem.StorageAccessFramework;
const pad = (n) => String(n).padStart(2, "0");
const day = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const hms = (ms) => { const d = new Date(ms); return [d.getHours(), d.getMinutes(), d.getSeconds()].map(pad).join("-"); };
const safe = (x) => String(x).replace(/[\/\\:*?"<>|]/g, "_");
const STATE = FileSystem.documentDirectory + "sync.json";
async function loadState() { try { return JSON.parse(await FileSystem.readAsStringAsync(STATE)); } catch { return { dirs: {}, last: {} }; } }
async function saveState(st) { await FileSystem.writeAsStringAsync(STATE, JSON.stringify(st)); }
async function dirIn(st, parent, name, key) { if (!st.dirs[key]) st.dirs[key] = await SAF.makeDirectoryAsync(parent, name); return st.dirs[key]; }
async function saveJpeg(base, key, path, dir, name) {
  const tmp = FileSystem.cacheDirectory + "dl.jpg";
  const r = await FileSystem.downloadAsync(base + path, tmp, { headers: { authorization: "Bearer " + key } });
  if (r.status !== 200) return false;
  const b = await FileSystem.readAsStringAsync(tmp, { encoding: FileSystem.EncodingType.Base64 });
  const f = await SAF.createFileAsync(dir, name, "image/jpeg");
  await FileSystem.writeAsStringAsync(f, b, { encoding: FileSystem.EncodingType.Base64 });
  return true;
}
async function saveAlert(base, key, root, e) {
  const st = await loadState();
  const dir = await dirIn(st, root, "Thefts", "thefts");
  await saveJpeg(base, key, `/api/alerts/${e.id}/image`, dir, `${day(e.ts)} ${hms(e.ts)} ${e.type}`);
  await saveState(st);
}
async function syncToDevice(base, key, root) {
  const get = async (p) => (await fetch(base + p, { headers: { authorization: "Bearer " + key } })).json();
  const st = await loadState(); let budget = 40;
  for (const cam of await get("/api/cameras")) {
    const cdir = await dirIn(st, root, safe(`${cam.store} - ${cam.name}`), "c" + cam.id);
    for (const sh of (await get(`/api/cameras/${cam.id}/shifts`)).slice(0, 3).reverse()) {
      const frames = (await get(`/api/shifts/${sh.id}/frames`)).filter((x) => x > (st.last[sh.id] || 0));
      if (!frames.length) continue;
      const sdir = await dirIn(st, cdir, `${day(sh.started_at)} ${hms(sh.started_at).slice(0, 5)}`, "s" + sh.id);
      for (const ts of frames) {
        if (budget-- <= 0) { await saveState(st); return; }
        if (!(await saveJpeg(base, key, `/api/shifts/${sh.id}/frame/${ts}`, sdir, hms(ts)))) break;
        st.last[sh.id] = ts; await saveState(st);
      }
    }
  }
  await saveState(st);
}

// Android foreground service: alerts, plus copying every recording to the phone, one step at a time.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function watchTask({ base, key, root }) {
  base = base.replace(/\/$/, ""); let since = Date.now(), lastSync = 0; const saving = root && root !== "skip";
  while (BackgroundService.isRunning()) {
    try {
      const r = await fetch(base + "/api/events?since=" + since, { headers: { authorization: "Bearer " + key } });
      for (const e of await r.json()) {
        since = Math.max(since, e.ts);
        await Notifications.scheduleNotificationAsync({ content: { title: e.title, body: e.body || (e.type === "blocked" ? t("blocked") : t("theft")) }, trigger: { channelId: "alerts" } });
        if (saving) { try { await saveAlert(base, key, root, e); } catch {} }
      }
    } catch {}
    if (saving && Date.now() - lastSync > 60000) { lastSync = Date.now(); try { await syncToDevice(base, key, root); } catch {} }
    await sleep(10000);
  }
}
async function startWatcher(cfg, root) {
  try {
    await Notifications.requestPermissionsAsync();
    await Notifications.setNotificationChannelAsync("alerts", { name: "Alerts", importance: Notifications.AndroidImportance.MAX });
    if (BackgroundService.isRunning()) return;
    await BackgroundService.start(watchTask, { taskName: "ShadiCam", taskTitle: t("app"), taskDesc: t("svc"), taskIcon: { name: "ic_launcher", type: "mipmap" }, parameters: { base: cfg.base, key: cfg.key, root } });
  } catch {}
}
const s = StyleSheet.create({
  dev: { backgroundColor: "#fff3cd", borderRadius: 10, padding: 10, marginVertical: 8, borderWidth: 1, borderColor: "#e0c36a" },
  app: { flex: 1, padding: 16, paddingTop: 48, backgroundColor: "#e9eef2" }, h1: { fontSize: 26, fontWeight: "700", marginBottom: 8 }, h2: { fontSize: 18, fontWeight: "700", marginVertical: 8 },
  mute: { color: "#5d6b78", marginVertical: 6 }, card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#cfd8df" },
  btn: { backgroundColor: "#17212b", borderRadius: 10, padding: 13, marginTop: 8, alignItems: "center" }, ghost: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#cfd8df" }, bt: { color: "#fff", fontWeight: "700" },
  in: { backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#cfd8df", padding: 11, marginVertical: 6 },
  tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: "#cfd8df" }, tabOn: { backgroundColor: "#fff" },
  scene: { aspectRatio: 16 / 9, backgroundColor: "#2a3640", borderRadius: 12, overflow: "hidden" }, zone: { position: "absolute", borderWidth: 3, borderColor: "#0f8b8d", backgroundColor: "rgba(15,139,141,.25)" },
});
