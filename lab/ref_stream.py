"""Reference test: record a few seconds of live video with the community library, decrypt with the verification code, check it decodes."""
import os, subprocess, time
from pathlib import Path
from hikcloudstream import Credentials, HikConnectClient
from hikcloudstream.models import StreamType
from hikcloudstream.stream import open_live_stream
from hikcloudstream.stream.crypto import decrypt_h264_for_ffmpeg

lines = []
def log(x): lines.append(x); print(x, flush=True)
def probe(data, name):
    p = Path(name); p.write_bytes(data)
    r = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,nb_read_frames", "-of", "csv=p=0", name], capture_output=True, text=True)
    p.unlink(missing_ok=True); return (r.stdout or r.stderr).strip().replace("\n", " ")[:90]
code = os.environ.get("HIK_VERIFY_CODE")
with HikConnectClient() as c:
    c.login(Credentials(os.environ["HIK_EMAIL"], os.environ["HIK_PASSWORD"]))
    cams = c.list_cameras()
    devs = {}
    for cam in cams: devs.setdefault(cam.device_serial, []).append(cam.channel_no)
    log(f"login ok: {len(cams)} cameras on {len(devs)} devices ({', '.join(f'..{k[-3:]}:{len(v)}ch' for k, v in devs.items())})")
    for cam in cams[: int(os.environ.get("N", "12"))]:
        raw = bytearray(); err = ""; t0 = time.time(); stype = "?"
        try:
            with open_live_stream(c, cam, stream_type=StreamType.AUTO) as s:
                stype = s.stream_type; s.start()
                for chunk in s.iter_annex_b_chunks(duration_seconds=6, allow_encrypted=True): raw += chunk
        except Exception as e:
            err = f"{type(e).__name__}: {str(e)[:70]}"
        if raw:
            enc = probe(bytes(raw), "enc.h264")
            try: dec = probe(decrypt_h264_for_ffmpeg(bytes(raw), code), "dec.h264")
            except Exception as e: dec = f"decrypt failed {type(e).__name__}: {str(e)[:60]}"
            log(f"#{cam.index} dev..{cam.device_serial[-3:]} ch{cam.channel_no} stream={stype}: {len(raw)}B in {time.time()-t0:.0f}s | raw[{enc}] | decrypted[{dec}]")
        else:
            log(f"#{cam.index} dev..{cam.device_serial[-3:]} ch{cam.channel_no}: no data. {err}")
print("::notice::REFERENCE STREAM TEST%0A" + "%0A".join(lines))
