"""Reference test following the library's own recipe: encrypt key from verification code -> decrypt -> remux -> ffprobe."""
import io, os, subprocess, time
from pathlib import Path
from hikcloudstream import Credentials, HikConnectClient
from hikcloudstream.models import StreamType
from hikcloudstream.stream import open_live_stream
from hikcloudstream.stream.crypto import decrypt_h264_for_ffmpeg, looks_encrypted_h264
from hikcloudstream.stream.sinks.annex_b import write_stream_payloads
from hikcloudstream.stream.sinks.mpegts import remux_annex_b_to_mpegts

lines = []
def log(x): lines.append(x); print(x, flush=True)
code = os.environ.get("HIK_VERIFY_CODE")
with HikConnectClient() as c:
    c.login(Credentials(os.environ["HIK_EMAIL"], os.environ["HIK_PASSWORD"]))
    cams = c.list_cameras(); devs = {}
    for cam in cams: devs.setdefault(cam.device_serial, []).append(cam)
    log(f"login ok: {len(cams)} channel slots on {len(devs)} devices")
    pick = []
    for ser, lst in devs.items(): pick += [x for x in lst if x.channel_no in (1, 2, 10, 11, 12)]
    for cam in pick:
        t0 = time.time(); tag = f"#{cam.index} dev..{cam.device_serial[-3:]} ch{cam.channel_no}"
        try:
            try: key = c.query_device_encrypt_key(cam.device_serial, code); ks = "encryptkey"
            except Exception as e: key = code; ks = f"code(fallback:{type(e).__name__})"
            with open_live_stream(c, cam, stream_type=StreamType.AUTO) as s:
                st = s.stream_type; info = s.start(); buf = io.BytesIO()
                tr = write_stream_payloads(s._client, buf, max_packets=None, duration_seconds=5, allow_encrypted=True)
            data = buf.getvalue()
            if not data: log(f"{tag}: connected, no video data"); continue
            enc = looks_encrypted_h264(data)
            payload = decrypt_h264_for_ffmpeg(data, key)
            with open("out.ts", "wb") as h: remux_annex_b_to_mpegts(payload, h, ffmpeg_path="ffmpeg", transport=tr)
            r = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,nb_read_frames", "-of", "csv=p=0", "out.ts"], capture_output=True, text=True)
            log(f"{tag} stream={st} transport={tr.name} {len(data)}B looksEncrypted={enc} key={ks} -> {(r.stdout or r.stderr).strip().replace(chr(10),' ')[:80]}")
        except Exception as e:
            log(f"{tag}: {type(e).__name__}: {str(e)[:90]}")
        Path("out.ts").unlink(missing_ok=True)
print("::notice::REFERENCE STREAM TEST%0A" + "%0A".join(lines))
