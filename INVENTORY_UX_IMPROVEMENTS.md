# Inventory UX Improvements

## Background

Staff reported the Inventory channel is difficult to use. This document outlines the UX issues found after a full review of all inventory pages, organized into implementation phases.

---

## Phase 1 — Quick Wins (no structural changes)

**Goal:** Maximum impact with minimal risk. All changes are purely additive (labels, text, badge removal).

### 1-A. Add field labels to all settings inputs (all pages)

**Affected files:**
- `src/app/admin/inventory/counts/page.tsx`
- `src/app/admin/inventory/spot-checks/page.tsx`
- `src/app/admin/inventory/quantity-adjustments/page.tsx`
- `src/app/admin/inventory/productions/page.tsx`

**Problem:** Every page has a settings row with inputs (Branch, Date, PIC, Notes, etc.) that have NO visible labels — only placeholders. Once a value is entered, the placeholder disappears and it's unclear which field is which.

**Fix:** Wrap each input in a `<label>` or add a `text-xs text-neutral-400` label above each field.

---

### 1-B. Auto-load count sheet on template select (Counts page)

**Affected files:**
- `src/app/admin/inventory/counts/page.tsx`

**Problem:** Users must (1) select a count sheet from the dropdown, then (2) press a separate "Load" button. This is a 2-step process that can be simplified.

**Fix:** Call the load function inside the `onChange` handler of the count sheet `<select>` element, eliminating the separate Load button.

---

### 1-C. Remove "Backend ready" badges from Dashboard

**Affected files:**
- `src/app/admin/inventory/page.tsx`

**Problem:** All 11 module cards display a "Backend ready" badge. This is meaningless to staff — it looks like a developer note that was never cleaned up.

**Fix:** Remove the badge. Optionally replace with a more useful label (e.g., module category or description).

---

### 1-D. Add usage description to Spot Check page

**Affected files:**
- `src/app/admin/inventory/spot-checks/page.tsx`

**Problem:** New staff opening the Spot Check page sees an empty split-panel with no explanation of what this module does or how it differs from Full Count.

**Fix:** Add a one-line description in the header: "Use spot checks to count selected items at any time, independent of the monthly Full Count cycle."

---

### 1-E. Unify error/success message styles across all pages

**Affected files:**
- `src/app/admin/inventory/productions/page.tsx` (uses plain `text-sm text-rose-300`)
- All other inventory pages already use card-style messages

**Fix:** Replace plain text error/success with the standard rounded card style used on other pages:
```tsx
// Standard style (already used on counts, spot-checks, qty-adjustments):
<div className="mt-3 rounded-xl bg-rose-950/30 px-3 py-2 text-sm text-rose-300">{error}</div>
<div className="mt-3 rounded-xl bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">{success}</div>
```

---

## Phase 2 — Medium Complexity (logic + layout changes)

**Goal:** Reduce column clutter, prevent accidental data loss, improve item selection flow.

### 2-A. Counts page: hide rarely-used columns behind a toggle

**Affected files:**
- `src/app/admin/inventory/counts/page.tsx`

**Problem:** The count table shows 10+ columns including "Foodics Qty", "Order Diff", "Order Qty" that are not needed for the core counting task. This causes horizontal scrolling and makes the "Counted" input hard to find.

**Fix:** Add a "Show Details" toggle. Default view shows only: Item / Unit / Theoretical / Counted / Variance / Memo. Toggled view adds: Supplier / Price / Order Qty / Foodics / Order Diff.

---

### 2-B. City switch confirmation dialog (all pages with draft state)

**Affected files:**
- `src/app/admin/inventory/counts/page.tsx`
- `src/app/admin/inventory/spot-checks/page.tsx`
- `src/app/admin/inventory/productions/page.tsx`

**Problem:** Switching City resets all draft data (lines entered, selected records) with no warning. One accidental tap destroys all entered data.

**Fix:** Check if draft data exists before applying city change. If yes, show `window.confirm()` dialog: "Switching city will clear your current draft. Continue?"

---

### 2-C. Spot Check: Add "Add All" button per supplier group

**Affected files:**
- `src/app/admin/inventory/spot-checks/page.tsx`

**Problem:** Items must be added one by one from the Item Library. Adding all items of a given supplier requires N button presses.

**Fix:** Add a small "Add All" button next to each supplier group header in the Item Library panel. Clicking it appends all items from that supplier that are not already in the draft.

---

### 2-D. Productions: improve empty state when no recipes defined

**Affected files:**
- `src/app/admin/inventory/productions/page.tsx`

**Problem:** When no production recipes are defined, the Stock tab shows a small text message. Staff may not understand they need to go to the Build tab first, blocking them from entering any production data.

**Fix:** Show a more prominent callout with a direct "Go to Build tab →" button. Also show all registered products in the Stock tab regardless of whether they have a recipe (items without recipes get a subtle "No recipe" indicator instead of being hidden).

---

## Phase 3 — Larger Work (new data/API requirements)

**Goal:** Proactive status display, contextual help.

### 3-A. Dashboard: show last activity per module card

**Affected files:**
- `src/app/admin/inventory/page.tsx`

**Problem:** Dashboard cards show no activity status — staff can't tell if a module has pending work.

**Fix:** Fetch lightweight summary data on dashboard load and display in each card:
- Counts: "Last count: May 13 · 3 drafts open"
- Spot Checks: "5 this month"
- Productions: "2 pending orders"
- Quantity Adjustments: "Last: May 10"

*Note: Implemented client-side using existing endpoints (counts, spot-checks, productions/ck-pending, quantity-adjustments) with a parallel Promise.all() fetch after auth resolves. No new backend endpoints required.*

---

## Implementation Status

| # | Item | Phase | Status |
|---|------|-------|--------|
| 1-A | Field labels (all pages) | 1 | ✅ Done |
| 1-B | Auto-load count sheet | 1 | ✅ Done |
| 1-C | Remove "Backend ready" badges | 1 | ✅ Done |
| 1-D | Spot check description | 1 | ✅ Done |
| 1-E | Unify error/success styles | 1 | ✅ Done |
| 2-A | Counts column toggle | 2 | ✅ Done |
| 2-B | City switch confirmation | 2 | ✅ Done |
| 2-C | Spot check "Add All" per supplier | 2 | ✅ Done |
| 2-D | Productions empty state | 2 | ✅ Done |
| 3-A | Dashboard activity status | 3 | ✅ Done (implemented client-side using existing endpoints) |
