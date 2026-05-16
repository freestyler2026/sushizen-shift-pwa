# Inventory Channel — UX Issues Audit

Identified: 2026-05-17 (first deep audit)  
Pages audited: `/admin/inventory/` (dashboard), `/counts/`, `/spot-checks/`, `/quantity-adjustments/`, `/productions/`, `/count-sheets/`, `/items/`, `/ledger/`, `/recipes/`, `/transfer-orders/`

---

## Executive Summary

The Inventory channel has 10 pages covering counting, adjustments, production, templates, ledger, and master data. The core workflows work but the channel has a recurring set of problems:

1. **Japanese text** embedded in 3 confirmation dialogs on the Counts page and in a printed delivery note on the Productions page.
2. **No guards on irreversible actions** — "Close & Post" on Counts, Spot Checks, Quantity Adjustments, and Productions posts to the ledger immediately with no confirmation step.
3. **Jargon overload** — "BOM", "Theo.", "Assets", "ITEM vs PRODUCT", "Yield/Waste factor", "Event type codes" — staff unfamiliar with inventory accounting terminology have no context.
4. **Silent data loss** — several pages clear all entered data when city or branch is switched without warning.
5. **Ledger is a dead-end read** — shows raw event_type codes and truncated data (top 100 rows, no date filter, no search, no unit column).

---

## Phase 5A — High Impact Fixes 🔴 TARGET: Deploy first

### 1. Japanese text in Counts confirmation dialogs
**File:** `src/app/admin/inventory/counts/page.tsx`  
**Lines:** approx. 327, 494, 669  
**Issue:** `window.confirm()` dialogs contain Japanese text. Non-Japanese staff cannot read these dialogs before confirming an irreversible ledger post.  
**Examples (representative):**
- "カウントを閉じて台帳に転記しますか？" before closing a count
- Similar messages for sync and delete actions  
**Fix:** Replace all Japanese `window.confirm()` text with English. Example: `"Close this count and post to the inventory ledger? This cannot be undone."`. Also replace `window.confirm` with a proper inline modal (same pattern as the city-switch modal in procurement) so the message is readable, styled, and accessible.  
**Status:** [x] done

---

### 2. "Close & Post" has no confirmation guard on Counts, Spot Checks, and Quantity Adjustments
**Files:**
- `src/app/admin/inventory/counts/page.tsx`
- `src/app/admin/inventory/spot-checks/page.tsx`
- `src/app/admin/inventory/quantity-adjustments/page.tsx`  
**Issue:** "Close" / "Close & Post" buttons post changes to the inventory ledger immediately. A mis-tap on mobile — or pressing the wrong button after a long data-entry session — creates an incorrect ledger entry with no way to undo from the UI.  
**Fix:** Add a styled confirmation modal before each "Close & Post" action: "Post this [count / spot check / adjustment] to the ledger? This action cannot be undone." with [Confirm] and [Cancel] buttons. Show the document number and item count in the modal for easy verification.  
**Status:** [x] done

---

### 3. Japanese text in Productions printed delivery note
**File:** `src/app/admin/inventory/productions/page.tsx`  
**Function:** `printDeliveryNote()` (line ~1196)  
**Issue:** The delivery note printed from the Production detail panel contains Japanese headers alongside English: "納品書 / Delivery Note", "納品日 / Date", "納品先 / Destination", "担当者 / Person", "ステータス / Status", "商品名 / Product", "数量 / Qty", "単価 / Unit Cost", "金額 / Amount", "合計 / Total". This is printed on paper and handed to store staff — non-Japanese readers cannot navigate the document.  
**Note:** The CK-specific delivery note (`printCkDeliveryNote`) and the Production Order (`printRequests`) are already in English-only — only `printDeliveryNote` has this problem.  
**Fix:** Remove all Japanese text. Use English-only labels: "Delivery Note", "Date", "Destination", "Responsible Staff", "Status", "Product", "Qty", "Unit Cost", "Amount", "Total".  
**Status:** [x] done

---

### 4. Transfer Orders silently clears draft when city is switched
**File:** `src/app/admin/inventory/transfer-orders/page.tsx`  
**Line:** ~354 (city `onChange` handler)  
**Issue:** Changing city in the Transfer Orders form clears all entered data silently — `fromBranch`, `toBranch`, `requestedBy`, `notes`, and the entire `draftItems` list are reset via `useEffect`. A fat-finger on the city dropdown loses the whole in-progress transfer.  
**Fix:** Add a `pendingCitySwitch` guard: if `draftItems.length > 0`, show a confirmation: "Switch to [city]? Your current draft ({N} items) will be cleared." On confirm: apply switch. On cancel: revert city select.  
**Status:** [x] done

---

## Phase 5B — Medium Impact Fixes 🟡 TARGET: Deploy second

