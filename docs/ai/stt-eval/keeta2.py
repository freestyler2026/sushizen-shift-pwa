from app.db import get_conn
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)

print("=== ready-accepted（現行 prep_minutes）は本当に20で頭打ちか ===")
cur.execute("""SELECT prep_minutes, COUNT(*) n FROM aggregator_orders
                WHERE city='dubai' AND prep_minutes IS NOT NULL AND work_date > CURRENT_DATE - 30
                GROUP BY 1 ORDER BY 1 DESC LIMIT 6""")
for r in cur.fetchall(): print(f"   {int(r['prep_minutes']):3d}分  {r['n']:4d}件")

print("\n=== 代わりに使える時刻があるか: utime - accepted ===")
cur.execute("""SELECT COUNT(*) n,
                 MIN(EXTRACT(EPOCH FROM (updated_at_utc - accepted_at_utc))/60)::int lo,
                 MAX(EXTRACT(EPOCH FROM (updated_at_utc - accepted_at_utc))/60)::int hi,
                 percentile_cont(0.5) WITHIN GROUP (
                   ORDER BY EXTRACT(EPOCH FROM (updated_at_utc - accepted_at_utc))/60)::int med,
                 percentile_cont(0.9) WITHIN GROUP (
                   ORDER BY EXTRACT(EPOCH FROM (updated_at_utc - accepted_at_utc))/60)::int p90,
                 COUNT(DISTINCT ROUND(EXTRACT(EPOCH FROM (updated_at_utc - accepted_at_utc))/60)) dv
                 FROM aggregator_orders
                WHERE city='dubai' AND accepted_at_utc IS NOT NULL
                  AND updated_at_utc IS NOT NULL AND work_date > CURRENT_DATE - 30""")
print("  ", dict(cur.fetchone()))

print("\n=== accepted - created（受注→受付）===")
cur.execute("""SELECT COUNT(*) n,
                 percentile_cont(0.5) WITHIN GROUP (
                   ORDER BY EXTRACT(EPOCH FROM (accepted_at_utc - created_at_utc))/60)::int med,
                 MAX(EXTRACT(EPOCH FROM (accepted_at_utc - created_at_utc))/60)::int hi
                 FROM aggregator_orders
                WHERE city='dubai' AND accepted_at_utc IS NOT NULL
                  AND created_at_utc IS NOT NULL AND work_date > CURRENT_DATE - 30""")
print("  ", dict(cur.fetchone()))

print("\n=== ready - created（受注→完成）※これが「客が待つ時間」に近い ===")
cur.execute("""SELECT COUNT(*) n,
                 MIN(EXTRACT(EPOCH FROM (ready_at_utc - created_at_utc))/60)::int lo,
                 MAX(EXTRACT(EPOCH FROM (ready_at_utc - created_at_utc))/60)::int hi,
                 percentile_cont(0.5) WITHIN GROUP (
                   ORDER BY EXTRACT(EPOCH FROM (ready_at_utc - created_at_utc))/60)::int med,
                 COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (ready_at_utc - created_at_utc))/60 > 30) over30,
                 COUNT(DISTINCT ROUND(EXTRACT(EPOCH FROM (ready_at_utc - created_at_utc))/60)) dv
                 FROM aggregator_orders
                WHERE city='dubai' AND ready_at_utc IS NOT NULL
                  AND created_at_utc IS NOT NULL AND work_date > CURRENT_DATE - 30""")
print("  ", dict(cur.fetchone()))
c.close()
