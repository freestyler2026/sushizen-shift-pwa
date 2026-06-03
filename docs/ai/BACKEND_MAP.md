# BACKEND MAP — Sushi ZEN Workforce OS

## Repository Root
`/Users/jaynishimura/Desktop/sushizen_shift_app_clean/`

## Heroku App
- App name: `sushizen-shift-app`
- URL: `https://sushizen-shift-app-038d846023bc.herokuapp.com`
- Database: Heroku Postgres (attached as standard add-on)

---

## Main Files

### `app/main.py` (~31,500 lines)
All FastAPI route handlers live here. The file is monolithic — every endpoint is in this single file.

### `app/db.py` (~45,700 lines)
All database access functions and table creation (`ensure_*` functions). Also monolithic.

### Supporting Modules
| File | Purpose |
|---|---|
| `app/access_control.py` | Channel-based permission system, `ACCESS_CHANNELS` definition |
| `app/security_tokens.py` | Token generation, validation, WebAuthn handling |
| `app/policy.py` | Business policy rules |
| `app/normalizer.py` | Data normalization utilities |
| `app/branches.py` | Branch data and city resolution |
| `app/branches_master.py` | Branch master data |
| `app/analysis.py` | Attendance analysis functions |
| `app/analysis_generate.py` | Report generation |
| `app/analysis_peak.py` | Peak hour analysis |
| `app/exporter.py` | Data export utilities |
| `app/ai_analytics_pro.py` | AI Analytics Pro logic |
| `app/sheets_client.py` | Google Sheets API client |
| `app/sheet_inspector.py` | Sheet inspection utilities |
| `app/attendance_import.py` | Bayzat attendance import logic |
| `app/attendance_discord.py` | Attendance Discord notifications |
| `app/cost_api.py` | Cost calculation API handlers |
| `app/daily_inventory_api.py` | Daily inventory API |
| `app/db_daily_inventory.py` | Daily inventory DB functions |
| `app/inventory_api.py` | Inventory API handlers |
| `app/inventory_db.py` | Inventory DB functions |
| `app/menu_api.py` | Menu API handlers |
| `app/menu_db.py` | Menu DB functions |
| `app/renewals_api.py` | Renewals API handlers |
| `app/incident_api.py` | Incident report API |
| `app/discord_api.py` | Discord API handlers |
| `app/discord_db.py` | Discord DB functions |
| `app/discord_webhook.py` | Discord webhook sender |
| `app/discord_templates.py` | Discord message templates |
| `app/travel_path_api.py` | Travel path API |
| `app/travel_path_default_items.py` | Travel path default items |
| `app/db_travel_path.py` | Travel path DB functions |
| `app/manila_payroll_engine.py` | Manila payroll computation engine |
| `app/pl_data_db.py` | P&L data DB functions |
| `app/pl_bucket_rollups.py` | P&L bucket rollup logic |
| `app/db_dubai_cancellations.py` | Dubai cancellations DB |
| `app/db_manila_cancellations.py` | Manila cancellations DB |
| `app/db_manila_daily_ops.py` | Manila daily ops DB |
| `app/daily_inv_default_items.py` | Daily inventory default items |

