# SYSTEM OVERVIEW — Sushi ZEN Workforce OS

## What This System Is

Sushi ZEN Workforce OS is an internal admin and analytics platform for Sushi ZEN restaurant operations. It is NOT a customer-facing app. It is used exclusively by:
- Staff (time-in/time-out, shift viewing, requests, pay stubs)
- Store managers and supervisors (procurement ordering, receiving, daily inventory)
- Admin/management (analytics, scheduling, payroll, procurement approval, inventory control)
- HQ (full system access including role management and advanced reporting)

The system covers: shift scheduling, attendance tracking, analytics, procurement, inventory, staff management, payroll (Manila), finance P&L, and AI-assisted operations across two cities.

---

## Two-City Operations

### Dubai
- Currency: AED
- POS: Foodics
- Attendance: Bayzat (exports xlsx to Google Drive)
- Aggregator ratings tracked separately (Talabat, etc.)
- Branches: multiple Dubai locations with store codes
- WH (Warehouse) orders tracked separately from CK (Central Kitchen) orders

### Manila
- Currency: PHP
- POS: StoreHub
- Attendance: Bayzat (same system, same Drive folder)
- Aggregator ratings tracked separately (GrabFood, Foodpanda, etc.)
- CK (Central Kitchen) is the production hub for Manila stores
- Payroll: full Manila payroll engine with SSS/PhilHealth/Pag-IBIG/BIR compliance

Both cities share the same frontend, backend, and database. City context is determined from auth (`auth.city`). Some pages and reports are city-specific; others show both.

---

## User Roles

| Role | Description |
|---|---|
| `STAFF` | Default. Access to attendance, my-shift, week view, requests. |
| `ADMIN` | Branch/store admin. Access to admin dashboard, procurement, inventory. |
| `HQ` | Highest level. Access to everything including role management, finance P&L. |
| `DUBAI_MANAGEMENT` | Dubai management. Similar to ADMIN but city-locked to Dubai. |
| `MANILA_MANAGEMENT` | Manila management. Similar to ADMIN but city-locked to Manila. |

Roles are stored in `staff` table on the backend. Permissions are a separate, granular system stored in `auth_role_permissions` (channel-based). A user can have both a role AND explicit channel permissions. The permission system overlays the role system — some pages check both.

### Key Permission Channels (examples)
- `channel.admin.dashboard.view`
- `channel.admin.procurement.view`
- `channel.admin.analytics.view`
- `channel.admin.attendance.view`
- `channel.admin.draft.view`
- `channel.admin.payroll.view`
- `channel.admin.inventory.view` / `.write`
- `channel.admin.finance.view`
- `channel.admin.staff.view`
- `channel.admin.private_reports.view`
- `channel.admin.renewals.view`
- `channel.admin.travel_path.view`
- `channel.admin.os_attendance.view`
- `channel.admin.ai_analytics_pro.view`
- `channel.admin.backoffice_evaluation.view`
- `channel.admin.incident_reports.view`
- `channel.week.view`, `channel.my_shift.view`, `channel.calendar.view`, `channel.my_pay.view`

---

## Tech Stack

### Frontend
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS with custom design tokens (dark slate-lavender)
- **Icons**: Lucide React
- **Deployment**: Vercel (GitHub integration — push to `main` auto-deploys)
- **Pattern**: All pages `"use client"` (no Server Components in use)

### Backend
- **Framework**: Python FastAPI
- **Deployment**: Heroku (app: `sushizen-shift-app`)
- **Database**: Heroku Postgres
- **Scheduler**: APScheduler (runs inside the Heroku dyno)
- **AI**: Anthropic Claude SDK (for draft analysis and AI analytics)

### Infrastructure
- **Frontend URL**: Vercel-hosted (HTTPS)
- **Backend URL**: `https://sushizen-shift-app-038d846023bc.herokuapp.com`
- **Heroku app name**: `sushizen-shift-app`
- **API proxy**: All browser `/api/admin/*` calls go through Next.js catch-all → Heroku

---

## External Integrations

### Google Drive
- **Attendance**: Bayzat exports xlsx attendance files to folder `0AJRy_FdAYDp2Uk9PVA`
- **POS Sales**: Foodics sales data synced via Drive
- **Procurement**: PO PDFs stored in Drive; document chain uploads stored in Drive
- **Payroll**: Payroll data may sync via Drive
- **Auth**: Service account credentials in environment variables

### Gmail API
- **Purpose**: Send Purchase Order emails to vendors
- **Mechanism**: Service account impersonation; sends PDF attachment with confirmation link and 1x1 tracking pixel
- **Tracking**: `proc_po_email_logs` table tracks `opened_at`, `open_count`, `receipt_confirmed_at`
- **Confirmation URL**: `GET /api/procurement/po/confirm/{receipt_token}`

