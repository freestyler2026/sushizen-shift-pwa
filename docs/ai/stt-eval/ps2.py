from app.db import get_conn
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)

print("=== 等級は実際に何が出ているか（90日・全体）===")
cur.execute("""SELECT grade, COUNT(*) n, ROUND(100.0*COUNT(*)/SUM(COUNT(*)) OVER (),2) pct
                 FROM product_score_results WHERE scored_at > NOW() - INTERVAL '90 days'
                GROUP BY 1 ORDER BY 1""")
for r in cur.fetchall(): print("  ", dict(r))

print("\n=== 支店コードの表記ゆれ（product_score_results と management_tasks）===")
cur.execute("SELECT DISTINCT branch_code FROM product_score_results WHERE scored_at > NOW() - INTERVAL '30 days' ORDER BY 1")
print("  scores :", [r["branch_code"] for r in cur.fetchall()])
cur.execute("SELECT DISTINCT branch FROM management_tasks WHERE created_at > NOW() - INTERVAL '30 days' ORDER BY 1")
print("  tasks  :", [r["branch"] for r in cur.fetchall()])

print("\n=== マニラ 1日あたり C以下（直近10日・支店別）===")
cur.execute("""SELECT (scored_at AT TIME ZONE 'Asia/Manila')::date d, branch_code,
                      COUNT(*) FILTER (WHERE grade IN ('C','D','F')) c_below,
                      COUNT(*) FILTER (WHERE grade='F') f, COUNT(*) total
                 FROM product_score_results
                WHERE city='manila' AND scored_at > NOW() - INTERVAL '10 days'
                GROUP BY 1,2 HAVING COUNT(*) > 0 ORDER BY 1 DESC, 2""")
rows=[dict(r) for r in cur.fetchall()]
for r in rows[:16]: print("  ", r)
import statistics
cb=[r["c_below"] for r in rows]; fs=[r["f"] for r in rows]
print(f"  → 支店×日あたり C以下 中央値 {statistics.median(cb)} / 最大 {max(cb)} ; F 中央値 {statistics.median(fs)} / 最大 {max(fs)}")

print("\n=== Prep Time（aggregator_orders）===")
cur.execute("""SELECT city, store, (ordered_at AT TIME ZONE 'Asia/Manila')::date d,
                      COUNT(*) n,
                      COUNT(*) FILTER (WHERE prep_minutes > 30) over30,
                      COUNT(*) FILTER (WHERE prep_minutes > 40) over40,
                      MAX(prep_minutes) worst, ROUND(AVG(prep_minutes)) avg
                 FROM aggregator_orders
                WHERE prep_minutes > 0 AND ordered_at > NOW() - INTERVAL '5 days'
                GROUP BY 1,2,3 ORDER BY 3 DESC, 2 LIMIT 14""")
for r in cur.fetchall(): print("  ", dict(r))
c.close()
