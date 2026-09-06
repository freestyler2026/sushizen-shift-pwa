from app.db import get_conn
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)

print("=== テンプレートのレーン（本番）===")
cur.execute("SELECT exception_type, lane, severity FROM action_templates WHERE exception_type LIKE 'product_score%' ORDER BY 1")
for r in cur.fetchall(): print("  ", dict(r))

print("\n=== 今日の未処理タスク（レーン別）===")
cur.execute("""SELECT lane, status, COUNT(*) n FROM management_tasks
                WHERE created_at > NOW() - INTERVAL '2 days'
                GROUP BY 1,2 ORDER BY 1,2""")
for r in cur.fetchall(): print("  ", dict(r))

print("\n=== 移行時の重複防止: 今日のCダイジェストにD/Fが混ざっているか ===")
cur.execute("""SELECT id, branch, type, status, context->>'date' d,
                      (context->>'count')::int cnt, context->'items' items
                 FROM management_tasks
                WHERE type IN ('product_score_c','product_score_d')
                  AND context->>'date' >= (CURRENT_DATE - 1)::text
                ORDER BY id DESC LIMIT 8""")
for r in cur.fetchall():
    items = r["items"] or []
    grades = {}
    for i in items:
        g = i.get("grade") or "?"
        grades[g] = grades.get(g,0)+1
    print(f"   #{r['id']} {r['branch']:5s} {r['type']:17s} {r['status']:9s} {r['d']}  {r['cnt']}件 {grades}")

print("\n=== 直近14日を分割したら何件ずつになるか（試算・書き込みなし）===")
cur.execute("""SELECT (score_date) d,
                      COUNT(*) FILTER (WHERE grade='C') c,
                      COUNT(*) FILTER (WHERE grade IN ('D','F')) df
                 FROM product_score_results
                WHERE score_date > CURRENT_DATE - 8
                GROUP BY 1 ORDER BY 1 DESC""")
for r in cur.fetchall():
    print(f"   {r['d']}  review(C) {r['c']:3d}  /  urgent(D/F) {r['df']:2d}")
c.close()
