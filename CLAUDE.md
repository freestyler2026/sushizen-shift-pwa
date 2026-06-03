# CLAUDE.md

This is the **primary instruction file** for Claude sessions working on this repository.
Read this file first. Then load only the specific `docs/ai/` file relevant to your task — do NOT load all docs at once.

---

## 📂 Documentation Index — Load On Demand

Detailed references live in `docs/ai/`. Load only what you need for the current task:

| File | When to load |
|---|---|
| `docs/ai/SYSTEM_OVERVIEW.md` | Understanding overall architecture, roles, business flows, external integrations |
| `docs/ai/FRONTEND_MAP.md` | Working on any frontend page, component, route, or NavBar |
| `docs/ai/BACKEND_MAP.md` | Working on backend endpoints, services, auth middleware |
| `docs/ai/DATABASE_SCHEMA.md` | Querying or modifying DB tables, understanding schema |
| `docs/ai/API_MAP.md` | Writing API calls, finding endpoint paths or request/response shapes |
| `docs/ai/CURRENT_TASKS.md` | Starting a new session — see pending tasks, known issues, deploy state |

**Rule:** Start every session by reading `CURRENT_TASKS.md` to understand where things left off. Then load only the additional doc(s) needed for the specific task.

---

## App Identity

This app is **"Sushi ZEN Workforce OS"** — an internal admin and analytics system for Sushi ZEN restaurant operations. The official `<title>` is "Sushi ZEN Workforce OS". It supports shift scheduling, attendance tracking, analytics, procurement, inventory, and staff management across Dubai and Manila operations.

**Do not confuse this with a generic "Sushi ZEN Shift" branding.** The Workforce OS UI with its dark slate-lavender design is the correct and current design. The `/week` page shows a lighter-themed shift viewer — these are two different UI contexts within the same app.

**UI Language Rule: All UI text must be in English.** Never use Japanese in labels, buttons, placeholders, tooltips, alerts, confirm dialogs, or any other user-facing text, unless the user explicitly requests it.

---

## Commands

```bash
# Development server
npm run dev          # starts on http://localhost:3000

# Build (required before deploy)
npm run build

# Lint
npm run lint

# Deploy frontend — user runs this from local terminal
git add -A && git commit -m "your message"
git push origin main
# → Vercel auto-builds and deploys

# Deploy backend to Heroku — user runs this from local terminal (NOT from Cowork sandbox)
cd ../sushizen_shift_app_clean
git add -A && git commit -m "your message"
git push heroku HEAD:master --force

# Heroku logs
heroku logs -a sushizen-shift-app -n 200

# Heroku Postgres shell
heroku pg:psql -a sushizen-shift-app
```

---

## Architecture Overview

### Monorepo structure
- **`sushizen-shift-pwa/`** — Next.js 15 App Router frontend (this repo)
- **`sushizen_shift_app_clean/`** — Python FastAPI backend on Heroku (`sushizen-shift-app`)

### Frontend: Next.js 15 App Router, all pages are `"use client"`
- `src/app/` — route-based pages
- `src/components/` — shared components
- `src/lib/` — utilities and clients

### API proxy architecture
All `/api/admin/*` calls from the browser are proxied through:
`src/app/api/admin/[...slug]/route.ts` → Heroku backend at `https://sushizen-shift-app-038d846023bc.herokuapp.com`

In dev, proxies to `http://127.0.0.1:8000`. Non-admin routes use `next.config.ts` rewrites.

### Auth system (`src/lib/auth.ts`)
Auth state lives in `localStorage` under key `sushizen_shift_auth`. Fields:
- `staffName`, `city`, `cityLock`, `role`, `pin`, `accessToken`, `stepUpToken`
- `stepUpLevel`, `stepUpMethod`, `stepUpVerifiedAt`
- `permissions[]` — channel permission keys
- `mfa` — MFA status object

Important role logic:
- **`isAdmin(auth)`** — `true` only if `auth.role === "ADMIN"`. HQ is NOT admin.
- **`canAccessAdminNav(auth)`** — checks `permissions[]`. Does NOT check role.
- **`canAccessRoleManagement(auth)`** — `true` only if `auth.role === "HQ"`.

