"""緩い語（receipt 単体）を外し、「料理が写っていない」と断言している文だけを拾う。"""
from app.db import get_conn
from psycopg2.extras import RealDictCursor
import re
c=get_conn(); cur=c.cursor(cursor_factory=RealDictCursor)

TIGHT = re.compile(
    r"(not a (finished |prepared |complete |actual )?(dish|food item|food photo|food product)"
    r"|no (actual |prepared |finished )?(food|dish)[^.]{0,40}\b(visible|present|shown|to evaluate|to assess)"
    r"|rather than a (prepared |finished |actual )?(food|dish|meal)"
    r"|rather than (a )?(finished|prepared) dish"
    r"|mise en place"
    r"|(prep|staging|kitchen)[ /-]?(photo|station|shot)[^.]{0,30}(rather than|not a)"
    r"|raw ingredients[^.]{0,40}rather than"
    r"|not yet (assembled|plated))", re.I)

for g in ("D","F","C","B","A","S"):
    cur.execute("""SELECT total_score, feedback FROM product_score_results
                    WHERE grade=%s AND feedback IS NOT NULL""", (g,))
    rows=cur.fetchall()
    hit=[r for r in rows if TIGHT.search(r["feedback"])]
    print(f"  {g}: {len(hit):4d} / {len(rows):6d}  ({100*len(hit)/max(1,len(rows)):.2f}%)")

print("\n--- D で検出されるもの（全件）---")
cur.execute("""SELECT total_score, feedback FROM product_score_results
                WHERE grade='D' AND feedback IS NOT NULL""")
for r in cur.fetchall():
    if TIGHT.search(r["feedback"]):
        print(f"   {float(r['total_score']):5.1f}  {r['feedback'][:95]}")

print("\n--- B/A で検出されるもの（誤検出の確認・全件）---")
cur.execute("""SELECT grade, total_score, feedback FROM product_score_results
                WHERE grade IN ('A','B','S') AND feedback IS NOT NULL""")
n=0
for r in cur.fetchall():
    if TIGHT.search(r["feedback"]):
        n+=1
        if n<=8: print(f"   {r['grade']} {float(r['total_score']):5.1f}  {r['feedback'][:95]}")
print(f"   （合計 {n} 件）")
c.close()
