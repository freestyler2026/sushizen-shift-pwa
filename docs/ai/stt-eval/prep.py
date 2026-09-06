from app.db import get_conn
from psycopg2.extras import RealDictCursor
import statistics
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)

print("=== 閾値ごとの1朝あたり件数（マニラ・直近14日・支店×日）===")
cur.execute("""SELECT store_code b, work_date d, COUNT(*) n,
                      COUNT(*) FILTER (WHERE prep_minutes > 30) o30,
                      COUNT(*) FILTER (WHERE prep_minutes > 35) o35,
                      COUNT(*) FILTER (WHERE prep_minutes > 40) o40
                 FROM aggregator_orders
                WHERE city='manila' AND prep_minutes > 0
                  AND work_date > CURRENT_DATE - 15 AND work_date < CURRENT_DATE
                GROUP BY 1,2 HAVING COUNT(*) >= 20 ORDER BY 2 DESC, 1""")
rows=[dict(r) for r in cur.fetchall()]
for r in rows[:18]:
    print(f"   {r['d']} {r['b']:5s} 計{r['n']:3d}  >30:{r['o30']:3d}  >35:{r['o35']:3d}  >40:{r['o40']:3d}")
for k in ("o30","o35","o40"):
    v=[r[k] for r in rows]
    print(f"  {k}: 中央値 {statistics.median(v):.0f} / 平均 {statistics.mean(v):.1f} / 最大 {max(v)} "
          f"/ 10件超の朝 {sum(1 for x in v if x>10)}/{len(v)}")

print("\n=== 支店別（30分超の割合）===")
cur.execute("""SELECT store_code b, COUNT(*) n,
                      COUNT(*) FILTER (WHERE prep_minutes > 30) o30,
                      ROUND(100.0*COUNT(*) FILTER (WHERE prep_minutes > 30)/COUNT(*),1) pct,
                      percentile_cont(0.5) WITHIN GROUP (ORDER BY prep_minutes)::int med,
                      percentile_cont(0.9) WITHIN GROUP (ORDER BY prep_minutes)::int p90
                 FROM aggregator_orders
                WHERE city='manila' AND prep_minutes > 0 AND work_date > CURRENT_DATE - 15
                GROUP BY 1 ORDER BY pct DESC""")
for r in cur.fetchall(): print("  ", dict(r))

print("\n=== PAR の 9/5 は普段どおりか ===")
cur.execute("""SELECT work_date d, COUNT(*) n, COUNT(*) FILTER (WHERE prep_minutes>30) o30,
                      ROUND(100.0*COUNT(*) FILTER (WHERE prep_minutes>30)/COUNT(*),1) pct
                 FROM aggregator_orders WHERE city='manila' AND store_code='PAR'
                   AND prep_minutes>0 AND work_date > CURRENT_DATE - 15
                GROUP BY 1 ORDER BY 1 DESC""")
for r in cur.fetchall(): print(f"   {r['d']}  {r['o30']:3d}/{r['n']:3d}  ({r['pct']}%)")
c.close()
