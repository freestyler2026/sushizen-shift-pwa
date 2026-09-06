from app.db import get_conn, resolve_staff_access_profile
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)
cur.execute("""SELECT staff_name, role FROM staff_auth
                WHERE staff_name ILIKE '%ayako%' OR staff_name ILIKE '%nishimura%'
                   OR staff_name ILIKE '%yamada%' ORDER BY staff_name""")
rows=cur.fetchall()
for r in rows:
    p = resolve_staff_access_profile(r["staff_name"]) or {}
    perms=list(p.get("permissions") or [])
    ok = ("channel.store_receipt_log.view" in perms) or ("*" in perms) or (p.get("role") in ("HQ","ADMIN"))
    print(f"{r['staff_name']:24s} auth={r['role']:10s} resolved={str(p.get("role")):16s} "
          f"Receipt Log 開ける={ok}")
cur.execute("""SELECT purchase_date, supplier_name, total_amount, submitted_by, branch_code,
                      LEFT(notes,40) notes, receipt_url <> '' has_photo
                 FROM receipt_log ORDER BY created_at DESC LIMIT 5""")
print("\n直近5件:")
for r in cur.fetchall(): print("  ", dict(r))
c.close()
