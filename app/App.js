import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Image, PanResponder, StyleSheet, SafeAreaView, Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import { getLocales } from "expo-localization";
import * as Notifications from "expo-notifications";
import BackgroundService from "react-native-background-actions";
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }) });

const ar = getLocales()[0]?.languageCode === "ar";
const D = {
  en: { title: "Your stores", none: "No cameras yet", noneSub: "Add a camera from any brand. It works with any camera that can send pictures.", add: "Add camera", store: "Store name", cname: "Camera name", create: "Create", cancel: "Cancel", server: "Server address", key: "App key", save: "Save", live: "Live", thefts: "Past thefts", waiting: "Waiting for the first picture from the camera…", url: "Paste this link into the camera’s HTTP upload (snapshot push) setting:", verified: "Verified: camera is sending pictures", unverified: "Not verified yet", find: "Find register with AI", mark: "Mark it myself", remove: "No register on this camera", saveArea: "Save area", drag: "Drag over the register. The AI watches only this spot.", nothing: "No theft alerts.", noreg: "No register area set. This camera only records; alerts are off.", shifts: "24-hour recordings", recording: "Recording now", savedv: "Saved", play: "Play", pause: "Pause", back5: "−5 min", fwd5: "+5 min", frames: "pictures", noshifts: "No recordings yet. They start when the camera sends its first picture.", n24: "24 hours saved. Starting a new recording.", theft: "Possible theft at the register", svc: "Watching your cameras", camAddr: "Camera address (optional)", bad: "That address isn’t valid. Use http://… or rtsp://…", down: "Can’t reach this address. It may be fake or wrong, or you may be away from the store’s Wi‑Fi.", downBtn: "Add anyway", blocked: "Someone is blocking the register", back: "Back", noimg: "No picture yet. Check that the camera sends pictures.", fail: "Could not reach the server. Check the address and key." },
  ar: { title: "متاجرك", none: "لا توجد كاميرات بعد", noneSub: "أضف كاميرا من أي علامة تجارية. تعمل مع أي كاميرا تستطيع إرسال الصور.", add: "إضافة كاميرا", store: "اسم المتجر", cname: "اسم الكاميرا", create: "إنشاء", cancel: "إلغاء", server: "عنوان الخادم", key: "مفتاح التطبيق", save: "حفظ", live: "مباشر", thefts: "السرقات السابقة", waiting: "في انتظار أول صورة من الكاميرا…", url: "الصق هذا الرابط في إعدادات رفع الصور (HTTP) في الكاميرا:", verified: "تم التحقق: الكاميرا ترسل الصور", unverified: "لم يتم التحقق بعد", find: "البحث عن الصندوق بالذكاء الاصطناعي", mark: "تحديده بنفسي", remove: "لا يوجد صندوق في هذه الكاميرا", saveArea: "حفظ المنطقة", drag: "اسحب فوق الصندوق. يراقب الذكاء الاصطناعي هذا المكان فقط.", nothing: "لا توجد تنبيهات سرقة.", noreg: "لا توجد منطقة صندوق. هذه الكاميرا تسجّل فقط وبدون تنبيهات.", shifts: "تسجيلات 24 ساعة", recording: "جارٍ التسجيل", savedv: "تم الحفظ", play: "تشغيل", pause: "إيقاف", back5: "−5 د", fwd5: "+5 د", frames: "صورة", noshifts: "لا توجد تسجيلات بعد. تبدأ عند وصول أول صورة من الكاميرا.", n24: "تم حفظ 24 ساعة. بدء تسجيل جديد.", theft: "احتمال سرقة عند الصندوق", svc: "مراقبة الكاميرات", camAddr: "عنوان الكاميرا (اختياري)", bad: "العنوان غير صالح. استخدم http://… أو rtsp://…", down: "تعذّر الوصول إلى هذا العنوان. قد يكون مزيفًا أو خاطئًا، أو أنك بعيد عن شبكة المتجر.", downBtn: "إضافة على أي حال", blocked: "شخص يحجب الصندوق", back: "رجوع", noimg: "لا توجد صورة بعد. تأكد أن الكاميرا ترسل الصور.", fail: "تعذّر الوصول إلى الخادم. تحقق من العنوان والمفتاح." },
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

  useEffect(() => { (async () => {
    const b = await SecureStore.getItemAsync("base"), k = await SecureStore.getItemAsync("key");
    if (b && k) setCfg({ base: b, key: k }); setLoaded(true);
  })(); }, []);

  const api = useCallback(async (path, opt = {}) => {
    const r = await fetch(cfg.base.replace(/\/$/, "") + path, { ...opt, headers: { authorization: "Bearer " + cfg.key, "content-type": "application/json" } });
    return r.json();
  }, [cfg]);
  const load = useCallback(async () => { try { setCams(await api("/api/cameras")); } catch { Alert.alert(t("fail")); } }, [api]);
  useEffect(() => { if (cfg) { load(); startWatcher(cfg); } }, [cfg]);

  if (!loaded) return null;
  if (!cfg) return (
    <SafeAreaView style={s.app}><Text style={s.h1}>Register Watch</Text>
      <Text>{t("server")}</Text><TextInput style={s.in} autoCapitalize="none" value={f.base} onChangeText={(v) => setF({ ...f, base: v })} placeholder="https://….workers.dev" />
      <Text>{t("key")}</Text><TextInput style={s.in} autoCapitalize="none" secureTextEntry value={f.key} onChangeText={(v) => setF({ ...f, key: v })} />
      <Btn onPress={async () => { await SecureStore.setItemAsync("base", f.base.trim()); await SecureStore.setItemAsync("key", f.key.trim()); setCfg({ base: f.base.trim(), key: f.key.trim() }); }}>{t("save")}</Btn>
    </SafeAreaView>);

  if (scr.n === "add") return <AddCam api={api} done={(c) => { load(); setScr({ n: "created", c }); }} back={() => setScr({ n: "home" })} />;
  if (scr.n === "created") return <Created api={api} c={scr.c} back={() => { load(); setScr({ n: "home" }); }} />;
  if (scr.n === "cam") return <Cam api={api} cfg={cfg} cam={cams.find((c) => c.id === scr.id)} reload={load} back={() => setScr({ n: "home" })} />;

  const stores = [...new Set(cams.map((c) => c.store))];
  return (
    <SafeAreaView style={s.app}><ScrollView>
      <Text style={s.h1}>{t("title")}</Text>
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

// Android foreground service: keeps this app watching in the background and posts local notifications.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function watchTask({ base, key }) {
  let since = Date.now();
  while (BackgroundService.isRunning()) {
    try {
      const r = await fetch(base.replace(/\/$/, "") + "/api/events?since=" + since, { headers: { authorization: "Bearer " + key } });
      for (const e of await r.json()) {
        since = Math.max(since, e.ts);
        await Notifications.scheduleNotificationAsync({ content: { title: e.title, body: e.body || (e.type === "blocked" ? t("blocked") : t("theft")) }, trigger: { channelId: "alerts" } });
      }
    } catch {}
    await sleep(10000);
  }
}
async function startWatcher(cfg) {
  try {
    await Notifications.requestPermissionsAsync();
    await Notifications.setNotificationChannelAsync("alerts", { name: "Alerts", importance: Notifications.AndroidImportance.MAX });
    if (BackgroundService.isRunning()) return;
    await BackgroundService.start(watchTask, { taskName: "RegisterWatch", taskTitle: "Register Watch", taskDesc: t("svc"), taskIcon: { name: "ic_launcher", type: "mipmap" }, parameters: { base: cfg.base, key: cfg.key } });
  } catch {}
}
const s = StyleSheet.create({
  app: { flex: 1, padding: 16, paddingTop: 48, backgroundColor: "#e9eef2" }, h1: { fontSize: 26, fontWeight: "700", marginBottom: 8 }, h2: { fontSize: 18, fontWeight: "700", marginVertical: 8 },
  mute: { color: "#5d6b78", marginVertical: 6 }, card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#cfd8df" },
  btn: { backgroundColor: "#17212b", borderRadius: 10, padding: 13, marginTop: 8, alignItems: "center" }, ghost: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#cfd8df" }, bt: { color: "#fff", fontWeight: "700" },
  in: { backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#cfd8df", padding: 11, marginVertical: 6 },
  tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: "#cfd8df" }, tabOn: { backgroundColor: "#fff" },
  scene: { aspectRatio: 16 / 9, backgroundColor: "#2a3640", borderRadius: 12, overflow: "hidden" }, zone: { position: "absolute", borderWidth: 3, borderColor: "#0f8b8d", backgroundColor: "rgba(15,139,141,.25)" },
});
