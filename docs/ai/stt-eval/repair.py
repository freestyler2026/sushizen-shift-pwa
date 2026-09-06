"""監査で書き込んでしまった行を戻す。

権限を確かめる probe を『実際に呼ぶ』形で書いたため、権限を閉じる前の
Abegail Aguilar のトークンで CUB のレビューが完了され、項目1件に回答が
入った。教訓54（検証のために本番へ書き込まない）を自分で破った。
"""
from app.db import get_conn
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)

cur.execute("""SELECT id, branch, status, completed_by, completed_at
                 FROM ops_reviews WHERE status='completed'""")
print("完了になっているレビュー:", [dict(r) for r in cur.fetchall()])
cur.execute("""SELECT id, review_id, kind, answer, answered_by, answered_at
                 FROM ops_review_items WHERE answered_by = 'Abegail Aguilar'""")
bad=[dict(r) for r in cur.fetchall()]
print("probe が書いた回答:", bad)

with c:
    with c.cursor() as up:
        up.execute("""UPDATE ops_reviews SET status='open', completed_by=NULL, completed_at=NULL
                       WHERE completed_by = 'Abegail Aguilar' RETURNING id""")
        print("再オープン:", up.rowcount, "件")
        up.execute("""UPDATE ops_review_items
                         SET answer=NULL, answered_by=NULL, answered_at=NULL
                       WHERE answered_by = 'Abegail Aguilar'""")
        print("回答を取り消し:", up.rowcount, "件")

cur.execute("""SELECT r.city, r.branch, r.status, r.completed_by,
                      COUNT(i.id) items, COUNT(i.id) FILTER (WHERE i.answer IS NOT NULL) answered
                 FROM ops_reviews r LEFT JOIN ops_review_items i ON i.review_id=r.id
                GROUP BY 1,2,3,4 ORDER BY 1,2""")
print("\n復旧後:")
for r in cur.fetchall(): print("  ", dict(r))
cur.execute("SELECT COUNT(*) n FROM ops_review_items WHERE answered_by IS NOT NULL")
print("残っている回答:", cur.fetchone()["n"], "（0なら完全復旧）")
c.close()
