# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For detailed documentation, see `/docs/`:
- `SYSTEM_OVERVIEW.md` — What the app does, roles, tech stack, business flows
- `FRONTEND_MAP.md` — All routes, components, auth guard patterns, design tokens
- `BACKEND_MAP.md` — All API endpoints, service files, DB patterns
- `DATABASE_SCHEMA.md` — All major tables, columns, relationships
- `API_MAP.md` — Complete API reference with request/response shapes
- `CURRENT_TASKS.md` — In-progress work, known issues, deploy procedures

---

## App Identity

This app is **"Sushi ZEN Workforce OS"** — an internal admin and analytics system for Sushi ZEN restaurant operations. The official `<title>` is "Sushi ZEN Workforce OS". It supports shift scheduling, attendance tracking, analytics, procurement, inventory, and staff management across Dubai and Manila operations.

**Do not confuse this with a generic "Sushi ZEN Shift" branding.** The Workforce OS UI with its dark slate-lavender design is the correct and current design. The `/week` page shows a lighter-themed shift viewer — these are two different UI contexts within the same app.

**UI Language Rule: All UI text must be in English.** Never use Japanese in labels, buttons, placeholders, tooltips, alerts, confirm dialogs, or any other user-facing text, unless the user explicitly requests it. This applies to every page and component in the app.

---

## Commands

