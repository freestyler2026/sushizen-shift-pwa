from app.db import get_conn
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)
print("=== 付け直し後：直近7日の1日あたり（都市別）===")
cur.execute("""SELECT city, score_date d,
                      COUNT(*) FILTER (WHERE grade='C') c,
                      COUNT(*) FILTER (WHERE grade='D') dd,
                      COUNT(*) FILTER (WHERE grade='F') f,
                      COUNT(*) FILTER (WHERE food_category='not_food') nf,
                      COUNT(*) tot
                 FROM product_score_results
                WHERE score_date > CURRENT_DATE - 7
                GROUP BY 1,2 ORDER BY 2 DESC, 1""")
for r in cur.fetchall(): print("  ", dict(r))
print("\n=== D の feedback 実例（直近）===")
cur.execute("""SELECT branch_code, total_score, LEFT(feedback,88) fb
                 FROM product_score_results WHERE grade='D'
                ORDER BY scored_at DESC LIMIT 6""")
for r in cur.fetchall(): print(f"   {r['branch_code']:6s} {float(r['total_score']):5.1f}  {r['fb']}")
print("\n=== F に残ったもの（＝本当に評価不能）の実例 ===")
cur.execute("""SELECT total_score, LEFT(feedback,88) fb FROM product_score_results
                WHERE grade='F' ORDER BY scored_at DESC LIMIT 5""")
for r in cur.fetchall(): print(f"   {float(r['total_score']):5.1f}  {r['fb']}")
print("\n=== 支店コードの正規化（管理タスク側は既にCUB）===")
cur.execute("""SELECT DISTINCT branch FROM management_tasks
                WHERE type='product_score_c' AND created_at > NOW() - INTERVAL '14 days' ORDER BY 1""")
print("  tasks:", [r["branch"] for r in cur.fetchall()])
c.close()