### `app/services/` Directory
| File | Purpose |
|---|---|
| `procurement_po_mail.py` | PO PDF generation + Gmail API email sending |
| `procurement_notifications.py` | Procurement notification dispatch |
| `procurement_control.py` | Procurement control logic |
| `procurement_drive_chain.py` | Procurement Drive document chain |
| `procurement_order_excel_import.py` | Excel order import |
| `procurement_stockout.py` | Stockout risk analysis |
| `procurement_curated_catalog_seed.py` | Catalog seeding |
| `proc_supplier_invoice_sync.py` | Supplier invoice sync |
| `proc_supplier_invoice_reporting.py` | Invoice reporting |
| `proc_supplier_invoice_correction.py` | Invoice correction |
| `draft_demand_planner.py` | Shift draft AI generation with attendance reliability scoring |
| `shift_sheet_sync.py` | Google Sheets shift sync |
| `evaluation_channel.py` | Staff evaluation logic |
| `backoffice_daily_evaluation.py` | Daily backoffice evaluation |
| `discord_bot_service.py` | Discord bot integration |
| `discord_reports.py` | Discord report sending |
| `foodics_sales.py` | Foodics sales data sync |
| `manila_sales_sync.py` | Manila sales sync |
| `storehub_api.py` | StoreHub API integration |
| `payroll_sync.py` | Payroll data sync |
| `pl_data_sync.py` | P&L data sync |
| `pl_excel_import.py` | P&L Excel import |
| `pl_finance_bridge.py` | P&L finance bridge |
| `pos_sync.py` | POS sync jobs |
| `cost_import.py` | Cost data import |
| `cost_invoice_price_sync.py` | Cost-to-invoice price sync |
| `cost_sheets_backup.py` | Cost sheets backup |
| `cost_source_sheet_sync.py` | Cost source sheet sync |
| `ai_coo.py` | AI COO dashboard |
| `ai_manager.py` | AI manager assistant |
| `break_even_service.py` | Break-even analysis |
| `product_scoring_service.py` | Product scoring |
| `inventory_count_sheet_excel.py` | Inventory count sheet Excel export |
| `ingestion/supplier_invoice_ingestion.py` | Supplier invoice ingestion pipeline |

### `app/integrations/`
| File | Purpose |
|---|---|
| `foodics_drive.py` | Foodics data via Google Drive |
| `foodics_parser.py` | Foodics data parser |

---

## FastAPI App Setup (`app/main.py`, lines 1–1033)

### Middleware
1. **CORS middleware** (line ~887): allows all origins with credentials
2. **Request logging middleware** (line ~907): logs all incoming requests
3. **Startup event** (line ~919): initializes APScheduler, calls all `ensure_*` table functions

### APScheduler Jobs (registered at startup)
- `05:18 UTC` — `_run_attendance_auto_sync_background`: Bayzat Drive attendance sync
- `07:18 UTC` — `_run_attendance_auto_sync_background`: Second daily sync
- Various other scheduled jobs for analytics, evaluations, etc.

### Auth Middleware Pattern
Auth is NOT handled via FastAPI middleware/dependencies. Instead, each endpoint manually validates tokens using helper functions:

#### `_require_action_from_token(token, action)`
Validates Bearer token (`Authorization: Bearer {token}`). Returns staff info dict or raises 401/403.

#### `_require_action_with_pin(approver_name, pin, city, action)`
PIN-based auth for admin actions. Used in many admin endpoints that accept `approver_name + pin` in request body. Validates against `staff` table.

#### Step-Up Token (`X-Step-Up-Token`)
Required for sensitive operations. Validated separately from the access token.

---

## All API Endpoints by Domain

### Health / Meta
```
GET  /health
GET  /debug/routes
GET  /api/admin/backend-version
OPTIONS /{rest_of_path:path}
```

### Auth
```
POST /api/auth/verify               — Login: staff_name + pin + city → access_token
GET  /api/auth/session              — Get current session info from token
POST /api/auth/refresh              — Refresh expired access token
POST /api/auth/step-up/pin          — Step-up auth with PIN
POST /api/auth/webauthn/register/options
POST /api/auth/webauthn/register/verify
POST /api/auth/webauthn/auth/options
POST /api/auth/webauthn/auth/verify
POST /api/auth/setup_pin            — Initial PIN setup
POST /api/auth/change_pin           — PIN change
```

### Shifts (Staff-facing)
```
GET  /api/shifts/view               — View shifts for a week
GET  /api/shifts/range              — Shifts in date range
GET  /api/shifts/week               — Week view data
GET  /api/shifts/my_calendar_days   — Personal calendar
GET  /api/shifts/my_month           — Personal monthly shifts
GET  /api/shifts/max_date           — Latest shift date
GET  /api/shifts/changes            — Shift change log
GET  /api/published/week            — Published week shifts
```

### Shift Change / Requests
```
POST /api/shift_change/submit
POST /api/shift_change/counterparty/respond
GET  /api/shift_change/detail
POST /api/shift_change/intent
POST /api/shift_change/confirm_manager
POST /api/shift_change/confirm_hq
```

