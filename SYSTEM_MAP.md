# Sushi ZEN Workforce OS — System Map

> Comprehensive architectural reference for Claude. Read this on session restart to
> recover full context without re-mapping the codebase. Companion to `CLAUDE.md`,
> `WORKSPACE_HANDOFF.md`, and `../sushizen_shift_app_clean/BACKEND_HANDOFF.md`.
>
> Last regenerated: 2026-05-10.

---

## 0. Identity

- **Product**: "Sushi ZEN Workforce OS" — Internal admin/analytics/operations platform for Sushi ZEN restaurants in Dubai (UAE) and Manila (PH).
- **Live URL**: https://sushizen-shift-pwa.vercel.app/ — landing page (logo + Log In / Sign Up / Create Staff Record).
- **PWA**: `start_url: /week`, dark `#0b0b0b` background, installable.
- **`<title>`**: "Sushi ZEN Workforce OS". Do NOT confuse with the `/week` page's lighter "Sushi ZEN Shift" appearance — same app, two design contexts.

---

## 1. Repos & Deploy Targets

| Repo | Path | Stack | Deploy |
|---|---|---|---|
| Frontend (PWA) | `~/Desktop/sushizen-shift-pwa` | Next.js 15 App Router, React 19, Tailwind v4, lucide-react, recharts, framer-motion | Vercel — `git push origin main` only (NOT `vercel --prod`) |
| Backend (API) | `~/Desktop/sushizen_shift_app_clean` | FastAPI + Python 3, psycopg2 direct (no ORM), Heroku Postgres | Heroku app `sushizen-shift-app` — `git push heroku HEAD:master --force` |

**API base URL** (prod): `https://sushizen-shift-app-038d846023bc.herokuapp.com`
**API proxy** (frontend): `src/app/api/admin/[...slug]/route.ts` forwards to backend; dev proxies to `http://127.0.0.1:8000`.

### Pre-push hook landmine
`.git/hooks/pre-push` in the frontend repo currently runs `npx vercel --prod --yes`. **CLAUDE.md explicitly forbids this** — produces 20s "fake build" that 404s critical routes. The hook should be deleted or stubbed; `git push origin main` alone triggers Vercel via GitHub integration.

---

## 2. Scale (current snapshot)

- `app/main.py` — **27,366 lines, 528 FastAPI routes**
- `app/db.py` — **41,755 lines** (835 functions, 171 `CREATE TABLE` statements, ~235 unique tables)
- `src/app/admin/analytics/page.tsx` — **11,116 lines** (largest single page)
- `src/app/admin/cost-calculation/page.tsx` — 5,935 lines
- `src/app/admin/draft/page.tsx` — 2,889 lines
- `src/app/admin/inventory/productions/page.tsx` — 2,253 lines
- `src/app/admin/manual-shift/page.tsx` — 1,787 lines (light-themed outlier)
- `src/components/analytics/ManilaSalesSection.tsx` — 1,519 lines
- `src/app/admin/page.tsx` — 1,645 lines
- 100+ admin pages, ~15 staff-facing pages, 4 store-procurement pages

---

## 3. Routes

### 3.1 Frontend page map (groups)

**Public / auth**: `/` (landing) · `/login` (typeahead, → `/my-shift`) · `/signup` · `/setup-pin` · `/change-pin`

**Staff (PWA primary)**:
- `/week` (852 lines) — week shift viewer. **CRITICAL — never break.** Auto-jumps to latest week, branch filter (ALL / `__MY__` / per-branch), 8h–30h timeline, FINAL/PENDING/BASE badges.
- `/my-shift` — personal monthly schedule (`/api/shifts/my_month`)
- `/calendar` — day + range browser (`/api/shifts/view`, `/api/shifts/range`)
- `/attendance` — Time-in/Time-out with WebAuthn (Passkey) + GPS (TTL 5min, re-check 30s)
- `/my-pay` (Phase 5) — 4-tab self-service payroll (Pay Slips / Adjustments / Loans / Leave Advance), city toggle, KPI grid, slip detail modal. **Looks complete.**
- `/request` (758 lines, Phase 5, **light teal theme**) — 3 tabs: form / history / inbox (manager-only). Types: time_change, day_off, absence, swap, paid_leave, vacation, overtime_request, other. Leave-balance badges, dual API (legacy `/api/shift_change/submit` multipart + new `/api/request/notify` JSON).
- `/swap-approve` (light theme) — counterparty approves/rejects swap by ID
- `/inbox` — personal message center (private replies + request submissions)
- `/incidents` — incident submission + replies (9 categories, 4 severities)
- `/private-report` — confidential reports to HQ (UI-bug or HQ-private mode)
- `/zen-music` — store ambience BGM (17 tracks, no auth, leisure)

**Store (in-store staff procurement)**:
- `/store/procurement` · `/request` · `/claim` · `/receiving` — all use `procurementJson()` with name+PIN session cache.

**Admin** (top-level, all gated by `canAccess*Admin()`):
- `/admin` (1,645 lines) — tabbed dashboard (requests/lowRatings/orderEntry/ratingEntry/salesDataInput/cashierEvalInput/dailyInventory/cancellationInput/dubaiCancellationInput)
- `/admin/analytics` (11,116 lines) — 15 tabs (staff/dubaiSales/manilaSales/evaluation/finance/procurement/ai/overtime/late/absence/adherence/lean_shift/inventory_gap/disposal/backup); Compliance + Summary 2-period design
  - sub-tabs: AbsenceTab, AdherenceTab, InventoryGapTab, LateTab, LeanShiftTab, OvertimeTab
  - sub-pages: `analytics/ai-history` (snapshots), `analytics/procurement` (1,371-line dashboard)
- `/admin/draft` (2,889 lines) — shift draft generator: ForecastSettingsPanel, reliability analysis, AI analyze (`/api/admin/draft/ai-analyze`), proposal editor with `ShiftScheduleView.tsx` (799 lines). Sheet-proposals legacy code (`sheetTabMain`, `pendingVisibleRows`, `proposeFromSheet`, `DUBAI_DRAFT_SHEET_URL`) **still in file pending removal**.
- `/admin/manual-shift` (1,787 lines, light theme) — manual publish + Bayzat XLSX parse
- `/admin/baseroll-prep` — sushi prep instructions
- `/admin/attendance/*` — `page` (hub) · `import` (Drive sync) · `history` · `locations` · `employees` · `monthly-closing` · `analytics` (→ redirect) · `mapping` (→ redirect) · `monthly-summary` (→ redirect) · `payroll` (→ redirect)
- `/admin/corrections` — manual punch fixes
- `/admin/os-attendance` — back-office staff time tracking
- `/admin/absences` — absence/leave management (1,295 lines)

