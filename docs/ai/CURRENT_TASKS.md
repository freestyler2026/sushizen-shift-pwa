# CURRENT_TASKS.md

Last updated: 2026-06-03

> **New session start protocol:**
> 1. Read `CLAUDE.md` (root) — always first
> 2. Read THIS file — understand where things left off
> 3. Load only the additional `docs/ai/` file(s) needed for the specific task

---

## ⚠️ Deployments Pending (must run before testing)

These changes are written to disk but not yet live. Deploy in order:

### Backend (`sushizen_shift_app_clean`) — `git push heroku HEAD:master --force`

| Change | Files | Description |
|---|---|---|
| CK vendor detection fix | `app/db.py`, `app/main.py`, `app/inventory_db.py` | `vendor_name="CK"` recognized as CK in all 3 detection paths (`is_ck_by_vendor`, `is_ck_procurement_request()`, `get_ck_pending_requests()`) |
| PO PDF word-wrap fix | `app/services/procurement_po_mail.py` | Vendor name/address wraps in left column; no longer overflows into DELIVER TO column |
| PO email open tracking | `app/main.py`, `app/db.py`, `app/services/procurement_po_mail.py` | 1×1 GIF pixel + `GET /api/procurement/po/open/{token}` + `opened_at`/`open_count` on `proc_po_email_logs` |
| Branch delivery addresses API | `app/main.py`, `app/db.py` | `proc_branch_delivery_addresses` table + GET/POST/DELETE endpoints under `/api/admin/procurement/delivery-addresses` |

### Frontend (`sushizen-shift-pwa`) — `git push origin main`

| Change | File | Description |
|---|---|---|
| CK Production selector colors | `src/app/admin/inventory/productions/page.tsx` | `text-white` on all `<select>` elements |
| Direct purchase draft persistence | `src/app/store/purchase/page.tsx` | sessionStorage draft saves form across iOS PWA memory unloads |
| Vendor dropdown slice removed | `src/app/store/purchase/page.tsx` | All vendors shown (was cut at 10/5) |
| Branch Addresses page | `src/app/admin/procurement/delivery-addresses/page.tsx` | New admin page for store delivery address management |
| Branch Addresses nav tab | `src/components/ProcurementTabs.tsx` | "Branch Addresses" added to Admin group |
| PO open tracking display | `src/app/admin/procurement/pos/page.tsx` | Email log shows "📬 Opened" + "✅ Confirmed" with timestamps and open count |
| AI documentation | `docs/ai/*.md`, `CLAUDE.md` | 7-file selective-load doc structure |

### Deploy commands (user runs from local terminal)
```bash
# Backend first
cd /Users/jaynishimura/Desktop/sushizen_shift_app_clean
git add -A && git commit -m "feat: CK detection fix, PO tracking pixel, branch delivery addresses, PO PDF word-wrap"
git push heroku HEAD:master --force

# Then frontend
cd /Users/jaynishimura/Desktop/sushizen-shift-pwa
git add -A && git commit -m "feat: branch addresses page, PO open tracking display, selector colors, draft persistence, docs"
git push origin main
```

### Post-deploy verification
1. `/store/procurement/request` — submit CK order → should auto-approve → appear in `/admin/inventory/productions` Pending Orders
2. `/admin/procurement/delivery-addresses` — "Branch Addresses" tab visible in Admin nav
3. `/admin/procurement/pos` — send PO → email log shows "📬 Opened" after email is opened

---

## In Progress Tasks

### Task #10 — `/admin/travel-path/page.tsx` Frontend
**Status**: In progress — backend done, frontend not started
**Backend files**: `app/travel_path_api.py`, `app/db_travel_path.py`
**Key endpoints**:
- `GET /api/admin/inventory/travel-path?city=manila&branch_code=TAFT&date=2026-06-03`
- `POST /api/admin/inventory/travel-path/upsert`
**File to create**: `src/app/admin/travel-path/page.tsx`
**Auth guard**: `canAccessTravelPathAdmin(auth)` from `src/lib/auth.ts`
**Pattern**: Similar to `/admin/inventory/productions/page.tsx`

