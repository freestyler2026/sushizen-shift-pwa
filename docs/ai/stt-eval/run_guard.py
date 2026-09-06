from app.db import get_conn, reclassify_no_dish
from app.services.product_scoring_service import looks_like_no_dish
from psycopg2.extras import RealDictCursor

fails=[]
def chk(n,c,x=""):
    print(("PASS " if c else "FAIL ")+n+((" | "+str(x)) if x else ""))
    if not c: fails.append(n)

# ガードの単体確認
chk("Dで『完成した料理ではない』→ 対象",
    looks_like_no_dish("D", "This appears to be a mise en place or ingredient prep photo, not a finished dish"))
chk("Dで『スープが薄い・レシートが写っている』→ 対象外（本物のD）",
    not looks_like_no_dish("D", "Soup appears underseasoned and poorly presented; order receipt indicates 2 items"))
chk("Aは対象外（点数を取り上げない）",
    not looks_like_no_dish("A", "Well-prepared mise en place with uniform egg portions"))
chk("Fも対象", looks_like_no_dish("F", "No food item is visible in this photo—only a receipt is shown"))
chk("空のfeedbackは対象外", not looks_like_no_dish("D", ""))

print("\n=== 履歴への適用（まず dry run）===")
plan = reclassify_no_dish(dry_run=True)
print("  ", plan)
chk("移動対象は130件前後", 120 <= plan["would_move"] <= 145, plan["would_move"])

def snap(label):
    c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)
    cur.execute("""SELECT COALESCE(grade,'(none)') g, COUNT(*) n FROM product_score_results
                    GROUP BY 1 ORDER BY 1""")
    print(f"  {label}: " + " / ".join(f"{r['g']} {r['n']}" for r in cur.fetchall()))
    c.close()

snap("実行前")
out = reclassify_no_dish(dry_run=False)
print("\n結果:", out)
snap("実行後")

c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)
cur.execute("SELECT COUNT(*) n FROM product_score_results WHERE food_category='not_food' AND grade IS NOT NULL")
chk("not_food に等級が残っていない", cur.fetchone()["n"]==0)
cur.execute("SELECT MIN(total_score) lo, MAX(total_score) hi, COUNT(*) n FROM product_score_results WHERE grade='D'")
print("  D:", dict(cur.fetchone()))
cur.execute("""SELECT total_score, LEFT(feedback,88) fb FROM product_score_results
                WHERE grade='D' ORDER BY random() LIMIT 8""")
print("\n  残っているD（無作為8件）:")
for r in cur.fetchall(): print(f"    {float(r['total_score']):5.1f}  {r['fb']}")
c.close()
print("\nTOTAL FAILURES:", len(fails), fails)