**Payroll (3-layer cluster)**:
- Dubai: `/admin/payroll/{page,adjustments,loans,transactions,leave-salary}`
- Manila v5: `/admin/payroll/manila/{page,[periodId],gov-tables,staff-profiles}` — fully fleshed out, calls `/api/admin/manila-payroll/*`

**Procurement** (89 backend routes — largest domain):
- `/admin/procurement/*` — 22 pages: vendors, whitelist, items, ingredients, quotes, invoices (1,362 lines), payments, imports, exceptions, dashboard, pos (POs), audit, receiving, approval-inbox, approval-matrix, kpi, price-checks (953 lines), scorecards, claims, risk-lab (1,277 lines), price-search, cases/[caseId]
- All require approver-name + PIN step-up via `procurementClient.ts`

**Inventory** (150+ backend routes):
- `/admin/inventory/*` — 13 pages: items, recipes, counts, count-sheets, ck-inventory, wh-inventory (1,636 lines), productions (2,253 lines), transfer-orders, cost-adjustments, quantity-adjustments, spot-checks, ledger, pos-sync
- `/admin/daily-inventory` — quick daily entry (Manila branches PARANAQUE/CUBAO/TAFT)

**Menu**: `/admin/menu/{categories,products,combos,groups,modifier-groups,modifier-options,tags}` + dynamic detail pages (`combos/[comboId]`, `groups/[groupId]`, `products/[productId]`)

**Staff & Roles**: `/admin/staff` · `staff/create` · `staff/onboarding` · `staff/audit` · `staff/roles` (HQ-only Role Management matrix)

**Other admin**:
- `/admin/incidents` (+ `/dashboard`, `[id]`)
- `/admin/renewals` (visa/contract renewals, alert badges)
- `/admin/backoffice-evaluation` (Backoffice Daily Evaluation)
- `/admin/discord-inbox` (Discord mentions + dismiss)
- `/admin/daily-report` · `/admin/disposal` · `/admin/backup` · `/admin/order-entry` (→ redirect) · `/admin/ratings-entry` · `/admin/private-reports` · `/admin/ai-analytics-pro` (Anthropic chat) · `/admin/cost-calculation/*` · `/admin/price-check` · `/admin/comparison` (→ redirect) · `/admin/low-ratings` (→ redirect)

**API routes**:
- `api/admin/[...slug]` (catch-all forwarder)
- `api/admin/draft/ai-analyze` (long-running, 120s)
- `api/admin/procurement/badge-summary`
- `api/auth/[...slug]` · `api/auth/verify`
- `api/cost/[...slug]`
- `api/ai/analytics/chat-pro` (long-running, 120s)
- `api/version` (returns `VERCEL_URL` for AutoReload)

### 3.2 Backend route map (528 endpoints, by domain)

