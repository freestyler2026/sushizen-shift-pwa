"""テスト応募を消す。まず「何を消すか」を出し、名前の完全一致だけを対象にする。"""
from app.db import get_conn
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)

cur.execute("""SELECT a.id, a.full_name, a.phone, a.source, a.applied_date, a.status,
                      s.id sid, (SELECT COUNT(*) FROM hr_voice_answers v
                                  WHERE v.screening_id=s.id) answers
                 FROM hr_applicants a
                 LEFT JOIN hr_voice_screenings s ON s.applicant_id = a.id
                WHERE BTRIM(a.full_name) ~* '^test( ?[0-9]+)?$'
                ORDER BY a.created_at""")
rows=[dict(r) for r in cur.fetchall()]
print("削除対象（名前が Test / Test 2 / Test 3 に完全一致するもの）:")
for r in rows: print("  ", r)

cur.execute("""SELECT full_name FROM hr_applicants
                WHERE full_name ILIKE '%test%' AND BTRIM(full_name) !~* '^test( ?[0-9]+)?$'""")
near=[r["full_name"] for r in cur.fetchall()]
print("\n'test' を含むが対象外（触らない）:", near or "なし")
cur.execute("SELECT COUNT(*) n FROM hr_applicants"); print("\n現在の応募者総数:", cur.fetchone()["n"])
c.close()
