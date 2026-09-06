"""未送信の C タスクを review へ寄せ、送信済みは動かさないことを確認する。"""
from app.db import get_conn
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)

cur.execute("""SELECT status, lane, COUNT(*) n FROM management_tasks
                WHERE type='product_score_c' GROUP BY 1,2 ORDER BY 1,2""")
print("移行前:"); 
for r in cur.fetchall(): print("  ", dict(r))

with c:
    with c.cursor() as up:
        # 未送信（open）だけ。送信済みは読まれた内容なので動かさない。
        up.execute("""UPDATE management_tasks t
                         SET lane = a.lane
                        FROM action_templates a
                       WHERE t.type = a.exception_type
                         AND t.type = 'product_score_c'
                         AND t.status = 'open'
                         AND t.lane <> a.lane""")
        print("\n未送信の C を review へ:", up.rowcount, "件")

cur.execute("""SELECT status, lane, COUNT(*) n FROM management_tasks
                WHERE type='product_score_c' GROUP BY 1,2 ORDER BY 1,2""")
print("移行後:")
for r in cur.fetchall(): print("  ", dict(r))

cur.execute("""SELECT COUNT(*) n FROM management_tasks
                WHERE status='sent' AND type='product_score_c' AND lane='urgent'""")
print("\n送信済みで urgent のまま（動かしていない）:", cur.fetchone()["n"], "件")
cur.execute("""SELECT manager_name, COALESCE(lane,'urgent') lane, COUNT(*) n
                 FROM management_tasks WHERE status='sent' AND response IS NULL
                GROUP BY 1,2 ORDER BY 1""")
print("バッジに出る未応答:")
for r in cur.fetchall(): print("  ", dict(r))
c.close()