### Bayzat
- HR/attendance platform used by Sushi ZEN Dubai and Manila
- Exports daily xlsx files to the shared Google Drive folder
- Backend syncs at 05:18 UTC and 07:18 UTC via APScheduler
- Manual sync available at `/admin/attendance/import`

### Foodics (Dubai POS)
- Order counts, ratings, product mix data synced from Foodics/Drive
- `app/integrations/foodics_drive.py`, `app/integrations/foodics_parser.py`

### StoreHub (Manila POS)
- Sales data synced via `app/services/storehub_api.py`
- StoreHub sync jobs tracked in DB

### Anthropic Claude
- Used for draft (shift schedule) AI analysis at `/api/draft/ai_analyze`
- Used for AI Analytics Pro (chat-pro endpoint)
- Used for COO dashboard AI summaries

### Discord
- Attendance reports sent to Discord channels
- `app/services/discord_reports.py`, `app/discord_webhook.py`
- Discord inbox reader at `/admin/discord-inbox`

---

## Deployment Topology

```
Browser
  └─> Vercel (Next.js frontend, sushizen-shift-pwa)
        ├─> /api/admin/* (catch-all proxy route.ts)
        │     └─> Heroku FastAPI backend
        │           └─> Heroku Postgres
        └─> /api/version (build ID endpoint for AutoReload)
```

### AutoReload Mechanism
- `src/components/AutoReload.tsx` polls `/api/version` every 3 seconds
- At build time: `NEXT_PUBLIC_BUILD_ID = VERCEL_URL` baked into bundle
- At runtime: `/api/version/route.ts` returns current `VERCEL_URL`
- When values differ → `hardReload()` fires → automatic page refresh after deploy
- NEVER disable this mechanism

---

## Key Business Flows

### 1. CK Order Flow (Central Kitchen)
1. Store staff submits procurement request with `vendor_name = "CK"` at `/store/procurement/request`
2. Backend auto-approves (`is_ck_order = TRUE`), status → APPROVED
3. PO created automatically; appears in `/admin/inventory/productions` as "Pending Orders"
4. CK staff marks items IN_PRODUCTION
5. CK dispatches: `POST /api/admin/procurement/ck-production/dispatch/{po_id}`
   - Records `dispatched_items_json`, `has_shortage`, `dispatched_at`
6. Store receives: `/store/receiving` — checks `dispatched_items_json`
7. Admin reviews shortage flags in `/admin/procurement/ck-orders`

### 2. Standard Procurement Flow
1. Store submits request at `/store/procurement/request` (vendor = third-party supplier)
2. Status: DRAFT → IN_REVIEW
3. Approver sees it in approval queue; evaluates against approval matrix
4. Status: APPROVED → PO created
5. Email sent to vendor (Gmail API) with PDF attachment + confirmation link
6. Vendor clicks confirmation link → `receipt_confirmed_at` set
7. Vendor opens tracking pixel → `opened_at`, `open_count` updated
8. Delivery received at store; admin confirms receiving
9. Invoice matched; payment queued, executed

### 3. Direct Purchase Flow (Mariano / Philippines)
1. Mariano (designated buyer) enters purchase at `/store/purchase`
2. Admin reviews at `/admin/procurement/direct-purchases`
3. Admin verifies: `POST /api/admin/procurement/direct-purchases/{id}/verify`

### 4. Attendance Sync Flow
1. Bayzat exports xlsx attendance files to Google Drive folder `0AJRy_FdAYDp2Uk9PVA`
2. APScheduler calls `_run_attendance_auto_sync_background` at 05:18 UTC and 07:18 UTC
3. Backend fetches files via Drive API, parses xlsx, stores in `actual_attendance`
4. Daily report endpoint merges `actual_attendance` with WebAuthn sessions
5. Manual sync available at `/admin/attendance/import`

### 5. Shift Draft Flow
1. Admin opens `/admin/draft`
2. Configures ForecastSettingsPanel (multipliers, weights)
3. Clicks generate → `POST /api/draft/generate_month` or `generate_week`
4. Backend runs `generate_demand_based_month_draft()` with attendance reliability scoring
5. Draft rows saved to DB; admin edits
6. AI analysis: `POST /api/draft/ai_analyze` → Anthropic Claude
7. Admin applies draft: prepare + confirm endpoints
8. Published shifts appear in `/week` for staff

### 6. Payroll Flow (Manila)
1. Admin creates payroll period at `/admin/payroll/manila`
2. Syncs DTR (Daily Time Records) from attendance data
3. Computes payroll runs with SSS/PhilHealth/Pag-IBIG deductions
4. Adjustments entered; loans applied
5. Runs approved and published
6. Staff see payslips at `/my-pay`
