# Business Context — Sushi ZEN Workforce OS

This document explains **why** each module exists, the regulatory constraints it addresses,
and decisions that would not be obvious from reading the code alone.

---

## Company structure

**Sushi ZEN Group** operates two city clusters:

| City | Branches | Entity type |
|------|----------|-------------|
| Dubai | Business Bay, JLT, Al Barsha, Al Hudaiba (Bur Dubai), Arjan, Motor City | UAE mainland (DMCC-adjacent) |
| Manila | Taft, Paranaque, Cubao, + Central Kitchen (CK) | Philippine corporation |

Dubai and Manila operate as separate legal entities with separate payrolls, P&L, and procurement.  
The Workforce OS manages both from a single web app with city-scoped access.

---

## Module-by-module context

### Shift scheduling (`/week`, `/admin/draft`)

**Why it exists**: HQ sets schedules centrally. Dubai branch managers cannot modify the
published schedule — all changes go through HQ to control overtime costs and ensure UAE
labor law compliance (Art. 65, maximum 8h/day, 48h/week).

**Critical constraint**: The `/week` page is the primary tool used by ~60 staff every day
to check their shifts. Any breakage directly blocks work. This is why it is flagged Critical
in CLAUDE.md.

---

### Attendance / DTR (`/attendance`, `/admin/analytics`)

**Dubai**: Clock-in/out is recorded in PH time for historical reasons (the system was built
for Manila first). The DTR engine's `NSD_START=22` is correct — this is 22:00 **local Dubai
time** expressed as an hour offset. Do NOT apply `AT TIME ZONE 'Asia/Manila'` to Dubai DTR
timestamps; they are already stored in local time with a misleading +00 timezone label.

**Manila**: Timestamps are PHT (UTC+8) stored with a +00 label — the same pattern.  
See `docs/ai/` → Manila DTR Timezone note.

**Night Shift Differential (NSD)**: Philippines labor law (RA 7641 / DOLE rules) mandates
10% premium for hours worked between 22:00 and 06:00. The NSD computation is in `db.py`
and feeds the payroll sheet. This is a legal requirement, not a business choice.

---

### Procurement (`/store/procurement`, `/admin/procurement`)

**Why it exists**: Manila CK supplies commissary items to stores daily. Dubai stores order
directly from external suppliers. Both flows needed a digital trail for:
1. Cost accountability (qty received vs ordered)
2. Management approval before large purchases
3. Supplier invoice matching (Google Drive integration)

**Google Drive integration**: Purchase order PDFs and supplier invoices are auto-uploaded to
Google Drive folders for each city. Service account credentials are stored as Heroku config vars
(`Dubai_Supplier_Invoice_Template_JSON`, `Manila_Supplier_Invoice_Template_JSON`, etc.).

---

### Daily Inventory (`/admin/daily-inventory`)

**Why it exists**: Manila kitchen and stores run a daily count to:
1. Track stock against par levels (trigger re-orders before stockouts)
2. Provide month-end inventory valuation (cost × qty on hand)

**How it works**: Staff enter quantities per item per shift. The system alerts when stock
falls below `min_level` (critical) or `par_level` (reorder needed). The detail view can
auto-generate procurement requests for items below par.

**Unit cost field**: Each item has a `unit_cost` that management sets in the Item Master.
In the detail/history view, the system multiplies `qty × unit_cost` to show inventory value.
This replaces the separate month-end Excel valuation sheet.

---

### Payroll (`/admin/payroll`, `/admin/finance`)

**Manila payroll**:
- Computed monthly from the DTR (attendance log)
- Includes: Basic, NSD premium, overtime (OT), night differential, deductions (SSS, PhilHealth, Pag-IBIG, tax)
- Output: Google Sheets payroll template auto-populated via the `payroll-data` service account
- **DOLE compliance**: Mandatory deductions are enforced at the code level, not optional

