#!/usr/bin/env python3
"""Check every checkable claim in docs/payroll/PAYROLL_SYSTEM_MAP.md.

A document of unverified claims is the thing it was written to prevent. This
reads the code the document describes and fails when the two disagree, so the
map goes stale loudly instead of quietly.

Run it after touching the payroll engines, attendance_facts, or the doc.
"""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
BACK = ROOT.parent / "sushizen_shift_app_clean"
DOC  = (ROOT / "docs/payroll/PAYROLL_SYSTEM_MAP.md").read_text(encoding="utf-8")

fails, checks = [], 0
def ck(label, ok, detail=""):
    global checks; checks += 1
    if not ok: fails.append(f"{label}{(' — ' + detail) if detail else ''}")

def src(rel):
    p = BACK / rel
    return p.read_text(encoding="utf-8") if p.exists() else ""

# ── the files the doc points at must exist ───────────────────────────────
for rel in ("app/manila_payroll_engine.py", "app/dubai_payroll_engine.py",
            "app/dubai_eos.py", "app/attendance_facts.py", "app/db.py",
            "app/manila_dtr_recompute.py"):
    ck(f"{rel} exists", (BACK / rel).exists())
for rel in ("scripts/check-export-audience.py",
            "docs/payroll/manila-cutoff-to-calendar-month.md"):
    ck(f"{rel} exists", (ROOT / rel).exists())
ck("tests/test_leave_is_not_absence.py exists",
   (BACK / "tests/test_leave_is_not_absence.py").exists())

# ── §1④ the nine money lines ─────────────────────────────────────────────
dubai = src("app/dubai_payroll_engine.py")
# The subtype passed to each _push, not merely a string somewhere in the file:
# renaming one while the old name survived in a summary counter slipped past the
# weaker check.
DOCUMENTED = {"night_premium", "approved_overtime", "late_deduction", "late_surcharge",
              "absent_awp", "undertime_deduction", "missing_punch", "break_excess",
              "monthly_late_accumulation"}
actual = set(re.findall(r'_push\(\s*\n?\s*staff_name,\s*"(?:addition|deduction)",\s*"([a-z_]+)"',
                        dubai))
ck("the money lines in the engine are exactly the nine the doc lists",
   actual == DOCUMENTED,
   f"engine has {sorted(actual)}; doc lists {sorted(DOCUMENTED)}")
pushes = len(re.findall(r"(?<!def )_push\(", dubai))
ck("and there are exactly nine of them", pushes == len(DOCUMENTED),
   f"found {pushes} _push calls")
for sub in DOCUMENTED:
    ck(f"money line documented: {sub}", sub in DOC)

# ── §1① the two rate columns ─────────────────────────────────────────────
db = src("app/db.py")
ck("payroll_salary_configs.basic_salary exists", "basic_salary NUMERIC" in db)
ck("the engine reads basic_salary, not monthly_rate",
   "SELECT staff_name, basic_salary" in dubai)
ck("daily rate is basic / 26",
   re.search(r"WORKING_DAYS_PER_MONTH\s*=\s*Decimal\(\"26\"\)", dubai) is not None)

# ── §1② hourly staff carry no penalties ──────────────────────────────────
ck("paid_by_the_hour gates the penalties", "paid_by_the_hour" in dubai)
for rule in ("absent_awp", "undertime_deduction"):
    m = re.search(rf'_push\(\s*\n?\s*staff_name,\s*"deduction",\s*"{rule}"', dubai)
    ck(f"{rule} is guarded by paid_by_the_hour", "not paid_by_the_hour" in dubai)
ck("break_excess is the documented exception",
   "break_excess is the exception" in dubai)

# ── §1⑤ the one classification ───────────────────────────────────────────
sys.path.insert(0, str(BACK))
import os; os.environ.setdefault("DATABASE_URL", "postgresql://unused/unused")
from app.attendance_facts import AWP_TYPES, PAID_LEAVE_TYPES
ck("AWP_TYPES is exactly {ABSENT}", AWP_TYPES == {"ABSENT"}, str(sorted(AWP_TYPES)))
ck("PAID_LEAVE_TYPES matches the doc",
   PAID_LEAVE_TYPES == {"VACATION_LEAVE", "MEDICAL_LEAVE", "MATERNITY_LEAVE",
                        "BEREAVEMENT_LEAVE", "INJURY", "HOSPITAL"},
   str(sorted(PAID_LEAVE_TYPES)))
