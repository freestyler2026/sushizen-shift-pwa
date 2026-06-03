# FRONTEND MAP — Sushi ZEN Workforce OS

## Repository Root
`/Users/jaynishimura/Desktop/sushizen-shift-pwa/`

## Directory Structure
```
src/
  app/                    — Next.js App Router pages
  components/             — Shared React components
  lib/                    — Utilities, clients, tokens
```

---

## All Routes in `/src/app/`

### Auth Pages (no NavBar shown)
| Route | File | Purpose |
|---|---|---|
| `/` | `src/app/page.tsx` | Root — redirects to `/login` or `/week` |
| `/login` | `src/app/login/page.tsx` + `LoginClient.tsx` | Login with staff name + PIN + city |
| `/signup` | `src/app/signup/page.tsx` | Staff self-registration (name, city) |
| `/setup-pin` | `src/app/setup-pin/page.tsx` | Initial PIN setup after signup |

### Staff Pages (visible to all authenticated users based on channel permissions)
| Route | File | Purpose |
|---|---|---|
| `/attendance` | `src/app/attendance/page.tsx` | Time-in / Time-out via WebAuthn passkey or GPS |
| `/my-shift` | `src/app/my-shift/page.tsx` | Personal shift calendar view |
| `/week` | `src/app/week/page.tsx` | **CRITICAL — Staff shift viewer. NEVER touch unintentionally.** Lighter-themed UI. |
| `/request` | `src/app/request/page.tsx` | Shift swap and time-off request submission |
| `/my-pay` | `src/app/my-pay/page.tsx` | Staff payslip and pay summary viewer |
| `/private-report` | `src/app/private-report/page.tsx` | Staff private report submission |
| `/calendar` | `src/app/calendar/page.tsx` | Staff calendar view |
| `/inbox` | `src/app/inbox/page.tsx` | Staff inbox (shift requests + private report replies) |
| `/incidents` | `src/app/incidents/page.tsx` | Staff incident report submission and tracking |
| `/change-pin` | `src/app/change-pin/page.tsx` | Staff PIN change |
| `/swap-approve` | `src/app/swap-approve/page.tsx` | Shift swap approval (for shift leads) |
| `/zen-music` | `src/app/zen-music/page.tsx` | ZEN Music page (ambient/mood player) |

### Store-Level Pages (for store staff, CK staff, receiving staff)
| Route | File | Purpose |
|---|---|---|
| `/store/procurement` | `src/app/store/procurement/page.tsx` | Store procurement overview |
| `/store/procurement/request` | `src/app/store/procurement/request/page.tsx` | Store order submission form |
| `/store/procurement/receiving` | `src/app/store/procurement/receiving/page.tsx` | Store receiving confirmation |
| `/store/procurement/claim` | `src/app/store/procurement/claim/page.tsx` | Store claim submission |
| `/store/purchase` | `src/app/store/purchase/page.tsx` | Direct purchase entry (Mariano workflow) |
| `/store/receiving` | `src/app/store/receiving/page.tsx` | CK receiving — checks dispatched_items_json for shortages |
| `/store/ck-production` | `src/app/store/ck-production/page.tsx` | CK Production / Dispatch page (in progress) |

### Admin Pages — Dashboard
| Route | File | Purpose |
|---|---|---|
| `/admin` | `src/app/admin/page.tsx` | Admin dashboard with tabs: requests, ratings, order entry, etc. |
| `/admin/analytics` | `src/app/admin/analytics/page.tsx` | Primary analytics — compliance + summary sections |
| `/admin/analytics/ai-history` | `src/app/admin/analytics/ai-history/page.tsx` | AI analytics history snapshots |
| `/admin/analytics/procurement` | `src/app/admin/analytics/procurement/page.tsx` | Procurement analytics |
| `/admin/ai-analytics-pro` | `src/app/admin/ai-analytics-pro/page.tsx` | AI Analytics Pro (Claude-powered chat) |
| `/admin/daily-report` | `src/app/admin/daily-report/page.tsx` | Daily operations report |
| `/admin/discord-inbox` | `src/app/admin/discord-inbox/page.tsx` | Discord inbox reader |
| `/admin/private-reports` | `src/app/admin/private-reports/page.tsx` | Admin view of private reports (with reply) |

