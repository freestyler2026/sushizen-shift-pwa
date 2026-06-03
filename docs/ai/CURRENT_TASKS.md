# CURRENT_TASKS.md

Last updated: 2026-06-03 (session 2)

> **New session start protocol:**
> 1. Read `CLAUDE.md` (root) — always first
> 2. Read THIS file — understand where things left off
> 3. Load only the additional `docs/ai/` file(s) needed for the specific task

---

## ⚠️ Deployments Pending (must run before testing)

These changes are written to disk but **not yet live on Heroku/Vercel**.

### Backend (`sushizen_shift_app_clean`) — ✅ **v1149 デプロイ済み（2026-06-03）**

### Frontend (`sushizen-shift-pwa`) — `git push origin main`

| Change | File | Description |
|---|---|---|
| CK Production selector colors | `src/app/admin/inventory/productions/page.tsx` | `text-white` on all `<select>` |
| Direct purchase draft persistence | `src/app/store/purchase/page.tsx` | sessionStorage draft for iOS PWA |
| Vendor dropdown slice removed | `src/app/store/purchase/page.tsx` | All vendors shown (was cut at 10/5) |
| Branch Addresses page | `src/app/admin/procurement/delivery-addresses/page.tsx` | New admin page |
| Branch Addresses nav tab | `src/components/ProcurementTabs.tsx` | "Branch Addresses" in Admin group |
| PO open tracking display | `src/app/admin/procurement/pos/page.tsx` | Email log shows "📬 Opened" + "✅ Confirmed" |
| AI documentation | `docs/ai/*.md`, `CLAUDE.md` | 7-file selective-load doc structure |
| Task #10 — travel-path frontend | `src/app/admin/travel-path/page.tsx` | 914-line travel path input/management page |
| Task #36 — ck-production page | `src/app/store/ck-production/page.tsx` | 776-line CK staff dispatch page |
| Task #37 — receiving update | `src/app/store/receiving/page.tsx` | Uses `dispatched_items_json`, shows shortage warnings |
| Task #38 — ck-orders shortage | `src/app/admin/procurement/ck-orders/page.tsx` | Shows `has_shortage` flag and dispatched quantities |
| Task #39 — NavBar CK link | `src/components/NavBar.tsx` | CK Dispatch link added |

### Deploy commands (user runs from local terminal)
```bash
# Backend first
cd /Users/jaynishimura/Desktop/sushizen_shift_app_clean
git add -A && git commit -m "feat: CK detection fix, PO tracking pixel, branch delivery addresses, PO PDF word-wrap, DB pool expansion"
git push heroku HEAD:master --force

# Then frontend
cd /Users/jaynishimura/Desktop/sushizen-shift-pwa
git add -A && git commit -m "feat: all tasks #10 #36 #37 #38 #39 + branch addresses + PO tracking + docs"
git push origin main
```

### Post-deploy verification
1. `/store/procurement/request` → submit CK order → auto-approve → appears in `/admin/inventory/productions` Pending Orders
2. `/admin/procurement/delivery-addresses` → "Branch Addresses" tab visible in Admin nav
3. `/admin/procurement/pos` → send PO → email log shows "📬 Opened" after email opened
4. `/store/ck-production` → CK staff can see pending orders and dispatch
5. `/store/receiving` → shows dispatched items with shortage flags
6. `/admin/procurement/ck-orders` → shows `has_shortage` badge on affected orders
7. `/admin/travel-path` → travel path input/management visible

---

## In Progress Tasks

なし — 全タスク実装済み、デプロイ待ち

---

## Pending Tasks

なし — 全タスク実装済み、デプロイ待ち

---

## Recently Completed (session 2 — 2026-06-03)

| Task | File | Description |
|---|---|---|
| #10 | `src/app/admin/travel-path/page.tsx` | Travel path frontend (914行) — バックエンド完了済みにフロント追加 |
| #36 | `src/app/store/ck-production/page.tsx` | CKスタッフ dispatch画面 (776行) |
| #37 | `src/app/store/receiving/page.tsx` | `dispatched_items_json` 対応、shortage警告表示 |
| #38 | `src/app/admin/procurement/ck-orders/page.tsx` | `has_shortage` フラグ・数量差分表示 |
| #39 | `src/components/NavBar.tsx` | CK Dispatch リンク追加 |
| #40 | `app/db.py` etc. | CK vendor_name="CK" 検出修正 (3箇所) |
| #41 | `src/app/admin/inventory/productions/page.tsx` | セレクター文字色白に修正 |
| #42 | `app/services/procurement_po_mail.py` | 店舗配送住所ハードコード更新 |
| #43 | `app/db.py`, `app/main.py` | `proc_branch_delivery_addresses` DB + API |
| #44 | `src/app/admin/procurement/delivery-addresses/page.tsx` | Branch Addresses 管理ページ |
| — | `app/services/procurement_po_mail.py` | PO PDF word-wrap修正 |
| — | `app/main.py` + DB | PO email open tracking pixel実装 |
| — | `src/app/store/purchase/page.tsx` | sessionStorage draft + vendor dropdown修正 |
| — | DB (live) | 全Dubai/Manila店舗住所登録済み |
| — | `docs/ai/` + `CLAUDE.md` | AIドキュメント構造作成 |
| — | Heroku (live) | **Postgres Essential-0 → Standard-0 移行完了**（接続上限 20→120）旧DB(postgresql-pointy-89354)削除済み |
| — | `app/db.py` etc. | DB接続プールサイズ拡張（63/120接続設計）— バックエンドデプロイ待ち |

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
| Heroku Postgres プラン | ✅ **Essential-0 → Standard-0 移行完了（live）** |
| DB接続プールサイズ | ✅ 拡張済み(63/120) — **live (v1149)** |
| CK order auto-detection (`vendor_name="CK"`) | ✅ Fixed — **live (v1149)** |
| CK Dispatch page (`/store/ck-production/`) | ✅ Built (776行) — pending frontend deploy |
| CK Receiving with shortage check | ✅ Built — pending frontend deploy |
| CK shortage flags in admin | ✅ Built — pending frontend deploy |
| PO email open tracking | ✅ Built — pending both deploys |
| Branch delivery addresses DB + UI | ✅ Data live in DB; UI pending frontend deploy |
| PO PDF word-wrap | ✅ Fixed — **live (v1149)** |
| Travel path frontend | ✅ Built (914行) — pending frontend deploy |
| CME メール未達問題 | ⏳ CME IT担当によるホワイトリスト登録待ち（`sushizengroup.com` / Google Gmail API）|

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