NavBar shows admin items when: `isAdmin(auth) || role === "HQ" || canAccessAdminNav(auth)`.

When gating admin pages, always check both role AND permissions:
```typescript
if (!canAccessAdminNav(auth) && role !== "HQ" && role !== "ADMIN") {
  router.replace("/week");
}
```

### Design system (`src/lib/ui-tokens.ts`)
All Tailwind class constants: `GLASS_CARD`, `PRIMARY_BUTTON`, `TAB_ACTIVE`, `KPI_CARD`, `T_PAGE_TITLE`, `BADGE_INFO`, etc. Always import from here — never write raw Tailwind strings in page files.

### Key pages
| Route | File | Purpose |
|---|---|---|
| `/week` | `src/app/week/page.tsx` | **Critical** — staff shift viewer. Never touch unintentionally. |
| `/admin` | `src/app/admin/page.tsx` | Admin dashboard |
| `/admin/analytics` | `src/app/admin/analytics/page.tsx` | Compliance + analytics |
| `/admin/draft` | `src/app/admin/draft/page.tsx` | **2524 lines** — shift draft generator |
| `/admin/procurement/` | various | Full procurement system |
| `/admin/inventory/productions` | `src/app/admin/inventory/productions/page.tsx` | CK Production |
| `/admin/procurement/delivery-addresses` | `src/app/admin/procurement/delivery-addresses/page.tsx` | Branch address management |
| `/store/procurement/request` | `src/app/store/procurement/request/page.tsx` | Store order submission |
| `/store/purchase` | `src/app/store/purchase/page.tsx` | Direct purchase (Mariano) |
| `/store/ck-production` | `src/app/store/ck-production/page.tsx` | CK Dispatch (in progress) |
| `/store/receiving` | `src/app/store/receiving/page.tsx` | CK Receiving |

---

## Key Business Flows

### CK Order Flow (Central Kitchen)
1. Store submits with `vendor_name = "CK"` at `/store/procurement/request`
2. Backend auto-approves (`is_ck_order = TRUE`) — vendor_name "CK" or "Central Kitchen" both recognized
3. PO created; appears in `/admin/inventory/productions` as "Pending Orders"
4. CK staff dispatches: `POST /api/admin/procurement/ck-production/dispatch/{po_id}`
   - Sets `dispatched_at`, `dispatched_items_json`, `has_shortage`
5. Store receives at `/store/receiving` — checks `dispatched_items_json` for shortages
6. Admin reviews shortage flags in `/admin/procurement/ck-orders`

### Standard Procurement Flow
1. Store submits → IN_REVIEW → Approver approves → APPROVED
2. PO created → Gmail API sends PDF to vendor with confirmation link + open tracking pixel
3. Vendor opens email → `opened_at`, `open_count` updated (1×1 GIF pixel)
4. Vendor clicks confirm link → `receipt_confirmed_at` set → status RECEIVED_CONFIRMED

### Direct Purchase Flow
1. Mariano enters at `/store/purchase`
2. Admin reviews at `/admin/procurement/direct-purchases`
3. Admin verifies: `POST /api/admin/procurement/direct-purchases/{id}/verify`

### Attendance Sync Flow
1. Bayzat exports xlsx to Google Drive folder `0AJRy_FdAYDp2Uk9PVA`
2. APScheduler syncs at 05:18 UTC and 07:18 UTC
3. Manual sync: `/admin/attendance/import` → "Sync All" button

---

## Critical State: Git & Vercel

- GitHub integration active — `git push origin main` auto-deploys to Vercel
- Cowork (Claude sandbox) cannot run `git push heroku` or `vercel` commands — user must run from local terminal

**Emergency Rollback:** Vercel Dashboard → Deployments → find correct deployment → "Promote to Production"

---

## `admin/draft/page.tsx` — Known Issues

Largest page (2524 lines). Sheet proposals removal still pending. Identifiers to remove when safe:
`sheetTabMain`, `sheetTabs`, `sheetTabsBusy`, `pendingVisibleRows`, `proposeFromSheet`, `DUBAI_DRAFT_SHEET_URL` (variable only), `selectedProposalIds`.

---

## Deploy Procedures

