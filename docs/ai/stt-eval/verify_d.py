"""採点の変更を確認する。書き込みは行わない（dry_run のみ）。"""
from app.services.product_scoring_service import _total_and_grade, _d_min, SCORING_PROMPT
from app.db import regrade_product_scores
import os

fails=[]
def chk(n,c,x=""):
    print(("PASS " if c else "FAIL ")+n+((" | "+str(x)) if x else ""))
    if not c: fails.append(n)

print("D の下限:", _d_min())
def g(total_per_axis):
    return _total_and_grade({k: total_per_axis for k in
        ("shape","size_consistency","completion","topping","cut_uniformity","arrangement","portioning")})
for axis, want in [(9.5,"S"),(8.0,"A"),(6.5,"B"),(5.0,"C"),(4.4,"D"),(3.5,"D"),(3.0,"D"),(2.9,"F"),(0.5,"F")]:
    tot, grade = g(axis)
    chk(f"軸{axis} → 合計{tot} → {grade}（期待 {want}）", grade==want, grade)

os.environ["PRODUCT_SCORE_D_MIN"]="35"
chk("環境変数で境目が動く（35）", _d_min()==35.0 and g(3.3)[1]=="F" and g(3.6)[1]=="D", (_d_min(), g(3.3), g(3.6)))
os.environ["PRODUCT_SCORE_D_MIN"]="abc"
chk("不正値は既定30に戻す", _d_min()==30.0)
os.environ["PRODUCT_SCORE_D_MIN"]="60"
chk("Cを飲み込む値は拒否して30", _d_min()==30.0)
os.environ.pop("PRODUCT_SCORE_D_MIN")

chk("プロンプトに not_food がある", "not_food" in SCORING_PROMPT)
chk("プロンプトが採点停止を指示", "STOP" in SCORING_PROMPT and "not a bad dish" in SCORING_PROMPT)
chk("食べかけは食品と明記", "Partly eaten" in SCORING_PROMPT)

print("\n=== 過去データの付け直し（dry run・書き込みなし）===")
plan = regrade_product_scores(dry_run=True)
print("  ", plan)
chk("Dになるのは508件前後", 480 <= plan["to_d"] <= 530, plan["to_d"])
chk("not_food になるのは209件前後", 190 <= plan["to_not_food"] <= 220, plan["to_not_food"])
chk("全件数は変わらない", plan["total"] > 98000, plan["total"])
print("\nTOTAL FAILURES:", len(fails), fails)