### 5. "Close Production" has no confirmation guard
**File:** `src/app/admin/inventory/productions/page.tsx`  
**Function:** `closeSelectedProduction()` (line ~1137)  
**Issue:** The "Close Production" button on the history detail panel posts items to the ledger and deducts ingredients from CK stock immediately — no confirmation is shown. The success message ("Production closed. Product intake and ingredient consumption were posted to ledger.") only appears after the fact.  
**Fix:** Add a confirmation modal before calling the close endpoint: "Close this production? Output will be posted to inventory, and {N} ingredients will be deducted from CK stock."  
**Status:** [ ] pending

---

### 6. Ledger page shows raw event type codes with no unit column
**File:** `src/app/admin/inventory/ledger/page.tsx`  
**Issue:** The "Event" column shows raw backend codes (`COUNT_CLOSE`, `SPOT_CLOSE`, `ADJ_CLOSE`, `PRODUCTION_CLOSE`, `TRANSFER_OUT`, etc.) instead of human-readable labels. The "Delta" and "Balance" columns show numbers without units (e.g. "3.000" — is that kg or pcs?). The page is hardcoded to `limit=100` with no date filter, making it impossible to look up older entries.  
**Fix:**
- Map event_type codes to readable labels (e.g. "Count Closed", "Spot Check", "Manual Adjustment", "Production", "Transfer Out")
- Add `unit` to the Delta and Balance columns (or at least show a sub-line with the unit)
- Add a date-range filter (from/to date inputs) so users can look up historical movements
- Remove or increase the implicit `limit=100`  
**Status:** [ ] pending

---

### 7. Quantity Adjustments — DECREASE is the default action type (fat-finger risk)
**File:** `src/app/admin/inventory/quantity-adjustments/page.tsx`  
**Issue:** The `action_type` select defaults to "DECREASE". A user entering adjustments for items that need to be increased (e.g., receiving unrecorded stock) must actively change the field. One forgotten change creates a decrease instead of an increase — and there is no confirmation guard (see Issue 2).  
**Fix:** Change default to "INCREASE", or remove the default so the user must make an explicit choice before the form enables the save button. Visually distinguish DECREASE in the UI (e.g., red text for DECREASE, green for INCREASE).  
**Status:** [ ] pending

---

### 8. Items page — "ITEM" vs "PRODUCT" type naming is confusing
**File:** `src/app/admin/inventory/items/page.tsx`  
**Issue:** The page tabs are "ALL / ITEMS / PRODUCTS" and the create form has a type dropdown with "ITEM" as default. But everything on the page is an "item." The intent is that "ITEM" = ingredient/raw material and "PRODUCT" = finished/sellable product. This is not explained anywhere in the UI. A user creating a product will leave the type as "ITEM" by default.  
**Fix:**
- Rename the tab labels: "ALL" → "All", "ITEMS" → "Ingredients", "PRODUCTS" → "Products"
- In the create form, rename the type options: "ITEM" → "Ingredient", "PRODUCT" → "Product (Finished Goods)"
- Add a short descriptive label under the type selector: "Ingredients are raw materials; Products are finished goods produced by CK."  
**Status:** [ ] pending

---

### 9. Sales Menu BOM page uses unexplained jargon throughout
**File:** `src/app/admin/inventory/recipes/page.tsx`  
**Issue:** "Sales Menu BOM" (BOM = Bill of Materials), "Yield", "Waste factor", "No BOM rows found" — these terms are standard in food-cost accounting but not in everyday restaurant language. Most store staff will not understand what this page does or when to use it. Additionally "🔄 Sync from Menu Builder" runs a destructive sync with no confirmation (it can delete old recipe lines) and the "Preview Sync" shows only a count summary, not an item-level diff.  
**Fix:**
- Rename the page: "Sales Menu BOM" → "Menu Cost Recipes" or "Menu Ingredient Recipes"
- Add a page-level description explaining the purpose: "This page shows which ingredients are consumed when a menu item is sold. Used to calculate cost of goods sold."
- Add a confirmation before "Sync from Menu Builder": "This will update {N} menu items and remove {M} old recipe lines. Proceed?"
- Make "Preview Sync" show an item-level diff list (added/removed rows), not just counts
- Rename empty state: "No BOM rows found" → "No recipe lines found"
- Add tooltip or label to "Yield" (amount kept after processing) and "Waste" (expected loss percentage)  
**Status:** [ ] pending

---

## Phase 5C — Low Impact / Polish 🟢 TARGET: Deploy third

### 10. Counts page — cryptic column headers "Theo." and "Assets"
**File:** `src/app/admin/inventory/counts/page.tsx`  
**Issue:** The count grid uses abbreviated column headers that staff cannot interpret. "Theo." (theoretical count calculated from sales/production data) and "Assets" (what does this mean in a count context?) are not self-explanatory.  
**Fix:** Expand abbreviations: "Theo." → "Theoretical" (or "Expected"). Clarify or rename "Assets" to something like "Value" or "Est. Value". Add a column header legend or tooltip row.  
**Status:** [ ] pending

---

