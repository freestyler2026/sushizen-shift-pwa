# Procurement Intelligence — Implementation Plan

> Goal: Transform the Invoices page from a passive data viewer into an active management tool.
> HQ and managers can spot anomalies, negotiate better prices, and prevent financial risk — all from the same data that is already synced from the supplier invoice spreadsheet.

---

## Existing Data Available (no new ingestion needed)

| Table | Key columns |
|---|---|
| `invoice_line_items` | market, invoice_no, invoice_date, supplier_name, item_description, quantity, unit, unit_price, amount, po_number, branch |
| `invoice_summary` | market, invoice_no, invoice_date, due_date, supplier_name, grand_total, payment_terms, po_number |
| `supplier_master` | market, supplier_code, supplier_name, payment_terms, currency |
| view `item_price_history` | market, supplier_name, item_description, invoice_date, unit_price, prev_unit_price, pct_change |

---

## Phase Overview

| Phase | Theme | Backend | Frontend | Est. complexity |
|---|---|---|---|---|
| **1** | Duplicate & data integrity flags | ✅ New DB fn + API endpoint | Alert banner on Invoices page | Low |
| **2** | Price spike & cross-supplier comparison | ✅ New DB fn + API endpoint | Price badge on each invoice row / item detail | Medium |
| **3** | Payment due date tracker | ✅ New DB fn + API endpoint | Due-date alert panel + "overdue" list | Low |
| **4** | Spend trend & supplier concentration | ✅ New DB fn + API endpoint | New "Intelligence" tab with charts | Medium |
| **5** | New vendor / new item detection | ✅ New DB fn + API endpoint | "First seen" badge + weekly digest panel | Medium |

---

## Phase 1 — Data Integrity Alerts

### What it does
Automatically flag invoices that look suspicious based on the data itself, before HQ even looks at the numbers.

### Alert types

#### 1A. Duplicate invoice
- **Logic:** Same `(market, invoice_no)` appears more than once in `invoice_summary`, OR same `(market, supplier_name, grand_total, invoice_date)` with different `invoice_no`.
- **Severity:** 🔴 Critical
- **Example:** "Invoice 25116559 from Golden Dunes appears twice. Possible double billing."

#### 1B. No PO number
- **Logic:** `invoice_summary.po_number` is NULL or empty, or `invoice_line_items.po_number` is NULL/empty for all lines.
- **Severity:** 🟡 Warning
- **Example:** "12 invoices this month have no PO number — not linked to an approved purchase order."

#### 1C. Invoice date in the future
- **Logic:** `invoice_date > CURRENT_DATE`.
- **Severity:** 🟡 Warning

#### 1D. Invoice date very old (>6 months)
- **Logic:** `invoice_date < CURRENT_DATE - INTERVAL '6 months'`.
- **Severity:** 🟡 Warning — possible late submission.

### Backend

**New DB function:** `get_invoice_integrity_alerts(market, date_from, date_to) -> List[Alert]`

```python
# Returns list of dicts:
# { alert_type, severity, invoice_no, supplier_name, detail, invoice_date }
```

**New API endpoint:** `GET /api/admin/procurement/analytics/supplier-invoices/integrity-alerts`

Query params: `market`, `date_from`, `date_to`

### Frontend

- On `invoices/page.tsx`, after `load()` completes, also fetch `integrity-alerts`.
- Show a collapsible alert banner at the top of the page (above the Valid/Problem tabs).
- Each alert row shows: severity icon, invoice_no, supplier, description, link to expand the invoice.
- Alerts are grouped by type (Duplicate / No PO / Date anomaly).
- Count badge on the "Invoices" navigation tab if alerts > 0.

---

## Phase 2 — Price Intelligence

### What it does
Uses the historical `item_price_history` view (already exists) to detect price spikes and surface cross-supplier price comparisons.

### Alert types

#### 2A. Price spike vs. 90-day average
- **Logic:** Current `unit_price` > (90-day moving average for same `market + supplier_name + item_description`) × 1.10 (10% threshold, configurable).
- **Severity:** 🔴 if >20%, 🟡 if 10–20%
- **Example:** "Salmon Fillet (Golden Dunes): AED 45.00 — 23% above 90-day avg of AED 36.58"

#### 2B. All-time high price
- **Logic:** `unit_price` = MAX ever recorded for that `market + supplier_name + item_description`.
- **Severity:** 🟠 Notable

#### 2C. Cross-supplier price gap
- **Logic:** Same `item_description` (normalized) purchased from ≥2 suppliers in the last 90 days. Flag if max/min price ratio > 1.15.
- **Severity:** 🟡 Opportunity
- **Example:** "Chicken Breast: Supplier A charges AED 12.00, Supplier B charges AED 9.80 — 22% gap"

#### 2D. Price trend (rising 3 consecutive months)
- **Logic:** For a given item+supplier, unit_price increased month-over-month for 3+ months in a row.
- **Severity:** 🟡 Trend alert

