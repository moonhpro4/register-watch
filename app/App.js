import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Image, PanResponder, StyleSheet, SafeAreaView, Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import { getLocales } from "expo-localization";
import * as Notifications from "expo-notifications";
import BackgroundService from "react-native-background-actions";
import * as FileSystem from "expo-file-system";
import { isapi, digestHeaders, parseDevice, parseChannels } from "./hik";
import { newState, login as hikLogin, listCameras as hikList, snapshot as hikSnapshot, b64ToBytes, bytesToB64 } from "./hikcloud";
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }) });

const ar = getLocales()[0]?.languageCode === "ar";
const D = {
  en: { title: "Your stores", none: "No cameras yet", noneSub: "Add a camera from any brand. It works with any camera that can send pictures.", add: "Add camera", store: "Store name", cname: "Camera name", create: "Create", cancel: "Cancel", server: "Server address", key: "App key", save: "Save", live: "Live", thefts: "Past thefts", waiting: "Waiting for the first picture from the camera…", url: "Paste this link into the camera’s HTTP upload (snapshot push) setting:", verified: "Verified: camera is sending pictures", unverified: "Not verified yet", find: "Find register with AI", mark: "Mark it myself", remove: "No register on this camera", saveArea: "Save area", drag: "Drag over the register. The AI watches only this spot.", nothing: "No theft alerts.", noreg: "No register area set. This camera only records; alerts are off.", shifts: "24-hour recordings", recording: "Recording now", savedv: "Saved", play: "Play", pause: "Pause", back5: "−5 min", fwd5: "+5 min", frames: "pictures", noshifts: "No recordings yet. They start when the camera sends its first picture.", n24: "24 hours saved. Starting a new recording.", theft: "Possible theft at the register", svc: "Watching your cameras", camAddr: "Camera address (optional)", bad: "That address isn’t valid. Use http://… or rtsp://…", down: "Can’t reach this address. It may be fake or wrong, or you may be away from the store’s Wi‑Fi.", downBtn: "Add anyway", blocked: "Someone is blocking the register", app: "Shadi Cam", pickT: "Where should recordings be saved?", pickD: "Choose a folder on your phone (for example Documents). The app creates a folder called “Shadi Cam” inside it and saves every recording and theft picture there. Nothing is deleted from your phone.", pickB: "Choose folder", skip: "Skip", addNvr: "Add Hikvision NVR / DVR", nvrHint: "Your phone must be on the same Wi‑Fi as the NVR. Leave it at the store: it sends the pictures to the cloud. Hik-Connect keeps working as usual. Tip: create a separate NVR user with only live view permission instead of using admin.", host: "NVR address (IP)", port: "Port", user: "Username", pass: "Password", connect: "Connect", found: "Connected", chansT: "Cameras found (tap to choose)", addSel: "Add selected cameras", badPass: "Wrong username or password.", notHik: "This doesn’t look like a Hikvision device.", noReach: "Can’t reach the NVR. Check the address, and that this phone is on the same Wi‑Fi as the NVR.", sha: "This NVR uses a login type the app doesn’t support yet (SHA‑256). In the NVR’s network settings, set web authentication to digest/basic.", syncHik: "Sync with Hik-Connect", hikHint: "Log in with the same account you use in the Hik-Connect app. Your login stays on this phone. Works from any network. Pictures from the Hik-Connect cloud are small, so the AI sees less detail than with a direct NVR connection.", email: "Hik-Connect email or phone", hikLogin: "Log in", hikBad: "Wrong email/phone or password.", hikCaptcha: "Hik-Connect is asking for a CAPTCHA. Log in once in the Hik-Connect app, then try again.", hikNone: "No cameras found on this account.", hikFail: "Couldn’t reach Hik-Connect. Check your internet and login.", hikNoPic: "Couldn’t get a picture from", hikCode: "Verification code (only if pictures fail)", hikAdd: "Add selected cameras", hikLive: "Live: updates every few seconds", loginHik: "Log in with Hik-Connect", loginHint: "Use the same email and password as in the Hik-Connect app. Your cameras then appear automatically.", owner: "This backend already belongs to another Hik-Connect account.", back: "Back", noimg: "No picture yet. Check that the camera sends pictures.", fail: "Could not reach the server. Check the address and key." },
  ar: { title: "متاجرك", none: "لا توجد كاميرات بعد", noneSub: "أضف كاميرا من أي علامة تجارية. تعمل مع أي كاميرا تستطيع إرسال الصور.", add: "إضافة كاميرا", store: "اسم المتجر", cname: "اسم الكاميرا", create: "إنشاء", cancel: "إلغاء", server: "عنوان الخادم", key: "مفتاح التطبيق", save: "حفظ", live: "مباشر", thefts: "السرقات السابقة", waiting: "في انتظار أول صورة من الكاميرا…", url: "الصق هذا الرابط في إعدادات رفع الصور (HTTP) في الكاميرا:", verified: "تم التحقق: الكاميرا ترسل الصور", unverified: "لم يتم التحقق بعد", find: "البحث عن الصندوق بالذكاء الاصطناعي", mark: "تحديده بنفسي", remove: "لا يوجد صندوق في هذه الكاميرا", saveArea: "حفظ المنطقة", drag: "اسحب فوق الصندوق. يراقب الذكاء الاصطناعي هذا المكان فقط.", nothing: "لا توجد تنبيهات سرقة.", noreg: "لا توجد منطقة صندوق. هذه الكاميرا تسجّل فقط وبدون تنبيهات.", shifts: "تسجيلات 24 ساعة", recording: "جارٍ التسجيل", savedv: "تم الحفظ", play: "تشغيل", pause: "إيقاف", back5: "−5 د", fwd5: "+5 د", frames: "صورة", noshifts: "لا توجد تسجيلات بعد. تبدأ عند وصول أول صورة من الكاميرا.", n24: "تم حفظ 24 ساعة. بدء تسجيل جديد.", theft: "احتمال سرقة عند الصندوق", svc: "مراقبة الكاميرات", camAddr: "عنوان الكاميرا (اختياري)", bad: "العنوان غير صالح. استخدم http://… أو rtsp://…", down: "تعذّر الوصول إلى هذا العنوان. قد يكون مزيفًا أو خاطئًا، أو أنك بعيد عن شبكة المتجر.", downBtn: "إضافة على أي حال", blocked: "شخص يحجب الصندوق", app: "كمرت شادي", pickT: "أين تريد حفظ التسجيلات؟", pickD: "اختر مجلدًا على هاتفك (مثل Documents). سينشئ التطبيق بداخله مجلدًا باسم «Shadi Cam» ويحفظ فيه كل تسجيل وكل صورة سرقة. لا يتم حذف أي شيء من هاتفك.", pickB: "اختيار المجلد", skip: "تخطي", addNvr: "إضافة جهاز تسجيل هيكفيجن (NVR / DVR)", nvrHint: "يجب أن يكون هاتفك على نفس شبكة الواي فاي مع الجهاز. اتركه في المتجر: يرسل الصور إلى السحابة. يستمر تطبيق Hik-Connect بالعمل كالمعتاد. نصيحة: أنشئ مستخدمًا منفصلًا في الجهاز بصلاحية المشاهدة المباشرة فقط بدل admin.", host: "عنوان الجهاز (IP)", port: "المنفذ", user: "اسم المستخدم", pass: "كلمة المرور", connect: "اتصال", found: "تم الاتصال", chansT: "الكاميرات الموجودة (اضغط للاختيار)", addSel: "إضافة الكاميرات المحددة", badPass: "اسم المستخدم أو كلمة المرور خاطئة.", notHik: "هذا لا يبدو جهاز هيكفيجن.", noReach: "تعذّر الوصول إلى الجهاز. تحقق من العنوان ومن أن هذا الهاتف على نفس شبكة الواي فاي.", sha: "هذا الجهاز يستخدم نوع تسجيل دخول غير مدعوم بعد (SHA‑256). في إعدادات الشبكة بالجهاز اجعل التوثيق digest/basic.", syncHik: "مزامنة مع Hik-Connect", hikHint: "سجّل الدخول بنفس الحساب الذي تستخدمه في تطبيق Hik-Connect. يبقى تسجيل دخولك على هذا الهاتف. يعمل من أي شبكة. صور سحابة Hik-Connect صغيرة، لذا يرى الذكاء الاصطناعي تفاصيل أقل مقارنة بالاتصال المباشر بالجهاز.", email: "بريد أو هاتف Hik-Connect", hikLogin: "تسجيل الدخول", hikBad: "البريد/الهاتف أو كلمة المرور خاطئة.", hikCaptcha: "يطلب Hik-Connect اختبار CAPTCHA. سجّل الدخول مرة واحدة في تطبيق Hik-Connect ثم حاول مجددًا.", hikNone: "لا توجد كاميرات في هذا الحساب.", hikFail: "تعذّر الوصول إلى Hik-Connect. تحقق من الإنترنت وبيانات الدخول.", hikNoPic: "تعذّر الحصول على صورة من", hikCode: "رمز التحقق (فقط إذا فشلت الصور)", hikAdd: "إضافة الكاميرات المحددة", hikLive: "مباشر: يتحدث كل بضع ثوانٍ", loginHik: "تسجيل الدخول عبر Hik-Connect", loginHint: "استخدم نفس البريد وكلمة المرور في تطبيق Hik-Connect. ستظهر كاميراتك تلقائيًا.", owner: "هذا الخادم مرتبط بحساب Hik-Connect آخر.", back: "رجوع", noimg: "لا توجد صورة بعد. تأكد أن الكاميرا ترسل الصور.", fail: "تعذّر الوصول إلى الخادم. تحقق من العنوان والمفتاح." },
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
    const k = await SecureStore.getItemAsync("token");
    if (k) setCfg({ base: WORKER, key: k }); setRoot((await SecureStore.getItemAsync("root")) || ""); setLoaded(true);
  })(); }, []);

  const api = useCallback(async (path, opt = {}) => {
    const go = (k) => fetch(WORKER + path, { ...opt, headers: { authorization: "Bearer " + k, "content-type": "application/json" } });
    let r = await go(cfg.key);
    if (r.status === 401) { const k = await reauth(); if (k) { setCfg({ base: WORKER, key: k }); r = await go(k); } }
    return r.json();
  }, [cfg]);
  const load = useCallback(async () => { try { setCams(await api("/api/cameras")); } catch { Alert.alert(t("fail")); } }, [api]);
  useEffect(() => { if (cfg && root) { load(); startWatcher(cfg, root); } else if (cfg) load(); }, [cfg, root]);

  if (!loaded) return null;
  if (!cfg) return <LoginHik onDone={(k, pre) => { setCfg({ base: WORKER, key: k }); setScr({ n: "hik", pre }); }} />;

  if (root === "") return <PickFolder done={setRoot} />;
  if (scr.n === "hik") return <AddHik api={api} pre={scr.pre} back={() => setScr({ n: "home" })} done={() => { load(); setScr({ n: "home" }); }} />;
  if (scr.n === "nvr") return <AddNvr api={api} back={() => setScr({ n: "home" })} done={() => { load(); setScr({ n: "home" }); }} />;
  if (scr.n === "add") return <AddCam api={api} done={(c) => { load(); setScr({ n: "created", c }); }} back={() => setScr({ n: "home" })} />;
  if (scr.n === "created") return <Created api={api} c={scr.c} back={() => { load(); setScr({ n: "home" }); }} />;
  if (scr.n === "cam") return <Cam api={api} cfg={cfg} cam={cams.find((c) => c.id === scr.id)} reload={load} back={() => setScr({ n: "home" })} />;

  const stores = [...new Set(cams.map((c) => c.store))];
  return (
    <SafeAreaView style={s.app}><ScrollView>
      <Text style={s.h1}>{t("title")}</Text><DevBanner />
      {!cams.length ? (
        <View style={{ alignItems: "center", padding: 40 }}><Text style={{ fontSize: 56 }}>📹</Text><Text style={s.h2}>{t("none")}</Text><Text style={s.mute}>{t("noneSub")}</Text><Btn onPress={() => setScr({ n: "add" })}>+ {t("add")}</Btn><Btn onPress={() => setScr({ n: "hik" })}>{t("syncHik")}</Btn><Btn ghost onPress={() => setScr({ n: "nvr" })}>+ {t("addNvr")}</Btn></View>
      ) : (<>
        {stores.map((st) => (<View key={st}><Text style={s.h2}>{st}</Text>
          {cams.filter((c) => c.store === st).map((c) => (
            <Pressable key={c.id} style={s.card} onPress={() => setScr({ n: "cam", id: c.id })}>
              <Text style={{ fontWeight: "700" }}>{c.name}</Text><Text style={s.mute}>{c.verified ? "● " + t("verified") : "○ " + t("unverified")}</Text></Pressable>))}</View>))}
        <Btn ghost onPress={() => setScr({ n: "add" })}>+ {t("add")}</Btn><Btn onPress={() => setScr({ n: "hik" })}>{t("syncHik")}</Btn><Btn ghost onPress={() => setScr({ n: "nvr" })}>+ {t("addNvr")}</Btn></>)}
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
  const [liveUri, setLiveUri] = useState(null), [tab, setTab] = useState("live"), [edit, setEdit] = useState(false), [tmp, setTmp] = useState(null), [alerts, setAlerts] = useState([]);
  const size = useRef({ w: 1, h: 1 }), st = useRef(null);
  const hdr = { Authorization: "Bearer " + cfg.key };
  useEffect(() => {
    if (tab !== "live" || edit) return; let on = true;
    (async () => {
      const d = await hikData(), m = d && (d.cams || []).find((x) => x.camId === cam.id); if (!m) return;
      while (on) { try { const u = await hikJpegFile(d, m.serial, m.ch, "live" + Date.now()); if (u && on) setLiveUri(u); } catch {} await sleep(3000); }
    })();
    return () => { on = false; };
  }, [tab, edit]);
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
        <Image source={liveUri ? { uri: liveUri } : { uri: `${cfg.base.replace(/\/$/, "")}/api/cameras/${cam.id}/latest?t=${Date.now()}`, headers: hdr }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        {z && <View pointerEvents="none" style={[s.zone, { left: z.x + "%", top: z.y + "%", width: z.w + "%", height: z.h + "%" }]} />}</View>
      {edit ? (<><Text style={s.mute}>{t("drag")}</Text><Btn onPress={() => tmp && putZone(tmp)}>{t("saveArea")}</Btn><Btn ghost onPress={() => { setEdit(false); setTmp(null); }}>{t("cancel")}</Btn></>) : (<>
        {liveUri && <Text style={s.mute}>{t("hikLive")}</Text>}
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

const WORKER = "https://register-watch.opergo.workers.dev"; // built in: users never type it
async function reauth() { // refresh the Worker token using the saved Hik-Connect login
  try {
    const d = await hikData(), pw = await SecureStore.getItemAsync("hikpw"); if (!d || !pw) return null;
    const r = await fetch(WORKER + "/auth/hik", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: d.email, password: pw }) });
    const j = await r.json(); if (!r.ok || !j.token) return null;
    await SecureStore.setItemAsync("token", j.token); return j.token;
  } catch { return null; }
}
function LoginHik({ onDone }) {
  const [open, setOpen] = useState(false), [f, setF] = useState({ email: "", pass: "" }), [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const email = f.email.trim(), st = newState(); await hikLogin(st, email, f.pass); // real Hik-Connect login
      const r = await fetch(WORKER + "/auth/hik", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: f.pass }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error === "not the owner" ? "owner" : "server");
      const list = await hikList(st);
      await SecureStore.setItemAsync("token", j.token); await SecureStore.setItemAsync("hikpw", f.pass);
      if (!(await hikData())) await FileSystem.writeAsStringAsync(HIKF, JSON.stringify({ email, codes: {}, cams: [] }));
      HS = st; HSAt = Date.now(); onDone(j.token, { email, pass: f.pass, list });
    } catch (e) { Alert.alert(e.message === "badlogin" ? t("hikBad") : e.message === "captcha" ? t("hikCaptcha") : e.message === "owner" ? t("owner") : t("hikFail")); }
    setBusy(false);
  };
  return (<SafeAreaView style={s.app}><Text style={s.h1}>{t("app")}</Text><DevBanner />
    {!open ? (<Pressable style={s.hikBtn} onPress={() => setOpen(true)}><Image source={require("./assets/hikconnect.png")} style={{ width: 30, height: 30, borderRadius: 7 }} /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>{t("loginHik")}</Text></Pressable>) : (<>
      <Text style={s.mute}>{t("loginHint")}</Text>
      <Text>{t("email")}</Text><TextInput style={s.in} autoCapitalize="none" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} />
      <Text>{t("pass")}</Text><TextInput style={s.in} autoCapitalize="none" secureTextEntry value={f.pass} onChangeText={(v) => setF({ ...f, pass: v })} />
      <Btn onPress={go}>{busy ? "…" : t("hikLogin")}</Btn></>)}
  </SafeAreaView>);
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

