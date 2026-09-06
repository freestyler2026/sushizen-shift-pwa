from app.db import get_conn
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)

print("=== ご要望のレーン分けと、実際のレーン ===")
want_urgent = {"rush_check_missing","backup_below_50","backup_below_70",
               "disposal_missing","product_score_d"}
cur.execute("SELECT exception_type, lane, severity FROM action_templates ORDER BY lane, exception_type")
for r in cur.fetchall():
    t=r["exception_type"]
    mark = ""
    if t in want_urgent and r["lane"]!="urgent": mark = "  ← ご要望は urgent"
    if t=="product_score_c" and r["lane"]!="review": mark = "  ← ご要望は review"
    print(f"   {r['lane']:7s} {t:26s}{mark}")

print("\n=== サマリに『Total Orders』は出せるか ===")
cur.execute("""SELECT store_code, work_date, COUNT(*) all_orders,
                      COUNT(*) FILTER (WHERE prep_minutes>0) with_prep
                 FROM aggregator_orders WHERE city='manila' AND work_date='2026-09-05'
                GROUP BY 1,2 ORDER BY 1""")
for r in cur.fetchall(): print("  ", dict(r))
print("   （※ aggregator_orders はデリバリーのみ。店内・持ち帰りは別ソース）")
cur.execute("""SELECT table_name FROM information_schema.tables
                WHERE table_name IN ('manila_daily_sales','manila_sales_by_channel')""")
print("   店舗全体の注文数を持つ表:", [r["table_name"] for r in cur.fetchall()])
cur.execute("""SELECT branch, order_count, total_orders FROM manila_daily_sales
                WHERE sales_date='2026-09-05' LIMIT 5""")
try:
    for r in cur.fetchall(): print("   ", dict(r))
except Exception as e:
    c.rollback(); print("   ", e)

print("\n=== Rush Hour の『Required』は出せるか ===")
cur.execute("""SELECT string_agg(column_name,',' ORDER BY ordinal_position) c
                 FROM information_schema.columns WHERE table_name='rush_checks'""")
print("   rush_checks:", cur.fetchone()["c"])
cur.execute("""SELECT branch, COUNT(*) done, array_agg(slot ORDER BY slot) slots
                 FROM rush_checks WHERE city='manila' AND check_date='2026-09-05'
                GROUP BY 1 ORDER BY 1""")
for r in cur.fetchall(): print("  ", dict(r))

print("\n=== Prep：注文時刻と出発時刻は持っているか ===")
cur.execute("""SELECT order_no, created_at_utc, accepted_at_utc, ready_at_utc, prep_minutes
                 FROM aggregator_orders WHERE city='manila' AND work_date='2026-09-05'
                   AND prep_minutes > 30 ORDER BY prep_minutes DESC LIMIT 4""")
for r in cur.fetchall(): print("  ", dict(r))
c.close()
