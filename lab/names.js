const H = require("../app/hikcloud.js");
(async () => {
  const st = H.newState(); await H.login(st, process.env.HIK_EMAIL, process.env.HIK_PASSWORD);
  const pl = await (await fetch(`${st.base}/v3/userdevices/v1/devices/pagelist?groupId=-1&limit=50&offset=0&filter=STATUS`, { headers: H.hdrs(st) })).json();
  const cams = await H.listCameras(st), out = [];
  for (const d of pl.deviceInfos || []) {
    const mine = cams.filter((c) => c.serial === d.deviceSerial), named = mine.filter((c) => !/^(camera|channel|ipc|d)\s*\d+$/i.test(c.name.trim()));
    out.push(`dev..${d.deviceSerial.slice(-3)} "${d.name}": ${mine.length} slots, status=${d.status} (1=online,2=offline), channels with real names: ${named.map((c) => `ch${c.ch}=${c.name}`).slice(0, 14).join(", ")}`);
  }
  console.log("::notice::DEVICE NAMES%0A" + out.join("%0A"));
})().catch((e) => { console.log("::error::" + String(e).slice(0, 200)); process.exit(1); });
