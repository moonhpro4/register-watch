import os, subprocess
from hikcloudstream import Credentials, HikConnectClient
from hikcloudstream.models import StreamType
from hikcloudstream.stream import open_live_stream
from hikcloudstream.stream.crypto import decrypt_hikvision_annex_b_video
from hikcloudstream.capture import aes_key_material
from pyezvizapi.stream import rtp_payload
import time
SC = b"\x00\x00\x00\x01"
lines = []
def log(x): lines.append(x); print(x, flush=True)
def hevc_depay(payload, st):
    """RFC 7798: single NAL, aggregation (48), fragmentation (49)."""
    if len(payload) < 3: return b""
    t = (payload[0] >> 1) & 0x3F
    if t == 49:
        fu = payload[2]; ft = fu & 0x3F
        if fu & 0x80: return SC + bytes([(payload[0] & 0x81) | (ft << 1), payload[1]]) + payload[3:]
        return payload[3:]
    if t == 48:
        out = b""; i = 2
        while i + 2 <= len(payload):
            n = int.from_bytes(payload[i:i+2], "big"); i += 2; out += SC + payload[i:i+n]; i += n
        return out
    if t <= 47: return SC + payload
    return b""
def ff(data):
    open("t.hevc", "wb").write(data)
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "hevc", "-i", "t.hevc", "-frames:v", "30", "-f", "null", "-"], capture_output=True, text=True)
    n = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,nb_read_frames", "-of", "csv=p=0", "-f", "hevc", "t.hevc"], capture_output=True, text=True).stdout.strip()
    return f"probe[{n}] err[{(r.stderr.strip().replace(chr(10), ' | ') or 'none')[:120]}]"
code = os.environ["HIK_VERIFY_CODE"]
with HikConnectClient() as c:
    c.login(Credentials(os.environ["HIK_EMAIL"], os.environ["HIK_PASSWORD"]))
    cams = c.list_cameras()
    for ch in (1, 10, 12):
        cam = next(x for x in cams if x.channel_no == ch and x.device_serial.endswith("245"))
        buf = bytearray(); t0 = time.time()
        try:
            with open_live_stream(c, cam, stream_type=StreamType.AUTO) as s:
                s.start()
                for pkt in s._client.iter_packets(max_packets=None):
                    b = pkt.body
                    if len(b) > 12 and (b[1] & 0x7F) == 96: buf += hevc_depay(rtp_payload(b), None)
                    if time.time() - t0 > 6: break
        except Exception as e:
            log(f"ch{ch}: {type(e).__name__}: {str(e)[:80]}"); continue
        data = bytes(buf)
        log(f"ch{ch}: {len(data)}B hevc annex-b")
        log("  A raw       : " + ff(data))
        log("  B decrypted : " + ff(decrypt_hikvision_annex_b_video(data, aes_key_material(code), nalu_header_size=2)))
print("::notice::HEVC PROBE%0A" + "%0A".join(lines))
