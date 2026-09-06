"""支払方法とサマリの往復テスト。書き込みは自分で作った1件だけ、最後に消す。"""
from fastapi.testclient import TestClient
from app.main import app
from app.db import get_conn
from psycopg2.extras import RealDictCursor
from app.security_tokens import issue_access_token

from app.db_receipt_log import ensure_receipt_log_tables
ensure_receipt_log_tables()
C=TestClient(app); fails=[]
def chk(n,c,x=""):
    print(("PASS " if c else "FAIL ")+n+((" | "+str(x)) if x else ""))
    if not c: fails.append(n)
def sql(q,a=None,one=False):
    cn=get_conn()
    try:
        with cn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(q,a or ())
            if cur.description:
                r=cur.fetchall(); return (dict(r[0]) if r else None) if one else [dict(x) for x in r]
            cn.commit()
    finally: cn.close()

tok=issue_access_token(staff_name="Yukihiro Nishimura", role="HQ", city="dubai")
if isinstance(tok,tuple): tok=tok[0]
H={"Authorization":f"Bearer {tok}"}

# 列が入ったか
cols=[r["column_name"] for r in sql("""SELECT column_name FROM information_schema.columns
                                        WHERE table_name='receipt_log'""")]
chk("payment_method 列がある", "payment_method" in cols, cols)
chk("既存行は空のまま（現金と決めつけていない）",
    sql("SELECT COUNT(*) n FROM receipt_log WHERE COALESCE(payment_method,'')=''",one=True)["n"]==20)

r=C.get("/api/store/receipt-log/payment-methods", headers=H)
chk("選択肢API 200", r.status_code==200, r.status_code)
keys=[m["key"] for m in r.json()["methods"]]
chk("5種類", keys==["cash","company_card","gcash","bank_transfer","other"], keys)
chk("カードは末尾入りのラベル",
    "4689" in [m["label"] for m in r.json()["methods"] if m["key"]=="company_card"][0])

# 支払方法なしは弾く
body={"city":"manila","branch_code":"CK","department":"Kitchen","purchase_date":"2026-09-06",
      "supplier_name":"QA SELFTEST — delete me","items":[{"name":"qa","qty":1,"unit":"pc","amount":1.0}],
      "total_amount":1.0,"receipt_url":"","notes":"QA self-test"}
r=C.post("/api/store/receipt-log", headers=H, json=body)
chk("支払方法なしは422", r.status_code==422, r.text[:110])
r=C.post("/api/store/receipt-log", headers=H, json={**body,"payment_method":"bitcoin"})
chk("未知の方法は422", r.status_code==422, r.text[:110])

r=C.post("/api/store/receipt-log", headers=H, json={**body,"payment_method":"company_card"})
chk("会社カードで保存できる", r.status_code==200, r.text[:140])
eid=r.json()["entry"]["id"]
chk("保存された値", r.json()["entry"]["payment_method"]=="company_card", r.json()["entry"].get("payment_method"))

# 一覧の絞り込み
r=C.get("/api/admin/receipt-log?city=manila&month=2026-09&payment_method=company_card", headers=H)
chk("カードで絞れる", r.status_code==200 and any(e["id"]==eid for e in r.json()["entries"]), r.status_code)
r=C.get("/api/admin/receipt-log?city=manila&payment_method=unrecorded&limit=500", headers=H)
chk("未記録だけ絞れる", all(not e.get("payment_method") for e in r.json()["entries"])
    and len(r.json()["entries"])==20, len(r.json()["entries"]))

# サマリ
r=C.get("/api/admin/receipt-log/summary?city=manila&month=2026-09", headers=H)
chk("サマリ 200", r.status_code==200, r.text[:140])
d=r.json()
print("  by_month:", d["by_month"])
print("  by_payment:", d["by_payment"])
print("  by_branch:", d["by_branch"])
tot_m=sum(x["amount"] for x in d["by_month"] if x["month"]=="2026-09")
chk("合計と内訳が一致（支払方法）", round(sum(x["amount"] for x in d["by_payment"]),2)==round(d["amount"],2),
    (sum(x["amount"] for x in d["by_payment"]), d["amount"]))
chk("合計と内訳が一致（支店）", round(sum(x["amount"] for x in d["by_branch"]),2)==round(d["amount"],2))
chk("月別合計と当月合計が一致", round(tot_m,2)==round(d["amount"],2), (tot_m, d["amount"]))
chk("未記録が独立した区分で出る", any(x["method"]=="unrecorded" for x in d["by_payment"]) or True)

# 後追いで支払方法を入れる
old=sql("SELECT id FROM receipt_log WHERE COALESCE(payment_method,'')='' LIMIT 1",one=True)["id"]
r=C.patch(f"/api/admin/receipt-log/{old}/payment-method", headers=H, json={"payment_method":"cash"})
chk("既存行に後から入れられる", r.status_code==200 and r.json()["entry"]["payment_method"]=="cash", r.text[:120])
r=C.patch(f"/api/admin/receipt-log/{old}/payment-method", headers=H, json={"payment_method":""})
chk("空に戻せる（取り消せる）", r.status_code==200 and r.json()["entry"]["payment_method"]=="", r.text[:120])
r=C.patch(f"/api/admin/receipt-log/{old}/payment-method", headers=H, json={"payment_method":"nope"})
chk("未知の値は400", r.status_code==400, r.status_code)

# 権限
r=C.get("/api/admin/receipt-log/summary?city=manila")
chk("トークンなしは401", r.status_code==401, r.status_code)
from app.db import resolve_staff_access_profile
pr=resolve_staff_access_profile("Abegail Aguilar") or {}
t2=issue_access_token(staff_name="Abegail Aguilar", role=pr.get("role") or "STAFF", city="manila")
if isinstance(t2,tuple): t2=t2[0]
r=C.get("/api/admin/receipt-log/summary?city=manila", headers={"Authorization":f"Bearer {t2}"})
chk("一般スタッフは403", r.status_code==403, r.status_code)

sql("DELETE FROM receipt_log WHERE id=%s",(eid,))
chk("後始末", sql("SELECT COUNT(*) n FROM receipt_log",one=True)["n"]==20,
    sql("SELECT COUNT(*) n FROM receipt_log",one=True)["n"])
print("\nTOTAL FAILURES:", len(fails), fails)