### Task #36 — `/store/ck-production/` CK Staff Dispatch Page
**Status**: In progress — not yet created
**File to create**: `src/app/store/ck-production/page.tsx`
**Key endpoints**:
- `GET /api/admin/procurement/ck-production/pending?city=dubai` — POs awaiting dispatch
- `POST /api/admin/procurement/ck-production/dispatch/{po_id}` — body: `{ dispatched_by, dispatched_items: [{item_name, dispatched_qty, unit}], notes }`
**Flow**: CK staff opens page → sees pending store orders → enters dispatched quantities → submits → sets `dispatched_at`, `dispatched_items_json`, `has_shortage` on `proc_purchase_orders`

---

## Pending Tasks

### Task #37 — Update `/store/receiving/` for `dispatched_items_json`
**File**: `src/app/store/receiving/page.tsx`
**What**: Show dispatched items from `dispatched_items_json` so store staff can check off what arrived and flag shortages against what was dispatched.
**Backend**: `proc_purchase_orders.dispatched_items_json` (JSONB: `[{item_name, dispatched_qty, unit, shortage: bool}]`)

### Task #38 — Update `/admin/procurement/ck-orders/` for shortage flags
**File**: `src/app/admin/procurement/ck-orders/page.tsx`
**What**: Show `has_shortage` flag and `dispatched_items_json` details so managers can see what was short-shipped.

### Task #39 — Add CK Production link to NavBar
**File**: `src/components/NavBar.tsx`
**What**: Link to `/store/ck-production` for CK kitchen staff
**Condition**: Show only when user has CK role or appropriate permission

---

## Recently Completed (this session — 2026-06-03)

| Task | Description |
|---|---|
| #40 | CK Production pending orders fix — `vendor_name="CK"` detection in 3 backend places |
| #41 | Black text on selectors in productions page — `text-white` added |
| #42 | Updated branch delivery addresses (hardcoded defaults in `procurement_po_mail.py`) |
| #43 | `proc_branch_delivery_addresses` DB table + API endpoints |
| #44 | `/admin/procurement/delivery-addresses/` frontend page + nav tab |
| — | PO PDF word-wrap — vendor name/address no longer overflows |
| — | PO email open tracking pixel + `opened_at`/`open_count` |
| — | Direct purchase: sessionStorage draft persistence + vendor dropdown fix |
| — | Test vendor + catalog items: Dubai TEST-D001 (テスト/100 AED), Manila TEST-M001 (テスト/1000 PHP) |
| — | All 9 store addresses registered in `proc_branch_delivery_addresses` DB (live) |
| — | AI documentation: `CLAUDE.md` + `docs/ai/` (selective-load design) |

---

## Known Debt

### `admin/draft/page.tsx` — Sheet Proposals Removal (DO NOT TOUCH yet)
Identifiers to remove when safe:
`sheetTabMain`, `sheetTabs`, `sheetTabsBusy`, `pendingVisibleRows`, `proposeFromSheet`, `DUBAI_DRAFT_SHEET_URL` (variable only), `selectedProposalIds`, JSX "Pending Sheet Proposals" block (~line 2028).

**⚠️ Rule**: Line-number-based deletion ONLY. No regex. Prior regex destroyed BranchReliabilityPanel + AI analysis.

---

## System State Snapshot

| Feature | Status |
|---|---|
| CK order auto-detection (`vendor_name="CK"`) | ✅ Fixed (pending backend deploy) |
| CK Dispatch page (`/store/ck-production/`) | ⏳ Task #36 — not created |
| CK Receiving with shortage check | ⏳ Task #37 — pending |
| CK shortage flags in admin | ⏳ Task #38 — pending |
| PO email open tracking | ✅ Implemented (pending deploy) |
| Branch delivery addresses DB + UI | ✅ Live (data registered, UI needs frontend deploy) |
| PO PDF word-wrap | ✅ Fixed (pending backend deploy) |
| Travel path frontend | ⏳ Task #10 — not created |

---

## Heroku Diagnostics

```bash
heroku logs -a sushizen-shift-app -n 200 | grep -E "error|CK|dispatch|tracking" -i

# Check branch addresses
heroku pg:psql -a sushizen-shift-app
SELECT city, store_code, address FROM proc_branch_delivery_addresses ORDER BY city, store_code;

# Check PO email open tracking
SELECT po_id, recipient_email, opened_at, open_count, receipt_confirmed_at
FROM proc_po_email_logs ORDER BY created_at DESC LIMIT 10;

# Reset attendance sync duplicate hash
UPDATE attendance_drive_sources SET last_sync_status = '' WHERE id = 1;
```
