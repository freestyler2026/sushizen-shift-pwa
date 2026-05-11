"""
Manila Shift Schedule Importer
Reads Bayzat XLSX exports and upserts into base_shift_normalized.

Usage:
  DATABASE_URL=$(heroku config:get DATABASE_URL -a sushizen-shift-app) python3 import_manila_shifts.py

Requirements (install once):
  pip3 install openpyxl pandas psycopg2-binary
"""

import os
import re
import sys
import datetime
import pathlib

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL env var not set.")
    print()
    print("Run:")
    print('  DATABASE_URL=$(heroku config:get DATABASE_URL -a sushizen-shift-app) python3 import_manila_shifts.py')
    sys.exit(1)

try:
    import pandas as pd
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    print("Missing packages. Run:")
    print("  pip3 install openpyxl pandas psycopg2-binary")
    sys.exit(1)

# ── Branch code mapping ───────────────────────────────────────────────────────
OFFICE_TO_BRANCH = {
    "parañaque branch":     "PAR",
    "paranaque branch":     "PAR",
    "taft branch":          "TAFT",
    "back office ph regus": "BO",
    "central kitchen(ph)":  "CK",
    "central kitchen (ph)": "CK",
}

# ── XLSX file paths (uploaded via Cowork session) ────────────────────────────
UPLOADS_DIR = pathlib.Path(os.path.expanduser(
    "~/Library/Application Support/Claude"
    "/local-agent-mode-sessions/edc1a34e-1f7e-4d1b-afd8-984c6f9cefc4"
    "/1b8e7804-c778-4f85-8e2a-c1ba94c62fce"
    "/local_9661ba4e-0da4-486a-aaef-2c60b1f5b023/uploads"
))

FILES = [
    UPLOADS_DIR / "Shifts_Schedule_From_2025_11_01_To_2025_11_30.xlsx",
    UPLOADS_DIR / "Shifts_Schedule_From_2025_12_01_To_2025_12_31.xlsx",
    UPLOADS_DIR / "Shifts_Schedule_From_2026_01_01_To_2026_01_31.xlsx",
    UPLOADS_DIR / "Shifts_Schedule_From_2026_02_01_To_2026_02_28.xlsx",
    UPLOADS_DIR / "Shifts_Schedule_From_2026_03_01_To_2026_03_31.xlsx",
    UPLOADS_DIR / "Shifts_Schedule_From_2026_04_01_To_2026_04_30.xlsx",
    UPLOADS_DIR / "Shifts_Schedule_From_2026_05_01_To_2026_05_31.xlsx",
]


def _to_hour(val) -> int:
    """Parse Shift Start/End Time value → integer hour (0–23)."""
    if val is None or (isinstance(val, float) and val != val):
        return 0
    if isinstance(val, datetime.time):
        return val.hour
    if isinstance(val, datetime.timedelta):
        return (int(val.total_seconds()) // 3600) % 24
    s = str(val).strip()
    m = re.match(r'^(\d{1,2}):(\d{2})', s)
    if m:
        return int(m.group(1)) % 24
    return 0


def parse_file(path: pathlib.Path) -> list:
    fname = path.stem  # used as source_sheet_name
    print(f"\nParsing {path.name} …")

    df = pd.read_excel(str(path), sheet_name=0, header=0)
    df = df[df["Type"] == "Working Day"].copy()
    print(f"  Working Day rows: {len(df)}")

    rows = []
    skipped = 0
    for _, r in df.iterrows():
        emp  = str(r.get("Employee Name") or "").strip()
        off  = str(r.get("Office") or "").strip()
        wdt  = r.get("Date")
        st   = r.get("Shift Start Time")
        en   = r.get("Shift End Time")
        shnm = str(r.get("Shift Name") or "").strip()

        if not emp or pd.isna(wdt):
            skipped += 1
            continue

        if isinstance(wdt, (datetime.datetime, datetime.date)):
            work_date = str(wdt)[:10]
        else:
            try:
                work_date = str(pd.to_datetime(wdt))[:10]
            except Exception:
                skipped += 1
                continue

        rows.append({
            "city":                  "manila",
            "branch_code":           OFFICE_TO_BRANCH.get(off.lower(), ""),
            "area":                  off,
            "staff_name":            emp,
            "role":                  "",
            "work_date":             work_date,
            "start_hour":            _to_hour(st),
            "end_hour":              _to_hour(en),
            "label_sample":          shnm,
            "is_exception":          False,
            "source_spreadsheet_id": "",
            "source_sheet_name":     fname,
        })

    if skipped:
        print(f"  Skipped (no name/date): {skipped}")
    return rows


def upsert(conn, rows: list) -> int:
    if not rows:
        return 0
    cols = [
        "city", "branch_code", "area", "staff_name", "role",
        "work_date", "start_hour", "end_hour", "label_sample",
        "is_exception", "source_spreadsheet_id", "source_sheet_name",
    ]
    values = [[r[c] for c in cols] for r in rows]
    sql = f"""
    INSERT INTO base_shift_normalized ({", ".join(cols)})
    VALUES %s
    ON CONFLICT (city, work_date, staff_name, start_hour, end_hour, source_sheet_name)
    DO UPDATE SET
        branch_code  = CASE WHEN EXCLUDED.branch_code  = '' THEN base_shift_normalized.branch_code  ELSE EXCLUDED.branch_code  END,
        area         = CASE WHEN EXCLUDED.area          = '' THEN base_shift_normalized.area          ELSE EXCLUDED.area          END,
        label_sample = CASE WHEN EXCLUDED.label_sample  = '' THEN base_shift_normalized.label_sample  ELSE EXCLUDED.label_sample  END,
        is_exception = EXCLUDED.is_exception,
        ingested_at  = NOW()
    """
    with conn.cursor() as cur:
        execute_values(cur, sql, values, page_size=500)
    conn.commit()
    return len(rows)


def main():
    db_url = DATABASE_URL.replace("postgres://", "postgresql://", 1)

    print("Connecting to Heroku Postgres …")
    conn = psycopg2.connect(db_url)
    print("Connected.")

    total = 0
    for fpath in FILES:
        if not fpath.exists():
            print(f"  NOT FOUND (skip): {fpath.name}")
            continue
        rows = parse_file(fpath)
        n = upsert(conn, rows)
        print(f"  Upserted {n} rows")
        total += n

    conn.close()

    print(f"\n✓ Done. Total rows upserted: {total}")
    print("  Verify: heroku pg:psql -a sushizen-shift-app")
    print("  SELECT MIN(work_date), MAX(work_date), COUNT(*) FROM base_shift_normalized WHERE city='manila';")


if __name__ == "__main__":
    main()
