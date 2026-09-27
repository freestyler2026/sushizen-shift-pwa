#!/usr/bin/env python3
"""Check docs/inventory/INVENTORY_SYSTEM_MAP.md against the code.

Only code-checkable claims live here. The production figures in the doc are
dated measurements (2026-09-27) and are re-measured by hand — the doc's §8
carries the SQL for that.

A FAIL does not mean the code is wrong. It means the code moved and the doc
now lies. Fix both in the same commit.
"""
import re, sys, os, pathlib

BACK = pathlib.Path(os.environ.get("BACKEND_ROOT", "/Users/jaynishimura/Desktop/sushizen_shift_app_clean"))
FRONT = pathlib.Path(os.environ.get("FRONTEND_ROOT", "/Users/jaynishimura/Desktop/sushizen-shift-pwa"))

inv_db = (BACK / "app/inventory_db.py").read_text()
inv_api = (BACK / "app/inventory_api.py").read_text()
daily_api = (BACK / "app/daily_inventory_api.py").read_text()
daily_db = (BACK / "app/db_daily_inventory.py").read_text()
store_sup = (BACK / "app/db_store_supplier.py").read_text()
db = (BACK / "app/db.py").read_text()
main = (BACK / "app/main.py").read_text()

fails = []
def ck(claim, ok, detail=""):
    print(("  OK   " if ok else "  FAIL ") + claim + (f"  [{detail}]" if detail and not ok else ""))
    if not ok:
        fails.append(claim)

print("== §0 the four stock systems are still four ==")
ck("A: _inv_post_ledger_entries writes inv_stock_ledger",
   "INSERT INTO inv_stock_ledger" in inv_db)
ck("B: get_ck_stock_view sums adjustments in Python, not SQL",
   re.search(r"def get_ck_stock_view\(.*?adj_qty_total \+= ", inv_db, re.S) is not None)
ck("C: ck_inventory_entries has no theoretical qty column in its DDL",
   re.search(r"CREATE TABLE IF NOT EXISTS ck_inventory_entries\s*\((?:(?!\)\s*;).)*theoretical", db, re.S) is None)
ck("D: daily_inv_entries DDL has no theoretical qty",
   re.search(r"CREATE TABLE IF NOT EXISTS daily_inv_entries\s*\((?:(?!\)\s*;).)*theoretical", daily_db, re.S) is None)
ck("C and D share daily_inv_report_items as the item master",
   "daily_inv_report_items" in db and "daily_inv_report_items" in daily_db)

print("== §1-1 the ledger is still one-way (no receiving -> ledger path) ==")
ck("no RECEIVING/RECEIPT_IN/STOCK_IN event type exists in inventory_db",
   not re.search(r"event_type[\"']?\s*:\s*[\"'](RECEIVING|RECEIPT_IN|STOCK_IN|PURCHASE_IN)[\"']", inv_db),
   "a stock-in event type appeared — §1-1 and §2 must be re-measured")
ck("proc_receiving_items is never posted to inv_stock_ledger",
   "proc_receiving_items" not in inv_db,
   "receiving now reaches inventory_db — the doc's core claim changed")

print("== §1-2 inv_stock_balance_daily is still write-only ==")
# "DELETE FROM x" also matches a naive FROM search — only count reads.
reads = [m for m in re.finditer(r"(?<!DELETE )FROM\s+inv_stock_balance_daily", inv_db)]
ck("inv_stock_balance_daily is SELECTed only by the dedupe merge",
   len(reads) <= 1, f"{len(reads)} SELECT sites")

print("== §1-4 units are still not converted ==")
ck("storage_to_ingredient is never used in arithmetic",
   not re.search(r"storage_to_ingredient\s*[*/]|[*/]\s*storage_to_ingredient", inv_db + inv_api))
# It is the last function in the file, so the lookahead needs \Z as well.
m = re.search(r"def sync_disposal_report_to_ledger\(.*?(?=\ndef |\Z)", inv_db, re.S)
ck("sync_disposal_report_to_ledger exists", m is not None)
if m:
    body = m.group(0)
    ck("sync_disposal_report_to_ledger still ignores the line's unit (§2 bug)",
       not re.search(r"line\.get\(\s*[\"']unit[\"']", body),
       "it now reads the unit — §2 may be fixed; re-measure MIN(delta_qty)")

print("== §1-5 authorization gaps ==")
ck("both auth gates exist and default to enforce (doc's correction)",
   '("/api/admin/", _ADMIN_GATE_ALLOW, "ADMIN_AUTH_GATE", "enforce"' in main
   and '("/api/store/", _STORE_GATE_ALLOW, "STORE_AUTH_GATE", "enforce"' in main)
par_block = main[main.find('@app.get("/api/admin/management/par-levels")'):]
par_block = par_block[:par_block.find('/api/admin/management/par-levels/seed') + 2000]
ck("management/par-levels handlers still have no actor check",
   "_actor_from_token_request" not in par_block and "_require_" not in par_block,
   "an auth check appeared — update §1-5")
# The router carries the /api/daily-inventory prefix, so the decorators are bare.
for path in ('@router.post("/save")', '@router.post("/submit")'):
    i = daily_api.find(path)
    ck(f"{path} still gated by inventory.read only",
       i > 0 and 'permission="inventory.read"' in daily_api[i:i + 400],
       "permission changed — update §1-5")

print("== §1-6 ensure_ck_inventory_tables has no memo flag ==")
m = re.search(r"def ensure_ck_inventory_tables\(.*?(?=\ndef )", db, re.S)
ck("ensure_ck_inventory_tables exists", m is not None)
if m:
    ck("ensure_ck_inventory_tables still runs DDL on every call",
       not re.search(r"_CK_INVENTORY_READY|if\s+_\w*READY", m.group(0)),
       "a guard appeared — §1-6 is fixed, update the doc")

print("== §4 inv_counts is the only closed loop ==")
ck("close_inv_count posts COUNT_ADJUSTMENT back to the ledger",
   re.search(r"def close_inv_count\(.*?_inv_post_ledger_entries", inv_db, re.S) is not None)

print("== §5 daily inventory -> store supplier orders ==")
ck("db_store_supplier reads daily_inv_entries", "daily_inv_entries" in store_sup)
ck("_STORE_TO_BRANCH still maps store codes to branch codes",
   "_STORE_TO_BRANCH" in store_sup)

print("== §3 orphaned routes ==")
def inbound(route, exclude):
    hits = []
    for p in (FRONT / "src").rglob("*.ts*"):
        if exclude in str(p):
            continue
        if route in p.read_text():
            hits.append(str(p.relative_to(FRONT)))
    return hits
r = [h for h in inbound("/admin/inventory/recipes", "src/app/admin/inventory/recipes/")]
ck("/admin/inventory/recipes is still unreachable from any nav", not r, ",".join(r))
r2 = [h for h in inbound('"/store/ck-production"', "src/app/store/ck-production/")
      if "access-channels" not in h]
ck("/store/ck-production is still not linked from any nav", not r2, ",".join(r2))

print()
if fails:
    print(f"{len(fails)} claim(s) in docs/inventory/INVENTORY_SYSTEM_MAP.md no longer match the code:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("docs/inventory/INVENTORY_SYSTEM_MAP.md matches the code.")
