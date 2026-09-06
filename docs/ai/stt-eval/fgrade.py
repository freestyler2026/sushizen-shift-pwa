from app.db import get_conn
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)

print("=== F の点数分布（90日・937件）===")
cur.execute("""SELECT width_bucket(total_score, 0, 45, 9) b,
                      MIN(total_score) lo, MAX(total_score) hi, COUNT(*) n
                 FROM product_score_results
                WHERE grade='F' AND scored_at > NOW() - INTERVAL '90 days'
                GROUP BY 1 ORDER BY 1""")
for r in cur.fetchall(): print(f"   {float(r['lo']):5.1f}〜{float(r['hi']):5.1f}  {r['n']:4d}")

print("\n=== F の feedback 実例（低い順）===")
cur.execute("""SELECT total_score, food_category, LEFT(feedback,95) fb
                 FROM product_score_results WHERE grade='F'
                  AND scored_at > NOW() - INTERVAL '30 days'
                ORDER BY total_score LIMIT 12""")
for r in cur.fetchall(): print(f"   {float(r['total_score']):5.1f} [{r['food_category']}] {r['fb']}")

print("\n=== F の feedback 実例（Fの中で高い方）===")
cur.execute("""SELECT total_score, food_category, LEFT(feedback,95) fb
                 FROM product_score_results WHERE grade='F'
                  AND scored_at > NOW() - INTERVAL '30 days'
                ORDER BY total_score DESC LIMIT 10""")
for r in cur.fetchall(): print(f"   {float(r['total_score']):5.1f} [{r['food_category']}] {r['fb']}")

print("\n=== 「食べ物ではない」を示す語を含む件数（90日）===")
for kw in ('receipt','invoice','no food','not food','empty','paper','bag','box only','label'):
    cur.execute("""SELECT COUNT(*) n, COUNT(*) FILTER (WHERE grade='F') f
                     FROM product_score_results
                    WHERE scored_at > NOW() - INTERVAL '90 days'
                      AND feedback ILIKE %s""", (f"%{kw}%",))
    r=cur.fetchone()
    if r["n"]: print(f"   {kw:10s} 全{r['n']:4d}件 うちF {r['f']:4d}")

print("\n=== C の点数分布（45〜60）===")
cur.execute("""SELECT width_bucket(total_score, 45, 60, 5) b, MIN(total_score) lo,
                      MAX(total_score) hi, COUNT(*) n
                 FROM product_score_results
                WHERE grade='C' AND scored_at > NOW() - INTERVAL '90 days'
                GROUP BY 1 ORDER BY 1""")
for r in cur.fetchall(): print(f"   {float(r['lo']):5.1f}〜{float(r['hi']):5.1f}  {r['n']:5d}")
c.close()
