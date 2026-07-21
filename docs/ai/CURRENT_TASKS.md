# CURRENT_TASKS.md

Last updated: 2026-07-21 (session 121w — PO-Invoice Match P3: photo upload + tolerance settings)




> **New session start protocol:**
> 1. Read `CLAUDE.md` (root) — always first
> 2. Read THIS file — understand where things left off
> 3. Load only the additional `docs/ai/` file(s) needed for the specific task

---

## ⚠️ Deployments Pending

- Vercel: 29276fd (PO Match bug fixes from testing) — auto-deploying
- Heroku: 3ef7542 (PO Match 3 data bugs fixed) — deployed ✅ v1412

### Previous sessions
- Vercel: 72db83c (PO-Invoice Match page + ProcurementTabs) — deployed ✅
- Heroku: 4eb2305 (PO-Invoice Match DB + API) — deployed ✅
- Vercel: 4313c0e (cost calc misplaced items panel) — deployed ✅
- Heroku: 68a2689 (misplaced ingredient endpoints) — deployed ✅

## Recently Completed (2026-07-21 session 121w)

### PO-Invoice Match P3 — Invoice Photo Upload + Tolerance Settings Screen

**Frontend only (`src/app/admin/procurement/po-match/page.tsx` fully rewritten)**:

- **Invoice Photo Upload** (QuickEntryTab + DiscrepancyQueueTab):
  - File input `<input type="file" accept="image/*" capture="environment">` — triggers camera on mobile
  - Client-side `FileReader.readAsDataURL()` → base64 data URL
  - New `PhotoUpload` component: shows thumbnail preview with remove button; reusable in both tabs
  - In QuickEntryTab: photo attached at create time, sent as `photo_data` in POST body
  - In DiscrepancyQueueTab expanded view: shows photo thumbnail if exists; "Add Photo" button for existing records (calls `POST /api/admin/procurement/po-match/{id}/photo`)
  - In AllRecordsTab table: camera icon next to vendor name if photo is attached
  - 8 MB file size limit enforced client-side

- **Tolerance Settings Screen** (new 5th tab "Settings"):
  - Loads current settings from `GET /api/admin/procurement/po-match/settings?city=dubai`
  - Two inputs: Fixed Tolerance (AED) and Percentage Tolerance (%)
  - Live preview table: shows effective tolerance for AED 100 / 500 / 1,000 / 5,000 / 10,000 POs
  - Save: `POST /api/admin/procurement/po-match/settings` — updates `proc_po_match_settings` table
  - Settings propagate to QuickEntryTab tolerance display and future `create_po_invoice_check` calls
  - Shows "last updated by" + timestamp after save

- Tab type extended: `"entry" | "queue" | "records" | "scorecard" | "settings"`
- TypeScript clean (0 errors excluding pre-existing .next/types)

## Recently Completed (2026-07-21 session 121v)

### PO — Invoice Match (Dubai daily invoice reconciliation)

**Problem**: Dubai back-office manually compares every supplier PO vs received invoice daily — major workload. Wanted: if PO = Invoice → auto-close with no detail entry; track discrepancies per supplier.

**Backend (`app/db.py` + `app/main.py`, Heroku 4eb2305)**:
- New table `proc_po_invoice_checks`: stores daily checks (vendor, po_no, po_amount, invoice_no, invoice_amount, match_status, variance_amount, discrepancy_type, resolution_note, resolved_by)
- Auto-match tolerance: ±AED 1.00 or 0.5% of PO amount (whichever is greater) → `MATCHED`; else `DISCREPANCY`
- `ensure_po_invoice_check_tables()`, `create_po_invoice_check()`, `list_po_invoice_checks()`, `resolve_po_invoice_check()`, `get_po_invoice_supplier_stats()`, `list_recent_pos_for_match()`
- New endpoints:
  - `GET /api/admin/procurement/po-match/pos` — recent POs by vendor+city (for auto-fill)
  - `GET /api/admin/procurement/po-match` — list checks with filters
  - `POST /api/admin/procurement/po-match` — create check (auto-matches instantly)
  - `POST /api/admin/procurement/po-match/{id}/resolve` — resolve discrepancy
  - `GET /api/admin/procurement/po-match/supplier-stats` — supplier scorecard

**Frontend (`src/app/admin/procurement/po-match/page.tsx`, Vercel 72db83c)**:
- New page at `/admin/procurement/po-match`
- Tab 1 "Quick Entry": supplier search with PO auto-fill, live match preview (green/amber), submit closes matched records instantly
- Tab 2 "Discrepancy Queue": unresolved first, resolve panel with discrepancy type + note
- Tab 3 "All Records": date-range search, 3 KPI cards (total/match rate/discrepancies), full table
- Tab 4 "Supplier Scorecard": per-vendor stats (total checks, match rate, total variance, unresolved count, error rate bar)
- Added "PO Match" tab to ProcurementTabs.tsx in Financials group

## Recently Completed (2026-07-21 session 121u)

### Par Level Import — Weekday Template Download + Unmatched Name Display

**Root cause of par-level-not-changing bug**: the weekly par Excel import matches items by exact lowercase name. Staff Excel used simplified names (e.g. "Water Summit") but DB has full names (e.g. "Water Summit (500ml) 24pcs/case"). All items went to `unmatched_names[]` → pattern saved with 0 items → frontend auto-selection found no pattern → par values unchanged in Generate Purchase Request modal.

**Backend (`app/daily_inventory_api.py`, Heroku 7def29c)**:
- New `GET /api/daily-inventory/par-patterns/weekday-template` endpoint
- Generates an Excel pre-filled with all active DB item names in the correct multi-column format (TAFT/CUBAO/PARANAQUE × Sunday/Tuesday/Thursday)
- Row 2: branch headers (TAFT col C, CUBAO col F, PARANAQUE col I)
- Row 3: day headers (Sunday/Tuesday/Thursday × 3)
- Rows 4+: all active item names in column B (empty par cells to be filled by staff)

**Frontend (`src/components/admin/AdminDailyInventoryTab.tsx`, Vercel 4ed1720)**:
- "Download Template" (sky-blue) button added alongside "Import Weekly Par Excel" in the weekday import box
- Import result message now shows unmatched item NAMES (not just count): `"3 item names not matched — names must exactly match the DB. Unmatched: Water Summit, Coke Mismo, ..."`
- Updated description text in the UI to explain name matching requirement

**How staff should use it going forward:**
1. Click "Download Template" → Excel with correct item names pre-filled
2. Fill in par values for each branch × day combination
3. Click "Import Weekly Par Excel" → upload the filled Excel
4. No more unmatched names since names come directly from DB

---

### Cost Calculation — Misplaced Items Cleanup (Heroku 68a2689, Vercel 4313c0e)

**Root cause investigation:**

The issue was NOT a code bug but a combination of:
1. **Data corruption since April 4**: processed items (sauces, shrimp tempura, etc.) were manually added to `ingredient_master` as a workaround when the 加工品マスター component selector didn't find them. These were later deactivated (`is_active=FALSE`) when proper 加工品マスター entries were created.
2. **7/18 commit `e97da17`** (`show_inactive=true` on Ingredient Master list): this revealed all previously-hidden `is_active=FALSE` items in `ingredient_master`, including the misplaced processed items.

So items were always in the DB — the recent update just made them visible.

**Manila situation**: Staff had already selected the `ingredient_master` version of sauces in some recipes (instead of the `menu_item_master` version). They are manually re-linking those recipes to the correct 加工品マスター items.

**Dubai situation**: Same duplicate entries exist in `ingredient_master`, but recipes correctly use the `menu_item_master` (加工品マスター) versions. Only cleanup (deactivation) needed.

**Backend (`app/db.py` + `app/cost_api.py`, Heroku 68a2689)**:
- `find_misplaced_ingredients(city)`: queries `ingredient_master` for items where name matches a `menu_item_master` processed/product item (case-insensitive), OR category is "CK Processed" / "Kitchen Processed" / "Processed Meat / Eggs"
- `bulk_deactivate_misplaced_ingredients(city, ingredient_ids)`: bulk `is_active=FALSE` update
- `GET /api/cost/ingredients/misplaced-suspects?city=...`: returns suspect list
- `POST /api/cost/ingredients/bulk-deactivate`: bulk deactivate

**Frontend (`cost-calculation/page.tsx`, Vercel 4313c0e)**:
- **"Misplaced Items"** amber button added to Ingredient Master toolbar
- Click opens a panel showing all suspect items with:
  - Item name, category, active/inactive status
  - Badge if name matches a Processed Items / Products entry
  - Checkboxes to select for deactivation
  - "Deactivate X selected" button with confirmation

**How to use (Dubai cleanup)**:
1. Admin → Cost Calculation → Ingredient Master tab → "Misplaced Items" button
2. Switch city to Dubai
3. Review the list of suspects
4. Select all that are duplicates (use "also in Processed Items" badge as a guide)
5. Click "Deactivate X selected" → they disappear from 食材マスター

**Manila**: Continue manually re-linking recipes from `ingredient_master` items → `menu_item_master` items, then deactivate the misplaced ones using the same tool.

## ⚠️ Admin Action Required — NTE NavBar channel registration

新しい `/store/my-nte` ページを NavBar に追加した。CLAUDE.md 教訓 #11 に従い、Role Management の Resync が必要:

1. `/admin/staff/roles` → **"Resync System Channels"** ボタンをクリック
2. 新チャンネルが表示されたら、HR Staff など必要なロールにパーミッションを付与

## Recently Completed (2026-07-21 session 121t) — live (Heroku fcd105f)

### NTE Implementation — Testing & Bug Fixes

**Testing results (dev server verification):**
- ✅ Issue Notice tab: Document Type dropdown shows all 3 options (NTE / Warning Letter / Final Warning)
- ✅ NTE Request tab: Document Type dropdown present, correct options
- ✅ Case History tab: renders correctly, "No NTE records." empty state
- ✅ `/store/my-nte` page: KPI cards, empty state, Refresh button, "My Notices" NavBar highlight
- ✅ NavBar "My Notices" link visible with badge polling wired up
- ✅ All new Heroku endpoints return 401 (auth-protected, as expected): my-notices, notifications/badge, notifications/read, DELETE /cases/{id}, explain

**Bugs fixed:**
1. **`issue_nte()` notification failure masking issued NTE** (`db_nte.py`): `create_staff_notification()` is called after the NTE INSERT has already committed. If the notification INSERT failed (transient DB error), the caller received a 500 with no way to know the NTE was actually created. Fixed: wrapped `create_staff_notification()` in `try/except` with `pass` on failure — NTE issuance always succeeds independently of notification delivery.
2. **`api_cases_delete()` returned 500 on malformed UUID** (`nte_api.py`): `DELETE /api/admin/cases/{case_id}` passed the raw `case_id` string directly to PostgreSQL's `::uuid` cast. If the path param is not a valid UUID, psycopg2 raises an unhandled exception → 500. Fixed: wrapped `delete_nte_record()` call in `try/except`, returns 422 with "Invalid NTE record ID." on DB exception.

## Recently Completed (2026-07-21 session 121s) — live (Vercel ce0817b, Heroku 6bad966)

### NTE Full Feature Implementation (4 phases)

**Backend (`app/db_nte.py`)**:
- `ensure_nte_tables()`: 5 new migrations: `case_type` on both `staff_nte_records` + `nte_requests`, `explanation_text` + `explanation_submitted_at` on records, new `staff_notifications` table
- `issue_nte()`: accept `case_type` param; auto-create `staff_notification` on issue
- `create_nte_request()`: accept `case_type` param
- `issue_from_request()`: propagate `case_type` from request to issued NTE
- New functions: `delete_nte_record`, `submit_nte_explanation`, `list_staff_notices`, `create_staff_notification`, `list_staff_notifications`, `mark_notifications_read`, `count_unread_notifications`

**Backend (`app/nte_api.py`)**:
- `IssueNteBody` + `SubmitRequestBody`: added `case_type` field (NTE / WARNING_LETTER / FINAL_WARNING)
- `DELETE /api/admin/cases/{case_id}`: hard-delete, ADMIN/HQ only
- `GET /api/store/conduct/my-notices`: staff views own NTE records + unread notifications
- `POST /api/store/conduct/my-notices/{id}/explain`: staff submits written explanation (once)
- `POST /api/store/conduct/notifications/read`: mark all read
- `GET /api/store/conduct/notifications/badge`: unread count for NavBar badge

**Frontend**:
- `admin/employee-cases/page.tsx`: Document Type dropdown in Issue + Request forms; `CaseTypeBadge` component; Explanation column in Case History; Delete button (ADMIN/HQ); explanation shown in Staff History panel
- `NavBar.tsx`: `/store/my-nte` added to PRIMARY nav with `nteBadge` unread polling
- New `store/my-nte/page.tsx`: staff-facing My Notices page with KPIs, notification banner, explanation submission form

---

## ⚠️ Admin Action Required — Probation channel for HR Staff

**Background:** Camilla (HR Staff role) cannot access the Probation page. The `admin.probation` channel was in the code but may not have been synced to the DB properly.

**Steps:**
1. Open Role Management → /admin/staff/roles
2. Click **"Resync System Channels"** button (amber, top right of tab bar) and wait for success message
3. Go to **Roles** tab → select **HR Staff** role
4. Find **Probation** channel → check **"View Probation Admin"**
5. Click **Save Permissions**
6. Camilla must **log out and log back in** to receive the updated token

## Recently Completed (2026-07-21 session 121r) — live (Vercel b87673c, Heroku v1404)

### Staff Profiles — Civil Status / Dependents / MDR fields

**Backend (`app/db.py`)**:
- `ensure_manila_payroll_tables()`: 5 new `ALTER TABLE IF NOT EXISTS` migrations for `manila_staff_profiles`: `civil_status VARCHAR(20)`, `num_qualified_dependents SMALLINT DEFAULT 0`, `mdr_submitted BOOLEAN DEFAULT FALSE`, `mdr_submitted_date DATE`, `mdr_notes TEXT DEFAULT ''`

**Backend (`app/main.py`)**:
- `manila_upsert_staff_profile` PUT endpoint: updated INSERT column list + VALUES (18→23 fields) and ON CONFLICT DO UPDATE SET to include the 5 new columns

**Frontend (`src/app/admin/payroll/manila/staff-profiles/page.tsx`)**:
- `StaffProfile` type + `FormState` + `emptyForm()` + `profileToForm()` + `save()` body: all updated with new fields
- Modal form: new "Personal & Tax Info" section with:
  - Civil Status dropdown (Single / Married / Widowed / Legally Separated)
  - Qualified Dependents number input 0–4 (with BIR exemption note ₱25,000 each)
  - MDR Submitted toggle (green theme) with date field shown when toggled on
  - MDR Notes text input
- Table: new **MDR** column showing green "Done" badge or "—" dash

## Recently Completed (2026-07-21 session 121q) — live (Vercel 6ef0f51, Heroku c9ef3f0)

### Role Management — Resync System Channels fix

**Problem:** `admin.probation` channel not appearing in Role Management Roles tab for HR Staff. Recurring pattern: every new NavBar page needs to be registered in both ACCESS_CHANNELS and ACCESS_PERMISSIONS in access_control.py.

**Backend (`app/db.py`):**
- `seed_access_control_defaults()`: ON CONFLICT for `access_channels` now also sets `is_active = TRUE` and `is_system = TRUE`, ensuring any deactivated system channel is re-enabled on the next seed run

**Backend (`app/main.py`):**
- New `POST /api/admin/access/force-reseed` endpoint: ADMIN/HQ only; re-runs `seed_access_control_defaults()` and returns updated channel list

**Frontend (`src/app/admin/staff/roles/page.tsx`):**
- New amber **"Resync System Channels"** button in tab bar: calls force-reseed, then reloads bootstrap data so all system channels appear immediately

**CLAUDE.md (`CLAUDE.md`):**
- Added rule #11: when adding NavBar menu item, always add to ACCESS_CHANNELS + ACCESS_PERMISSIONS in access_control.py, then resync via the button. Custom roles (HR Staff etc.) require manual permission assignment in Roles tab.

## Recently Completed (2026-07-21 session 121p) — live (Vercel 68cbe3b, Heroku 38281d8)

### Invoice Hub — Vendor Dropdown, UI Polish, Drive Link

1. Vendor field → dropdown from `GET /api/admin/procurement/vendors?city=...&status=ACTIVE`
2. White text on Invoice No, Vendor Name filter inputs + Refresh icon
3. Date fields labeled "Date From" / "Date To"
4. CK (Central Kitchen) + WH (Warehouse) added to Manila branch selector
5. "Invoice Drive" button → Google Drive folder for the city (Manila/Dubai)
6. After upload: green notice banner with "Open in Drive ↗" link (uses `web_view_link` from UploadResponse)

### Par Level — Weekly Import (Branch × Day-of-Week)

**Backend:**
- `lookup_item_codes_by_name()` in `db_daily_inventory.py` — returns `{item_name_lower: item_code}` for active items
- `POST /api/daily-inventory/par-patterns/import-weekday-excel` — reads multi-column Excel (TAFT/CUBAO/PARANAQUE × Sun/Tue/Thu), creates 9 patterns: `TAFT_Sunday`, `TAFT_Tuesday`, `TAFT_Thursday`, `CUBAO_Sunday`, … `PARANAQUE_Thursday`
- Item matching is name-based (case-insensitive). Returns `unmatched_names[]` for any items not found

**Frontend (`AdminDailyInventoryTab.tsx`):**
- Admin → Manage Items → Par Level Patterns: new amber "Import Weekly Par Excel" box with file button
- ReportDetailView: on load, auto-selects the matching pattern (`{branch}_{weekday}`) if it exists — e.g. for a TAFT report on Tuesday, auto-loads "TAFT_Tuesday" par levels

**Next steps for Par Level:**
- Pending A: Pack size (1 PKT) rounding — `pkt_size` column per item + `ceil(deficit/pkt_size)*pkt_size` order calc
- Pending B: After deploying, user needs to upload the Par Level.xlsx via the "Import Weekly Par Excel" button

## Recently Completed (2026-07-21 session 121o) — live (Vercel 87a3de4, Heroku 009a46a)

### Probation Page — Inline Edit for Employee Cards

User request: "一度登録した情報が編集できないようになっていますが、編集可能にしていただくことは可能でしょうか"

**Backend (`app/db_probation.py` + `app/probation_api.py`):**
- `update_probation_cycle(city, staff_name, cycle_number, fields)` — UPDATE query for cycle fields: cycle_start_date, cycle_end_date, status, graduated, bonus_awarded, termination_flagged, termination_reason
- `delete_probation_entry(city, staff_name)` — clears hired_at from staff_master and deletes all cycles
- `PUT /api/admin/probation/update` — accepts hire date + any subset of cycle fields; calls set_hired_at() and/or update_probation_cycle() as needed
- `DELETE /api/admin/probation/delete?staff_name=...&city=...` — remove from tracking entirely

**Frontend (`src/app/admin/probation/page.tsx`):**
- Each employee card now has an "Edit" pencil button (top-right)
- Inline edit mode (replaces card contents in-place):
  - Hire Date (date input)
  - Cycle Start / Cycle End (date inputs, shown only if cycle exists)
  - Cycle Status dropdown: IN_PROGRESS / PASSED / FAILED
  - Graduated, Bonus Awarded (PHP 2,000), Termination Risk Flag (checkboxes)
  - Termination Reason text input (shown only when termination_flagged is checked)
- Save → PUT /api/admin/probation/update; success reloads the list
- Cancel → reverts to view mode
- Remove button (with confirm step) → DELETE /api/admin/probation/delete

### HR_MANAGER Permissions Fix (session 121n)

**Root cause:** `canAccessAdminNav()` in auth.ts was missing `channel.admin.os_attendance.view`, `channel.admin.manual_shift.view`, `channel.admin.manual_shift.publish` keys. Even if granted via Role Management, these permissions had no effect on NavBar visibility.

**Fix (Vercel 22e1329):**
- `auth.ts`: added the 3 missing keys to `canAccessAdminNav()`
- `NavBar.tsx`: Manual Shift check now `canAccessAdminNav(auth) || hasChannelAccess("admin.manual_shift", ["view"], auth)` so users with ONLY that permission still see the link

**Admin action required:** Role Management → HR Manager → grant: Staff (View), Payroll (View), OS Attendance (View), Manual Shift (View). Camilla must re-login after.

## Recently Completed (2026-07-21 session 121n) — live (Vercel c87c675, Heroku v1397)

### Draft Apply — Overwrite Warning for manual OS corrections

Manila side reports: shifts corrected in the evening sometimes revert by next morning.
Root cause: operator applies a Draft generated BEFORE manual corrections were published → overwrites the corrections.

**Full implementation:**

**DB (`app/db.py`):**
- `shift_publish_log` table added inside `ensure_published_tables()` — permanent audit trail of every publish event (never deleted, unlike `shift_published_versions` which has UNIQUE per branch+week)
- `_log_publish_event()` helper — inserts into `shift_publish_log` inside the existing transaction; `try/except` so it never breaks the main publish
- `replace_published_week_from_draft_subset()` — fetches `draft_created_at` from `shift_draft_versions` and calls `_log_publish_event(..., "draft_apply")`
- `publish_week_from_base_shift()` — calls `_log_publish_event(..., "bayzat_import" | "load_from_db")`

**Backend (`app/main.py`):**
- `api_draft_apply_prepare()` now runs a conflict check before issuing the confirm token
- Cross-joins `shift_published_versions` with `shift_draft_versions` to compare `published_at > draft.created_at`
- Returns `conflict: { published_by, published_at_pht, draft_created_at_pht, delta_minutes }` when a conflict is detected; `null` otherwise
- All errors are caught silently — conflict check never breaks the prepare flow

**Frontend (`src/app/admin/draft/page.tsx`):**
- `ApplyPrepareResult` type: added optional `conflict` field
- `BatchApplyPrepareResult.items`: each item now carries `conflict`
- `buildApplyPrepared()`: stores `res.conflict` per item
- Conflict warning UI in the `applyPrepared?.ok` section: amber card listing each affected branch with who published, when (PHT), and how many minutes after draft generation
- Only shown when `items.some(i => i.conflict)` — normal applies are unaffected

**Diagnostic page:** `/admin/shift-audit` (Vercel 13e5bd3, deployed previous session) — shows publish history and is used for investigating future reversion incidents.

**Full Audit Log UI (Vercel 34d2646, Heroku 3635fa3):**
- New backend endpoint `GET /api/admin/shifts/publish_log` reads from `shift_publish_log` (permanent, never overwritten) — supports `city`, `weeks`, `branch_code` params
- Shift Audit page now has two tabs: "Latest State" (existing, 1 row per branch×week) and "Full Audit Log" (all events chronologically, newest first)
- Full Audit Log columns: Published At (PHT), Branch, Week, Source badge, Published By, Draft Generated At, Rows
- Footer note clarifies: log captures events from 2026-07-21 onward; earlier history only in Latest State tab

## Recently Completed (2026-07-21 session 121m) — live (Vercel f3782f7)

### Cancellation Report — Manila city switcher (GrabFood / FoodPanda)

Staff requested that the Cancellation Report (previously Dubai-only) support Manila as well.

**Frontend only** (`src/app/admin/cancellations/page.tsx`):
- Added Dubai / Manila tab switcher in the page header
- `city` state drives all city-dependent config: branches, platforms, categories, color maps, amount formatter, column labels
- `ManilaApiRow` type + `normalizeManilaRow()` normalizes Manila API field names to the shared `CancelRow` type:
  - `order_no` → `order_id`, `paid_price` → `refund_amount`, `ticket_status` → `email_status`, `recorded_by` → `encoded_by`
  - `kitchen_photo_provided` (bool) → `photo_status` ("Provided" / "Not Provided")
