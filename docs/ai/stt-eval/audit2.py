"""残りの監査。隔離した city='qa-audit' で検知器とレビューを一通り叩く。"""
from fastapi.testclient import TestClient
from app.main import app
from app.db import (get_conn, detect_management_exceptions, get_management_tasks,
                    resolve_staff_access_profile)
from app.db_ops_review import generate_review, get_review, answer_item, complete_review
from app.security_tokens import issue_access_token
from psycopg2.extras import RealDictCursor
import json

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

print("=== 1. 権限を閉じた後、当番担当は通るか ===")
tok = issue_access_token(staff_name="Richard S. Gante",
                         role=(resolve_staff_access_profile("Richard S. Gante") or {}).get("role") or "STAFF",
                         city="manila")
if isinstance(tok,tuple): tok=tok[0]
H={"Authorization": f"Bearer {tok}"}
r = C.get("/api/store/ops-review?status=open", headers=H)
chk("担当マネージャーは開ける", r.status_code==200, r.status_code)
mine = r.json().get("reviews", []) if r.status_code==200 else []
chk("自分のレビューだけ返る", all(x["assigned_to"]=="Richard S. Gante" for x in mine),
    [(x["branch"], x["assigned_to"]) for x in mine])

pr = resolve_staff_access_profile("Abegail Aguilar") or {}
t2 = issue_access_token(staff_name="Abegail Aguilar", role=pr.get("role") or "STAFF", city="manila")
if isinstance(t2,tuple): t2=t2[0]
H2={"Authorization": f"Bearer {t2}"}
rev = sql("SELECT id FROM ops_reviews ORDER BY id LIMIT 1", one=True)
item = sql("SELECT id FROM ops_review_items WHERE review_id=%s LIMIT 1",(rev["id"],),one=True)
codes = [C.get("/api/store/ops-review?mine=false", headers=H2).status_code,
         C.get(f"/api/store/ops-review/{rev['id']}", headers=H2).status_code,
         C.get(f"/api/store/ops-review/item/{item['id']}/photo", headers=H2).status_code,
         C.post(f"/api/store/ops-review/item/{item['id']}", headers=H2, json={"assessment":"no_issue"}).status_code,
         C.post(f"/api/store/ops-review/{rev['id']}/complete", headers=H2, json={"force":True}).status_code]
chk("一般スタッフは全て403", codes==[403]*5, codes)

print("\n=== 2. バッジは urgent だけ数えるか ===")
b = C.get("/api/store/management/badge", headers=H).json()
print("   ", b)
chk("badge に review が別で入る", "review" in b)

print("\n=== 3. 検知器: 同じ写真を2レーンで二重報告しないか（隔離city）===")
sql("DELETE FROM management_tasks WHERE city='qa-audit'")
day = str(sql("SELECT MAX(score_date) d FROM product_score_results", one=True)["d"])
# 実データを qa-audit に複製して検知を回す
sql("""INSERT INTO product_score_results
         (discord_message_id, channel_id, store_code, branch_code, city, author_id,
          author_name, image_url, score_date, scored_at, total_score, grade, feedback,
          food_category, score_shape, score_size_consistency, score_completion,
          score_topping, score_cut_uniformity, score_arrangement, score_portioning)
       SELECT 'qa-'||id, '0', 'QA', 'QA', 'qa-audit', '0', 'QA Bot', '', %s::date, NOW(),
              total_score, grade, feedback, food_category, 5,5,5,5,5,5,5
         FROM product_score_results
        WHERE grade IN ('C','D','F') AND score_date = %s::date LIMIT 6""", (day, day))
n_seed = sql("SELECT COUNT(*) n, COUNT(*) FILTER (WHERE grade='C') c, COUNT(*) FILTER (WHERE grade IN ('D','F')) df FROM product_score_results WHERE city='qa-audit'", one=True)
print("   複製:", n_seed)

