"""承認済みの付け直しを実行する。関数が自分でバックアップを取る。"""
from app.db import get_conn, regrade_product_scores
from psycopg2.extras import RealDictCursor

def snap(label):
    c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)
    cur.execute("""SELECT COALESCE(grade,'(none)') g, COUNT(*) n FROM product_score_results
                   GROUP BY 1 ORDER BY 1""")
    print(f"  {label}: " + " / ".join(f"{r['g']} {r['n']}" for r in cur.fetchall()))
    cur.execute("SELECT COUNT(*) n FROM product_score_results WHERE food_category='not_food'")
    print(f"     not_food: {cur.fetchone()['n']}")
    c.close()

snap("実行前")
out = regrade_product_scores(dry_run=False)
print("\n結果:", out)
snap("実行後")

# 逆算できるか（バックアップから復元可能なこと）を確認
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)
cur.execute("SELECT COUNT(*) n FROM %s" % out["backup_table"])
print(f"\nバックアップ {out['backup_table']}: {cur.fetchone()['n']} 行")
cur.execute(f"""SELECT COUNT(*) n FROM product_score_results p
                  JOIN {out['backup_table']} b ON b.id = p.id
                 WHERE COALESCE(p.grade,'') <> COALESCE(b.grade,'')
                    OR COALESCE(p.food_category,'') <> COALESCE(b.food_category,'')""")
print("実際に変わった行:", cur.fetchone()["n"])
cur.execute("""SELECT COUNT(*) n FROM product_score_results
                WHERE grade IS NOT NULL AND food_category='not_food'""")
print("not_food なのに等級が残っている行（0なら正常）:", cur.fetchone()["n"])
cur.execute("""SELECT MIN(total_score) lo, MAX(total_score) hi FROM product_score_results WHERE grade='D'""")
print("D の点数範囲:", dict(cur.fetchone()))
cur.execute("""SELECT MIN(total_score) lo, MAX(total_score) hi FROM product_score_results
                WHERE grade='F'""")
print("F の点数範囲:", dict(cur.fetchone()))
c.close()