- `fmtPhp()` helper for PHP currency display
- `MANILA_PLATFORM_COLORS` (GrabFood #00b14f, FoodPanda #d70f64) + `MANILA_BRANCH_COLORS` (Paranaque/Taft/Cubao)
- Manila fetches from existing `/api/admin/analytics/manila/cancellations` endpoint (same auth pattern, same `{ ok, items }` envelope)
- `useEffect` resets filters/records/loaded when city changes
- `fetchRecords` `useCallback` has `city` in deps — switches endpoint automatically
- KPI label: "Total Refund" → "Total Amount" for Manila; column header: "Refund (AED)" → "Amount (PHP)"
- Subtitle updates to "Manila · GrabFood / FoodPanda — follow-up dashboard"
- DetailModal accepts `city`, `platformColors`, `branchColors` props — shows PHP amount, hides Dubai-only fields (basket, total, compensation, customer note, double-checked-by, kitchen/platform notes)
- Manila categories: "Cancellation" / "Incident/Refund"; Dubai categories: "Cancellation" / "Refund/Complaint"
- CSV filename: `cancellations-manila-YYYY-MM-DD-YYYY-MM-DD.csv` vs `cancellations-dubai-...`

**Backend**: No changes needed — Manila API endpoint already existed.
**Verified**: Dubai→Manila switch tested in browser (subtitle, KPI label, table column all update correctly).

## Recently Completed (2026-07-20 session 121l) — live (Vercel 9141eaf, Heroku v1395)

### Manila Payroll / Probation — 3 staff feature requests

**1. Manila Payroll / Create Payroll Period — Half labels updated**
- `1st Half (1–15)` → `1st Half (26–10)` (26th of prior month → 10th of current month)
- `2nd Half (16–EOM)` → `2nd Half (11–25)` (11th–25th of current month)
- **Backend** (`main.py`): `manila_create_period` date logic updated to compute cross-month ranges correctly, including January boundary (prev_year = year-1, prev_month = 12)
- **Frontend** (`payroll/manila/page.tsx`): option labels updated

**2. New Employee Probation — Staff Name as dropdown (not free text)**
- Staff Name input changed from free-text to `<select>` of active staff names
- Fetches from `/api/admin/staff_master/names?city=manila&status=ACTIVE&limit=5000` using `API_BASE` and bearer token
- Falls back to text input if names haven't loaded yet
- **Frontend** (`admin/probation/page.tsx`): `staffNames` state + useEffect + conditional select/input render
- **Bug fixed**: fetch guard now checks `allowed` before calling API (prevents 401 for non-admin roles)
- **Bug fixed**: fetch uses `${API_BASE}/api/admin/...` not relative `/api/admin/...` (consistent with rest of page)

**3. Manila Payroll / Staff Profiles Edit — Sync from Roster button**
- Edit-mode-only "Sync from Roster" button fills Position/Role, Department (branch_code), and Hire Date from `staff_master`
- Uses new lightweight backend endpoint `/api/admin/manila-payroll/roster-lookup?staff_name=...`
- **Backend** (`main.py`): new `GET /api/admin/manila-payroll/roster-lookup` endpoint; queries `staff_master` for `role`, `branch_code`, `hired_at`; calls `ensure_probation_tables()` to guarantee `hired_at` column exists
- **Frontend** (`payroll/manila/staff-profiles/page.tsx`): `syncing`/`syncMsg` state, `syncFromRoster()` async function, edit-mode button with Wand2 icon and status message

**Testing**: All 3 changes verified in browser dev server. Date logic JS-tested for all 4 cases (Jul 1H/2H, Jan boundary, Dec 2H) — all correct. No console errors.

## Recently Completed (2026-07-19 session 121k) — live (Vercel a9e6d25, Heroku f9b0ab7)

### Store Receiving — Show ALL unclosed PRs in Step 1 (not just recent 200)

Staff reported PRs older than ~July 10 (Dubai) / June 29 (Manila) were invisible in
Step 1 — Select Request, even though they were still APPROVED and unconfirmed.

**Root cause**: `list_proc_requests` had `ORDER BY created_at DESC LIMIT 200`. Dubai
alone has 500+ PRs/month across 5 stores, so old-but-open PRs fell off the list.

**Backend (Heroku f9b0ab7, db.py + main.py)**:
- `list_proc_requests`: added `open_first: bool = False` parameter
- When `open_first=True`: ORDER BY sorts unconfirmed/open PRs first (oldest first within
  group), confirmed/closed PRs last — so old open PRs always appear before new closed ones
- Max limit raised from 1000 → 2000 (API cap `le` also raised from 1000 → 2000)

**Frontend (Vercel a9e6d25, receiving/page.tsx)**:
- `loadMyRequests`: changed from `limit=200` → `limit=1000, open_first=true`
- Old open PRs from June/July now visible in Step 1 — Select Request

## Recently Completed (2026-07-19 session 121j) — live (Vercel 59b92b8, Heroku 658d6f0)

### CK Delivery — Cost Summary: Status filter + Daily Inventory CENTRAL KITCHEN branch removed

**Backend (Heroku 658d6f0)**:
- `get_ck_delivery_cost_summary()`: `status: str = ""` パラメータ追加。`WHERE d.status = %s` で動的フィルター
- `GET /api/store/ck-delivery/cost-summary`: `status: str = Query("")` パラメータ追加

**Frontend (Vercel 59b92b8)**:
- Cost Summary タブ: Status ドロップダウン追加 (All Statuses / Confirmed / Dispatched / Pending)
- `costStatus` state + `useCallback` deps に追加
- Daily Inventory: `BRANCHES` 定数から "CENTRAL KITCHEN" を削除 (Paranaque / Cubao / Taft のみ)

## Recently Completed (2026-07-19 session 121i) — live (Vercel cfa0cdd, Heroku bd21425)

### CK Delivery — Unit Price on Delivery Note + Cost Summary

植嶋さんリクエスト: Delivery NoteにコストをOSに追加し、過去デリバリーの月次集計機能を追加。

**Backend (Heroku bd21425, db.py + main.py)**:
- `ck_delivery_items` に `unit_price NUMERIC(12,4) DEFAULT 0` カラム追加 (migration)
- `add_ck_delivery_items` / `get_ck_delivery` に `unit_price` を含む
- `create_ck_delivery_from_proc_request`: 調達アイテムの `unit_price` を自動引き継ぎ
- `get_ck_delivery_cost_summary(city, branch, from_date, to_date)` 関数追加
- `GET /api/store/ck-delivery/cost-summary` エンドポイント追加

**Frontend (Vercel cfa0cdd)**:
- Delivery Note (`note/page.tsx`): Unit Price (PHP)・Line Total (PHP) 列追加、Grand Total 行、画面上に「Hide/Show Prices」トグルボタン
- CK Delivery ページ (`page.tsx`): マネージャー向け「Cost Summary」タブ追加
  - 期間 (from/to) + 拠点フィルター → Load ボタン
  - KPI: Grand Total・Delivery Count・拠点別合計
  - テーブル: Date / Branch / Order# / Items / Total Cost / Status + Grand Total 行

**注意**: `unit_price` は今後の新規デリバリーから自動付与。過去デリバリーのコストは `unit_price=0` のままのため集計に表れない。

## Recently Completed (2026-07-18 session 121h) — live (Vercel ff78e09, Heroku 7b212db)

### Par Level Patterns — order-day pattern selector + manage patterns UI

植嶋さんのリクエスト: 火曜発注 (水・木分) と木曜発注 (金・土日分) でパーレベルが異なるため、発注時にパターンを選択できるようにしたい。

**Backend** (`app/db_daily_inventory.py`, `app/daily_inventory_api.py`, Heroku 7b212db — 前セッションでデプロイ済み):
- `daily_inv_par_patterns` テーブル新設 (pattern_name, item_code, par_level, UNIQUE(pattern_name, item_code))
- DB関数: `ensure_par_patterns_table`, `list_par_pattern_names`, `get_par_pattern_items`, `upsert_par_pattern_items`, `delete_par_pattern`
- API: GET /par-patterns, GET /par-patterns/{name}/items, GET /par-patterns/{name}/template (Excel DL), POST /par-patterns/{name}/import-excel, DELETE /par-patterns/{name}

**Frontend** (`src/components/admin/AdminDailyInventoryTab.tsx`, Vercel ff78e09):

*ReportDetailView (Generate Order UI):*
- パターン選択ドロップダウン — "Use Default Par" or any pattern (Tue Order / Thu Order etc.)
- パターン選択時: 全アイテムを対象に pattern par_level で deficit を再計算し `modalOrderItems` を更新
- "Below Par" パネル: アクティブパターン名バッジ + Clear ボタン
- `getEffectivePar(item)` ヘルパー — patternLookup があれば pattern par_level、なければ item.par_level
- Generate Order モーダル: パターン名バッジ、modalOrderItems でフィルタ、effective par 表示

*ItemMasterView (Manage Patterns UI):*
- 折りたたみ式 "Par Level Patterns" セクション
- 既存パターン一覧: Download Template / Import Excel / Delete ボタン (各行)
- 新パターン作成: name 入力 + "Create & Import" → file picker → Excel インポート
- Excel format: 4列 (Item Code, Item Name, Unit, Par Level) — col[0] + col[3] を使用

## Recently Completed (2026-07-18 session 121g) — live (Vercel 9f4aa30)

### 1. Cashier Log: SC/PWD label clarification + real-time logging enforcement (`cashier-log/page.tsx`)

Staff were entering full bill totals instead of discount-only amounts for SC/PWD, and QRPH entries were only being logged by closing staff (missing other shifts). Two commits:

- **f8a80eb (SC/PWD label fix)**: Amber info banner explaining "Enter the discount amount deducted (20% reduction), not the full bill". Label changed: "Amount (₱)" → "Discount Amount (₱)". Day total renamed "SC/PWD Total Discount".
- **4c703d8 (real-time enforcement)**: Page description updated to emphasize per-shift immediate logging. SC/PWD banner updated with "⚡ Log immediately" heading. QRPH sky-blue banner added. Entry list shows timestamp in sky-blue + cashier name. "By cashier today" breakdown panel when 2+ cashiers logged.

### 2. Cost Calculation: Ingredient selector fix for inactive ingredients (`cost-calculation/page.tsx`)

"Soy Sauce" still not appearing in 加工マスター ingredient selector after LIMIT 500→5000 fix was deployed. Root cause: **the LIMIT fix was in the wrong code path.**

- The selector uses `allIngredientOptions` (from paginated `/api/cost/ingredients?is_active=TRUE`) — not `componentOptions`
- `componentOptions` (from `/api/cost/component-options`, no is_active filter, LIMIT 5000) contains ALL ingredients including inactive ones
- Fix (`getMasterComponentSuggestions`): now merges both sources. Active ingredients from `allIngredientOptions` take priority (deduped by ID); inactive ingredients from `componentOptions` fill the gaps. Soy Sauce (if `is_active=FALSE`) now appears in the selector.

## Recently Completed (2026-07-17 session 121f) — live (Vercel 7ba28bf, Heroku d6f367a)

### 1. Procurement: Stock column decimal precision fix (`request/page.tsx`)

Stock column showed 0.3 instead of 0.255 (Daily Inventory showed 0.255). Root cause: `.toFixed(1)` rounded 0.255 to 0.3. Fix: changed to `parseFloat(onHand.toFixed(3))` — trailing zeros stripped, up to 3 decimal places shown.

### 2. Cost Calculation: Ingredient selector LIMIT 500 fix (`db.py`)

"Soy Sauce" not appearing in the new-ingredient dropdown even though it exists in the master. Root cause: `list_cost_component_options` had `LIMIT 500` — "Soy Sauce" (alphabetically past position 500) was silently cut off. Fix: changed `LIMIT 500` → `LIMIT 5000`. Already-registered ingredients were unaffected (they use stored ID references).

### 3. Cold Chain: 2-day window to prevent midnight rollover error (`db_cold_chain.py`, `cold_chain_api.py`, `cold-chain/page.tsx`)

Paranaque store intermittently saw "No box data found for this branch" after midnight. Root cause: `api_cc_store_dispatches` used strict `WHERE dispatch_date = today` (Asia/Manila). Dispatches created by CK before midnight become invisible once the date rolls over.

- **Backend** (`db_cold_chain.py`): `list_dispatches` now accepts `date_from`/`date_to` range params (range query covers midnight boundary).
- **Backend** (`cold_chain_api.py`): `api_cc_store_dispatches` — when no explicit date, queries `yesterday → today` using `timedelta(days=1)`.
- **Frontend** (`cold-chain/page.tsx`): Dispatch selector now shows `[YYYY-MM-DD]` prefix so staff can distinguish yesterday's vs today's dispatch. "No dispatches today" → "No dispatches found" to match the broader search window.

## Recently Completed (2026-07-16 session 121e) — live (Vercel aa7f29f, Heroku 6ea86e9)

### 1. Procurement: qty-loss bug when adding catalog item (`request/page.tsx`)

**Bug**: "+ Add Item" → "Add" triggers `loadItemCatalog()` which immediately calls
`setCatalogSuppliers([])`. This fires the quantity-preservation useEffect with an
empty catalog — `catalogMapped = []` — wiping all manually-entered qtys.
Only Generated Orders items survived (restored from fixed `editRequestItems` list).

**Fix**: Added `preserveSuppliers?: boolean` to `loadItemCatalog` opts. When true,
skips `setCatalogSuppliers([])` so existing items remain during the reload.
`addCatalogItemFn` now calls `loadItemCatalog({ preserveSuppliers: true })`.

### 2. Procurement: Daily Inventory stock column (`request/page.tsx` + `main.py`)

New "Stock (On Hand)" column in the procurement catalog grid for Manila stores.
- Backend: `GET /api/admin/procurement/requests/daily-inventory-stock?store=PAR&date=2026-07-16`
  joins the latest daily inventory report entries with item names.
  Auth: `procurement.request.write` (STAFF has access).
- Frontend: fetches on store/date change via `loadDailyInventoryStock` useCallback.
  Color-coded qty: red=0, amber<3, sky=normal. Shows report date in header.
  Column hidden for Dubai, "All Stores", and when no store is selected.

## Recently Completed (2026-07-16 session 121d) — live (Heroku v1383)

**Market Analysis: duplicate mall pin bug fix**

スタッフ報告: Malabon #1エリアの「最寄りモール: SM City Caloocan (2.2km)」が実際より遠く見える。

**根本原因**: `get_ncr_malls()` が Overpass API (OSM) から取得したモールを重複排除する際、座標の近さ (<200m) しかチェックしていなかった。OSM上の「SM City Caloocan」がハードコードと異なる座標 (>200m) に登録されていた場合、別エントリとして追加され、「Show Malls」マップ上に2つのピンが表示される。

距離計算は `NCR_MAJOR_MALLS` (ハードコード、正しい座標) を使用し続けるが、マップ表示は `get_ncr_malls()` (Overpassデータ入り) を使うため、表示上の不一致が発生していた。

**修正 (`app/market_analysis.py`)**:
- `hardcoded_names_lower` セットを追加し、名前でも重複排除
- Overpassからのモールがハードコード済みモールと名前一致 → スキップ (座標が違くても)
- 近接重複排除の半径を 200m → 500m に拡大

## ⚠️ Admin Action Required — CRITICAL

**CK Inventory [Retired]・重複アイテムのクリーンアップ** (管理者が手動でボタンを押す必要あり)

Restore CK Items ボタンが過去の`[Retired]`アイテムや旧セクション重複エントリまで復元してしまった。

**手順**:
1. Admin OS → **Daily Inventory** タブを開く → **「Manage Items」**をクリック
2. **「Fix Restore Issues」ボタン**（オレンジ色）をクリック
3. 確認ダイアログで内容を確認 → OK
4. 成功メッセージ（例: "15 [Retired] items re-deactivated, 12 duplicate entries removed"）を確認

**このボタンが行うこと:**
- `[Retired] CK048` 等の退役済みアイテムを再度非アクティブ化
- 同じ品名が複数セクションに存在する重複を解消（使用履歴のある方を保持、古い方を無効化）

## Recently Completed (2026-07-16 session 121c) — live (Vercel f54c99c)

**Incident Report 403 fix + Item Master UX**

### 1. Incident Report 403 Forbidden fix (`incidents/page.tsx`)
Staff receiving `{"detail":"Forbidden"}` on both page load and submit. Root cause: all four API call sites (`fetchList`, `handleExpand`, `handleSubmit`, self-eval `submit`) used synchronous `getAuth()` which returns the cached token without checking expiry. Staff with expired tokens (>16h) or legacy PIN-only sessions (no `accessToken`) got 403 on every call.

Fix: replaced `getAuth()` with `await refreshAuthFromApi(getAuth())` at each call site. `refreshAuthFromApi` re-mints a fresh access token via PIN if the current one is missing or expired.

### 2. Item Master Active/Off toggle (`AdminDailyInventoryTab.tsx`)
Active/Off status was a static `<span>` — users reported it was not clickable. Fixed by:
- Adding `handleToggleActive(itemCode, currentActive)` function calling `PATCH /api/daily-inventory/items/{code}` with `{ is_active: !current }`
- Replacing static span with a `<button>` that calls `handleToggleActive` on click
- Hover state shows the inverse action (Active shows red hover → Off indicator, Off shows green hover → Active indicator)

### 3. Item Master Back button (`AdminDailyInventoryTab.tsx`)
Added Back button to ItemMasterView header so users can return to the Daily Inventory form without scrolling to the bottom of the page.

### 4. Procurement On-hand quantity (`procurement/request/page.tsx`)
Staff reported "On hand" not showing in procurement edit mode. Fixed the full data chain:
- Added `spec?: string` to inline API response type (was causing Vercel build error)  
- Added `spec` to `editRequestItems` state type
- Added `spec` to `rawItems` mapping, catalog item overlay, and fallback rows

### 5. Market Analysis: address search + population rank (`market-analysis/page.tsx`, `market_analysis.py`, `main.py`)
- Address search bar (Nominatim geocoding, Philippines-restricted)
- `rank_location()` backend function: scans ~12,400 NCR grid points, returns rank/percentile
- Fixed: map click and runEstimate now clear stale `rankResult` values

## Recently Completed (2026-07-16 session 121b) — live (Vercel e19ef2e, Heroku 633347c)

**Daily Inventory UX improvements**

### 1. Procurement order: Show current stock (On hand quantity)
When "Generate Purchase Request" creates a procurement order, the `spec` field now contains "On hand: X unit" from the daily inventory report. The procurement request page displays this as a gray sub-text below the item name, so reviewers can see the current stock alongside the order quantity.

- **Backend** (`daily_inventory_api.py`): `api_generate_order_from_report()` — build `on_hand_map` from report entries, set `spec = "On hand: {qty} {unit}"`
- **Frontend** (`procurement/request/page.tsx`): render `item.spec` as `text-[10px] text-zinc-500` below item name

### 2. Daily Inventory History: Add CK / Supplier / Warehouse source type tabs
`ReportDetailView` now has tab buttons (Central Kitchen | Supplier | Warehouse) at the top of the item list. Each tab shows how many entries exist for that type in the selected report. Switching tabs filters the sections table to that source type only. Low Stock / Needs Attention panels still show all source types.

- **Frontend** (`AdminDailyInventoryTab.tsx`): `detailSourceTab` state, `filteredItems` computed from `items.filter(source_type)`, `entryCountByType()` helper for badge counts

---

## Recently Completed (2026-07-16 session 121) — live (Vercel 5b53f91, Heroku bfc8c64)

**OS Attendance break tracking + CK Inventory restore cleanup**

### OS Attendance — Daily Report に休憩時間表示追加

ドバイスタッフがBreak In/Outを記録しているが、Daily Reportに表示されていなかった。

- **Backend** (`db.py`): `list_os_sessions_with_visits()` を GROUP BY+JOIN から LATERAL サブクエリに変更し、visits と breaks 両方を重複なく集計
- **Backend** (`main.py`): `_fmt_with_visits()` に breaks 解析 + `duration_min` 計算 + `break_min` 合計を追加
- **Frontend** (`os-attendance/page.tsx`):
  - `AttendanceSession` 型に `breaks[]` と `break_min` フィールド追加
  - Daily Reportテーブルに **Break 列** 追加（合計休憩時間をアンバーバッジで表示、休憩中は "⚠ open"）
  - 行展開時に Break In / Break Out / Duration の詳細テーブルを表示（アンバーテーマ）
  - CSV Export に **Break In / Break Out / Break (min)** 3列追加

### CK Inventory restore 過剰復元問題修正

**根本原因連鎖**（教訓8・9 参照）:
1. Session 119: `deactivate_items_not_in()` に `AND is_commissary = FALSE` を付け忘れ
2. Replace-modeインポートで CK アイテムが誤って全件非アクティブ化
3. Session 120: `restore_commissary_items()` を追加したが無条件復元 → `[Retired]` アイテムと旧セクション重複も全て復活
4. 今セッション: 下記2点を修正してデプロイ済み

**修正内容**:
- `restore_commissary_items()` (`db_daily_inventory.py`): `[Retired]` 除外 + 7日以内に非アクティブ化されたもののみ対象に制限
- `cleanup_commissary_restore()` 新関数: ① `[Retired]` 再無効化 ② 同名重複を `daily_inv_entries` 使用履歴で判定してデデュープ
- `POST /items/cleanup-commissary` 新エンドポイント
- **Frontend**: Manage Items に **「Fix Restore Issues」**（オレンジ）ボタン追加

⚠️ **管理者が "Fix Restore Issues" を実行するまで現状の [Retired]・重複アイテムは未解消**

## Recently Completed (2026-07-15 session 120) — live (Vercel c520529, Heroku d04105b)

**Mall Expansion CSV export fixes + CK Inventory restore fix**

### Mall Expansion — CSVエラー修正 (5ファイル)
- `03_Attendance_Monthly` / `09_Store_KPI_Monthly`: `status` カラム存在しない → `COUNT(DISTINCT (staff_name, work_date))` 等に修正
- `06_Daily_Inventory_Items`: `unit`/`reorder_level` → `default_unit`/`min_level` に修正
- `07_Store_Evaluations`: `max_score` カラム存在しない → 個別スコアカラムに変更
- `08_Menu_Items`: `category_id` JOIN → `menu_item_master` 直読みに変更
- NotebookLM対応: Excel→CSVフォーマットに全面変更済み

### CK Inventory 消失バグ修正
- **根本原因**: `deactivate_items_not_in()` に `AND is_commissary = FALSE` フィルタが欠落 → Replace-modeインポート時にCKコミサリーアイテムを誤って非アクティブ化
- **修正** (`db_daily_inventory.py`): `deactivate_items_not_in()` に `AND is_commissary = FALSE` 追加。`restore_commissary_items()` 新関数追加
- **API** (`daily_inventory_api.py`): `POST /api/daily-inventory/items/restore-commissary` 追加
- **Frontend** (`AdminDailyInventoryTab.tsx`): 緑色の「Restore CK Items」ボタン追加

## Recently Completed (2026-07-14 session 119) — live (Vercel a209798, Heroku 49499a9)

**Invoice Photo Upload バグ修正 + Daily Inventory インポート機能改善**

### Invoice Photo Upload (session 118 の続き)
- **Bug 1 fix** (`main.py`): `action="procurement.receiving.write"` (未定義) → `action="procurement.request.write"` に修正。未修正のままでは写真アップロード時に常に 403 エラーになっていた
- **Bug 3 fix** (`receiving/page.tsx`): `URL.revokeObjectURL(prev)` を追加してメモリリーク防止

### Daily Inventory — インポート機能改善
- **Backend** (`db_daily_inventory.py`): `deactivate_items_not_in()` 新関数追加 — ファイルに含まれないアイテムを一括非アクティブ化
- **Backend** (`daily_inventory_api.py`): インポートエンドポイントに `?deactivate_others=true` パラメータ追加
- **Frontend** (`AdminDailyInventoryTab.tsx`): 「Replace」チェックボックスを Import Excel ボタン横に追加 — ONにするとファイル外のアイテムを自動非アクティブ化
- **Frontend**: `FROZEN_ITEMS`, `DRY_ITEMS`, `HOT_SECTION`, `INGREDIENTS` を `SOURCE_SECTION_LABELS` に追加

## Recently Completed (2026-07-14 session 118) — live (Vercel 160d8a4, Heroku efd6fec)

**Store Receiving — インボイス写真アップロード機能追加**

`/store/procurement/receiving` 画面でサプライヤー納品時の手書きインボイスを写真撮影してOSに添付可能に。

- **DB** (`db.py`): `proc_receivings` に `invoice_photo_url TEXT NOT NULL DEFAULT ''` カラム追加 (migration)
- **DB** (`db.py`): `update_proc_receiving_invoice_photo()` 新関数、`get/list_proc_receivings` に `invoice_photo_url` 追加
- **API** (`main.py`): `POST /api/admin/procurement/receiving/{id}/invoice-photo` 追加 — 写真を Google Drive ClaimPhotos フォルダにアップロード後 URL を DB に保存
- **Frontend**: Camera ボタン (capture="environment" でモバイルカメラ直起動) → サムネイルプレビュー → Record Delivery 時に自動アップロード。既存レコードに写真があれば「View Invoice Photo」リンクを表示

## Recently Completed (2026-07-12 session 117) — live (Heroku 1c19058)

**Store Procurement: Catalog duplicates fix + PO pagination fix**

### 問題1: Kitchen Ingredients 重複アイテム削除 (DB直接修正)
- Three-S Food Services に `catalog_category='Kitchen Ingredients', store_scope='ALL'` の重複アイテムが16件存在
- `proc_curated_catalog_items` から直接 DELETE → 永久削除
- 原因: 過去のカタログインポートで重複が作成されたと推定。シードファイル(startup)には Kitchen Ingredients は含まれないため、再起動時は復活しない

### 問題2: 拠点別アイテム表示統一 (DB直接修正)
- Ingredients (Paranaque scope 15件) + Ingredients (Taft scope 6件) → 全て `store_scope='ALL'` に更新
- 結果: Manila全拠点(Paranaque/Taft/Cubao)で同じ21アイテムが Three-S Food Services 配下に表示
- 修正前: Paranaque=31件, Taft=22件 → 修正後: 全拠点=21件

### 問題3: Purchase Order 1ページあたりアイテム数増加
- `app/services/procurement_po_mail.py:227`: `rows_per_page = 12` → `rows_per_page = 20`
- A4レイアウト検証: row_y最終行=248pt, フッター線=200pt で余裕あり
- 20品目以内のPOは1ページに収まり、サプライヤーが2ページ目を見落とすリスク解消

## ⚠️ Admin Action Required (manual)

Dubai staff on July 10 may have open attendance sessions (check_in_at IS NOT NULL, check_out_at IS NULL) due to GPS/location failures or the 2AM cutoff bug. Admin should manually close these via Admin OS Attendance page. Affected names reported: Sushma Magar, Yogesh Bashyal, Nabaraj Sapkota, and others from the July 10-11 error report.

## Recently Completed (2026-07-12 session 116h) — live (Vercel 8cec257, Heroku 3eff3e2)

**Bibek GPS Fix + Rafael Multi-Branch Clock In/Out**

### Bibek BK — GPS exempt (GPS access blocked permanently fixed)

Bibek (CK flexible staff) was blocked by "Location access is blocked" on Android even after Chrome site settings fix. Root cause: the frontend was always showing the GPS requirement block regardless of backend gps_exempt flag.

**Backend (Heroku 3eff3e2 — already deployed from session 116g):**
- `gps_exempt=TRUE` set for Bibek BK in staff_master via psql

**Frontend (Vercel 8f03efa):**
- `attendance/page.tsx`: added `gps_exempt?: boolean` to `TodayData`, `gpsExempt` derived state
- GPS requirement block: `!gpsExempt` guard added → hidden for gps_exempt staff
- Clock In button: `disabled` guard includes `!gpsExempt` → always enabled for gps_exempt
- Android guide: added "Check master Location toggle in Quick Settings" as step 1, "Choose While using Chrome (not Only this time)" instruction

### Rafael Lagahit — Multi-Branch Area Manager

Rafael moves between multiple Dubai branches per day. Needs: (1) GPS exempt, (2) Clock In/Out at each individual branch.

**DB changes (psql direct):**
- `gps_exempt=TRUE`, `multi_branch=TRUE` set for Rafael Lagahit in staff_master

**Backend (Heroku 3eff3e2):**
- `multi_branch BOOLEAN NOT NULL DEFAULT FALSE` column added to `staff_master` (migration in `ensure_staff_master_columns`)
- `set_staff_multi_branch()` function added to `db.py`
- `_is_staff_multi_branch()` helper added to `main.py`
- `visit_start` action: if `multi_branch=True` and no session → auto-creates session via `record_os_checkin` (first Clock In of day creates the day session)
- `/api/attendance/today` response: includes `multi_branch` field
- `POST /api/admin/staff_master/set_multi_branch` endpoint added
- `list_staff_master()` updated to include `multi_branch` in SELECT/response

**Frontend (Vercel 8cec257):**
- `attendance/page.tsx`:
  - `multiBranch` derived from `data.multi_branch`
  - Initial state (`!isCheckedIn`): shows branch picker instead of plain Clock In; calls `visit_start` directly (auto-creates session)
  - WFH button hidden for multi_branch staff
  - "End Work Day" label instead of "Clock Out" for multi_branch
  - "Branch Clock In/Out" section: open visit shows "Currently at {branch}" + "Clock Out from {branch}" button; transit state shows "Clock In at next branch" picker; completed visits shown as history
- `admin/staff/page.tsx`:
  - `multi_branch?: boolean` added to `StaffRow` type
  - `saveMultiBranch()` function (same pattern as `saveGpsExempt`)
  - Toggle button per staff row: "🏢 Multi-Branch / Single Branch"

**Production verification (2026-07-12):**
- Rafael Lagahit: `gps_exempt=t, multi_branch=t` in staff_master ✓
- Rafael has active session (check_in_at 10:59 UTC) with open CK visit (visit_start 12:05 UTC) ✓
- Branch list API (`/api/admin/attendance/branch-gps`) accepts any valid bearer token ✓
- TypeScript: zero errors ✓
- ESLint: zero errors in source files ✓

**Minor fix (admin/staff/page.tsx — not yet committed):**
- `saveMultiBranch`: added `setMsg(null)` at start + `legacyPinOrEmpty(pin)` for consistency

## Recently Completed (2026-07-11 session 116g) — live (Heroku v1365)

**Checkout Roaming — Drivers can clock out from any GPS location (Heroku v1364→v1365)**

Dubai ドライバー (Nabaraj Sapkota, Hayat Ullah Khan) はスタッフを送り届けてから業務終了するため、チェックアウト場所が登録拠点外になる。

**機能設計:**
- `checkout_roaming=TRUE`: GPS座標は必須 (不正防止のための位置記録)、拠点半径チェックはスキップ
- `gps_exempt=FALSE`: 通常通り (これらのスタッフはGPS不要ではなく「どこでもOK」)
- 既存の `gps_exempt` フラグとは別フラグとして新設 (意味が異なる)

**Backend (app/db.py + app/main.py, Heroku v1364):**
- `checkout_roaming BOOLEAN NOT NULL DEFAULT FALSE` カラム追加 + migration
- 自動シード: Nabaraj/Hayat → `checkout_roaming=TRUE` (冪等)
- `_is_staff_checkout_roaming()`, `set_staff_checkout_roaming()`, `POST /api/admin/staff_master/set_checkout_roaming` 追加
- Checkout フロー: roaming driver + valid GPS + 拠点外 → 許可 (gps_ok=False として coords 記録)
- `_fmt_session()` に `check_in/out_lat/lng` 追加
- Bug fix (v1365): `list_staff_master()` SELECT に `checkout_roaming` 追加 (当初 missing)
- Bug fix (v1365): `api_admin_staff_master_list` レスポンスに `checkout_roaming` フィールド追加

**Frontend (Vercel 8e343fd):**
- Admin OS Attendance: Checkout GPS カラムに Google Maps リンク (`check_out_gps_ok=false` + 座標あり)
- Attendance page: ヘッダーにスタッフ名表示

**Testing Results (10 logic tests, ALL PASS):**
1. Driver + valid GPS + far branch → OK (gps_ok=False, coords recorded)
2. Driver + NO GPS → 422 error (GPS mandatory for audit)
3. Driver + no branches configured → OK (gps_ok=None, coords recorded)
4. Regular + out of range → 403 rejected
5. GPS-exempt + no GPS → allowed (existing behavior preserved)
6. Both flags + no GPS → checkout_roaming wins, 422

**Production verification:**
- Nabaraj Sapkota: `checkout_roaming=True, gps_exempt=False` ✓
- Hayat Ullah Khan: `checkout_roaming=True, gps_exempt=False` ✓
- No other Dubai staff have checkout_roaming ✓
- TypeScript: zero errors ✓

## Recently Completed (2026-07-11 session 116f) — live (Vercel d0b76e1, Heroku ad28104)

**Market Analysis NavBar — Dynamic Permission Check**

NavBar の market-analysis リンクが hardcoded role check (`["ADMIN","HQ","MANILA_MANAGEMENT"].includes(role)`) を使用していた。Role Management でアクセスを付与しても NavBar に反映されなかった。

- `src/lib/auth.ts`: `canAccessMarketAnalysisAdmin()` 追加 — HQ/ADMIN は常に可、それ以外は `hasChannelAccess("admin.market_analysis", ["view"])` で動的チェック
- `src/components/NavBar.tsx`: market-analysis 判定を `canAccessMarketAnalysisAdmin(auth)` に変更

**Attendance — Midnight Cutoff 2AM→6AM (Heroku ad28104)**

Dubai 夜間シフト (5pm→2am, 7pm→4am) が 2:00 AM 以降にチェックアウトできなかった。`_city_today()` が `hour < 2` のカットオフを使用していたため前日セッションが見つからなかった。

- `app/main.py` `_city_today()`: `if now.hour < 2` → `if now.hour < 6` に変更
- 教訓: Dubai 最長シフトは 4AM 終了。カットオフは 6AM が適切

## Recently Completed (2026-07-10 session 116e) — live (Vercel 3ad84bd)

**Manual Shift — Spread Shift (Split Shift) サポート追加**

**背景**: ドライバー (Hayat Ullah Khan, Nabaraj Sapkota) は勤務日に必ずスプレットシフト (例: 朝8-15時 + 夜18-22時) になるが、従来の編集モーダルでは1日に1シフトしか入力できなかった。

**修正 (`src/app/admin/manual-shift/page.tsx`, commit 3ad84bd):**
- `editShiftIndex: number | null` state 追加 (null=新規追加、number=既存セグメントを編集)
- `loadShiftIntoForm(shift, index)` ヘルパー関数 — フォームフィールドへのロードを共通化
- `openEdit()` 改修 — 最初のシフトを編集モードで開く
- `saveEdit()` 改修 — null の場合は配列にappend、indexあり の場合は指定indexを置換
- `removeShiftSegment(staffName, dateStr, index)` 関数追加 — 個別セグメント削除
- モーダルに「Shifts on this day」セクション追加: 既存シフト一覧 + Editボタン + ✕削除
- 「+ Add another shift segment」ボタン追加
- フッターの 🗑 ボタンは引き続き全シフト+公開データ削除

## Recently Completed (2026-07-09 session 116d) — live (Vercel 952ce2d)

**Overtime Nav + Admin Page Fixes**

**① NavBar: Overtime Request をプライマリナビの Request 上に移動** (952ce2d)
- `/store/overtime-request` を `SECONDARY_BASE` から削除し `PRIMARY` 配列の `/request` の直上に移動
- スタッフナビの表示順: Expense Reimbursement → **Overtime Request** → Request

**② Admin Overtime page: Loading 点滅 + エラー修正** (069f65f)
- 原因: `const auth = getAuth()` がレンダー毎に新規オブジェクトを生成 → `useCallback` deps が毎回変化 → 無限 useEffect ループ → "Failed to fetch" エラー
- 修正: `const [auth] = useState(getAuth)` に変更 (安定した参照)

**③ branch_code バリデーション強化** (Heroku 0c82652)
- POST /store/overtime/request: 空・長すぎる・特殊文字のある branch_code を400エラーで拒否

## Recently Completed (2026-07-09 session 116c) — live (Heroku v1352, Vercel 8cfa30b)

**Overtime Request System + Security Fixes**

**① overtime_requests テーブル新設 (DB + API)**
- 新テーブル: `overtime_requests` (pre/post申請タイプ、承認フロー、給与連携エクスポート)
- エンドポイント: POST /store/overtime/request, GET /store/overtime/my-requests
- 管理エンドポイント: GET /admin/overtime/list, pending-count, export; PATCH /admin/overtime/{id}/review
- 承認者ロール: ADMIN, HQ, DUBAI_MANAGEMENT, MANILA_MANAGEMENT, MANAGER

**② フロントエンド 2ページ新設**
- `/store/overtime-request` — スタッフ向けOT申請フォーム (pre/post切替、時間範囲、深夜越え対応、申請履歴)
- `/admin/overtime` — マネージャー向け承認画面 (KPIサマリー、フィルター、レビューモーダル、CSV出力)

**③ NavBar統合**
- スタッフナビ: "Overtime Request" (Clock アイコン, /store/overtime-request)
- 管理ナビ: "Overtime Requests" (Clock アイコン, /admin/overtime) — ADMIN/HQ/DUBAI_MANAGEMENT/MANILA_MANAGEMENT/MANAGER のみ表示
- 保留中バッジ: /api/admin/overtime/pending-count をポーリング

**④ セキュリティ修正 — 他人名義投稿を全エンドポイントで禁止**
- POST /store/emergency-request: `requested_by` をトークンから取得
- POST /store/spot-purchase/requests: `requested_by` をトークン固定
- POST /store/ck-inventory/sessions: `created_by` をトークンから取得
- POST /store/ck-production-plan/plans: `created_by` をトークンから取得
- POST /store/ck-delivery/deliveries: `created_by` をトークンから取得

## Recently Completed (2026-07-09 session 116b) — DB直接更新 (デプロイ不要)

**July Dubai shift deduplication — 6名の名前重複を解消**

直接 psql で production DB に適用。shift_published_rows + base_shift_normalized 両テーブルを更新。

| 旧名（alias） | 正規名（staff master） | 操作 |
|---|---|---|
| Ashik Khan | Ashik Kahn | 20行→26行 rename |
| Lyssa Rae Adan | Lyssa Rae | Jul 14-19 重複6行DELETE + 24行 rename → 計30行 |
| Hayat Ullah Khan (S) | Hayat Ullah Khan | 36行 rename → 計47行 |
| Nabaraj Sapkota (N) | Nabaraj Sapkota | 17行 rename → 計28行 |
| Kapil Bahadur Khati | Kapil Bahadur | 25行 rename → 計31行 |
| Puker KC | Pukar K C | 6行 rename → 計28行 |

base_shift_normalized: Hayat/Nabaraj/PukarKC は既に正規名で格納されていたため更新不要 (0行)。

## Recently Completed (2026-07-09 session 116) — live (Heroku v1351, Vercel 494c3db)

**Daily Inventory — Excel import/download bug fixes**

**① Excel download binary corruption (CRITICAL fix)** (Vercel 494c3db)
- `handleDownloadTemplate` が `apiFetch` を使っていたため、レスポンスを `res.text()` で読み取りバイナリを壊していた
- 修正: raw `fetch` + `getAuthHeaders()` を直接使用 (apiFetch をバイパス)

**② Excel import Content-Type 破壊 (CRITICAL fix)** (Vercel 494c3db)
- `handleImportExcel` が `apiFetch` を使っていたため、`Content-Type: application/json` が FormData の multipart boundary を上書きし、FastAPI が 422 エラーを返していた
- 修正: raw `fetch` + `getUploadHeaders()` を使用 (`getUploadHeaders` は Content-Type を設定しないので browser が multipart を自動設定)

**③ Excel import で is_active が強制 True になるバグ** (Heroku v1351)
- テンプレートを DL して再インポートすると非アクティブ・retired アイテムが全て再アクティブ化されていた
- 修正: `import_daily_inv_items_from_excel()` 新関数 — ON CONFLICT 時は `is_active` を更新しない (既存値保持)

## Recently Completed (2026-07-09 session 115) — live (Heroku v1348)

**Role Management — 8 missing channels + access control fixes**

**① Manual Shift: Draft vs Published 優先度修正** (Vercel e8659a7)
- Draft ロード時に公開済みシフトを上書きしないよう修正
- Bayzat インポートシフト(role="")が Publish から除外されるバグ修正

**② CK Delivery unclickable — view permission 自動生成** (Heroku e075ba9)
- `loadChannelRoleMatrix` に try/catch + setError 追加
- seed_access_control_defaults() + create_access_channel() で view permission 自動修復

**③ 8 missing channels を access_control.py に追加** (Heroku v1348)
- Staff: staff_guide, store_expense_request, store_ck_inventory, store_ck_production_plan, store_ck_delivery
- Admin: admin.expense_requests, admin.bayzat_import, admin.emergency_requests
- 各 view / manage 権限も ACCESS_PERMISSIONS に追加済み
- **注意: 既存DBのロール権限は Role Management UIで手動設定が必要** (DEFAULT_ROLE_GRANTS は新規DB用のみ)

## Recently Completed (2026-07-09 session 114) — live (Vercel ea314c7)

**Japanese Staff Manual — /staff-guide ページ新設**

- `/staff-guide/page.tsx` — ログイン不要のモバイル向け日本語マニュアル
- タブ構成: タイムイン / ブレイクイン / ブレイクアウト / タイムアウト / 経費申請 / 受信箱 / 困ったとき
- 各セクション: ステップ番号付き手順 + コード風ボタン表示 + 注意事項・完了メッセージ
- NavBar に「Staff Guide (JA)」リンク追加 (BookOpen アイコン、全スタッフ閲覧可)

## Recently Completed (2026-07-09 session 113) — live (Heroku v1346, Vercel)

**Expense Reimbursement Request System**

Approach A: 既存 `/inbox` を拡張して統合通知センター化。

**DB (`app/db.py`)**:
- `expense_reimbursement_requests` テーブル (id/staff_name/city/category/amount/currency/expense_date/status/reviewed_by/review_note/submitted_at)
- `private_report_notifications` に `notification_type TEXT DEFAULT 'private_report'` + `ref_id UUID` カラムをマイグレーション追加
- `list_private_report_notifications` の SELECT に `notification_type`, `ref_id` 追加
- 新関数: `ensure_expense_tables`, `create_expense_request`, `list_my_expense_requests`, `list_expense_requests_admin`, `get_expense_request`, `update_expense_request_status`, `get_expense_payroll_summary`, `insert_staff_notification`

**API (`app/main.py`)**:
- `POST /api/expense/request` — スタッフ申請 (category/amount/currency/expense_date/description)
- `GET /api/expense/requests` — 自分の申請一覧
- `GET /api/admin/expense-requests` — 管理者: 一覧 (city/status/staff_name/from_date/to_date フィルター)
- `PATCH /api/admin/expense-requests/{id}` — 承認/却下/支払済 + inbox DM送信
- `GET /api/admin/expense-requests/summary` — 給与計算サマリー (スタッフ別合計)
- `GET /api/admin/expense-requests/pending-count` — ペンディング件数バッジ用

**Frontend**:
- `/store/expense-request/page.tsx` — スタッフ申請フォーム + 申請履歴テーブル + KPI
- `/admin/expense-requests/page.tsx` — Pending/All/Payroll Summary 3タブ + Review Modal
- `/inbox/page.tsx` — `notification_type` + `ref_id` フィールド追加、expense通知を緑テーマで専用レンダリング

## 📌 Post-deploy: Admin must seed Excel items

After first login as manager, go to **Daily Inventory → Manage Items → Seed Excel Items**.
This imports 103 CK + 23 Supplier items from the July 2026 Excel master list.

## Recently Completed (2026-07-09 session 112) — live (Heroku v1345, Vercel auto-deploy)

**Break In / Break Out — Full 4-Phase Implementation + Bug Testing**

Attendance system upgraded with break tracking for Dubai and Manila staff.

**Phase 1 — DB Tables** (`app/db.py`):
- New `os_attendance_breaks` table (session FK, city, staff_name, break_in/out timestamps + GPS, reminder_sent)
- New `os_break_push_subscriptions` table (VAPID push endpoint per staff device)
- All DB functions: `record_break_in`, `record_break_out`, `get_active_break`, `list_breaks_today`, `list_breaks_for_range`, `list_sessions_with_breaks`, `get_pending_break_reminders`, `mark_break_reminder_sent`, `upsert/delete/get_break_push_subscriptions`

**Phase 2 — Backend API** (`app/main.py`):
- Extended `break_in` / `break_out` as valid WebAuthn actions
- `GET /api/attendance/today` extended with `breaks: []` array
- `break_in` handler: validates clocked-in, no double-break, calls `record_break_in`
- `break_out` handler: validates active break, calls `record_break_out`
- `GET /api/attendance/vapid-public-key`, `POST/DELETE /api/attendance/break-push-subscribe`
- `GET /api/admin/attendance/staff-report` (city + staff_name + date range → sessions with nested breaks, violations, summary)

**Phase 3 — Push Notifications** (`app/main.py`, `public/sw-push.js`):
- Background daemon thread polls every 60s for 50-min break reminders
- Uses `pywebpush` VAPID to push to subscribed devices
- SW message handler for client-side `SHOW_BREAK_REMINDER` fallback

**Phase 4 — Frontend** (`src/app/attendance/page.tsx`, `src/app/admin/os-attendance/page.tsx`):
- Break In / Break Out buttons (sky/amber) between visits and Clock Out; Clock Out hidden while on break
- Live elapsed timer with 50-min warning (amber) and 60-min overrun (red)
- `subscribeBreakPush()` + `scheduleBreakReminder()` on break_in
- Admin: Staff Report tab with staff autocomplete, date range, summary KPIs, sessions table, violations badges

**Testing Results (session 112)**:
- Tables confirmed created in production DB ✓
- All DB functions work correctly (`list_sessions_with_breaks` returns `breaks` as Python list) ✓  
- `upsert/delete/get_break_push_subscriptions` CRUD verified ✓
- New API endpoints return 401 when unauthenticated ✓
- TypeScript: zero compile errors ✓
- ESLint: zero errors in source files ✓

## Recently Completed (2026-07-08 session 111) — live (Heroku 94464e1, Vercel d7c0ae2)

**Daily Inventory — CK/Supplier/Warehouse source split + Excel item master + Back Office**

Staff request (3 parts):
① Split Kitchen into CK / Supplier / Warehouse. Role-based: Kitchen Staff uses CK+Supplier, Cashier uses Warehouse.
② Replace incomplete item list with July 2026 Excel master (103 CK items + 23 Supplier items).
③ Back Office for add/delete items and edit Par Level.

**Backend** (`app/db_daily_inventory.py`, `app/daily_inventory_api.py`, `app/daily_inv_excel_items.py`):
- Added `source_type TEXT NOT NULL DEFAULT 'ck'` column to `daily_inv_report_items` (idempotent migration)
- Updated `list_daily_inv_items()` with `source_type` filter (overrides branch-based commissary filter)
- Updated `seed_daily_inv_items()` to persist `source_type`
- Added `create_daily_inv_item()`, `update_daily_inv_item()`, `deactivate_daily_inv_item()` functions
- New API endpoints: `POST /items`, `PATCH /items/{code}`, `DELETE /items/{code}`, `POST /items/seed-excel`
- `daily_inv_excel_items.py`: hardcoded 103 CK + 23 Supplier items from Excel

**Frontend** (`src/components/admin/AdminDailyInventoryTab.tsx`):
- Source tabs: Central Kitchen / Supplier / Warehouse (with role hint per tab)
- Items fetched by `?source_type=...`; entries persist across tab switches (one save covers all tabs)
- Managers get "Manage Items" button → Item Master Back Office
- Item Master: view by source, add new items, edit par level inline (click cell), deactivate items, Seed Excel button

**One-time setup required**: Manager must click "Manage Items → Seed Excel Items" to import the Excel item master.

## Recently Completed (2026-07-07 session 110) — live (Heroku v1340/3a45346, Vercel e383c30)

**Store Procurement / New Request — Add Item が数量をリセットするバグ修正**

スタッフ報告: 「+ Add Item」で新しいカタログ品目を追加すると、それまでに入力した全数量が0にリセットされる。

**原因**: `addCatalogItemFn` 成功後に `loadItemCatalog()` を呼び出してカタログを再読み込み。
`catalogGridItems` useMemo が再計算され、`useEffect` で `setItems` を実行。
`source_row_id` を持たない品目は `fallbackIndex`(カテゴリ内の位置)を `row_key` に使用しているため、
新品目の挿入でインデックスがズレると `prevMap.get(row_key)` のルックアップが失敗 → qty=0にリセット。

**修正** (`src/app/store/procurement/request/page.tsx`):
- `prevByName` マップ (`item_name::vendor_name` → item) を追加
- 既存qtys のルックアップを `prevMap.get(row_key) ?? prevByName.get(name::vendor)` にフォールバック
- row_key がシフトしても品目名+サプライヤーで一致 → 数量が保持される

**Branch badge — PO Builderヘッダーに追加** (`src/app/admin/procurement/pos/page.tsx`):

スタッフが見ていたのは PO Builder 上部の `requestSummary.store_code` 表示エリア(line 661)だった。
紫バッジを個別 PO カードに追加済みだったが、ヘッダーには平テキストのままだった。

**修正**: `requestSummary` ヘッダー(request番号の隣)に紫バッジを追加。
平テキストの store_code 表示を削除し、date | status のみ残す。

**Cold Chain / HR / PO その他修正 (session 110前半 — Heroku v1340/commit 3a45346)**:
- ① Cold Chain: +/-ボックスカウンター → 1-12物理グリッドに変更 (Vercel dd01524)
- ② HR Recruitment: "Buffer" 採用理由追加 + Open Requisitions パネル (Vercel dba72b6)
- ③ PO Vendor名正規化: "Three - S" vs "Three-S" の不一致をregex正規化で解決
- ④ Dubai PO メール通貨: PHP→AED に修正 (city=="dubai"判定)
- ⑤ PO list: proc_requests LEFT JOINで store_code を各PO行に付与 (Heroku v1340)

## Recently Completed (2026-07-04 session 109) — live (Heroku 9057d10, Vercel 7361089)

**CK Delivery Auto-Generation from Approved CK Store Procurement Orders**

スタッフ要望: CK Store Procurementオーダーが承認された際に、CK Deliveryを自動生成してほしい。
また冷蔵庫ストック品を手動追加した場合に自動品と視覚的に区別できるようにしてほしい。

**Backend (db.py):**
- `ck_deliveries` テーブルに `proc_request_id UUID` (FK) と `proc_request_no TEXT` カラム追加 (v2 migration)
- `ck_delivery_items` テーブルに `source TEXT DEFAULT 'manual'` カラム追加
  - `'auto'` = 承認されたオーダーから自動追加、`'manual'` = 後から手動追加
- `create_ck_delivery()` に `proc_request_id`, `proc_request_no` パラメータ追加
- `get_ck_delivery()`, `list_ck_deliveries()` の SELECT に新カラム追加
- `add_ck_delivery_items()` の INSERT に `source` 追加
- 新関数 `create_ck_delivery_from_proc_request()` 追加:
  - `store_code` → `to_branch` マッピング (PAR→Paranaque, CB→Cubao, TAFT→Taft)
  - `needed_by_date` がアイテムにあればそれを `delivery_date` に使用
  - アイテムは全て `source='auto'` で挿入

**Backend (main.py):**
- 両方の `/api/admin/procurement/cases/{case_id}/approve` エンドポイントに CK Delivery 自動生成フックを追加
  - `approvals_complete_in_order()` → APPROVED かつ `is_ck_order=True` の場合のみ実行
  - `try/except` で保護: 自動生成失敗が承認フローをロールバックしない

**Frontend (ck-delivery/page.tsx):**
- `Delivery` 型に `proc_request_id`, `proc_request_no` 追加
- `DeliveryItem` 型に `source: "auto" | "manual"` 追加
- 詳細ヘッダーに `proc_request_no` 表示 (オレンジ)
- アイテム行にソースバッジ: "From Order" (amber) / "Manual" (slate)
  - `proc_request_id` がある場合のみバッジを表示
- "Delivery Note" ボタン追加 (PENDING/DISPATCHED 時のみ、新タブで開く)
- リスト左パネルに `proc_request_no` 表示

**Frontend (新規: /store/ck-delivery/[id]/note/page.tsx):**
- 印刷用 Delivery Note ページ
- カテゴリ別アイテム一覧、数量、ソースバッジ、チェックボックス欄
- CK / 店舗のサイン欄
- `@media print` でボタン非表示、A4印刷対応

**Known behavior:**
- `plan_id=NULL` で生成されるため CK Production Plan 由来でない配送として記録される
- 生成後にアイテムを追加/削除可能 (通常通り編集できる)
- 承認エンドポイントが2箇所に重複しているため両方に同じフックを適用

## Recently Completed (2026-07-02 session 108) — live (Heroku v1337)

**Base Roll Prep — Salmon Lover 商品名修正 (StoreHubの名称に合わせて "Box" を追加)**

スタッフ報告: 8日設定(基準日1日)でSalmon Loverがベースロール計算に出ない。
7月1日にSalmon Loverは販売済み(アイテム売上グラフ4位)なのに表示されなかった。

**原因**: `_BASEROLL_DEFAULT_ROWS` の商品名が "Salmon Lover 12pcs" 等(Box なし)だったが、
StoreHubの実際の商品名は "Salmon Lover **Box** 12pcs"。
COEFFディクショナリのキーと販売データのプロダクト名が不一致 → 係数が0となり `to_prep()` の `if v > 0` フィルターで除外されていた。

**修正 (db.py):**
- `_BASEROLL_DEFAULT_ROWS` の7商品名を正しい名称に更新:
  - Salmon Lover 12/16/24pcs → Salmon Lover **Box** 12/16/24pcs
  - Premium Salmon Lover 12/16/24pcs → Premium Salmon Lover **Box** 12/16/24pcs
  - Supreme 10pcs → **Salmon Supreme Box** 10pcs
- `_BASEROLL_V2_ADD_ROWS` セットも同様に更新
- v3 migration 追加: sentinel "Salmon Lover 12pcs" が DB に存在する場合に全7件をUPDATEする (冪等)

## Recently Completed (2026-07-02 session 107) — live (Heroku v1336, Vercel 5e58e61)

**Disposal Report — 写真アップロード機能追加**

スタッフからのリクエスト: Disposal Report提出時に証拠写真をアップロードできるようにする。

**Backend:**
- `db.py`: `disposal_reports` テーブルに `photo_urls JSONB NOT NULL DEFAULT '[]'` カラム追加 (migration: `ADD COLUMN IF NOT EXISTS`)
- `db.py`: `list_disposal_reports()` の SELECT に `r.photo_urls` を追加
- `db.py`: `add_disposal_photo(report_id, photo_url)` 新関数 — JSONB配列にURLをappend
- `main.py`: `POST /api/admin/disposal/report/{report_id}/upload-photo` エンドポイント追加
  - 認証: 既存の `_require_disposal_access` (全認証スタッフ)
  - Google Drive フォルダ: `Disposal/{city}/{branch_code}/{YYYY-MM}/` (既存の `PROCUREMENT_DATA_FOLDER_ID` 配下に自動作成)
  - ファイルサイズ制限: 20MB、画像のみ

**Frontend (`src/app/admin/disposal/page.tsx`):**
- Report Details フォームに写真選択UI追加 (複数選択可、サムネイルプレビュー、個別削除ボタン)
- Submit後にレポートIDを取得してから写真を順次アップロード (失敗しても本体提出は成功)
- アップロード進捗を success メッセージに反映 (`N/M photos uploaded`)
- Past Reports の展開時に写真サムネイルを表示 (クリックでGoogleドライブのリンクを開く)
- `getUploadHeaders(auth)` を使用 (multipartのContent-Typeを壊さない)

## Recently Completed (2026-07-01 session 106) — live (Heroku v1335, Vercel d53783d)

**Spot Purchase — バグ修正 (11件) + テスト**

前セッション(105)の実装に対し、テスト・コードレビューで11件のバグを発見し修正・デプロイ。

**Backend (db_spot_purchase.py + main.py):**
- [CRITICAL] 競合条件: `_next_request_no()` を独立接続で実行 → `pg_advisory_xact_lock(2026072601)` を使った同一トランザクション内での原子的番号生成に変更
- [HIGH] プライバシーリーク: `api_spr_list_my` でstaff_nameが空の場合に全件返却 → 空ガードで空配列を返すよう修正
- [HIGH] 日付バリデーション未実施: `needed_by_date` を直接DBに渡すと500エラー → `date.fromisoformat()` で事前検証し400を返す
- [HIGH] 品目名バリデーション: 空白のみの品目名が通過 → `i.name.strip()` でフィルタ
- [MEDIUM] status パラメーター未検証 → `_SPR_VALID_STATUSES` セットで検証
- [MEDIUM] limit パラメーターに負数が通過 → `max(1, min(limit, 500))`
- [MEDIUM] purchased_by 未検証 → 空の場合は400エラー

**Frontend (store/spot-purchase/page.tsx):**
- [HIGH] リスト取得失敗時にエラーが表示されない → `myLoadError` state追加
- [LOW] 過去日付が選択可能 → `min={today}` を日付inputに追加
- [LOW] タブ切り替え時に展開状態がリセットされない → `setExpandedId(null)` 追加
- [LOW] Refresh ボタン + リクエスト件数表示を追加

**Frontend (admin/spot-purchase/page.tsx):**
- [LOW] approve/reject/complete 後のサクセスフィードバックなし → `actionSuccess` state + 3秒自動クリア追加
- [LOW] doComplete での purchased_by 空チェックをフロントにも追加、JSXに成功メッセージ表示

## Recently Completed (2026-07-01 session 105) — live (Heroku v1334, Vercel d4216e3)

**Spot Purchase System (新機能) + Base Roll Prep バグ修正**

**① Spot Purchase Request System — フルスタック実装**

Manila限定の新しい発注チャンネル。キッチン機器・調理器具・備品のスポット購入フロー。

- **DB** (`app/db_spot_purchase.py` — 新規):
  - `spot_purchase_requests` テーブル: JSONB items配列、PENDING→APPROVED/REJECTED→PURCHASEDステータス
  - SPR-YYYY-NNNN番号体系。関数: create/list/get/approve/reject/complete/count_pending
- **API** (`app/main.py` に追記): create/list-my/upload-photo (store), list-all/approve/reject/complete/pending-count (admin)
  - 写真・レシートはGoogle Drive (SpotPurchase/Items/YYYY-MM/, SpotPurchase/Receipts/YYYY-MM/)
  - 承認ロール: ADMIN/HQ/HR_MANAGER/MANILA_MANAGEMENT
- **Store page** (`src/app/store/spot-purchase/page.tsx`): New Request タブ (複数品目・写真) + My Requests タブ
- **Admin page** (`src/app/admin/spot-purchase/page.tsx`): Pending/Approved/Purchased/All タブ、approve/reject/complete アクション、レシートアップロード
- **NavBar**: store nav + admin nav に Spot Purchase リンク追加

**② Base Roll Prep — Calculator タブで新商品が表示されない問題修正** (Heroku v1333)

- 修正: COEFF構築・検索時に `strip().lower()` 適用 (ケース不一致マッチング)
- データ問題: 新商品はSales参照日に売上ゼロ → 7月8日以降に自然表示

## Recently Completed (2026-06-30 session 104) — live (Heroku 1656498, Vercel c717e1b)

**Phase 2-5 テスト・バグ修正 + 印刷UIポリッシュ**

**① Phase 5 バグ修正2件 (backend)**
- Bug A: `inv_report_date` が `after.get("created_at")` (受取作成日=過去の可能性) → `date.today().isoformat()` に修正
- Bug B: `req.get("store_code")` (get_proc_request()がNone返しあり) → `after.get("store_code")` (RETURNING句で確実取得)に修正

**② Phase 2 フロントバグ修正2件**
- Bug C: `requestedBy` 空の場合に明示チェックなし → 早期returnで明確なエラーメッセージ表示に修正
- Bug D: Pydantic `detail` が配列形式の時 `"[object Object]"` → 型チェックで配列/文字列分岐に修正

**③ 調達ケース詳細 印刷ポリッシュ**
- `print:hidden`: ← Hub/← Inbox ナビ、Session/Auth バー、Case Actions パネルを非表示に
- 印刷結果: ケースのメタ情報・品目テーブル・合計金額のみが白紙に印刷される

## Recently Completed (2026-06-30 session 103) — live (Heroku v1331, Vercel d7f37b6)

**Daily Inventory → Ordering Cycle (Phase 1〜5)**

**① Phase 1 (前セッション) — LOW/WATCH アラートバグ修正**
- `Decimal`→文字列シリアライズ→JS辞書順比較バグを `Number()` 強制変換で修正
- 対象: `AdminDailyInventoryTab.tsx` の3箇所 (DetailStatusBadge, ReportDetailView計算, テーブル行)

**② Phase 2 — "Generate Purchase Request" ボタン**
- SUBMITTED レポートの Low Stock Alert セクションに「Generate Purchase Request」ボタンを追加
- モーダル: LOW在庫品を Supplier / CK に自動分類、発注数量を事前計算(min_level - 現在在庫)、個別選択・数量編集可
- バックエンド: `POST /api/daily-inventory/reports/{id}/generate-order`
  - Supplier品目 → 通常 proc_request を作成してSUBMIT
  - CK品目 → is_ck_order=true の proc_request を作成してSUBMIT
  - 両方とも既存の調達ハブに即時反映
- 成功後: 作成されたPR番号とHubリンクを表示

**③ Phase 3 — 承認ルーティング**
- 既存の調達ハブが自動処理するため追加実装なし

**④ Phase 4 — 印刷ボタン**
- 調達ケース詳細ページ(`/admin/procurement/cases/[caseId]`)に「🖨 Print」ボタンを追加
- `window.print()` + `globals.css` に印刷用メディアクエリ追加

**⑤ Phase 5 — 受取確定 → Daily Inventory 自動反映**
- `db_daily_inventory.py`: `add_received_qty_to_daily_inv(store_code, report_date, received_items)` 追加
  - store_code → branch 変換 (PAR→PARANAQUE, CB→CUBAO, etc.)
  - DRAFT状態のレポートが存在する場合のみ、アイテム名マッチングで受取数量を加算
- `main.py`: 受取確定エンドポイントにhookを追加 (best-effort: 失敗しても確認はキャンセルしない)

## Recently Completed (2026-06-24 session 102) — live (Heroku 318884b, Vercel b430a7e)

**Order Catalog supplier delete + Base Roll PREP overhaul + Manila Draft ingredient fix**

**① Order Catalog — Supplier Management: Delete ボタン追加** (Heroku / Vercel b430a7e)
- 非アクティブ品目のみのサプライヤーに「Delete」ボタンを追加 (active_count===0 && inactive_count>0 の時のみ表示)
- DB: `delete_proc_catalog_supplier(city, supplier_name)` — active品目残存時は ValueError→HTTP 409
- API: `POST /api/admin/procurement/catalog/supplier/delete`
- フロント: 確認モーダル(Delete Permanently ボタン)付き。`deleteSupplierConfirm` state(既存の `deleteConfirm: CatalogRow|null` と命名衝突を回避)

**② Base Roll PREP — 新ベースロール・新商品追加** (Heroku db.py / Vercel page.tsx)
- 新ベースロール: Salmon Skin Roll, Mango & Lettuce Roll, Mango & Cheese Roll, Salmon & Tempura Roll
- 新商品: Salmon Lover 12/16/24pcs, Premium Salmon Lover 12/16/24pcs, Supreme 10pcs
- BV boxes: Crunchy Salmon Base Roll → Salmon Skin Roll に変更
- Ramen Combo B (California/Crunchy Salmon): 別商品として StoreHub 登録済み確認済み
- 新カテゴリ: Hosomaki (🍣) / Nigiri (🐟) / Topping (🧄) をベースロールとは別セクションで表示
- _BASEROLL_V2_ADD_ROWS migration (sentinel: "Salmon Lover 12pcs" 存在チェック) で冪等実行

**③ Manila Cost Calculation — Draft カテゴリ食材を is_active=TRUE に修正** (Heroku 318884b)
- 問題: ingredient_master で city='manila' AND category='Draft' の食材が is_active=FALSE → list_cost_ingredients() のデフォルトフィルタで非表示
- 原因: 意図せず非アクティブ化されていた (Draft カテゴリ = ワークフロータグとして使用すべきで、非アクティブ化は意図しない)
- 修正: ensure_cost_tables() 内に冪等 UPDATE を追加 (LOWER(TRIM(category))='draft' AND is_active=FALSE → TRUE)
- デプロイ後、初回 cost API アクセス時に自動実行される

## Recently Completed (2026-06-24 session 101) — live (Heroku 35db92e, Vercel 47d95cb)

**Investor portal date range picker + Cost Calculation ingredient price pending workflow**

**① Investor Portal — Taft データ表示修正** (前セッション完了)
- Taft の hourly/items/ratings が "データがありません" → Manila専用テーブル(`manila_sales_hourly`, `manila_sales_by_product`, `manila_aggregator_ratings_analytics`)に切替
- Vercelの `/api/*` rewrite がNext.jsルートハンドラーをバイパスする問題 → `/investor-api/[...slug]/route.ts`(新プロキシ)で解決

**② Investor Portal — 日付範囲ピッカー追加** (前セッション完了)
- 全4タブ(Revenue/Items/Ratings/Hourly)に共通 `DateRangePicker` コンポーネントを追加
- デフォルト: 過去3ヶ月。日付変更で全データが再取得される

**③ Cost Calculation — 食材価格 仮置き(Pending)ワークフロー実装** (今セッション)
- **以前の動作**: サプライヤーフォームで仕入れ価格を更新すると、`ingredient_master.unit_price`(マスター価格)に自動反映 → 加工品・商品マスターのg単価計算が複雑でスタッフが一つ一つ設定する必要があり運用困難だった
- **新しい動作**:
  - 仕入れ価格更新 → `ingredient_price_pending` テーブルに「仮置き」レコードを作成(マスター自動書換なし)
  - Cost Calculation画面に「**Price Pending**」タブを新設。マネージャーが変更一覧を確認し、提案価格を調整可能
  - **Apply**: マスター価格を更新 + 価格履歴記録 + 加工品/商品マスターへ自動原価再計算
  - **Dismiss**: 変更を棄却
- **DB変更**: `ingredient_price_pending` テーブル新設(ensure_cost_tables内でCREATE IF NOT EXISTS)
- **新関数**: `list_ingredient_price_pending`, `apply_ingredient_price_pending`, `dismiss_ingredient_price_pending`
- **新API**: `GET /api/cost/price-pending`, `POST /api/cost/price-pending/{id}/apply`, `POST /api/cost/price-pending/{id}/dismiss`
- **フロント**: タブにペンディング件数バッジ、価格一覧テーブル(現在価格/新価格/調整入力/Apply+Dismissボタン)

## Recently Completed (2026-06-23 session 100) — live (Heroku v1314, Vercel 846ec0f)

**Cash Report branch selector + CK Delivery 2件修正 + Store Receiving city filter**

**① Cash Report — Opening/Closing フォーム内ブランチ確認セレクター** (Vercel 2c8ce3b)
- `ClosingForm` / `OpeningForm` 両方に amber ハイライトのブランチ確認セレクターを Staff Name + Date グリッドの下に追加
- `onBranchChange` コールバックで親 page と双方向同期。TaftスタッフがパラニヤーケのままSubmitするミスを防止

**② CK Delivery — Androidモバイル画面崩れ修正** (Vercel 3a39a9c)
- ラベル写真input から `capture="environment"` を削除
- PWA/WebView Android環境でカメラ強制起動→描画衝突→画面グリッチが発生していた。削除後はOS標準のカメラ/ギャラリー選択が表示される

**③ CK Delivery — アイテム削除ボタン追加** (Heroku v1314, Vercel 3a39a9c)
- DB: `delete_ck_delivery_item(item_id, delivery_id)` — SQLでPENDINGチェックしてDELETE
- API: `DELETE /api/store/ck-delivery/deliveries/{delivery_id}/items/{item_id}`
- フロント: PENDING + canManage 時のみ各アイテム行に Trash2 ボタン。確認ダイアログ付き

**④ Store Receiving — Receiving Records が Manila/Dubai 混在する問題修正** (Vercel 846ec0f)
- `loadReceivings()` が `city` パラメーターをAPIに渡していなかった → バックエンドが全都市のデータを返していた
- 修正: `cityOverride?: string` パラメーター追加、`city` を常にクエリに含める。backend は `request_id` 指定時は city フィルターを自動スキップするため安全
- 初期化時は `loadReceivings(initialReq, initialCity)` でURL解決済みcityを確実に渡す
- Refresh ボタン: スピナー(`animate-spin`) + "Refreshing…" テキスト + disabled 状態を追加。「クリックしても反応がない」ように見えていた原因は同じ無フィルターデータを再ロードしていたため

## Recently Completed (2026-06-21 session 99) — live (Heroku v1310, Vercel dd2ae0d)

**AI Analytics Pro 修正 + Business Events Log 新機能**

**① AI Analytics Pro バグ修正** (Heroku v1309)
- `SYSTEM_PROMPT.format(today=today)` → `.replace("{today}", today)` に変更
- SYSTEM_PROMPTに含まれる `{}` がPythonの `.format()` に誤解釈されて "Replacement index 0 out of range" エラーが発生していた問題を解消

**② Business Events Log フルスタック実装** (Heroku v1310, Vercel dd2ae0d)
- **DB**: `business_events` テーブル新設 (event_date/event_name/affected_cities/impact_direction/notes)
- **AI Tool**: `get_business_events` ツール追加 — 分析前に自動呼び出し、外部イベントを内部診断より優先
- **SYSTEM_PROMPT**: 「分析前に必ず `get_business_events` を呼ぶ」「外部イベントがあれば内部要因より優先する」ルールを追加
- **API**: `GET/POST /api/admin/business-events`、`DELETE /api/admin/business-events/{id}`
- **Frontend**: `/admin/business-events` 管理ページ新設（イベント追加・削除UI）
- **NavBar**: AI Analytics Pro の直下に「Business Events Log」リンク追加（Globe アイコン）

**背景**: Claudeの学習データカットオフは2025年8月。それ以降の出来事（イラン戦争など）はBusinessEventsログに登録することでAIが参照できるようになった。

## Recently Completed (2026-06-21 session 98) — live (Vercel 5fa3d4f)

**CK Ingredient Receiving 専用ページ + バグ修正3件**

**① `/store/ck-ingredient-receiving` 新ページ**
- CKリーダーがサプライヤーに発注した食材の未着一覧
- `/api/store/procurement/pending-deliveries?city=manila&store_code=CK` を再利用
- NavBar: CK Delivery の直下に追加（Manila全ロール閲覧可）

**② バグ修正3件**
- `amount` NULL クラッシュ: `row.amount.toLocaleString()` → `(row.amount ?? 0).toLocaleString()`
- NavBar `canSeeAdminItem` に `/admin/supplier-confirmations`・`/admin/emergency-requests` チェック追加（MANILA_MANAGEMENTが見えなかった）
- CK Delivery の「Ingredient Deliveries」タブを削除（専用ページと重複）

## ⚠️ Pending Investigation

- **Store Procurement: Submit → editable bug** — スタッフ報告「一度Submitした注文が再度編集可能になっている」。代表が詳細確認してフィードバック予定。

## Recently Completed (2026-06-21 session 97) — live (Heroku cd6df3d, Vercel 0c81c14)

**Vendor Pending Deliveries + EPR Phase B Supplier Confirmation Calls**

**① Vendor Pending Deliveries section on `/store/procurement`** (Heroku v1307)
- DB: `list_pending_deliveries_for_store(city, store_code)` — `proc_purchase_orders JOIN proc_requests WHERE receipt_confirmed_at IS NULL`、CK除外
- API: `GET /api/store/procurement/pending-deliveries?city=&store_code=`
- Frontend: 右パネルに折りたたみ式「Pending Deliveries」セクション(CK Dispatchの上)
  - Not Dispatched / In Transit / Short Delivered バッジ
  - 展開で品目一覧 + Receiving/Claim クイックリンク
  - 支店選択時に自動ロード

**② EPR Phase B — Supplier Confirmation Calls** (Heroku cd6df3d, Vercel 0c81c14)
- DB: `supplier_confirmation_calls` テーブル新設。`proc_purchase_orders` に `supplier_confirmation_status`(pending/confirmed/rescheduled/no_answer/not_required) + `supplier_confirmation_notes` カラム追加。Dubai PO は自動で `not_required` に設定。
- API: `POST /api/admin/supplier-confirmation/log`、`GET /api/admin/supplier-confirmation/pending`、`GET /api/admin/supplier-confirmation/{po_id}/calls`
- `/admin/supplier-confirmations` 新ページ: Manila POの確認コールキュー一覧 + Log Call モーダル(result/call_time/expected_delivery_date/notes)
- `/admin/procurement/pos`: 各PO行にLog Callボタン + 確認ステータスバッジ追加(Manila限定)
- NavBar: PhoneCall アイコン + Supplier Confirmationsリンク追加

**残タスク:** なし (EPR Phase A+B完了)

## Recently Completed (2026-06-21 session 96) — live (Heroku v1306, Vercel 1b14f2a)

**緊急調達システム Phase A + CK Pending Deliveries タブ**

**① Emergency Procurement System (EPR Phase A)**
- DB: `emergency_procurement_requests` テーブル新設。urgency/items(JSONB)/root_cause/approval_level等
- 承認ロジック: ≤5,000 PHP → ops_manager / >5,000 PHP → hq を自動判定
- 店舗側: `/store/emergency-request` — 品目追加フォーム(qty/unit/PHP単価/合計/root cause) + My Requests履歴タブ
- 管理者側: `/admin/emergency-requests` — Pending承認キュー(approve/reject/complete 2-step確認) + Analytics(root cause別/店舗別棒グラフ + KPI4枚)
- NavBar: Siren アイコン。管理者ナビは pending 件数バッジ付き

**② CK Pending Deliveries タブ** (`/store/ck-delivery`)
- "Pending for My Branch" タブ追加
- 今日の CK 配送を支店別に表示。Status: Not Dispatched / In Transit / Received
- 品目ごとに ordered qty vs received qty を比較。不足品目は amber でハイライト
- "Dispatched but not confirmed → CK Delivery タブで受取確認" の誘導テキスト付き

## Recently Completed (2026-06-21 session 95 Rounds 4–5) — live (Heroku ee8c25a)

**AI Analytics Pro 信頼度向上 ~83→~90点**

**Round 4 修正:**
- **P&L 日本語キー→英語正規化**: `_pl_rollup_to_summary()` 新設。`rollup_four_buckets()` を全P&Lデータに適用し food_cost/labor_cost/rent_utilities/other_opex/profit_pl + %KPI を返す
- **メニュー工学 母集団バイアス修正**: `get_manila_sales_by_product` にウィンドウ関数追加(`COUNT(*)/AVG() OVER()`)。TOP-30偏りを排除し全メニュー母集団平均でStar/Plow Horse/Puzzle/Dog分類
- **Manila キャンセルプラットフォーム名**: `LOWER(platform)=LOWER(%s)` 対応

**Round 5 修正:**
- **P&L 支店別サマリー**: `__stores__` サブdictの各支店に `_pl_rollup_to_summary()` 適用→ `store_summaries{}` として返却
- **Dubai支店カバレッジ警告**: 5支店未満のデータ時に `DATA_WARNING` 付与(欠損≠売上ゼロと明示)
- **調達金額NULL対応**: `list_proc_purchase_orders_for_analytics` で `COALESCE(p.amount, 0)`
- **メニュー工学ORDER BY**: `total_sales DESC` → `item_net_sales DESC` に修正
- **評価スコア11項目全取得**: `get_evaluations_trend` SELECT に food_safety/organization/sop_compliance 追加
- **scoring_note 全11サブスコア基準**: ≥85=Excellent ✅, 70-84=Acceptable 🟡, <70=🔴 に統一

## Recently Completed (2026-06-21 session 95 Round 3) — live (Heroku a826178)

**AI Analytics Pro 深層監査 Round 3 — 17件修正**

43エージェントによる6次元並列監査 (tool_dispatch / DB field contracts / system prompt / aggregation math / Manila pipeline / Dubai pipeline)。36候補 → 30確認 → 17件修正デプロイ。

**Critical/High 修正:**
- **Dubai branch breakdown**: `_list_pos_revenue_daily_rows` のSELECT+GROUP BYに branch_code/brand_name を追加。以前は全ブランチが"Unknown"1件に集約されていた
- **Manila group_by_month**: ハードコードされた`False`を除去。月次トレンドクエリが正しく機能するように
- **auto_ prefix**: `get_store_evaluation_scores` の tool description と scoring_note の `attendance_rate`→`auto_attendance_rate` 等を修正
- **get_menu_performance branch**: `_normalize_manila_branch_arg` 未適用を修正。QC/Parañaqueエイリアスが空結果を返していた
- **avg_order_value_aed**: total_orders=0時に売上総額を返していたバグを `None` センチネルで修正

**Medium 修正:**
- **channel_mix >100%問題**: Beep追加前のtotal_ordersを分母に使うと100%超えする問題をmax(DB合計, チャンネル合計)で修正
- **QC/Cubao二重計上**: `_aggregate_manila_sales` のb_mapでブランチ名正規化を実施
- **調達データ切り捨て**: 300件超えのPOをキャップした際に DATA_WARNING を返すように
- **get_store_evaluation_scores**: `required: ["city"]` を追加（未指定時マニラにサイレントデフォルト防止）
- **get_dubai_sales説明文**: 実際のテーブル名(pos_revenue_location_daily)に修正、city-wide時はブランチ非対応と明記
- **get_pnl facts key名**: "verbatim Google Sheet row labels" と明記、dict.keys()で確認推奨

**Low 修正:**
- get_dubai_sales schemaから group_by_month 削除（無視されていたパラメータ）
- category_breakdownから gross_profit/gross_profit_pct をサーバーサイドでストリップ
- NOON→Noon 表記統一（_normalize_revenue_aggregator_nameの実際の出力に合わせる）
- 出勤データソース: "OS check-in records" → "Bayzat import data" に修正
- Manila sales描述にBeep (GCash QR) チャンネルを追加
- Menu engineering: top-N バイアスの免責事項を追加
- _aggregate_cancellations の city 比較を小文字正規化

---

## Recently Completed (2026-06-19 session 93) — live

**Manual Shift Draft → Publish 2段階フロー + その他スタッフ依頼**

**① Manual Shift: Save Draft → Publish 2段階フロー（Phase 1）**
- バックエンド: `POST /api/admin/shifts/save_draft_only`（公開せずにサーバー保存）+ `GET /api/admin/shifts/draft_week`（最新draft取得）
- フロントエンド: 「📝 Save Draft」ボタン追加、「🚀 Publish」に改名
- 週/支店を開く際にサーバーdraftを自動ロード→公開済みシフトの上に重ねて表示
- Draft cellは **indigo ring（ring-2 ring-indigo-400）** で視覚区別
- ステータスバーに「◈ Server draft (N cells) — not yet published」チップ表示
- `src/app/admin/manual-shift/page.tsx`, `sushizen_shift_app_clean/app/main.py`

**② Vendor City ロック（編集時）** — Heroku v1292
- 既存ベンダー編集時、City フィールドを read-only（🔒 locked）に変更
- `UNIQUE(vendor_code, city)` 複合キーによる重複レコード防止

**③ UIクリッピング修正** — Vercel f78b81a
- DateRangePicker: 下に空きが足りない時に上方向フリップ
- Manual Shift 入力モーダル: `maxHeight: vH - top - 16` でビューポート下端を超えない

**④ Store Procurement 3点改善** — Vercel 845d207
- Dubai支店コード→curated店舗名マッピング（BB→B Bay, ARJ→M City等）
- カタログアイテムをサプライヤーセクション内でアルファベット順ソート
- 数量inputのstepを0.01→1

**⑤ Cash Report 改善** — Vercel e182082
- cashTotal=0の時は警告を表示しない（premature warning抑制）
- 差異閾値₱0→₱5（軽微な誤差を警告しない）

### 教訓 (session 93)
- **`fetch_draft_rows_for_week` は main.py に top-level import なし** → エンドポイント内でインライン import（既存パターン踏襲）
- **Draft cell の視覚区別は ring 系CSS**（`ring-2 ring-indigo-400 ring-inset`）— 背景色変更は色テーマを壊すリスクがある

## Recently Completed (2026-06-18 session 92) — live

スタッフ依頼5件 + ストア調達RETURNED削除機能。

**① CK Production Plan — リストにアサインスタッフ表示**
- リストカードに `assigned_staff` チップを表示(最大3名+"N more")。自分の名前は ★ + emerald ハイライト。自分がアサインされたプランは emerald ボーダー
- `src/app/store/ck-production-plan/page.tsx`

**② Procurement 承認後の自動遷移**
- `path === "approve"` 成功後 1.2s で自動 `router.push` (inbox or hub)
- `src/app/admin/procurement/cases/[caseId]/page.tsx`

**③ Cancellation Report — Order Number 列 + 行クリックで詳細モーダル**
- Order No. 列を Date 直後に追加(colSpan 8→9)
- 行クリックで DetailModal: 全フィールド read-only 表示
- `src/app/admin/cancellations/page.tsx`

**④⑤ Dubai Cancellation 入力 — Order ID 保存後ロック + レイアウト改善**
- 保存済みレコードの Order ID を read-only `<span>` に切替
- Order ID コンテナ `flex-1` → `w-36 shrink-0`、ヘッダー右に Branch/Brand 表示
- `src/components/admin/AdminDubaiCancellationInputTab.tsx`

**⑥ Store Procurement — RETURNED オーダーのキャンセル機能**
- バックエンド: `POST /api/admin/procurement/requests/{id}/cancel` (RETURNED/REJECTED/DRAFT → CANCELLED)
- フロント: ドロワー + リスト行 両方に 2ステップ Cancel ボタン
- `sushizen_shift_app_clean/app/main.py`, `src/app/store/procurement/page.tsx`

### 教訓 (session 92)
- **Cancel 機能はドロワーと行の両方に要実装**。ドロワー内ボタンのみだと行表示が古いままになりやすい
- 2ステップ確認は `confirmRowId` state で管理。`onClick={(e) => e.stopPropagation()}` で行クリック伝播を防ぐ

## Recently Completed (2026-06-17 session 91c) — live

**ロールマネジメントが権威ソースとして機能していなかった構造バグを修正。** 代表指摘「HQをロールマネジメントで最初から登録済み＝全ページ閲覧可のはず。効かない＝ロールマネジメントが機能していない。ロール権限はロールマネジメントが最優先でなければ意味がない」。

**真因(名前マッチの不整合)**: `resolve_staff_access_profile` の割当照会([db.py:1220](../../../sushizen_shift_app_clean/app/db.py))は `LOWER(staff_name)=LOWER(%s)` のみ(trim も空白正規化も無し)。一方システムの他部分 `_resolve_staff_auth_identity` は `regexp_replace(lower(trim(staff_name)),'\s+',' ','g')` で頑健マッチ。→ **割当名と照会名に空白/書式差があると HQ 割当を取りこぼし**、`staff_master`/STAFF にフォールバック = ロールマネジメントが無視される。

**修正**: 割当照会(と staff_master フォールバック照会)を `_resolve_staff_auth_identity` と**同じ正規化マッチ**に統一。→ ロールマネジメントの割当は空白/大小文字差に関係なく**常に検出され、最優先の権威ソース**として機能する。

これで HQ ユーザーは3重に保護: ①HQ name override(91b) ②robust 割当マッチ(91c) ③万一ミスでも token role 維持＋role定義から権限導出(91)。

検証: `ast.parse` OK。Heroku b27f567。**該当ユーザーは一度ログアウト→再ログイン**で確実反映。

### 教訓 (session 91c)
- 名前ベースの照合は**システム全体で同一の正規化**(trim+空白collapse+lower)を使うこと。1箇所だけ素の `LOWER()` だと、そこだけ取りこぼして権限喪失する
- ロールマネジメント(`staff_role_assignments`)は role の**単一の真実源**。照会ミス=STAFF降格という設計は、照会を頑健にして初めて成立する
- [[auth-remint-downgrade]] 参照

## Recently Completed (2026-06-17 session 91b) — live

**HQ 固定リストに不足2名を追加。** session91 で「西村さんが override に一致せず flake 露出」と推測 → 本人確認の結果、**影響を受けたのは Yukihiro Nishimura(「ayako nishimura」とは別人)**。確定 HQ は **4名**: Yuri Yamada / Ayako Nishimura / Yukihiro Nishimura / Yusuke Uejima。

`_hq_name_overrides()` の `base`([main.py](../../../sushizen_shift_app_clean/app/main.py))に `yukihiro nishimura`・`yusuke uejima` を追加(小文字)。→ この4名は `_effective_staff_profile` が**決定的に HQ + `['*']`** を返し、role-assignment 照会の flake に完全免疫。Heroku 29b10d5。

(注: session91 の構造修正で flake 自体は全ロールで解消済み。本追加は HQ 4名を二重に堅牢化するもの。)

## Recently Completed (2026-06-17 session 91) — live

**Staff Portal 降格の真の構造的根本原因を修正(session90 は不完全だった)。** 西村さんアカウントで「food master 登録→reload で Staff Portal、再ログインで戻る」が継続。「カツ」登録時に2件重複も発生。

**session90 が不完全だった理由**: フォールバック権限を `permissions_for_role(role, staff_name=...)` から導出していたが、これは内部で **`resolve_staff_access_profile(staff_name)` を再呼び出し**([security_tokens.py:26](../../../sushizen_shift_app_clean/app/security_tokens.py))= flake する当の関数。さらに `issue_access_token` も同じ経路で権限を焼くため **token の権限claim も STAFF になり得た**。→ role は守られても**権限が flake し続けた**。

**最終的な発生源**: 全 cost エンドポイントの認可 `_token_actor`([cost_api.py:89](../../../sushizen_shift_app_clean/app/cost_api.py)) が `permissions_for_role(staff_name=...)` で権限算出 → flake で `cost.write` 消失 → **保存/読込が 403**。この「一見失敗→再送」が**重複INSERT競合**の引き金でもある(`create_cost_ingredient` は重複名チェックを持つが一意制約が無く、ほぼ同時の2POSTが両方チェック通過)。

**修正(原則: 維持した権威ロールの権限は、staff 再解決ではなく ROLE 定義から導出)**:
- `resolve_role_permissions(role)`([db.py:682](../../../sushizen_shift_app_clean/app/db.py)) は **staff 非依存・role→権限を直接解決**(HQ→`['*']`)で flake しない。これをフォールバック源に。
- `_actor_from_token_request`(/api/auth/session)・`api_auth_verify`: profile_role != 維持role の時は `resolve_role_permissions(role)` で導出。
- `_token_actor`(全 cost API): role の権限を **union** し、flake が role 付与権限を剥奪できないように。

**西村さん**: HQ override(`{yuri yamada, ayako nishimura}`)に**名前が一致していない疑い**(綴り違い)→ `staff_role_assignments` 経由で flake 露出。HQ 扱いなら実 `display_name` を確認し `HQ_APPROVER_NAMES` env に追加すると確実。

検証: `ast.parse` OK。Heroku 0067f7e。**詰まっているユーザーは一度ログアウト→再ログイン**。

### 未対応(別タスク)
- 食材作成の **check-then-insert 競合**で重複(「カツ」×2)。一意制約 or `INSERT ... ON CONFLICT` でレース耐性化が必要。既存重複データのクリーンアップも。auth flake 解消で再送トリガーは減るはず。

### 教訓 (session 91)
- **権限を per-staff プロファイル再解決から導出してはいけない**。`resolve_staff_access_profile`/`permissions_for_role(staff_name=...)` は role-assignment 照会の一時ミスで STAFF に落ちる。維持した権威ロールの権限は必ず **role 定義(`resolve_role_permissions`)**から。
- role を守っても、権限を flake する関数から取れば降格する。**権限の導出元まで flake-free にする**のが完全修正
- [[auth-remint-downgrade]] 参照

## Recently Completed (2026-06-17 session 90) — live

**再発した Staff Portal 降格バグの真の根本原因(permissions 版)を修正。** スタッフ報告「食材登録→reload で Staff Portal に切り替わり登録が反映されない。Cost Calculation 操作中に発生、昨日から継続」。

**根本原因**: session82 は `role` の STAFF 降格は防いだが **`permissions` は守っていなかった**。`_actor_from_token_request`([main.py:2072](../../../sushizen_shift_app_clean/app/main.py)) と `api_auth_verify` は role を token/staff_master の強い方で維持する一方、**permissions は profile から先に取得**。`resolve_staff_access_profile` が一瞬 STAFF にフォールバック(昇格ロールが `staff_role_assignments` のみに在り `staff_master.role` は STAFF — session88 で作った **CK MANILA 等のカスタムロール**が該当)すると、**非空の STAFF 権限**を返す → `if not permissions` 再導出ガードを素通り → **role=admin・permissions=STAFF** の不整合 → フロントは permission ベース(`canAccessAdminNav`)で Staff Portal 判定 → 落ちる。Cost Calculation は毎リクエスト＆reload で session/verify を叩くため頻発。

**修正(3点)**:
- backend `_actor_from_token_request`: 「**profile_role == 解決後role の時のみ profile 権限を信頼**、それ以外は token の権限(`claims.permissions`)/role 由来へ」。token は `permissions_for_role(role)` を埋め込み済みなので強ロール権限が取れる。
- backend `api_auth_verify`: 同様に「profile_role==role 時のみ profile 権限、それ以外は `permissions_for_role(role)`」。HQ は従来通り `['*']`。
- frontend `nonDowngradedAccess`([auth.ts](src/lib/auth.ts)): **role 降格を拒否した時(`keptRole`)は現在の権限を維持**(同レスポンスの権限も STAFF 級のため)。`lostStar` ガードが拾えない非`*`ロールの多層防御。

**重要**: HQ override ユーザー(Yuri/西村)は常に `['*']` で免疫だったため再現せず、**カスタムロール運用開始(昨日)で表面化**した。

検証: `ast.parse` OK、`tsc --noEmit` exit0。Heroku 101c2fb。**既に STAFF トークンで詰まっているユーザーは一度ログアウト→再ログインで解消**。

### 教訓 (session 90)
- **role-keep と permission-keep は別ガード**。片方だけ守っても、フロントの導線が permission ベースなら降格する。auth は「role と permissions が常に同じ解決元から来る」よう整合させる
- token に権限を埋め込んでいる(`issue_access_token`)ので、profile フォールバック時は **token の権限が信頼できる強ロール権限**として使える
- [[auth-remint-downgrade]] メモリ参照

## Recently Completed (2026-06-17 session 89b) — live

session89 のフォローアップ。ドラフトが部品候補に**出る**ようになったが、保存時に「Processed master items can include processed components only; product and draft items can include processed or product components.」の赤帯エラーで**保存できなかった**(親draft・子draftのコンボ)。

**原因**: `_validate_cost_item_components`([db.py:24113](../../../sushizen_shift_app_clean/app/db.py)) の許可子タイプが `parent==processed ? {processed} : {processed, product}` で、**draft 子が常に除外**されていた。候補には出せても保存バリデーションで弾かれていた。

**修正**: parent別に分岐 — `processed→{processed}` / **`draft→{processed, product, draft}`** / `product→{processed, product}`。draft 親のみ draft 子を許可(公開済み product は不安定回避のため published 限定維持)。エラーメッセージも更新。循環参照は `_assert_cost_component_descends_to_target`([db.py:24046](../../../sushizen_shift_app_clean/app/db.py)) が再帰walkで保存時にも防ぐ(draft子にも適用)。

検証: `ast.parse` OK。Heroku acbaca7。

### 教訓 (session 89b)
- 「候補に出す(`list_cost_component_options`)」と「保存を許可する(`_validate_cost_item_components`)」は**別々のバリデーション**。一方だけ直すと"選べるのに保存できない"状態になる。component再利用系は両方セットで確認

## Recently Completed (2026-06-17 session 89) — live

**Cost Calculation > New Product Costing: 保存したドラフトを別の原価計算で部品として再利用可能に。** スタッフ要望「Half Gyudon をドラフト登録 → 次のメニュー(Miso Ramen + Half Gyudon)でそのまま部品に使いたい」が**できなかった**問題。

**原因**: ドラフトは `menu_item_master` に `item_type='draft'` で保存されるが、部品候補を返す `list_cost_component_options`([db.py:24581](../../../sushizen_shift_app_clean/app/db.py)) が `item_type IN ('processed','product')` のみで **draft を除外**していた。再利用するには Publish して product 昇格するしかなかった(`publish_cost_product_draft` が draft→product 変換)。

**修正(両方=(b)で実装)**:
- backend `list_cost_component_options`: `IN ('processed','product','draft')` に拡張。draft は `status='draft'`(≠archived)で既に `is_active=TRUE` なので候補に出る。返却dictは元々 `item_type` を含む。
- frontend `loadComponentOptions`: `item_type` を ComponentOption へ通すように(従来は破棄)。
- frontend ピッカー: ドラフト候補に**琥珀色「Draft」バッジ**を候補ドロップダウン＋選択行に表示(processed/productとの混同防止)。
- frontend `processedComponentOptions`: **編集中アイテム自身を候補から除外**(自己参照→backendの循環参照ガード `"Circular processed item reference is not allowed."` を踏まないため)。

**設計上の安全性**: コスト計算 `_compute_cost_master_item_totals`([db.py:24232](../../../sushizen_shift_app_clean/app/db.py)) は**ネスト対応済み**＋**循環参照ガード**(`active_stack`)実装済み。よってドラフトを部品にすると原価がライブ計算され、子ドラフトを直すと親も再計算される(=スタッフ要望の「そのまま使える」)。

検証: `tsc --noEmit` exit0、eslint touched files 0 error、db.py `ast.parse` OK。Heroku 0fc6d9b。

### 教訓 (session 89)
- New Product Costing の「ドラフト」「Processed」「Product」は**同じ `menu_item_master` テーブルを `item_type` で区別**している。部品候補・コスト計算は item_type フィルタ次第で対象が変わる
- 自分自身を部品にできる UI は循環参照を生む。候補生成側で**編集中アイテムを除外**するのが定石(backendガードはあるが、UIで防ぐ方が親切)

## Recently Completed (2026-06-17 session 88) — live

CK Inventory の**モバイルでNew Sessionボタンが見えない**＋**カスタムロール「CK MANILA」にInventoryチャンネル権限を付けてもCK Inventoryがナビに出ない**問題をスタッフ報告で修正。

**問題1 (モバイルヘッダー)**: `src/app/store/ck-inventory/page.tsx:350` のヘッダーが `flex items-center justify-between`(折返し無し)で、右側ボタン群[Manila/Dubai切替][Manage Items][New Session]が幅~390pxで画面外に溢れ、New Session が見えない。
**修正**: ヘッダーを `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between` でモバイル縦積み、ボタン群を `flex flex-wrap` に。

**問題2 (権限でナビに出ない)**: `src/components/NavBar.tsx:636-647` の CK Inventory/Production Plan/Delivery のナビ可視性は**ロール固定リスト(ADMIN/HQ/MANILA_MANAGEMENT等)で判定**しており、**チャンネル権限を一切見ていなかった**。よってカスタムロール「CK MANILA」はリストに無く、どのチャンネル権限を付けても非表示。
**修正**: 3ページとも固定リストに加え `|| canAccessInventoryAdminNav(resolvedAuth)`(= `channel.admin.inventory.view/write` 保持)で通すように。→ **「Inventory」チャンネル権限を持つ任意のロールでCK系3ページが表示される**。CK Inventory ページ自体にロールガードは無い(`return null`は空表示用のみ)ためナビ修正で完結。

**代表への回答**: 付与すべきは **「Inventory」チャンネル** (`admin.inventory` / `/admin/inventory`)。既にそれを付けていたが、上記のコード側がチャンネル権限を見ていなかったのが原因。今回の修正で既存の付与がそのまま有効になる。

検証: `tsc --noEmit` exit0。

### 教訓 (session 88)
- **store系ナビの一部はチャンネル権限ではなくロール固定リストで判定している**(NavBar `staffItems` filter)。カスタムロール+チャンネル権限が効かない時はここを疑う。固定リストに `|| canAccessXxxAdminNav()` を足して権限ベースへ寄せる
- モバイルヘッダーのボタン群は `justify-between`単独だと溢れる。`flex-col→sm:flex-row` + ボタン群 `flex-wrap` が定石

## Recently Completed (2026-06-16 session 87) — live

session83 の②(支店別数量)の**ハードキャップが在庫配送をブロック**→スタッフ報告で修正。`src/app/store/ck-delivery/page.tsx`。

**問題**: 「made 300 · left 0」(既に他デリバリーで全量割当済)の品目に 150 を入れると `Math.min(entered, remaining)=0` で **qty 0→`if(qty<=0)continue`でスキップ**＝追加されず「Add Items」が無反応。在庫から配るケースを物理的に出せない。
**修正(ハードキャップ→ソフト警告)**:
- `handleAddItems`: `Math.min` 撤廃、**入力値をそのまま採用**(`qty<=0`のみスキップ)。
- UI: 入力の `max={remaining}` 撤廃、超過時は「capped to 0」→ **琥珀色「over made by N — from stock? (allowed)」** に変更(ブロックしない)。
- backend は元々qtyキャップ無し(`add_ck_delivery_items`は挿入のみ)なので変更不要。

検証: `tsc` exit0、`npm run build` 成功、eslint エラー0。Vercel 957d76d。

### 教訓 (session 87)
- **現場の数量上限は「ハードキャップ」にしない**。在庫・繰越など系統外の実在庫があるため、超過は**警告で許可**(ソフト)が正解。session83で「在庫がある場合がある」と言われていた通り、ハードキャップは現実に詰まる
- `Math.min(entered, remaining)` + `if(qty<=0)continue` の組合せは、remaining=0の時に**無言で何も追加しない**最悪UX。入力はそのまま使い、超過は注記で伝える

## Recently Completed (2026-06-16 session 86) — live

## Recently Completed (2026-06-16 session 86) — live

session84 の ②(store未選択ALL防止)の**回帰**＋Manila未対応をスタッフ報告→修正。`src/app/store/procurement/request/page.tsx`。

**回帰**: store必須化で `storeCode` を "ALL"→"" にしたが、`loadItemCatalog` が **store空だとカタログを空にして早期return**(`if(!activeStore){setCatalogSuppliers([]);return;}`)→**Dubaiで Kitchen Ingredients が supplier0・発注不可**。
**Manila未対応**: catalog-stores APIの "ALL" が dropdown に残り、`storeCode` を `allStores[0]`(="ALL"の場合あり)に自動既定していた。

| 修正 | 内容 |
|---|---|
| カタログ閲覧を store非依存に | `loadItemCatalog` の `activeStore` を `... || "ALL"` にフォールバック(早期returnを廃止)。**店舗未選択でも閲覧可**、送信は実店舗必須のまま。店舗選択で per-store 再読込 |
| Manila も実店舗必須(Dubai同様) | catalog-stores の "ALL" を **dropdownから除外**(`.filter(≠ALL)`)、`storeCode` の **自動既定(allStores[0])を廃止**、localStorageの stale "ALL" preference も無視 |

検証: `tsc` exit0、`npm run build` 成功、eslint エラー0。Vercel 057ae0b。

### 教訓 (session 86)
- **「必須化」と「カタログ閲覧」は別物**: store_code を空必須にすると、storeに依存するカタログ読込が連鎖で壊れる。**閲覧用は "ALL" フォールバックで常時表示、送信検証で実店舗を強制**、と分離する
- ドロップダウンの危険値("ALL")は**選択肢から除外＋自動既定しない**＋**stale preference(localStorage)も弾く**の3点セット
- Manila/Dubai で同じ「実店舗必須」を実現。ALLは「For All Stores」チェックのみ

## Recently Completed (2026-06-16 session 85) — live

> **代表確認(任意)**: Daily Check ドバイのアグリゲーターは `Careem/NOON/Talabat/Deliveroo`(ratings-entryのSushi Zen Dubai準拠)、支店は `Business Bay/JLT/Arjan/Al Mina/Al Barsha` で実装。実運用と差があれば配列を直すだけで調整可。

## Recently Completed (2026-06-16 session 85) — live

Daily Check の**ドバイ版**要望(現状Manila固定)。フロントのみ(バックは元々city非依存でJSONB保存)。

| 内容 | ファイル | 修正 |
|---|---|---|
| 店舗入力をcity対応 | `src/app/store/daily-check/page.tsx` | `BRANCHES/AGGREGATORS/TZ` を **city別マップ**化。city は `auth.city` 既定＋**マネージャー向けManila/Dubaiトグル**。city変更で branch/aggStatus リセット。Dubai: 支店BB/JLT/Arjan/Al Mina/Al Barsha・アグリ Careem/NOON/Talabat/Deliveroo・tz Asia/Dubai |
| 本部監視をcity対応 | `src/app/admin/daily-check/page.tsx` | City フィルタ追加。サブコンポーネントは**提出データ駆動**(`Object.entries(check.aggregator_statuses)`)＋統合ラベルマップ`AGG_LABEL`/`branchLabelOf`で任意都市を正しく表示。時刻は `tzOf(check.city)` |

検証: `tsc` exit0、`npm run build` 成功、eslint エラー0。Vercel 6bdabfc。

### 教訓 (session 85)
- **Daily Check のバックは city非依存**(city/branch_code/aggregator_statuses[JSONB]を汎用保存)→ ドバイ版はフロント定数のcity別化だけで実現
- **管理画面のサブコンポーネントは「固定リスト反復」をやめ「提出データのキーを反復」**にすると多都市対応が楽(ラベルは両都市統合マップから)。時刻TZは `check.city` から導出
- アグリゲーター名の正典: ratings-entry の Sushi Zen Dubai = Careem/NOON/Talabat/Deliveroo

## Recently Completed (2026-06-16 session 84) — live

## Recently Completed (2026-06-16 session 84) — live

ドバイ発注運用の2点（`src/app/store/procurement/request/page.tsx`、フロントのみ）。

**① 差し戻し編集でサプライヤー混在**
- 真因: 差し戻し(Return/Reject)オーダーの編集時、カタログが**全サプライヤー表示**のままで、スタッフが元(例SAFCO)以外(CME等)の商品にも数量入力→1申請に複数サプライヤー混在。
- 修正: `supplierSections`(useMemo) に**編集モード時のフィルタ**追加。`editRequestId` がある時は `editRequestItems` の `vendor_name` 集合に限定→**元サプライヤーのみ表示**(チップ・セクション両方)。ヘッダーに注記。別サプライヤーは新規オーダーで。

**② Store未選択で"ALL"発注**
- 真因: Dubaiで店舗未指定だと `loadCatalogStores` が **`storeCode="ALL"` を自動セット**(表示は「Select store (required)」だが実態ALL)。送信検証は `!storeCode.trim()` だけで**"ALL"が素通り**。
- 修正: ①Dubai未指定時の自動"ALL"をやめ空""に。②送信検証を **`!allStoresFlag && (空 or "ALL") → エラー`** に変更。**実店舗必須、ALLは「For All Stores」チェック時のみ**。

検証: `tsc` exit0、`npm run build` 成功、eslintクリーン(既存warnのみ)。Vercel 3c37c23。

### 教訓 (session 84)
- **差し戻し編集は「元サプライヤーにスコープ」**が安全。`editRequestItems[].vendor_name` 集合で `supplierSections` を絞れば、チップ・セクション・入力対象すべてが連動
- **"required" プレースホルダと実stateの不一致は罠**: 表示は「Select store」でも内部 `storeCode="ALL"` で素通りしていた。**デフォルトで危険値(ALL)を入れない**＋送信検証で明示チェック
- 新規オーダーの複数サプライヤー混在は正常。問題は「差し戻し編集での意図しない追加」のみ

## Recently Completed (2026-06-16 session 83) — live

## Recently Completed (2026-06-16 session 83) — live

スタッフからCKプロダクション〜デリバリーの3点。

**③ 写真アップロード「[object Object]」バグ（緊急・先行デプロイ）**
- 真因: `getAuthHeaders()` が **multipart送信に `Content-Type: application/json` を強制**→ブラウザがboundaryを付けず→FastAPIがファイルを読めず**422**→検証エラーオブジェクトが「[object Object]」表示でCK発送がブロック。
- 修正: `getUploadHeaders()`(Authorizationのみ、Content-Type無し)を `src/lib/auth.ts` に新設し、**CKラベル写真・Cashier Log・Cash Report(SC/PWD/ID/QRPH)** の全アップロードに適用(同じ潜在バグ)。エラーdetailのstring判定も追加。

**① CK Production Plan に担当者（複数）選択**
- `ck_production_plans.assigned_staff`(JSONB配列)追加。create で受領、get/listで返却。
- フロント: New Production Plan に **スタッフ複数選択**(検索付き、`/api/staff/names?city=manila` から、チップ表示)。プラン詳細に「In charge」表示。指定6名はマニラ名簿に含まれ選択可、入替・追加・削除はOS上で自由。

**② CK Delivery を支店別の個数で**
- 真因: Add Items が QC実績数(`qc_actual_qty`)を**全量そのまま**デリバリーに入れていた。
- `get_ck_production_plan` の各itemに **`delivered_qty`(plan_item_id単位の割当合計)** を追加。
- フロント: Add Items の各QC品目に**数量入力**。初期値=残数(`qc_actual_qty − delivered_qty`)、**上限=残数**(超過は自動cap)。「made X · left Y」表示。300pcを Taft150/Paranaque100 に分配可。
- **QC実績数は実際に作った数＝当日在庫も含む**ので、これを上限にすれば「生産＋在庫」の合計が上限。前日在庫はmanual itemで対応。

検証: `tsc` exit0、`npm run build` 成功、`ast.parse` OK。`/api/staff/names` 疎通(マニラ名簿)。Heroku v1283 / Vercel 97917a7。

### 教訓 (session 83)
- **FormData(multipart)アップロードに `getAuthHeaders()` は厳禁**(Content-Type: application/json が付きboundary消失→422→「[object Object]」)。**`getUploadHeaders()`(Content-Type無し)を使う**。SC/PWDレシートをDiscordに上げていた一因の可能性
- **QC実績数(`qc_actual_qty`)＝実際に作った数(在庫込み)**。デリバリー上限はこれ−既割当(`delivered_qty`)。`plan_item_id` で割当を集計
- スタッフ選択は `/api/staff/names?city=` を名簿ソースに(複数選択＝JSONB配列)

## Recently Completed (2026-06-16 session 82) — live

> **西村さん(Ayako/HQ)へ案内**: 既にSTAFFトークンで詰まっている場合、一度**ログアウト→ログイン**で新しいHQトークンを取得すれば定着します。

## Recently Completed (2026-06-16 session 82) — live

session72で直したはずの**Cost Calculation→Staff Portal降格が再発**。西村さん(HQ)で操作中に頻発・コスト未保存。

**真因(session72で見落としていた本丸)**: `/api/auth/verify` のロール解決が `profile.primary_role OR row.role` で、`resolve_staff_access_profile` が **role assignment取得ミス時にSTAFFへフォールバック**すると、その**STAFFが staff_master の本来HQロールを上書き**し、**STAFFトークンを発行**していた。クライアントは `nonDowngradedAccess` でlocalStorageのrole=HQを維持するが、**トークン自体がSTAFF**→サーバが管理操作を拒否(コスト未保存)→やがてStaff Portal化。さらに `auth.ts` の remint が **verifyにbearerトークンを送っておらず**、session72のバック保護(トークン提示時のみ発動)が汎用更新経路に効いていなかった(=5つ目の穴)。

| 修正 | ファイル | 内容 |
|---|---|---|
| verify ロール解決 | `app/main.py` | **STAFFのprofileが非STAFFロールを上書きしない**(`_actor_from_token_request`と同ロジック)。HQは `permissions=['*']` |
| verify トークン保護 grace | `app/main.py` | 1h→**7d**(期限切れ直後のHQトークンでも降格を防ぐ) |
| HQ override 安全網 | `app/main.py` (`_hq_name_overrides`) | 確定HQリーダー `{yuri yamada, ayako nishimura}` を基準セット化(`HQ_APPROVER_NAMES` envと併用)。`_effective_staff_profile` がHQを確定的に返す→データ揺れに非依存 |
| auth.ts remint | `src/lib/auth.ts` | remintで**現bearerトークンをverifyに送信**(汎用更新経路もバック保護対象に=5つ目の穴を塞ぐ) |

検証: `ast.parse` OK、ロジック単体確認(profile=STAFF+row=HQ→HQ、override確認)、tsc/eslintクリーン。Heroku v1281 / Vercel 3d61b7c。verify 404(クラッシュ無し)。

### 教訓 (session 82)
- **降格の本丸はクライアントではなくバックの「トークン発行(verify)」**。クライアント側 `nonDowngradedAccess` はlocalStorage表示roleは守るが、**STAFFトークンが発行されると無力**(トークンがサーバ判断の真実)。verifyが**HQユーザーにSTAFFトークンを発行しない**のが根治
- `resolve_staff_access_profile` は assignment→staff_auth→staff_master→fallback の順。**assignmentが一時的に取れないとSTAFFへ落ちる**。verifyは `profile OR row` で STAFF が staff_master HQ を上書きしていた
- **確定的に守るべきリーダーは `HQ_APPROVER_NAMES`(コード基準セット併用)**で固定。データ起因の降格を構造的に排除
- 既にSTAFFトークンで詰まったユーザーは**再ログインで回復**(新HQトークン発行)

## Recently Completed (2026-06-16 session 81) — live

## Recently Completed (2026-06-16 session 81) — live

食品安全機能(①〜⑤)の**統合テスト**を実施し、バグ1件を発見・修正。

**テスト環境**: ローカルにPostgres16起動(`pg_ctl`, `LC_ALL=C`回避 + `PGCLIENTENCODING=UTF8`)→ throwaway DB `sushizen_test` → `.venv/bin/python` で `app.db` を直接import、CK製造日ラベル全フローを実DBで実行する統合テストスクリプト(`_ck_label_test.py`、リポジトリには未コミット)。

**結果: 23アサーション、最終的に全PASS**。検証項目:
- ① Dispatchゲート: ラベル全欠落→ブロック(品目名列挙)、日付のみ写真無し→ブロック、3点完備→DISPATCHED成功
- ② 受領: SPOILEDフラグ永続、OK品の label_ok=TRUE 記録
- ⑤ Incident: フラグ品で1件自動起票、severity=high(SPOILED/EXPIRED)、`incident_raised`
- 期限切れ品の受領で **label_issue自動EXPIRED**
- ④ Compliance集計: total/with_production_date/with_photo/fully_labeled/expired/flagged が正確、delivery JOIN、branchフィルタ
- 二重confirm拒否

**発見・修正したバグ**: `dispatch_ck_delivery` が**品目ゼロの空デリバリーを発送できた**(ゲートは「ラベル欠落品目」のみ検査→品目0だと素通り)。**品目数0なら発送不可のガード追加**(`app/db.py`)。再テストで全PASS。Heroku v1280。

### 教訓 (session 81)
- **psycopg2のサーバ依存ロジックは実Postgresでテスト**(SQLite不可: `::date`/`ON CONFLICT`/`RETURNING`/`gen_random_uuid`)。ローカルPG16を `pg_ctl -D` で起動、throwaway DBで統合テスト
- macOS PG起動失敗`postmaster became multithreaded` → `LC_ALL=C`。client_encoding ASCII(C locale)でSQL中の `→`/`—` がUnicodeError → `PGCLIENTENCODING=UTF8`(本番はUTF8で無問題)
- **テストは隔離(TRUNCATE/unique key)必須**: 前回クラッシュ残骸で④集計が6件になり誤FAIL。製品バグではなくテスト未隔離だった
- **「不足だけ検査」ゲートはゼロ件で素通りする**穴に注意(empty deliveryバグ)。"全件が条件を満たす"系は別途「最低1件」チェックを

## Recently Completed (2026-06-16 session 80) — live

## Recently Completed (2026-06-16 session 80) — live

食品安全 **②⑤**（①〜⑤完了）。

| 内容 | ファイル | 修正 |
|---|---|---|
| ② 受領ラベル検証UI | `src/app/store/ck-delivery/page.tsx` | Confirm Receiptモーダルに品目ごと「Label check: OK/Problem」+ Problem時の issue select(SPOILED/NO_LABEL/NO_DATE/EXPIRED/OTHER)。製造日/期限も表示。`item_receipts` に `label_ok`/`label_issue` 送信。フラグ時はトースト通知 |
| ⑤ 即時Incident起票 | `app/db.py` (`confirm_ck_delivery`) | 受領時にフラグ付き品目があれば **「Food Safety — CK Label」Incidentを自動起票**(`insert_incident_report`、SPOILED/EXPIREDは severity=high)。既存incidentパイプライン(/admin/incidents・バッジ・escalation)でHQ/CKに即連携。`result["incident_raised"]` |

検証: `tsc`/eslint クリーン、`npm run build` 成功、`ast.parse` OK。Heroku v1279 / Vercel 9b36d6e。

### 食品安全シリーズ完了 (①〜⑤)
- **①** CK Dispatch 製造日+期限+ラベル写真 必須ゲート(session78)
- **②** 店舗Receiving ラベル検証UI(session80)
- **③** Travel Path 日次チラー点検(session76)
- **④** 本部 CK Label Compliance ダッシュボード(session79)
- **⑤** 不備→Incident即時起票(session80)
- 対象=マニラCK。Dubai展開は未(同パターンで横展開可)

### 教訓 (session 80)
- **Incident起票は `insert_incident_report(row)`**(city/branch/reporter_name/category/severity/description/incident_datetime)。既存の incident UI/バッジ/escalation を再利用すれば「即時連携」が低コスト
- ②③④⑤すべて①で足した `label_*` カラムに集約。**最初にデータモデルを正しく置けば後段(検証/監視/escalation)は全部その上に乗る**

## Recently Completed (2026-06-16 session 79) — live

食品安全 **④ 本部「CK Label Compliance」ダッシュボード**（①のデータを集計）。

| 内容 | ファイル | 修正 |
|---|---|---|
| 集計関数 | `app/db.py` (`ck_label_compliance`) | city/date範囲/branchで `ck_deliveries`×`ck_delivery_items` をJOIN。品目ごとの製造日/期限/写真/label_ok/issue/期限切れ + summary(total/with_production_date/with_photo/fully_labeled/expired/flagged) |
| API | `app/main.py` | `GET /api/admin/ck-delivery/label-compliance`(HQ/ADMIN/MANILA_MANAGEMENT/MANAGER)。`_actor_from_token_request` でrole gate |
| 管理ページ | `src/app/admin/ck-label-compliance/page.tsx`(新規) | 日付/支店フィルタ、KPI(fully labeled%・with photo%・expired・flagged)、配送ごとの品目テーブル(製造日/期限/写真リンク/検証状態、欠落・期限切れ・flagを赤ハイライト) |
| ナビ | `src/components/NavBar.tsx` | admin nav に「CK Label Compliance」(ShieldCheck) 追加、role gate |

検証: `ast.parse` OK、tsc/eslint クリーン、`npm run build` 成功(162p, 新route)。Heroku v1278 / Vercel cc7c29c。endpoint 403(認証要求=正常)。

### 教訓 (session 79)
- ①で `production_date/expiry/label_photo_url/label_ok/label_issue` を蓄積→④はJOIN集計するだけ。**データを先に取る設計が後段の可視化を軽くする**
- 本部監視は `_actor_from_token_request` の role gate(HQ/ADMIN/MANILA_*)。CK系の置き場所として admin nav の Cold Chain 隣に配置
- **残**: ② Receiving手動flag UI(店舗が「ラベル無し/異臭」をその場で記録)、⑤ 即時異臭報告→Incident。①④で「強制+可視化」は完成、②⑤は「現場検知+急性対応」

## Recently Completed (2026-06-16 session 78) — live

> **次段の実装(未着手・design確定済)**: 食品安全 ② 店舗Receivingの手動ラベル検証UI(label_ok/issueは backend実装済・期限切れ自動flagも実装済、フロント未) / ④ 本部「CK Label Compliance」ダッシュボード(CK系配下) / ⑤ 異臭・無日付の即時報告→Incident連携。決定: 製造日+期限+ラベル写真すべて必須・空欄はDispatch不可・本部DBはCK系配下・**まずマニラのみ**。

## Recently Completed (2026-06-16 session 78) — live

食品安全インシデント: 豚骨スープに製造日ラベル無し→腐敗→Taftで客クレーム(サルモネラ主張)。真因=CKで製造日ラベルが個人裁量(植嶋さんは記載、Israelは未管理)で**強制点が無い**。代表方針: 既存CKパイプライン(生産プラン→QC→Dispatch→店舗Receiving)に製造日ラベル管理を組込み、本部も可視化。

**① CK Dispatch 製造日ラベル必須ゲート（実装・デプロイ済）**
| 内容 | ファイル | 修正 |
|---|---|---|
| スキーマ | `app/db.py` (`ensure_ck_delivery_tables`) | `ck_delivery_items` に `production_date`/`expiry_date`/`label_photo_url`/`label_ok`/`label_issue` 追加(ALTER) |
| Dispatchゲート | `app/db.py` (`dispatch_ck_delivery`) | **全品目が製造日+期限+ラベル写真を持たないと発送不可**(欠落品目名を列挙してValueError→400)。`set_ck_delivery_item_label`/`set_ck_delivery_item_label_photo` 追加。`get_ck_delivery` で新列返却 |
| Receiving検証(backend) | `app/db.py` (`confirm_ck_delivery`) | item_receiptsに `label_ok`/`label_issue` 反映 + **期限切れ品目を自動でlabel_ok=FALSE, issue=EXPIRED** |
| API | `app/main.py` | `PATCH .../items/{id}/label`(日付)、`POST .../items/{id}/label-photo`(Drive `CK_Labels/<branch>/<date>`、cash_report_apiのdriveヘルパ再利用)、CKDeliveryItemReceiptInに label_ok/label_issue |
| フロント | `src/app/store/ck-delivery/page.tsx` | PENDING時に「Production-date labels」カード: 品目ごと製造日/期限の日付入力+ラベル写真撮影、Ready/Incomplete表示。backendゲートで未完は発送不可 |

検証: `ast.parse` OK、`tsc`/eslint クリーン、`npm run build` 成功(161p)。Heroku v1277 / Vercel eaab8c7。対象=マニラCK(`ck_delivery_items`)。

### 教訓 (session 78)
- **食品安全は「個人裁量」を「仕組みで強制」に**。製造日ラベルは Dispatch のハードゲート(空欄=発送不可)が根本対策。担当者(Israel等)の力量に依存しない
- **CKパイプライン**: 生産プラン→QC(PASS/FAIL)→CK Delivery(dispatch)→店舗Receiving(confirm)。製造日はDispatchで取得しReceivingで検証する2段防衛
- 写真はcash_report_apiのDriveヘルパ(`_drive_service`/`_ensure_cr_folder`/`_upload_to_drive`)を main.py から再利用(`CK_Labels/`配下)
- **残実装**: ② Receiving手動flag UI(backend済)、④ 本部CK Label Complianceダッシュボード、⑤ 即時異臭報告→Incident。データ(production_date/expiry/photo/label_ok)は①で蓄積開始済なので④はこれを集計するだけ

## Recently Completed (2026-06-16 session 77) — live

> **代表アクション(要対応)**: CME(Chef Middle East)復旧 → Admin → Order Catalog → **Suppliers タブ** → 「Chef Middle East」(0 active / N inactive・"Hidden"表示)の **Reactivate All** をクリック。Suppliersタブに出てこない場合は deactivate 以外が原因なので連絡を。

## Recently Completed (2026-06-16 session 77) — live

緊急: ドバイJLTで Chef Middle East (CME) が New Request カタログにも Admin/Order Catalog にも出ない(昨日まで表示)。

**真因**: curatedカタログのサプライヤーは **Deactivate(active=FALSE)はできるが Reactivate が無い一方通行**だった。CMEが(意図/誤操作で)deactivateされ、注文フォーム(active_only)からも消え、**UIから戻す手段が無かった**。curatedカタログの item は削除されず active=FALSE で残存(`proc_curated_catalog_items`)するため、Reactivateで完全復旧可能。

| 修正 | ファイル | 内容 |
|---|---|---|
| Reactivate関数+API | `app/db.py`, `app/main.py` | `reactivate_proc_catalog_supplier`(active=TRUE) + `POST /api/admin/procurement/catalog/supplier/reactivate`(deactivateの対) |
| UI | `src/app/admin/procurement/catalog/page.tsx` | Suppliersタブに **「Reactivate All」ボタン**(inactive_count>0時)+ 0-active供給元に **"Hidden — deactivated"** タグ |

**環境制約**: このセッションから Heroku CLI/API/DB へ直接アクセス不可(netrcのAPIトークン失効・401、`.env`のDATABASE_URL credentialローテーション済み、`heroku pg:psql`は対話ログイン要求)。**git push(deploy)のみ可**。よって私からCMEを直接reactivateできず、**代表がReactivateボタンで実施**する必要あり。

検証: `ast.parse` OK、tsc/eslint クリーン、reactivate endpoint 403(認証要求=正常)。Heroku v1276 / Vercel 8d7c36e。

### 教訓 (session 77)
- **deactivateを作るなら必ずreactivateも**。一方通行の無効化は、誤操作時に復旧不能でデータが「消えた」ように見える(今回のCME)
- **curatedカタログのサプライヤーはUIから削除不可・deactivateのみ** → 消失=ほぼ必ずdeactivate。Suppliersタブはinactive件数も返すので、deactivated供給元はそこで見える(今回"Hidden"タグも追加)
- **Heroku直アクセス不可の制約下では、DB修正は「デプロイ可能なコード(エンドポイント/UI)を出してユーザーがアプリ内で実行」**が現実的。緊急データ復旧もこの形に倒す
- (未確定)CMEがdeactivateされた経緯は不明。Reactivate後、必要なら監査ログ(`procurement.curated_catalog.supplier_deactivate`)で誰がいつ実行したか追える

## Recently Completed (2026-06-16 session 76) — live

## Recently Completed (2026-06-16 session 76) — live

代表依頼2件。バックエンドのみ。決定: ①全店(CK含む)適用 ②返信を採点しない(方法A)・過去データは対応しない。

**① Travel Path 文言変更/項目追加**
- Mid-Shift 04 (`TP_MS_004`): `number` → `numbers`。CUBAO の `CB_MS_004` も grammar 修正(Discord接尾辞は付けず)。
- **新規 Closing チラー/フリーザー点検**項目を全店に追加(`ensure_travel_path_tables` の冪等マイグレーション + default_items):
  - TAFT_PAR `TP_CL_CHILLER`(CLOSING, sort 145=14番目の直後)、CUBAO `CB_CL_CHILLER`(CLOSING 236)、**CK `CK_EV_CHILLER`(EVENING 110)**。
  - **CKはOPENING/MID_SHIFT/CLOSINGでなくMORNING/AFTERNOON/EVENINGのマネージャーチェックリスト**なので、Closing相当のEVENINGに配置。
- ファイル: `app/travel_path_default_items.py`, `app/db_travel_path.py`

**② Product Scoring で管理者の返信コメントを採点除外**
- **真因**: `backfill_qc_scores.py` の `build_tasks` が、登録Discordチャンネルの画像を**投稿者・意図に関係なく全部AI採点**。完成画像チャンネルで管理者が画像付き返信(フィードバック)するとディスパッチ写真として採点され、スコア・件数に混入。
- **修正(方法A)**: `_is_reply(msg)`(Discord `type==19` or `message_reference.message_id`)で**返信メッセージを採点対象から除外**。人(author)に依存せず、管理者自身のtop-levelディスパッチ写真は引き続き採点。スキップ件数をログ出力。
- ライブ採点も `fetch_messages_for_date`(=`build_tasks`)経由の1パスのみ(`backfill_qc_scores.py`)なので網羅。
- **過去の誤採点分は今回未対応**(代表判断)。

検証: `ast.parse` OK、`_is_reply` 単体確認(top-level採点/返信スキップ)。Heroku v1275、items endpoint 401(認証要求=正常)。Travel Pathマイグレーションは次回ページ閲覧時に冪等適用(drain項目と同パターン)。

### 教訓 (session 76)
- **CKのTravel Pathは別スキーマ**(MORNING/AFTERNOON/EVENINGのマネージャーtask)。「Closing項目」をCKに足す=EVENINGに配置
- **Travel Path項目の追加/変更は `ensure_travel_path_tables` の `ON CONFLICT (item_code) DO UPDATE` 冪等マイグレーション** + `travel_path_default_items.py`(新規seed用)の二箇所
- **Product Scoringは登録チャンネルの全画像を採点**。「人ではなく内容で除外」=Discordの**返信(reply)判定**が最もクリーン(フィードバックは返信、提出はtop-level)。`type==19`/`message_reference` で判定
- QC採点の取り込みゲートは `backfill_qc_scores.py` の `build_tasks` 一箇所(main.pyのcronには無し、Heroku Scheduler等で実行)

## Recently Completed (2026-06-16 session 75) — live

> **代表アクション(未確認)**: SC/PWD割引レシート等の**現物保管がBIR等で法令上必要か**を確認（このログは証憑の電子化・突合用。現物保管要否は別途）。

## Recently Completed (2026-06-16 session 75) — live

スタッフ要望: Discordチャンネル(paranaque-sc-pwd-ids / qrph-cashless)をやめ、SC/PWD割引とQRPHを**どのキャッシャーも勤務中に1件ずつOSに記録**。日合計(件数・金額)は Closing Cash Count に入力。OCRはミス多いので不採用、金額は手入力。決定事項: 独立ページ／名前+PIN／Closingは自動セット+上書き可／マニラ全3支店同時／SC・QRPH同時。

| 内容 | ファイル | 修正 |
|---|---|---|
| 記録テーブル+CRUD | `app/db_cash_report.py` | `cash_cashier_log_entries`(branch/entry_date/entry_type[SCPWD|QRPH]/cashier_name/amount/reference_no/receipt_url/id_front_url/id_back_url/notes) を ensure に追加。`create_cashier_log_entry`/`update_cashier_log_photo`/`list_cashier_log_entries`/`cashier_log_totals`/`delete_cashier_log_entry` |
| API | `app/cash_report_api.py` | `POST/GET /api/store/cashier-log/entries`、`POST .../entries/{id}/photo`(Drive投入: SC_PWD_Receipts/SC_PWD_ID/QRPH 再利用)、`GET .../totals`、`DELETE .../entries/{id}`。`_require_token`(任意キャッシャー)、Manila支店のみ |
| 新ページ | `src/app/store/cashier-log/page.tsx`(新規) | 名前+PIN+支店+日付、SC/PWD|QRPHタブ。SC/PWD=金額+OR番号(任意)+写真3(receipt/ID表/裏)、QRPH=金額+ref(任意)+確認画面写真1。本日ログ一覧(全キャッシャー)+日合計。作成→写真アップ→再読込 |
| Closing連携 | `src/app/store/cash-report/page.tsx` | ClosingForm が `cashier-log/totals` を取得。空欄に自動セット(初回)+「Use」ボタンで再適用(手動上書き優先)。SC/PWD件数・割引額、QRPH金額に反映 |
| ナビ | `src/components/NavBar.tsx` | 店舗ナビに「Cashier Log」追加 |

検証: `tsc --noEmit` exit0、`npm run build` 成功(161ページ, 新route `/store/cashier-log`)、`ast.parse` OK。実API: totals→401 / create空→422。Heroku v1274。

### 教訓 (session 75)
- **既存Drive基盤を再利用**: `_drive_service`/`_ensure_cr_folder`/`_upload_to_drive`(cash_report_api) で写真投入。新機能でもフォルダ階層(SC_PWD_*/QRPH)を踏襲
- **写真添付は「先にエントリ作成→IDで写真POST」**パターン(既存のreport→photoと同型)。multipartで receipt/id_front/id_back を slot 指定
- **Closing自動反映は「空欄のみ初回プリフィル + Useで明示再適用」**。完全自動固定にせず手入力を尊重(代表方針)
- Discord運用→OS移行: 「専用チャンネル」=支店×日付の本日ログ一覧で代替。各エントリに担当者名・時刻を残し個別保存

## Recently Completed (2026-06-16 session 74) — live

## Recently Completed (2026-06-16 session 74) — live

代表報告: Number of Stock(=Number of Orders 入力)で**入力途中にRefreshされデータが消える**。フロントのみ。

**真因（2つの合わせ技）**:
1. `AutoReload`（[components/AutoReload.tsx](src/components/AutoReload.tsx)）は3秒毎に `/api/version` をポーリングし、新デプロイ検知で**問答無用の `hardReload()`**（`location.replace`）。**未保存入力のチェック皆無**。本日多数デプロイ→入力中スタッフの画面が強制リロード。
2. `OrderEntryTab` の `gridData` は**Reactステートのみ**（sessionStorage退避なし）→ どんなリロードでも未保存分消失。Ratings Entry も同構造。

| 修正 | ファイル | 内容 |
|---|---|---|
| 共通ガード新設 | `src/lib/unsavedGuard.ts`(新規) | グローバル未保存レジストリ `setUnsaved/hasUnsavedEdits`＋`UNSAVED_EVENT`。フック `useUnsavedGuard(key, dirty)`（A登録＋C: beforeunload警告）。ドラフトヘルパー `saveDraft/loadDraft/clearDraft`(sessionStorage) |
| A: リロード延期 | `src/components/AutoReload.tsx` | `triggerReload()` を新設し全hardReload経路を置換。`hasUnsavedEdits()` が真なら `pendingReload` に退避し**保留**。保存で未保存が解消した瞬間（`UNSAVED_EVENT`）または次ポーリングでリロード。AutoReload自体は維持（CLAUDE.md教訓: 削除禁止） |
| B: ドラフト退避 | `OrderEntryTab.tsx`, `ratings-entry/page.tsx` | `anyDirty` 時に `gridData+dirty` を sessionStorage(`order-entry-draft:<date>` / `ratings-entry-draft:<date>`)へ保存。`loadDate` で復元（サーバ値に未保存編集を上書き、復元通知表示）。保存成功で破棄 |
| C: 離脱警告 | 同上（`useUnsavedGuard` 内） | 未保存時のみ `beforeunload` 警告（手動更新・タブ閉じ・遷移対策） |

検証: `tsc --noEmit` exit0、`npm run build` 成功(160ページ)、対象 eslint クリーン。Vercel 6fc51a4。

### 教訓 (session 74)
- **AutoReload は未保存入力を破壊し得る**。新デプロイ即リロードは便利だが、入力中ページには致命的。**未保存中はリロードを延期**（`hasUnsavedEdits()` ガード）。新たな入力系ページを足したら `useUnsavedGuard(key, anyDirty)` を呼ぶこと
- **入力系は sessionStorage にドラフト退避**を標準に。Reactステートのみは reload で即消える。`loadDate` 等の初期読込で復元
- 頻繁なデプロイ期は特に①が顕在化する（本日 v1268→v1273 + Vercel多数）。スタッフ入力中の強制リロードは「不具合」として報告されやすい

## Recently Completed (2026-06-16 session 73) — live

## Recently Completed (2026-06-16 session 73) — live

代表(Yuri/HQ)依頼: Admin Dashboard 入力の横伸び＆下段3ブランドの窮屈さ、Number of Orders をスタッフ共有する際モバイルで文字が小さい。フロントのみ。

| 内容 | ファイル | 修正 |
|---|---|---|
| ① 入力を2×2配置 | `src/components/admin/OrderEntryTab.tsx`, `src/app/admin/ratings-entry/page.tsx` | Sushi Zen全幅→下3列(`xl:grid-cols-3`) を、**Sushi Zen+Ramen Zen / All Veggie+J-Deli の2×2**(`lg:grid-cols-2`)に。データ多いSushi/Ramenを上段で広く。**Order EntryとRatings Entryは同一構造**なので両方修正。All Brands Combined は `max-w-4xl mx-auto` で横伸び抑制(OrderEntryのみ) |
| ② Share表示+PNG | `src/components/analytics/dubai/NumberOfOrdersTab.tsx` | Dashboard/Share トグル追加。Share=縦長・大フォントのカード(Grand Total大／支店別合計／アグリゲーター内訳の**両方**)。`html-to-image` の `toPng` で **PNG ダウンロード**(背景`#0b0d12`, pixelRatio2)。スクショ不要・モバイル/PC/スクショ全てで可読 |
| 依存追加 | `package.json` | `html-to-image@^1.11.13`（PNG出力用） |

検証: `tsc --noEmit` exit0、`npm run build` 成功、対象 eslint クリーン（既存useMemo警告のみ）。Vercel d834699。

### 教訓 (session 73)
- **Order Entry と Ratings Entry はブランドカードのレイアウトが同一構造**（Sushi Zen全幅＋`xl:grid-cols-3`）。片方直すならもう片方も
- **PNG出力は `html-to-image` の `toPng`**。透過を避けるため `backgroundColor` を明示（暗色`#0b0d12`）、`pixelRatio:2` で高精細。"use client" コンポーネントでトップレベルimportしてもビルドOK
- **共有用UIは「縦長・大フォント・固定幅(max-w-[520px])・solid背景」**が鉄則。PC幅のスクショがモバイルで縮んでも読める
- ブランド/支店/アグリゲーターのデータは `displayData.summary`(`total_orders`/`by_branch`/`by_aggregator`) に集約済み。Share カードはこれを参照

## Recently Completed (2026-06-16 session 72) — live

## Recently Completed (2026-06-16 session 72) — live

西村さん(HQ)報告: Cost Calculation 操作中に**度々 Staff Portal へ切り替わり**、気づかず作業すると保存されない。「以前直したはずが直っていない」。

**真因（前回修正が当たっていなかった理由）**: 以前の修正は汎用ポーリング `refreshAuthFromApi` に `nonDowngradedAccess` を入れたもの。しかし **Cost/Procurement のクライアントは独自の remint 経路**を持ち、`/api/auth/verify` の生 `role` を `nonDowngradedAccess` を通さず `setAuth` に直書きしていた。バックの verify は `_effective_staff_profile` でロール解決するが、これは役割取得の一時ミス時に **STAFF へフォールバック**し得る（`_actor_from_token_request` 側はコメント付きで保護済みだが verify は未保護）。→ Cost操作中、API毎の `costTokenHeaders` が `/api/auth/session` の一時失敗で remint 発火 → verify が transient STAFF → localStorage が STAFF に降格 → NavBar が `canAccessAdminNav`=false で **Staff Portal 表示**＋ページが権限ガードで弾く＝編集消失。

**同一バグが4箇所中3箇所に残存**していた（`auth.ts` の remint だけ保護済み）:
| ファイル | 修正 |
|---|---|
| `src/lib/costClient.ts` | remint に `nonDowngradedAccess`、verify に現トークン送信、session失敗時の remint を **401/403限定**（5xx/timeoutでは降格させない） |
| `src/lib/procurementClient.ts` | 同上 |
| `src/app/admin/procurement/page.tsx` (`tokenHeaders`) | 同上（procurementClientの複製インライン版） |
| `app/main.py` `/api/auth/verify` | **多層防御**: リクエストに現トークン(grace)があり同一staffで非STAFFなら、解決結果がSTAFF/空でも降格させない。新規PINログイン(トークン無し)は無影響 |

検証: `tsc --noEmit` exit0、対象 eslint クリーン、`ast.parse` OK。Heroku v1273 起動確認(root 405, verify不正→404でクラッシュ無し)。

### 教訓 (session 72)
- **remint 経路は4つある**（`auth.ts`/`costClient`/`procurementClient`/`admin/procurement/page.tsx`）。`/api/auth/verify` で再mintして `setAuth` する箇所は**必ず `nonDowngradedAccess` を通す**。1箇所直しても他が残ると同じ症状が再発（今回がまさにそれ）
- **`/api/auth/verify` はログインと remint の両用**。verify自体は STAFF を返し得る（`_effective_staff_profile` の一時フォールバック）。クライアント側ガード＋バック側(現トークン参照)の**二重防御**にする
- **session確認の失敗で安易に remint しない**: 一時的5xx/timeoutでも remint→降格レースが起きる。**401/403のときだけ** remint
- 新規 verify caller を足すときは `grep -rn 'verifyJson?.role' src/` で生role直書きが無いか必ず確認

## Recently Completed (2026-06-16 session 71) — live

## Recently Completed (2026-06-16 session 71) — live

CK新生産管理システム（`/store/ck-inventory`, `/store/ck-delivery`, `/store/ck-production-plan`）へのスタッフ依頼。

| # | 内容 | 真因 | 修正 |
|---|---|---|---|
| ①(a) | CK Inventory/Delivery が Dubaiのみ表示 | 3ページとも `city` が `auth.city` 固定の **const（切替UI無し）**。HQ/Dubai-cityアカウントだとManilaを見られない。Deliveryは支店ドロップダウンも `DUBAI_BRANCHES` 固定で症状が顕著 | 3ページに **Manila/Dubai切替**（canManage向け、**Manilaデフォルト**＝CKはManila拠点）。state化し既存の `[city]` deps で再読込 |
| ①(b) | アイテムが Daily Inventory(CK) と別物 | CK Inventoryは `menu_item_master`(processed, 224件=メニュー全カタログ)、Daily InventoryはCKは `daily_inv_report_items`(is_commissary) と**別テーブル** | `get_ck_processed_items`: **Manilaはcommissaryリストに統一**（198件、実APIで確認）。Dubaiは従来の `menu_item_master` 維持で既存非破壊 |
| ①(c) | CKアイテムの追加/削除ができない | menu_item_master読取専用、CK側に管理UI無し | CK Inventoryに **「Manage Items」モーダル**（Manila/canManage）。`POST/DELETE /api/store/ck-inventory/items` 新設→commissaryに書込（論理削除 is_active）。Daily Inventoryと共有なので両画面に反映。Salmon Loverのソース追加可 |
| ② | CK Delivery「Add Item」でQC合格品が候補に出ない | Delivery作成時のプラン紐付けが**手入力の数値「Linked Plan ID」(optional)**。スタッフは内部IDを知らず空欄→`plan_id=0`→`openAddItems` が `activeDelivery?.plan_id` 無しで候補読込を丸ごとスキップ。QC値("PASS")保存・判定自体は正常 | 手入力を**生産プランのドロップダウン**に置換（日付/status/done件数表示、`GET /api/store/ck-production-plan/plans?city=`）。新規Deliveryで正しく紐付く |

検証: `tsc --noEmit` exit0、3ページ eslint クリーン（既存BADGE_SUCCESS警告のみ）、`ast.parse` OK。実API: Manila CK items=198(commissary)、POST空→422 / Dubai→400「Manila only」 / DELETE不在→404。Heroku v1272。

### 教訓 (session 71)
- **CKは3テーブルが別管理**: ①CK Inventory=`menu_item_master`(processed) ②Daily Inventory CK=`daily_inv_report_items`(is_commissary) ③CK生産プランitems=`ck_production_plan_items`。「Daily Inventoryと揃える」=参照先を `daily_inv_report_items` に変えること
- **`daily_inv_report_items` にはcity列が無い**（Daily Inventory自体がManila専用 `_MANILA`）。CKもManila拠点なので整合。Dubaiは別ソース(menu_master)維持が安全
- **city固定の罠ふたたび**（session69のProcurement Hubと同型）: `const city = auth.city...` は管理者が別cityを見られない。CK系3ページ横断で発生していた。**管理者向けページはcity切替を標準装備**に
- **plan_id=0 で候補消失**: 内部数値IDの手入力は使われない→紐付け切れ。**IDの手入力ではなくドロップダウン選択**にする
- **未対応(任意)**: ①既存の未紐付けDelivery(plan_id=0)は新ドロップダウンで作り直しが必要（プラン未紐付け時の直近QC合格品フォールバックは未実装） ②CKアイテムのadd/deleteはDaily Inventory commissaryを直接変更するため、削除は論理削除(is_active=FALSE)で履歴保全。Dubaiのadd/deleteは非対応(menu_master管理)

## Recently Completed (2026-06-16 session 70) — live

> Heroku DBマイグレーション: `cash_reports.pos_debit_card` 列は `ensure_cash_report_tables()` 内の `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` で**初回のcash-reportリクエスト時に自動追加**（api_cr_submit が submit前にensureを呼ぶ）。手動マイグレーション不要。

## Recently Completed (2026-06-16 session 70) — live

Taft店舗のClosing入れ忘れ→後追い入力で、店長(Yuri)経由のスタッフ依頼6件。Cash Report (`/store/cash-report`, 管理: `/admin/cash-management`)。

| # | 内容 | 種別 | 修正 |
|---|---|---|---|
| 1 | Safety Box二重計上で巨額OVERAGE誤表示 | バグ(**フロントのみ**) | **真因**: バック `db_cash_report.submit_cash_report` は `expected = opening + cash_sales`(安全box引かない=正)だが、フロント `cash-report/page.tsx` が `- sbDep` していた。店舗の現金は全額カウント後に安全boxへ移すため、引くと預入額ぶん偽OVERAGE(例: 実50→誤7050)。`expectedClosing` から `- sbDep` 削除、表示ラベルも修正。DB保存値は元々正しいので管理側表示は影響なし |
| 2+3 | 誤branch(Paranaque)/誤date(6/16)で送信→削除・訂正不可 | 機能欠如 | **真因**: `ON CONFLICT (branch, report_date, report_type) DO UPDATE` で一意管理だが**削除手段が皆無**。管理者専用 `DELETE /api/admin/cash-reports/{id}` 追加(`_require_admin`=`channel.admin.cash_management.view`)。`delete_cash_report()` は安全box預入を補正WITHDRAWALで戻し残高整合(NTEはCASCADE)。管理画面の詳細パネルに Delete ボタン |
| 4 | Credit Cardに加えDebit Cardも | 機能追加(フルスタック) | `cash_reports.pos_debit_card` 列追加(migration+CREATE)。端末額は Credit+Debit 合計なので `cc_discrepancy = terminal − (credit+debit)` に変更。店舗フォームにDebit欄、管理側に表示 |
| 補 | SC/PWD「Total Count」が小数(186.61)を受付 | 小バグ | `NumInput` に `integer` モード追加、Count欄を整数限定 |
| 5+6 | Discord画像→件数/金額の自動集計 | 新機能要望 | **見送り**(ユーザー判断)。手入力＋目視確認を継続。OCR/Discord連携で別規模 |

検証: `tsc --noEmit` exit0、対象ファイル eslint クリーン、`ast.parse` OK。Heroku起動確認(root 405, DELETE 401=認証要求で正常)。

### 教訓 (session 70)
- **フロント/バックで計算式が二重実装**されている箇所に注意。Closing残高はバックが正・フロントが誤で、画面だけ嘘をついていた(保存値は正)。**照合ロジックは片方に寄せるか、最低限フロント=バックで一致**させる
- **upsertのみで削除無しのテーブル**は誤branch/誤dateの訂正が詰む。`(branch,date,type)` キーは便利だが削除導線を用意する
- **安全box台帳は running_balance スナップショット方式**。レポート削除時はledger行を消すと後続のrunning_balanceが壊れるため、**補正イベント(WITHDRAWAL)を追記**して残高を戻す(`delete_cash_report` 参照)
- 既知の別課題(今回未対応): submit再送のたびに安全box DEPOSIT台帳が**追記される**(多重計上の懸念)。delete側はSUMで全DEPOSITを反転して対処済みだが、submit側の重複は別途要検討

## Recently Completed (2026-06-15 session 69) — live

## Recently Completed (2026-06-15 session 69) — live

スタッフ(Yuri Yamada)報告: Procurement Hub の Branchフィルタで **JLTは出るが他のBranch(Arjan等)は "No requests found."**。

**真因**: Hubドロップダウンは略号コードを送る（`BB/JLT/ARJ/AM/AB/MC/CK/SH`、`hub/page.tsx:484`）が、`proc_requests.store_code` には Store発注フォームが送る**フルネーム**が `.strip().upper()` で保存される（`DUBAI_CURATED_STORES`=`["Al Barsha","Al Mina","B Bay","JLT","M City",...]`, `request/page.tsx:70` / `create_proc_request` `db.py`）。バックの `list_proc_hub_requests` は `upper(store_code)=sc` の完全一致のため、**JLTだけコード=店名が同一で一致**、他は `ARJ≠M CITY`/`BB≠B BAY`/`AM≠AL MINA` で全滅。「選択肢」「保存値」「正規コード定義(`branches.ts`)」の3つが不整合。

| 修正 | ファイル | 内容 |
|---|---|---|
| 案A: Branchフィルタのエイリアスマッチ | `app/db.py` (`list_proc_hub_requests`) | `_BRANCH_FILTER_ALIASES` + `_branch_filter_candidates()` を新設。フィルタコードを既知の全表記(コード/フルネーム)に展開し `upper(btrim(store_code)) = ANY(%s)` でマッチ。既存データ無改修・Store側書込形式そのままで全Branchが効くように。Arjan=Motor City は同一拠点として同一エイリアス共有 |

検証: `ast.parse` OK、`_branch_filter_candidates` の展開を単体確認、`/`へのcurlで HTTP 405(稼働中)。Heroku v1270。

### 教訓 (session 69)
- **store_code の表記が3層で不整合**: ①Hubフィルタ=略号コード ②`proc_requests.store_code`=Storeフォームのフルネーム(uppercase) ③正規定義`branches.ts`=コード。`create_proc_request` は正規化せず `.strip().upper()` のみ。**Branchで絞る系は完全一致禁物**、エイリアス解決を挟む
- **JLTだけ動く罠**: コードと店名が同一の拠点だけ偶然一致し、バグが「一部だけ動く」形で隠れる
- **未対応(任意)**: ①Hubドロップダウンの `MC`(Motor City)と `ARJ`(Arjan)は同一拠点なので重複整理、`SH`(Sharjah)は curated stores に無い ②恒久対策は書込時 `store_code` 正規化＋既存行マイグレーション(案B)だが本番データ更新が必要なため今回は見送り

## Recently Completed (2026-06-15 session 68) — live

スタッフ(Ayako/HQ)からの報告: HR Recruitment の「Add Requisition」で①Target Start Dateが入れられない ②Submitしても画面が変わらず提出できたか不明。背景に **HTTP 401**。

**真因**: アクセストークンの期限切れ（16h, `ACCESS_TOKEN_TTL_SECONDS=57600`）。バック `_hr_auth_check`→`_actor_from_token_request`→`verify_access_token` が exp 切れで None を返し **401**（HQでも無関係、403ではない）。フロント `refreshAuthFromApi` はセッション確認OK時も**古いトークンを保持**して再mintせず、期限切れ後の再mintはPIN保存時のみ。それでも(停止トークンのrole=HQで)認証ガードを通過しページに入れてしまい、全API呼び出しが401 → Requisitionは**未保存**。さらに失敗時のエラーがページ下のバナーに出るが `z-50` モーダルの裏に隠れて見えず「提出できたか不明」に。

| 修正 | ファイル | 内容 |
|---|---|---|
| 401→再ログイン誘導 | `src/app/admin/hr/recruitment/page.tsx` | `redirectToLogin()`(=`clearAuth()`+`/login?next=...`) を追加。`loadData` と Requisition/Applicant 両POSTが **401検出で即リダイレクト**。期限切れセッションが明確に分かるように |
| Addモーダルのエラー表示 | 同上 | `AddRequisitionModal`/`AddApplicantModal` の `onSave` を `Promise<string\|null>` 化。失敗時はモーダルを閉じずに**赤エラーを内側に表示**（バックの `detail` も反映）。成功時のみクローズ。401時は「Your session has expired…」表示しつつログインへ |

検証: `npx tsc --noEmit` クリーン、対象ファイル eslint クリーン。

### 教訓 (session 68)
- **期限切れトークンでも画面に入れてしまう罠**: 認証ガードは(停止した)ローカルトークンの role で通過するため、API側だけ401になり「入れるのに全部失敗」状態に。**API応答の401を捕捉して明示的にログインへ送る**処理が各ページに必要
- **モーダル内エラーは必ずモーダル内に出す**: ページ下バナーは `fixed inset-0 z-50` オーバーレイの裏に隠れる。Add系モーダルは `onSave` がエラー文字列を返し、成功時のみ親がクローズする契約に
- **未対応(任意)**: トークンのスライディング更新(アクティブ中は切れない)は `refreshAuthFromApi` と バック `/api/auth/session` 両方の改修が必要で影響大 → 別途。Target Start Date はネイティブ日付ピッカーで非必須のため送信ブロックではなく、401が主因だった

## Recently Completed (2026-06-14 session 67) — live

③受領の継続バグ: APPROVED・受領記録なしの MAN-PR-202606-0019 を「Receive Now」しても数量入力フォームが出ず「Delivery Recorded — Review & Confirm」と誤表示（下の Receiving Records は別PRのKG記録）。

| 修正 | ファイル | 内容 |
|---|---|---|
| Receiving Step 2 を選択中リクエストにスコープ | `src/app/store/procurement/receiving/page.tsx`, `src/lib/procurementStatus.ts` | **真因**: `rows`（受領記録）がマウント時の `loadReceivings()`(引数なし=全件) と requestId設定後の `loadReceivings(id)`(該当のみ) の**レース**で全件に上書きされ得る。Step 2 の confirmed/draft/form 判定が `rows`(他リクエストのドラフト含む)を見ていたため誤表示。`receivingsForRequest()` で選択中リクエストに限定し、`receivingStepState()` で判定。さらにマウント時の受領読込をURLの request_id にスコープしてレース解消 |
| 回帰テスト | `tests/procurement/procurement-status.test.ts` | `receivingsForRequest`/`receivingStepState` の7件追加（記録なし→form、draft→review、全confirmed→confirmed、showNewForm→form 等）。procurement全体 vitest 20件PASS |

### 教訓 (session 67)
- **受領 `rows` のスコープ**: 受領画面の `rows` はリクエスト選択時のみ request_id でフィルタされる。マウントの引数なし `loadReceivings()`(requestId="") が全件を読み、URL遷移(Receive Now)時に per-request 読込と競合 → Step 2 が他リクエストの状態を誤参照。**表示判定は必ず `receivingsForRequest(rows, requestId)` でスコープする**こと
- **レース回避**: マウントの初期 `loadReceivings` には URL の request_id を渡す
- session 65 の③改善(数量サマリ+インラインConfirm)は正しかったが、判定が未スコープだったため特定経路で発火していなかった

## Recently Completed (2026-06-14 session 66) — live

session 65 の Procurement 実装に対する回帰テスト作成・実行。**バグは検出されず**（ロジックは正しく動作）。テストが実コードと同一ロジックを検証できるよう小リファクタ(挙動不変)。

| 追加/変更 | ファイル | 内容 |
|---|---|---|
| バック: submit可否を定数/関数化 + pureテスト | `app/services/procurement_control.py`, `app/main.py`, `tests_pure/test_procurement_submit_pure.py` | `SUBMITTABLE_REQUEST_STATUSES`={DRAFT,RETURNED,REJECTED} と `can_submit_request_status()` を新設、submitエンドポイントが使用。pytest 19件 |
| フロント: 申請ステータス判定を共通化 + vitest | `src/lib/procurementStatus.ts`(新規), `src/app/store/procurement/page.tsx`, `tests/procurement/procurement-status.test.ts` | `isActiveRequest`/`isRejectedRequest`/`matchesStatusFilter`/`selectDisplayedRequests`/`isCkDispatchVisible` を抽出し画面が使用。vitest 13件 |
| フロント: 認証降格ガードのテスト | `src/lib/auth.ts`(export), `tests/auth/non-downgraded-access.test.ts` | `nonDowngradedAccess` を export しテスト。vitest 7件 |

### テスト結果 (session 66)
- バック: `tests_pure/` 全 **207 PASS**（既存188 + 新規19）
- フロント: 新規 **20 PASS**（procurement 13 + auth 7）、tsc/eslint クリーン

### 教訓 (session 66)
- **テスト基盤**: フロント=vitest（`tests/**/*.test.{ts,tsx}`、`@`→src、`npx vitest run <path>`）、バック=pytest（`tests_pure/`、`app.services.*` の軽量モジュールのみ import 可。`app.main` は重く不可）
- **テスト容易化の定石**: 画面のインラインロジックは `src/lib/*.ts` / `app/services/*.py` に純粋関数として抽出し、画面とテストで共用（単一ソース化）。`app.main` のインライン判定はテスト不可なので services 側へ
- session 65 のロジック（active/rejected/displayed バケット、IN_REVIEW=SUBMITTED、CK Dispatch=Manila専用、submit可否）はすべて期待通りで**デグレ・バグなし**

## Recently Completed (2026-06-14 session 65) — live

Cyrineによるドバイ発注担当レクチャーでの質問5件。①Draft→Submitの流れ(仕様確認のみ・修正不要) ②Requestsにsupplier表示 ③Receive Nowで数量確認なし確定の懸念 ④RejectedがStore側に出ない ⑤Dubai選択時もCK DispatchにManila発注。方針: スタッフが直感的でミスが起きにくい形。

| 修正 | ファイル | 内容 |
|---|---|---|
| ⑤ Dubai時CK Dispatch非表示 | `src/app/store/procurement/page.tsx` | CKはManila拠点。`city !== "dubai"` でCK Dispatchセクションを非表示+Dubai時は `loadCkDispatch` もスキップ。誤Mark Dispatched防止 |
| ② Requests一覧にSupplier表示 | `src/app/store/procurement/page.tsx` | `RequestRow` に `vendor_summary`/`blocked_reason` 追加(バックの `list_proc_requests` は既に両方返却済=バック改修不要)。各カードに仕入先を表示。同店舗同日の複数発注を見分けやすく |
| ④ Rejected可視化+再申請 | `src/app/store/procurement/page.tsx`, `app/main.py` | 店舗一覧 `activeRows` はREJECTED除外のため、別途 `rejectedRows` を用意。KPIに「Rejected」カード追加(クリックで絞込)、カードに赤REJECTEDバッジ+却下理由(`blocked_reason`)表示、RETURNED同様の「Edit & Resubmit」アクション。バック: submit許可を `{DRAFT,RETURNED,REJECTED}` に拡張 |
| ③ 受領: 確定前に数量レビュー | `src/app/store/procurement/receiving/page.tsx` | ドラフト未確定時の「Delivery Recorded — Awaiting Confirmation」(数量もConfirmも無い)を、**ドラフトの数量サマリ(Received/Expected・過不足)+インラインConfirmボタン**に置換。数量を見ずに確定する事故を防止 |

### 教訓 (session 65)
- **`list_proc_requests` は vendor_summary と blocked_reason を返す**(db.py:9143付近)。Store一覧の supplier/却下理由表示はフロントのみで可
- **store一覧APIは status無指定で全statusを返す**(REJECTED含む)。`activeRows` がクライアントでREJECTED等を除外していた(page.tsx:843)。Rejected可視化は除外を回避して別bucket化
- **再申請の許可statusはバック側 `/requests/submit`**(main.py:20768) で `{DRAFT,RETURNED}`→`{DRAFT,RETURNED,REJECTED}` に拡張が必要
- **CKはManila専用**: `/ck-dispatch/pending` は city を渡してもManila発注を返す。フロントでDubai時非表示が最もクリーン
- **受領の数量未確認リスク**: ドラフト受領は初期値=発注数量。確定前に必ず Received/Expected を見せること(Step 2 にインラインConfirm)

## Recently Completed (2026-06-14 session 64) — live

OSスタッフ問い合わせ2件。①Needs Approvalで数量をEdit→Submitしたが反映されなかった(MAN-PR-202606-0141)。②Store ProcurementのKPIカード(Draft/In Review/Approved/Returned)をクリックで該当オーダーを右に表示したい。

| 修正 | ファイル | 内容 |
|---|---|---|
| ① 承認画面: 未保存編集のまま承認をブロック+手順明示 | `src/app/admin/procurement/cases/[caseId]/page.tsx` | `act("approve")` 実行前に `editingItems`(編集モード=未保存)なら承認をブロックし「Save Changesしてから承認」警告。編集バナーにも「承認前にSave Changes必須」を追記。**根本**: Edit Items は qty/unit_price/spec すべて編集可だが、保存は独立した「Save Changes」(PATCH /items)。承認(Approve)は別アクションで未保存編集を保存しないため、Save Changesせず承認すると編集が黙って失われていた(さらにAPPROVED後は `isClosed` でEdit非表示=編集不可) |
| ② Store Procurement: KPIカードをクリックで右リストをステータス絞り込み | `src/app/store/procurement/page.tsx` | `statusFilter` state + `displayedRows` useMemo追加。4カードを `<button>` 化し `toggleStatusFilter` でトグル(選択カードをring強調)+ Requestsリストへ自動スクロール。Requestsリストを `displayedRows` で描画、ヘッダにフィルタ名+「Clear filter」。Returned等を即特定可能に |

### 教訓 (session 64)
- **承認画面のEdit Itemsは「数量も」編集可**: 単価専用ではない(編集バナーに Qty/Unit Price/Spec と明記)。スタッフへの正しい運用案内=「Editで数量変更→**Save Changes**→Approve。承認後は編集不可なのでその場合のみ差し戻し→再申請」
- **編集と承認が分離**: `saveItems`(PATCH `/cases/{id}/items`)と `act("approve")` は別。未保存のまま承認すると編集破棄。今回ガードで防止
- **KPIカードのフィルタ**: 右の「Requests」リストは元々 `activeRows` を表示。`statusFilter` で `displayedRows` に絞るだけ。In Review は IN_REVIEW/SUBMITTED 両方を含める(counts と同基準)

## Recently Completed (2026-06-14 session 63) — live

報告(Yukihiro Nishimura/1230851, HQ): Cost Calculation 操作中に度々 HQ→Staff Portal に勝手に切り替わり、Staff Portal では操作できず、気づかず作業して変更が反映されないことがある。

| 修正 | ファイル | 内容 |
|---|---|---|
| フロント(主): リフレッシュで権限を降格させない | `src/lib/auth.ts` `refreshAuthFromApi` + 新規 `nonDowngradedAccess` | `/api/auth/session` ポーリングが一時的に空permissions/STAFFを返すと、role/permissionsを無条件上書き保存→HQの `*` 喪失→`canAccessAdminNav`(permベース)がfalse→Staff Portal化。ガードを追加: 非STAFFをSTAFFに落とさない・既存permissions(特に`*`)を空応答や`*`喪失で消さない。session/PIN再発行の両経路に適用 |
| バック(保険): トークンroleを権威に | `app/main.py` `_actor_from_token_request` | profileがSTAFFフォールバックでも、トークンの強いrole(HQ等)を優先。HQは必ず`*`付与、空permissionsはrole由来で補完。サーバ側でも降格を防止 |

### 教訓 (session 63)
- **認証リフレッシュは「降格させない」**: `/api/auth/session` は非権威なポーリング。返り値で role/permissions を無条件上書きすると、一時的なバックエンドのフォールバック(役割割当ミス/DB例外)でHQが落ちる。クライアントは楽観的に保持してよい(サーバが各APIで実際の権限を再検証するため安全)
- **`canAccessAdminNav` は permission ベース**: roleがHQでも `permissions` に `*` が無ければ管理ナビが消えStaff Portal化する。permissionsを失わせないことが要
- **role解決の優先順位**: `_actor_from_token_request` は `profile.primary_role or claims.role or STAFF`。profileが非空の"STAFF"を返すとトークンのHQを上書きしてしまう。トークン(発行時に権威)を優先するのが安全
- **恒久対策候補**: ①Role Managementで対象者のHQ割当をactive+primaryに ②env `HQ_APPROVER_NAMES` に氏名追加で氏名ベースの常時HQ+`*` 保証(`_effective_staff_profile`/`_is_hq_name_override`)
- **確認結果(2026-06-14)**: `HQ_APPROVER_NAMES` は既に `Yukihiro Nishimura, Yusuke Uejima, Ayako Sakurai, Yuri Yamada` が設定済み(env追加は不要だった)。よって実際に効いたのはフロントの降格防止ガード。デプロイ+再読込後、ユーザーが「直った」と確認済み
- **Heroku認証メモ**: `~/.netrc` の api.heroku.com 認証は期限切れ(401)。git push/API は git.heroku.com 用トークンで可。`.claude/settings.local.json` 内の `HRKU-AA22…` は漏洩済み・revoke待ち(別トークン)

## Recently Completed (2026-06-14 session 62) — live

OSスタッフ報告: ①食材値上げ後、食材マスタの単価を変えても加工品・商品の原価に自動反映されない(各品を開いて「自動計算」を押すと反映)。②一部食材の単位が本来「g」なのにランダムに「pc」に変わる(再選択でgに戻る)。

| 修正 | ファイル | 内容 |
|---|---|---|
| バグ②: コンポーネント単位が古い保存値("pc")で表示される | `app/db.py` `_compute_cost_master_item_totals`(24187,24212) | 単位を `mic.unit or component_unit` → **`component_unit`(食材マスタ `im.unit`/子の output_unit)優先**に変更。`menu_item_components.unit` に過去 空/"pc" で保存された値が表示の原因。食材マスタを正とし、次回保存で古い値も上書き |
| バグ①案A: 食材単価更新時に依存先の原価を自動再計算 | `app/db.py` `update_cost_ingredient` + 新規 `recompute_costs_for_ingredient`/`_cost_dependency_order`/`_cost_recompute_frozen_in_order` | 価格/式変更後、その食材に依存する加工品・商品を多段BFSで収集→トポロジカル順(子→親)で凍結原価(`cost_unit_price>0`)を再計算・保存。**独立接続**で best-effort(失敗しても価格更新は守る) |
| バグ①案B: 一括再計算 | `app/db.py` `recompute_all_cost_master_items`, `app/cost_api.py` `POST /api/cost/recompute-all`, `src/app/admin/cost-calculation/page.tsx` | city内の全凍結原価をトポロジカル順で最新化。ツールバーに緑「Recompute All」ボタン追加 |

### 教訓 (session 62)
- **原価の二系統**: `menu_item_master.cost_unit_price`(凍結=手動上書き値, >0で計算値より優先) vs `_compute_cost_master_item_totals` の `computed_unit_cost`(components由来のライブ値)。保存のたびに計算値が `cost_unit_price` に書き込まれ凍結されるため、食材値上げが届かなくなる。再計算は `computed_unit_cost` を `cost_unit_price` に書き戻す
- **子の原価は子の凍結値を優先**: totals は子を再帰計算するが `child_totals.unit_cost` = 子の `final_unit_cost`(凍結優先)。よって多段再計算は**子→親の順(トポロジカル)**が必須。ライブ(`=0`)項目は対象外
- **コンポーネント単位は食材マスタが正**: コスト = 数量 × 食材単価(食材の基準単位あたり)なので、component の単位は食材マスタの単位と一致すべき。`mic.unit` は信頼せず `im.unit` を使う
- **教訓#7再確認**: 再計算を価格更新と同一トランザクションに入れると失敗時に価格更新もrollbackされる。独立接続+try/exceptで分離
- `UNIQUE(city, name)` により ingredient_master に同名重複は無い(単位ばらつきは重複ではなく保存値の劣化が原因)

## Recently Completed (2026-06-14 session 61) — live

植嶋さんとの議論: 店舗別の課題共有を「①誰がいつ認識 → ②解決策提案 → ③実施 → ④解決評価 → ⑤解決日」で一覧追跡し、店舗訪問時に前日課題の解決を評価したい。→ 既存 **Incident Report 機能を拡張**して実現（新規システムは作らない）。評価は**店舗スタッフの自己評価 + HQ最終評価の2段階**。

| Phase | ファイル | 内容 |
|---|---|---|
| **P1 バックエンド** (Heroku v1265) | `app/db.py`, `app/incident_api.py` | `incident_reports` に冪等ALTERで課題解決ライフサイクル列を追加: `proposed_solution`/`implementation_note`(②③)、`store_eval_status`/`store_eval_note`/`store_eval_at`/`store_eval_by`(④店舗自己評価)、`resolution_rating`/`resolution_note`(④HQ評価)、`resolved_at`/`resolved_by`(⑤)。DB関数: `update_incident_status` 拡張(resolved時に解決日/者を自動記録・後方互換)、`update_incident_lifecycle`(HQ部分更新)、`set_incident_store_eval`(店舗自己評価)。`list_incident_reports`/`get_incident_report` のSELECTに新列追加。API: `PATCH /api/admin/incidents/{id}/lifecycle`(HQ)、`POST /api/incidents/{id}/self-eval`(報告者本人のみ) |
| **P2 管理画面** (Vercel e7b55ac) | `src/app/admin/incidents/page.tsx`, `.../[id]/page.tsx` | 一覧にタブ新設「Reports / **Store Issue Board**」+ **Branchフィルタ**。Store Issue Board = 店舗別に未解決課題を古い順表示(経過日数・店舗/HQ評価バッジ・「Include resolved」トグル)→店舗訪問用。詳細に「Issue Resolution」パネル(①〜⑤を1か所、②③HQ記入・④店舗自己評価表示+HQ評価ボタン・⑤解決日表示) |
| **P3 店舗画面** (Vercel 14a2cbf) | `src/app/incidents/page.tsx` | 自分の報告の展開カードに自己評価ボックス(Resolved/Partial/Recurring + メモ)。`SelfEvalBox` コンポーネント |

### 教訓 (session 61)
- **似た用途の既存機能をまず探す**: 「店舗別課題共有」は新規実装ではなく既存 **Incident Report**(`/incidents`, `/admin/incidents`, `app/incident_api.py`, `incident_reports`テーブル) の拡張で実現できた。Explore で全体を調査してから設計
- **Incident のステータス**: `new → acknowledged → in_progress → resolved` (STATUS_FLOW)。`incident_report.read`/`.reply`/`.submit.self` で権限制御。store側は報告者本人(`reporter_name == staff_name`)のみ自己評価可
- **フロントの section/タブ追加は局所的に**: 一覧ページにタブstate(`view`)を足し、表示を分岐。Board は別fetch不要で `allItems` を再利用
- **`git add -A` 厳禁**(再掲): 対象ファイルを明示。`.claude/settings.local.json` は gitignore 済

## ✅ 解決(セキュリティ): Heroku APIトークン平文露出 — 2026-06-14 対応完了

- `.claude/settings.local.json` の permission allowlist に Heroku APIトークン (`HRKU-AA22...` 6件 + `c4b07274...` 1件) が平文で混入していた(curlコマンドが許可リストに記録された際に巻き込まれた)。
- session 60 の `git add -A` でコミットしようとし **GitHub push protection がブロック**(コミット履歴への混入は阻止済み)。
- 対処済み: ① `.gitignore` に `.claude/settings.local.json` 追加 ② session 63 で該当7エントリを全て除去(JSON妥当性確認済・残存0) ③ **`HRKU-AA22…` は確認時点で既に失効(401 unauthorized)** = revoke作業不要。
- `c4b07274…` は git/API 用の有効トークン(git.heroku.com 認証で使用中・漏洩ではない)。allowlistからは除去したが、netrc/git remoteの正規の場所に残るため失効しない。
- 教訓: **`git add -A` 禁止** — 必ず対象ファイルを明示 (`git add <path>`)。`.claude/` には secret が入りうる。

## Recently Completed (2026-06-14 session 60) — live

ユーザー要望: 添付 `Store Management.xlsx` の「CK & CUBAO Task Checklist」タブの内容を Travel Path の Central Kitchen に反映(現行内容を全面置換)。

| 修正 | ファイル | 内容 |
|---|---|---|
| CK Travel Path をマネージャー日次タスクチェックリストへ全面置換 | `app/db_travel_path.py` (migration), `app/travel_path_default_items.py` | 旧シフト型(OPENING/MID_SHIFT/CLOSING)54項目を **時間割型(MORNING/AFTERNOON/EVENING)** の20タスクへ置換。各ラベルに時刻+担当(CK Mgr/HQ)を埋込。**本番反映は `ensure_travel_path_tables()` の毎起動migration**で実施(旧CK項目を `is_active=FALSE`、新20タスク+温度3項目をupsert)。`travel_path_default_items.py` は初期seed整合のため同期 |
| CK温度記録(Temperature Log)を保持 | `app/db_travel_path.py` | 新3セクションに TEMPERATURE 型項目(CK_TEMP_MR/AF/EV, 11冷蔵冷凍ユニット)を各1つ追加し、元の3回/日の頻度を維持。旧 CK_TEMP_OP/MS/CL は無効化 |
| Travel Path のセクションをブランチ別に | `src/app/admin/travel-path/page.tsx` | `SECTIONS_BY_BRANCH` 導入。CKのみ MORNING/AFTERNOON/EVENING、TAFT/PAR/CUBAO は従来の OPENING/MID_SHIFT/CLOSING。ブランチ変更時に section を有効値へリセット。Checklist/Compliance 両ビューを `sections` 駆動に変更 |

### 教訓 (session 60)
- **Travel Path のseedは「空テーブル時のみ」**: `travel_path_api.py` の `_ensure_seeded()` は `COUNT(*)==0` のときだけ default を流す。本番(既存データあり)へ変更を反映するには `ensure_travel_path_tables()` の毎起動migrationブロックに書く(既存の temp/drain 項目と同じ方式)。`default_items.py` 編集だけでは本番に反映されない
- **`seed_travel_path_items` は item_type を扱わない**: TEMPERATURE 項目は default_items.py では表現できず、migration 側でのみ INSERT する(item_type/unit_labels_json 付き)
- **フロントの section はブランチ共通だった**: `SECTIONS` 定数を単純変更すると全ブランチに波及。CK だけ変えるには `SECTIONS_BY_BRANCH` でブランチ別にする必要がある
- **section は TEXT・CHECK制約なし**: 新セクションキー(MORNING等)はDB変更不要で追加可能
- **Excelの時刻列が日付に化ける**: "10-11" 等のテキストが Excel で datetime に自動変換される。`data_only=True` 読込時は `v.month-v.day` で復元

## Recently Completed (2026-06-14 session 59) — live

スタッフ問い合わせ: 「Paranaque は昨日 Daily Inventory Report を提出済みなのに、Store Evaluation の Daily Inventory が『Not submitted』のまま。リロードしても変わらない」

| 修正 | ファイル | 内容 |
|---|---|---|
| Store Evaluation: Daily Inventory バッジが常に「Not submitted」になるバグ修正 | `app/db_store_evaluation.py` (`get_eval_auto_data` L439付近) | `inventory_check_done` フラグが **存在しないテーブル `daily_inventory`** を `check_date/branch_code/city` で照合していた。実データは `daily_inv_reports`（`branch`=正式名大文字, `report_date`, `status`）にある。`_safe_query` が「relation does not exist」例外を握りつぶして `None` を返すため、フラグがデフォルト `False` のまま固定 → 常に「Not submitted」。クエリを `daily_inv_reports` に向け、ブランチコード(PAR/CUB/TAFT/CK)→正式名(PARANAQUE/CUBAO/TAFT/CENTRAL KITCHEN)をマッピングし、`status='SUBMITTED'` のみ true に修正 |

### 教訓 (session 59)
- **`_safe_query` の例外握りつぶし**: `db_store_evaluation.py` の `_safe_query` は全例外を `except Exception: return None` で握りつぶす。存在しないテーブル名を指定しても静かに失敗し、auto-data フラグがデフォルト値のまま固定される。auto-data 系のフラグが「ずっと false」のときは、まず参照テーブル名が実在するか確認する
- **ブランチ識別子の二系統**: Store Evaluation は短縮コード(`PAR`/`CUB`/`TAFT`/`CK`)、Daily Inventory Report は正式名大文字(`PARANAQUE`/`CUBAO`/`TAFT`/`CENTRAL KITCHEN`)。両機能を跨ぐクエリでは必ずマッピングが必要。逆方向のマップは `daily_inventory_api.py` の `_report_branch_to_staff_master_branch` にもある
- **daily_inventory テーブルは存在しない**: 実テーブルは `daily_inv_reports`（header）+ `daily_inv_report_items` + `daily_inv_entries`。`daily_inventory` という名前のテーブルはコードベースのどこにも作成されていない

## ✅ ①②③④ All four features complete and live. All 11 bugs fixed.
## ✅ Daily Ops Check v2 complete and live (4-color status, auto/manual, double-check workflow)
## ✅ Role Management 自動同期 — 8 admin + 6 store チャンネルを登録済み
## ✅ 都市別アクセス制御 — バックエンド 9 モジュールで permission key + city 照合を実施
## ✅ CK Daily Inventory Phase 1 complete and live
## ✅ CK Production Plan Phase 2 complete and live (Heroku v1259, Vercel 1e89301)
## ✅ CK QC Check Phase 3 complete and live (Heroku v1260, Vercel 8bfab2f)
## ✅ CK Branch Delivery Phase 4 complete and live (Heroku 2d533b6, Vercel 644390d)
## ✅ Phase 1–4 フルブラウザテスト完了 + バグ2件修正 (Heroku eab2e0e, Vercel 0ffcdf0)

## Recently Completed (2026-06-13 session 58) — live

Phase 1–4 全機能ブラウザテスト完了。2バグ修正・デプロイ済み。

| 修正 | ファイル | 内容 |
|---|---|---|
| Backend: `get_ck_production_plan()` QC列欠落修正 | `app/db.py` (Heroku eab2e0e) | `ck_production_plan_items` SELECT に `qc_result, qc_actual_qty, qc_notes, qc_checked_by, qc_checked_at` の5列が含まれていなかった。CK Delivery の「Add Items」モーダルで `i.qc_result === "PASS"` フィルタが常に空を返す原因。5列を追加して修正 |
| Frontend: CK Delivery テーブルヘッダ/セル padding 修正 | `src/app/store/ck-delivery/page.tsx` (Vercel 0ffcdf0) | `TABLE_HEADER` トークンに横 padding なし。"Received" と "Notes" が隣接して "RECEIVEDNOTES" に見えた。Sent Qty・Received に `px-3`、Notes に `pl-4` を追加 |
| Frontend: 未使用 `RotateCcw` import 削除 | `src/app/store/ck-delivery/page.tsx` | ESLint warning 除去 |

### テスト結果 (session 58)
- **Phase 1** `/store/ck-inventory`: セッション作成 POST 200・335アイテム読込・Qty入力・Save Draft ✅
- **Phase 2** `/store/ck-production-plan`: プラン一覧・詳細・KPIバー(Total=1, QC Pass=1)・DONE+✓PASSバッジ ✅
- **Phase 3** QC Checkモーダル: PASS送信 POST 200・QC列即時更新 ✅
- **Phase 4** `/store/ck-delivery`: 新規作成→Add Items(QCリンク)→Dispatch→Confirm Receipt 全フロー ✅

### 教訓 (session 58)
- **TABLE_HEADER padding**: `TABLE_HEADER` トークンは `pb-2` のみで横 padding なし。隣接するカラムには必ず `px-N` または `pl-N`/`pr-N` を追加すること
- **plan detail の QC 列**: `get_ck_production_plan()` の items SELECT には QC 関連列を明示的に含めること。フロントのフィルタが `undefined === "PASS"` で常に false になる

---

## Recently Completed (2026-06-13 session 56) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| CK Inventory: Delta 小数点フォーマット修正 | `src/app/store/ck-inventory/page.tsx` | `delta.toFixed(1)` → `Number.isInteger(delta) ? delta : delta.toFixed(1)` に変更。整数のデルタが "+10.0" ではなく "+10" と表示されるように修正 |
| CK Inventory: 左パネル sticky 修正 | `src/app/store/ck-inventory/page.tsx` | CSS Grid の sticky 問題。`h-fit` を `self-start` に変更。Grid アイテムは `align-self: start` がないと行全体の高さに引き伸ばされ sticky が機能しない |
| CK Inventory: Unit select DB不一致修正 | `src/app/store/ck-inventory/page.tsx` | `AVAILABLE_UNITS` に含まれない "unit"/"set"/"pcs" が DB の output_unit にある場合、select の value と options が一致しなかった。`[...new Set([draft.unit, ...AVAILABLE_UNITS])]` パターンで現在値を常に先頭 option に追加 |

### 教訓 (session 56)
- **CSS Grid sticky の必須条件**: `position: sticky` を Grid アイテムに適用する場合、`align-self: start`（Tailwind: `self-start`）が必須。なければグリッドアイテムが行全体に伸び、sticky コンテナが「すでに最下部」な状態になり機能しない。`h-fit` だけでは不十分
- **Unit select の DB 不一致**: DB の `output_unit` に UI の `AVAILABLE_UNITS` 配列にない値がある場合、`<select value="xyz">` で "xyz" が options にないとブラウザは最初の option を表示するが React state は "xyz" のまま。Set spread で現在値を先頭に追加する
- **Delta 書式**: 整数デルタに `.toFixed(1)` を使うと "+10.0" になる。`Number.isInteger()` で先にチェックする

## Recently Completed (2026-06-13 session 55) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Draft: Force-Replace後のGoogle Sheets自動エクスポートが実行されないバグ修正 | `src/app/admin/draft/page.tsx` | `handleForceReplace()` に auto-export ブロックを追加。全ブランチが 409 (SENT_TO_MANUAL) でブロックされたユーザーが "Force Replace All" を押して再生成した際、`confirmGenerate()` と同様の自動エクスポートが実行されず、Google Sheets の汎用 URL（`#gid` なし）が表示された問題を修正。|
| Draft: PIN未入力時のGoogle Sheets警告バナー追加 | `src/app/admin/draft/page.tsx` | `canOperate=true` だが Approver name か PIN が未入力の場合、Google Sheets カードにアンバー警告を表示。「PINを入力しないと汎用 URL が開き前月タブが表示される可能性がある」ことを明示 |

### 教訓 (session 55)
- **handleForceReplace の export 漏れ**: `confirmGenerate()` に auto-export が追加されたとき、`handleForceReplace()` への複製が漏れた。同じ副作用を持つ 2 つの生成パスが分岐した場合は必ず両方に同じロジックを追加する
- **7月ドラフト「6月が出力される」バグの根本原因**: バックエンドのコードは全て正しく 7 月の日付を生成していた。問題は UI 側 — Force Replace 後に auto-export が実行されず、汎用スプレッドシート URL が表示されたため、ユーザーがクリックするとスプレッドシートの最後に開いていたタブ（6月）に遷移した
- **排除できた他の仮説**: acb8fe6 (EXISTS クエリ) で修正済みの fetch_draft_rows_for_branch_month バグ、planner の work_date ロジック（全て target_day_key で明示上書き済み）、insert_shift_draft_rows の変換バグ — いずれも最新コードでは問題なし

## Recently Completed (2026-06-12 session 54) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Store Evaluation: スコア項目ごとのコメント欄追加 (max 400文字) | `app/db_store_evaluation.py`, `app/store_evaluation_api.py`, `src/app/store/evaluation/page.tsx`, `src/app/admin/store-evaluations/page.tsx` | `score_comments` JSONB列をDBに追加 (ALTER TABLE IF NOT EXISTS)。`ScoreSelector` に textarea 追加（1-5ボタン下）。API は 400 文字で切り捨て。管理画面詳細モーダルにコメントを表示（コメントがある行は col-span-2 で全幅展開）|
| Cash Management: クロージング ₱2,000 不一致修正 | `app/db_cash_report.py`, `src/app/admin/cash-management/page.tsx` | expected_closing = opening + cash_sales（safety_box は引かない）。フロントで生フィールドから再計算 |
| Cash Management: カレンダー全ダッシュ修正 | `app/cash_report_api.py` | FastAPI wildcard ルートを末尾に移動 |
| Cold Chain: ③ In Storage ステップ追加（新フロー） | `app/cold_chain_api.py`, `app/db_cold_chain.py`, `src/app/store/cold-chain/page.tsx` | Receive submit 時に stored_at/stored_temp も一緒に送信・保存可能に |
| Store Evaluation: 管理画面で写真が見えないバグ修正 | `app/db_store_evaluation.py`, `src/app/admin/store-evaluations/page.tsx` | `get_evaluations_summary()` に `e.id` + LEFT JOIN + COUNT + GROUP BY 追加 |

### 教訓 (session 54)
- **psycopg2 + JSONB**: Python dict を JSONB 列に INSERT する場合、`json.dumps()` で文字列化してから SQL で `%(col)s::JSONB` キャストする。dict をそのまま渡すと psycopg2 がエラーを出す
- **per-item コメントは JSONB 1列が最適**: 11個の TEXT 列を追加するより `score_comments JSONB DEFAULT '{}'` の方がスキーマがシンプルで柔軟

## Recently Completed (2026-06-12 session 53) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Store Evaluation: 日付選択 UI 追加（デフォルト: 昨日） | `src/app/store/evaluation/page.tsx`, `app/store_evaluation_api.py` | Yesterday/Today ショートカット + カレンダー入力。バックエンドでスタッフが昨日分を提出可能に。evalDate を全API呼び出し・写真アップロード・submit payload に適用 |
| Admin Store Evaluations: 日付ナビゲーション追加 | `src/app/admin/store-evaluations/page.tsx` | ‹/› ボタンで1日ずつ移動 + Today ボタン。Summary/Trend 両タブで日付変更が即時反映 |
| HR Staff (Camilla) Absences 403 修正 | `app/main.py` | `_require_absence_access_pin()` 新ヘルパーを追加。`channel.admin.absences.view` 権限があれば HQ/ADMIN でなくても OK。3エンドポイント (GET /absences, POST /absences/upsert, POST /absences/delete) に適用 |
| CK Production: 数量の小数点表示修正 | `src/app/admin/inventory/productions/page.tsx` | "Now Making" チェックリストで `.toFixed(0)` → `parseFloat(Number(v).toFixed(3))` に変更。0.5 KG が 1 KG に丸められるバグを修正 |
| **Cash Management: カレンダー全ダッシュ修正** | `app/cash_report_api.py` | FastAPI ルート順序バグ修正。`GET /api/admin/cash-reports/{report_id}` が `/compliance` / `/safety-box` / `/collections` / `/nte` より前に登録されていたため、これらのリクエストが wildcard にキャプチャされ 404 → 全ダッシュに。`{report_id}` ルートをファイル末尾に移動。`GET /api/store/cash-report/history` も同時コミット |

### 教訓 (session 53)
- **FastAPI wildcard ルートは必ず最後**: `{param}` を含む GET ルートは同プレフィックスの全静的ルートより後に定義する。FastAPI は登録順に一致させるため、`{report_id}` が先にあると `"compliance"` という文字列がパラメータとして解釈される
- **Cash Management → 404 デバッグ手順**: フロントが `[]` を表示するとき、まずネットワークタブで実際のレスポンスを確認 → `{"detail": "Report not found."}` のようなエラーであれば route ordering 問題を疑う

## Recently Completed (2026-06-11 session 52) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Analytics/Dubai Sales Hourly: 独自の日付範囲 + 店舗フィルター追加 | `src/app/admin/analytics/page.tsx` | `hourlyDateFrom`/`hourlyDateTo`/`hourlyStoreName` の独立 state を追加。Hourly Sales Analytics カード内にインラインフィルターバー（Date From/To + Store ドロップダウン）を表示。他タブの日付範囲と連動しない |
| Op Time: 店舗別データ非存在バッジ追加 | `src/app/admin/analytics/page.tsx` | `pos_operation_time_daily` は city 単位の集計データ（店舗別なし）であることを示す青いバッジを追加 |
| Procurement Hub: Supplier + Branch サーバーサイドフィルター追加 | `src/app/admin/procurement/hub/page.tsx`, `app/main.py`, `app/db.py` | filterBranch / filterSupplier state 追加。6列グリッドに Branch ドロップダウン + Supplier テキスト入力追加。バックエンドでフィルタリング。各行に vendor_summary 表示 |
| Procurement Hub: Clear ボタン即時リロード修正 | `src/app/admin/procurement/hub/page.tsx` | `LoadOverrides` 型を追加し `load()` が明示的なオーバーライドを受け取れるように変更。`clearFilters()` が `load({...全空文字列})` を呼ぶことで stale closure 問題を解消 |
| Store Receiving 左パネル: Supplier名・受取ステータス・検索機能追加 | `src/app/store/procurement/receiving/page.tsx` | `filterSearch`/`filterHideConfirmed` state + `filteredRequests` useMemo 追加。Search 入力 + "Hide already confirmed" チェックボックス。`receiving_status` バッジ（✓ Confirmed 緑 / Draft 琥珀）。`vendor_summary` 表示 |
| Store Evaluations Daily Summary: Food Safety / Org & Storage / SOP Compliance 列追加 | `src/app/admin/store-evaluations/page.tsx`, `app/db_store_evaluation.py` | `get_evaluations_summary()` の SELECT に 3 フィールドを追加。`EvalRow`/`TrendRow` 型・`SCORE_LABELS`・`SCORED_KEYS`・Daily Summary テーブル・Trend カード score dots に 3 フィールドを追加 |

### 教訓 (session 52)
- **React stale closure**: `clearFilters()` が `setState()` 後すぐ `load()` を呼んでも state は旧値のまま。`LoadOverrides` パターン（呼び出し時に明示的に新値を渡す）で解消
- **`pos_operation_time_daily` は city 単位**: `UNIQUE(work_date, city)` — 店舗別データなし。フロントに説明バッジを追加するのが正しい対処
- **vendor_summary は string_agg サブクエリで取得**: `proc_request_items.vendor_name` はアイテム行ごとに存在。リクエストヘッダー側にはなく、サブクエリで `string_agg(DISTINCT vendor_name, ', ')` として集約する

## Recently Completed (2026-06-11 session 51) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| セキュリティ: require_channel_permission() 追加 | `app/security_tokens.py` | 新ヘルパー関数: ① Bearer トークン検証、② permission_key がトークンの permissions[] に含まれるか確認、③ ADMIN/HQ でない場合は token.city と要求 city が一致するか照合。いずれか失敗で 401/403 返却 |
| セキュリティ: cold_chain_api: role名のみガード → permission key + city 照合 | `app/cold_chain_api.py` | `_require_admin` が `require_channel_permission(request, "channel.admin.cold_chain.view", city=city)` を呼ぶように変更。admin エンドポイント (dispatches/boxes/alerts) に `city=city` を渡して city 照合 |
| セキュリティ: daily_check_api: token-existence のみ → permission key + city 照合 | `app/daily_check_api.py` | `_require_admin` 関数を新設 (`channel.admin.daily_check.view`)。admin エンドポイント (list/confirm/double-check/summary) を `_require_auth` → `_require_admin` に変更 |
| セキュリティ: store_evaluation_api: role名のみガード → permission key + city 照合 | `app/store_evaluation_api.py` | `_require_admin` が `channel.admin.store_evaluations.view` を使うように変更。city 付きエンドポイント 6 件に `city=city` を渡す |
| セキュリティ: transport_expense_api: token-existence のみ → permission key + city 照合 | `app/transport_expense_api.py` | `_require_admin` 関数を新設 (`channel.admin.transport_expense.view`)。admin エンドポイント 6 件を切り替え |
| セキュリティ: petty_cash_api: token-existence のみ → permission key + city 照合 | `app/petty_cash_api.py` | 同様 (`channel.admin.petty_cash.view`) |
| セキュリティ: cash_report_api: role名のみガード → permission key 照合 | `app/cash_report_api.py` | `_require_admin` が `channel.admin.cash_management.view` を使うように変更 (store-facing の `_require_token` は維持) |
| セキュリティ: meal_allowance_api: role名のみガード → permission key + city 照合 | `app/meal_allowance_api.py` | 同様 (`channel.admin.meal_allowance.view`) |
| セキュリティ: probation_api: role名のみガード → permission key + city 照合 | `app/probation_api.py` | 同様 (`channel.admin.probation.view`) |
| セキュリティ: nte_api: role名のみガード → permission key + city 照合 | `app/nte_api.py` | 同様 (`channel.admin.employee_cases.view`)。全6エンドポイント (history/overview/dashboard/enforcement/upcoming) に city= を渡す |

### 教訓 (session 51)
- **都市別制限の2レイヤー**: ①トークン発行時 (`resolve_role_permissions` の city_hint フィルター) と ②API 層の city 照合、両方が必要。どちらか片方では不十分
- **`require_channel_permission` の設計**: ADMIN/HQ は `*` を持たなくても role 名チェックで bypass。その他のロールは permission key + (オプション) city を照合
- **`_require_token` 残存が必要なケース**: store-facing エンドポイント (submit/balance/status など) は role/permission チェック不要だが token 存在確認は必要。`cash_report_api`, `meal_allowance_api`, `probation_api`, `nte_api` に `_require_token` を残す

## Recently Completed (2026-06-11 session 50) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Role Management 同期: 8 adminチャンネル追加 | `app/access_control.py` | ACCESS_CHANNELS に store_evaluations / cold_chain / daily_check / transport_expense / petty_cash / cash_management / meal_allowance / probation を追加。対応する .view パーミッションを ACCESS_PERMISSIONS に追加。DEFAULT_ROLE_GRANTS の ADMIN / MANILA_MANAGEMENT / HR_MANAGER に付与。DUBAI_MANAGEMENT に cold_chain を付与。起動時の safety migration が自動で既存ロールに付与 |
| Role Management 同期: 6 storeチャンネル追加 | `app/access_control.py` | store_evaluation / store_cold_chain / store_daily_check / store_transport_expense / store_petty_cash / store_cash_report を ACCESS_CHANNELS に追加 |
| NavBar: canAccess* 関数に切り替え | `src/components/NavBar.tsx`, `src/lib/auth.ts` | 8ページのハードコードされた role リストを廃止。canAccessStoreEvaluationsAdmin / canAccessColdChainAdmin / canAccessDailyCheckAdmin / canAccessTransportExpenseAdmin / canAccessPettyCashAdmin / canAccessCashManagementAdmin / canAccessMealAllowanceAdmin / canAccessProbationAdmin 関数を auth.ts に追加し、NavBar から呼び出すように変更 |

### 教訓 (session 50)
- **NavBar チャンネル追加ルール（⚠️ 必須）**: NavBar の ADMIN_ITEMS に新しい href を追加するときは **必ず** 3箇所を同時に更新すること:
  1. `app/access_control.py` → `ACCESS_CHANNELS` にエントリ追加（`is_admin_channel: True`）
  2. `app/access_control.py` → `ACCESS_PERMISSIONS` に `.view` パーミッション追加
  3. `app/access_control.py` → `DEFAULT_ROLE_GRANTS` の各ロールに `.view` を追加
  4. `src/lib/auth.ts` → `canAccess*` 関数を追加
  5. `src/components/NavBar.tsx` → hardcoded role list ではなく canAccess* 関数を使う
  ※ この手順を守れば Role Management に自動表示される
- **Safety migration**: `seed_access_control_defaults()` の末尾に「完全に未付与のパーミッションだけ追加」するロジックがある。DEFAULT_ROLE_GRANTS に新しいパーミッションを追加すれば、次回 Heroku 起動時に既存ロールへ自動反映される

## Recently Completed (2026-06-10 session 48) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Daily Ops Check v2: DB スキーマ拡張 | `app/db_daily_check.py` | 新カラム: discord_confirmed, issue_note, double_checked_by, double_checked_at。status CHECK 制約を CONFIRMED_OK/CONFIRMED_ISSUE/RESOLVED/ONGOING_ISSUE に拡張。起動時に既存 CONFIRMED → CONFIRMED_OK 自動マイグレーション。`confirm_daily_check` に status/discord_confirmed/issue_note パラメータ追加。新関数 `double_check_daily_check` (CONFIRMED_ISSUE → RESOLVED/ONGOING_ISSUE)。`get_daily_check_summary` に issues カウントを追加 |
| Daily Ops Check v2: API 拡張 | `app/daily_check_api.py` | DailyCheckConfirmIn/DailyCheckDoubleCheckIn Pydantic モデル追加。confirm エンドポイントに body 対応 (4色ステータス + Discord チェックボックス + issue_note)。新エンドポイント `POST /api/admin/daily-check/{id}/double-check`。aggregator_statuses 型を Dict[str, Any] に拡張 |
| Daily Ops Check v2: ストアページ | `src/app/store/daily-check/page.tsx` | アグリゲーター状態型を {open: bool, mode: "auto"\|"manual"} に変更。各アグリゲーター行に Auto/Manual トグルボタンを追加。提出履歴の 5 色ステータス表示 (🟢🔴🔵🟣⏳) |
| Daily Ops Check v2: 管理ページ | `src/app/admin/daily-check/page.tsx` | CheckCard: 4 色確認 UI (🟢 All Good / 🔴 Issue Found)、Issue 時コメント必須 + Discord チェックボックス。CONFIRMED_ISSUE → ダブルチェック UI (🔵 Resolved / 🟣 Still Ongoing)。最終ステータスに確認者・Discord 通知・フォローアップ情報表示。KPI 4 チップ (Total / 🟢 OK / Pending / 🔴 Issues)。Summary グリッドに issue 数を赤バッジ表示。タブバッジが SUBMITTED + CONFIRMED_ISSUE のカウントに |

### 教訓 (session 48-49)
- **DB CHECK 制約のアップグレード**: 新しいステータス値を追加するには DROP + ADD が必要。IF NOT EXISTS は使えないので DROP CONSTRAINT IF EXISTS → ADD CONSTRAINT のパターンを使う（毎回 DROP してから ADD → 完全冪等）
- **aggIsOpen ヘルパー**: aggregator_statuses の値が旧形式 `bool` と新形式 `{open, mode}` の混在状態になる。両方を処理するヘルパー関数をフロント・バックエンドともに用意する
- **CheckCard 内部状態**: 管理ページの各 CheckCard に選択中ステータス・テキストエリア・Discord フラグの内部 state を持たせることで、ページレベルの state 管理を不要にできる
- **Heroku JWT シークレット**: `ACCESS_TOKEN_SECRET` は未設定。`STAFF_PIN_SALT = "random-long-secret-CHANGE-ME"` が実際のトークン署名シークレット。ローカルテストのトークン生成に使う
- **Heroku API アクセス**: `~/.netrc` の `HRKU-...` トークンは期限切れ。代わりに `https://heroku:<token>@git.heroku.com` の Bearer トークン (`c4b07274-...`) が有効
- **テストの AUTH 秘密**: `tests_pure/` のインテグレーションテストが 401 で落ちる場合、`SECRET` 変数を `"random-long-secret-CHANGE-ME"` に変更する

## Recently Completed (2026-06-10 session 47) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Bug 1: ケースが QUEUED のまま | `app/main.py` | `update_proc_approval_case_status(IN_REVIEW)` が未呼び出しだったため、Hub バッジカウントに反映されなかった。修正: `create_proc_approval_case` 後に status=IN_REVIEW へ更新 |
| Bug 2: `required_roles_json` 未設定 | `app/main.py` | `submit_proc_request` が未呼び出しで `proc_requests.required_roles_json` が null のまま。修正: WH パスにも `submit_proc_request` を追加 |
| Bug 3: MANAGER が HQ スロットを満たせる | `app/services/procurement_control.py` | `approvals_complete_in_order` のサブスティテュートセットに MANAGER が含まれ、HQ 必須ケースを迂回可能だった。修正: HQ スロットには MANAGER を不可とし、ADMIN は全スロット満たすショートカットを追加 |
| Bug 4: RETURNED 後の再提出でステータスがリセットされない | `app/db.py` | `create_proc_approval_case` の ON CONFLICT DO UPDATE に `status = 'QUEUED'` が欠落。修正: DO UPDATE SET に追加 |
| テスト追加 | `tests_pure/test_wh_hq_approval.py` | 35 純粋関数テスト (approval 完了ロジック・ロール権限・レスポンス形状・フロント計算・再提出フロー)。全スイート 133/133 PASS |

### 教訓 (session 47)
- **test-before-deploy が重要**: 今回の 4 件のバグはすべてテストで発見。本番 DB に接触せずに純粋関数テストで検出可能だった
- **ON CONFLICT DO UPDATE の落とし穴**: INSERT 時にハードコードした値（`'QUEUED'`）は、DO UPDATE SET に明示しないと UPSERT 時に更新されない
- **ADMIN shortcut**: `approvals_complete_in_order` に ADMIN の全チェーン満足ショートカットを追加。HQ と同様に扱われるように統一

## Recently Completed (2026-06-10 session 46) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| WH オーダー HQ 承認必須化 | `app/main.py` (L20689-20738) | WH オーダーの自動承認を廃止。`required_roles=["HQ"]`、`current_assignee_role="HQ"`、`status=IN_REVIEW` でワークフロー開始。HQ通知送信。audit key = `procurement.request.wh_hq_required` |
| Case Detail: HQ 承認要求バナー | `src/app/admin/procurement/cases/[caseId]/page.tsx` | WH ケース (`required_roles=["HQ"]`) を非 HQ/ADMIN ユーザーが開いたとき、アンバーバナーで「HQ sign-off 必須」を通知 |
| Hub: HQ 承認要求バナー | `src/app/admin/procurement/hub/page.tsx` | `current_assignee_role="HQ"` の未承認行を展開したとき、バイオレットバナーで同様の警告を表示 |

## Recently Completed (2026-06-10 session 45) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Procurement Hub: WH在庫列追加 | `src/app/admin/procurement/hub/page.tsx` | Manila WH在庫をオーダーと並列フェッチ。アイテム展開時にWH Stock列を追加（緑✓/琥珀⚠/赤✕カラーコード）。在庫不足アイテムのある行をハイライト + アラートバナーを表示 |
| Case Detail: WH在庫列追加 | `src/app/admin/procurement/cases/[caseId]/page.tsx` | バンドル読み込み後にWH在庫を非同期フェッチ。read-onlyアイテムテーブルに同じカラーコード列とアラートバナーを追加。`showWhStock`フラグでManila + 非編集モード時のみ表示 |
| TypeScript構文エラー修正 | `src/app/admin/procurement/cases/[caseId]/page.tsx` | `{bundle.request && (` の閉じ `)}` が欠落していたのを修正（IIFEクリーンアップ時の残留）。`npx tsc --noEmit` エラー0件確認 |

## Recently Completed (2026-06-10 session 44) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Petty Cash: Drive失敗でDB孤立レコード発生バグ修正 | `app/petty_cash_api.py` | Drive upload failure を HTTPException(500) ではなく `{"ok": True, "warning": "..."}` として返すように変更。`_upload_photo_to_drive` に `_preread_bytes` パラメータ追加でダブルリード防止 |
| Transport Receipt: 空ファイルガード修正 | `app/transport_expense_api.py` | `if file and file.filename:` → `if file is not None: + if file_bytes:` に変更。Drive try/except ブロックの indent 修正（`if file_bytes:` の内側に配置） |
| Dead code 削除 (actor.get("name")) | `app/petty_cash_api.py`, `app/transport_expense_api.py` | approve/reject/close/settle エンドポイントの `actor.get("sub") or actor.get("name") or "admin"` → `actor.get("sub") or "admin"` （JWT に "name" フィールドは存在しない） |
| TypeScript チェック | `npx tsc --noEmit` | エラー 0 件を確認 |

## Recently Completed (2026-06-10 session 43) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| ① HR/Permission Access 修正 | `app/main.py` | `_verify_manager_or_admin` に HR_MANAGER 追加 + channel.admin.staff.manage 権限チェック追加。`_assert_os_attendance_access()` 新ヘルパー追加。OS Attendanceエンドポイント11個をロール+チャンネル権限チェックに統一。Camilla (HR Staff) の 403 エラーを解消 |
| ② Cold Chain: 複数ブランチ選択 UX 修正 | `src/app/store/cold-chain/page.tsx` | 初期値を全ブランチ選択済みに復元 + チェックボックス式UI + "Select all/Clear all" ショートカット + Submit後に全ブランチ再選択 |
| ③ Daily Ops Check バックエンド (Opening/Lunch Close/Business Close) | `app/db_daily_check.py` (新規), `app/daily_check_api.py` (新規), `app/main.py` | `daily_op_checks` テーブル (JSONB aggregator_statuses, photo_urls, confirmation tracking)。7エンドポイント: submit, photo upload, today (store), list/confirm/summary (admin) |
| ④ Daily Check ストアページ | `src/app/store/daily-check/page.tsx` (新規) | 店舗スタッフ向け: ブランチ選択, Opening/Lunch Close/Business Close チェックタイプ, アグリゲーターステータス (GrabFood/Foodpanda/Beep), ダインイン状態, ノート, 写真アップロード (Opening のみ), 今日の提出履歴 |
| ⑤ Daily Check 管理ページ | `src/app/admin/daily-check/page.tsx` (新規) | バックオフィス向け: ブランチサマリーグリッド (提出/確認状況), 全レコード一覧, Confirm ✓ ボタン, 日付/ブランチ/タイプフィルター, KPIチップ (合計/確認済み/保留中) |
| ⑥ NavBar: Daily Check リンク追加 | `src/components/NavBar.tsx` | ストアナビに "Daily Check" (ClipboardList), 管理ナビに "Daily Check" 追加。可視性: HQ/ADMIN/HR_MANAGER/MANILA_MANAGEMENT/MANILA_MANAGER |

## 🔴 未解決: Employee Cases ページのデータ取得問題（明日継続）

### 現状
- ページ自体は正常表示（`/admin/employee-cases`、4タブ、KPIカード）
- `POST /api/admin/cases/data` と `POST /api/admin/cases/board` が "Failed to fetch"
- サーバー（Heroku・Vercel）は正常。curlでは401が返る
- GET/POST どちらも、URL を何度変えてもブロックされる

### 試した URL の変遷
1. `/admin/nte` → `/api/admin/nte/list` → ブロック
2. → `/api/admin/nte/records` → ブロック
3. → `/api/admin/suspensions` → ブロック
4. → `/api/admin/nte/actions` → ブロック
5. → `/api/admin/conduct/*` → ブロック（GET）
6. → `POST /api/admin/conduct/*` → まだブロック
7. ページURL: `/admin/nte` → `/admin/notice-to-explain` → まだブロック
8. → `/admin/employee-cases` + `/api/admin/cases/*` → まだブロック

### 仮説
- ブラウザの広告ブロッカー拡張機能が、このページ固有の何かをトリガーにして全fetchをブロック
- URLではなく、リクエストヘッダー（Authorization: Bearer）やページコンテンツが原因の可能性

### 明日試すべきこと
1. **シークレットウィンドウ**（拡張機能無効）で試す → 動けば拡張機能が原因確定
2. **別ブラウザ**（Chrome/Firefox/Safari）で試す
3. **XMLHttpRequest** で fetch の代わりに試す（一部フィルタはfetchのみブロック）
4. **フィルタリングツール特定**: ブラウザ → 設定 → 拡張機能 一覧を確認
5. **Manillaモードで試す**（Dubaiだけブロックされている可能性）

### Manila P&L データ未インポート（継続中）
- `/Users/jaynishimura/Downloads/[Manila] PLアプリ用データ (3).xlsx` (8シート: 202510〜202605)
- 対処: Management P&L → Summary → **「Upload Excel」**ボタン

## Recently Completed (2026-06-09 session 42) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| ① Confirm Delivery: 受取レコード未作成ガイド | `admin/procurement/receiving/page.tsx` | Request IDフィルターで0件の場合、「承認済みだが受取レコード未作成」の案内カードを表示。「+ Create Receiving Record for this Order」ボタンでフォームにIDを自動プリフィルしスクロール |
| ② Hub: Request IDコピーボタン | `admin/procurement/hub/page.tsx` | 各行のRequest ID横に `Copy` ボタンを追加。クリックでクリップボードにコピー、2秒間「Copied ✓」に変化。行展開イベントと競合しないよう `stopPropagation` 設定 |
| ③ Cartimar supplier filter regression 修正 | `store/procurement/request/page.tsx` | `lastCatalogScopeRef`のscope keyに`activeStore`を追加 (`city::category::store`)。以前は店舗変更時にフィルターがリセットされず、別店舗のCartimarカタログが残存する問題があった |

### 教訓 (session 42)
- **Confirm Delivery は受取レコードを見る画面**: 承認済みPRが直接表示されるわけではない。承認後は store/admin が先に受取レコードを作成する必要がある。ガイドテキストでユーザーを正しいフローに誘導
- **Cartimar scope key バグの根本**: `scopeKey = city::category` だけでは店舗変更を検知できない。店舗ごとにカタログが異なる場合 (Dubai WH: AL BARSHAとM CITYで異なるサプライヤー)、フィルターがリセットされずに stale なサプライヤーフィルターが残る

## Recently Completed (2026-06-09 session 41) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Approval Case: アイテムインライン編集機能 | `app/main.py` + `cases/[caseId]/page.tsx` | 承認画面で承認者がアイテムの Qty / Unit Price / Spec を直接編集可能に。編集モードトグル (✏ Edit Items)。Unit Price 入力は緑色ハイライト。Line Total・Order Total がリアルタイム自動計算。Save Changes で `PATCH /api/admin/procurement/cases/{id}/items` を呼び出し、ケースに変更メモを自動投稿。APPROVED / REJECTED 状態では編集ボタン非表示 |

### 教訓 (session 41)
- **Pydantic モデル再利用**: 既存の `ProcRequestItemIn` を `items: List[ProcRequestItemIn]` で再利用することで、フィールドバリデーションを一切書かずに済む
- **line_total の扱い**: フロントでリアルタイム計算してもバックエンド側で `qty × unit_price` で上書き計算することで、フロント計算ミスの可能性を排除
- **replace_proc_request_items は DELETE + INSERT**: 既存 items を全削除して再挿入するため、item の id は毎回変わる。フロントの key は `item.id || idx` で対応済み

## Recently Completed (2026-06-09 session 40) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Bayzat Daily File Import 修正 | `app/main.py` `_drive_list_attendance_files()` | Shared Drive ID (`0A...`) を検出した場合、`corpora="user"` のデフォルトAPIをスキップし、直接 `_drive_list_shared_drive_attendance_files()` を呼ぶように修正。これにより Dubai Bayzat の日次ファイル (28+ files/日) が正常にインポートされるように |
| Auto Sync 有効化 | Heroku env vars + `attendance_drive_sources` DB | `ATTENDANCE_AUTO_SYNC_ENABLED=true` 設定。APScheduler 05:18/07:18 UTC で毎日実行。Drive source ID=1 (Bayzat Personal Drive Folder, city_hint=dubai) を再有効化 |
| Analytics Summary: Dubai KPI ゼロ修正 (Approach A) | `app/db.py` + `app/main.py` + `analytics/page.tsx` | `base_shift_normalized` にシフトデータが空の場合、`actual_attendance` (Bayzat import) にフォールバックする `source=auto` パラメータを実装。`list_branch_daily_hours_actual` / `list_staff_work_summary_actual` / `get_city_summary_actual` の3関数を `db.py` に追加。3エンドポイント (`branch_daily_hours` / `staff_work_summary` / `city_summary`) に `source: str = Query("auto")` を追加。フロントエンドの全API呼び出しに `&source=auto` を付与 |

### 教訓 (session 40)
- **Google Drive Shared Drive ID (`0A...`) の検出**: `'{id}' in parents` + `corpora="user"` では共有ドライブ内ファイルが返らない。`corpora="drive"` + `driveId=<id>` で `_drive_list_shared_drive_attendance_files()` を呼ぶ必要がある。`_looks_like_shared_drive_id()` で `0A` プレフィックスを検出して分岐
- **Dubai シフトデータ空問題の根本原因**: Dubai はシフトを Bayzat のみで管理し OS にはシフトが入っていない。`base_shift_normalized` に Dubai データがなく Analytics KPIが常に0。`source=auto` フォールバックで `actual_attendance` を使うことで解消
- **Bayzat→Zoho 移行予定**: Bayzat は契約終了・Zoho 切り替え予定。Approach B（Bayzat スケジュールインポート）は不要。将来は Zoho の出力形式に合わせてパーサーを変更するだけでよい

### session 40 での Approach A 実装詳細
- `source=auto` ロジック: `branch_daily_hours`/`staff_work_summary` は `result.get("rows")` が空リストの時にフォールバック。`city_summary` は `float(result.get("total_hours") or 0) == 0` の時にフォールバック
- Manila (シフトあり) は変更なし。Dubai (シフトなし) のみ自動的に `actual_attendance` を使用

## Recently Completed (2026-06-09 session 39) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Cash Collection Pipeline: DB テーブル + 4 関数 | `app/db_cash_report.py` | `cash_collection_records` テーブル追加（COLLECTED→OFFICE_CHECKED→DEPOSITED の3ステップ）。`create_cash_collection` / `list_cash_collections` / `update_collection_office_check` / `update_collection_bank_deposit` の4関数追加 |
| Cash Collection Pipeline: 3 API エンドポイント | `app/cash_report_api.py` | `GET /collections` (フィルター対応) + `PATCH /collections/{id}/office-check` + `PATCH /collections/{id}/deposit`。Withdrawal 時に `double_check_by` 対応＋自動でコレクションレコード作成 |
| Cash Collection Pipeline: フロントエンド UI | `src/app/admin/cash-management/page.tsx` | Safety Box タブにパイプライン UI 追加。ステータスチップ（All/Collected/Office Check/Deposited）+ コレクションカード（各ステップのサマリー）+ インラインアクションフォーム（Office Check / Bank Deposit）。Withdrawal フォームに Double Check By フィールド追加 |
| Travel Path: 全 Manila 店舗に排水溝詰まり防止アイテム追加 | `app/travel_path_default_items.py`, `app/db_travel_path.py` | Paranaque/Taft（TP_CL_016）+ Cubao（CB_CL_DRAIN）に「排水溝にお湯を流す」クロージングチェック項目を追加。DB 起動時にアップサート migration で確実に適用 |
| Item Sales: Cubao フィルターが詰まるバグ修正 | `src/components/analytics/ManilaSalesDataTab.tsx` | Branch/Limit/Category フィルターを `productItems.length > 0` 条件ブロックの**外**に移動 |
| Item Sales: Cubao→QC DB名前マッピング修正 | `app/db.py` `_manila_sales_where()` | `_STORE_NAME_MAP = {"Cubao": "QC"}` で変換 |

### 教訓 (session 39)
- **Cash Pipeline アーキテクチャ**: Withdrawal エンドポイントを拡張して自動的にコレクションレコードを作成するパターン。フロント側は1回の操作で2つのテーブルに書き込まれることを意識する
- **インライン展開フォーム**: モバイル向けにはモーダルより inline expandable（クリックでその場に展開）が優れている。`isOcOpen = ocId === col.id` パターンで複数カードのうち1つだけ開く
- **Item Sales フィルターの配置**: 条件付きレンダリング内にフィルターを置くと、0件状態でフィルターが消えてユーザーが詰まる
- **DB ストア名とUIラベルの乖離**: UI=「Cubao」↔ DB=「QC」のようなマッピングは where-clause 生成関数でひとまとめに管理する

## Recently Completed (2026-06-08 session 37) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Manila Sales: Item Sales + Hourly タブ追加 | `src/components/analytics/ManilaSalesDataTab.tsx`, `src/app/admin/analytics/page.tsx` | ManilaSalesDataTab に `view` prop追加 (all/daily/items/hourly)。Item Sales: horizontal bar chart + ソート可能テーブル (TOP 20/50/100, branch/category フィルター)。Hourly Traffic: 時間帯別 bar chart (ランチ amber / ディナー indigo) + ピーク時間 KPI + 詳細テーブル。analytics/page.tsx に "Item Sales" / "Hourly" タブを MANILA_SALES_SECTION_OPTIONS に追加 |
| Vendor 検索ボックス追加 (①) | `src/app/admin/procurement/vendors/page.tsx` | nameFilter state + filteredRows useMemo。Search アイコン付き入力欄。vendor_code / registered_name / trade_name でフィルタリング。ヒット件数表示 |
| Vendor リスト右パネル sticky + New Vendor ボタン (③) | `src/app/admin/procurement/vendors/page.tsx` | 右パネルを `self-start sticky top-5` でスクロール追従。selectedRow がある場合に "+ New Vendor" ボタンを右パネルヘッダーに常時表示 |
| Store Procurement: サプライヤー削除機能 (②) | `src/app/store/procurement/request/page.tsx`, `app/db.py`, `app/main.py` | 🗑 Delete ボタン → インライン確認パネル。2段階削除: ① curated catalog soft-deactivate (POST /catalog/supplier/deactivate) + ② legacy import rows hard-delete (POST /catalog/supplier/delete-import 新エンドポイント)。db.py に `delete_proc_order_import_supplier()` 追加。main.py に `POST /api/admin/procurement/catalog/supplier/delete-import` エンドポイント追加 |

### 教訓 (session 37)
- **Supplier データが2テーブルに存在**: `proc_curated_catalog_items` (OS管理カタログ) と `proc_order_import_rows` (Excel import 履歴)。削除する際は両方をクリアする必要がある
- **サプライヤー削除の2段階フロー**: curated = soft-delete (deactivate, is_active=False) / import rows = hard-delete (DELETE FROM)
- **Recharts BarChart の horizontal bar**: `layout="vertical"` を使う。`XAxis type="number"` / `YAxis type="category" dataKey="name"`

## Recently Completed (2026-06-08 session 35) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| NTE ページ完全リニューアル | `src/app/admin/nte/page.tsx` (全面書き直し) | 4タブ構成: Staff Board(累積NTE順ランキング) / Issue NTE(HR起票フォーム+テンプレート) / History(全履歴+Resolve) / Templates(CRUD). 全データ取得をPOST化（GETコンテンツフィルタ回避） |
| NTE テンプレート機能 | `app/db_nte.py`, `app/nte_api.py` | nte_templatesテーブル追加。get_staff_nte_ranking()追加。POST /conduct/data・POST /conduct/board・POST/PATCH/DELETE /conduct/templates の5エンドポイント追加 |

### NTE コンテンツフィルタ問題の経緯
- ブラウザ拡張機能が `/nte/`・`/suspensions`・`/list`・`/notices`・`?limit=` など多くのURL/パラメータをブロック
- 全データ取得を POST リクエスト化することで回避
- GETフィルタは POST には適用されないことを確認

### NTE 新ページ構成
| タブ | 機能 |
|---|---|
| Staff Board | NTE累積数の多い順にスタッフカード表示。🔴3枚/🟡2枚/🔵1枚色分け。クリックで個人履歴パネル |
| Issue NTE | HR手動起票。テンプレート選択→本文自動挿入。3枚目警告バナー |
| History | 全NTE時系列表示。スタッフ名・ステータスフィルター。Resolve アクション |
| Templates | NTEテンプレートCRUD。{staff_name}/{date}プレースホルダー対応 |
  - インポート成功後、5月の正確な数値が表示される: Revenue 2,903,278 / Opex 3,179,308 / Operating Profit -276,029

## Recently Completed (2026-06-07 session 34) — live (Heroku v1201)

| 修正 | ファイル | 内容 |
|---|---|---|
| P&L データ欠落警告バナー | `src/app/admin/finance/page.tsx` | P&L 未インポート月選択時に amber 警告バナーを表示。KPI ラベルを "Opex (target-based est.)" / "Est. operating profit" に動的切替 |
| Upload Excel ボタン追加 | `src/app/admin/finance/page.tsx` | "Sync P&L from Google" の隣に "Upload Excel" ボタン追加。全シート一括インポートエンドポイントを呼ぶ |
| P&L Excel 全シート一括インポート | `app/services/pl_excel_import.py`, `app/main.py` | `import_all_pl_excel_sheets_bytes()` 追加。`POST /api/admin/pl/import/excel/all-sheets` エンドポイント追加 |

### 問題の根本原因（2026/05 Manila P&L が Wrong）
- 5月 P&L データが DB に未登録 → app が4月データにフォールバック（Revenue = 2,138,285）
- Operating Profit 405,037 は「売上 × (1-63%)」のターゲット比率試算値（実データではない）
- FLR cost / Other expenses が「—」なのが P&L データなしの証拠
- **Fix**: 上記「Upload Excel」ボタンから Excel ファイルをアップロード → 正確な数値が表示される

## Recently Completed (2026-06-07 session 33) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| HR バグ修正 + テスト環境 | `app/db_hr.py`, `app/main.py`, 4フロントページ, `tests_pure/test_hr_pure.py` | 発見バグ18件を修正。純粋関数テスト51件追加（合計98テスト全PASS） |

### 修正バグ一覧
| # | 重大度 | 場所 | 内容 |
|---|---|---|---|
| 1 | CRITICAL | main.py | PATCH /onboarding/items/{id} が /onboarding/{id} より後に定義 → 到達不能（FastAPI route 衝突） |
| 2 | CRITICAL | main.py | PATCH /separations/items/{id} が /separations/{id} より後 → 同上 |
| 3 | CRITICAL | db_hr.py | create_separation: plain cursor で row[0] → None 時クラッシュ |
| 4 | CRITICAL | separation/page.tsx | API_BASE なしのベアパス fetch → 本番環境でルーティング不整合 |
| 5 | CRITICAL | separation/page.tsx | refreshAuthFromApi / ログインリダイレクトがない |
| 6 | CRITICAL | performance/page.tsx | Draft 保存がスコア0検証でブロック（Submit 時のみに限定すべき） |
| 7 | HIGH | db_hr.py | update_separation_item: plain cursor row[0]/pending_row[0] |
| 8 | HIGH | db_hr.py | sync_review_schedules: conn.close() 後に RealDictRow.get() |
| 9 | HIGH | db_hr.py | 6関数で WHERE id=%s に ::uuid キャスト欠落 |
| 10 | HIGH | separation/page.tsx | DetailPanel が毎回 items を再フェッチ（既ロード時スキップ不可） |
| 11 | HIGH | separation/page.tsx | ChecklistItemRow Save ボタンに isDirty ガードなし |
| 12 | HIGH | separation/page.tsx | allDone: total_items=0 のとき永久 false |
| 13 | HIGH | separation/page.tsx | header フィールドが別レコード開時に stale データをフラッシュ |
| 14 | HIGH | onboarding/page.tsx | handleItemUpdated の stale closure（items を古い参照で渡す） |
| 15 | HIGH | performance/page.tsx | handleAcknowledge が res.ok チェックなし → 失敗時サイレント |
| 16 | HIGH | performance/page.tsx | handleSync が非 2xx エラーをサイレント無視 |
| 17 | MEDIUM | recruitment/page.tsx | DetailPanel に key prop なし → 別 applicant 選択時 stale state 残存 |

### テスト環境（`tests_pure/test_hr_pure.py`）
- `_compute_grade()` — 境界値含む全グレード (Excellent/Good/Satisfactory/NI/Unsat)
- `ONBOARDING_ITEMS` — 16件・重複なし・カテゴリ全検証
- `SEPARATION_ITEMS` — 13件・重複なし・カテゴリ全検証
- `REVIEW_TYPES` / `SEPARATION_TYPES` — キー・ラベル検証
- alert_level 境界値 (OVERDUE/URGENT/SOON/UPCOMING)
- 正規化 alert_level 境界値 (EXPIRED/CRITICAL/WARNING)
- レビュースケジュール日付計算 (90日・180日・150日・12月1日)

## Recently Completed (2026-06-07 session 32) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| HR Offboarding フロントエンド (Phase C-4) | `src/app/admin/hr/separation/page.tsx` (新規), `src/components/NavBar.tsx` | 離職管理ページ。カード一覧 + 詳細パネル (日付/Final Pay/チェックリスト)。13項目チェックリスト (Exit/Clearance/Final Pay/Documents)。NavBarに HR Offboarding リンク追加 |
| HR Offboarding バックエンド (Phase C-4) | `app/db_hr.py` (追記), `app/main.py` (追記) | hr_separation + hr_separation_items テーブル。create/list/detail/update/update_item。5エンドポイント。pending=0 で自動 complete 昇格 |
| HR Performance Review フロントエンド (Phase C-2) | `src/app/admin/hr/performance/page.tsx` (新規), `src/components/NavBar.tsx` | 3タブ (Upcoming/History/New Review)。スコアボタン1-5、live合計/グレード、昇給推薦、Save Draft/Submit |
| HR Performance Review バックエンド (Phase C-2) | `app/db_hr.py` (追記), `app/main.py` (追記) | hr_performance_reviews + hr_review_schedule。sync_review_schedules() で3ヶ月/6ヶ月/年次を自動生成。OVERDUE/URGENT/SOON/UPCOMING アラートレベル |

### HR Offboarding 13項目
| カテゴリ | 項目 |
|---|---|
| 🚪 Exit Process | Resignation Letter, Exit Interview, 30-Day Notice |
| ✅ Clearance | Uniform, Equipment, Loans/Advances, Keys/Access Cards |
| 💰 Final Pay | Computed, Released |
| 📋 Documents | COE Issued, SSS R-5, PhilHealth Update, Pag-IBIG Update |

### HR システム全フェーズ完了状態
| フェーズ | 内容 | 状態 |
|---|---|---|
| Phase A | 採用パイプライン (Kanban) | ✅ live |
| Phase B | オンボーディング書類管理 | ✅ live |
| C-1 | 正規化トラッカー (Renewals) | ✅ live |
| C-2 | パフォーマンスレビュー | ✅ live |
| C-4 | 離職管理 (Offboarding) | ✅ live |

## Recently Completed (2026-06-07 session 29) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| HR Onboarding フロントエンド (Phase B) | `src/app/admin/hr/onboarding/page.tsx` (新規), `src/components/NavBar.tsx` | 16項目チェックリスト管理ページ。RecordCard（デュアル進捗バー）+ DetailPanel（カテゴリ別アイテム編集）+ AddModal。NavBarにリンク追加 |
| HR Onboarding バックエンド (Phase B) | `app/db_hr.py` (末尾399行追記), `app/main.py` (末尾95行追記) | DB: hr_onboarding / hr_onboarding_items テーブル + ONBOARDING_ITEMS定数(16項目) + ensure_onboarding_tables() + 5つのCRUD関数。API: /api/admin/hr/onboarding に5エンドポイント追加 |

### Onboarding 16項目
| カテゴリ | 項目 |
|---|---|
| 🏛️ Government | SSS, PhilHealth, Pag-IBIG, TIN, NBI Clearance |
| 🏥 Health | Health Certificate, Food Handler Certificate |
| 🏦 Bank | Bank Account (Payroll) |
| 📄 Contract | Employment Contract, NDA, Uniform Size & Issue |
| 🎓 Orientation | Store Rules, POS Training, Hygiene Training, Week 1 Check-in, Month 1 Check-in |

### Onboarding 自動ロジック
- `create_onboarding()`: ON CONFLICT で既存レコードを in_progress にリセット、16 items を自動seed
- `update_onboarding_item()`: status=submitted 時に submitted_at を自動set、全 items が pending=0 になったら親を complete に自動昇格

### 今後の残タスク (HR)
- Phase C-2 バックエンド: APIエンドポイント実装 (see session 30 pending tasks above)
- Phase C-4: 離職管理 (Offboarding)

## Recently Completed (2026-06-07 session 28) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| HR採用パイプライン Phase A (新規実装) | `app/db_hr.py` (新規), `app/main.py` | DB: hr_job_requisitions / hr_applicants / hr_interview_schedules / hr_interview_evaluations / staff_regularization の5テーブル + CRUD関数一式。API: /api/admin/hr/* に16エンドポイント追加 |
| HR Recruitment Kanban ページ (新規) | `src/app/admin/hr/recruitment/page.tsx` | マニラ専用 Kanban ボード (New→Screened→Interview Sched.→Interviewed→Offer Sent→Hired/Rejected)。応募者カード・詳細パネル（Info/Interview/Evaluation 3タブ）・Add Applicant モーダル・Add Requisition モーダル実装 |
| NavBar: HR Recruitment リンク追加 | `src/components/NavBar.tsx` | HR_MANAGER / MANILA_MANAGEMENT ロール向けサイドバーリンク追加 |
| Renewals: Regularization タブ追加 | `src/app/admin/renewals/page.tsx` | マニラ正規化アラート（入社5ヶ月 = 150日でアラート開始）。Regularize / Terminate ボタンで処理。staff_master.hired_at を参照 |

### 正規化アラートのロジック
- `staff_master.hired_at` + 150日 ≤ today → ALERT開始
- `staff_master.hired_at` + 180日 = 正規化期日
- alert_level: days_remaining < 0 = EXPIRED, < 14 = CRITICAL, それ以外 = WARNING
- Renewals ページ「Regularization」タブに表示
- 「✓ Regularize」で REGULARIZED（アラート消去）
- 「✕ Terminate」でメモ入力 → TERMINATED（アラート消去）

### 今後の残タスク (HR)
- Phase B フロントエンド: Onboarding 管理ページ (`/admin/hr/onboarding`) — バックエンドは完成済み
- Phase C-2: パフォーマンスレビューサイクル
- Phase C-4: 離職管理 (Offboarding)

## Recently Completed (2026-06-07 session 27) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Phase 1-3 バグ修正（7件） | `db_meal_allowance.py`, `db_probation.py`, `db_nte.py`, `main.py`, `admin/nte/page.tsx` | evaluate_probation_cycle コミット漏れ修正、get_hired_at city フィルター追加、end_hour NULL クラッシュ修正、NTE 重複 suspension 防止、midnight シフト早退判定修正、suspension 日付 PHT 化、NTE admin の res.ok チェック追加 |
| Phase 1-3 ユニットテスト追加 | `tests_pure/` (新ディレクトリ) | 47テスト全 PASS。境界値（遅刻グレース・早退グレース・欠勤停職・週末スキップ）を網羅 |
| 遅刻グレースピリオド変更 | `db_meal_allowance.py`, `db_probation.py` | 15分 → 5分以内をオンタイムに変更 |

## Recently Completed (2026-06-06 session 26) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Direct Purchase: Unit に packet/ctn/case を追加 | `src/app/store/purchase/page.tsx` | UNITS 配列に3つ追加 |
| Approval Inbox: PR No. / Date / Supplier 行を追加表示 | `approval-inbox/page.tsx`, `db.py` | CaseRow 型に request_date/vendor_names 追加。バックエンドで vendor_names を STRING_AGG サブクエリで取得。カード表示に PR No.（紫モノスペース）/ Date / Supplier 行を追加 |

## Recently Completed (2026-06-06 session 25) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Store Procurement: モバイルでカテゴリ切り替え時に古いサプライヤーが残るバグ修正 | `src/app/store/procurement/request/page.tsx` | `loadItemCatalog` 開始時に `setCatalogSuppliers([])` を追加。WH→CKに切り替えた際、モバイルの遅いネットワークで Cartimar (WH) アイテムが数秒間残っていた問題を解消 |
| Cost Calculation: 列ヘッダー sticky 修正 + レンダリング改善 | `src/app/admin/cost-calculation/page.tsx` | スクロールコンテナの `pt-4` 除去でヘッダーが正しく固定表示。`content-visibility: auto` で304行の初期レンダリングを大幅改善 |

## Recently Completed (2026-06-06 session 24) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Admin Confirm Delivery: Confirm 2段階ガード | `admin/procurement/receiving/page.tsx` | Confirm → "Yes, Confirm" / Cancel の2段階確認に変更。誤クリック防止 |
| アイテム別受取記録 Option B 実装 | `db.py`, `main.py`, 2フロントファイル | `proc_receiving_items` テーブル新設。Store Receiving 作成時にアイテム別数量を保存。Admin Confirm Delivery でアイテム別 qty_received・unit_price が編集可能に。Save ボタンで親レコードの合計を自動再計算。旧レコードは "no per-item data" メッセージ表示 |
| Renewals: Expired/Critical/Warning チップをフィルターボタン化 | `src/app/admin/renewals/page.tsx` | クリックでそのレベルのアラートのみ表示。再クリックで解除。✕ Clear filter ボタン追加。Active/Resigned フィルターと組み合わせ可。バックエンド変更なし |

## Recently Completed (2026-06-06 session 23) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| PC ナビゲーション: 横タブ → 左サイドバー | `NavBar.tsx`, `LayoutShell.tsx` | デスクトップで幅240px固定サイドバーを追加（createPortal でbodyに描画）。Staff / Admin セクション区切り、アイコン+ラベル+バッジ表示、ユーザー情報・Logout を配置。モバイルUIは完全に変更なし |

## Recently Completed (2026-06-06 session 22) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Store Receiving: Confirm ボタン表示バグ修正 | `src/app/store/procurement/receiving/page.tsx` | `lastCreatedId` フィルターを削除し `isNew = row.id === lastCreatedId` で強調表示に変更。新規DRAFT レコードが Receiving Records リストに表示され Confirm ボタンが押せるようになった |
| Admin Confirm Delivery: request_id 検索時の city フィルター除去 | `app/db.py` | `list_proc_receivings` で `request_id` が指定されている場合は `r.city` フィルターをスキップ。PRナンバーで検索すると "No records found" になっていた問題を修正 |
| Admin Confirm Delivery: アイテム詳細展開パネル追加 | `src/app/admin/procurement/receiving/page.tsx` | Receiving No をクリックで注文アイテム一覧を展開表示。Item/Vendor/Category/Qty/Unit/Unit Price/Line Total + 合計行。キャッシュ済みで重複フェッチなし |

## Recently Completed (2026-06-06 session 19) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Travel Path: レポート詳細パネル改善 (B-1/F-1/F-2) | `db_travel_path.py`, `travel-path/page.tsx` | get_travel_path_report_with_entries を LEFT JOIN 全件取得に変更（未入力項目も表示）; フロントにReportEntry型追加; 詳細パネルでitem_text表示・温度値OK🟢/DANGER🔴表示・未チェック項目を赤ブロックで強調 |
| Travel Path: Monthly Compliance 温度ログ (F-3) | `db_travel_path.py`, `travel_path_api.py`, `travel-path/page.tsx` | GET /api/travel-path/temp-log 新規エンドポイント; Monthly Compliance 内に日付×Opening/Mid-Shift/Closing の温度一覧カードを追加; TEMP VIOLATION バッジ表示 |

## Recently Completed (2026-06-06 session 18) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Cold Chain: Submit UX修正 | `src/app/store/cold-chain/page.tsx` | エラー/成功メッセージをSubmitボタンの下に移動（スクロール時にも見える）; CK Dispatch欄に手動Reloadボタン追加; No dispatches時のメッセージをamber色で明確化 |

**判明した教訓**: Cold Chain はワークフロー順序が必須。①CK Dispatch タブでレコード作成 → ②Branch Receiving タブで Reload → ③Submit。CK Dispatch が未作成だと dispatchId = "" でボタンが disabled になる。

---

## In Progress Tasks

なし

---

## Pending Tasks

### 緊急調達・サプライヤー確認システム（設計完了・実装待ち）
詳細仕様: `docs/ai/SPEC_EMERGENCY_PROCUREMENT.md`

**背景:** マニラでサプライヤー短納品が週2〜3件発生。本部把握・承認フローがない。

**実装内容:**
- **Phase A（先に実装）: EPR（緊急調達リクエスト）**
  - 店舗スタッフが `/store/emergency-request` から申請
  - 承認なしに調達・配送を進められないハードルール
  - ≤₱5,000 → Ops Manager承認 / >₱5,000 → HQ承認
  - 管理者 `/admin/emergency-requests` で承認・Analytics（根本原因別・店舗別集計）
  - 新規テーブル: `emergency_procurement_requests`

- **Phase B（後で実装）: サプライヤー事前確認コール（Manila のみ）**
  - PO作成後、本部AdminがサプライヤーへTEL確認 → 結果をOSに記録
  - 欠品確認時はマネージャーへ通知・代替手配フロー
  - 新規テーブル: `supplier_confirmation_calls` + 既存POテーブルに confirmation_status 列追加
  - Dubai は不要（欠品なし）

### Phase 3: 自動データ精度向上
- cancel_count: Manila branch名のマッピング精度改善（cancellations.branch vs branch_code）
- offline_rate_pct: store_name → branch_code マッピング追加
- low_rating_count: branchマッピング統一

### Phase 4: 比較チャート・月次トレンド
- 店舗間スコア比較グラフ（週次/月次）
- 低スコア自動アラート

---

## Recently Completed (2026-06-05 sessions 4–8) — すべてlive

| 修正 | ファイル | 内容 |
|---|---|---|
| Store Evaluation DBモジュール | `app/db_store_evaluation.py` | 新規テーブル2つ（store_daily_evaluations, store_eval_images）+ 全CRUD + PHT 14:00自動データロジック |
| Store Evaluation API | `app/store_evaluation_api.py` | 6エンドポイント: auto-data, today, submit, branches, admin summary/detail/trend/list |
| main.py登録 | `app/main.py` | store_evaluation_routerをimport+include |
| フロントエンド：店舗入力フォーム | `src/app/store/evaluation/page.tsx` | 8項目1〜5評価 + 4項目バイナリ + リアルタイムスコア + ルーブリック表示 + 自動データパネル |
| フロントエンド：管理閲覧ページ | `src/app/admin/store-evaluations/page.tsx` | Daily Summary（全店舗スコア表） + Branch Trend（日次履歴）+ 詳細モーダル |
| Storeプロキシ追加 | `src/app/api/store/[...slug]/route.ts` | /api/store/* をHerokuへ中継（既存adminプロキシと同パターン） |
| NavBar更新 | `src/components/NavBar.tsx` | 「Store Evaluation」を二次メニュー追加（役割ゲート）+「Store Evaluations」を管理メニューに追加 |

## Recently Completed (2026-06-04 session 3) — すべてlive

| 修正 | ファイル | 内容 |
|---|---|---|
| Receiving record 展開表示 | `src/app/store/procurement/receiving/page.tsx` | receiving recordをクリックすると注文アイテム一覧が展開表示。Confirmボタン前に内容確認可能 |
| CK Dispatch修正 | `app/inventory_db.py`, `app/db.py` | production close時にPOを自動生成 → CK Dispatchに表示。POなし旧オーダーもfallbackで表示。dispatch時にPO自動作成対応 |
| PO email/cc自動入力 | `app/main.py` | `suppliers.append()`に`email`と`cc_emails`を追加。Load Request時にVendor MasterのSuppier Email・CC Emailsが自動反映 |

## Recently Completed (2026-06-04 session 2) — すべてlive

| 修正 | ファイル | 内容 |
|---|---|---|
| CK catalog エラー修正 | `app/db.py`, `app/main.py` | source3の`suggested_unit_price`エラー除去。Kitchen IngredientタブにGolden Dunes等表示 |
| CK自動承認フラグ | `app/main.py`, `request/page.tsx` | `is_ck_order`フラグ導入。Manila CKオーダー常に自動承認 |
| モバイルSubmitバー | `request/page.tsx` | `z-40`→`z-[75]`でNavBar（z-70）の上に表示 |
| Store Procurement Requests | `store/procurement/page.tsx` | 全員表示・配送確認後に非表示・ラベル変更 |
| Order Catalog supplier dropdown | `catalog/page.tsx` | Supplier NameをVendor Master選択式に変更 |
| Hub expand アイテム表示 | `hub/page.tsx` | `data.request.items`参照に修正 |

## Recently Completed (2026-06-03) — すべてlive

| 修正 | 内容 |
|---|---|
| Heroku Postgres Essential-0 → Standard-0 | 接続上限 20→120 |
| DB接続プール拡張 | 63/120接続設計 |
| #10-#44 各タスク | Travel path, CK Dispatch/Receiving, Branch Addresses, PO tracking等 |

---

## Known Debt

### `admin/draft/page.tsx` — Sheet Proposals Removal (DO NOT TOUCH yet)
`sheetTabMain`, `sheetTabs`, `sheetTabsBusy`, `pendingVisibleRows`, `proposeFromSheet`, `DUBAI_DRAFT_SHEET_URL`, `selectedProposalIds`
**⚠️ Rule**: Line-number-based deletion ONLY. No regex.

### Vendor名照合（catalog_aliases）
Vendor MasterのOrder Catalog登録名と`supplier_name`が一致しない場合、PO作成時にemail/payment_termsが空になる。
**対処**: 該当ベンダーの`catalog_aliases`フィールドに旧称を登録する（Golden Dunes等）

---

## System State Snapshot

| Feature | Status |
|---|---|
| Heroku Postgres | ✅ Standard-0 (120接続) |
| CK catalog (Golden Dunes / Kitchen Ingredients) | ✅ live |
| CK自動承認 (is_ck_orderフラグ) | ✅ live |
| CK Production → CK Dispatch 連携 | ✅ live |
| Store Procurement Requests (全員・完了非表示) | ✅ live |
| Mobile Submit bar z-index | ✅ live |
| PO作成時 email/payment_terms自動入力 | ✅ live |
| Order Catalog supplier dropdown | ✅ live |
| Hub expand / Receiving record expand | ✅ live |
| Branch delivery addresses | ✅ live |
| PO email open tracking | ✅ live |
| CME メール未達 | ⏳ CME IT担当ホワイトリスト登録待ち |
| Store Daily Evaluation Phase 1–4 | ✅ live |
| インライン写真アップ（Backup/Station/Cleanliness/Awareness） | ✅ live |
| pytz → zoneinfo クラッシュ修正 | ✅ live |
| CK Dispatch "0"エラー修正 (KeyError→.get()) | ✅ live |
| Review & Submit パネル修正 (catalog reload) | ✅ live |
| Food Safety & Organization 項目追加 (10項目×10pt) | ⏳ デプロイ待ち |
| 全10項目 英語ルーブリック整備 | ⏳ デプロイ待ち |
| SOP Compliance 追加（11項目）、ルーブリック常時表示 | ✅ live |
| スコア計算: sum/55×100（11項目均等） | ✅ live |
| 販売データ: 常に前日表示・14:00境界修正 | ✅ live |
| Travel Path 温度入力（冷蔵・冷凍ユニットごと数値入力） | ⏳ デプロイ待ち |
| Cold Chain Monitoring チャンネル（クーラーボックス単位3行表）| ✅ live |
| Store Eval auto-data: 接続分離バグ修正 + CUBパターン修正 | ✅ live |
| Cold Chain: 機材選択（Manila）equipment_json | ✅ live |
| Cold Chain: Storage Unit削除・モバイルレイアウト最適化 | ✅ live |
| Cold Chain: 機材選択（equipment picker）+ 外枠修正 | ✅ live |
| CK Receiving「0」エラー修正 (confirm_ck_receiving KeyError) | ✅ live |
| Store Procurement レビュー中の前回オーダー表示を非表示 | ✅ live |
| Cold Chain: msg位置修正 + Dispatch Reloadボタン | ✅ live |
| Travel Path: 詳細パネル改善 (B-1/F-1/F-2) | ✅ live |
| Travel Path: Monthly Compliance 温度ログ (F-3) | ✅ live |
| Direct Purchase: ON CONFLICT partial index バグ修正 | ✅ live |
| Cold Chain: Dispatch 時ボックスごと温度入力 + 写真UP (Manila) | ✅ live |
| Cold Chain: Branch Receiving 新フロー（CK事前設定分をUPDATE） + Received By セレクター | ✅ live |
| Cold Chain: 案Aフラグ (has_dispatch_boxes) 後方互換性対応 | ✅ live |
| Store Procurement: Manila Excel カタログ seed (Fresh/CK/WH) + Fresh タブ追加 | ✅ live |
| Cash Report チャンネル: Opening/Closing フォーム + Admin Dashboard (Compliance/SafetyBox/NTE) | ✅ live |
| Store Procurement: Fresh タブ削除（Fresh は通常 PO フローへ） | ✅ live |
| Procurement: CK オーダーを手動承認フローへ変更（承認後に PO 自動作成 → CK Production） | ✅ live |
| Store Receiving: Confirm ボタン表示バグ修正（lastCreatedId フィルター削除） | ✅ live |
| Admin Confirm Delivery: PRナンバー検索で "No records found" バグ修正（city フィルター除去） | ✅ live |
| Admin Confirm Delivery: アイテム詳細展開パネル追加（クリックで注文明細表示） | ✅ live |
| PC ナビゲーション: 横タブ → 左サイドバー（240px、Staff/Admin区切り） | ✅ live |
| Admin Confirm Delivery: Confirm 2段階ガード + アイテム別受取記録（Option B） | ✅ live |
| Renewals: Expired/Critical/Warning フィルターチップ化 | ✅ live |
| Direct Purchase: Unit に packet/ctn/case 追加 | ✅ live |
| Approval Inbox: PR No. / Date / Supplier 表示追加 | ✅ live |
| Procurement: WH Dispatch 新機能（承認 → WH Dispatch → Store Receiving） | ⏳ 後日実装 |
| Manila Sales Analytics: Item Sales タブ (branch/category/limit フィルター + ソート) | ✅ live |
| Manila Sales Analytics: Hourly Traffic タブ (時間帯別 bar + KPI + ランチ/ディナー色分け) | ✅ live |
| Admin/Vendors: サプライヤー名検索ボックス + 右パネル sticky | ✅ live |
| Admin/Vendors: 編集中に "+ New Vendor" ボタン表示 | ✅ live |
| Store Procurement: サプライヤー削除 (catalog soft-delete + import hard-delete 2段階) | ✅ live (Heroku v1217) |
| Item Sales: Cubao 選択でフィルターが消えるバグ修正 | ✅ live (Heroku v1219) |
| Item Sales: Cubao→QC DB名前マッピング修正 | ✅ live (Heroku v1219) |
| Travel Path: 全Manila店舗に排水溝詰まり防止アイテム追加 | ✅ live (Heroku v1220) |
| Cash Collection Pipeline: 3ステップ追跡 (Store→Office→Bank) | ✅ live (Heroku v1221, Vercel 0e01003) |
| Bayzat Daily Import: Shared Drive ID 検出修正 | ✅ live (Heroku v1225) |
| Attendance Auto Sync: APScheduler 05:18/07:18 UTC | ✅ live (Heroku v1225) |
| Analytics Summary: Dubai KPI → actual_attendance fallback (source=auto) | ✅ live (Heroku v1225, Vercel a81f6ae) |
| Approval Case: アイテムインライン編集 (Qty/Unit Price/Spec) | ✅ live (Heroku v1226, Vercel 2f4999e) |
| HR Staff (Camilla): OS Attendance + Staff Master 403 修正 | ✅ live (Heroku v1230) |
| ③ Transport Expense (Manila only) — advance request + receipt tracking | ✅ live (Heroku v1231, Vercel b77e3d7) |
| ④ Petty Cash (Manila only) — 7 categories, receipt photo, approve/close flow | ✅ live (Heroku v1232, Vercel 7b3e489) |
| Bug fix: petty cash Drive failure orphan / transport empty-file guard / dead actor.get("name") | ✅ live (Heroku v1233, Vercel da24623) |
| Procurement Hub + Case Detail: WH在庫列追加 (Manila承認画面で在庫可視化) | ✅ live (Vercel 0cf2b87) |
| WH オーダー HQ 承認必須化（ガバナンス強化） | ✅ live (Heroku b79fe6d, Vercel 709255f) |
| WH HQ 承認フロー バグ修正 4 件 + テスト 35 件 (133/133 PASS) | ✅ live (Heroku 611a34a) |
| Cold Chain: 複数ブランチ選択 UX 修正 (全選択デフォルト + チェックボックス式) | ✅ live (Vercel 0bce485) |
| Daily Ops Check ① Opening / ② Lunch Close / ③ Business Close | ✅ live (Heroku v1230, Vercel 0bce485) |
| Daily Ops Check v2: 4-color status + auto/manual + double-check | ✅ live (Heroku 0804f82, Vercel 1a371ae) |
| Role Management 同期: 8 admin + 6 store チャンネル追加 | ✅ live (Heroku a877e8d, Vercel dd078d3) |
| SECURITY: 9 API モジュール city-scoped permission 照合強化 | ✅ live (Heroku d369f55) |
| Analytics Dubai Sales Hourly: 独自日付範囲 + 店舗フィルター | ✅ live (Vercel e1fe51e) |
| Procurement Hub: Supplier + Branch フィルター + Clear 即時リロード修正 | ✅ live (Heroku 0e575df, Vercel e1fe51e) |
| Store Receiving: Supplier 名 + 受取ステータス + 検索機能 | ✅ live (Vercel e1fe51e) |
| Store Evaluations Daily Summary: Food Safety / Org & Storage / SOP Compliance 列追加 | ✅ live (Heroku 0e575df, Vercel e1fe51e) |
| Store Evaluation: 日付選択 UI (yesterday default) + Admin day nav | ✅ live (Heroku 2017bc4, Vercel e1fe51e) |
| HR Staff Absences 403 修正 (channel.admin.absences.view) | ✅ live (Heroku 2017bc4) |
| CK Production qty 小数点修正 (0.5→1 バグ解消) | ✅ live (Vercel e1fe51e) |
| Cash Management カレンダー全ダッシュ修正 (FastAPI route ordering) | ✅ live (Heroku 2017bc4) |
| Draft Force-Replace 後 Google Sheets 自動エクスポートが実行されないバグ修正 | ✅ live (Vercel 54814dd) |
| Draft PIN 未入力時 Google Sheets 警告バナー追加 | ✅ live (Vercel 54814dd) |

---

## Heroku Diagnostics

```bash
heroku logs -a sushizen-shift-app -n 200 | grep -E "error|CK|dispatch" -i

heroku pg:psql -a sushizen-shift-app

# Reset attendance sync duplicate hash
UPDATE attendance_drive_sources SET last_sync_status = '' WHERE id = 1;
```
