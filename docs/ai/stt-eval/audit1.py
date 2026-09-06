"""自分の実装を疑う。まず「誰が触れるか」を実測する。"""
from fastapi.testclient import TestClient
from app.main import app
from app.db import get_conn, resolve_staff_access_profile
from app.security_tokens import issue_access_token
from psycopg2.extras import RealDictCursor
C=TestClient(app)
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)

print("=== 当番表の担当者が持つロールと権限 ===")
cur.execute("SELECT DISTINCT city, staff_name FROM management_owner_roster ORDER BY 1,2")
owners=[(r["city"], r["staff_name"]) for r in cur.fetchall()]
for city, n in owners:
    p = resolve_staff_access_profile(n) or {}
    perms = list(p.get("permissions") or [])
    has = ("channel.store.management_review.view" in perms or "*" in perms
           or str(p.get("role") or "").upper() in ("HQ","ADMIN"))
    print(f"   {city:7s} {n:22s} role={str(p.get('role')):20s} review権限={has}")

print("\n=== 一般スタッフが他人のレビューを触れるか ===")
cur.execute("SELECT id, city, branch, assigned_to FROM ops_reviews ORDER BY id LIMIT 1")
rev = dict(cur.fetchone())
cur.execute("SELECT id FROM ops_review_items WHERE review_id=%s LIMIT 1", (rev["id"],))
item = dict(cur.fetchone())
print("   対象:", rev)

pr = resolve_staff_access_profile("Abegail Aguilar") or {}
tok = issue_access_token(staff_name="Abegail Aguilar", role=pr.get("role") or "STAFF", city="manila")
if isinstance(tok,tuple): tok=tok[0]
H={"Authorization": f"Bearer {tok}"}
for label, fn in [
    ("一覧(mine=false)", lambda: C.get("/api/store/ops-review?mine=false&status=open", headers=H)),
    ("他人のレビューを開く", lambda: C.get(f"/api/store/ops-review/{rev['id']}", headers=H)),
    ("他人の写真を見る", lambda: C.get(f"/api/store/ops-review/item/{item['id']}/photo", headers=H)),
    ("他人の項目に回答", lambda: C.post(f"/api/store/ops-review/item/{item['id']}",
                                         headers=H, json={"assessment":"no_issue"})),
    ("他人のレビューを完了", lambda: C.post(f"/api/store/ops-review/{rev['id']}/complete",
                                             headers=H, json={"force":True})),
]:
    r = fn()
    print(f"   {label:22s} -> {r.status_code}"
          + ("  ⚠️ 通ってしまう" if r.status_code in (200,409) else ""))

print("\n=== バッジは review レーンを除外しているか ===")
cur.execute("""SELECT manager_name, COALESCE(lane,'urgent') lane, COUNT(*) n
                 FROM management_tasks WHERE status='sent' AND response IS NULL
                GROUP BY 1,2 ORDER BY 1,2""")
for r in cur.fetchall(): print("  ", dict(r))
c.close()
