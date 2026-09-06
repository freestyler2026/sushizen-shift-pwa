"""新しいチャンネルをDBに反映する（Role Management の "Resync System Channels" と同じ処理）。

シード関数を唯一の正とする。DBに直接INSERTしない（教訓20）。
取り消し記録も尊重されるので、誰かが外した権限は復活しない（教訓33）。
"""
from app.db import get_conn
from psycopg2.extras import RealDictCursor
from app.db import seed_access_control_defaults

c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)
cur.execute("SELECT COUNT(*) n FROM access_channels WHERE channel_key='admin.receipt_log'")
print("反映前 channel:", cur.fetchone()["n"])
c.close()

seed_access_control_defaults()

c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)
cur.execute("SELECT channel_key, label, route_path FROM access_channels WHERE channel_key='admin.receipt_log'")
print("channel:", [dict(r) for r in cur.fetchall()])
cur.execute("SELECT role_key FROM access_role_permissions WHERE permission_key='channel.admin.receipt_log.view' ORDER BY 1")
print("付与されたロール:", [r["role_key"] for r in cur.fetchall()])
cur.execute("SELECT permission_key, label FROM access_permissions WHERE permission_key LIKE 'channel.admin.receipt_log%'")
print("permission:", [dict(r) for r in cur.fetchall()])
c.close()

from app.db import resolve_staff_access_profile
for n in ("Ayako Nishimura","Yuri Yamada","Camilla Gadingan","Francis Ibana"):
    p = resolve_staff_access_profile(n) or {}
    perms=list(p.get("permissions") or [])
    ok = ("channel.admin.receipt_log.view" in perms) or ("*" in perms) or (p.get("role") in ("HQ","ADMIN"))
    print(f"  {n:20s} role={str(p.get('role')):18s} 一覧を開ける={ok}")