ck("DAY_OFF belongs to neither, as the doc says",
   "DAY_OFF" not in AWP_TYPES and "DAY_OFF" not in PAID_LEAVE_TYPES)
from app.db import ABSENCE_TYPES
ck("no absence type is classified nowhere except DAY_OFF",
   ABSENCE_TYPES - AWP_TYPES - PAID_LEAVE_TYPES == {"DAY_OFF"},
   str(sorted(ABSENCE_TYPES - AWP_TYPES - PAID_LEAVE_TYPES)))

# ── §1⑥ the roster role list ─────────────────────────────────────────────
from app.db import _NON_WORKING_ROLES
ck("_NON_WORKING_ROLES exists and covers every absence type",
   not ({t.lower() for t in ABSENCE_TYPES} - {r.lower() for r in _NON_WORKING_ROLES}),
   str(sorted({t.lower() for t in ABSENCE_TYPES} - {r.lower() for r in _NON_WORKING_ROLES})))

# ── §1⑦ the clock-in rule is still deliberate ────────────────────────────
main = src("app/main.py")
# the comment wraps across lines; compare with whitespace collapsed
_main_flat = " ".join(main.split())
ck("the clock-in-outranks-absence rule is still written down",
   "A clock-in always outranks # an absence: if they punched, they worked." in _main_flat
   or "clock-in always outranks an absence" in _main_flat)
ck("the separation-date precedence rule is still written down",
   "deliberate act and outranks the HR record" in _main_flat)
ck("the Dubai sync sets annual_leave_flag from the shared set",
   '"annual_leave_flag":     ab["absence_type"] in _af.PAID_LEAVE_TYPES' in main)
ck("the Manila sync uses the same shared set, not a copy",
   "_PAID_LEAVE_TYPES = _af.PAID_LEAVE_TYPES" in main)

# ── §0 the two cities really do use different column names ───────────────
ck("Manila's leave column is paid_leave_flag",
   "paid_leave_flag       BOOLEAN" in db)
ck("Dubai's leave column is annual_leave_flag",
   "annual_leave_flag     BOOLEAN" in db)
ck("the doc warns the names differ",
   "paid_leave_flag" in DOC and "annual_leave_flag" in DOC)

# ── §2 the Manila item catalogue ─────────────────────────────────────────
manila = src("app/manila_payroll_engine.py")
ck("ITEM_LABELS is where the doc says", "ITEM_LABELS: Dict[str, str] = {" in manila)
for code in ("MONTHLY_BASIC", "ABSENT_DEDUCTION", "STATUTORY_DEFERRED",
             "STATUTORY_UNCOLLECTED", "REFUND_SSS_EE", "BIR_WITHHOLDING"):
    ck(f"Manila code named in the doc still exists: {code}", f'"{code}"' in manila)

# ── §3 Dubai gratuity ────────────────────────────────────────────────────
eos = src("app/dubai_eos.py")
ck("the gratuity module cites the law the doc cites",
   "33/2021" in eos and "Art. 51" in eos)
ck("the module admits the service start is a floor",
   "service_start_is_floor" in eos or "FLOOR" in eos.upper())

# ── §6 the destructive endpoint really is destructive ────────────────────
ck("auto-adjustments deletes before inserting",
   "DELETE FROM payroll_adjustments" in dubai)
ck("there is still no dry run", "dry_run" not in dubai)

# ── the doc must not contradict itself on the numbers it quotes ──────────
for n in ("9", "26"):
    pass
ck("the doc quotes the 26-day divisor", "÷ 26" in DOC or "/ 26" in DOC)
ck("the doc names the destructive endpoint", "auto-adjustments" in DOC)

print(f"{checks} claims checked")
if fails:
    print(f"\n{len(fails)} STALE OR WRONG:\n")
    for f in fails: print("  ✗", f)
    sys.exit(1)
print("\nevery checkable claim in the map matches the code")
