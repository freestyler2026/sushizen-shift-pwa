from app.db import get_conn
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)
print("=== rush_check_missing は スロット単位か 日単位か ===")
cur.execute("""SELECT branch, source_id, context::text, created_at::date
                 FROM management_tasks WHERE type='rush_check_missing'
                  AND created_at > NOW() - INTERVAL '4 days' ORDER BY id DESC LIMIT 6""")
for r in cur.fetchall(): print("  ", r["branch"], "|", r["source_id"], "|", r["context"][:110])
print("\n=== 9/5 の 完了 / 未提出（支店別）===")
cur.execute("""SELECT branch, COUNT(*) missing FROM management_tasks
                WHERE type='rush_check_missing' AND COALESCE(context->>'date','')='2026-09-05'
                GROUP BY 1 ORDER BY 1""")
miss={r["branch"]: r["missing"] for r in cur.fetchall()}
cur.execute("""SELECT branch, COUNT(*) done FROM rush_checks
                WHERE city='manila' AND check_date='2026-09-05' GROUP BY 1 ORDER BY 1""")
for r in cur.fetchall():
    b=r["branch"]; m=miss.get(b,0)
    print(f"   {b:5s} 完了{r['done']:3d}  未提出{m:2d}  → Required {r['done']+m}")
print("\n=== manila_daily_sales の直近（前日分が届いているか）===")
cur.execute("""SELECT sale_date, COUNT(*) branches, SUM(total_orders) orders
                 FROM manila_daily_sales WHERE sale_date > CURRENT_DATE - 7
                GROUP BY 1 ORDER BY 1 DESC""")
for r in cur.fetchall(): print("  ", dict(r))
c.close()
