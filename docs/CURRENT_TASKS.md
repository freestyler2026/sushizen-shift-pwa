# CURRENT TASKS — Sushi ZEN Workforce OS

Last updated: 2026-06-03

---

## Overview of Current State

The system is deployed and operational. The main areas of active development are:
1. CK (Central Kitchen) order flow completion
2. Store-facing pages for CK interaction
3. NavBar CK link addition
4. Minor cleanup of sheet proposals remnants in admin/draft

---

## In Progress Tasks

### Task #10 — Travel Path Frontend
**Status**: In progress
**Description**: Build `/admin/travel-path/page.tsx` frontend
**File**: `src/app/admin/travel-path/page.tsx`
**Backend**: `app/travel_path_api.py`, `app/db_travel_path.py`
**Note**: Auth guard must use `canAccessTravelPathAdmin(auth)` from `src/lib/auth.ts`

### Task #36 — `/store/ck-production/` page
**Status**: In progress
**Description**: Build the CK Dispatch page for CK kitchen staff
**File**: `src/app/store/ck-production/page.tsx`
**Backend endpoint**: `GET /api/admin/procurement/ck-production/pending` + `POST /api/admin/procurement/ck-production/dispatch/{po_id}`
**Dispatch body**:
```json
{
  "dispatched_by": "string",
  "pin": "string",
  "dispatched_items": [
    {
      "item_name": "string",
      "qty_ordered": 0,
      "qty_dispatched": 0,
      "has_shortage": false
    }
  ],
  "delivery_note": "",
  "delivery_photo_url": ""
}
```
**This endpoint sets**: `dispatched_at`, `dispatched_items_json`, `has_shortage`, `dispatched_by` on `proc_purchase_orders`

### Task #37 — Update `/store/receiving/` for dispatched_items_json
**Status**: In progress
**Description**: Update the store receiving page to show dispatched items from `dispatched_items_json` and flag shortages
**File**: `src/app/store/receiving/page.tsx`
**Backend endpoint**: `GET /api/admin/procurement/ck-receiving/pending` + `POST /api/admin/procurement/ck-receiving/confirm`
**Key fields from PO**: `dispatched_items_json`, `has_shortage`, `dispatched_at`

### Task #38 — Update `/admin/procurement/ck-orders/` for shortage flags
**Status**: In progress
**Description**: Add shortage flag display in the admin CK orders page
**File**: `src/app/admin/procurement/ck-orders/page.tsx`
**Shows**: `has_shortage` badge, comparison of ordered vs dispatched quantities from `dispatched_items_json`

### Task #39 — Add CK Production link to NavBar
**Status**: In progress
**Description**: Add `/store/ck-production` to the NavBar's `SECONDARY_BASE` items
**File**: `src/components/NavBar.tsx`
**Note**: The link `{ href: "/store/ck-production", label: "CK Dispatch", icon: Truck }` should already be in SECONDARY_BASE (check NavBar.tsx lines around 124-128 — it was added)

---

## Completed Recently

### Branch Delivery Addresses
**Status**: DONE (both frontend and backend)
- Backend table: `proc_branch_delivery_addresses` (city, store_code, display_name, address)
- Backend endpoints: GET/POST/DELETE `/api/admin/procurement/delivery-addresses`
- Frontend: `src/app/admin/procurement/delivery-addresses/page.tsx`
- Used in PO creation to auto-fill delivery address field

### CK Order Detection Fix
**Status**: DONE
- `vendor_name = "CK"` is now correctly recognized as a Central Kitchen order (`is_ck_order = TRUE`)
- Was broken by a regex/pattern change; fixed by ensuring exact string match

### CK Dispatch Feature (Backend)
**Status**: DONE
- `proc_purchase_orders` now has: `dispatched_at`, `dispatched_by`, `dispatched_items_json`, `has_shortage`, `delivery_note`, `delivery_photo_url`
- Endpoint: `POST /api/admin/procurement/ck-production/dispatch/{po_id}`
- Index on `dispatched_at` and `has_shortage`

### PO Email Open Tracking
**Status**: DONE
- `proc_po_email_logs` now has `opened_at`, `open_count`
- Tracking pixel: `GET /api/procurement/po/open/{receipt_token}` returns 1x1 GIF
- Vendor confirmation: `GET /api/procurement/po/confirm/{receipt_token}` returns HTML

### PO PDF Word-Wrap Fix
**Status**: DONE
- Long vendor names and delivery addresses now word-wrap in the PDF
- Fix in `app/services/procurement_po_mail.py`

---

## Known Issues / Debt

### Sheet Proposals Remnants in admin/draft
**File**: `src/app/admin/draft/page.tsx`
**Status**: Pending removal (NOT YET DONE)
**Identifiers to remove**:
- `sheetTabMain` (state variable)
- `sheetTabs` (state variable)
- `sheetTabsBusy` (state variable)
- `pendingVisibleRows` (state variable)
- `selectedProposalIds` (state variable)
- `proposeFromSheet` function (around line ~1692)
- "Pending Sheet Proposals" JSX section (around line ~2028)
- `DUBAI_DRAFT_SHEET_URL` variable (the variable declaration, not the URL value itself)