### Backend

**New DB function:** `get_invoice_price_alerts(market, date_from, date_to, spike_threshold_pct) -> List[Alert]`

Uses `item_price_history` view plus window functions. Returns:
```python
{
  alert_type: "PRICE_SPIKE" | "ALL_TIME_HIGH" | "CROSS_SUPPLIER_GAP" | "RISING_TREND",
  severity: "critical" | "warning" | "info",
  item_description: str,
  supplier_name: str,
  current_price: float,
  reference_price: float,  # avg / competitor price / prior month
  pct_diff: float,
  currency: str,
  invoice_no: str,
  invoice_date: str,
  detail: str,
}
```

**New DB function:** `get_item_price_history_for_item(market, item_description, supplier_name, months_back) -> List[PricePoint]`
- Returns chronological list for the price history sparkline.

**New API endpoints:**
- `GET /api/admin/procurement/analytics/supplier-invoices/price-alerts` — list of price alerts
- `GET /api/admin/procurement/analytics/supplier-invoices/item-price-history` — already exists, verify it returns enough data

### Frontend

- Price alerts shown in the same alert banner (Phase 1) as a separate collapsible section "Price Alerts".
- Each invoice row in the Valid Data list gets a small colored badge: 🔴 +23% / 🟡 HIGH if any line item in that invoice triggered a price alert.
- Expanding an invoice row shows per-line-item price status: current price, 90-day avg, % diff, sparkline (simple inline bar).
- Cross-supplier gap shown as a dedicated "Price Opportunities" card above the invoice list (if ≥1 gap found).

---

## Phase 3 — Payment Due Date Tracker

### What it does
Surfaces invoices with approaching or overdue due dates, so payments are never missed.

### Alert types

#### 3A. Overdue payment
- **Logic:** `invoice_summary.due_date < CURRENT_DATE` and invoice is not marked paid.
- **Severity:** 🔴 Critical

#### 3B. Due within 3 days
- **Logic:** `due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 3`.
- **Severity:** 🟠 Urgent

#### 3C. Due this week
- **Logic:** `due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7`.
- **Severity:** 🟡 Notice

#### 3D. Missing due date (but has payment terms)
- **Logic:** `due_date IS NULL` but `payment_terms` is set. System can compute expected due date.
- **Severity:** 🟡 Data gap

### Backend

**New DB function:** `get_payment_due_alerts(market) -> List[Alert]`

Note: does not filter by date range — always checks "right now."

**New API endpoint:** `GET /api/admin/procurement/analytics/supplier-invoices/payment-alerts`

### Frontend

- New panel on the Invoices page: "Payment Tracker" — always visible at the top (above filters), collapsed by default.
- Shows three buckets: Overdue (red count), Due soon (orange count), Due this week (yellow count).
- Expanding shows a table sorted by due_date ASC: invoice_no, supplier, amount, due_date, days_remaining.
- Total amount at risk shown per bucket.

---

## Phase 4 — Spend Trend & Supplier Concentration

### What it does
Monthly spend analysis per supplier and category. Highlights dependency risk when too much spend is concentrated on one supplier.

### Features

#### 4A. Monthly spend by supplier (bar/line chart)
- Last 6 months of `grand_total` grouped by `supplier_name`, stacked bar chart.
- Drill down: click supplier → see month-by-month breakdown.

#### 4B. Spend concentration risk
- **Logic:** If any single supplier accounts for >40% of the market's total spend in the last 90 days → risk flag.
- **Example:** "Golden Dunes = 61% of Dubai spend (AED 218,000 / 357,000) — High concentration risk"
- Shown as a donut/pie chart + risk badge.

#### 4C. Month-over-month spend change
- `SUM(grand_total)` this month vs. last month, grouped by supplier.
- Flagged if any supplier's monthly spend increased >30% MoM.

#### 4D. Dubai vs. Manila benchmark
- For items purchased in both markets: show side-by-side avg unit_price with currency-normalized comparison (using a fixed AED/PHP rate or stored rate).
- Helps identify import cost differences and negotiation targets.

### Backend

**New DB function:** `get_supplier_spend_summary(market, months_back) -> Dict`
```python
{
  "monthly": [{ month, supplier_name, total_amount, currency }],
  "concentration": [{ supplier_name, total_amount, pct_of_market }],
  "mom_changes": [{ supplier_name, this_month, last_month, pct_change }],
}
```

**New DB function:** `get_cross_market_price_benchmark(item_description_search) -> List`
- Returns avg unit_price for matching items in both markets.

**New API endpoints:**
- `GET /api/admin/procurement/analytics/supplier-invoices/spend-summary`
- `GET /api/admin/procurement/analytics/supplier-invoices/cross-market-benchmark`

### Frontend