### Draft (Admin Shift Scheduling)
```
GET  /api/draft/rows
POST /api/draft/rows/upsert
POST /api/draft/rows/delete
POST /api/draft/rows/update
POST /api/draft/rows/delete_by_id
GET  /api/draft/latest_week_start
GET  /api/draft/latest_version
GET  /api/draft/version
GET  /api/draft/branches
POST /api/draft/generate_week       — Generate draft for one week
POST /api/draft/generate_month      — Generate draft for a month
GET  /api/admin/draft/rows_for_week
GET  /api/draft/debug/draft_rows
POST /api/draft/ai_analyze          — AI analysis via Anthropic Claude
POST /api/draft/apply/prepare
POST /api/draft/apply/confirm
POST /api/draft/sheet/propose_sync  — (PENDING REMOVAL: sheet proposals)
GET  /api/draft/sheet/proposals     — (PENDING REMOVAL)
POST /api/draft/sheet/decide        — (PENDING REMOVAL)
```

### Draft Config (Admin)
```
GET  /api/admin/demand-events
POST /api/admin/demand-events
DELETE /api/admin/demand-events/{event_id}
GET  /api/admin/operating-hours
POST /api/admin/operating-hours
DELETE /api/admin/operating-hours/{record_id}
GET  /api/admin/staffing-rules
POST /api/admin/staffing-rules
DELETE /api/admin/staffing-rules/{rule_id}
GET  /api/admin/forecast-settings
POST /api/admin/forecast-settings
```

### Manual Shift Publishing (Admin)
```
POST /api/admin/shifts/manual_publish
POST /api/admin/shifts/publish_from_base
POST /api/admin/shifts/delete_published_row
POST /api/admin/shifts/bayzat_parse
```

### Staff Management
```
GET  /api/staff/names
GET  /api/admin/staff_master
POST /api/admin/staff_master/upsert
POST /api/admin/staff_master/set_gps_exempt
POST /api/admin/staff/update_info
POST /api/admin/staff_master/set_status
GET  /api/admin/staff_master/names
GET  /api/admin/staff/one
GET  /api/admin/staff/onboarding_dashboard
GET  /api/admin/staff/audit_logs
POST /api/store/staff/create
POST /api/admin/staff/seed_hq
POST /api/store/staff/setup/resend_code
POST /api/admin/staff/setup/complete-by-hq
POST /api/admin/staff/setup/reset-pin
GET  /api/store/staff/setup/pending
POST /api/admin/staff/change_role
POST /api/admin/staff/change_status
```

### Access Control / Role Management
```
GET  /api/admin/access/bootstrap
GET  /api/admin/access/channels
GET  /api/admin/access/channels/{channel_key}/role-matrix
POST /api/admin/access/channels
PUT  /api/admin/access/channels/{channel_key}/role-matrix
PATCH /api/admin/access/channels/{channel_key}
DELETE /api/admin/access/channels/{channel_key}
GET  /api/admin/access/roles
POST /api/admin/access/roles
PATCH /api/admin/access/roles/{role_key}
DELETE /api/admin/access/roles/{role_key}
GET  /api/admin/access/permissions
GET  /api/admin/access/roles/{role_key}/permissions
PUT  /api/admin/access/roles/{role_key}/permissions
GET  /api/admin/access/staff/{staff_name}/roles
POST /api/admin/access/staff/roles
POST /api/admin/access/staff/roles/primary
DELETE /api/admin/access/staff/{staff_name}/roles/{role_key}
```

### Admin Overview
```
GET  /api/admin/overview            — Shift requests + approval queue
GET  /api/admin/requests/badge      — Badge count for pending requests
GET  /api/admin/scheduled/debug     — APScheduler job status
```

### Absences
```
GET  /api/admin/absences
POST /api/admin/absences/upsert
POST /api/admin/absences/delete
```

### Private Reports
```
POST /api/private_reports/submit
GET  /api/admin/private_reports
GET  /api/admin/private_reports/badge
GET  /api/admin/private_reports/{report_id}
POST /api/admin/private_reports/reply
GET  /api/private_reports/my_inbox
POST /api/private_reports/my_inbox/read
GET  /api/admin/private_reports/badge
```

