// Declares the background service's type for Android 14+ (without this, starting it crashes the app).
const { withAndroidManifest } = require("expo/config-plugins");
const SVC = "com.asterinet.react.bgactions.RNBackgroundActionsTask", PERM = "android.permission.FOREGROUND_SERVICE_SPECIAL_USE";
module.exports = (config) => withAndroidManifest(config, (c) => {
  const m = c.modResults.manifest;
  m["uses-permission"] = m["uses-permission"] || [];
  if (!m["uses-permission"].some((p) => p.$["android:name"] === PERM)) m["uses-permission"].push({ $: { "android:name": PERM } });
  const app = m.application[0]; app.service = app.service || [];
  if (!app.service.some((s) => s.$["android:name"] === SVC)) app.service.push({
    $: { "android:name": SVC, "android:foregroundServiceType": "specialUse", "android:exported": "false" },
    property: [{ $: { "android:name": "android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE", "android:value": "Watches store cameras and uploads pictures for theft and blocked-register alerts" } }],
  });
  return c;
});
