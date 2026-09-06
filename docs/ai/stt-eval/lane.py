"""レーン分割の検証。既存タスクは触らず、隔離した city で検知を回す。"""
from app.db import (get_conn, seed_management_templates, ensure_management_tables,
                    create_management_task, get_management_tasks)
from psycopg2.extras import RealDictCursor

fails=[]
def chk(n,c,x=""):
    print(("PASS " if c else "FAIL ")+n+((" | "+str(x)) if x else ""))
    if not c: fails.append(n)
def sql(q,a=None,one=False):
    cn=get_conn()
    try:
        with cn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(q,a or ())
            if cur.description:
                r=cur.fetchall(); return (dict(r[0]) if r else None) if one else [dict(x) for x in r]
            cn.commit()
    finally: cn.close()

ensure_management_tables()
cols=[r["column_name"] for r in sql("""SELECT column_name FROM information_schema.columns
                                        WHERE table_name='management_tasks'""")]
chk("management_tasks.lane がある", "lane" in cols)
cols2=[r["column_name"] for r in sql("""SELECT column_name FROM information_schema.columns
                                         WHERE table_name='action_templates'""")]
chk("action_templates.lane がある", "lane" in cols2)
chk("既存タスクは全て urgent のまま",
    sql("SELECT COUNT(*) n FROM management_tasks WHERE lane <> 'urgent'",one=True)["n"]==0)

print("\n=== シードを実行（Resync と同じ処理）===")
n = seed_management_templates()
print("  テンプレート", n, "件")
rows = sql("SELECT exception_type, lane, severity, title_en FROM action_templates ORDER BY lane, exception_type")
for r in rows: print(f"   {r['lane']:7s} {r['severity']:6s} {r['exception_type']:26s} {r['title_en'][:40]}")
chk("product_score_c は review", next(r for r in rows if r["exception_type"]=="product_score_c")["lane"]=="review")
chk("product_score_d は urgent かつ red",
    next((r for r in rows if r["exception_type"]=="product_score_d"), {}).get("lane")=="urgent"
    and next((r for r in rows if r["exception_type"]=="product_score_d"), {}).get("severity")=="red")
chk("他は全部 urgent のまま",
    all(r["lane"]=="urgent" for r in rows if r["exception_type"]!="product_score_c"))

print("\n=== 作成時に lane が引き継がれるか（隔離 city）===")
t1 = create_management_task(city="qa-selftest", branch="QA", task_type="product_score_c",
                            template_key="product_score_c", source_id="qa:1", context={"date":"2026-09-06"})
t2 = create_management_task(city="qa-selftest", branch="QA", task_type="product_score_d",
                            template_key="product_score_d", source_id="qa:2", context={"date":"2026-09-06"})
t3 = create_management_task(city="qa-selftest", branch="QA", task_type="rush_check_missing",
                            template_key="rush_check_missing", source_id="qa:3", context={"date":"2026-09-06"})
chk("C は review", t1.get("lane")=="review", t1.get("lane"))
chk("D は urgent", t2.get("lane")=="urgent", t2.get("lane"))
chk("既存タイプは urgent", t3.get("lane")=="urgent", t3.get("lane"))
got = get_management_tasks(city="qa-selftest", limit=10)
chk("一覧に lane が出る", all("lane" in g for g in got), [g.get("lane") for g in got])

sql("DELETE FROM management_tasks WHERE city='qa-selftest'")
chk("後始末", sql("SELECT COUNT(*) n FROM management_tasks WHERE city='qa-selftest'",one=True)["n"]==0)
print("\nTOTAL FAILURES:", len(fails), fails)
