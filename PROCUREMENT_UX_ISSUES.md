# Procurement Channel — UX Issues & Fix Plan

Identified: 2026-05-17  
Pages: `/store/procurement/` (home), `/request/`, `/receiving/`, `/claim/`

---

## Phase 1 — Quick Wins (Low Risk) ✅ TARGET: Deploy first

### 1. Japanese text in English UI  
**File:** `src/app/store/procurement/page.tsx` line 383  
**Issue:** Submit confirmation reads `を承認申請に提出します。よろしいですか？` — violates UI language rule (all UI must be English).  
**Fix:** Replace with `Submit {request_no} for approval?`  
**Status:** [x] done

### 2. Request page — edit mode not indicated  
**File:** `src/app/store/procurement/request/page.tsx`  
**Issue:** When opened with `?edit=r1`, page looks identical to "Create New". User doesn't know they're editing an existing request.  
**Fix:** Read `?edit=` param on mount; show amber badge "Editing Request #XXX" near the page title.  
**Status:** [x] done

### 3. Receiving page — Confirm button has no guard  
**File:** `src/app/store/procurement/receiving/page.tsx` line 924–936  
**Issue:** Clicking "Confirm" immediately finalizes the delivery — irreversible, no confirmation dialog.  
**Fix:** Add `confirmTarget` state; first click shows inline "Confirm delivery for {receiving_no}? [Yes] [Cancel]"; second click calls `confirmReceiving`.  
**Status:** [x] done

### 4. Request page — Draft vs Submit path unclear in review modal  
**File:** `src/app/store/procurement/request/page.tsx` lines 1032–1097  
**Issue:** Review modal shows same "Step 2: Review..." heading for both draft-save and submit paths. Buttons say "Confirm and Create Draft" or "Confirm and Submit Request" but no colored badge/indicator shows which path before user reads fine print.  
**Fix:** Add a colored pill badge at top of modal — amber for Draft, green for Submit — so the mode is immediately visible.  
**Status:** [x] done

---

## Phase 2 — Medium Complexity ✅ TARGET: Deploy second

### 5. Receiving page — checklist and delivery form not visually separated  
**File:** `src/app/store/procurement/receiving/page.tsx`  
**Issue:** Item checklist and delivery details form are stacked with no "Step 1 / Step 2" separation. Users skip checklist and go straight to form.  
**Fix:** Add `STEP 1 — Check Items Received` and `STEP 2 — Delivery Details` section headers with numbered badges.  
**Status:** [x] done

### 6. Claim page — photo required UX  
**File:** `src/app/store/procurement/claim/page.tsx`  
**Issue:** When `requiresPhoto` is true and user attempts submit: button is disabled but the reason (no photo) is easy to miss. The hint "Attach a photo to enable submit" is small and below the button.  
**Fix:** When submit is attempted without photo AND requiresPhoto, show an amber banner inline directly below the photo upload button: "⚠ Photo is required before you can submit a SHORTAGE or QUALITY claim."  
**Status:** [x] done

### 7. All pages — raw API error strings shown to user  
**File:** All four procurement pages  
**Issue:** `catch (e: any) { setError(e?.message || String(e)) }` shows raw backend error text (e.g., "500 Internal Server Error") with no user-friendly guidance.  
**Fix:** Add `friendlyProcurementError(e)` helper in `procurementClient.ts` that maps common patterns to readable messages, with a fallback "Something went wrong. Please try again."  
**Status:** [x] done

---

## Phase 3 — UX Additions ✅ TARGET: Deploy third

### 8. Claim page — no duplicate claim warning  
**File:** `src/app/store/procurement/claim/page.tsx`  
**Issue:** If selected request already has open claims (OPEN/PENDING status), user can file another without any warning.  
**Fix:** When request is selected, check `detail?.claims[]` for any non-CLOSED entry; show amber banner "This request already has an open claim ({claim_no}). Continue?" with a dismiss option.  
**Status:** [x] done

### 9. Claim page — status filter requires manual Refresh  
**File:** `src/app/store/procurement/claim/page.tsx`  
**Issue:** Changing `statusFilter` dropdown doesn't reload — user must click Refresh. No indication that filter is pending.  
**Fix:** Add `useEffect` on `statusFilter` that calls `loadClaims()` automatically; remove the need for manual refresh after filter change.  
**Status:** [x] done

### 10. Receiving page — no auto-scroll to new record  
**File:** `src/app/store/procurement/receiving/page.tsx`  
**Issue:** After "Record Delivery" succeeds, new record appears at bottom of page but viewport stays at form. User may miss the created record.  
**Fix:** After `setLastCreatedId(...)`, use `requestAnimationFrame(() => document.getElementById("receiving-records")?.scrollIntoView({ behavior: "smooth" }))`. Add `id="receiving-records"` to the records section.  
**Status:** [x] done

---

## Summary Table

| # | Issue | File | Phase | Priority |
|---|-------|------|-------|----------|
| 1 | Japanese text in UI | page.tsx | 1 | 🔴 High |
| 2 | Edit mode not indicated | request/page.tsx | 1 | 🔴 High |
| 3 | Confirm button no guard | receiving/page.tsx | 1 | 🔴 High |
| 4 | Draft/Submit path unclear | request/page.tsx | 1 | 🔴 High |
| 5 | No step separation in receiving | receiving/page.tsx | 2 | 🟡 Medium |
| 6 | Photo required UX | claim/page.tsx | 2 | 🟡 Medium |
| 7 | Raw API errors shown | all pages | 2 | 🟡 Medium |
| 8 | No duplicate claim warning | claim/page.tsx | 3 | 🟢 Low |
| 9 | Filter no auto-reload | claim/page.tsx | 3 | 🟢 Low |
| 10 | No auto-scroll after record | receiving/page.tsx | 3 | 🟢 Low |
