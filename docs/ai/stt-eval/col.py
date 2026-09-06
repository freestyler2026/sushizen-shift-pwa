from app.db import get_conn
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)
cur.execute("""SELECT column_name, data_type, is_nullable, column_default
                 FROM information_schema.columns
                WHERE table_name='product_score_results'
                  AND column_name IN ('grade','food_category','total_score','branch_code','store_code')
                ORDER BY ordinal_position""")
for r in cur.fetchall(): print("  ", dict(r))
cur.execute("SELECT DISTINCT food_category FROM product_score_results WHERE scored_at > NOW() - INTERVAL '90 days'")
print("  food_category:", [r["food_category"] for r in cur.fetchall()])
cur.execute("""SELECT COUNT(*) n FROM product_score_results
                WHERE total_score <= 5 AND (feedback ILIKE '%%receipt%%' OR feedback ILIKE '%%no food%%'
                      OR feedback ILIKE '%%not food%%' OR feedback ILIKE '%%invoice%%'
                      OR feedback ILIKE '%%not a food%%')""")
print("  過去分で not_food に落とせる候補（点数5以下＋文言一致）:", cur.fetchone()["n"])
cur.execute("""SELECT COUNT(*) n FROM product_score_results WHERE total_score <= 5""")
print("  点数5以下の総数:", cur.fetchone()["n"])
cur.execute("""SELECT COUNT(*) n FROM product_score_results
                WHERE total_score > 5 AND (feedback ILIKE '%%receipt%%' OR feedback ILIKE '%%no food is visible%%')""")
print("  点数6以上だが文言一致（＝今回は触らない）:", cur.fetchone()["n"])
cur.execute("SELECT COUNT(*) n FROM product_score_results")
print("  全件:", cur.fetchone()["n"])
c.close()
