"""前日レビューの往復テスト。本番データから生成し、最後に自分が作った分だけ削除。"""
from app.db_ops_review import (ensure_ops_review_tables, generate_review, get_review,
                               answer_item, complete_review, reopen_review, list_reviews,
                               generate_for_city)
from app.db import get_conn
from psycopg2.extras import RealDictCursor
import json

fails=[]
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

ensure_ops_review_tables()
DAY="2026-09-05"

print("=== 生成（TAFT・実データ）===")
r = generate_review("manila", "TAFT", DAY)
print("  ", {k:v for k,v in r.items() if k!="assigned_to"}, "| 担当:", r.get("assigned_to"))
chk("作成された", r.get("created") and r.get("review_id"))
rid = r["review_id"]

d = get_review(rid)
s = d["summary"]
print("\n  Quality:", s["quality"])
print("  Prep   :", s["prep"])
print("  Backup :", s["backup"], " Rush:", s["rush"], " Disposal:", s["disposal"])
chk("写真枚数が実データと一致",
    s["quality"]["photos"] == sql("""SELECT COUNT(*) n FROM product_score_results
        WHERE city='manila' AND score_date=%s::date AND UPPER(branch_code)='TAFT'""",(DAY,),one=True)["n"],
    s["quality"]["photos"])
chk("マニラは prep 計測可", s["prep"]["measurable"] is True)
chk("C/D/F の件数と items 数が一致",
    len([i for i in d["items"] if i["kind"]=="quality"]) == s["quality"]["below_c"],
    (len([i for i in d["items"] if i["kind"]=="quality"]), s["quality"]["below_c"]))
chk("prep item は閾値超のみ",
    all(i["payload"]["prep_minutes"] > s["prep"]["threshold"]
        for i in d["items"] if i["kind"]=="prep_time"))
chk("画像そのものは payload に入っていない",
    all("image" not in json.dumps(i["payload"]) for i in d["items"]))

print("\n=== CUBAO / CUB の名寄せ ===")
r2 = generate_review("manila", "CUBAO", DAY)   # 表記ゆれで呼んでも CUB に寄る
chk("CUBAO で呼んでも branch は CUB", r2.get("branch")=="CUB", r2.get("branch"))
if r2.get("review_id"):
    d2 = get_review(r2["review_id"])
    chk("Cubao のレビューが空でない", d2["summary"]["quality"]["photos"] > 0,
        d2["summary"]["quality"]["photos"])

print("\n=== ドバイは prep を出さない ===")
r3 = generate_review("dubai", "BB", DAY)
if r3.get("review_id"):
    d3 = get_review(r3["review_id"])
    chk("dubai は measurable=False", d3["summary"]["prep"]["measurable"] is False)
    chk("理由が書いてある", "20-minute" in (d3["summary"]["prep"].get("reason") or ""))
    chk("prep item は0件", len([i for i in d3["items"] if i["kind"]=="prep_time"])==0)

print("\n=== 1タップ判定 ===")
q = [i for i in d["items"] if i["kind"]=="quality"]
chk("quality item がある", len(q)>0, len(q))
a = answer_item(q[0]["id"], {"assessment":"no_issue"}, who="QA Tester")
chk("『問題なし』は1タップで確定", a["ok"] and a["answer"]["assessment"]=="no_issue")
chk("追加3問は空のまま", a["answer"]["issue_type"]==[] and a["answer"]["root_cause"]==[])
try:
    answer_item(q[0]["id"], {"assessment":"critical"}, who="QA")
    chk("重大なのに理由なしを拒否", False)
except ValueError as e:
    chk("重大なのに理由なしを拒否", True, str(e))
a2 = answer_item(q[0]["id"], {"assessment":"critical","issue_type":["presentation"],
                              "root_cause":["training"],"action_taken":["individual"],
                              "staff":["Juan Dela Cruz"]}, who="QA Tester")
chk("重大は4項目そろえば保存", a2["ok"] and a2["answer"]["staff"]==["Juan Dela Cruz"])
try:
    answer_item(q[0]["id"], {"assessment":"minor","issue_type":["other"],
                             "root_cause":["training"],"action_taken":["none"]}, who="QA")
    chk("Other にメモ必須", False)
except ValueError as e:
    chk("Other にメモ必須", True, str(e))
answer_item(q[0]["id"], {}, who="QA Tester")
it = sql("SELECT answer, answered_by, answered_at FROM ops_review_items WHERE id=%s",(q[0]["id"],),one=True)
chk("取り消すと痕跡が残らない", all(it[k] is None for k in ("answer","answered_by","answered_at")), it)

print("\n=== 未回答のまま Complete は拒否 ===")
out = complete_review(rid, who="QA Tester")
chk("拒否して残数を言う", out["ok"] is False and out["remaining"]>0, out)
for i in q:
    answer_item(i["id"], {"assessment":"no_issue"}, who="QA Tester")
for i in [x for x in d["items"] if x["kind"]=="prep_time"]:
    answer_item(i["id"], {"kind":"prep_time","root_cause":["too_many"],
                          "action_taken":["allocation"]}, who="QA Tester")
out = complete_review(rid, who="QA Tester", comment="QA self-test")
chk("全部答えれば完了", out["ok"] is True, out)
chk("完了後は open 一覧から消える",
    not any(x["id"]==rid for x in list_reviews(city="manila", status="open")))
reopen_review(rid)
chk("再開できる", sql("SELECT status FROM ops_reviews WHERE id=%s",(rid,),one=True)["status"]=="open")

print("\n=== 生成は冪等・回答を壊さない ===")
answer_item(q[0]["id"], {"assessment":"minor","issue_type":["portion"],
                         "root_cause":["portion_ctrl"],"action_taken":["briefing"]}, who="QA")
before = sql("SELECT COUNT(*) n FROM ops_review_items WHERE review_id=%s",(rid,),one=True)["n"]
generate_review("manila","TAFT",DAY)
after = sql("SELECT COUNT(*) n FROM ops_review_items WHERE review_id=%s",(rid,),one=True)["n"]
chk("再生成しても件数が増えない", before==after, (before, after))
chk("回答済みは上書きされない",
    sql("SELECT answer->>'assessment' a FROM ops_review_items WHERE id=%s",(q[0]["id"],),one=True)["a"]=="minor")

print("\n=== 後始末 ===")
ids = [rid] + [x["review_id"] for x in (r2, r3) if x.get("review_id")]
sql("DELETE FROM ops_review_items WHERE review_id = ANY(%s)", (ids,))
sql("DELETE FROM ops_reviews WHERE id = ANY(%s)", (ids,))
chk("削除済み", sql("SELECT COUNT(*) n FROM ops_reviews",one=True)["n"]==0,
    sql("SELECT COUNT(*) n FROM ops_reviews",one=True)["n"])
print("\nTOTAL FAILURES:", len(fails), fails)