// ---- Hikvision NVR/DVR: the phone (on the store Wi-Fi) fetches snapshots and uploads them to the Worker ----
const NVRS = FileSystem.documentDirectory + "nvrs.json";
const pwKey = (h) => "nvrpw_" + String(h).replace(/[^A-Za-z0-9._-]/g, "_");
async function loadNvrs() {
  let l = []; try { l = JSON.parse(await FileSystem.readAsStringAsync(NVRS)); } catch {}
  for (const n of l) n.pass = (await SecureStore.getItemAsync(pwKey(n.host))) || "";
  return l;
}
async function saveNvr(nvr, chans) {
  const l = (await loadNvrs()).filter((n) => n.host !== nvr.host).map(({ pass, ...r }) => r);
  l.push({ host: nvr.host, port: nvr.port, user: nvr.user, chans });
  await SecureStore.setItemAsync(pwKey(nvr.host), nvr.pass);
  await FileSystem.writeAsStringAsync(NVRS, JSON.stringify(l));
}
async function nvrSnapshot(nvr, id) { // prefer the small sub-stream (…02) so uploads stay light
  const tmp = FileSystem.cacheDirectory + "snap.jpg";
  for (const pth of [`/ISAPI/Streaming/channels/${id.slice(0, -2)}02/picture`, `/ISAPI/Streaming/channels/${id}/picture`]) {
    const url = `http://${nvr.host}:${nvr.port || 80}${pth}`;
    const d = await digestHeaders(url, nvr.user, nvr.pass);
    const r = await FileSystem.downloadAsync(url, tmp, { headers: d.auth ? { Authorization: d.auth } : {} });
    const info = await FileSystem.getInfoAsync(tmp);
    if (r.status === 200 && info.size > 1000 && info.size < 1400000) return tmp;
  }
  return null;
}
async function bridgeNvrs() {
  for (const nvr of await loadNvrs()) for (const c of nvr.chans) {
    try { const f = await nvrSnapshot(nvr, c.id); if (f) await FileSystem.uploadAsync(c.uploadUrl, f, { httpMethod: "POST", uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers: { "content-type": "image/jpeg" } }); } catch {}
  }
}
function AddNvr({ api, back, done }) {
  const [f, setF] = useState({ host: "", port: "80", user: "", pass: "", store: "" }), [info, setInfo] = useState(null), [sel, setSel] = useState({}), [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const connect = async () => {
    setBusy(true);
    try {
      const nvr = { host: f.host.trim(), port: f.port.trim() || "80", user: f.user.trim(), pass: f.pass };
      const dev = parseDevice(await isapi(nvr, "/ISAPI/System/deviceInfo"));
      if (!dev.model && !dev.serial) throw new Error("notHik");
      const chans = parseChannels(await isapi(nvr, "/ISAPI/Streaming/channels"));
      setInfo({ nvr, dev, chans }); setSel(Object.fromEntries(chans.map((c) => [c.id, true])));
    } catch (e) { Alert.alert(e.message === "auth" ? t("badPass") : e.message === "notHik" ? t("notHik") : e.message === "sha256" ? t("sha") : t("noReach")); }
    setBusy(false);
  };
  const add = async () => {
    setBusy(true);
    try {
      const chans = [];
      for (const c of info.chans.filter((x) => sel[x.id])) {
        const r = await api("/api/cameras", { method: "POST", body: JSON.stringify({ store: f.store.trim() || info.dev.name || "NVR", name: c.name }) });
        chans.push({ id: c.id, camId: r.id, uploadUrl: r.uploadUrl });
      }
      await saveNvr(info.nvr, chans); done();
    } catch { Alert.alert(t("fail")); }
    setBusy(false);
  };
  return (<SafeAreaView style={s.app}><ScrollView>
    <Text style={s.h2}>{t("addNvr")}</Text><Text style={s.mute}>{t("nvrHint")}</Text>
    {!info ? (<>
      <Text>{t("host")}</Text><TextInput style={s.in} autoCapitalize="none" keyboardType="numbers-and-punctuation" value={f.host} onChangeText={set("host")} placeholder="192.168.1.64" />
      <Text>{t("port")}</Text><TextInput style={s.in} keyboardType="number-pad" value={f.port} onChangeText={set("port")} />
      <Text>{t("user")}</Text><TextInput style={s.in} autoCapitalize="none" value={f.user} onChangeText={set("user")} />
      <Text>{t("pass")}</Text><TextInput style={s.in} autoCapitalize="none" secureTextEntry value={f.pass} onChangeText={set("pass")} />
      <Btn onPress={connect}>{busy ? "…" : t("connect")}</Btn></>) : (<>
      <Text style={{ fontWeight: "700" }}>✅ {t("found")}: {info.dev.model} · {info.dev.serial}</Text>
      <Text>{t("store")}</Text><TextInput style={s.in} value={f.store} onChangeText={set("store")} placeholder={info.dev.name} />
      <Text style={s.h2}>{t("chansT")}</Text>
      {info.chans.map((c) => (<Pressable key={c.id} style={s.card} onPress={() => setSel({ ...sel, [c.id]: !sel[c.id] })}><Text>{sel[c.id] ? "☑ " : "☐ "}{c.name}</Text></Pressable>))}
      <Btn onPress={add}>{busy ? "…" : t("addSel")}</Btn></>)}
    <Btn ghost onPress={back}>{t("back")}</Btn></ScrollView></SafeAreaView>);
}

// ---- Hik-Connect cloud: log in with your Hik-Connect account; works from any network ----
const HIKF = FileSystem.documentDirectory + "hik.json";
let HS = null, HSAt = 0; // cached cloud session (re-login every 20 min)
async function hikData() { try { return JSON.parse(await FileSystem.readAsStringAsync(HIKF)); } catch { return null; } }
async function hikSession(d) {
  if (HS && Date.now() - HSAt < 20 * 60000) return HS;
  const st = newState(); await hikLogin(st, d.email, (await SecureStore.getItemAsync("hikpw")) || ""); HS = st; HSAt = Date.now(); return st;
}
const dlBytes = async (url) => {
  const tmp = FileSystem.cacheDirectory + "hikdl.bin", r = await FileSystem.downloadAsync(url, tmp);
  if (r.status !== 200) throw new Error("dl");
  return b64ToBytes(await FileSystem.readAsStringAsync(tmp, { encoding: FileSystem.EncodingType.Base64 }));
};
async function hikJpegFile(d, serial, ch, suffix = "") {
  const st = await hikSession(d);
  try {
    const bytes = await hikSnapshot(st, serial, ch, (d.codes || {})[serial] || "", dlBytes); if (!bytes) return null;
    const f = FileSystem.cacheDirectory + `hik_${serial}_${ch}${suffix}.jpg`;
    await FileSystem.writeAsStringAsync(f, bytesToB64(bytes), { encoding: FileSystem.EncodingType.Base64 }); return f;
  } catch (e) { HS = null; throw e; }
}
async function bridgeHik() {
  const d = await hikData(); if (!d || !d.cams) return;
  for (const c of d.cams) {
    try { const f = await hikJpegFile(d, c.serial, c.ch); if (f) await FileSystem.uploadAsync(c.uploadUrl, f, { httpMethod: "POST", uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers: { "content-type": "image/jpeg" } }); } catch {}
  }
}
function AddHik({ api, back, done, pre }) {
  const [f, setF] = useState({ email: pre ? pre.email : "", pass: pre ? pre.pass : "", store: "" }), [list, setList] = useState(pre ? pre.list : null), [sel, setSel] = useState(pre ? Object.fromEntries(pre.list.map((c) => [c.serial + ":" + c.ch, true])) : {}), [codes, setCodes] = useState({}), [busy, setBusy] = useState(false);
  const key = (c) => c.serial + ":" + c.ch;
  const connect = async () => {
    setBusy(true);
    try {
      const st = newState(); await hikLogin(st, f.email.trim(), f.pass);
      const cams = await hikList(st); if (!cams.length) throw new Error("none");
      HS = st; HSAt = Date.now(); setList(cams); setSel(Object.fromEntries(cams.map((c) => [key(c), true])));
    } catch (e) { Alert.alert(e.message === "badlogin" ? t("hikBad") : e.message === "captcha" ? t("hikCaptcha") : e.message === "none" ? t("hikNone") : t("hikFail")); }
    setBusy(false);
  };
  const add = async () => {
    setBusy(true);
    try {
      const old = (await hikData()) || { cams: [], codes: {} }, chosen = list.filter((c) => sel[key(c)] && !old.cams.find((o) => o.serial === c.serial && o.ch === c.ch));
      await SecureStore.setItemAsync("hikpw", f.pass);
      const d = { email: f.email.trim(), codes: { ...old.codes, ...codes }, cams: [...old.cams] };
      for (const serial of [...new Set(chosen.map((c) => c.serial))]) { // test one picture per device first
        const c0 = chosen.find((c) => c.serial === serial);
        if (!(await hikJpegFile(d, c0.serial, c0.ch).catch(() => null))) { Alert.alert(t("hikNoPic") + " " + c0.device); setBusy(false); return; }
      }
      for (const c of chosen) {
        const r = await api("/api/cameras", { method: "POST", body: JSON.stringify({ store: f.store.trim() || c.device, name: c.name }) });
        d.cams.push({ serial: c.serial, ch: c.ch, camId: r.id, uploadUrl: r.uploadUrl });
      }
      await FileSystem.writeAsStringAsync(HIKF, JSON.stringify(d)); done();
    } catch { Alert.alert(t("fail")); }
    setBusy(false);
  };
  const devices = list ? [...new Set(list.map((c) => c.serial))] : [];
  return (<SafeAreaView style={s.app}><ScrollView>
    <Text style={s.h2}>{t("syncHik")}</Text><Text style={s.mute}>{t("hikHint")}</Text>
    {!list ? (<>
      <Text>{t("email")}</Text><TextInput style={s.in} autoCapitalize="none" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} />
      <Text>{t("pass")}</Text><TextInput style={s.in} autoCapitalize="none" secureTextEntry value={f.pass} onChangeText={(v) => setF({ ...f, pass: v })} />
      <Btn onPress={connect}>{busy ? "…" : t("hikLogin")}</Btn></>) : (<>
      {devices.map((sn) => (<View key={sn}><Text style={s.h2}>{list.find((c) => c.serial === sn).device}</Text>
        <TextInput style={s.in} autoCapitalize="none" placeholder={t("hikCode")} value={codes[sn] || ""} onChangeText={(v) => setCodes({ ...codes, [sn]: v })} />
        {list.filter((c) => c.serial === sn).map((c) => (<Pressable key={key(c)} style={s.card} onPress={() => setSel({ ...sel, [key(c)]: !sel[key(c)] })}><Text>{sel[key(c)] ? "☑ " : "☐ "}{c.name}</Text></Pressable>))}</View>))}
      <Btn onPress={add}>{busy ? "…" : t("hikAdd")}</Btn></>)}
    <Btn ghost onPress={back}>{t("back")}</Btn></ScrollView></SafeAreaView>);
}

