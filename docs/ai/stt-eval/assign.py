from app.db import get_conn, _bo_assignee_for
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)
cur.execute("SELECT city, staff_name, assigned_types, is_active FROM bo_assignments ORDER BY city, staff_name")
for r in cur.fetchall(): print("  ", dict(r))
print()
for city in ("manila","dubai"):
    for t in ("product_score_c","product_score_d","rush_check_missing"):
        print(f"  {city:7s} {t:20s} -> {_bo_assignee_for(city, t)!r}")
c.close()
