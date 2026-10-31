"""Reference test: record a few seconds of live video from the first cameras using the community library, then check it decodes."""
import os, subprocess, time
from pathlib import Path
from hikcloudstream import Credentials, HikConnectClient
from hikcloudstream.models import StreamType
from hikcloudstream.stream import open_live_stream

lines = []
def log(x): lines.append(x); print(x, flush=True)
with HikConnectClient() as c:
    c.login(Credentials(os.environ["HIK_EMAIL"], os.environ["HIK_PASSWORD"]))
    cams = c.list_cameras()
    log(f"login ok, {len(cams)} cameras on the account")
    for cam in cams[: int(os.environ.get("N", "3"))]:
        path = Path(f"ref_{cam.index}.h264"); n = 0; err = ""
        t0 = time.time()
        try:
            with open_live_stream(c, cam, stream_type=StreamType.AUTO) as s:
                s.start()
                with open(path, "wb") as f:
                    for chunk in s.iter_annex_b_chunks(duration_seconds=8):
                        f.write(chunk); n += len(chunk)
        except Exception as e:
            err = f"{type(e).__name__}: {str(e)[:120]}"
        info = ""
        if n:
            r = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,nb_read_frames", "-of", "csv=p=0", str(path)], capture_output=True, text=True)
            info = (r.stdout or r.stderr).strip()[:120]
        log(f"camera #{cam.index} ch{cam.channel_no}: {n} bytes in {time.time()-t0:.1f}s; ffprobe={info or '-'} {err}")
        path.unlink(missing_ok=True)
print("::notice::REFERENCE STREAM TEST%0A" + "%0A".join(lines))