### 11. Counts page — "Sync Master" button purpose is tooltip-only
**File:** `src/app/admin/inventory/counts/page.tsx`  
**Issue:** The "Sync Master" button has no inline label description — its purpose is only visible on hover (tooltip). On mobile/touch devices tooltips don't appear at all. New staff have no idea what "Sync Master" means or when to press it.  
**Fix:** Add a short inline sub-label below the button: "Pull latest item list from master" or add an info icon with an always-visible description.  
**Status:** [ ] pending

---

### 12. Count Sheets page — "Count Sheets" vs "Counts" naming confusion
**File:** `src/app/admin/inventory/count-sheets/page.tsx`  
**Issue:** The navigation has both "Counts" (the actual counting session page) and "Count Sheets" (the template/master page). New users do not understand the difference. The relationship — that you pick a Count Sheet template when starting a Count session — is not explained anywhere in either page.  
**Fix:** Rename "Count Sheets" in the nav to "Count Templates" for clarity. Add a note at the top of the Count Sheets page: "These templates are used as starting points when opening a new count session in the Counts module." Add a similar note at the top of the Counts page: "To load a template into a count, select a Count Template from the 'Template' dropdown."  
**Status:** [ ] pending

---

### 13. Productions page — "Build" tab name is vague
**File:** `src/app/admin/inventory/productions/page.tsx`  
**Issue:** The 3 tabs are "📦 Stock", "🏪 Pending Orders", "⚙️ Build". "Build" is ambiguous — it is actually where you (a) configure production recipes (BOM) per product, and (b) create individual custom production entries. First-time users don't know what to do here.  
**Fix:** Rename the tab to "⚙️ Custom Entry" or "⚙️ Recipe & Manual". Add a brief description inside the tab: "Use this tab to create a production entry manually, or to set up ingredient recipes (BOM) per product."  
**Status:** [ ] pending

---

### 14. Transfer Orders — status lifecycle is not visible
**File:** `src/app/admin/inventory/transfer-orders/page.tsx`  
**Issue:** Transfer orders are created with status "PENDING" but there is no UI to advance them to the next status (e.g., RECEIVED, COMPLETED, CANCELLED). The history table shows the status column but it is always "PENDING". Staff cannot close or acknowledge a transfer order from within the app.  
**Fix:** Add a status-update button to the order detail view in the history panel: e.g., "Mark as Received" to advance PENDING → RECEIVED. Or at minimum, document the lifecycle in the page subtitle so staff know what "PENDING" means and what happens next.  
**Status:** [ ] pending

---

### 15. Spot Checks — "Load Draft ↑" vs "Copy to Draft ↑" distinction unclear
**File:** `src/app/admin/inventory/spot-checks/page.tsx`  
**Issue:** Two similar-looking buttons appear near the item library: "Load Draft ↑" and "Copy to Draft ↑". The difference between loading (replacing the draft) and copying (merging into the draft) is not stated in the UI. Staff may press the wrong one and lose previously entered quantities.  
**Fix:** Rename to be explicit: "Replace Draft ↑" (clears current draft and loads selected items) vs "Add to Draft ↑" (merges selected items into existing draft). Add a brief tooltip or sub-label for each.  
**Status:** [ ] pending

---

## Summary Table

| # | Issue | File | Phase | Severity |
|---|-------|------|-------|----------|
| 1 | Japanese text in Counts confirm dialogs | counts/page.tsx | 5A | 🔴 High |
| 2 | No "Close & Post" guard (3 pages) | counts, spot-checks, qty-adj | 5A | 🔴 High |
| 3 | Japanese text in Productions delivery note | productions/page.tsx | 5A | 🔴 High |
| 4 | Transfer Orders city switch clears draft silently | transfer-orders/page.tsx | 5A | 🔴 High |
| 5 | Close Production has no confirmation guard | productions/page.tsx | 5B | 🟡 Medium |
| 6 | Ledger shows raw codes, no unit, no date filter | ledger/page.tsx | 5B | 🟡 Medium |
| 7 | Qty Adjustments DECREASE is default (fat-finger) | quantity-adjustments/page.tsx | 5B | 🟡 Medium |
| 8 | Items page ITEM/PRODUCT type naming confusion | items/page.tsx | 5B | 🟡 Medium |
| 9 | Sales Menu BOM jargon + unguarded sync | recipes/page.tsx | 5B | 🟡 Medium |
| 10 | Counts "Theo." and "Assets" column headers cryptic | counts/page.tsx | 5C | 🟢 Low |
| 11 | "Sync Master" button has no visible description | counts/page.tsx | 5C | 🟢 Low |
| 12 | "Count Sheets" vs "Counts" naming confusion | count-sheets/page.tsx | 5C | 🟢 Low |
| 13 | "Build" tab name is vague | productions/page.tsx | 5C | 🟢 Low |
| 14 | Transfer Orders status lifecycle not exposed | transfer-orders/page.tsx | 5C | 🟢 Low |
| 15 | "Load Draft ↑" vs "Copy to Draft ↑" unclear | spot-checks/page.tsx | 5C | 🟢 Low |