### Analytics (Admin)
```
GET  /api/admin/analytics/branch_efficiency
GET  /api/admin/analytics/branch_daily_hours
GET  /api/admin/analytics/branch_weekday_avg_hours
GET  /api/admin/analytics/staff_work_summary
GET  /api/admin/analytics/absence_summary
GET  /api/admin/analytics/city_summary
GET  /api/admin/analytics/branch_pos_map
POST /api/admin/analytics/branch_pos_map
GET  /api/admin/analytics/overtime/summary
GET  /api/admin/analytics/overtime/by_branch
GET  /api/admin/analytics/overtime/by_staff
GET  /api/admin/analytics/overtime/staff_detail
GET  /api/admin/analytics/late/by_branch
GET  /api/admin/analytics/late/by_staff
GET  /api/admin/analytics/late/staff_detail
GET  /api/admin/analytics/absence/by_branch
GET  /api/admin/analytics/absence/by_staff
GET  /api/admin/analytics/absence/staff_detail
GET  /api/admin/analytics/adherence/by_branch
GET  /api/admin/analytics/adherence/by_staff
GET  /api/admin/analytics/adherence/staff_detail
GET  /api/admin/analytics/lean_shift/by_branch
```

### Dubai Analytics
```
GET  /api/admin/analytics/dubai/order-counts
POST /api/admin/analytics/dubai/order-counts/bulk-import
GET  /api/admin/analytics/dubai/order-counts/by-date
POST /api/admin/analytics/dubai/order-counts/save-day
GET  /api/admin/analytics/dubai/aggregator-ratings
GET  /api/admin/analytics/dubai/aggregator-ratings/by-brand
GET  /api/admin/analytics/dubai/aggregator-ratings/by-date
POST /api/admin/analytics/dubai/aggregator-ratings/save-day
GET  /api/admin/analytics/dubai/cancellations
GET  /api/admin/analytics/dubai/cancellations/summary
POST /api/admin/analytics/dubai/cancellations/import
GET  /api/admin/analytics/dubai/cancellations/by-date/{day}
POST /api/admin/analytics/dubai/cancellations/upsert
DELETE /api/admin/analytics/dubai/cancellations/delete
GET  /api/admin/analytics/dubai/low-ratings
GET  /api/admin/analytics/dubai/low-ratings/summary
POST /api/admin/analytics/dubai/low-ratings
PUT  /api/admin/analytics/dubai/low-ratings/{row_id}
DELETE /api/admin/analytics/dubai/low-ratings/{row_id}
```

### Manila Analytics
```
GET  /api/admin/analytics/manila/aggregator-ratings
GET  /api/admin/analytics/manila/aggregator-ratings/by-date
POST /api/admin/analytics/manila/aggregator-ratings/save-day
GET  /api/admin/analytics/manila/aggregator-ratings/available-dates
POST /api/admin/analytics/manila/aggregator-ratings/bulk-import
POST /api/admin/analytics/manila/sales/sync
GET  /api/admin/analytics/manila/sales/data-check
GET  /api/admin/analytics/manila/sales/overview
GET  /api/admin/analytics/manila/sales/by-product
GET  /api/admin/analytics/manila/sales/by-channel
GET  /api/admin/analytics/manila/sales/by-category
GET  /api/admin/analytics/manila/sales/by-payment-method
GET  /api/admin/analytics/manila/sales/product-trend
GET  /api/admin/analytics/manila/sales/hourly
GET  /api/admin/analytics/manila/sales/grab-offline-hours
GET  /api/admin/analytics/manila/sales/grab-peak-hour-daily
GET  /api/admin/analytics/manila/sales/foodpanda-ops
GET  /api/admin/analytics/manila/sales/foodpanda-offline-monthly
POST /api/admin/analytics/manila/grab-offline/sync
GET  /api/admin/analytics/manila/order-counts
GET  /api/admin/analytics/manila/monthly-history
GET  /api/admin/analytics/manila/order-counts/manual-offline/by-date
POST /api/admin/analytics/manila/order-counts/manual-offline/save-day
GET  /api/admin/analytics/manila/daily-sales
POST /api/admin/analytics/manila/daily-sales/import
GET  /api/admin/analytics/manila/daily-sales/by-date/{sale_date}
POST /api/admin/analytics/manila/daily-sales/upsert
GET  /api/admin/analytics/manila/cancellations
GET  /api/admin/analytics/manila/cancellations/summary
POST /api/admin/analytics/manila/cancellations/import
GET  /api/admin/analytics/manila/cancellations/by-date/{day}
POST /api/admin/analytics/manila/cancellations/upsert
DELETE /api/admin/analytics/manila/cancellations/delete
GET  /api/admin/analytics/manila/cashier-evaluations
POST /api/admin/analytics/manila/cashier-evaluations/import
GET  /api/admin/analytics/manila/cashier-evaluations/by-date/{eval_date}
POST /api/admin/analytics/manila/cashier-evaluations/upsert
DELETE /api/admin/analytics/manila/cashier-evaluations/delete
GET  /api/admin/analytics/manila/low-ratings
GET  /api/admin/analytics/manila/low-ratings/summary
GET  /api/admin/analytics/manila/low-ratings/trend
POST /api/admin/analytics/manila/low-ratings
PUT  /api/admin/analytics/manila/low-ratings/{row_id}
DELETE /api/admin/analytics/manila/low-ratings/{row_id}
POST /api/admin/analytics/low-ratings/bulk-import
GET  /api/admin/analytics/manila/baseroll-prep
GET  /api/admin/analytics/manila/baseroll-map
POST /api/admin/analytics/manila/baseroll-map
DELETE /api/admin/analytics/manila/baseroll-map/{row_id}
PATCH /api/admin/analytics/manila/baseroll-map/{row_id}/toggle
GET  /api/admin/analytics/manila/pos/search
GET  /api/admin/analytics/manila/pos/transaction/{or_no}
GET  /api/admin/analytics/manila/pos/discount-summary
GET  /api/admin/analytics/manila/pos/senior-analysis
```

