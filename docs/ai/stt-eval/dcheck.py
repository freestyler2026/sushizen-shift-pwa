from app.db import get_conn
from psycopg2.extras import RealDictCursor
import re
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)

cur.execute("""SELECT id, total_score, food_category, feedback
                 FROM product_score_results WHERE grade='D'""")
rows=[dict(r) for r in cur.fetchall()]
print("D の総数:", len(rows))

# 「料理ではない」と本文が言っているものを数える
PAT = re.compile(r"(not a (finished |prepared |complete )?(dish|food)"
                 r"|no (actual |prepared )?(food|dish)"
                 r"|rather than a (prepared |finished )?(food|dish)"
                 r"|mise en place|prep(/kitchen)? photo|ingredient prep"
                 r"|unable to (evaluate|assess) .*(food|dish|product)"
                 r"|condiment (packets|containers)"
                 r"|receipt|invoice"
                 r"|not yet (assembled|plated)"
                 r"|raw ingredients)", re.I)
hit=[r for r in rows if r["feedback"] and PAT.search(r["feedback"])]
print(f"「料理ではない」と本文が言っている D: {len(hit)} / {len(rows)}  ({100*len(hit)/len(rows):.0f}%)")

print("\n--- 検出された例（10件）---")
for r in hit[:10]:
    print(f"   {float(r['total_score']):5.1f}  {r['feedback'][:92]}")

print("\n--- 検出されなかった例（10件）＝本物のDのはず ---")
miss=[r for r in rows if r not in hit]
for r in miss[:10]:
    print(f"   {float(r['total_score']):5.1f}  {r['feedback'][:92]}")

# 誤検出の危険: A/B の feedback に同じ語が出るか
cur.execute("""SELECT COUNT(*) n FROM product_score_results
                WHERE grade IN ('A','S','B') AND scored_at > NOW() - INTERVAL '30 days'""")
tot_good=cur.fetchone()["n"]
cur.execute("""SELECT total_score, LEFT(feedback,90) fb FROM product_score_results
                WHERE grade IN ('A','S','B') AND scored_at > NOW() - INTERVAL '30 days'
                  AND (feedback ~* 'not a (finished |prepared )?dish' OR feedback ~* 'no actual food'
                       OR feedback ~* 'mise en place' OR feedback ~* 'raw ingredients')
                LIMIT 8""")
fp=[dict(r) for r in cur.fetchall()]
print(f"\n--- 誤検出の危険: 直近30日の A/B/S {tot_good}件のうち同じ語を含むもの {len(fp)}件 ---")
for r in fp: print(f"   {float(r['total_score']):5.1f}  {r['fb']}")
print("\n--- C はどうか（30日）---")
cur.execute("""SELECT COUNT(*) n FROM product_score_results WHERE grade='C' AND scored_at > NOW() - INTERVAL '30 days'""")
tc=cur.fetchone()["n"]
cur.execute("""SELECT COUNT(*) n FROM product_score_results WHERE grade='C'
                 AND scored_at > NOW() - INTERVAL '30 days'
                 AND (feedback ~* 'not a (finished |prepared )?dish' OR feedback ~* 'no actual food'
                      OR feedback ~* 'mise en place' OR feedback ~* 'raw ingredients'
                      OR feedback ~* 'receipt')""")
print(f"   C {tc}件中、同じ語を含むもの {cur.fetchone()['n']}件")
c.close()
