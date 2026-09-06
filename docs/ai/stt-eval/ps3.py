from app.db import get_conn
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)
cur.execute("""SELECT string_agg(column_name,',' ORDER BY ordinal_position) cols
                 FROM information_schema.columns WHERE table_name='aggregator_orders'""")
print("aggregator_orders:", cur.fetchone()["cols"])

print("\n=== Prep Time 30分/40分超（直近5日・店舗別）===")
cur.execute("""SELECT store_code, work_date d,
                      COUNT(*) n,
                      COUNT(*) FILTER (WHERE prep_minutes > 30) over30,
                      COUNT(*) FILTER (WHERE prep_minutes > 40) over40,
                      MAX(prep_minutes) worst, ROUND(AVG(prep_minutes)) avg
                 FROM aggregator_orders
                WHERE prep_minutes > 0 AND work_date > CURRENT_DATE - 5
                GROUP BY 1,2 ORDER BY 2 DESC, 1 LIMIT 16""")
for r in cur.fetchall(): print("  ", dict(r))

print("\n=== 前日サマリに使う他のソースが実在するか ===")
for t in ("rush_hour_checks","backup_reports","disposal_reports","daily_inventory_counts"):
    cur.execute("""SELECT COUNT(*) n FROM information_schema.tables WHERE table_name=%s""",(t,))
    print(f"  {t}: {'あり' if cur.fetchone()['n'] else 'なし'}")
cur.execute("""SELECT table_name FROM information_schema.tables
                WHERE table_schema='public' AND (table_name LIKE '%%rush%%'
                   OR table_name LIKE '%%backup%%' OR table_name LIKE '%%disposal%%')
                ORDER BY 1""")
print("  該当しそうなテーブル:", [r["table_name"] for r in cur.fetchall()])
c.close()