### Admin Pages — Shifts and Scheduling
| Route | File | Purpose |
|---|---|---|
| `/admin/draft` | `src/app/admin/draft/page.tsx` | **2524-line** shift draft generator with AI analysis |
| `/admin/manual-shift` | `src/app/admin/manual-shift/page.tsx` | Manual shift publishing |
| `/admin/comparison` | `src/app/admin/comparison/page.tsx` | Shift comparison |
| `/admin/corrections` | `src/app/admin/corrections/page.tsx` | Shift corrections |

### Admin Pages — Attendance
| Route | File | Purpose |
|---|---|---|
| `/admin/attendance` | `src/app/admin/attendance/page.tsx` | Attendance overview |
| `/admin/attendance/analytics` | `src/app/admin/attendance/analytics/page.tsx` | Attendance analytics |
| `/admin/attendance/employees` | `src/app/admin/attendance/employees/page.tsx` | Employee-level attendance |
| `/admin/attendance/history` | `src/app/admin/attendance/history/page.tsx` | Attendance history log |
| `/admin/attendance/import` | `src/app/admin/attendance/import/page.tsx` | Manual Bayzat sync (Drive import) |
| `/admin/attendance/locations` | `src/app/admin/attendance/locations/page.tsx` | Location mapping config |
| `/admin/attendance/mapping` | `src/app/admin/attendance/mapping/page.tsx` | Employee alias mapping |
| `/admin/attendance/monthly-closing` | `src/app/admin/attendance/monthly-closing/page.tsx` | Monthly closing workflow |
| `/admin/attendance/monthly-summary` | `src/app/admin/attendance/monthly-summary/page.tsx` | Monthly attendance summary |
| `/admin/attendance/payroll` | `src/app/admin/attendance/payroll/page.tsx` | Attendance-to-payroll bridge |
| `/admin/os-attendance` | `src/app/admin/os-attendance/page.tsx` | OS attendance (GPS config + session log) |
| `/admin/absences` | `src/app/admin/absences/page.tsx` | Absence management |

### Admin Pages — Analytics Sub-Tabs (within analytics page)
These are tab components rendered within `/admin/analytics/page.tsx`:
- `AbsenceTab.tsx` — Absence analytics
- `AdherenceTab.tsx` — Schedule adherence
- `InventoryGapTab.tsx` — Inventory gap analysis
- `LateTab.tsx` — Late arrival tracking
- `LeanShiftTab.tsx` — Lean shift analysis
- `OvertimeTab.tsx` — Overtime tracking

### Admin Pages — Staff Management
| Route | File | Purpose |
|---|---|---|
| `/admin/staff` | `src/app/admin/staff/page.tsx` | Staff master list |
| `/admin/staff/roles` | `src/app/admin/staff/roles/page.tsx` | Role management (HQ only) |
| `/admin/staff/create` | `src/app/admin/staff/create/page.tsx` | New staff creation |
| `/admin/staff/onboarding` | `src/app/admin/staff/onboarding/page.tsx` | Onboarding dashboard |
| `/admin/staff/audit` | `src/app/admin/staff/audit/page.tsx` | Staff audit logs |
| `/admin/renewals` | `src/app/admin/renewals/page.tsx` | Contract/visa renewal tracking |
| `/admin/backoffice-evaluation` | `src/app/admin/backoffice-evaluation/page.tsx` | Backoffice evaluation scores |

