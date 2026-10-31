import io, json, os, urllib.request
from PIL import Image, ImageDraw
W, H = 640, 360
SKIN, MONEY = (224, 172, 140), (80, 170, 90)
os.makedirs("scenes", exist_ok=True)

def base():
    im = Image.new("RGB", (W, H), (205, 200, 190)); d = ImageDraw.Draw(im)
    d.rectangle((0, 200, W, H), fill=(120, 110, 100)); d.rectangle((0, 215, W, 265), fill=(150, 100, 60)); d.rectangle((0, 265, W, H), fill=(110, 75, 45))
    return im, d
def register(d, drawer=False, cash=0):
    d.rectangle((282, 150, 435, 222), fill=(50, 55, 60)); d.rectangle((300, 158, 370, 185), fill=(110, 200, 150))
    d.rectangle((282, 222, 435, 232), fill=(40, 40, 45))
    if drawer:
        d.rectangle((290, 226, 428, 250), fill=(185, 185, 190))
        for i in range(cash): d.rectangle((296 + i * 22, 232, 314 + i * 22, 244), fill=MONEY)
def person(d, x, shirt, top=95):
    d.ellipse((x - 22, top, x + 22, top + 44), fill=SKIN); d.rectangle((x - 32, top + 48, x + 32, 214), fill=shirt)
def arm(d, x, y, hx, hy, bill=False):
    d.line((x, y, hx, hy), fill=SKIN, width=13); d.ellipse((hx - 9, hy - 9, hx + 9, hy + 9), fill=SKIN)
    if bill: d.rectangle((hx - 14, hy - 8, hx + 14, hy + 6), fill=MONEY)

def scenes():
    out = {}
    im, d = base(); register(d); out["none_empty"] = im
    im, d = base(); person(d, 150, (60, 90, 170)); person(d, 500, (170, 60, 60)); register(d)
    arm(d, 160, 150, 262, 228, bill=True); arm(d, 490, 150, 440, 205); out["none_customer_paying"] = im
    im, d = base(); person(d, 150, (60, 90, 170)); person(d, 500, (170, 60, 60)); register(d, drawer=True, cash=5)
    arm(d, 490, 150, 400, 238); arm(d, 160, 150, 262, 228); out["none_giving_change"] = im
    im, d = base(); person(d, 500, (30, 30, 30)); register(d, drawer=True, cash=2)
    arm(d, 490, 150, 400, 236, bill=True); arm(d, 510, 160, 470, 120, bill=True); out["theft_grabbing_cash"] = im
    im, d = base(); person(d, 500, (30, 30, 30)); register(d, drawer=True, cash=1)
    d.rectangle((520, 175, 548, 205), fill=(20, 20, 20)); arm(d, 490, 150, 400, 236)
    arm(d, 515, 160, 536, 190, bill=True); out["theft_into_pocket"] = im
    im, d = base(); person(d, 360, (90, 90, 90)); register(d); d.rectangle((262, 128, 452, 250), fill=(25, 25, 30)); out["blocked_by_cloth"] = im
    im, d = base(); register(d); d.rectangle((255, 120, 460, 262), fill=(176, 130, 80), outline=(120, 85, 50), width=4); out["blocked_by_box"] = im
    return out

def seq_frames(paid):
    fr = []
    def bag(d, x, y): d.rectangle((x - 16, y - 14, x + 16, y + 18), fill=(200, 160, 80), outline=(120, 90, 40), width=2)
    # 1 customer approaches
    im, d = base(); person(d, 150, (60, 90, 170)); person(d, 500, (170, 60, 60)); register(d)
    arm(d, 160, 150, 200, 200, bill=paid); arm(d, 490, 150, 440, 205); fr.append(im)
    # 2 payment (or nothing) at the counter
    im, d = base(); person(d, 190, (60, 90, 170)); person(d, 500, (170, 60, 60)); register(d, drawer=paid, cash=3 if paid else 0)
    arm(d, 200, 150, 300, 228, bill=paid); arm(d, 490, 150, 400 if paid else 440, 236 if paid else 205); fr.append(im)
    # 3 employee hands over the bag
    im, d = base(); person(d, 230, (60, 90, 170)); person(d, 500, (170, 60, 60)); register(d)
    arm(d, 490, 150, 330, 215); bag(d, 330, 205); arm(d, 240, 150, 320, 215); fr.append(im)
    # 4 customer leaves with the bag
    im, d = base(); person(d, 90, (60, 90, 170)); person(d, 500, (170, 60, 60)); register(d)
    arm(d, 100, 150, 130, 200); bag(d, 130, 205); arm(d, 490, 150, 440, 205); fr.append(im)
    return fr
import base64
for name, paid, want in (("seq_unpaid", False, "unpaid"), ("seq_paid_cash", True, "ok")):
    frames = seq_frames(paid)
    for i, im in enumerate(frames): im.save(f"scenes/{name}_{i}.jpg", quality=85)
    imgs = []
    for im in frames:
        b = io.BytesIO(); im.save(b, "JPEG", quality=85); imgs.append(base64.b64encode(b.getvalue()).decode())
    req = urllib.request.Request(os.environ["BASE"] + "/api/analyze-seq", data=json.dumps({"images": imgs, "x": 44, "y": 40, "w": 24, "h": 26, "via": os.environ.get("VIA") or None}).encode(), method="POST",
        headers={"authorization": "Bearer " + os.environ["KEY"], "content-type": "application/json", "user-agent": "Mozilla/5.0 ShadiCamTest"})
    try: r = json.load(urllib.request.urlopen(req, timeout=120))
    except Exception as e: r = {"error": str(e)[:120]}
    pv = r.get("parsed") or {}; ev = pv.get("event", "?"); cf = pv.get("confidence", 0)
    got = "unpaid" if (ev == "unpaid" and (cf or 0) >= 0.6) else "ok"
    ok = "ERROR" if ("error" in r or not pv) else ("PASS" if got == want else "MISS")
    SEQ = globals().setdefault("SEQ", []); SEQ.append(f"{ok} {name}: expected {want}, AI said {ev} ({cf}) - {str(pv.get('note', r.get('error', r.get('raw', ''))))[:110]}")

res = []
for name, im in scenes().items():
    im.save(f"scenes/{name}.jpg", quality=85); buf = io.BytesIO(); im.save(buf, "JPEG", quality=85)
    req = urllib.request.Request(os.environ["BASE"] + "/api/analyze?x=44&y=40&w=24&h=26" + ("&via=" + os.environ["VIA"] if os.environ.get("VIA") else ""), data=buf.getvalue(), method="POST",
        headers={"authorization": "Bearer " + os.environ["KEY"], "content-type": "image/jpeg", "user-agent": "Mozilla/5.0 ShadiCamTest"})
    try: r = json.load(urllib.request.urlopen(req, timeout=90))
    except Exception as e: r = {"error": str(e)[:120]}
    pv = r.get("parsed") or {}; ev = pv.get("event", "?"); cf = pv.get("confidence", 0)
    want = name.split("_")[0]
    alert = ev in ("theft", "blocked") and (cf or 0) >= 0.6
    got = ev if alert else "none"
    ok = "ERROR" if ("error" in r or not pv) else ("PASS" if got == want else "MISS")
    res.append(f"{ok} {name}: expected {want}, AI said {ev} ({cf}) - {str(pv.get('note', r.get('error', r.get('raw', ''))))[:110]}")
res += globals().get("SEQ", [])
msg = "%0A".join(res)
print("::notice::AI scene test [" + os.environ.get("VIA", "default routing") + "]%0A" + msg)
print("\n".join(res))
