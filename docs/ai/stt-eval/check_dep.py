"""本番に新しいサマリ項目が入っているかを直接見る。"""
import inspect
from app import db_ops_review as m
src = inspect.getsource(m._summary_for)
for k in ('"orders": orders', 'orders["delivery"]', '"required": rush_done + rush_missed',
          "context->>'slot'"):
    print(f"  {k:38s} {'あり' if k in src or k in inspect.getsource(m) else 'なし'}")
print("  _SALES_BRANCH:", getattr(m, "_SALES_BRANCH", "なし"))
r = m.generate_review("manila","TAFT","2026-09-05")
d = m.get_review(r["review_id"])
print("\n  summary keys:", sorted(d["summary"].keys()))
print("  orders:", d["summary"].get("orders"))
print("  rush  :", d["summary"].get("rush"))
p=[i for i in d["items"] if i["kind"]=="prep_time"]
print("  prep payload sample:", p[0]["payload"] if p else "なし")