### Admin Pages — Inventory
| Route | File | Purpose |
|---|---|---|
| `/admin/inventory` | `src/app/admin/inventory/page.tsx` | Inventory overview |
| `/admin/inventory/productions` | `src/app/admin/inventory/productions/page.tsx` | CK Production management (pending CK orders) |
| `/admin/inventory/ledger` | `src/app/admin/inventory/ledger/page.tsx` | Stock ledger |
| `/admin/inventory/counts` | `src/app/admin/inventory/counts/page.tsx` | Inventory count sessions |
| `/admin/inventory/count-sheets` | `src/app/admin/inventory/count-sheets/page.tsx` | Count sheet templates |
| `/admin/inventory/items` | `src/app/admin/inventory/items/page.tsx` | Inventory items master |
| `/admin/inventory/recipes` | `src/app/admin/inventory/recipes/page.tsx` | Recipe management |
| `/admin/inventory/spot-checks` | `src/app/admin/inventory/spot-checks/page.tsx` | Spot check sessions |
| `/admin/inventory/transfer-orders` | `src/app/admin/inventory/transfer-orders/page.tsx` | Transfer orders |
| `/admin/inventory/quantity-adjustments` | `src/app/admin/inventory/quantity-adjustments/page.tsx` | Qty adjustments |
| `/admin/inventory/cost-adjustments` | `src/app/admin/inventory/cost-adjustments/page.tsx` | Cost adjustments |
| `/admin/inventory/pos-sync` | `src/app/admin/inventory/pos-sync/page.tsx` | POS sync status |
| `/admin/inventory/ck-inventory` | `src/app/admin/inventory/ck-inventory/page.tsx` | CK-specific inventory |
| `/admin/inventory/wh-inventory` | `src/app/admin/inventory/wh-inventory/page.tsx` | Warehouse inventory |
| `/admin/daily-inventory` | `src/app/admin/daily-inventory/page.tsx` | Daily inventory check |
| `/admin/disposal` | `src/app/admin/disposal/page.tsx` | Disposal reporting |
| `/admin/backup` | `src/app/admin/backup/page.tsx` | Backup reporting |

### Admin Pages — Procurement (extensive sub-routes)
| Route | File | Purpose |
|---|---|---|
| `/admin/procurement` | `src/app/admin/procurement/page.tsx` | Procurement root (redirects to hub) |
| `/admin/procurement/hub` | `src/app/admin/procurement/hub/page.tsx` | Procurement hub overview |
| `/admin/procurement/order-grid` | `src/app/admin/procurement/order-grid/page.tsx` | Bulk order grid |
| `/admin/procurement/ck-wh-grid` | `src/app/admin/procurement/ck-wh-grid/page.tsx` | CK/WH order grid |
| `/admin/procurement/approval-inbox` | `src/app/admin/procurement/approval-inbox/page.tsx` | Needs My Approval tab |
| `/admin/procurement/cases/{caseId}` | `src/app/admin/procurement/cases/[caseId]/page.tsx` | Case detail view |
| `/admin/procurement/price-search` | `src/app/admin/procurement/price-search/page.tsx` | Item price search |
| `/admin/procurement/quotes` | `src/app/admin/procurement/quotes/page.tsx` | Vendor quotes |
| `/admin/procurement/pos` | `src/app/admin/procurement/pos/page.tsx` | Purchase Orders list |
| `/admin/procurement/ck-orders` | `src/app/admin/procurement/ck-orders/page.tsx` | CK orders with shortage flags |
| `/admin/procurement/direct-purchases` | `src/app/admin/procurement/direct-purchases/page.tsx` | Direct purchases admin review |
| `/admin/procurement/receiving` | `src/app/admin/procurement/receiving/page.tsx` | Confirm Delivery tab |
| `/admin/procurement/claims` | `src/app/admin/procurement/claims/page.tsx` | Claims management |
| `/admin/procurement/invoices` | `src/app/admin/procurement/invoices/page.tsx` | Invoice management |
| `/admin/procurement/invoices/intelligence` | `src/app/admin/procurement/invoices/intelligence/page.tsx` | Invoice intelligence |
| `/admin/procurement/payments` | `src/app/admin/procurement/payments/page.tsx` | Payment queue |
| `/admin/procurement/vendors` | `src/app/admin/procurement/vendors/page.tsx` | Vendor master |
| `/admin/procurement/ingredients` | `src/app/admin/procurement/ingredients/page.tsx` | Item/ingredient benchmark |
| `/admin/procurement/catalog` | `src/app/admin/procurement/catalog/page.tsx` | Order Catalog (curated items) |
| `/admin/procurement/delivery-schedule` | `src/app/admin/procurement/delivery-schedule/page.tsx` | Delivery schedule config |
| `/admin/procurement/delivery-addresses` | `src/app/admin/procurement/delivery-addresses/page.tsx` | **NEW** Branch delivery address management |
| `/admin/procurement/approval-matrix` | `src/app/admin/procurement/approval-matrix/page.tsx` | Approval matrix config |
| `/admin/procurement/imports` | `src/app/admin/procurement/imports/page.tsx` | Excel order import |
| `/admin/procurement/whitelist` | `src/app/admin/procurement/whitelist/page.tsx` | Emergency vendor whitelist |
| `/admin/procurement/exceptions` | `src/app/admin/procurement/exceptions/page.tsx` | Exception alerts |
| `/admin/procurement/audit` | `src/app/admin/procurement/audit/page.tsx` | Audit logs |
| `/admin/procurement/kpi` | `src/app/admin/procurement/kpi/page.tsx` | KPI dashboard |
| `/admin/procurement/scorecards` | `src/app/admin/procurement/scorecards/page.tsx` | Vendor scorecards |
| `/admin/procurement/risk-lab` | `src/app/admin/procurement/risk-lab/page.tsx` | Risk lab settings |
| `/admin/procurement/dashboard` | `src/app/admin/procurement/dashboard/page.tsx` | Procurement dashboard |
| `/admin/procurement/items` | `src/app/admin/procurement/items/page.tsx` | Procurement items |

