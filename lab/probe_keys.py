import io, os, subprocess
from hikcloudstream import Credentials, HikConnectClient
from hikcloudstream.models import StreamType
from hikcloudstream.stream import open_live_stream
from hikcloudstream.stream.crypto import decrypt_h264_for_ffmpeg
from hikcloudstream.stream.sinks.annex_b import write_stream_payloads
lines = []
def log(x): lines.append(x); print(x, flush=True)
code = os.environ["HIK_VERIFY_CODE"]
def ff(path, fmt=None):
    cmd = ["ffmpeg", "-v", "error", "-y"] + (["-f", fmt] if fmt else []) + ["-i", path, "-frames:v", "10", "-f", "null", "-"]
    r = subprocess.run(cmd, capture_output=True, text=True); return (r.stderr.strip().replace("\n", " | ") or "decoded 10 frames OK")[:230]
with HikConnectClient() as c:
    c.login(Credentials(os.environ["HIK_EMAIL"], os.environ["HIK_PASSWORD"]))
    cams = c.list_cameras(); devs = {}
    for cam in cams: devs.setdefault(cam.device_serial, []).append(cam)
    for ser, lst in devs.items():
        try: k = c.query_device_encrypt_key(ser, code); log(f"dev..{ser[-3:]}: encryptkey OK (len {len(k)})")
        except Exception as e: log(f"dev..{ser[-3:]}: encryptkey FAILED {type(e).__name__}: {str(e)[:110]}")
    cam = next(x for x in cams if x.channel_no == 1 and x.device_serial.endswith("245"))
    with open_live_stream(c, cam, stream_type=StreamType.AUTO) as s:
        s.start(); buf = io.BytesIO(); tr = write_stream_payloads(s._client, buf, max_packets=None, duration_seconds=6, allow_encrypted=True)
    data = buf.getvalue(); open("raw.h264", "wb").write(data)
    nal = {}
    i = 0
    while True:
        i = data.find(b"\x00\x00\x01", i)
        if i < 0 or i + 3 >= len(data): break
        t = data[i + 3] & 0x1F; nal[t] = nal.get(t, 0) + 1; i += 3
    log(f"ch1 raw: {len(data)}B transport={tr.name} NAL types={dict(sorted(nal.items()))}")
    log("ffmpeg on raw: " + ff("raw.h264", "h264"))
    open("dec.h264", "wb").write(decrypt_h264_for_ffmpeg(data, code))
    log("ffmpeg on decrypted-with-code: " + ff("dec.h264", "h264"))
print("::notice::KEY + DECODE PROBE%0A" + "%0A".join(lines))
