#!/usr/bin/env bash
# Live test against the deployed Worker. Needs BASE and KEY.
set -u; B="$BASE"; K="$KEY"; fail=0
ok(){ echo "::notice::PASS $1"; }; bad(){ echo "::error::FAIL $1"; fail=1; }
chk(){ [ "$2" = "$3" ] && ok "$1" || bad "$1 (got $2, expected $3)"; }
pip install pillow -q 2>/dev/null
python3 - <<'EOF'
from PIL import Image, ImageDraw
im=Image.new("RGB",(640,360),(60,70,80)); d=ImageDraw.Draw(im)
d.rectangle((0,230,640,360),fill=(74,90,104)); d.rectangle((300,150,440,240),fill=(30,37,45),outline=(126,143,157),width=3); im.save("test.jpg",quality=80)
EOF
H=(-H "authorization: Bearer $K" -H "content-type: application/json")
for i in $(seq 1 25); do c=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/cameras"); [ "$c" = 401 ] && break; sleep 4; done
chk "request without the app key is rejected" "$c" 401
r=$(curl -s -X POST "${H[@]}" "$B/api/cameras" -d '{"store":"TEST","name":"smoke"}')
ID=$(echo "$r"|python3 -c "import sys,json;print(json.load(sys.stdin)['id'])" 2>/dev/null); UP=$(echo "$r"|python3 -c "import sys,json;print(json.load(sys.stdin)['uploadUrl'])" 2>/dev/null)
[ -n "$ID" ] && ok "camera created" || { bad "camera create: $r"; exit 1; }
ver(){ curl -s "${H[@]}" "$B/api/cameras" | python3 -c "import sys,json;print([c for c in json.load(sys.stdin) if c['id']=='$ID'][0]['verified'])"; }
chk "new camera starts unverified" "$(ver)" False
chk "non-image upload rejected" "$(echo hello | curl -s -o /dev/null -w '%{http_code}' -X POST --data-binary @- "$UP")" 400
chk "wrong token rejected" "$(curl -s -o /dev/null -w '%{http_code}' -X POST --data-binary @test.jpg "${UP%token=*}token=nope")" 401
chk "real picture accepted" "$(curl -s -o /dev/null -w '%{http_code}' -X POST --data-binary @test.jpg "$UP")" 200
chk "camera becomes verified after first picture" "$(ver)" True
chk "latest picture served" "$(curl -s -o /dev/null -w '%{http_code}' "${H[@]}" "$B/api/cameras/$ID/latest")" 200
fr=$(curl -s -w ' HTTP %{http_code}' -X POST "${H[@]}" "$B/api/cameras/$ID/find-register"); echo "::notice::AI find-register -> $fr"
case "$fr" in *"HTTP 200") ok "Gemma vision call works";; *) bad "Gemma vision call: $fr";; esac
curl -s -X PUT "${H[@]}" "$B/api/cameras/$ID/zone" -d '{"zone":{"x":46,"y":40,"w":22,"h":26}}' >/dev/null
sleep 11; curl -s -o /dev/null -X POST --data-binary @test.jpg "$UP"
chk "empty scene raises no alert" "$(curl -s "${H[@]}" "$B/api/events?since=0" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")" 0
sh=$(curl -s "${H[@]}" "$B/api/cameras/$ID/shifts"); echo "::notice::shifts -> $sh"
SID=$(echo "$sh"|python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])" 2>/dev/null)
fl=$(curl -s "${H[@]}" "$B/api/shifts/$SID/frames"); TS=$(echo "$fl"|python3 -c "import sys,json;print(json.load(sys.stdin)[0])" 2>/dev/null)
[ -n "$TS" ] && ok "24h recording saved frames to R2 ($fl)" || bad "no frames: $fl"
chk "recorded frame playable" "$(curl -s -o /dev/null -w '%{http_code}' "${H[@]}" "$B/api/shifts/$SID/frame/$TS")" 200
curl -s -X DELETE "${H[@]}" "$B/api/cameras/$ID" >/dev/null && ok "test camera cleaned up"
exit $fail