### Admin Pages — Finance and Cost
| Route | File | Purpose |
|---|---|---|
| `/admin/finance` | `src/app/admin/finance/page.tsx` | Management P&L (HQ only) |
| `/admin/cost-calculation` | `src/app/admin/cost-calculation/page.tsx` | Cost calculation |
| `/admin/cost-calculation/cost-check` | `src/app/admin/cost-calculation/cost-check/page.tsx` | Cost check |
| `/admin/price-check` | `src/app/admin/price-check/page.tsx` | Price check (HQ, Admin, Manila Mgmt) |

### Admin Pages — Menu
| Route | File | Purpose |
|---|---|---|
| `/admin/menu` | `src/app/admin/menu/page.tsx` | Menu builder overview |
| `/admin/menu/products` | `src/app/admin/menu/products/page.tsx` | Products list |
| `/admin/menu/products/{productId}` | `src/app/admin/menu/products/[productId]/page.tsx` | Product detail |
| `/admin/menu/categories` | `src/app/admin/menu/categories/page.tsx` | Categories |
| `/admin/menu/groups` | `src/app/admin/menu/groups/page.tsx` | Product groups |
| `/admin/menu/groups/{groupId}` | `src/app/admin/menu/groups/[groupId]/page.tsx` | Group detail |
| `/admin/menu/combos` | `src/app/admin/menu/combos/page.tsx` | Combo products |
| `/admin/menu/combos/{comboId}` | `src/app/admin/menu/combos/[comboId]/page.tsx` | Combo detail |
| `/admin/menu/modifier-groups` | `src/app/admin/menu/modifier-groups/page.tsx` | Modifier groups |
| `/admin/menu/modifier-options` | `src/app/admin/menu/modifier-options/page.tsx` | Modifier options |
| `/admin/menu/tags` | `src/app/admin/menu/tags/page.tsx` | Menu tags |

### Admin Pages — Payroll
| Route | File | Purpose |
|---|---|---|
| `/admin/payroll` | `src/app/admin/payroll/page.tsx` | Payroll overview (Dubai cycles) |
| `/admin/payroll/transactions` | `src/app/admin/payroll/transactions/page.tsx` | Payroll transactions |
| `/admin/payroll/adjustments` | `src/app/admin/payroll/adjustments/page.tsx` | Payroll adjustments |
| `/admin/payroll/loans` | `src/app/admin/payroll/loans/page.tsx` | Staff loans |
| `/admin/payroll/leave-salary` | `src/app/admin/payroll/leave-salary/page.tsx` | Leave salary requests |
| `/admin/payroll/manila` | `src/app/admin/payroll/manila/page.tsx` | Manila payroll periods |
| `/admin/payroll/manila/{periodId}` | `src/app/admin/payroll/manila/[periodId]/page.tsx` | Manila payroll period detail |
| `/admin/payroll/manila/dtr-upload` | `src/app/admin/payroll/manila/dtr-upload/page.tsx` | DTR upload |
| `/admin/payroll/manila/gov-tables` | `src/app/admin/payroll/manila/gov-tables/page.tsx` | Gov contribution tables |
| `/admin/payroll/manila/staff-profiles` | `src/app/admin/payroll/manila/staff-profiles/page.tsx` | Staff payroll profiles |