### Frontend (Vercel) — user runs from local terminal
```bash
cd /Users/jaynishimura/Desktop/sushizen-shift-pwa
git add -A && git commit -m "your message" && git push origin main
```

### Backend (Heroku) — user runs from local terminal
```bash
cd /Users/jaynishimura/Desktop/sushizen_shift_app_clean
git add -A && git commit -m "your message"
git push heroku HEAD:master --force
```

### Cannot do from Cowork sandbox
- `git push heroku HEAD:master --force` — HTTPS to Heroku is blocked
- `vercel --prod` — Vercel CLI blocked

### git index.lock cleanup (user runs manually)
```bash
rm /Users/jaynishimura/Desktop/sushizen-shift-pwa/.git/index.lock
rm /Users/jaynishimura/Desktop/sushizen_shift_app_clean/.git/index.lock
```

### Heroku diagnostics
```bash
heroku logs -a sushizen-shift-app -n 100 | grep -E "error|attendance|sync" -i
heroku pg:psql -a sushizen-shift-app

# Reset duplicate hash to re-enable auto-sync
UPDATE attendance_drive_sources SET last_sync_status = '' WHERE id = 1;
```

---

## ⚠️ Lessons Learned — DO NOT REPEAT

### 1. Never use regex to remove JSX blocks
Use **line-number-based deletion** only (read file → identify exact line range → delete precisely). Regex silently destroyed BranchReliabilityPanel and AI analysis features.

### 2. Vercel: Promote to Production, not git reset
`git reset --force` only takes effect on next build. To instantly restore: Vercel Dashboard → Deployments → "Promote to Production".

### 3. Smart quotes break TypeScript
`Edit` tool may insert `"` / `"` instead of `"`. Always check for this after edits if you see unexpected parse errors.

### 4. `/admin/draft` auth guard must include role check
`canAccessAdminNav()` returns `false` for HQ users without explicit permissions. Always add `|| role === "HQ"`.

### 5. AutoReload must always work — never break it
- `src/components/AutoReload.tsx` polls `/api/version` every 3 seconds
- Never remove `<AutoReload />` from `LayoutShell.tsx`
- Never set `frontendBaseline.current = null` after a failed fetch
- Build failures → Vercel deploys broken build → 404 on all routes

### 6. CK Order vendor_name recognition
`vendor_name = "CK"` (exact) OR containing "central kitchen" (case-insensitive) both trigger `is_ck_order = TRUE`. All three detection points must agree: `is_ck_by_vendor` in main.py, `is_ck_procurement_request()` in db.py, `get_ck_pending_requests()` in inventory_db.py.

### 7. PO tracking pixel — receipt_token must be UNIQUE
The `receipt_token` in `proc_po_email_logs` has a UNIQUE constraint. Generate with `os.urandom(24)` base64.

### 8. Branch Delivery Addresses
Managed in `proc_branch_delivery_addresses` table (DB-primary) with hardcoded fallback in `procurement_po_mail.py`. `suggested_delivery_address()` checks DB first, then falls back. UI: `/admin/procurement/delivery-addresses`.

---

## Bayzat Attendance Sync

- Bayzat exports xlsx to Google Drive folder `0AJRy_FdAYDp2Uk9PVA`
- Backend fetches via Drive API → stores in `actual_attendance`
- APScheduler: 05:18 UTC + 07:18 UTC (`_run_attendance_auto_sync_background`)
- Manual sync: `/admin/attendance/import` → "Sync All"
- Troubleshoot: check `last_sync_status` in `attendance_drive_sources`; reset `DUPLICATE_HASH` → `''`

---

## Backend Notes

- Backend: FastAPI on Heroku (`sushizen-shift-app`)
- Heroku Postgres primary DB
- `app/main.py` — all API routes (~24,000+ lines)
- `app/db.py` — all DB functions (~14,800+ lines)
- `app/inventory_db.py` — inventory DB functions
- `app/services/procurement_po_mail.py` — PO PDF generation + Gmail API
- `app/services/draft_demand_planner.py` — AI draft generation
- AI analysis: `/api/draft/ai_analyze` (Anthropic Claude SDK)
- All tables use `ensure_*` lazy-init pattern with module-level lock flags
