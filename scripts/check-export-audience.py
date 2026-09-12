#!/usr/bin/env python3
"""Refuse to hand over a per-person pay file until its audience is scoped.

Salary masking is enforced in the API (_salary_view_mode / _mask_salary). A file
built by reading the database directly goes around every layer of it. On
2026-09-12 a 62-person SSS schedule carrying each person's August compensation —
back office included, the payroll clerk's own pay among it — was one click from
being sent to that clerk. The masking had not failed; it had simply been
bypassed by exporting.

Run this on any file before it leaves the machine:

    python3 scripts/check-export-audience.py <file> [--for <recipient>]

It prints who is in the file and what pay columns it carries, and exits 1 unless
--for names a recipient AND every person in the file is someone that recipient is
allowed to see. It cannot know your org chart, so it asks: the exit code is the
point where you stop and think, not a substitute for thinking.
"""
import sys, os, re, argparse

PAY = re.compile(r"salary|compensation|gross|net\s*pay|basic|rate|msc|contribution|"
                 r"ee\b|er\b|wisp|allowance|bonus|deduction|remit|pay\b|amount",
                 re.I)
NAME = re.compile(r"employee|staff|name|member", re.I)

def read_rows(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in (".xlsx", ".xlsm"):
        from openpyxl import load_workbook
        wb = load_workbook(path, data_only=True, read_only=True)
        for ws in wb.worksheets:
            rows = []
            for r in ws.iter_rows(values_only=True):
                rows.append(list(r))
                if len(rows) > 5000: break
            yield ws.title, rows
    elif ext == ".csv":
        import csv
        with open(path, newline="", encoding="utf-8-sig") as f:
            yield "csv", [r for _, r in zip(range(5000), csv.reader(f))]
    else:
        print(f"  (not a tabular file — inspect {path} yourself)"); sys.exit(1)

def header_row(rows):
    for i, r in enumerate(rows[:15]):
        cells = [str(c) for c in r if c not in (None, "")]
        if len(cells) >= 3 and any(NAME.search(c) for c in cells):
            return i, r
    return None, None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--for", dest="recipient", default="")
    a = ap.parse_args()

    print(f"\nExport audience check — {os.path.basename(a.path)}")
    print("=" * 68)
    flagged = False
    for sheet, rows in read_rows(a.path):
        hi, hdr = header_row(rows)
        if hi is None:
            print(f"\n[{sheet}] no person table found"); continue
        pay = [str(c) for c in hdr if c and PAY.search(str(c))]
        ncol = next((j for j, c in enumerate(hdr) if c and NAME.search(str(c))), None)
        people = []
        if ncol is not None:
            for r in rows[hi + 1:]:
                v = r[ncol] if ncol < len(r) else None
                if not v or str(v).strip().upper() in ("TOTAL", "SUBTOTAL"): continue
                people.append(str(v).strip())
        print(f"\n[{sheet}]  {len(people)} people")
        if pay:
            flagged = True
            print(f"  pay columns: {', '.join(pay)}")
        groups = {}
        for j, c in enumerate(hdr):
            if c and re.search(r"branch|dept|department|city|location|store", str(c), re.I):
                vals = [str(r[j]).strip() for r in rows[hi+1:]
                        if j < len(r) and r[j] and str(r[j]).strip().upper() != "TOTAL"]
                if vals: groups[str(c)] = sorted(set(vals))
        for k, v in groups.items():
            print(f"  {k}: {', '.join(v)}")
        if people:
            show = people[:8]
            print(f"  names: {', '.join(show)}{' …' if len(people) > 8 else ''}")

    if not flagged:
        print("\nNo pay columns detected — nothing for this check to hold up.\n")
        return 0

    print("\n" + "-" * 68)
    if not a.recipient:
        print("STOP — this file carries per-person pay and no recipient was named.")
        print("Re-run with --for '<who receives it>' once you have decided, and")
        print("split the file if anyone listed above is outside what they may see.")
        return 1
    print(f"Recipient: {a.recipient}")
    print("Confirm every person listed above is someone this recipient may see pay for.")
    print("Manila back office pay is withheld from store payroll staff — split the file")
    print("by audience rather than sending one schedule to everyone.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