### Admin Pages — Other
| Route | File | Purpose |
|---|---|---|
| `/admin/travel-path` | `src/app/admin/travel-path/page.tsx` | Travel path checklist |
| `/admin/incidents` | `src/app/admin/incidents/page.tsx` | Incident report admin |
| `/admin/incidents/{id}` | `src/app/admin/incidents/[id]/page.tsx` | Incident detail |
| `/admin/incidents/dashboard` | `src/app/admin/incidents/dashboard/page.tsx` | Incidents dashboard |
| `/admin/baseroll-prep` | `src/app/admin/baseroll-prep/page.tsx` | Base roll prep (Manila) |
| `/admin/order-entry` | `src/app/admin/order-entry/page.tsx` | Order entry (ratings entry) |
| `/admin/ratings-entry` | `src/app/admin/ratings-entry/page.tsx` | Ratings entry |
| `/admin/low-ratings` | `src/app/admin/low-ratings/page.tsx` | Low ratings tracking |

---

## Key Shared Components (`src/components/`)

| Component | Purpose |
|---|---|
| `NavBar.tsx` | Main navigation bar (top bar + desktop tabs + mobile bottom nav + More sheet) |
| `AutoReload.tsx` | Polls `/api/version` every 3s; triggers hard reload when build ID changes |
| `LayoutShell.tsx` | Wraps all pages with NavBar and AutoReload. Never remove AutoReload from here. |
| `LogoutButton.tsx` | Logout button component |
| `ProcurementTabs.tsx` | Procurement sub-navigation tabs |

---

## NavBar Architecture

### Structure
The NavBar renders in two modes:
1. **Desktop**: horizontal scrollable tab bar at top
2. **Mobile**: bottom navigation bar with 4 primary tabs + "More" sheet overlay

### Primary Staff Nav Items (always visible to staff)
- Time-in / Time-out (`/attendance`)
- My Shift (`/my-shift`)
- Week (`/week`)
- Request (`/request`)
- My Pay (`/my-pay`)
- Private Report (`/private-report`)

### Secondary Staff Items (in "More" on mobile)
- Calendar, ZEN Music, Inbox, Incident Report, Disposal Report, Backup Report
- Daily Inventory, Travel Path, Store Procurement, Direct Purchase
- CK Dispatch (`/store/ck-production`), CK Receiving (`/store/receiving`)
- Swap Approve, Change PIN

### Admin Items (shown when `isAdmin || role === "HQ" || canAccessAdminNav`)
Admin items are permission-gated individually via `canSeeAdminItem(href, auth)`:
- Admin Dashboard, Inventory, Procurement, Analytics, Management P&L
- Cost Calculation, Menu Builder, Private Reports, AI Analytics Pro
- Attendance, OS Attendance, Absences, Renewals, Staff, Role Management
- Draft, Manual Shift, Backoffice Eval, Incident Reports
- Price Check, Base Roll Prep, Daily Report, Discord Inbox, Payroll

### Mobile Primary Tabs (4 fixed bottom tabs)
`/attendance`, `/my-shift`, `/request`, `/inbox`

### Badge Polling
NavBar polls these badge counts on interval:
- Renewals badge: every 60s (`/api/renewals/alerts/badge`)
- Incident badge (staff): every 60s (`/api/incidents/badge`)
- Admin incident badge: every 60s (`/api/admin/incidents/badge`)
- Admin requests badge: every 30s (`/api/admin/requests/badge`)
- Private reports badge: every 30s (`/api/admin/private_reports/badge`)
- Inbox badge: every 30s (`/api/private_reports/my_inbox`)
- Procurement badge: on auth load (`/api/admin/procurement/badge-summary`)
- Price check badge: every 30min (`/api/admin/price-check/flagged-count`)

---

## Auth Guard Pattern

Every admin page should guard access like this:
```typescript
const auth = getAuth();
const role = String(auth?.role || "").toUpperCase();
if (!canAccessAdminNav(auth) && role !== "HQ" && role !== "ADMIN") {
  router.replace("/week");
  return;
}
```

**NEVER** gate on `canAccessAdminNav(auth)` alone — HQ users may lack explicit channel permissions but still need access.

For HQ-only pages (e.g., role management, finance):
```typescript
if (!canAccessRoleManagement(auth)) {
  router.replace("/week");
}
```

---

## API Call Pattern

