from app.db import get_conn
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)

print("=== product_score_c タスクは1日1件にまとまっているか（直近7日）===")
cur.execute("""SELECT (created_at AT TIME ZONE 'Asia/Manila')::date d, branch, severity,
                      COUNT(*) tasks, SUM(COALESCE((context->>'count')::int,1)) photos
                 FROM management_tasks
                WHERE type='product_score_c' AND created_at > NOW() - INTERVAL '7 days'
                GROUP BY 1,2,3 ORDER BY 1 DESC,2""")
for r in cur.fetchall(): print("  ", dict(r))

print("\n=== 採点結果テーブルを探す ===")
cur.execute("""SELECT table_name, string_agg(column_name,',' ORDER BY ordinal_position) cols
                 FROM information_schema.columns
                WHERE table_name LIKE '%%product_score%%' GROUP BY 1""")
for r in cur.fetchall(): print("  ", r["table_name"], "\n     ", r["cols"])

print("\n=== 等級の分布（直近14日・マニラ）===")
try:
    cur.execute("""SELECT (scored_at AT TIME ZONE 'Asia/Manila')::date d, branch_code,
                          COUNT(*) n,
                          COUNT(*) FILTER (WHERE grade='A') a,
                          COUNT(*) FILTER (WHERE grade='B') b,
                          COUNT(*) FILTER (WHERE grade='C') cc,
                          COUNT(*) FILTER (WHERE grade='D') d_,
                          COUNT(*) FILTER (WHERE grade='F') f
                     FROM product_score_results
                    WHERE scored_at > NOW() - INTERVAL '7 days'
                    GROUP BY 1,2 ORDER BY 1 DESC,2 LIMIT 20""")
    for r in cur.fetchall(): print("  ", dict(r))
except Exception as e:
    c.rollback(); print("  ", e)
c.close()
