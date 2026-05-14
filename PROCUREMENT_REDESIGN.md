# Store Procurement Channel — Redesign Implementation Plan

**Status:** In Progress  
**Last Updated:** 2026-05-14

---

## Background

The Store Procurement channel (`/store/procurement/*`) is a critical 4-step workflow for requesting, approving, receiving, and claiming items. Staff currently struggle to use it because:

1. The flow across 4 pages is not visually connected — users don't know where they are or what comes next
2. PIN authentication is repeated on every page independently, with no session carry-through
3. Branch selection is not remembered across pages
4. Action buttons don't reflect current request status — users must figure out what to do manually
5. The UI is mobile-first but most users are on PC — wasted screen space
6. Claims require manual typing of Receiving ID and Invoice ID
7. No fraud prevention at the UI level — any staff member can receive their own order

---

## Architecture

| Page | File | Purpose |
|---|---|---|
| Home/Hub | `src/app/store/procurement/page.tsx` | KPIs, recent activity, request list with status |
| New Request | `src/app/store/procurement/request/page.tsx` | Browse catalog, build cart, submit |
| Receiving | `src/app/store/procurement/receiving/page.tsx` | Record actual delivered quantities |
| Claim | `src/app/store/procurement/claim/page.tsx` | File shortage/excess/quality/invoice claims |

Backend: `sushizen_shift_app_clean/app/main.py` — endpoints under `/api/admin/procurement/`

---

## Phase 1 — Frontend Only (No Backend Changes Required)

### 1.1 Wizard Step Indicator (All Pages)

**Goal:** Show users where they are in the 4-step flow at all times.

**Implementation:**
- Create a shared `ProcurementStepper` component at `src/components/ProcurementStepper.tsx`
- Steps: `Request → Approval → Receiving → Claim`
- Active step highlighted in violet; completed steps show checkmark; future steps greyed
- Render at top of each procurement page, with the relevant step highlighted
- On mobile: condensed pill indicator (e.g., "Step 2 of 4: Approval")

**Files to change:**
- `src/components/ProcurementStepper.tsx` (new)
- `src/app/store/procurement/page.tsx` — insert stepper (Approval step active while reviewing)
- `src/app/store/procurement/request/page.tsx` — insert stepper (Request step active)
- `src/app/store/procurement/receiving/page.tsx` — insert stepper (Receiving step active)
- `src/app/store/procurement/claim/page.tsx` — insert stepper (Claim step active)

---

### 1.2 Branch Memory Across Pages

**Goal:** Once a user selects their branch/city, it persists across all procurement pages in localStorage.

**Implementation:**
- Key: `sushizen_procurement_branch` in localStorage
- On branch select: save to localStorage + state
- On page load: read from localStorage as initial value
- Applies to: Home, Request, Receiving, Claim pages

**Files to change:**
- `src/app/store/procurement/page.tsx`
- `src/app/store/procurement/request/page.tsx`
- `src/app/store/procurement/receiving/page.tsx`
- `src/app/store/procurement/claim/page.tsx`

---

### 1.3 PIN + Session Integration

**Goal:** Authenticate once per session — don't ask for PIN again if already logged in.

**Implementation:**
- Read `sushizen_shift_auth` from localStorage (same as main app auth)
- If auth exists and has valid `staff_name` + `pin`, pre-fill and skip the PIN prompt
- Still show a "Signed in as [Name]" indicator with option to switch user
- If no session: show PIN entry as before
- Store authenticated procurement session in `sushizen_procurement_auth` localStorage key

**Files to change:**
- All 4 procurement pages

---

### 1.4 Status-Driven Action Buttons (Home Page + Request Page)

**Goal:** Replace generic "Go to Receiving" links with smart buttons that reflect the current status of each request.

**Status → Action mapping:**
| Status | Button Shown | Destination |
|---|---|---|
| PENDING | "Awaiting Approval" (disabled) | — |
| APPROVED | "Receive Now →" (violet, primary) | `/store/procurement/receiving?id=X` |
| RETURNED | "Edit & Resubmit →" (amber) | `/store/procurement/request?edit=X` |
| RECEIVED | "File a Claim →" (blue outline) | `/store/procurement/claim?receivingId=X` |
| CLAIMED / CLOSED | "View Details" (ghost) | Detail modal |

**Files to change:**
- `src/app/store/procurement/page.tsx` — request list rows
- `src/app/store/procurement/request/page.tsx` — add edit mode when `?edit=ID` in URL

---

### 1.5 PC-Optimized 2-Column Layout

**Goal:** On PC (`lg:` breakpoint and up), use a split-panel layout for the most data-heavy pages.

#### Home Page (`/store/procurement/`)
- Left panel (40%): KPI summary cards + status filter tabs
- Right panel (60%): Scrollable request list

#### Request Page (`/store/procurement/request/`)
- Left panel (55%): Catalog browser with category filter tabs + item cards
- Right panel (45%): Cart/order summary + form fields (sticky on scroll)

#### Receiving Page (`/store/procurement/receiving/`)
- Left panel (50%): Ordered items reference (what was requested)
- Right panel (50%): Actual quantity entry fields

#### Claim Page (`/store/procurement/claim/`)
- Left panel (50%): Receiving summary (what was received)
- Right panel (50%): Claim type selector + details form

**Mobile:** Single column, full-width. Tap targets minimum 44px.

**Files to change:**
- All 4 procurement pages

---

### 1.6 Auto-populate Receiving/Claim IDs