```bash
# Development server
npm run dev          # starts on http://localhost:3000 (.next-dev/ cache dir in dev)

# Build (required before deploy)
npm run build

# Lint
npm run lint

# Deploy frontend — user runs this from local terminal
git add -A && git commit -m "your message"
git push origin main
# → Vercel auto-builds and deploys (GitHub integration active as of 2026-05-11)

# Emergency frontend deploy (bypass GitHub)
npx vercel --prod

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
All `/api/admin/*` calls from the browser are proxied through a single Next.js catch-all route:
`src/app/api/admin/[...slug]/route.ts`

This forwards to the Heroku backend at `https://sushizen-shift-app-038d846023bc.herokuapp.com`. In dev, it proxies to `http://127.0.0.1:8000`.

The backend URL is also set via `NEXT_PUBLIC_API_BASE_URL` env variable. `next.config.ts` rewrites `/api/:path*` → `${API_BASE}/api/:path*` for non-admin routes.

### Auth system (`src/lib/auth.ts`)
Auth state lives in `localStorage` under key `sushizen_shift_auth`. Fields:
- `staffName`, `city`, `cityLock`, `role`, `pin`, `accessToken`, `stepUpToken`
- `stepUpLevel` (aal1/aal2/phishing_resistant), `stepUpMethod`, `stepUpVerifiedAt`
- `permissions[]` — channel permission keys
- `mfa` — MFA status object

Important role logic:
- **`isAdmin(auth)`** — returns `true` only if `auth.role === "ADMIN"`. HQ is NOT admin.
- **`canAccessAdminNav(auth)`** — checks `auth.permissions[]` for channel-specific permission strings. Does NOT check role.
- **`canAccessRoleManagement(auth)`** — returns `true` only if `auth.role === "HQ"`.

NavBar shows admin items when: `isAdmin(auth) || role === "HQ" || canAccessAdminNav(auth)`.

When gating admin pages, always check both role AND permissions to avoid locking out HQ users:
```typescript
if (!canAccessAdminNav(auth) && role !== "HQ" && role !== "ADMIN") {
  router.replace("/week");
}
```

### Design system (`src/lib/ui-tokens.ts`)
All Tailwind class constants are defined here: `GLASS_CARD`, `PRIMARY_BUTTON`, `TAB_ACTIVE`, `KPI_CARD`, `T_PAGE_TITLE`, `BADGE_INFO`, etc. Import from this file rather than writing raw Tailwind strings in page files.

### Key pages
| Route | File | Purpose |
|---|---|---|
| `/week` | `src/app/week/page.tsx` | **Critical** — staff shift viewer. Never touch unintentionally. |
| `/admin` | `src/app/admin/page.tsx` | Admin dashboard with tabs (requests, ratings, order entry, etc.) |
| `/admin/analytics` | `src/app/admin/analytics/page.tsx` | Primary analytics page with compliance + summary sections |
| `/admin/draft` | `src/app/admin/draft/page.tsx` | **2524 lines** — shift draft generator with ForecastSettingsPanel, reliability analysis, and AI analysis features |
| `/admin/procurement/` | various | Full procurement system — see FRONTEND_MAP.md |
| `/admin/inventory/productions` | `src/app/admin/inventory/productions/page.tsx` | CK Production management (pending CK orders) |
| `/store/procurement/request` | `src/app/store/procurement/request/page.tsx` | Store order submission |
| `/store/ck-production` | `src/app/store/ck-production/page.tsx` | CK Dispatch page (in progress) |
| `/store/receiving` | `src/app/store/receiving/page.tsx` | CK Receiving |

---

## Key Business Flows

### CK Order Flow (Central Kitchen)
1. Store submits request with `vendor_name = "CK"` at `/store/procurement/request`
2. Backend auto-approves (`is_ck_order = TRUE`)
3. PO created; appears in `/admin/inventory/productions` as "Pending Orders"
4. CK staff dispatches: `POST /api/admin/procurement/ck-production/dispatch/{po_id}`
   - Sets `dispatched_at`, `dispatched_items_json`, `has_shortage`
5. Store receives at `/store/receiving` — checks `dispatched_items_json` for shortages
6. Admin reviews shortage flags in `/admin/procurement/ck-orders`

### Standard Procurement Flow
1. Store submits → IN_REVIEW → Approver approves → APPROVED
2. PO created → Gmail API sends PDF to vendor with confirmation link + tracking pixel
3. Vendor clicks link → `receipt_confirmed_at` set
4. Tracking pixel open → `opened_at`, `open_count` updated

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

**Vercel Deploy (as of 2026-05)**
- GitHub integration is active — `git push origin main` auto-deploys
- Cowork (Claude sandbox) cannot run git push or vercel commands — user must run from local terminal

**Emergency Rollback**
- Vercel Dashboard → Deployments → find correct deployment → "Promote to Production"
- Last known-good commit: `a5c28d2` ("Late Analysis: visual overhaul with bar charts, severity heatmap, rank badges")

---

## `admin/draft/page.tsx` — Structure and Known Issues

This is the largest and most complex page (2524 lines). Its key structural sections:

1. **Imports + constants** (lines 1–~380) — includes `DUBAI_DRAFT_SHEET_URL`, `MANILA_DRAFT_SHEET_URL`
2. **`ForecastSettingsPanel`** (line ~386) — editable multiplier/weight panel for draft generation
3. **Main component state** (line ~1020+) — includes `sheetTabMain`, `sheetTabs`, `pendingVisibleRows` (sheet proposals state — pending removal)
4. **`proposeFromSheet()`** function (line ~1692) — sheet proposals feature (pending removal)
5. **JSX: "Pending Sheet Proposals" section** (line ~2028) — sheet proposals UI (pending removal)

**Sheet proposals removal is still pending.** The following identifiers are remnants to be removed when safe:
`sheetTabMain`, `sheetTabs`, `sheetTabsBusy`, `pendingVisibleRows`, `proposeFromSheet`, `DUBAI_DRAFT_SHEET_URL` (the variable, not its value), `selectedProposalIds`.

---

## Deploy Procedures

### Frontend (Vercel) — user runs from local terminal
```bash
cd /Users/jaynishimura/Desktop/sushizen-shift-pwa
git add -A
git commit -m "your message"
git push origin main
```

### Backend (Heroku) — user runs from local terminal
```bash
cd /Users/jaynishimura/Desktop/sushizen_shift_app_clean
git add -A
git commit -m "your message"
git push heroku HEAD:master --force
```

### Cannot do from Cowork sandbox
- `git push heroku HEAD:master --force` — HTTPS to Heroku is blocked
- `vercel --prod` — Vercel CLI blocked
- Delete `.git/*.lock` files — no sandbox permission

### git index.lock error cleanup (user does this manually)
```bash
rm /Users/jaynishimura/Desktop/sushizen-shift-pwa/.git/index.lock
rm /Users/jaynishimura/Desktop/sushizen_shift_app_clean/.git/index.lock
```

### "Everything up-to-date" — not an error
Means current commit is already on Heroku. Force re-deploy if needed:
```bash
git commit --allow-empty -m "force redeploy"
git push heroku HEAD:master --force
```

### Heroku logs
```bash
heroku logs -a sushizen-shift-app -n 100
heroku logs -a sushizen-shift-app --tail
heroku logs -a sushizen-shift-app -n 100 | grep -E "attendance|sync|error" -i
```

### DB checks
```bash
heroku pg:psql -a sushizen-shift-app

# actual_attendance latest data
SELECT attendance_date, COUNT(*) FROM actual_attendance GROUP BY attendance_date ORDER BY attendance_date DESC LIMIT 10;

# attendance_drive_sources status
SELECT id, folder_id, city_hint, is_enabled, last_synced_at, last_sync_status FROM attendance_drive_sources;

# Reset DUPLICATE_HASH to re-enable auto-sync
UPDATE attendance_drive_sources SET last_sync_status = '' WHERE id = 1;
```

---

## ⚠️ Lessons Learned — DO NOT REPEAT

### 1. Never use regex scripts to remove JSX blocks
Scripts like `remove_sheet_proposals.py` and `fix_sheet_remnants.py` used overly broad regex patterns (e.g., matching `{canOperate ? (`) that silently removed the wrong JSX blocks. This destroyed features like BranchReliabilityPanel and AI analysis without any syntax error.

**Rule:** When removing sections from large TSX files, always use **line-number-based deletion** (read the file, identify exact line ranges, delete precisely) — never pattern-matched regex that could match the wrong block.

### 2. Vercel Promote to Production vs. git reset
`git reset --hard <commit> && git push --force` only rebuilds from source on the next Vercel deploy. If the wrong code has already been deployed, the previously deployed artifacts remain in production until a new push triggers a build.

**To immediately restore a prior state:** use Vercel Dashboard → Deployments → find the correct deployment → "Promote to Production". This switches the live deployment without rebuilding.

### 3. Smart quotes break TypeScript
When using the `Edit` tool with string content containing `"`, the editor may insert curly/smart quotes (`"` / `"`) instead of straight ASCII quotes. These cause TypeScript parse errors. If you see unexpected parse errors after an edit, check for smart quote substitution.

### 4. `/admin/draft` auth guard must include role check
`canAccessAdminNav()` checks permissions only — it returns `false` for `role === "HQ"` users who lack explicit permissions. Always add `|| role === "HQ"` to avoid incorrectly redirecting HQ users to `/week`.

### 5. AutoReload must always work — never break it

**This is a persistent user requirement that has been raised repeatedly.**

After a deploy, the app must automatically reload in the browser **without requiring a manual hard reload**. The mechanism is:

- `src/components/AutoReload.tsx` — polls `/api/version` every 3 seconds
- `next.config.ts` bakes `NEXT_PUBLIC_BUILD_ID = VERCEL_URL` into the client bundle at build time
- `/api/version/route.ts` returns the current `VERCEL_URL` at runtime
- When the two values differ → `hardReload()` fires → page refreshes automatically

**Rules:**
- Never remove or disable `<AutoReload />` from `LayoutShell.tsx`
- Never set `frontendBaseline.current = null` after a failed fetch — null baseline disables all poll comparisons. Only set baseline when the fetched value is non-null.
- In `check()`, if baseline is null and a poll succeeds, SET the baseline (don't compare) — this handles the case where the startup fetch failed
- Both `frontendBaseline` and `backendBaseline` must follow the same null-guard pattern
- Do not introduce ESLint errors or build failures — they result in Vercel deploying a broken build that returns 404 on all routes

### 6. CK Order vendor_name must be exactly "CK"
The string `vendor_name = "CK"` (exact, case-sensitive) triggers `is_ck_order = TRUE`. Never change the comparison logic or the canonical string.

### 7. PO tracking pixel — receipt_token must be UNIQUE
The `receipt_token` in `proc_po_email_logs` is used in the vendor-facing confirmation URL. It has a UNIQUE constraint. Generate with `uuid4()`.

---

## Bayzat Attendance Sync

### How it works
- Bayzat exports attendance xlsx to Google Drive folder `0AJRy_FdAYDp2Uk9PVA`
- Backend fetches via Drive API and stores in `actual_attendance`
- OS Attendance `daily-report` endpoint merges `actual_attendance` with WebAuthn sessions
- APScheduler runs at 05:18 UTC and 07:18 UTC (`_run_attendance_auto_sync_background`)

### Manual sync
`/admin/attendance/import` — Approver Name + PIN to access:
- **Sync All** → Drive folder full scan (recommended)
- **Individual file sync** → single file by file ID
- **Drive file list** → diagnostic: what service account can see

### Troubleshooting
1. Check `last_sync_status` in `attendance_drive_sources` — if `DUPLICATE_HASH`, reset to `''`
2. Check `actual_attendance` max date
3. Use "Drive file list" to verify service account visibility
4. Watch `heroku logs --tail` while clicking sync

---

## Backend Notes

- Backend: FastAPI on Heroku (`sushizen-shift-app`)
- Heroku Postgres is the primary DB
- `app/main.py` — all API routes (~31,500 lines)
- `app/db.py` — all DB functions (~45,700 lines)
- `app/services/draft_demand_planner.py` — draft generation with attendance reliability scoring
- `app/services/procurement_po_mail.py` — PO PDF generation + Gmail API email sending
- AI analysis for draft: `/api/draft/ai_analyze` (Anthropic Claude SDK)
- All tables use `ensure_*` lazy-init pattern with module-level flags
