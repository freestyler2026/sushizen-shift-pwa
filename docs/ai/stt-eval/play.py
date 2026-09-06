"""再生できない原因を、Heroku 直と Vercel プロキシ経由の両方で確かめる。
トークンは dyno の外に出さない。"""
from fastapi.testclient import TestClient
from app.main import app
from app.security_tokens import issue_access_token
import urllib.request

C=TestClient(app)
tok = issue_access_token(staff_name="Yukihiro Nishimura", role="HQ", city="dubai")
if isinstance(tok,tuple): tok=tok[0]
H={"Authorization": f"Bearer {tok}"}
path = "/api/admin/hr/voice-screenings/9/answers/1/audio"

print("=== Heroku 直（プロキシを通さない）===")
r = C.get(path, headers=H)
print("  status:", r.status_code)
print("  content-type:", r.headers.get("content-type"))
print("  content-length:", r.headers.get("content-length"), "/ 実バイト:", len(r.content))
print("  accept-ranges:", r.headers.get("accept-ranges"))
print("  先頭:", r.content[:8].hex(" "))

print("\n=== Range リクエスト（Safari が必ず使う）===")
r2 = C.get(path, headers={**H, "Range": "bytes=0-1023"})
print("  status:", r2.status_code, "(206 でないと Safari は再生しない)")
print("  content-range:", r2.headers.get("content-range"))
print("  返ったバイト数:", len(r2.content))

print("\n=== Vercel プロキシ経由 ===")
url = "https://sushizen-shift-pwa.vercel.app" + path
req = urllib.request.Request(url, headers=H)
try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = resp.read()
        print("  status:", resp.getcode())
        print("  content-type:", resp.headers.get("content-type"))
        print("  content-length:", resp.headers.get("content-length"), "/ 実バイト:", len(body))
        print("  先頭:", body[:8].hex(" "))
        print("  Heroku と同一バイト:", body == r.content)
except Exception as e:
    print("  失敗:", e)