**Goal:** Eliminate manual ID entry on the claim page.

**Implementation:**
- When navigating from Home page → Receiving: pass `?orderId=X` in URL
- When navigating from Receiving → Claim: pass `?receivingId=X&invoiceId=Y` in URL
- Claim page reads these from `useSearchParams()` and pre-populates the form
- Show the IDs as read-only reference fields (not editable), with a "Change" link for edge cases

**Files to change:**
- `src/app/store/procurement/page.tsx` — add query params to navigation links
- `src/app/store/procurement/receiving/page.tsx` — pass receivingId/invoiceId on completion
- `src/app/store/procurement/claim/page.tsx` — read from URL params

---

### 1.7 Duplicate Receiving Detection (Frontend Warning)

**Goal:** Warn the user if they try to receive an order that has already been received.

**Implementation:**
- On the Receiving page, after loading the order, check if `status === "RECEIVED"` or `status === "CLOSED"`
- If already received: show a prominent yellow banner with "This order was already received on [date] by [staff]. Are you sure you want to record again?"
- Require a checkbox confirmation before allowing submission

**Files to change:**
- `src/app/store/procurement/receiving/page.tsx`

---

## Phase 2 — Backend Changes Required

### 2.1 Quantity Lock on Receiving

**Goal:** Once a receiving record is submitted, the ordered quantities cannot be changed.

**Backend change:**
- `POST /api/admin/procurement/receiving` — check if receiving record already exists for `order_id`
- If exists: return 409 Conflict with message "This order has already been received"
- New field in `procurement_orders` table: `receiving_locked_at TIMESTAMP`

**Frontend change:**
- Receiving page shows locked state when order has `receiving_locked_at`

**Files:**
- `sushizen_shift_app_clean/app/main.py`
- `sushizen_shift_app_clean/app/db.py` (migration)

---

### 2.2 Photo Attachment for SHORTAGE/QUALITY Claims

**Goal:** Require photographic evidence for shortage and quality claims to prevent false filings.

**Backend change:**
- `POST /api/admin/procurement/claims` — require `photo_url` when `claim_type` in `["SHORTAGE", "QUALITY"]`
- Add `photo_url TEXT` column to claims table
- Accept base64 image upload or Google Drive link

**Frontend change:**
- Claim page: show camera/upload button when SHORTAGE or QUALITY is selected
- Block submission if no photo uploaded for these types
- Show thumbnail preview before submission

**Files:**
- `sushizen_shift_app_clean/app/main.py`
- `sushizen_shift_app_clean/app/db.py`
- `src/app/store/procurement/claim/page.tsx`

---

### 2.3 Maker-Checker Enforcement

**Goal:** The person who submitted a request cannot be the same person who receives it.

**Backend change:**
- `POST /api/admin/procurement/receiving` — compare `requested_by` field on order vs `staff_name` in JWT
- If same person: return 403 with message "You cannot receive your own order. Ask another staff member."

**Frontend change:**
- Receiving page: if maker-checker violation detected, show friendly explanation and "Ask a colleague to receive this order"

**Files:**
- `sushizen_shift_app_clean/app/main.py`

---

### 2.4 Amount Threshold Auto-Escalation

**Goal:** Orders above AED 500 (Dubai) / PHP 15,000 (Manila) automatically require management approval before receiving.

**Backend change:**
- On order submission: calculate `total_amount = sum(unit_price * quantity)`
- If `total_amount > threshold[city]`: set `requires_escalation = true` on the order
- Escalated orders appear in a separate management queue
- Regular approval only: MANAGER approves; escalated: requires DUBAI_MANAGEMENT or MANILA_MANAGEMENT

**Frontend change:**
- Request page: show threshold warning banner dynamically as cart total grows
- Home page: show escalated orders in a separate "Awaiting Management Approval" section

**Files:**
- `sushizen_shift_app_clean/app/main.py`
- `src/app/store/procurement/request/page.tsx`
- `src/app/store/procurement/page.tsx`

---

## Implementation Order

| # | Task | Phase | Priority |
|---|---|---|---|
| 1 | Write this plan | 1 | Done |
| 2 | ProcurementStepper component + insert into all pages | 1 | High |
| 3 | PC 2-column layout — Home page | 1 | High |
| 4 | PC 2-column layout — Request page | 1 | High |
| 5 | Status-driven action buttons (Home page) | 1 | High |
| 6 | Branch memory via localStorage | 1 | Medium |
| 7 | Session/PIN integration | 1 | Medium |
| 8 | Auto-populate IDs (Receiving → Claim) | 1 | Medium |
| 9 | PC 2-column — Receiving + Claim pages | 1 | Medium |
| 10 | Duplicate receiving warning (frontend) | 1 | Medium |
| 11 | Quantity lock (backend) | 2 | Medium |
| 12 | Photo attachment for claims (backend + frontend) | 2 | Medium |
| 13 | Maker-checker enforcement (backend) | 2 | High |
| 14 | Amount threshold escalation (backend + frontend) | 2 | Low |

---

## Design Constraints

- All UI must follow `src/lib/ui-tokens.ts` design system (Slate Lavender, GLASS_CARD, PRIMARY_BUTTON, etc.)
- No Japanese text in UI — English only
- Mobile: single column, 44px minimum tap targets
- PC: 2-column split at `lg:` (1024px) breakpoint
- No new npm dependencies — use existing stack (Tailwind, React hooks, existing fetch utilities)
