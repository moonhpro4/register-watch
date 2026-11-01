import io, os, subprocess
from hikcloudstream import Credentials, HikConnectClient
from hikcloudstream.models import StreamType
from hikcloudstream.stream import open_live_stream
from hikcloudstream.stream.crypto import decrypt_h264_for_ffmpeg, decrypt_hikvision_annex_b_video
from hikcloudstream.capture import aes_key_material
from hikcloudstream.stream.sinks.annex_b import write_stream_payloads
lines = []
def log(x): lines.append(x); print(x, flush=True)
code = os.environ["HIK_VERIFY_CODE"]
def ff(data, fmt="h264"):
    open("t.bin", "wb").write(data)
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", fmt, "-i", "t.bin", "-frames:v", "20", "-f", "null", "-"], capture_output=True, text=True)
    n = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=width,height,nb_read_frames", "-of", "csv=p=0", "-f", fmt, "t.bin"], capture_output=True, text=True).stdout.strip()
    return f"probe[{n}] err[{(r.stderr.strip().replace(chr(10), ' | ') or 'none')[:110]}]"
with HikConnectClient() as c:
    c.login(Credentials(os.environ["HIK_EMAIL"], os.environ["HIK_PASSWORD"]))
    cams = c.list_cameras(); devs = {}
    for cam in cams: devs.setdefault(cam.device_serial, []).append(cam)
    for ser, lst in devs.items():
        for cam in [x for x in lst if x.channel_no in (1, 10, 12)]:
            try:
                img = c.capture_snapshot(cam, validate_code=code); log(f"snapshot dev..{ser[-3:]} ch{cam.channel_no}: OK {len(img)}B with the code")
            except Exception as e: log(f"snapshot dev..{ser[-3:]} ch{cam.channel_no}: {type(e).__name__}: {str(e)[:80]}")
    cam = next(x for x in cams if x.channel_no == 1 and x.device_serial.endswith("245"))
    with open_live_stream(c, cam, stream_type=StreamType.AUTO) as s:
        s.start(); buf = io.BytesIO(); tr = write_stream_payloads(s._client, buf, max_packets=None, duration_seconds=6, allow_encrypted=True)
    data = buf.getvalue(); log(f"stream sample {len(data)}B")
    log("A raw: " + ff(data))
    key = aes_key_material(code)
    log("B lib decrypt (header encrypted): " + ff(decrypt_h264_for_ffmpeg(data, code)))
    log("C decrypt header-plain variant: " + ff(decrypt_hikvision_annex_b_video(data, key, nalu_header_size=1)))
print("::notice::KEY PROBE%0A" + "%0A".join(lines))
