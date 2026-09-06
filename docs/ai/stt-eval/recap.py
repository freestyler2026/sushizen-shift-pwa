"""既存レビューの prep 項目を上限つきで作り直し、件数が真実のままか確認する。"""
from app.db_ops_review import generate_for_city, list_reviews, get_review
from app.db import get_conn
from psycopg2.extras import RealDictCursor

# 既存の未回答 prep 項目を一旦落として、上限つきで貼り直す
c=get_conn()
with c:
    with c.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""DELETE FROM ops_review_items
                        WHERE kind='prep_time' AND answer IS NULL
                          AND review_id IN (SELECT id FROM ops_reviews WHERE status='open')
                       RETURNING id""")
        print("未回答の prep 項目を削除:", cur.rowcount)
c.close()

generate_for_city("manila", "2026-09-05")
print()
for r in list_reviews(status="open", limit=30):
    if r["city"] != "manila": continue
    d = get_review(r["id"])
    p = d["summary"]["prep"]
    preps = [i for i in d["items"] if i["kind"]=="prep_time"]
    qual  = [i for i in d["items"] if i["kind"]=="quality"]
    hidden = preps[0]["payload"].get("not_shown") if preps else 0
    print(f"  {r['branch']:5s}  質問される prep {len(preps):2d} 件 / 実際に30分超 {p['over_threshold']:2d} 件"
          f"（表示外 {hidden}）  quality {len(qual):2d} 件  合計 {len(preps)+len(qual):2d} 件")
