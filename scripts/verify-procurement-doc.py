#!/usr/bin/env python3
"""Check docs/procurement/CK_SUPPLIER_ORDER_MAP.md against the code.

Only code-checkable claims live here. The production figures in the doc are
dated measurements and are re-measured by hand (see the doc's §9 recipes).
"""
import re, sys, os, pathlib

ROOT = pathlib.Path(os.environ.get("BACKEND_ROOT", "/Users/jaynishimura/Desktop/sushizen_shift_app_clean"))
db = (ROOT / "app/db.py").read_text()
main = (ROOT / "app/main.py").read_text()
ctrl = (ROOT / "app/services/procurement_control.py").read_text()

fails = []
def ck(claim, ok, detail=""):
    print(("  OK   " if ok else "  FAIL ") + claim + (f"  [{detail}]" if detail and not ok else ""))
    if not ok:
        fails.append(claim)

print("== §0/§2 structure ==")
ck("proc_purchase_orders.request_id is NOT NULL and references proc_requests",
   re.search(r"request_id UUID NOT NULL REFERENCES proc_requests\(id\)", db) is not None)

ck("there are exactly 5 purchase_type values",
   sorted(set(re.findall(r'"(standard|cash_purchase|ec_purchase|prepaid|direct_purchase)"', db)))
   == ["cash_purchase", "direct_purchase", "ec_purchase", "prepaid", "standard"])

print("== §0-3/§7 the requests list API still omits purchase_type ==")
m = re.search(r"def list_proc_requests\(.*?\n    sql = f\"\"\"(.*?)\"\"\"", db, re.S)
ck("list_proc_requests exists", m is not None)
if m:
    sel = m.group(1)
    ck("list_proc_requests does NOT select purchase_type (doc §0-3 / §7)",
       "purchase_type" not in sel,
       "it now returns purchase_type — doc §0-3, §7 and §8-1 must be rewritten")
    for col in ("po_status", "receiving_status", "invoice_status", "payment_status"):
        ck(f"list_proc_requests returns {col}", col in sel)

print("== §7 direct-purchases list API still omits po_status ==")
m2 = re.search(r"def list_direct_proc_purchases\(.*?(?=\ndef )", db, re.S)
ck("list_direct_proc_purchases exists", m2 is not None)
if m2:
    body = m2.group(0)
    ck("direct-purchase list does NOT return po_status (this is why ② is invisible)",
       "po_status" not in body,
       "it now returns po_status — doc §7 is stale")
    ck("direct-purchase list does NOT return receiving_status",
       "receiving_status" not in body,
       "it now returns receiving_status — doc §7 is stale")

print("== §4 delivery_date is still write-once ==")
ck("no UPDATE path appends delivery_date for POs",
   'set_parts.append("delivery_date' not in db)
upd = re.findall(r"UPDATE\s+proc_purchase_orders(.{0,600}?)(?:WHERE|RETURNING)", db, re.S | re.I)
ck("no UPDATE proc_purchase_orders statement sets delivery_date",
   not any(re.search(r"\bdelivery_date\s*=", u) for u in upd),
   "delivery_date became updatable — doc §4 and the ③ plan must be rewritten")
ck("update_proc_purchase_order_delivery takes no delivery_date argument",
   re.search(r"def update_proc_purchase_order_delivery\((.*?)\) ->", db, re.S) is not None
   and "delivery_date" not in re.search(r"def update_proc_purchase_order_delivery\((.*?)\) ->", db, re.S).group(1))

print("== §4 the supplier-confirmation revised date exists but the overdue query ignores it ==")
ck("supplier_confirmation_calls carries expected_delivery_date",
   re.search(r"expected_delivery_date", db) is not None)
m3 = re.search(r"def list_overdue_deliveries_admin\(.*?(?=\ndef )", db, re.S)
ck("list_overdue_deliveries_admin exists", m3 is not None)
if m3:
    q = m3.group(0)
    ck("overdue query keys off po.delivery_date", "po.delivery_date" in q)
    ck("overdue query does NOT consult supplier_confirmation_calls (doc §4)",
       "supplier_confirmation" not in q,
       "it now reads the revised date — doc §4 and the ③ plan are stale")
    ck("overdue query has the has_shortage second arm (doc §5 C4)",
       re.search(r"has_shortage\s*=\s*TRUE", q) is not None)

print("== §2.2 receiving status is still inferred request-wide ==")
m4 = re.search(r"def infer_receiving_status\(.*?(?=\ndef )", ctrl, re.S)
ck("infer_receiving_status exists", m4 is not None)
if m4:
    ck("one CONFIRMED row still makes the whole request CONFIRMED (doc §2.2)",
       re.search(r'if "CONFIRMED" in statuses:\s*\n\s*return "CONFIRMED"', m4.group(0)) is not None,
       "the rule changed — doc §2.2 and §8-2 must be rewritten")

print("== §5 C1: the receiving-confirm stamp is present ==")
m5 = re.search(r"def confirm_proc_receiving\(.*?(?=\ndef )", db, re.S)
ck("confirm_proc_receiving exists", m5 is not None)
if m5:
    b = m5.group(0)
    ck("it stamps receipt_confirmed_at on the linked PO", "receipt_confirmed_at" in b)
    ck("the stamp is gated on the receiving row having a po_id (doc §5 C2 cause)",
       re.search(r"po_id\s*=\s*str\(row\.get\(\"po_id\"\)[^\n]*\n[^\n]*\n\s*if po_id:", b) is not None
       or re.search(r"if po_id:", b) is not None)

print("== §3 the Direct Purchase screen's status filter ==")
FRONT = pathlib.Path(os.environ.get("FRONTEND_ROOT", "/Users/jaynishimura/Desktop/sushizen-shift-pwa"))
page = (FRONT / "src/app/admin/procurement/direct-purchases/page.tsx").read_text()
ck("the screen still offers no DRAFT filter option (doc §3 warning)",
   not re.search(r'value="DRAFT"', page),
   "a DRAFT option now exists — doc §3 is stale")

print("== §0-1 the direct-purchase create endpoint still does not make a PO ==")
m6 = re.search(r"async def api_admin_direct_purchase_create\(.*?(?=\n@app\.)", main, re.S)
ck("direct_purchase create exists", m6 is not None)
if m6:
    ck("it does not create a purchase order (doc §0-1: a human does it later)",
       "create_proc_purchase_order" not in m6.group(0))

print()
if fails:
    print(f"{len(fails)} claim(s) in the doc no longer match the code:")
    for f in fails:
        print("  - " + f)
    sys.exit(1)
print("all doc claims still match the code")
