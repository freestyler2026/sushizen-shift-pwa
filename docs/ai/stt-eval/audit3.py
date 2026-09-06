"""移行の取りこぼしを探す。"""
from app.db import get_conn
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)

print("=== 分割前に作られた open な C タスク（新しいC写真を urgent に吸い込む）===")
cur.execute("""SELECT id, city, branch, type, status, lane, context->>'date' d,
                      (context->>'count')::int cnt, created_at::date
                 FROM management_tasks
                WHERE type='product_score_c' AND status='open' AND lane='urgent'
                ORDER BY id""")
rows=[dict(r) for r in cur.fetchall()]
for r in rows: print("  ", r)
print(f"  → {len(rows)} 件。これらは検知器が『伸ばせる』対象なので、"
      f"同じ支店・同じ日のC写真は urgent のまま追加される")

print("\n=== 当番表に 'ALL' という支店が入っている ===")
cur.execute("SELECT city, branch, COUNT(*) n FROM management_owner_roster GROUP BY 1,2 ORDER BY 1,2")
for r in cur.fetchall(): print("  ", dict(r))

print("\n=== ドバイのレビューは誰にも届かない ===")
cur.execute("""SELECT city, COUNT(*) n, COUNT(*) FILTER (WHERE COALESCE(assigned_to,'')='') unassigned
                 FROM ops_reviews GROUP BY 1""")
for r in cur.fetchall(): print("  ", dict(r))

print("\n=== worker の次回実行 ===")
cur.execute("SELECT NOW() AT TIME ZONE 'UTC' utc")
print("   現在UTC:", cur.fetchone()["utc"], "→ ops-review は毎日 21:00 UTC")

print("\n=== レビューの回答状況（実データ）===")
cur.execute("""SELECT r.city, r.branch, r.status, COUNT(i.id) items,
                      COUNT(i.id) FILTER (WHERE i.answer IS NOT NULL) answered
                 FROM ops_reviews r LEFT JOIN ops_review_items i ON i.review_id=r.id
                GROUP BY 1,2,3 ORDER BY 1,2""")
for r in cur.fetchall(): print("  ", dict(r))
c.close()