r1 = detect_management_exceptions("qa-audit", day)
t1 = [t for t in get_management_tasks(city="qa-audit", limit=50)]
by = {}
for t in t1: by[t["type"]] = by.get(t["type"],0)+1
print("   1回目:", by, "| lanes:", {t["type"]: t["lane"] for t in t1})
r2 = detect_management_exceptions("qa-audit", day)
t2s = [t for t in get_management_tasks(city="qa-audit", limit=50)]
chk("2回目で増えない", len(t2s)==len(t1), (len(t1), len(t2s)))
ids_c = set(); ids_d = set()
for t in t2s:
    (ids_c if t["type"]=="product_score_c" else ids_d).update((t["context"] or {}).get("score_ids") or [])
chk("同じ写真が両レーンに入らない", not (ids_c & ids_d), sorted(ids_c & ids_d)[:5])
chk("C は review レーン", all(t["lane"]=="review" for t in t2s if t["type"]=="product_score_c"))
chk("D/F は urgent レーン", all(t["lane"]=="urgent" for t in t2s if t["type"]=="product_score_d"))
chk("D/F タスクは red", all(t["severity"]=="red" for t in t2s if t["type"]=="product_score_d"))

print("\n=== 4. レビュー: サマリの内訳と合計が一致するか ===")
rv = generate_review("qa-audit", "QA", day)
d = get_review(rv["review_id"])
q = d["summary"]["quality"]
chk("A+B+C+D+F+S = graded", sum(q["grades"].values()) == q["graded"], (q["grades"], q["graded"]))
chk("below_c = C+D+F", q["below_c"] == q["grades"]["c"]+q["grades"]["d"]+q["grades"]["f"])
chk("item 数 = below_c", len([i for i in d["items"] if i["kind"]=="quality"]) == q["below_c"])
chk("issue_rate が graded 基準", abs(q["issue_rate"] - q["below_c"]/q["graded"]*100) < 0.06, q["issue_rate"])

print("\n=== 5. 回答のバリデーション ===")
it = [i for i in d["items"] if i["kind"]=="quality"][0]
for label, body, want_ok in [
    ("未知の assessment", {"assessment":"totally_fine"}, False),
    ("未知の issue_type", {"assessment":"minor","issue_type":["nope"],"root_cause":["training"],"action_taken":["none"]}, False),
    ("prep の原因を quality に混ぜる", {"assessment":"minor","issue_type":["portion"],"root_cause":["too_many"],"action_taken":["none"]}, False),
    ("正常な minor", {"assessment":"minor","issue_type":["portion"],"root_cause":["training"],"action_taken":["none"]}, True),
]:
    try:
        answer_item(it["id"], body, who="QA"); ok=True; msg=""
    except ValueError as e:
        ok=False; msg=str(e)
    chk(label, ok==want_ok, msg or "通った")

print("\n=== 6. 完了・再開 ===")
out = complete_review(rv["review_id"], who="QA")
chk("未回答があれば拒否", out["ok"] is False, out)
for i in d["items"]:
    answer_item(i["id"], {"assessment":"no_issue"} if i["kind"]=="quality"
                else {"kind":"prep_time","root_cause":["too_many"],"action_taken":["none"]}, who="QA")
out = complete_review(rv["review_id"], who="QA", comment="audit")
chk("全部答えれば完了", out["ok"] is True, out)
out2 = complete_review(rv["review_id"], who="QA")
chk("二重完了は拒否", out2["ok"] is False, out2)

print("\n=== 後始末 ===")
sql("DELETE FROM ops_review_items WHERE review_id=%s",(rv["review_id"],))
sql("DELETE FROM ops_reviews WHERE id=%s",(rv["review_id"],))
sql("DELETE FROM management_tasks WHERE city='qa-audit'")
sql("DELETE FROM product_score_results WHERE city='qa-audit'")
chk("qa-audit 残骸なし",
    sql("SELECT COUNT(*) n FROM product_score_results WHERE city='qa-audit'",one=True)["n"]==0
    and sql("SELECT COUNT(*) n FROM management_tasks WHERE city='qa-audit'",one=True)["n"]==0)
print("\nTOTAL FAILURES:", len(fails), fails)
