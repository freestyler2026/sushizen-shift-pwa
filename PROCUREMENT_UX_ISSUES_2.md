# Procurement Channel — UX Issues Round 2

Identified: 2026-05-17 (second audit)  
Pages: `/store/procurement/` (home), `/request/`, `/receiving/`, `/claim/`

---

## Phase 4A — High Impact Fixes ✅ TARGET: Deploy first

### 1. Japanese text in success banner
**File:** `src/app/store/procurement/page.tsx` line 1297  
**Issue:** `setSubmitSuccessMsg(\`✓ ${requestNo} → IN REVIEW に変更されました\`)` mixes Japanese — non-Japanese staff can't read the confirmation.  
**Fix:** Change to `✓ ${requestNo} submitted — now IN REVIEW`  
**Status:** [x] done

### 2. Edit mode does not load existing request items
**File:** `src/app/store/procurement/request/page.tsx`  
**Issue:** `?edit=<requestId>` shows the amber badge but the form is blank — existing draft items are never fetched or applied to the catalog grid. User must re-enter every item from scratch.  
**Fix:** Add `editRequestItems` state; fetch request items when `editRequestId` is set; in `catalogGridItems` merge effect, overlay `qty/unit/unit_price` from `editRequestItems` onto matching catalog rows (match on `item_name + vendor_name`, case-insensitive).  
**Status:** [x] done

### 3. City switch clears cart without warning
**File:** `src/app/store/procurement/request/page.tsx` lines 692–701  
**Issue:** Changing city in the top-bar select immediately calls `setItems([])` — all entered quantities are lost silently. A manager who fat-fingers Dubai instead of Manila loses 20+ minutes of work.  
**Fix:** Add `pendingCitySwitch` state; when city changes AND `validItems.length > 0`, show confirmation modal "Switch to Dubai? Your current cart ({N} items) will be cleared." On confirm: apply switch. On cancel: revert select to current city.  
**Status:** [x] done

---

## Phase 4B — Medium Impact Fixes ✅ TARGET: Deploy second

### 4. "All received" button has no guard
**File:** `src/app/store/procurement/receiving/page.tsx` line 727–729  
**Issue:** One tap checks all items instantly. For 50-item orders, a fat-finger forces manual unchecking of every incorrect item.  
**Fix:** Add `checkAllConfirm` state; first tap shows inline "Mark all {N} items as received? [Yes] [No]"; second tap calls `checkAll()`.  
**Status:** [x] done

### 5. Claim form resets too aggressively after submit
**File:** `src/app/store/procurement/claim/page.tsx` lines 233–235  
**Issue:** After filing a claim, `description` and `responsibleParty` are cleared. If user files SHORTAGE and then immediately files QUALITY on the same delivery, they must re-enter responsible party and re-write a new description from scratch.  
**Fix:** After successful submit, only clear `amountImpact` (reset to "0"), `photoUrl`, `photoPreview`. Keep `claimType`, `responsibleParty`, `description` as-is so the next claim on the same delivery starts pre-filled.  
**Status:** [x] done

### 6. Date change silently resets catalog / quantities
**File:** `src/app/store/procurement/request/page.tsx`  
**Issue:** Changing `requestDate` triggers `loadItemCatalog()` which may return a different item set (Manila catalog is date-filtered). If new catalog has different `row_key`s, previously entered quantities are lost without warning.  
**Fix:** When `requestDate` changes and `validItems.length > 0`, show an amber info banner: "⚠ Changing the date reloads the catalog — some entered quantities may be reset." (non-blocking, just informational).  
**Status:** [x] done

---

## Phase 4C — Low Impact / Polish ✅ TARGET: Deploy third

### 7. Request list has no status/date filter
**Files:** All pages (home, receiving, claim request selectors)  
**Issue:** Up to 200 requests shown with no filter. Finding today's order requires scrolling.  
**Fix:** Add a simple status filter pill row (All / Draft / In Review / Approved / Returned) above the request list on the home page.  
**Status:** [x] done

### 8. Receiving form state lost on accidental request re-select
**File:** `src/app/store/procurement/receiving/page.tsx`  
**Issue:** If user has delivery date / quality / notes filled in and accidentally clicks a different request in the left panel, all form state is cleared.  
**Fix:** Track `formDirty` (true if any delivery form field has been touched); show a small warning "You have unsaved delivery details. Switch request?" with [Yes / Cancel] when a new request is clicked while `formDirty`.  
**Status:** [x] done

### 9. Success message auto-dismisses too quickly
**Files:** All pages  
**Issue:** Info/success banners use 8-second auto-dismiss. On mobile, a user who switches tabs or looks at the delivery slip for 10 seconds misses the confirmation.  
**Fix:** Extend auto-dismiss to 15 seconds. Add an X button to dismiss manually sooner.  
**Status:** [x] done

### 10. No keyboard shortcut / quick-submit for power users
**File:** `src/app/store/procurement/request/page.tsx`  
**Issue:** On desktop/iPad, there is no keyboard shortcut to move from catalog to review. Power users doing 10+ PRs per day must mouse to the "Review Before Submit" button every time.  
**Fix:** Add `onKeyDown` listener for Ctrl+Enter / Cmd+Enter on the page root to trigger "Review Before Submit" when `validItems.length > 0`.  
**Status:** [x] done

---

## Summary Table

| # | Issue | File | Phase | Priority |
|---|-------|------|-------|----------|
| 1 | Japanese success message | page.tsx | 4A | 🔴 High |
| 2 | Edit mode no item load | request/page.tsx | 4A | 🔴 High |
| 3 | City switch clears cart | request/page.tsx | 4A | 🔴 High |
| 4 | All received no guard | receiving/page.tsx | 4B | 🟡 Medium |
| 5 | Claim form over-resets | claim/page.tsx | 4B | 🟡 Medium |
| 6 | Date change resets qty | request/page.tsx | 4B | 🟡 Medium |
| 7 | No request list filter | all pages | 4C | 🟢 Low |
| 8 | Receiving form lost on re-select | receiving/page.tsx | 4C | 🟢 Low |
| 9 | Banner auto-dismiss too fast | all pages | 4C | 🟢 Low |
| 10 | No keyboard shortcut | request/page.tsx | 4C | 🟢 Low |
