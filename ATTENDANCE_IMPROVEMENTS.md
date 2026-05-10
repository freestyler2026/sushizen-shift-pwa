# OS Attendance — High-Priority Improvements

Derived from Bayzat comparison (2026-05-10). Implement in order; each item is self-contained.

---

## Feature 1 — Daily KPI Summary Cards

**Scope:** Frontend only (`src/app/admin/os-attendance/page.tsx`)

**What to build:**  
Add 4 summary cards above the filter bar in `DailyReportTab`. Computed client-side from the already-fetched `sessions` array + status filter.

| Card | Value | Note |
|---|---|---|
| On Shift | count of `sessionStatus(s) === "on_shift"` | from unfiltered `sessions` |
| Clocked Out | count of `sessionStatus(s) === "clocked_out"` | from unfiltered `sessions` |
| Not Clocked In | count of `sessionStatus(s) === "not_clocked_in"` | from unfiltered `sessions` |
| Total Hours | sum of `minutesBetween(check_in_at, check_out_at)` for clocked_out sessions | formatted as "Xh Ym" |

Cards are computed from the **unfiltered** `sessions` array (i.e. before the `statusFilter` client-side filter) so the totals always show the full-day picture regardless of current status tab.

**Implementation steps:**
1. Add `useMemo` for `kpis` in `DailyReportTab`:
   ```ts
   const kpis = useMemo(() => {
     const onShift   = sessions.filter(s => sessionStatus(s) === "on_shift").length;
     const out       = sessions.filter(s => sessionStatus(s) === "clocked_out").length;
     const notIn     = sessions.filter(s => sessionStatus(s) === "not_clocked_in").length;
     const totalMins = sessions
       .filter(s => s.check_in_at && s.check_out_at)
       .reduce((acc, s) => acc + minutesBetween(s.check_in_at!, s.check_out_at!), 0);
     return { onShift, out, notIn, totalMins };
   }, [sessions]);
   ```
2. Add a `minutesBetween` helper (already exists in `/attendance/page.tsx` — copy or import):
   ```ts
   function minutesBetween(a: string | null, b: string | null): number {
     if (!a || !b) return 0;
     return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
   }
   function fmtMins(m: number): string {
     if (m === 0) return "—";
     const h = Math.floor(m / 60), min = m % 60;
     return h > 0 ? `${h}h ${min}m` : `${min}m`;
   }
   ```
3. Render 4 KPI cards in a `grid grid-cols-4 gap-3 mb-4` above the filter bar.
4. Cards should be hidden (or show "—") while `busy === true`.

---

## Feature 2 — Date Range Report

**Scope:** Frontend only (`src/app/admin/os-attendance/page.tsx`)

**Why frontend only:** The backend `GET /api/admin/attendance/daily-report` already accepts `date_from` and `date_to` query params (implemented in `app/main.py` line 25253). The frontend currently only sends `work_date`.

**What to build:**  
Replace the single `<input type="date">` with a **mode toggle** + dual pickers.

- Toggle: `Single Day` | `Date Range`  
- Single Day mode (default): shows one date picker → sends `work_date=YYYY-MM-DD` (current behavior)
- Date Range mode: shows two date pickers (`from` / `to`) → sends `date_from=YYYY-MM-DD&date_to=YYYY-MM-DD`, drops `work_date`

**Implementation steps:**
1. Add state: `const [rangeMode, setRangeMode] = useState(false)` and `const [dateTo, setDateTo] = useState(date)` 
2. Update `load()` to build params differently based on `rangeMode`
3. When `rangeMode` is true, also include `date` column in the table (since rows span multiple days)
4. Cap date range at 31 days on the frontend to avoid huge queries
5. KPI cards in range mode show totals across the entire range

---

## Feature 3 — Late Arrival Detection

**Scope:** Backend (`app/db.py` + `app/main.py`) + Frontend

**How it works:**  
Join `os_attendance_sessions` with `shift_draft_rows` to find scheduled start hour for each staff member on a given work_date.

**Backend changes:**

### `app/db.py` — new function `get_shift_schedule_for_date`
```python
def get_shift_schedule_for_date(city: str, work_date) -> Dict[str, float]:
    """
    Returns {staff_name: start_hour} for the given city + date.
    Uses the most recently created draft version per branch for the week containing work_date.
    """
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT DISTINCT ON (r.staff_name)
                    r.staff_name,
                    r.start_hour::float AS start_hour
                FROM shift_draft_rows r
                JOIN shift_draft_versions v ON v.id = r.version_id
                WHERE lower(v.city) = lower(%s)
                  AND r.work_date = %s
                ORDER BY r.staff_name, v.created_at DESC
            """, (city, work_date))
            return {row["staff_name"]: row["start_hour"] for row in cur.fetchall()}
    finally:
        conn.close()
```

### `app/main.py` — extend daily-report response
In `api_admin_attendance_daily_report`, after fetching sessions, call `get_shift_schedule_for_date` and add `scheduled_start_hour` + `late_minutes` to each session dict.

```python
schedule_map = get_shift_schedule_for_date(city, work_date or date_from or today)
# For range queries, call once per unique date or do a range version

for session in sessions_fmt:
    sched = schedule_map.get(session["staff_name"])
    session["scheduled_start_hour"] = sched
    if sched is not None and session.get("check_in_at"):
        # Convert check_in_at to city local hour
        tz = "Asia/Manila" if city == "manila" else "Asia/Dubai"
        ci = datetime.fromisoformat(session["check_in_at"].replace("Z", "+00:00"))
        ci_local = ci.astimezone(ZoneInfo(tz))
        actual_hour = ci_local.hour + ci_local.minute / 60
        late_mins = round((actual_hour - sched) * 60)
        session["late_minutes"] = late_mins if late_mins > 0 else 0
    else:
        session["late_minutes"] = None
```