### POS Sync
```
POST /api/admin/pos/sales/drive/sync
POST /api/admin/pos/hourly/drive/sync
POST /api/admin/pos/operation-time/drive/sync
POST /api/admin/pos/product-mix/drive/sync
POST /api/admin/pos/sync/start
POST /api/admin/pos/sync/reimport-dates
GET  /api/admin/pos/sync-jobs/{job_id}
GET  /api/admin/pos/sync-jobs/latest-active
GET  /api/admin/pos/sales/daily
GET  /api/admin/pos/analytics/latest-coverage
GET  /api/admin/pos/analytics/data-check
GET  /api/admin/pos/hourly/analytics
GET  /api/admin/pos/operation-time
GET  /api/admin/pos/cancel-orders
GET  /api/admin/pos/items/ranking
GET  /api/admin/pos/product-mix
GET  /api/admin/pos/branches/orders
GET  /api/admin/pos/brands/orders
GET  /api/admin/pos/branches/daily
```

### StoreHub
```
POST /api/admin/storehub/sync
GET  /api/admin/storehub/stores
```

### AI Analytics
```
POST /api/ai/analytics/consult
POST /api/ai/analytics/chat-pro
POST /api/ai/analytics/snapshots
GET  /api/ai/analytics/snapshots
GET  /api/ai/analytics/snapshots/{snapshot_id}
DELETE /api/ai/analytics/snapshots/{snapshot_id}
```

### Attendance (Staff-facing)
```
GET  /api/attendance/today
GET  /api/attendance/wfh_status
POST /api/attendance/wfh_declare
POST /api/attendance/action/options
POST /api/attendance/action/verify
GET  /api/attendance/visits/today
POST /api/attendance/corrections
```