**Dubai payroll**:
- Computed from the Bayzat HR platform data (synced via Drive)
- Gratuity computations follow UAE Labour Law (Art. 51–56)
- End-of-service benefit (EOSB) is tracked separately

---

### Management P&L (`/admin/finance`)

**Why it exists**: Owners review weekly P&L vs labor cost target. The dashboard pulls:
1. Labor cost ratio: `total_labor_cost / net_sales`
2. POS sales data from Foodics (Dubai) or Google Sheets (Manila)
3. Target: set manually per store per period

**Performance note**: The `build_pl_vs_target_view()` function in `pl_finance_bridge.py`
opens ~6 DB connections per call. As of 2026-08, the frontend was refactored to embed
the P&L view in the labor-ratio response to eliminate a redundant HTTP call. The fallback
probe loop was also capped at 1 month (was 3) to reduce DB load.

---

### NTE / Employee Conduct (`/admin/employee-cases`)

**Why it exists**: PH and UAE labor law both require a formal progressive discipline process
before termination. Skipping the "twin notice rule" (show-cause + NTE + hearing) exposes
the company to labor cases.

**NTE v2 schema** (implemented 2026-08):
- `violation_catalog` table stores 125 violation codes across 14 categories
- Each violation has `severity_label` (Minor / Less Grave / Grave / Very Grave)
- Penalty matrix follows Art. 297 (PH) or Art. 39 (UAE) depending on market
- `requires_codi`: CON-015 (gross misconduct) bypasses standard NTE and goes to a
  CODI committee (Committee on Discipline). Selecting it in the UI blocks standard issuance.

**UAE Art. 44**: Certain violations allow termination without gratuity. These are flagged
with `ae_art44_dismissal = TRUE` in the catalog and displayed to HQ when composing NTE.

---

### CCTV / AI Camera Monitoring (planned)

**Hardware**: Jetson Orin Nano Super + 8× Tapo C210 cameras  
**Location**: Dubai 5 branches + Manila CK + Manila stores

**Planned detection capabilities** (not yet implemented):
1. Unauthorized access (after hours)
2. Staff without hygiene gear (hair net, gloves)
3. Incorrect food handling
4. Temperature alert cross-reference
5. Idle time detection
6. Customer waiting time estimate
7. Waste / portion control monitoring
8. Security: cash handling visibility

**Status**: Hardware on order as of 2026-08. DeepStream (NVIDIA) pipeline designed.
The `CCTV_AUTO_INGEST_ENABLED=false` config var on Heroku controls the placeholder ingest.

---

## Stakeholders and access levels

| Role | Who | What they can do |
|------|-----|-----------------|
| HQ | Yukihiro N., Yusuke U., Ayako S., Yuri Y. | Full access to all cities and admin functions |
| Dubai Management | Branch managers | Dubai shifts, attendance, procurement approval |
| Manila Management | Dipesh P., Jasmine S., Mary G., Lyssa R., Rafael L., Sherileene S. | Manila shifts, attendance, procurement approval |
| HR Manager | Shari / Camilla | Staff records, NTE, payroll view |
| Store Staff | All kitchen/floor staff | My Shift, My Pay, Attendance clock-in |

**Decision authority**:
- Schedule changes: HQ only
- Supplier approval (Dubai): Dubai Management or HQ
- Salary disputes: HR Manager escalates to Yukihiro
- System changes: Yukihiro (sole developer as of 2026-08)

---

## Known technical debt / future work

- `main.py` (31,500 lines) and `db.py` (45,700 lines) should be split into modules by domain
- Heroku Essential plan (~25 DB connections) is near its limit on peak hours; consider connection pooling (PgBouncer) or upgrading to Standard plan
- NTE violation catalog: 13 of 14 seed JSON files still need per-item `legal_ground_ph/ae` and `ae_art44_dismissal` fields filled in
- Dubai inventory system is separate from Manila Daily Inventory (not yet unified)
- Camera AI integration is pending hardware arrival
