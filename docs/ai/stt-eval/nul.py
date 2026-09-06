from app.db import get_conn
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)
cur.execute("""SELECT column_name, is_nullable FROM information_schema.columns
                WHERE table_name='product_score_results' AND column_name LIKE 'score_%%'
                ORDER BY ordinal_position""")
for r in cur.fetchall(): print("  ", r["column_name"], r["is_nullable"])
c.close()