### Attendance (Admin)
```
GET  /api/admin/attendance/branch-gps
PUT  /api/admin/attendance/branch-gps/{city}/{branch_code}
DELETE /api/admin/attendance/branch-gps/{city}/{branch_code}
GET  /api/admin/attendance/sessions
GET  /api/admin/attendance/daily-report
GET  /api/admin/attendance/session-meta
GET  /api/admin/attendance/no-shows
PATCH /api/admin/attendance/sessions/{session_id}
DELETE /api/admin/attendance/sessions/{session_id}
DELETE /api/admin/attendance/bayzat/{record_id}
GET  /api/admin/attendance/corrections
PATCH /api/admin/attendance/corrections/{correction_id}
GET  /api/admin/attendance/history
GET  /api/admin/attendance/latest-coverage
GET  /api/admin/attendance/auto-sync/status
GET  /api/admin/attendance/comparison
GET  /api/admin/attendance/comparison-summary
GET  /api/admin/attendance/comparison-no-show
GET  /api/admin/attendance/comparison-missing-checkin
GET  /api/admin/attendance/comparison-missing-checkout
GET  /api/admin/attendance/comparison-unscheduled
GET  /api/admin/attendance/locations
POST /api/admin/attendance/locations/upsert-mapping
GET  /api/admin/attendance/employee-matches
POST /api/admin/attendance/employee-matches/upsert
GET  /api/admin/attendance/schedule-policy
POST /api/admin/attendance/schedule-policy/upsert
POST /api/admin/attendance/schedule-policy/deactivate
GET  /api/admin/attendance/dashboard
GET  /api/admin/attendance/alias-suggestions
POST /api/admin/attendance/alias-approve
POST /api/admin/attendance/alias-auto-apply
GET  /api/admin/attendance/anomalies
POST /api/admin/attendance/report-discord
GET  /api/admin/attendance/store-ranking
GET  /api/admin/attendance/coo-dashboard
GET  /api/admin/attendance/coo-dashboard-v2
GET  /api/admin/attendance/coo-dashboard-v3
GET  /api/admin/attendance/coo-dashboard-v4
GET  /api/admin/attendance/coo-dashboard-v5
GET  /api/admin/attendance/monthly-summary
GET  /api/admin/attendance/drive/sources
POST /api/admin/attendance/drive/sources
GET  /api/admin/attendance/drive/files
POST /api/admin/attendance/drive/sync
POST /api/admin/attendance/drive/sync-all
GET  /api/admin/attendance/import-batches
GET  /api/admin/attendance/import-batches/{import_batch_id}
POST /api/admin/attendance/import-json
POST /api/admin/attendance/import-batches/{import_batch_id}/rollback
```

### Procurement
See API_MAP.md for the complete procurement endpoint listing. Overview:
- Requests: CRUD + submit + evaluate
- Cases: CRUD + claim + approve + reject + return + escalate + message + documents
- Purchase Orders: list + create + bulk-create-send + email + delivery status
- PO Email: open tracking pixel, confirm receipt
- Receiving: create + confirm + void + delete
- CK Dispatch: pending + dispatch
- CK Production: pending + dispatch
- CK Receiving: pending + confirm
- Direct Purchase: CRUD + verify
- Claims: CRUD + assign + resolve + escalate
- Invoices: CRUD + match + upload
- Payments: queue + hold + release + execute
- Vendors: list + upsert + delete
- Items: list + upsert
- Catalog: curated items CRUD + supplier operations
- Delivery Addresses: list + upsert + delete
- Delivery Schedule: list + upsert + delete
- Approval Matrix: get + upsert
- Exceptions: list + review
- KPI: dashboard + staff + summary + recompute
- Risk Lab: get + upsert
- Whitelist: list + upsert
- Stockout: risks + recompute
- Audit Logs: list
- Improvements: list + upsert
- Scorecards: various
- Order Grid: submit + item-history
- Import: orders-excel endpoints
- Supplier Invoices: intelligence endpoints
- Price Checks: po-variance + item-price-changes

### Finance / P&L
```
GET  /api/admin/finance/labor-ratio
GET  /api/admin/finance/pl-vs-target
GET  /api/admin/finance/break-even
POST /api/admin/pl/sync/from-google
GET  /api/admin/pl/snapshot
GET  /api/admin/pl/allocation
PUT  /api/admin/pl/allocation
POST /api/admin/pl/import/excel
```

