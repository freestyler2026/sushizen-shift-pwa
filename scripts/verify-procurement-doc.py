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
    # Flipped on 2026-09-26: the whole point of the change was to return these.
    # The guard now protects the fix rather than the defect.
    for col in ("po_status", "receiving_status", "stage", "days_in_stage",
                "delivery_date", "delivered_confirmed_at", "po_count"):
        ck(f"direct-purchase list returns {col} (doc §7 / §11)", col in body,
           f"{col} was dropped — the screen goes back to not knowing whether a PO exists")
    ck("the stage comes from the shared PROC_STAGE_SQL, not a copy",
       "PROC_STAGE_SQL" in body,
       "the stage was inlined or duplicated — doc §11 says one definition")

print("== §4 delivery_date is still write-once ==")
# Flipped on 2026-09-26: delivery_date is now writable, but only through the two
# paths doc §11 names, and both must capture the first promise. A third writer,
# or one that skips the COALESCE, silently erases a supplier's slip.
writers = re.findall(
    r"SET delivery_date_original = COALESCE\(delivery_date_original, delivery_date\)", db)
ck("exactly 2 writers of a PO delivery date, both preserving the original (doc §11)",
   len(writers) == 2,
   f"found {len(writers)} — a third writer, or one that dropped the COALESCE")
ck("the manual edit exists", re.search(r"^def revise_po_delivery_date\(", db, re.M) is not None)
ck("the supplier call carries its date onto the PO",
   "if exp_date:" in db and "delivery_date_revision_reason" in db)
ck("update_proc_purchase_order_delivery still does NOT touch delivery_date",
   "delivery_date" not in re.search(r"def update_proc_purchase_order_delivery\((.*?)\) ->", db, re.S).group(1),
   "that function is about email/receipt, not dates; a date argument there makes a third writer")

print("== §4 the supplier-confirmation revised date exists but the overdue query ignores it ==")
ck("supplier_confirmation_calls carries expected_delivery_date",
   re.search(r"expected_delivery_date", db) is not None)
m3 = re.search(r"def list_overdue_deliveries_admin\(.*?(?=\ndef )", db, re.S)
ck("list_overdue_deliveries_admin exists", m3 is not None)
if m3:
    q = m3.group(0)
    ck("overdue query keys off po.delivery_date", "po.delivery_date" in q)
        # Still true, and now harmless: the revised date is written onto
    # po.delivery_date at the moment the call is logged, so this query follows it
    # without reading the call log. If that write is ever removed this assertion
    # stops being harmless, which is why the writer count above is checked too.
    ck("overdue query reads po.delivery_date only (the call log writes through to it)",
       "supplier_confirmation" not in q)
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
# Flipped on 2026-09-26: the status dropdown is gone, replaced by lanes that
# reach every stage. What matters now is that nothing is unreachable.
ck("the screen has lanes, not a 4-option status dropdown (doc §11)",
   "LANES" in page and 'value="IN_REVIEW", label' not in page)

# The lanes live in lib, not the page: a Next.js page may not export them
# (lesson 124). Read them from there -- checking page.tsx for the stage names
# passed for PO_ISSUED and RECEIVED purely because those two also appear in the
# button guards, which is the wrong reason and would have kept passing after the
# lanes were deleted.
stage_lib = (FRONT / "src/lib/direct-purchase-stage.ts").read_text()
lane_block = re.search(r"export const LANES: Lane\[\] = \[(.*?)\n\];", stage_lib, re.S)
ck("LANES is defined in src/lib/direct-purchase-stage.ts", lane_block is not None,
   "the lanes moved again — doc §11 names this file")
if lane_block:
    lanes_src = lane_block.group(1)
    for stage in ("DRAFT", "SUBMITTED", "IN_REVIEW", "APPROVED_NO_PO",
                  "PO_ISSUED", "DELIVERED", "RECEIVED", "REJECTED", "CANCELLED"):
        ck(f"a lane reaches {stage}", f'"{stage}"' in lanes_src,
           f"{stage} rows would be unreachable from the screen entirely")
    ck("DELIVERED shares the Incoming lane (the kitchen still has not taken it)",
       re.search(r'"PO_ISSUED",\s*"DELIVERED"', lanes_src) is not None)
# Scoped to the functions, not the file: has_shortage is a legitimate field on
# the row type (the screen shows a "Short delivery" badge). What must never
# happen is the stage or the flag branching on it.
_logic = re.search(r"export function stageOf\(.*$", stage_lib, re.S)
ck("stage/lane/alert logic never branches on has_shortage",
   _logic is not None and "has_shortage" not in _logic.group(0),
   "67 received-and-short POs would come back as work for the kitchen")
ck("the list no longer caps at 200 (the oldest rows were past the end)",
   'limit: "200"' not in page,
   "back to 200 — orders up to 116 days old become unreachable again")

print("== §0-1 the direct-purchase create endpoint still does not make a PO ==")
m6 = re.search(r"async def api_admin_direct_purchase_create\(.*?(?=\n@app\.)", main, re.S)
ck("direct_purchase create exists", m6 is not None)
if m6:
    ck("it does not create a purchase order (doc §0-1: a human does it later)",
       "create_proc_purchase_order" not in m6.group(0))

print("== §11 the incoming figure (implemented 2026-09-26) ==")
_inc = re.search(r"def incoming_for_daily_inventory\(.*?(?=\ndef )", db, re.S)
ck("incoming_for_daily_inventory exists", _inc is not None,
   "the doc's §11 describes a function that is gone")
if _inc:
    ib = _inc.group(0)
    ck("it reads the shared stage, not its own rule (doc §11-1)",
       "{PROC_STAGE_SQL}" in ib,
       "deciding the stage locally shows the 222 pre-07-24 POs as arriving stock")
    ck("it bounds staleness (doc §11-2)", "days_past <= %s" in ib)
    ck("it reports what it held back", "stale_excluded" in ib and "not_on_sheet" in ib)
    ck("it never sums a quantity across units (doc §11-3)", "SUM(" not in ib.upper())
    ck("the sheet-name join is reduced to one row per name",
       "DISTINCT ON (LOWER(BTRIM(item_name)))" in ib,
       "538 master rows carry 413 names; a plain join triples the quantity")
_st = re.search(r"def incoming_stale_days\(.*?(?=\ndef )", db, re.S)
ck("the 3-day threshold is read at call time, not at import",
   _st is not None and "os.environ.get" in _st.group(0))
ck("the screen prints the ordered unit and marks a mismatch",
   "unit_matches" in (FRONT / "src/components/admin/AdminDailyInventoryTab.tsx").read_text(),
   "without the flag a third of the lines are silently in the wrong unit")

print()
if fails:
    print(f"{len(fails)} claim(s) in the doc no longer match the code:")
    for f in fails:
        print("  - " + f)
    sys.exit(1)
print("all doc claims still match the code")