- New tab: **"Intelligence"** added to Financials group in `ProcurementTabs.tsx`.
- Route: `/admin/procurement/invoices/intelligence` (or as a sub-tab within invoices page).
- Page layout:
  1. Supplier concentration donut + risk badge (top of page)
  2. Monthly spend bar chart (last 6 months, stacked by supplier, toggleable)
  3. MoM change table (sorted by biggest increase)
  4. Dubai ↔ Manila benchmark table (search by item name)

---

## Phase 5 — New Vendor & New Item Detection

### What it does
Automatically flags items or suppliers that appear for the first time (or after a long absence), so HQ can verify they are authorized.

### Features

#### 5A. New supplier this month
- **Logic:** `supplier_name` appears in `invoice_summary` this month but NOT in any prior month.
- **Severity:** 🟠 Review needed — "New supplier: ACME Foods (first invoice: 2026-05-20)"

#### 5B. New item from existing supplier
- **Logic:** `item_description` appears for a given `supplier_name` this month but not in prior 3 months.
- **Severity:** 🟡 Info — "New item from Golden Dunes: 'Truffle Oil 500ml' (no prior history)"

#### 5C. Supplier reappearance after 90+ days
- **Logic:** A supplier that had invoices before but not in the last 90 days appears again.
- **Severity:** 🟡 Info

#### 5D. Weekly "first seen" digest
- A summary panel: "This week's new items (3)" and "This week's new suppliers (1)" — gives HQ a quick audit view.

### Backend

**New DB function:** `get_new_vendor_item_alerts(market, lookback_days_for_new, history_window_days) -> Dict`
```python
{
  "new_suppliers": [{ supplier_name, first_invoice_date, invoice_no, amount }],
  "new_items": [{ item_description, supplier_name, first_invoice_date, unit_price, unit }],
  "reappeared_suppliers": [{ supplier_name, last_seen_before, invoice_no }],
}
```

**New API endpoint:** `GET /api/admin/procurement/analytics/supplier-invoices/new-vendor-alerts`

### Frontend

- Shown in the alert banner (Phase 1) as a third section: "New Vendors & Items".
- Also surfaced in the invoice list: badge "NEW SUPPLIER" or "NEW ITEM" on relevant invoice rows.
- Weekly digest card on the Intelligence tab (Phase 4).

---

## Technical Architecture Notes

### Alert banner component (shared across Phase 1–5)

```
ProcurementAlertBanner
  ├── Section: Data Integrity (Phase 1)
  ├── Section: Price Alerts (Phase 2)
  ├── Section: Payment Due (Phase 3)   ← always shown even without date filter
  └── Section: New Vendors / Items (Phase 5)
```

- Each section is independently collapsible.
- Collapsed state stored in `localStorage` so it remembers user preference.
- Total alert count shown as badge on "Invoices" nav tab.
- Banner re-fetches every 60 seconds (same pattern as badge-summary).

### API call strategy

All alert endpoints are called in parallel via `Promise.all` after the main `load()` fetch. They are non-blocking — if an alert endpoint fails, the main invoice list still displays.

### Severity color system

| Severity | Color | Use |
|---|---|---|
| critical | `text-rose-400` / `border-rose-700` | Overdue payments, duplicate invoices |
| warning | `text-amber-400` / `border-amber-700` | Price spikes, no PO number |
| info | `text-sky-400` / `border-sky-700` | New items, trends |
| opportunity | `text-emerald-400` / `border-emerald-700` | Cross-supplier price gaps |

### Backend file changes

| File | Changes |
|---|---|
| `app/db.py` | New DB functions per phase (integrity, price, payment, spend, vendor alerts) |
| `app/main.py` | New GET endpoints per phase |
| `app/services/proc_supplier_invoice_reporting.py` | Extended or new service functions |

### Frontend file changes

| File | Changes |
|---|---|
| `src/app/admin/procurement/invoices/page.tsx` | Alert fetches, alert banner, row badges, payment tracker panel |
| `src/components/ProcurementTabs.tsx` | Add "Intelligence" tab to Financials group |
| `src/app/admin/procurement/invoices/intelligence/page.tsx` | New page: spend charts + concentration + benchmark (Phase 4) |
| `src/lib/ui-tokens.ts` | Alert severity color tokens if not already defined |

---

## Deploy strategy per phase

Each phase is independently deployable:

1. **Backend first:** Add DB functions + API endpoints → deploy to Heroku
2. **Frontend second:** Add UI that calls the new endpoints → deploy to Vercel

Both deployments must happen before the feature is live. If only backend is deployed, nothing visible changes (API just has new unused endpoints). Safe to deploy in any order.

---

## Out of scope (for now)

- Push notifications / Discord alerts (can add in a later phase using existing `procurement_notifications.py`)
- Budget threshold configuration UI (would need a new `procurement_budgets` table)
- Automated alert dismissal / acknowledgement tracking
- Email digests
