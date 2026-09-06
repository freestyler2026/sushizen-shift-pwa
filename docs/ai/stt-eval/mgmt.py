from app.db import get_conn
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)

print("=== management_tasks: 種類別（直近30日）===")
cur.execute("""SELECT type, severity, COUNT(*) n,
                      COUNT(*) FILTER (WHERE status='open') open,
                      COUNT(*) FILTER (WHERE sent_at IS NOT NULL) sent,
                      COUNT(*) FILTER (WHERE responded_at IS NOT NULL) responded,
                      MAX(created_at)::date last
                 FROM management_tasks
                WHERE created_at > NOW() - INTERVAL '30 days'
                GROUP BY 1,2 ORDER BY n DESC LIMIT 25""")
for r in cur.fetchall(): print("  ", dict(r))

print("\n=== 1日あたり（直近14日・送信済みのみ）===")
cur.execute("""SELECT (sent_at AT TIME ZONE 'Asia/Manila')::date d, COUNT(*) n,
                      COUNT(*) FILTER (WHERE severity='red') red,
                      COUNT(*) FILTER (WHERE type LIKE 'product_score%%') pscore
                 FROM management_tasks
                WHERE sent_at > NOW() - INTERVAL '14 days'
                GROUP BY 1 ORDER BY 1 DESC""")
for r in cur.fetchall(): print("  ", dict(r))

print("\n=== action_templates の一覧 ===")
cur.execute("SELECT exception_type, severity, title_en, is_active FROM action_templates ORDER BY severity, exception_type")
for r in cur.fetchall(): print("  ", r["severity"], "|", r["exception_type"], "|", r["title_en"][:44], "| active", r["is_active"])
c.close()
