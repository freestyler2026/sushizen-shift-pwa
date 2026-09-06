from app.db import get_conn
from psycopg2.extras import RealDictCursor
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)
cur.execute("SELECT COUNT(*) n, MIN(purchase_date) a, MAX(purchase_date) b, SUM(total_amount) amt FROM receipt_log")
print("receipt_log 全体:", dict(cur.fetchone()))
cur.execute("""SELECT city, COUNT(*) n, MAX(purchase_date) last, SUM(total_amount) amt
                 FROM receipt_log GROUP BY city ORDER BY n DESC""")
for r in cur.fetchall(): print("  ", dict(r))
cur.execute("""SELECT to_char(purchase_date,'YYYY-MM') m, COUNT(*) n, SUM(total_amount) amt
                 FROM receipt_log GROUP BY 1 ORDER BY 1 DESC LIMIT 6""")
print("月別:")
for r in cur.fetchall(): print("  ", dict(r))
cur.execute("SELECT submitted_by, COUNT(*) n FROM receipt_log GROUP BY 1 ORDER BY n DESC LIMIT 8")
print("提出者:", [(r["submitted_by"], r["n"]) for r in cur.fetchall()])
# 誰が権限を持っているか
cur.execute("SELECT role_key FROM access_role_permissions WHERE permission_key='channel.store_receipt_log.view' ORDER BY 1")
print("receipt_log を開けるロール:", [r["role_key"] for r in cur.fetchall()])
# 他の支出系の直近
for t,dcol in (("petty_cash_requests","created_at"),("spot_purchases","created_at"),
               ("expense_reimbursement_requests","created_at")):
    try:
        cur.execute(f"SELECT COUNT(*) n, MAX({dcol}) last FROM {t}")
        print(f"{t}:", dict(cur.fetchone()))
    except Exception as e:
        c.rollback(); print(f"{t}: -")
c.close()
