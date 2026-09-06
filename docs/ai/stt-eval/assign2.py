"""product_score_d に担当を付ける。

product_score_c を既に持っている人にだけ足す。誰も持っていない都市には
足さない（勝手に人を割り当てない）。
"""
from app.db import get_conn, _bo_assignee_for
from psycopg2.extras import RealDictCursor
c=get_conn()
with c:
    with c.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""SELECT id, city, staff_name, assigned_types FROM bo_assignments
                        WHERE is_active AND assigned_types ? 'product_score_c'""")
        rows=[dict(r) for r in cur.fetchall()]
        print("product_score_c の担当:", [(r["city"], r["staff_name"]) for r in rows])
        for r in rows:
            types = list(r["assigned_types"] or [])
            if "product_score_d" in types:
                print("  既に付いている:", r["staff_name"]); continue
            types.append("product_score_d")
            cur.execute("UPDATE bo_assignments SET assigned_types = %s::jsonb, updated_at = NOW() "
                        "WHERE id = %s", (__import__("json").dumps(sorted(types)), r["id"]))
            print("  追加:", r["city"], r["staff_name"], "->", sorted(types))
for city in ("manila","dubai"):
    print(f"  {city:7s} product_score_d -> {_bo_assignee_for(city,'product_score_d')!r}")
c.close()