| Prefix | Count | Notes |
|---|---|---|
| `/api/auth/*` | ~10 | PIN setup/verify, session, refresh, step-up, **WebAuthn** register/auth |
| `/api/admin/staff/*`, `/api/admin/staff_master/*`, `/api/store/staff/*` | ~16 | Staff CRUD, audit, onboarding, role/status |
| `/api/admin/access/*` | 12 | HQ Role Management — channels/roles/permissions matrix |
| `/api/shifts/*`, `/api/published/week` | 7 | Read shifts (week/range/day/month, `my_calendar_days`, `my_month`, `max_date`, `changes`) |
| `/api/shift_change/*` | 6 | Submit, intent, manager confirm, HQ confirm, counterparty respond, detail |
| `/api/admin/absences/*` | 3 | List, upsert, delete |
| `/api/draft/*` | 17 | Row CRUD, generate_week/month, ai_analyze, branches, two-phase apply prepare/confirm, sheet propose/decide |
| `/api/admin/{demand-events, operating-hours, staffing-rules, forecast-settings}/*` | ~9 | Inputs to draft generation |
| `/api/admin/shifts/*` | 3 | Manual publish, delete published, Bayzat XLSX parse |
| `/api/admin/attendance/*` | 42 | Drive sync, import-batches, comparison (4 splits), locations/aliases, schedule policies, **`coo-dashboard` v1–v5**, daily-report, report-discord |
| `/api/attendance/*` | 5 | Staff-facing time-in/out (WebAuthn + GPS) |
| `/api/admin/analytics/*` | 88 | Sub-domains: absence, adherence, branch_*, city_summary, late, lean_shift, low-ratings, overtime, staff_work_summary, dubai/*, manila/* |
| `/api/admin/pos/*` | 19 | POS sales: branches, brands, items, hourly, sales, product-mix, operation-time, cancel-orders, sync, sync-jobs |
| `/api/admin/pl/*`, `/api/admin/finance/*` | 7 | P&L snapshot/sync/import/allocation, break-even, labor-ratio, pl-vs-target |
| `/api/admin/payroll/*` | 37 | **Dubai/legacy**: cycles, runs, payments, adjustments, salary-configs, loans, leave-salary, drive/sync, my-pay/* (staff self-service) |
| `/api/admin/manila-payroll/*` | 24 | **v5**: periods, runs, items, settings, staff-profiles, gov-tables, compute, approve |
| `/api/admin/procurement/*` | 89 | Largest domain. requests, items, suppliers, approvals, exceptions, audit, KPI, claims, invoices, payments, POs, receiving, cases, catalog, whitelist, stockout, price-checks, config, pos, import |
| `/api/procurement/*` | several | Public-token PO confirm + item/supplier search |
| `/api/admin/price-check/*` | 9 | Manila price baseline / variance scanning |
| `/api/cost/*` (in `cost_api.py`) | ~60 | Ingredient master, menu items, master-items, price history, promotion |
| `/api/admin/menu/*` (in `menu_api.py`) | 80+ | Categories, products, ingredients, modifiers, tags, custom-prices, combos, groups, foodics SKU aliases |
| `/api/admin/inventory/*` (in `inventory_api.py`) | 150+ | Items, levels-by-branch, ledger, balances, counts, spot-checks, transfers, productions, adjustments, count-sheets, foodics-production-import, recipes, order_consumptions |
| `/api/admin/daily-inventory/*` (in `daily_inventory_api.py`) | 7 | Store-level daily count submission |
| `/api/renewals/*` (in `renewals_api.py`) | 8 | Staff document/visa renewals + alerts |
| `/api/incidents/*` (in `incident_api.py`) | 13 | Submit, attach, list, notes, replies, status |
| `/api/admin/discord/*` (in `discord_api.py`) | 7 | Mentions inbox, reply/dismiss, push-subscribe (VAPID), VAPID public key |
| `/api/private_reports/*`, `/api/admin/private_reports/*` | 7 | Anonymous staff → HR/HQ messaging |
| `/api/ai/analytics/*` | 4 | `/consult`, `/chat-pro` (Anthropic), `/snapshots` CRUD |
| `/api/admin/backoffice-evaluation/*` | 8 | bayzat-sync, sync-from-sheet, scores, summary, detail, attendance-status, actions |
| `/api/admin/evaluation/*` | 6 | Store-level KPI scoring (different from backoffice) |
| `/api/admin/disposal/*`, `/api/admin/backup/*` | ~9 | Store-side waste & backup-task reports |
| `/api/admin/cctv/*` | 4 | Ingest jobs, behavior events/rollups, score summary |
| `/api/admin/leave-balances/*` | 2 | Leave balance lookup/update |
| `/api/admin/storehub/*` | 2 | Store list + sync (REST API path; complement to Drive Excel path) |
| `/api/admin/daily-report/*` | 2 | Daily generated report |
| `/api/internal/*` | 2 | `cctv/events/bulk`, `manila-auto-sync` |
| Misc | — | `/health`, `/debug/routes`, `/api/admin/backend-version`, `/api/admin/scheduled/debug`, `/api/admin/overview`, `/api/admin/requests/badge` |

---

## 4. Authentication & Permissions

### 4.1 Auth state (frontend `src/lib/auth.ts`)
- localStorage key: `sushizen_shift_auth`
- Shape: `{ staffName, city, cityLock, role, pin, accessToken, stepUpToken, stepUpLevel, stepUpVerifiedAt, permissions[], mfa{} }`
- Cookie: `sushizen_authed=1` (no PIN)
- Step-up freshness: 30 min (`STEP_UP_FRESH_MS`)
- `refreshAuthFromApi()` re-mints access token via `/api/auth/verify` (PIN) or refreshes via `/api/auth/session`

### 4.2 Roles (8)
`STAFF`, `MANAGER`, `MANAGEMENT`, `HR_MANAGER`, `HQ` (super, has `["*"]`), `ADMIN`, `DUBAI_MANAGEMENT`, `MANILA_MANAGEMENT`

**HQ ≠ ADMIN**:
- `isAdmin(auth)` returns true ONLY when `role === "ADMIN"`
- `canAccessRoleManagement(auth)` returns true ONLY when `role === "HQ"`
- NavBar shows admin items if: `isAdmin(auth) || role === "HQ" || canAccessAdminNav(auth)`
- Admin page guards must include `|| role === "HQ" || role === "ADMIN"` to avoid locking out HQ

### 4.3 Channel permissions (`access_control.py`)
- ~38 channels (route-mapped, `staff` or `admin` group)
- ~50 permissions, format `channel.<key>.<action>` (view/write/manage)
- `DEFAULT_ROLE_GRANTS` seeds `access_role_permissions` table
- Resolution: JWT → role → `db.resolve_role_permissions(role, city, branch)` → fallback `LEGACY_ROLE_PERMISSION_MAP`

### 4.4 Page guards (`src/lib/auth.ts`)
- Staff: `canAccessAttendancePage`, `canAccessWeekPage`, `canAccessMyShiftPage`, `canAccessCalendarPage`, `canAccessMyPay`, `canAccessIncidentReport`
- Admin: `canAccessAdminNav`, `canAccessAdminDashboard`, `canAccessAnalyticsAdmin`, `canAccessAttendanceAdmin`, `canAccessOsAttendanceAdmin`, `canAccessAbsencesAdmin`, `canAccessRenewalsAdmin`, `canAccessStaffAdmin`, `canAccessRoleManagement`, `canAccessDraftAdmin`, `canAccessBackofficeEvaluationAdmin`, `canAccessIncidentReportAdmin`, `canAccessProcurementAdmin(auth, market)`, `canAccessCostAdmin`, `canAccessInventoryAdminNav`, `canAccessDailyInventoryAdmin`, `canAccessMenuAdmin`, `canAccessPrivateReportAdmin`, `canAccessAiAnalyticsProAdmin`, `canAccessPayrollAdmin`
- Pattern: each page calls its guard in `useEffect` after `getAuth()`; on fail → `router.replace("/login?next=...")` or sibling page (`/week` → `/my-shift`, `/my-shift` → `/request`, etc.)

---

## 5. AutoReload (CRITICAL — CLAUDE.md Lessons Learned #5)

**Mechanism** (`src/components/AutoReload.tsx`):
1. `next.config.ts` bakes `NEXT_PUBLIC_BUILD_ID = VERCEL_URL` into client bundle at build time
2. `/api/version/route.ts` returns current `VERCEL_URL` at runtime
3. Client polls every 3s; mismatch → `hardReload()` (cache-bust `?_r=<ts>`)
4. Re-checks on visibilitychange / focus / pageshow (iOS bfcache) / route navigation

**Inline `<head>` script in `src/app/layout.tsx`** runs BEFORE React hydration:
1. Fetch `/api/version`, hard-reload if mismatch
2. ChunkLoadError handler — hard-reload on stale dynamic-import errors

**Rules (must follow)**:
- Never remove `<AutoReload />` from `LayoutShell.tsx`
- Never set `frontendBaseline.current = null` after a failed fetch — null disables polling
- If baseline is null and a poll succeeds, SET baseline (don't compare) — handles startup-fetch failure
- Both `frontendBaseline` and `backendBaseline` follow the same null-guard pattern
- ESLint errors → broken Vercel build → 404 on all routes → AutoReload can't recover

---

## 6. External Integrations

| Integration | Purpose | Code | State |
|---|---|---|---|
| **Bayzat** | UAE attendance source (XLSX/JSON exports) | `main.py` L8829 (`bayzat_parse`), `_load_bayzat_service_account_info`, `services/payroll_sync.py`, `services/backoffice_daily_evaluation.py` | Active. Direct upload + Drive folder polling. Full range imported (2025-11-01 → 2026-03-13) |
| **Foodics** (Dubai POS) | Sales receipts → daily/hourly | `app/integrations/foodics_drive.py`, `foodics_parser.py`, `services/foodics_sales.py`, `services/pos_sync.py` (~5,000 lines) | Active. Drive folder polling, multi-format (PDF + XLSX). Tags `source_system='foodics'` |
| **StoreHub** (Manila POS) | Sales receipts (replaces Foodics in Manila) | `services/storehub_api.py` (REST), `services/manila_sales_sync.py` (Drive XLSX) | Both paths active. API path tags `storehub_api`, Drive path tags `storehub`. Same Manila tables, no collision |
| **Google Drive** | Generic file sync (XLSX/PDF/CSV) | Per-domain SA JSON env: `FOODICS_*`, `BAYZAT_*`, `PL_DATA_*`, `DUBAI_PL_DATA_*`, `MANILA_PL_DATA_*` | Active. `attendance_drive_sources` table tracks watched folders. Drive folder id `1t562gVuaNupDUTuGjaRz-3u4mF-LXr4Y` (drive source id `1`) is the current attendance source |
| **Google Sheets** (P&L) | Monthly P&L (Dubai + Manila workbooks) | `services/pl_data_sync.py`, `sheets_client.py`, `sheet_inspector.py`, `normalizer.py` | Active. Env: `PL_DUBAI_SPREADSHEET_ID`, `PL_MANILA_SPREADSHEET_ID`. Manila shared-cost split via `PL_MANILA_SHARED_COST_SUBSTRINGS` (default `["バックオフィス"]`) |
| **Google Sheets** (shifts) | Historical shift entry | `services/shift_sheet_sync.py`, `services/cost_source_sheet_sync.py`, `services/cost_sheets_backup.py` | Partially deprecated. Sheet proposals (`shift_sheet_sync_proposals` table + `proposeFromSheet` UI) **pending removal** |
| **Discord** (notifications) | Per-city webhooks + bot + web push | `app/discord_webhook.py`, `discord_templates.py`, `discord_db.py`, `discord_api.py`, `services/discord_reports.py`, `services/discord_bot_service.py` (`discord.py 2.3.2`) | Active. Webhooks: `DISCORD_WEBHOOK_DUBAI`, `DISCORD_WEBHOOK_MANILA`. Bot watches channels, captures `DISCORD_MANAGEMENT_USER_IDS` mentions. Web push via `pywebpush 2.0.0` + VAPID |
| **Anthropic Claude** | AI Analytics + draft analyze | `import anthropic as anthropic_sdk` (try/except optional in main.py). `app/ai_analytics_pro.py` (906 lines) | Active. `/api/ai/analytics/{consult, chat-pro, snapshots}` + `/api/draft/ai_analyze`. `anthropic>=0.40.0` |
| **WebAuthn / Passkey** | OS Attendance biometric login | `webauthn==2.7.1`. Routes `/api/auth/webauthn/{register,auth}/{options,verify}`. Table `staff_webauthn_credentials` | Active and central to OS Attendance |
| **Web Push** | PWA notifications for incidents/Discord | `pywebpush==2.0.0`, `push_subscriptions` table, VAPID public key endpoint | Active |

---

## 7. Database Tables (~235, by domain)

Bootstrap pattern: `ensure_*_tables()` functions guarded by `_*_SCHEMA_READY` flags + threading locks; called lazily from main.py route handlers. **No migration tool** — schema evolves via in-place `ALTER TABLE ADD COLUMN IF NOT EXISTS` blocks.

**Shifts & schedule** (~10): `base_shift_normalized`, `shift_overrides`, `shift_published_versions`, `shift_published_rows`, `shift_draft_versions`, `shift_draft_rows`, `shift_sheet_sync_proposals`, `draft_apply_jobs`, `export_jobs`, `baseroll_product_map`

**Demand & rules**: `demand_events`, `operating_hours`, `staffing_rules`, `forecast_settings`, `branch_pos_map`, `sales_source_priority`

**Absences & changes**: `absences`, `shift_change_requests`, `shift_change_events`, `shift_change_notifications`, `staff_leave_balances`

**Staff master + auth**: `staff_master`, `staff_auth`, `staff_role_assignments`, `staff_audit_log`, `staff_webauthn_credentials`, `os_attendance_sessions`, `os_attendance_visits`, `os_branch_gps`

**Access control**: `access_channels`, `access_permissions`, `access_roles`, `access_role_permissions`, `access_audit_log`

**Security**: `security_audit_log`, `abuse_event_log`, `api_idempotency_keys`

**Attendance**: `actual_attendance`, `attendance_import_jobs`, `attendance_locations`, `attendance_employee_aliases`, `attendance_corrections`, `attendance_monthly_closings`, `attendance_drive_sources`, `attendance_schedule_policy`

**Private + Incident reports**: `private_reports`, `private_report_replies`, `private_report_notifications`, `incident_reports`, `incident_report_replies`, `incident_report_attachments`, `incident_report_notifications`, `incident_internal_notes`

**Backoffice eval**: `backoffice_eval_actions`, `backoffice_eval_benchmarks`, `backoffice_eval_monthly_input_raw`, `backoffice_eval_scores`, `backoffice_task_weight_master`

**Evaluation channel**: `evaluation_channel_sections`, `evaluation_channel_settings`, `evaluation_score_rules`

**CCTV**: `cctv_ingest_jobs`, `cctv_behavior_events`, `cctv_behavior_rollups`

**Procurement** (~30): `proc_requests`, `proc_request_items`, `proc_approval_actions`, `proc_approval_cases`, `proc_approval_matrix_php`, `proc_approval_notifications`, `proc_audit_logs`, `proc_case_messages`, `proc_claims`, `proc_curated_catalog_items`, `proc_document_chain`, `proc_emergency_whitelist`, `proc_exception_events`, `proc_improvement_actions`, `proc_invoices`, `proc_item_benchmark_master`, `proc_kpi_monthly`, `proc_order_import_batches`, `proc_order_import_rows`, `proc_payments`, `proc_po_email_logs`, `proc_price_baselines`, `proc_purchase_orders`, `proc_receivings`, `proc_risk_lab_settings`, `proc_stockout_risk_snapshots`, `proc_supplier_invoice_sync_jobs`, `proc_vendor_master`, `proc_vendor_quotes`, `supplier_master`, `supplier_ingredient_prices`, `invoice_line_items`, `invoice_summary`, `invoice_ingredient_mappings`

**POS — Dubai (Foodics)**: `pos_sales_daily`, `pos_sales_branch_daily`, `pos_sales_channel_daily`, `pos_sales_hourly_daily`, `pos_sales_hourly_monthly`, `pos_menu_item_daily`, `pos_product_mix_ranking`, `pos_operation_time_daily`, `pos_cancel_order_type_daily`, `pos_cancel_platform_daily`, `pos_revenue_location_daily`, plus `pos_*_import_jobs`, `pos_sync_jobs`

**POS — Manila (StoreHub)**: `manila_sales_*` (by_category, by_channel, by_modifier, by_payment_method, by_product, by_variant), `manila_sales_hourly`, `manila_pos_transactions`, `manila_sales_import_jobs`, `manila_attendance_daily`, `manila_foodpanda_customers_daily`, `manila_foodpanda_offline_monthly`, `manila_foodpanda_ops_daily`, `manila_grab_offline_hours`, `manila_manual_offline_order_counts`, `storehub_api_sync_log`

**Cancellations & ratings**: `dubai_cancellations`, `dubai_aggregator_ratings`, `dubai_order_counts`, `manila_cancellations`, `manila_aggregator_ratings`, `manila_cashier_evaluations`, `aggregator_low_ratings`

**Cost / menu / inventory**:
- Cost: `ingredient_master`, `ingredient_price_history`, `menu_item_master`, `menu_item_components`, `menu_item_ingredients`, `menu_price_history`, `menu_category_master`
- Menu builder (separate domain): `menu_categories`, `menu_products`, `menu_combos`, `menu_combo_products`, `menu_groups`, `menu_group_combos`, `menu_group_products`, `menu_modifier_groups`, `menu_modifier_options`, `menu_modifier_option_ingredients`, `menu_product_ingredients`, `menu_product_modifiers`, `menu_product_tags`, `menu_tags`, `menu_custom_prices`, `menu_foodics_sku_aliases`
- Inventory: `inv_items`, `inv_categories`, `inv_suppliers`, `inv_item_suppliers`, `inv_item_levels_by_branch`, `inv_item_tags`, `inv_menu_recipes`, `inv_menu_recipe_name_overrides`, `inv_stock_ledger`, `inv_stock_balance_daily`, `inv_counts`, `inv_count_items`, `inv_spot_checks`, `inv_spot_check_items`, `inv_transfer_orders`, `inv_transfer_order_items`, `inv_transfers`, `inv_transfer_items`, `inv_productions`, `inv_production_items`, `inv_production_recipes`, `inv_quantity_adjustments`, `inv_quantity_adjustment_items`, `inv_cost_adjustments`, `inv_cost_adjustment_items`, `inv_count_sheets`, `inv_count_sheet_items`, `inv_count_sheet_versions`, `inv_count_sheet_version_items`, `inv_order_consumptions`, `inv_pos_menu_sales_daily`, `inv_pos_sync_jobs`, `inv_foodics_sku_aliases`, `inv_ref_counters`, `ck_stock_counts`, `ck_stock_adjustments`, `wh_stock_counts`, `wh_stock_adjustments`
- Daily inventory (separate): `daily_inv_reports`, `daily_inv_report_items`, `daily_inv_entries`

**Payroll — Dubai (legacy)**: `payroll_staff_monthly`, `payroll_import_jobs`, `payroll_cycles`, `payroll_runs`, `payroll_run_records`, `payroll_payments`, `payroll_salary_configs`, `payroll_adjustments`

**Loans & leave**: `employee_loans`, `loan_repayments`, `leave_salary_requests`

**Payroll — Manila v5**: `manila_payroll_periods`, `manila_payroll_runs`, `manila_payroll_items`, `manila_payroll_settings`, `manila_staff_profiles`, `staff_sil_balances`, `ph_sss_contribution_table`, `ph_philhealth_table`, `ph_pagibig_contribution_rules`, `ph_bir_brackets`, `ph_pay_rate_rules`, `ph_holiday_calendar`

**P&L**: `pl_monthly_imports`, `pl_store_allocation`

**Reports**: `disposal_reports`, `disposal_report_lines`, `backup_reports`, `backup_report_lines`

**Discord / push**: `discord_mentions`, `push_subscriptions`

**AI Analytics**: `ai_analytics_snapshots`

---

## 8. Backend Services Layer (`app/services/*`)

| File | Size | Purpose |
|---|---|---|
| `ai_coo.py` | 71 lines | Wrapper calling `ai_manager` for store/staff anomaly analysis |
| `ai_manager.py` | 91 lines | Heuristic anomaly analyzer (no LLM) |
| `backoffice_daily_evaluation.py` | ~700 lines | Sync daily backoffice eval from Google Sheet |
| `break_even_service.py` | 23 KB | Break-even / labor-ratio / target lines from P&L + payroll + sales |
| `cost_import.py` | 45 KB | Excel ingestion of supplier cost data (multi-sheet) |
| `cost_invoice_price_sync.py` | 15 KB | Sync ingredient prices from supplier invoices |
| `cost_sheets_backup.py` | 7 KB | Push cost master to backup Google Sheet |
| `cost_source_sheet_sync.py` | 10 KB | Pull cost source data from Google Sheets |
| `discord_bot_service.py` | 7 KB | discord.py bot — listens to channels, captures management mentions |
| `discord_reports.py` | 3 KB | POST attendance/report messages to per-city Discord webhooks |
| `draft_demand_planner.py` | 75 KB | Generate week/month draft from demand + reliability + attendance history. Constants `_RELIABILITY_THRESHOLD = 0.82`, absence-weighted 0.70 / late-weighted 0.30 |
| `evaluation_channel.py` | 74 KB | Store evaluation engine: sections, settings, timeline, snapshot, KPI roll-ups |
| `foodics_sales.py` | 3 KB | Foodics PDF parser (pdfminer) |
| `inventory_count_sheet_excel.py` | 6 KB | Generate/parse inventory count XLSX |
| `manila_sales_sync.py` | 83 KB | Manila CSV/Excel sales import (StoreHub Drive Excel + foodpanda + grab offline) |
| `payroll_sync.py` | 20 KB | Sync Dubai monthly payroll XLSX from Google Drive |
| `pl_data_sync.py` | 13 KB | Sync P&L (city-specific) from Google Sheets |
| `pl_excel_import.py` | 2 KB | Import P&L XLSX file |
| `pl_finance_bridge.py` | 10 KB | Combine POS + payroll + imported P&L → "vs target" view |
| `pos_sync.py` | **204 KB / ~5,000+ lines** | The big POS sync engine — Foodics Drive/Excel imports |
| `procurement_control.py` | 20 KB | Approval level resolution, exception detection, KPI scoring, three-way match |
| `procurement_curated_catalog_seed.py` | 30 KB | One-shot seed for curated procurement catalog |
| `procurement_drive_chain.py` | 16 KB | Upload PO/case/invoice docs to Google Drive, validate document chain |
| `procurement_notifications.py` | 10 KB | Dispatch procurement case notifications (Discord/email) |
| `procurement_order_excel_import.py` | 20 KB | Import the Manila order workbook |
| `procurement_po_mail.py` | 8 KB | Generate PO PDF, send email with confirmation token |
| `procurement_stockout.py` | 7 KB | Compute stockout risk snapshots |
| `proc_supplier_invoice_correction.py` | 11 KB | Manual correction tool for supplier invoice rows |
| `proc_supplier_invoice_reporting.py` | 5 KB | Quality / problem report on supplier invoice imports |
| `proc_supplier_invoice_sync.py` | 7 KB | Run supplier invoice workbook sync job |
| `shift_sheet_sync.py` | 7 KB | Parse Google Sheets staff timetable values |
| `storehub_api.py` | 22 KB | StoreHub REST API ingestion (separate from Drive Excel path) |

---

## 9. Manila Payroll v5 Engine

**File**: `app/manila_payroll_engine.py` (901 lines).

**Status**: Phase 1 implementation **complete**. Module docstring confirms: "v5 (Monthly Pay Delta Method) … All staff are Monthly Pay (`salary_type = 'monthly_paid'`). Engine starts from `period_basic = monthly_rate / 2`, then applies: Deductions (absent, late, undertime, NWNP, unqualified holiday), Earnings (day-type premiums, OT, NSD, SIL, 13th month accrual). Statutory deductions (SSS, PhilHealth, Pag-IBIG, BIR) are computed on the second-half payroll only, referencing first-half gross."

This matches `~/Downloads/implementation_plan_v5.md` line-for-line.

**Public API**:
- Data classes: `PayRuleRow`, `AttendanceRow`, `PayrollItem`, `StaffProfile`, `PayrollPeriod`, `EngineSettings`, `ComputeResult`
- Helpers: `calc_night_hours()` (NSD 22:00–06:00 split)
- Loaders: `load_settings_from_db()`, `load_pay_rules_from_db(as_of)`
- Step 1: `aggregate_attendance(staff, period, settings)` — pulls `manila_attendance_daily`, computes regular/overtime hours, NSD split, regular-holiday eligibility
- Step 2: `compute_gross_pay(...)` — applies v5 delta logic (`is_base_included_in_monthly` decides full add vs `(mult − 1.0)`)
- Step 3: `compute_statutory_deductions(...)` — SSS table lookup, PhilHealth 5%, Pag-IBIG Circular 460, BIR TRAIN annualized
- Step 4: `compute_sil_accrual(...)`, `compute_thirteenth_month_accrual(...)`, `check_minimum_wage(daily_rate, ₱695)`
- Step 5: `compute_net_pay(items)`
- Main entry: `compute_payroll_run(conn, staff, period, first_half_gross=None)`

**Wired routes**: `/api/admin/manila-payroll/periods/{id}/compute` (L26187), `/runs/{run_id}/compute` (L26305), `/runs/{run_id}/items` (L26405)

**Key design**:
- `is_base_included_in_monthly` flag in `ph_pay_rate_rules` decides whether premium adds full multiplier or only `(multiplier - 1.0)`
- Rest Day (`is_base_included = false`) → full add when worked, no deduction when not
- Special Holiday (`is_base_included = false`) → full add when worked, NWNP deduction when not
- Regular Holiday (`is_base_included = true`) → only premium delta when worked, conditional deduction (eligibility = present/paid_leave on previous workday)
- Setting `payroll_computation_basis = 'monthly_delta'` seeded in `manila_payroll_settings` (L41666 in db.py)

---

## 10. Frontend Lib Modules (`src/lib/`)

| File | Purpose |
|---|---|
| `api.ts` | `apiGet`, `qs()`, `API_BASE`, types, auto-refresh on 401 |
| `auth.ts` (557 lines) | Auth state, role/permission gates, step-up MFA, refresh |
| `inventoryClient.ts` | `inventoryGet/Post` with friendly H12/timeout errors |
| `menuClient.ts` | Same shape, scoped to menu endpoints |
| `procurementClient.ts` | Adds session-cached name+PIN for step-up; `procurementJson()` |
| `costClient.ts` | `costJson()` with FastAPI validation-error parser, PIN remint |
| `branches.ts` | `BRANCHES`, `labelOf()`, `BranchCode`/`City` types |
| `ui-tokens.ts` (50 lines) | All design tokens (`GLASS_CARD`, `KPI_CARD`, etc.) |
| `badgeEvents.ts` | Custom event names for cross-component badge refresh |
| `formatters.ts`, `date.ts`, `dateInput.ts`, `quantityInput.ts` | Format helpers |
| `inventoryCountUtils.ts` | Count workflow helpers |
| `motion-tokens.ts` | framer-motion constants |
| `renewals.ts` | Renewal alert helpers + `RENEWALS_BADGE_EVENT` |
| `timeAgo.ts` | "X mins ago" relative time |
| `webauthn.ts` | WebAuthn helpers (base64url, register/auth) |

---

## 11. Frontend Components (`src/components/`)

**Shell & nav**:
- `LayoutShell.tsx` (37 lines) — conditional shell (auth pages get bare layout)
- `NavBar.tsx` (813 lines) — desktop tabs + mobile bottom nav (`/attendance`, `/my-shift`, `/request`, `/inbox` primary), badge polling
- `AutoReload.tsx` — deploy detection (CRITICAL)
- `LogoutButton.tsx`
- `app-shell.tsx` — **legacy/unused** (old nav, not imported)

**Inputs**:
- `Field.tsx` — label-with-hint wrapper
- `DatePicker.tsx`, `DateRangePicker.tsx`, `MonthPicker.tsx` — portal-rendered pickers

**Domain tabs (admin)**:
- `admin/AIAnalyticsProTab.tsx` (720 lines) — Anthropic chat UI
- `admin/AdminAttendanceLinks.tsx`, `AdminOnboardingLinks.tsx`
- `admin/AdminCancellationInputTab.tsx` (897), `AdminDubaiCancellationInputTab.tsx` (1052)
- `admin/AdminCashierEvalInputTab.tsx` (853)
- `admin/AdminDailyInventoryTab.tsx` (696)
- `admin/AdminSalesDataInputTab.tsx` (539)
- `admin/ManilaOfflineOrderEntryTab.tsx` (355)
- `admin/OrderEntryTab.tsx` (725) — Dubai brand grid
- `admin/RatingEntryTab.tsx` (746)

**Domain tabs (analytics)**:
- `analytics/BackupAnalyticsSection.tsx` (366)
- `analytics/DisposalAnalyticsSection.tsx` (426)
- `analytics/DubaiCancellationsTab.tsx` (666)
- `analytics/ManilaCancellationsTab.tsx` (637)
- `analytics/ManilaSalesSection.tsx` (1519, largest)
- `analytics/ManilaSalesDataTab.tsx` (745)
- `analytics/ManilaCashierEvaluationTab.tsx` (259)
- `analytics/ManilaOrderCountsTab.tsx` (301)
- `analytics/ManilaRatingsTab.tsx` (500), `ManilaOverallRatingsTab.tsx` (575)
- `analytics/ManilaAggregatorRatingsTab.tsx` (412)
- `analytics/ManilaFoodPandaTab.tsx` (566), `ManilaGrabOfflineTab.tsx` (413)
- `analytics/SalesDataCheckTable.tsx` (234)
- `analytics/LowRatingsCard.tsx` (564), `LowRatingFormModal.tsx` (330)
- `analytics/dubai/AggregatorRatingsTab.tsx` (618), `NumberOfOrdersTab.tsx` (1044)

**Other**:
- `procurement/SupplierSearchInput.tsx`, `ItemSearchInput.tsx`
- `cost/SearchCombobox.tsx`
- `lowratings/LowRatingsAdminPanel.tsx`, `LowRatingsGrid.tsx`, `useGridData.ts`, `gridTypes.ts`
- `menu/IngredientItemSearch.tsx`, `MenuImportFailures.tsx`, `MenuPaginationControls.tsx`
- `InventoryRegistrationHelp.tsx`, `InventoryTabs.tsx`
- `MenuTabs.tsx`, `ProcurementTabs.tsx`, `ProcurementSessionBar.tsx`
- `ui/EmptyState.tsx`, `ui/FlashValue.tsx`, `ui/Spinner.tsx`

---

## 12. Design System (`src/lib/ui-tokens.ts`)

All Tailwind class constants live here — import these instead of writing raw classes:

| Group | Tokens |
|---|---|
| Cards | `GLASS_CARD`, `STATUS_CARD`, `HIGHLIGHT_CARD` |
| Buttons | `PRIMARY_BUTTON` (violet gradient), `SECONDARY_BUTTON`, `SMALL_BUTTON`, `DANGER_BUTTON` |
| Inputs | `INPUT_CLASS`, `SELECT_CLASS`, `TEXTAREA_CLASS` |
| Tabs | `TAB_CONTAINER`, `TAB_ACTIVE`, `TAB_INACTIVE` |
| KPI | `KPI_CARD`, `KPI_LABEL`, `KPI_VALUE` |
| Tables | `TABLE_HEADER`, `TABLE_ROW`, `TABLE_CELL` |
| Typography | `T_PAGE_TITLE`, `T_SECTION`, `T_CARD_TITLE`, `T_LABEL`, `T_BODY`, `T_CAPTION` |
| Badges | `BADGE_SUCCESS`, `BADGE_WARNING`, `BADGE_ERROR`, `BADGE_INFO`, `BADGE_ACCENT` |
| Misc | `DIVIDER` |

**Theme**: Dark slate-violet base (`#0d1117` headers, `bg-white/5` cards, violet-500 accents).
**Outliers**:
- `/admin/manual-shift` uses light theme (`bg-gray-50`)
- `/request` and `/swap-approve` use light teal theme (post-Phase-5 redesigns)

---

## 13. Known Risks & Anti-patterns

### Backend
1. **Five duplicate function definitions in `db.py`**:
   - `ensure_payroll_tables()` at L33923 and L39637 (legacy + Phase 2)
   - `get_ai_coo_dashboard_v5()` at L20585 and L34756
   - `create_attendance_import_job()` at L15811 and L17816
   - `list_attendance_locations_for_mapping()` at L17956 and L19482
   - `update_attendance_location_mapping()` at L18035 and L19545
   Python silently keeps the latter; tests against earlier behavior would fail.

2. **`main.py` 27k lines, only 7 sub-routers** — bulk of 528 routes directly on `app`. Sub-routers: inventory, daily-inventory, menu, cost, discord, renewals, incident.

3. **Five COO Dashboard versions in production simultaneously** — `get_ai_coo_dashboard{,_v2,_v3,_v4,_v5}` with corresponding `/api/admin/attendance/coo-dashboard{,-v2,-v3,-v4,-v5}` routes.

4. **Sheet proposals removal pending in backend too** — `shift_sheet_sync_proposals` schema + CRUD functions still imported.

5. **iCloud sync conflict files in `app/`**:
   - `app/db 2.py` (33,425 lines) — older snapshot
   - `app/db 3.py` (35,008 lines)
   - `app/main 2.py` (21,620 lines)
   - Stale `.tmp_*.pyc` files at repo root
   - Confirmed not imported (Python can't import filenames with spaces). Should be deleted.

6. **Two payroll systems coexist for Dubai** (legacy XLSX-import + Phase 2 operational), plus Manila v5 separate.

7. **`backoffice_daily_evaluation.py`** does both Bayzat sync AND Google Sheet sync via two endpoints — duplication risk.

8. **`ai_analytics_pro_backup.py`** sits next to `ai_analytics_pro.py` — backup snapshot, not imported.

### Frontend
1. **iCloud conflict files in `.next/`** — `.next/types/cache-life.d 6.ts`, `.next/routes-manifest 5.json`, etc. Many ` N` suffixed files. Cause local TS errors but never reach Vercel (.next is gitignored).

2. **`pre-push` hook running `npx vercel --prod --yes`** — CLAUDE.md forbidden. Two outcomes per push:
   - Hook succeeds → Vercel CLI deploys local working tree (not GitHub state); git push may then fail (HTTP 400 on large pushes)
   - Hook fails → entire git push aborted

3. **Long JSX files** are fragile to partial edits:
   - `analytics/page.tsx` (11,116 lines)
   - `cost-calculation/page.tsx` (5,935)
   - `draft/page.tsx` (2,889)
   - `inventory/productions/page.tsx` (2,253)
   - `manual-shift/page.tsx` (1,787)
   - `inventory/wh-inventory/page.tsx` (1,636)
   - `procurement/invoices/page.tsx` (1,362)
   - `analytics/procurement/page.tsx` (1,371)
   - `procurement/risk-lab/page.tsx` (1,277)
   - `staff/roles/page.tsx` (1,230)
   - `daily-report/page.tsx` (1,260)
   - `absences/page.tsx` (1,295)
   - **CLAUDE.md rule**: never use regex scripts to remove JSX blocks; always use line-number-based deletion.

4. **Smart quote substitution** — `Edit` tool sometimes substitutes `"` with `"` or `"` causing TypeScript parse errors.

5. **`/admin/draft` auth guard must include role check** — `canAccessAdminNav()` checks permissions only and returns `false` for HQ users without explicit permissions. Add `|| role === "HQ" || role === "ADMIN"`.

6. **Three login files exist**: `login/page.tsx` (current, → `/my-shift`), `login/LoginClient.tsx` (older, → `/week`, not imported).

### Cross-cutting
- HQ ≠ ADMIN — common source of access bugs
- Vercel "Promote to Production" ≠ git reset — to instantly restore prior state, use Vercel Dashboard → Deployments → "Promote to Production"
- AutoReload null-baseline trap: never set baseline to null after failed fetch

---

## 14. Current State (as of 2026-05-10)

### Repo state (frontend `~/Desktop/sushizen-shift-pwa`)
- **Local main branch is 160 commits ahead of origin/main** — v5 Phase 0–5 implementation, tests, and many other commits NOT pushed to GitHub yet
- Uncommitted: `package.json` + `package-lock.json` (adds `vitest`, `@testing-library/*`, `@vitejs/plugin-react`, `jsdom`)
- Latest commits:
  - `4530d73 Phase 5: Request Channel frontend — light theme, 3-tab layout, inbox polling`
  - `be03807 Phase 3: Manila Payroll frontend — period list, detail, gov-tables, staff-profiles pages`
  - `c7d38cb Add payroll test suite (Vitest frontend + pytest backend) + GitHub Actions CI`

### Vercel deploy state
- Last attempted push #1: pre-push hook ran `vercel --prod --yes` → succeeded in 2 min (deployed local working tree). Then git push failed (HTTP 400, 91.58 MiB).
- Last attempted push #2: pre-push hook ran `vercel --prod --yes` → **`npm run build` exited 1 in 6 sec**. Pre-push returned non-zero → git push aborted.
- **GitHub-connected Vercel deploys are stale** (don't reflect 160 unpushed commits).

### Build error root cause
**4 ESLint errors in `src/app/admin/payroll/manila/[periodId]/page.tsx`**:
- L174: `let va: string|number = ...` → must be `const`
- L175: `let vb: string|number = ...` → must be `const`
- L276 (×2): `"Compute All"` JSX text has unescaped `"` (`react/no-unescaped-entities`)

Next.js 15's `next build` fails on ESLint errors.

### v5 Implementation status (per `~/Downloads/implementation_plan_v5.md`)
- Phase 0 (DB foundation, 13 tables): **complete** — all `ph_*` tables + `manila_*` tables seeded
- Phase 1 (Engine — Monthly Pay Delta): **complete** — `manila_payroll_engine.py` 901 lines, all 5 steps
- Phase 2 (API — 17+ endpoints): **complete** — 24 routes under `/api/admin/manila-payroll/*`
- Phase 3 (Frontend — 4 pages): **complete** but build fails on ESLint
- Phase 4 (Request Backend): **complete**
- Phase 5 (Request Frontend + My Pay): **complete**

### Open blockers (per v5 plan)
- 2025年 SSS Contribution Table 全ブラケット (need official PDF → CSV)
- 全スタッフの `official_hire_date` (for SIL eligibility)
- CPA confirmation: 390% (Double RH + Rest Day), Regular Holiday not worked, unqualified RH deduction

---

## 15. Roadmap Context (`WORKSPACE_HANDOFF.md`)

10-item master roadmap to "Plan → Actual → Result":

**Highest priority**:
1. PWA production deployment
2. Backend production deployment
3. Attendance navigation cleanup
4. History feature completion
5. Foodics v6
6. AI COO v6

**Next priority**:
7. Monthly operations screens (← Manila Payroll v5 is the concrete realization)
8. Shift × Attendance × Sales integration
9. Automated alerts
10. Executive dashboard completion

**Current immediate focus** (from `WORKSPACE_HANDOFF.md`): stabilize `/admin/analytics` while preserving existing features. Don't jump ahead to Foodics v6 / AI COO v6 until analytics page is stable.

---

## 16. Operational Commands Reference

### Frontend (Vercel)
```bash
cd ~/Desktop/sushizen-shift-pwa
npm run dev          # localhost:3000, .next-dev/ cache
npm run build        # NEVER use `vercel --prod` CLI per CLAUDE.md
npm run lint
git push origin main # only valid deploy method (GitHub-Vercel integration)
```

### Backend (Heroku)
```bash
cd ~/Desktop/sushizen_shift_app_clean
git push heroku HEAD:master --force
heroku logs -a sushizen-shift-app -n 200
heroku pg:psql -a sushizen-shift-app
heroku releases -a sushizen-shift-app -n 5
```

### When `git push heroku` says "Everything up-to-date"
This is normal (Heroku already has the commit). To force redeploy:
```bash
git commit --allow-empty -m "force redeploy"
git push heroku HEAD:master --force
```

### When `git commit` fails with "Unable to create HEAD.lock"
```bash
rm /Users/jaynishimura/Desktop/sushizen_shift_app_clean/.git/HEAD.lock
```

### Cowork sandbox limitations
- HTTPS to Heroku/GitHub blocked → user must run `git push` from local terminal
- `.git/HEAD.lock` removal blocked → user must run `rm` locally

---

## 17. File Path Reference

### Critical files to be aware of
- `~/Desktop/sushizen-shift-pwa/CLAUDE.md` — project instructions (HIGHEST priority)
- `~/Desktop/sushizen-shift-pwa/SYSTEM_MAP.md` — this file (regen as system evolves)
- `~/Desktop/sushizen-shift-pwa/WORKSPACE_HANDOFF.md` — system intent + roadmap
- `~/Desktop/sushizen-shift-pwa/KNOWN_RISKS.md`, `FILE_MAP.md`, `VERIFICATION_CHECKLIST.md`, `CHANGELOG_CURRENT.md`, `DEPLOY.md`, `TERMINAL_RUNBOOK.md`
- `~/Desktop/sushizen_shift_app_clean/BACKEND_HANDOFF.md` — backend intent
- `~/Desktop/sushizen_shift_app_clean/CURRENT_IMPORT_NOTES.md`, `IMPORT_README.md`, `PL_DATA_README.md`, `DEPLOY.md`, `README.md`
- `~/Downloads/implementation_plan_v5.md` — Manila Payroll + Request Channel plan

### Cowork mount paths (for `mcp__workspace__bash`)
- `/sessions/zealous-kind-feynman/mnt/sushizen-shift-pwa` ← frontend
- `/sessions/zealous-kind-feynman/mnt/sushizen_shift_app_clean` ← backend
- `/sessions/zealous-kind-feynman/mnt/Downloads`

### Host paths (for `Read`/`Write`/`Edit`/`Grep`/`Glob`)
- `/Users/jaynishimura/Desktop/sushizen-shift-pwa`
- `/Users/jaynishimura/Desktop/sushizen_shift_app_clean`
- `/Users/jaynishimura/Downloads`

---

## 18. When Resuming Work

1. **Read this file first** to recover full context
2. Read `CLAUDE.md` for project rules and Lessons Learned
3. Check `git status` and `git log --oneline -10` in both repos
4. If asked about a specific feature, find it via this map → read the actual file
5. For backend changes: prefer minimal diffs in `db.py` (duplicate function risk), verify with curl + psql
6. For frontend changes: respect the design tokens in `ui-tokens.ts`; never break `/week` or `AutoReload`
7. Before committing: check `npm run lint` in frontend (Vercel build will fail on ESLint errors)
8. Before deploying frontend: verify `.git/hooks/pre-push` is not running `vercel --prod --yes`

---

*Maintained by Claude. Regenerate when major architectural changes happen.*
