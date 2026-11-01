import os, struct
from collections import Counter
from hikcloudstream import Credentials, HikConnectClient
from hikcloudstream.models import StreamType
from hikcloudstream.stream import open_live_stream
lines = []
def log(x): lines.append(x); print(x, flush=True)
with HikConnectClient() as c:
    c.login(Credentials(os.environ["HIK_EMAIL"], os.environ["HIK_PASSWORD"]))
    page = c.request_json("GET", "/v3/userdevices/v1/devices/pagelist", params={"groupId": -1, "limit": 50, "offset": 0, "filter": "TIME_PLAN,CONNECTION,SWITCH,STATUS,STATUS_EXT,WIFI,NODISTURB,P2P,KMS,HIDDNS"})
    for d in page.get("deviceInfos", []):
        sc = {k: v for k, v in d.items() if isinstance(v, (int, str, bool)) and k not in ("deviceSerial", "name", "fullSerial", "mac", "ip", "userDeviceCreateTime") and len(str(v)) < 22}
        log(f"DEVICE ..{d['deviceSerial'][-3:]}: " + ", ".join(f"{k}={v}" for k, v in list(sc.items())[:40]))
        ci = c.request_json("GET", "/v3/userdevices/v1/cameras/info", params={"deviceSerial": d["deviceSerial"]}).get("cameraInfos", [])
        keys = {}
        for it in ci:
            for k, v in it.items():
                if isinstance(v, (int, bool)) or (isinstance(v, str) and len(v) < 12 and k not in ("cameraName", "deviceSerial", "cameraId")): keys.setdefault(k, Counter())[v] += 1
        log(f"  channels={len(ci)} fields: " + "; ".join(f"{k}:{dict(v)}" for k, v in keys.items() if len(v) <= 4)[:600])
    cams = c.list_cameras()
    cam = next(x for x in cams if x.channel_no == 1 and x.device_serial.endswith("245"))
    with open_live_stream(c, cam, stream_type=StreamType.AUTO) as s:
        s.start(); n = 0
        for pkt in s._client.iter_packets(max_packets=40):
            b = pkt.body
            hdr = ""
            if len(b) >= 12:
                v = b[0] >> 6; pt = b[1] & 0x7F; m = b[1] >> 7; seq, ts, ssrc = struct.unpack(">HII", b[2:12]); hdr = f"rtp v{v} pt{pt} m{m} seq{seq} ts{ts} "
            log(f"pkt ch={int(pkt.channel)} enc={pkt.encrypted} len={len(b)} {hdr}payload16={b[12:28].hex()}")
            n += 1
            if n >= 28: break
print("::notice::PACKET + FIELD PROBE%0A" + "%0A".join(lines))
