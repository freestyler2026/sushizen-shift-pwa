from app.db import get_conn
from app.services.ar_drive import _get_drive_write_service
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)

# 先に「テスト以外に増えている応募」を確認する（本物なら絶対に消さない）
cur.execute("""SELECT full_name, phone, source, applied_date, status, notes
                 FROM hr_applicants WHERE applied_date >= '2026-09-05'
                ORDER BY created_at""")
print("9/5以降の応募（増えた分）:")
for r in cur.fetchall(): print("  ", dict(r))

cur.execute("""SELECT a.id, s.id sid FROM hr_applicants a
                 LEFT JOIN hr_voice_screenings s ON s.applicant_id=a.id
                WHERE BTRIM(a.full_name) ~* '^test( ?[0-9]+)?$'""")
targets=[dict(r) for r in cur.fetchall()]
aids=[t["id"] for t in targets]
sids=[t["sid"] for t in targets if t["sid"]]

cur.execute("""SELECT id, drive_file_id FROM hr_voice_answers
                WHERE screening_id = ANY(%s) AND COALESCE(drive_file_id,'') <> ''""",(sids,))
files=[dict(r) for r in cur.fetchall()]
print(f"\nDrive の音声 {len(files)} 件をゴミ箱へ")
svc=_get_drive_write_service(); ok=bad=0
for f in files:
    try:
        svc.files().update(fileId=f["drive_file_id"], body={"trashed": True},
                           supportsAllDrives=True).execute(); ok+=1
    except Exception as e:
        bad+=1; print("   失敗:", f["drive_file_id"], e)
print(f"   ゴミ箱へ {ok} 件 / 失敗 {bad} 件")

with c:
    with c.cursor() as up:
        up.execute("DELETE FROM hr_voice_answers WHERE screening_id = ANY(%s)",(sids,))
        print("\n回答削除:", up.rowcount)
        up.execute("DELETE FROM hr_voice_screenings WHERE id = ANY(%s)",(sids,))
        print("面接枠削除:", up.rowcount)
        up.execute("DELETE FROM hr_applicants WHERE id = ANY(%s::uuid[])",(aids,))
        print("応募者削除:", up.rowcount)

cur.execute("SELECT COUNT(*) n FROM hr_applicants"); print("\n応募者総数:", cur.fetchone()["n"])
cur.execute("SELECT COUNT(*) n FROM hr_voice_screenings"); print("面接枠:", cur.fetchone()["n"])
cur.execute("SELECT COUNT(*) n FROM hr_voice_answers"); print("回答:", cur.fetchone()["n"])
cur.execute("SELECT COUNT(*) n FROM hr_applicants WHERE full_name ILIKE '%test%'")
print("名前に test を含む残り:", cur.fetchone()["n"])
c.close()
