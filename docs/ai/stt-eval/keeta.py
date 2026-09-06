from app.db import get_conn
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)
print("=== ドバイ prep_minutes の分布（platform別・30日）===")
cur.execute("""SELECT platform, COUNT(*) n, MIN(prep_minutes) lo, MAX(prep_minutes) hi,
                      ROUND(AVG(prep_minutes)) avg,
                      COUNT(DISTINCT prep_minutes) distinct_vals,
                      MAX(imported_at)::date last_import, MAX(work_date) last_day
                 FROM aggregator_orders
                WHERE city='dubai' AND prep_minutes > 0
                  AND work_date > CURRENT_DATE - 30
                GROUP BY 1""")
for r in cur.fetchall(): print("  ", dict(r))
print("\n=== 実際に出ている値（ドバイ・上位）===")
cur.execute("""SELECT prep_minutes, COUNT(*) n FROM aggregator_orders
                WHERE city='dubai' AND prep_minutes > 0 AND work_date > CURRENT_DATE - 30
                GROUP BY 1 ORDER BY n DESC LIMIT 12""")
print("  ", [(int(r["prep_minutes"]), r["n"]) for r in cur.fetchall()])
print("\n=== 直近3日の取込（platform・日別）===")
cur.execute("""SELECT city, platform, work_date, COUNT(*) n,
                      COUNT(*) FILTER (WHERE prep_minutes > 0) with_prep,
                      MAX(prep_minutes) hi, MAX(imported_at) imported
                 FROM aggregator_orders WHERE work_date > CURRENT_DATE - 3
                GROUP BY 1,2,3 ORDER BY 3 DESC,1,2""")
for r in cur.fetchall(): print("  ", dict(r))
print("\n=== マニラの分布（比較）===")
cur.execute("""SELECT MIN(prep_minutes) lo, MAX(prep_minutes) hi, COUNT(DISTINCT prep_minutes) dv,
                      percentile_cont(0.5) WITHIN GROUP (ORDER BY prep_minutes) med
                 FROM aggregator_orders WHERE city='manila' AND prep_minutes>0
                   AND work_date > CURRENT_DATE - 30""")
print("  ", dict(cur.fetchone()))
c.close()
