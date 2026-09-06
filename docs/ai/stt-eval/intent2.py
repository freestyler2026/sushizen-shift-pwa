from app.db import get_conn
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)
cur.execute("""SELECT string_agg(column_name,',' ORDER BY ordinal_position) c
                 FROM information_schema.columns WHERE table_name='manila_daily_sales'""")
print("manila_daily_sales:", cur.fetchone()["c"])
cur.execute("""SELECT * FROM manila_daily_sales WHERE sale_date >= '2026-09-03' ORDER BY sale_date DESC, branch LIMIT 6""")
for r in cur.fetchall(): print("  ", {k:v for k,v in dict(r).items() if k in ('branch','sale_date','total_orders','dine_in_orders','grab_orders','foodpanda_orders','total_amount')})

print("\n=== Rush Hour の required（スロット定義）===")
cur.execute("""SELECT branch, COUNT(*) done, array_agg(DISTINCT slot ORDER BY slot) slots
                 FROM rush_checks WHERE city='manila' AND check_date='2026-09-05'
                GROUP BY 1 ORDER BY 1""")
for r in cur.fetchall(): print("  ", dict(r))
cur.execute("""SELECT DISTINCT slot FROM rush_checks WHERE city='manila'
                  AND check_date > CURRENT_DATE - 14 ORDER BY 1""")
print("   直近14日に実在するスロット:", [r["slot"] for r in cur.fetchall()])

print("\n=== Prep：注文時刻と完成時刻 ===")
cur.execute("""SELECT order_no, created_at_utc, accepted_at_utc, ready_at_utc, prep_minutes
                 FROM aggregator_orders WHERE city='manila' AND work_date='2026-09-05'
                   AND prep_minutes > 30 ORDER BY prep_minutes DESC LIMIT 3""")
for r in cur.fetchall(): print("  ", dict(r))
cur.execute("""SELECT COUNT(*) n, COUNT(created_at_utc) has_created, COUNT(accepted_at_utc) has_acc
                 FROM aggregator_orders WHERE city='manila' AND work_date > CURRENT_DATE - 7""")
print("   ", dict(cur.fetchone()))
c.close()