### Payroll (Dubai)
```
GET  /api/admin/payroll/cycles
POST /api/admin/payroll/cycles
PATCH /api/admin/payroll/cycles/{cycle_id}/close
PATCH /api/admin/payroll/cycles/{cycle_id}/reopen
GET  /api/admin/payroll/salary-configs
PUT  /api/admin/payroll/salary-configs
DELETE /api/admin/payroll/salary-configs/{staff_name}
GET  /api/admin/payroll/table
GET  /api/admin/payroll/adjustments
POST /api/admin/payroll/adjustments
PATCH /api/admin/payroll/adjustments/{adj_id}
DELETE /api/admin/payroll/adjustments/{adj_id}
GET  /api/admin/payroll/runs
POST /api/admin/payroll/runs
POST /api/admin/payroll/runs/{run_id}/finalize
GET  /api/admin/payroll/runs/{run_id}/records
GET  /api/admin/payroll/runs/{run_id}/payslip/{staff_name}
GET  /api/admin/payroll/payments
PUT  /api/admin/payroll/payments/{staff_name}
POST /api/admin/payroll/payments/batch
GET  /api/admin/payroll/loans
POST /api/admin/payroll/loans
GET  /api/admin/payroll/loans/{loan_id}
PATCH /api/admin/payroll/loans/{loan_id}/approve
PATCH /api/admin/payroll/loans/{loan_id}/reject
PATCH /api/admin/payroll/loans/{loan_id}/disburse
PATCH /api/admin/payroll/loans/{loan_id}/cancel
GET  /api/admin/payroll/loans/{loan_id}/repayments
POST /api/admin/payroll/loans/apply-to-cycle
GET  /api/admin/payroll/leave-salary
POST /api/admin/payroll/leave-salary
GET  /api/admin/payroll/leave-salary/daily-rate
GET  /api/admin/payroll/leave-salary/{req_id}
POST /api/admin/payroll/leave-salary/{req_id}/approve
POST /api/admin/payroll/leave-salary/{req_id}/reject
POST /api/admin/payroll/leave-salary/{req_id}/pay
POST /api/admin/payroll/leave-salary/{req_id}/cancel
POST /api/admin/payroll/drive/sync
GET  /api/admin/payroll/staff
POST /api/admin/payroll/cycles/{cycle_id}/publish-all
POST /api/admin/payroll/cycles/{cycle_id}/unpublish-all
```

### Payroll (Manila)
```
GET  /api/admin/manila-payroll/periods
POST /api/admin/manila-payroll/periods
PATCH /api/admin/manila-payroll/periods/{period_id}/status
POST /api/admin/manila-payroll/periods/{period_id}/compute
POST /api/admin/manila-payroll/runs/{run_id}/compute
GET  /api/admin/manila-payroll/periods/{period_id}/runs
GET  /api/admin/manila-payroll/runs/{run_id}/items
POST /api/admin/manila-payroll/runs/{run_id}/items
DELETE /api/admin/manila-payroll/items/{item_id}
POST /api/admin/manila-payroll/runs/{run_id}/approve
POST /api/admin/manila-payroll/runs/{run_id}/pay
POST /api/admin/manila-payroll/runs/{run_id}/publish
POST /api/admin/manila-payroll/runs/{run_id}/unpublish
POST /api/admin/manila-payroll/periods/{period_id}/publish-all
GET  /api/admin/manila-payroll/staff-profiles
PUT  /api/admin/manila-payroll/staff-profiles/{staff_name}
GET  /api/admin/manila-payroll/gov-tables
POST /api/admin/manila-payroll/gov-tables/{table_name}
POST /api/admin/manila-payroll/sss/upload
POST /api/admin/manila-payroll/bir/upload
GET  /api/admin/manila-payroll/allowance-types
POST /api/admin/manila-payroll/allowance-types
PATCH /api/admin/manila-payroll/allowance-types/{type_id}
GET  /api/admin/manila-payroll/holidays/{year}
POST /api/admin/manila-payroll/holidays
DELETE /api/admin/manila-payroll/holidays/{holiday_id}
GET  /api/admin/manila-payroll/settings
PUT  /api/admin/manila-payroll/settings/{key}
GET  /api/admin/manila-payroll/sil-balances
POST /api/admin/manila-payroll/sil-balances/init-year
POST /api/admin/manila-payroll/sil-balances/{sil_id}/convert
GET  /api/admin/manila-payroll/attendance/{period_id}
PUT  /api/admin/manila-payroll/attendance/{staff_name}/{work_date}
POST /api/admin/manila-payroll/attendance/bulk-upload
GET  /api/admin/manila-payroll/adjustments
POST /api/admin/manila-payroll/adjustments
DELETE /api/admin/manila-payroll/adjustments/{adj_id}
POST /api/admin/manila-payroll/staff-profiles/auto-match
POST /api/admin/manila-payroll/sync-dtr
GET  /api/admin/manila-payroll/compliance/minimum-wage
```

