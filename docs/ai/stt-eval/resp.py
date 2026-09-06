from app.db import get_conn
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)
print("=== product_score_c にマネージャーが何と答えたか（全期間）===")
cur.execute("""SELECT response, response_action, COUNT(*) n FROM management_tasks
                WHERE type='product_score_c' AND responded_at IS NOT NULL
                GROUP BY 1,2 ORDER BY n DESC LIMIT 15""")
for r in cur.fetchall(): print("  ", dict(r))
print("\n=== 全タスクの応答→対応までの時間（中央値・分）===")
cur.execute("""SELECT type,
                      ROUND(EXTRACT(EPOCH FROM percentile_cont(0.5) WITHIN GROUP (
                        ORDER BY responded_at - sent_at))/60) med_min, COUNT(*) n
                 FROM management_tasks
                WHERE responded_at IS NOT NULL AND sent_at IS NOT NULL
                GROUP BY 1 ORDER BY n DESC LIMIT 8""")
for r in cur.fetchall(): print("  ", dict(r))
print("\n=== 当番表（management_owner_roster）===")
cur.execute("SELECT * FROM management_owner_roster LIMIT 6")
for r in cur.fetchall(): print("  ", dict(r))
print("\n=== rush_checks / backup_reports / disposal_reports の列 ===")
for t in ("rush_checks","backup_reports","disposal_reports"):
    cur.execute("""SELECT string_agg(column_name,',' ORDER BY ordinal_position) c
                     FROM information_schema.columns WHERE table_name=%s""",(t,))
    print(f"  {t}: {cur.fetchone()['c']}")
c.close()