**CRITICAL WARNING**: Do NOT use regex/pattern removal. Always use line-number-based deletion:
1. Read the file
2. Find exact line ranges for each block
3. Use the Edit tool with precise old_string matches

### Backend main.py Duplicate Route Definitions
**Note**: Some procurement endpoints appear twice in main.py (e.g., at lines ~20919 and ~24745 for vendor upsert). This is because the file was extended with additional route registrations. The later definitions may shadow the earlier ones. Confirm which is active before modifying.

### `git push heroku` Connection Issues
**From Cowork sandbox**: Cannot push to Heroku — HTTPS connection is blocked
**Workaround**: User must run `git push heroku HEAD:master --force` from local terminal

### AutoReload Null Baseline Bug (Historical)
**Status**: FIXED (but do not re-introduce)
- Never set `frontendBaseline.current = null` after a failed fetch
- If baseline is null and a poll succeeds, SET the baseline (don't compare)
- See `src/components/AutoReload.tsx` for current correct implementation

---

## Deployment Notes

### Frontend Deploy (from user's local terminal)
```bash
cd /Users/jaynishimura/Desktop/sushizen-shift-pwa
git add -A
git commit -m "your message"
git push origin main
# Vercel auto-deploys from GitHub push (GitHub integration active as of 2026-05-11)
```

### Backend Deploy (from user's local terminal)
```bash
cd /Users/jaynishimura/Desktop/sushizen_shift_app_clean
git add -A
git commit -m "your message"
git push heroku HEAD:master --force
```

### Emergency Frontend Rollback
If a bad build is deployed:
1. Go to Vercel Dashboard → Deployments
2. Find the last known-good deployment
3. Click "Promote to Production"
4. This switches instantly without rebuilding

Last known-good commit: `a5c28d2` ("Late Analysis: visual overhaul with bar charts, severity heatmap, rank badges")

### Verify Backend Deploy
```bash
heroku releases -a sushizen-shift-app -n 5
heroku logs -a sushizen-shift-app -n 100
```

### Force Re-deploy Backend
```bash
git commit --allow-empty -m "force redeploy"
git push heroku HEAD:master --force
```

---

## Attendance Sync Troubleshooting

If Bayzat sync stops working:

1. Check `last_sync_status` in `attendance_drive_sources`:
   ```sql
   SELECT id, folder_id, city_hint, is_enabled, last_synced_at, last_sync_status
   FROM attendance_drive_sources;
   ```

2. If `last_sync_status = 'DUPLICATE_HASH'`, reset it:
   ```sql
   UPDATE attendance_drive_sources SET last_sync_status = '' WHERE id = 1;
   ```

3. Check actual attendance coverage:
   ```sql
   SELECT attendance_date, COUNT(*)
   FROM actual_attendance
   GROUP BY attendance_date
   ORDER BY attendance_date DESC
   LIMIT 10;
   ```

4. Manual sync: Go to `/admin/attendance/import` → click "Sync All"

5. Check Heroku logs: `heroku logs -a sushizen-shift-app --tail`

---

## Architecture Decision Notes

### Why CK Orders Use `vendor_name = "CK"`
CK orders are identified by the literal string `"CK"` as the vendor name in `proc_request_items`. The backend sets `is_ck_order = TRUE` on the parent `proc_requests` row. This drives the auto-approval flow and the routing to the CK production queue.

### Why Two PO Tracking Systems
1. `proc_purchase_orders` — the main PO system used for standard procurement
2. CK orders use the same PO system but with the `is_ck_order` flag and the dispatch/receiving flow instead of the email/vendor flow

### Why Bayzat Drive Folder Has `city_hint = ''`
Dubai and Manila attendance files are mixed in the same Drive folder. Setting `city_hint` to empty allows the backend to handle both cities from the same source config.

### Why `canAccessAdminNav()` Must Be Combined with Role Check
`canAccessAdminNav()` only checks permissions array — it returns `false` for HQ users who have the role `HQ` but no explicit channel permissions assigned. Always add `|| role === "HQ" || role === "ADMIN"` when guarding admin pages.

---

## Environment Variables

### Frontend (Vercel)
- `NEXT_PUBLIC_API_BASE_URL` — Backend URL (set in Vercel dashboard)
- `NEXT_PUBLIC_BUILD_ID` — Injected at build time = `VERCEL_URL` (for AutoReload)

### Backend (Heroku)
- `DATABASE_URL` — Heroku Postgres connection string
- `GOOGLE_SERVICE_ACCOUNT_JSON` — Service account credentials for Drive/Gmail
- `ANTHROPIC_API_KEY` — Claude API key for draft AI analysis
- `DISCORD_WEBHOOK_URL` — Discord webhook for attendance reports
- `SECRET_KEY` — For token signing

---

## Contact / Identity

- Heroku app: `sushizen-shift-app`
- Frontend Git: `origin = GitHub`, `main` branch triggers Vercel auto-deploy
- Backend Git: `heroku` remote → Heroku Git
- User email: `freestyler2026@gmail.com`
- Today's date: 2026-06-03