// Android foreground service: alerts, plus copying every recording to the phone, one step at a time.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function watchTask({ base, key, root }) {
  base = base.replace(/\/$/, ""); let since = Date.now(), lastSync = 0, lastBridge = 0, lastHik = 0; const saving = root && root !== "skip";
  while (BackgroundService.isRunning()) {
    key = (await SecureStore.getItemAsync("token")) || key;
    try {
      const r = await fetch(base + "/api/events?since=" + since, { headers: { authorization: "Bearer " + key } });
      for (const e of await r.json()) {
        since = Math.max(since, e.ts);
        await Notifications.scheduleNotificationAsync({ content: { title: e.title, body: e.body || (e.type === "blocked" ? t("blocked") : t("theft")) }, trigger: { channelId: "alerts" } });
        if (saving) { try { await saveAlert(base, key, root, e); } catch {} }
      }
    } catch {}
    if (Date.now() - lastBridge > 30000) { lastBridge = Date.now(); try { await bridgeNvrs(); } catch {} }
    if (Date.now() - lastHik > 60000) { lastHik = Date.now(); try { await bridgeHik(); } catch {} }
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
  hikBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#e53e3e", borderRadius: 12, padding: 14, marginTop: 24 },
  dev: { backgroundColor: "#fff3cd", borderRadius: 10, padding: 10, marginVertical: 8, borderWidth: 1, borderColor: "#e0c36a" },
  app: { flex: 1, padding: 16, paddingTop: 48, backgroundColor: "#e9eef2" }, h1: { fontSize: 26, fontWeight: "700", marginBottom: 8 }, h2: { fontSize: 18, fontWeight: "700", marginVertical: 8 },
  mute: { color: "#5d6b78", marginVertical: 6 }, card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#cfd8df" },
  btn: { backgroundColor: "#17212b", borderRadius: 10, padding: 13, marginTop: 8, alignItems: "center" }, ghost: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#cfd8df" }, bt: { color: "#fff", fontWeight: "700" },
  in: { backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#cfd8df", padding: 11, marginVertical: 6 },
  tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: "#cfd8df" }, tabOn: { backgroundColor: "#fff" },
  scene: { aspectRatio: 16 / 9, backgroundColor: "#2a3640", borderRadius: 12, overflow: "hidden" }, zone: { position: "absolute", borderWidth: 3, borderColor: "#0f8b8d", backgroundColor: "rgba(15,139,141,.25)" },
});