**Frontend changes (`os-attendance/page.tsx`):**
1. Add `scheduled_start_hour?: number | null` and `late_minutes?: number | null` to `AttendanceSession` type
2. In the table, replace (or supplement) the Clock In time cell:  
   - If `late_minutes > 5` → show orange "Late Xm" badge next to the clock-in time
   - If `late_minutes === 0` → show green "On Time" badge (optional — only if user wants it)
3. Add "Late" to the status filter dropdown options (client-side filter on `late_minutes > 5`)

---

## Feature 4 — Absent / No-Show Report

**Scope:** Backend (new endpoint) + Frontend (new status option)

**How it works:**  
Find staff who have a `shift_draft_rows` entry for a given date+city but have no corresponding `os_attendance_sessions` record.

**Backend — new endpoint:**
```
GET /api/admin/attendance/no-shows?city=manila&work_date=2026-05-10
```

Response:
```json
{
  "ok": true,
  "no_shows": [
    { "staff_name": "Ana Reyes", "branch_code": "MNL01", "scheduled_start_hour": 9.0 }
  ]
}
```

**Backend — new DB function:**
```python
def list_no_shows(city: str, work_date) -> List[Dict]:
    """Staff scheduled but with no attendance session for the given date."""
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT DISTINCT ON (r.staff_name)
                    r.staff_name,
                    v.branch_code,
                    r.start_hour::float AS scheduled_start_hour
                FROM shift_draft_rows r
                JOIN shift_draft_versions v ON v.id = r.version_id
                WHERE lower(v.city) = lower(%s)
                  AND r.work_date = %s
                  AND r.staff_name NOT IN (
                    SELECT staff_name FROM os_attendance_sessions
                    WHERE lower(city) = lower(%s) AND work_date = %s
                  )
                ORDER BY r.staff_name, v.created_at DESC
            """, (city, work_date, city, work_date))
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()
```

**Frontend changes:**
1. Call the `/no-shows` endpoint alongside `daily-report` in `DailyReportTab.load()`
2. Create synthetic "no-show" session objects from the response and append to the display list
3. Status badge: "No Show" (red)
4. Add "No Show" to the status filter dropdown
5. KPI card "Not Clocked In" should include no-shows in its count

---

## Feature 5 — Regularization Request Flow

**Scope:** Full-stack — new DB table, backend API, frontend (both `/attendance` staff page and `/admin/os-attendance` admin page)

**Database — new table:**
```sql
CREATE TABLE IF NOT EXISTS os_attendance_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL,
  staff_name TEXT NOT NULL,
  work_date DATE NOT NULL,
  session_id UUID REFERENCES os_attendance_sessions(id) ON DELETE SET NULL,
  requested_check_in TEXT,   -- "HH:MM" local time string, optional
  requested_check_out TEXT,  -- "HH:MM" local time string, optional
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_os_corrections_city_date
  ON os_attendance_corrections(city, work_date);
CREATE INDEX IF NOT EXISTS idx_os_corrections_status
  ON os_attendance_corrections(status);
```

**Backend API endpoints:**
- `POST /api/attendance/corrections` — staff submits request (auth: any attendance role)
- `GET /api/admin/attendance/corrections?city=manila&status=pending` — admin lists requests
- `PATCH /api/admin/attendance/corrections/{id}` — admin approves/rejects (+ optional auto-apply)

**Staff page (`/attendance/page.tsx`) changes:**
1. After clocked-out state, add "Need a correction?" collapsible section
2. Form fields: "What needs correcting?" (clock-in / clock-out / both), new time, reason
3. Submit button → POST to `/api/attendance/corrections`
4. Show confirmation: "Your request has been submitted"

**Admin page (`/admin/os-attendance/page.tsx`) changes:**
1. New tab: "Corrections" (between "Daily Report" and "GPS Settings")
2. Badge count on tab label: `Corrections (3)` when pending count > 0
3. List pending requests with: Staff, Date, Requested times, Reason, Approve / Reject buttons
4. On Approve: `PATCH /api/admin/attendance/corrections/{id}` with `{ status: "approved", apply: true }` → auto-applies the correction to the session
5. On Reject: same PATCH with `{ status: "rejected" }`
6. Completed (approved/rejected) requests move to a separate "History" sub-list

---

## Implementation Order

```
Feature 1 (KPI cards)       — ~1h  — frontend only, no deploy needed
Feature 2 (Date range)      — ~1h  — frontend only, no deploy needed
Feature 3 (Late detection)  — ~2h  — backend + frontend, Heroku deploy required
Feature 4 (No-shows)        — ~2h  — backend + frontend, Heroku deploy required
Feature 5 (Regularization)  — ~4h  — full-stack, Heroku deploy required
```

Features 1 & 2 can ship immediately via Vercel push.  
Features 3–5 require a Heroku backend deploy after backend changes.

---

## Files to Modify

| File | Features |
|---|---|
| `src/app/admin/os-attendance/page.tsx` | 1, 2, 3, 4, 5 |
| `src/app/attendance/page.tsx` | 5 |
| `app/db.py` | 3, 4, 5 |
| `app/main.py` | 3, 4, 5 |
