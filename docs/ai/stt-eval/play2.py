"""Range が Heroku 直・Vercel 経由の両方で効いているか。"""
from fastapi.testclient import TestClient
from app.main import app
from app.security_tokens import issue_access_token
import urllib.request, time
C=TestClient(app)
tok = issue_access_token(staff_name="Yukihiro Nishimura", role="HQ", city="dubai")
if isinstance(tok,tuple): tok=tok[0]
H={"Authorization": f"Bearer {tok}"}
path="/api/admin/hr/voice-screenings/9/answers/1/audio"

print("=== Heroku 直 ===")
r=C.get(path, headers=H)
print("  200:", r.status_code, "| length:", r.headers.get("content-length"),
      "| accept-ranges:", r.headers.get("accept-ranges"),
      "| cache:", r.headers.get("cache-control"))
r2=C.get(path, headers={**H,"Range":"bytes=0-1023"})
print("  Range:", r2.status_code, "| content-range:", r2.headers.get("content-range"),
      "| bytes:", len(r2.content))
r3=C.get(path, headers={**H,"Range":"bytes=99999999-"})
print("  範囲外:", r3.status_code, "(416 が正しい)")

print("\n=== Vercel プロキシ経由（デプロイ待ち）===")
url="https://sushizen-shift-pwa.vercel.app"+path
for i in range(14):
    try:
        req=urllib.request.Request(url, headers={**H,"Range":"bytes=0-1023"})
        with urllib.request.urlopen(req, timeout=45) as resp:
            code=resp.getcode()
            cr=resp.headers.get("content-range"); n=len(resp.read())
    except urllib.error.HTTPError as e:
        code=e.code; cr=e.headers.get("content-range"); n=len(e.read())
    print(f"  attempt {i+1}: status={code} content-range={cr} bytes={n}")
    if code==206 and cr: break
    time.sleep(25)
req=urllib.request.Request(url, headers=H)
with urllib.request.urlopen(req, timeout=45) as resp:
    print("  通常GET: length:", resp.headers.get("content-length"),
          "| accept-ranges:", resp.headers.get("accept-ranges"),
          "| cache:", resp.headers.get("cache-control"),
          "| type:", resp.headers.get("content-type"))