All API calls go through the Next.js proxy:
```typescript
// In page components:
const res = await fetch('/api/admin/procurement/requests', {
  method: 'GET',
  headers: getAuthHeaders(auth), // from src/lib/auth.ts
});
```

The proxy route `src/app/api/admin/[...slug]/route.ts` forwards to:
- Production: `https://sushizen-shift-app-038d846023bc.herokuapp.com`
- Development: `http://127.0.0.1:8000`

Auth headers sent:
- `Authorization: Bearer {accessToken}`
- `X-Step-Up-Token: {stepUpToken}` (when step-up authenticated)
- `X-WebAuthn-Origin: {window.location.origin}`

---

## State Management

There is no global state library (no Redux, no Zustand). State patterns:
- **Auth**: `localStorage` via `src/lib/auth.ts` (`getAuth()`, `setAuth()`, `clearAuth()`)
- **Component state**: React `useState` and `useEffect` hooks
- **Badge counts**: maintained in NavBar via polling useEffects
- **Page-level data**: fetched in `useEffect` on mount, stored in local state
- **Events**: custom window events for cross-component communication (e.g., `BADGE_EVENTS.inbox`, `sushizen:requests:badge:refresh`)

---

## Design System (`src/lib/ui-tokens.ts`)

All UI class constants. Import from this file; never write raw Tailwind in page files.

### Cards
- `GLASS_CARD` — standard glass card with blur
- `STATUS_CARD` — gradient glass card
- `HIGHLIGHT_CARD` — violet-accented card

### Buttons
- `PRIMARY_BUTTON` — violet gradient, main CTA
- `SECONDARY_BUTTON` — subdued violet border
- `SMALL_BUTTON` — small action button
- `DANGER_BUTTON` — red destructive action

### Inputs
- `INPUT_CLASS` — standard text input
- `SELECT_CLASS` — dropdown select
- `TEXTAREA_CLASS` — multi-line text area

### Tabs
- `TAB_CONTAINER` — tab row wrapper
- `TAB_ACTIVE` — active tab styling
- `TAB_INACTIVE` — inactive tab styling

### KPI Cards
- `KPI_CARD` — metric card container
- `KPI_LABEL` — metric label (uppercase, tracked)
- `KPI_VALUE` — metric value (large, tabular)

### Tables
- `TABLE_HEADER` — table header cell
- `TABLE_ROW` — table row with hover
- `TABLE_CELL` — table data cell

### Typography
- `T_PAGE_TITLE` — 3xl light page heading
- `T_SECTION` — lg semibold section heading
- `T_CARD_TITLE` — base semibold card title
- `T_LABEL` — 10px uppercase tracking label
- `T_BODY` — sm relaxed body text
- `T_CAPTION` — xs caption text

### Badges
- `BADGE_SUCCESS` — emerald (good/active)
- `BADGE_WARNING` — amber (attention)
- `BADGE_ERROR` — red (problem)
- `BADGE_INFO` — violet (informational)
- `BADGE_ACCENT` — purple (secondary accent)

### Misc
- `DIVIDER` — horizontal rule

---

## Critical Files

### `src/app/admin/draft/page.tsx` — 2524 lines
The most complex page. Structure:
1. Lines 1–~380: Imports + constants (including `DUBAI_DRAFT_SHEET_URL`, `MANILA_DRAFT_SHEET_URL`)
2. Line ~386: `ForecastSettingsPanel` component — editable multiplier/weight panel
3. Line ~1020+: Main component state — includes remnant state identifiers pending removal
4. Line ~1692: `proposeFromSheet()` function — **PENDING REMOVAL**
5. Line ~2028: "Pending Sheet Proposals" JSX section — **PENDING REMOVAL**

**Identifiers pending removal** (sheet proposals feature):
`sheetTabMain`, `sheetTabs`, `sheetTabsBusy`, `pendingVisibleRows`, `proposeFromSheet`, `DUBAI_DRAFT_SHEET_URL` (variable), `selectedProposalIds`

**Rule**: Always use line-number-based deletion for this file. Never regex-pattern removal.

### `src/app/week/page.tsx` — CRITICAL
Staff shift viewer. Different visual theme (lighter). Never modify without explicit intent.

### `src/components/AutoReload.tsx` — NEVER DISABLE
Polls every 3s. Must always work. See Lessons Learned in CLAUDE.md.
