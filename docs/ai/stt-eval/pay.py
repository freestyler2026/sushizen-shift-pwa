"""payload に画像が入っていないことを、キーとサイズで確認する。
（前回の判定は feedback 本文の "image" という単語に当たっていただけ）"""
from app.db_ops_review import generate_review, get_review
from app.db import get_conn
from psycopg2.extras import RealDictCursor
import json
r = generate_review("manila","TAFT","2026-09-05")
d = get_review(r["review_id"])
q = [i for i in d["items"] if i["kind"]=="quality"]
keys = sorted({k for i in q for k in i["payload"]})
print("payload のキー:", keys)
print("image_data がキーに無い:", "image_data" not in keys)
big = max(len(json.dumps(i["payload"])) for i in q)
print("payload 最大バイト数:", big, "（base64画像なら数万〜数百万になる）")
print("has_photo の値:", sorted({i["payload"]["has_photo"] for i in q}))
sample = [i for i in q if "image" in json.dumps(i["payload"])]
print("'image' を含む理由 →", (sample[0]["payload"]["feedback"][:90] if sample else "なし"))
c=get_conn()
with c:
    with c.cursor() as cur:
        cur.execute("DELETE FROM ops_review_items WHERE review_id=%s",(r["review_id"],))
        cur.execute("DELETE FROM ops_reviews WHERE id=%s",(r["review_id"],))
with c.cursor(cursor_factory=RealDictCursor) as cur:
    cur.execute("SELECT COUNT(*) n FROM ops_reviews"); print("後始末:", cur.fetchone()["n"], "件")
c.close()
