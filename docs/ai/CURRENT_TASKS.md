# CURRENT_TASKS.md

Last updated: 2026-06-04

> **New session start protocol:**
> 1. Read `CLAUDE.md` (root) — always first
> 2. Read THIS file — understand where things left off
> 3. Load only the additional `docs/ai/` file(s) needed for the specific task

---

## ⚠️ Deployments Pending

なし — 全変更デプロイ済み

---

## In Progress Tasks

なし

---

## Pending Tasks

なし

---

## Recently Completed (2026-06-04) — すべてlive

| Task | File | Description |
|---|---|---|
| — | `app/db.py` | CK catalog バグ修正 — `list_ck_items_as_catalog_rows()` に `proc_curated_catalog_items` ソース追加。Golden Dunes・Quartzaline が Central Kitchen タブに表示される |
| — | `src/app/admin/procurement/catalog/page.tsx` | Order Catalog Supplier Name を Vendor Master 選択式ドロップダウンに変更 |
| — | `src/app/admin/procurement/hub/page.tsx` | Hub expand: `data.items` → `data.request.items` 修正。`>` クリックでアイテム展開できるようになった |

## Recently Completed (2026-06-03) — すべてlive

| Task | File | Description |
|---|---|---|
| — | Heroku | **Postgres Essential-0 → Standard-0 移行完了**（接続上限 20→120） |
| — | `app/db.py` etc. | DB接続プールサイズ拡張（63/120接続） |
| #10 | `src/app/admin/travel-path/page.tsx` | Travel path frontend (914行) |
| #36 | `src/app/store/ck-production/page.tsx` | CKスタッフ dispatch画面 (776行) |
| #37 | `src/app/store/receiving/page.tsx` | `dispatched_items_json` 対応、shortage警告表示 |
| #38 | `src/app/admin/procurement/ck-orders/page.tsx` | `has_shortage` フラグ・数量差分表示 |
| #39 | `src/components/NavBar.tsx` | CK Dispatch リンク追加 |
| #40 | `app/db.py` etc. | CK vendor_name="CK" 検出修正 (3箇所) |
| #41 | `src/app/admin/inventory/productions/page.tsx` | セレクター文字色白に修正 |
| #42–44 | various | Branch Addresses DB + API + UI |
| — | `app/services/procurement_po_mail.py` | PO PDF word-wrap修正 |
| — | `app/main.py` + DB | PO email open tracking pixel実装 |
| — | `src/app/store/purchase/page.tsx` | sessionStorage draft + vendor dropdown修正 |
| — | `src/app/admin/procurement/pos/page.tsx` | PO open tracking 表示（📬 Opened / ✅ Confirmed） |

---

## Known Debt

### `admin/draft/page.tsx` — Sheet Proposals Removal (DO NOT TOUCH yet)
Identifiers to remove when safe:
`sheetTabMain`, `sheetTabs`, `sheetTabsBusy`, `pendingVisibleRows`, `proposeFromSheet`, `DUBAI_DRAFT_SHEET_URL` (variable only), `selectedProposalIds`, JSX "Pending Sheet Proposals" block (~line 2028).

**⚠️ Rule**: Line-number-based deletion ONLY. No regex.

---

## System State Snapshot

| Feature | Status |
|---|---|
| Heroku Postgres | ✅ Standard-0 (120接続, live) |
| DB接続プール | ✅ 63/120接続設計 (live) |
| CK order auto-detection | ✅ live |
| CK catalog (Golden Dunes 等) | ✅ live |
| Order Catalog supplier dropdown | ✅ live |
| Hub expand アイテム表示 | ✅ live |
| CK Dispatch page (`/store/ck-production/`) | ✅ live |
| CK Receiving with shortage check | ✅ live |
| CK shortage flags in admin | ✅ live |
| PO email open tracking | ✅ live |
| Branch delivery addresses UI | ✅ live |
| Travel path frontend | ✅ live |
| CME メール未達 | ⏳ CME IT担当ホワイトリスト登録待ち |

---

## Heroku Diagnostics

```bash
heroku logs -a sushizen-shift-app -n 200 | grep -E "error|CK|dispatch|tracking" -i

heroku pg:psql -a sushizen-shift-app

# Check branch addresses
SELECT city, store_code, address FROM proc_branch_delivery_addresses ORDER BY city, store_code;

# Check PO email open tracking
SELECT po_id, recipient_email, opened_at, open_count, receipt_confirmed_at
FROM proc_po_email_logs ORDER BY created_at DESC LIMIT 10;

# Reset attendance sync duplicate hash
UPDATE attendance_drive_sources SET last_sync_status = '' WHERE id = 1;
```