### My Pay (Staff)
```
GET  /api/admin/payroll/my-pay/summary
GET  /api/admin/payroll/my-pay/payslips
GET  /api/admin/payroll/my-pay/adjustments
GET  /api/admin/payroll/my-pay/loans
GET  /api/admin/payroll/my-pay/leave-salary
```

### QC / Evaluation
```
GET  /api/admin/qc/scores
GET  /api/admin/qc/summary
GET  /api/admin/qc/order-totals
GET  /api/admin/qc/channels
POST /api/admin/qc/channels
POST /api/admin/qc/score-manual
GET  /api/admin/evaluation/summary
GET  /api/admin/evaluation/stores
GET  /api/admin/evaluation/timeline
GET  /api/admin/evaluation/day-details
GET  /api/admin/evaluation/rules
POST /api/admin/evaluation/rules
GET  /api/admin/evaluation/settings
POST /api/admin/evaluation/settings
```

### Backoffice Evaluation
```
POST /api/admin/backoffice-evaluation/sync-from-sheet
POST /api/admin/backoffice-evaluation/bayzat-sync
GET  /api/admin/backoffice-evaluation/attendance-status
GET  /api/admin/backoffice-evaluation/summary
GET  /api/admin/backoffice-evaluation/scores
GET  /api/admin/backoffice-evaluation/detail
POST /api/admin/backoffice-evaluation/actions/upsert
GET  /api/admin/backoffice-evaluation/actions
```

### Incident Reports
```
GET  /api/incidents/badge
GET  /api/admin/incidents/badge
(Additional incident endpoints in app/incident_api.py)
```

### Notifications / Requests
```
GET  /api/request/leave-balance
POST /api/request/leave-balance
GET  /api/admin/leave-balances
PATCH /api/admin/leave-balances/{balance_id}
GET  /api/request/notifications/history
GET  /api/request/notifications/inbox
POST /api/request/notify
PATCH /api/request/notifications/{notification_id}/review
```

### Disposal / Backup
```
GET  /api/admin/disposal/items/search
POST /api/admin/disposal/report
GET  /api/admin/disposal/reports
DELETE /api/admin/disposal/report/{report_id}
PATCH /api/admin/disposal/line/{line_id}
DELETE /api/admin/disposal/line/{line_id}
POST /api/admin/backup/report
GET  /api/admin/backup/reports
DELETE /api/admin/backup/report/{report_id}
PATCH /api/admin/backup/line/{line_id}
```

### Price Check
```
GET  /api/admin/price-check/status
POST /api/admin/price-check/run
POST /api/admin/price-check/init-baseline
POST /api/admin/price-check/confirm
POST /api/admin/price-check/manual-entry
GET  /api/admin/price-check/flagged-count
GET  /api/admin/price-check/dubai/status
POST /api/admin/price-check/dubai/confirm
POST /api/admin/price-check/dubai/set-baseline
```

### Daily Report
```
POST /api/admin/daily-report/generate
GET  /api/admin/daily-report/latest
```

### Export
```
POST /api/admin/export/month/prepare
POST /api/admin/export/month/confirm
```

### Internal (Scheduler)
```
POST /api/internal/manila-auto-sync
POST /api/internal/cctv/events/bulk
```

---

## DB Connection Pattern

```python
from app.db import get_conn
conn = get_conn()
try:
    with conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(x) for x in cur.fetchall()]
finally:
    conn.close()
```

Each call opens a new connection from the pool and closes it when done.

## Table Initialization Pattern

All tables use lazy initialization via `ensure_*` functions with module-level flags:
```python
_MY_TABLE_READY = False

def ensure_my_table():
    global _MY_TABLE_READY
    if _MY_TABLE_READY:
        return
    # ...create table...
    _MY_TABLE_READY = True
```

Tables are created at startup via the FastAPI startup event, which calls all `ensure_*` functions. They also self-initialize on first use in case startup failed.
