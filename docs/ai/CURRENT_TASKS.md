# CURRENT_TASKS.md

Last updated: 2026-06-04 (session 2)

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

## Recently Completed (2026-06-04 session 2) — すべてlive

| 修正 | ファイル | 内容 |
|---|---|---|
| CK catalog エラー修正 | `app/db.py` | `list_ck_items_as_catalog_rows()` source3の `suggested_unit_price` エラーを除去。Kitchen Ingredientsタブに `CK_WH_to_supplier` アイテム（Golden Dunes等）を表示 |
| CK自動承認フラグ | `app/main.py`, `src/app/store/procurement/request/page.tsx` | Manila CKタブ選択時に `is_ck_order: true` フラグ送信 → vendor_name依存の不整合を解消 |
| モバイルSubmitバー z-index | `src/app/store/procurement/request/page.tsx` | `z-40` → `z-[75]` でNavBar（z-[70]）の上に表示されるよう修正 |
| Store Procurement Requests | `src/app/store/procurement/page.tsx` | ① `requested_by` フィルター削除（全員のリクエストを表示）② `receiving_status=CONFIRMED` 以降を非表示（ステップ3完了＝完了）③ ラベル「My Requests」→「Requests (X active)」 |
| Order Catalog supplier dropdown | `src/app/admin/procurement/catalog/page.tsx` | Supplier Name をVendor Master選択式ドロップダウンに変更 |
| Hub expand アイテム表示 | `src/app/admin/procurement/hub/page.tsx` | `data.items` → `data.request.items` 修正 |

## Recently Completed (2026-06-04 session 1) — すべてlive

| 修正 | ファイル | 内容 |
|---|---|---|
| CK catalog Golden Dunes修正 | `app/db.py` | `list_ck_items_as_catalog_rows()` + `main.py` Kitchen Ingredients APIに `CK_WH_to_supplier` 追加 |
| Order Catalog supplier dropdown | `src/app/admin/procurement/catalog/page.tsx` | Supplier Name 選択式化 |

## Recently Completed (2026-06-03) — すべてlive

| 修正 | 内容 |
|---|---|
| Heroku Postgres Essential-0 → Standard-0 移行 | 接続上限 20→120 |
| DB接続プール拡張 | 63/120接続設計 |
| #10 Travel path frontend | 914行 |
| #36 CK Dispatch page | 776行 |
| #37 CK Receiving shortage対応 | dispatched_items_json使用 |
| #38 CK Orders shortage flags | has_shortage表示 |
| #39 NavBar CK Dispatch リンク | 追加 |
| #40 CK vendor_name="CK" 検出修正 | 3箇所 |
| #41 CK Production selector 文字色 | text-white |
| #42–44 Branch Addresses DB + API + UI | 全店舗住所登録 |
| PO PDF word-wrap | 修正 |
| PO email open tracking pixel | 実装 |
| Direct Purchase sessionStorage draft | 修正 |

---

## Known Debt

### `admin/draft/page.tsx` — Sheet Proposals Removal (DO NOT TOUCH yet)
Identifiers: `sheetTabMain`, `sheetTabs`, `sheetTabsBusy`, `pendingVisibleRows`, `proposeFromSheet`, `DUBAI_DRAFT_SHEET_URL`, `selectedProposalIds`

**⚠️ Rule**: Line-number-based deletion ONLY. No regex.

---

## System State Snapshot

| Feature | Status |
|---|---|
| Heroku Postgres | ✅ Standard-0 (120接続, live) |
| DB接続プール | ✅ 63/120接続 (live) |
| CK order auto-detection | ✅ live (vendor_name + is_ck_order flag) |
| CK catalog (Golden Dunes / Kitchen Ingredients) | ✅ live |
| Order Catalog supplier dropdown | ✅ live |
| Hub expand アイテム表示 | ✅ live |
| Store Procurement Requests (全員表示・完了非表示) | ✅ live |
| Mobile Submit bar (z-index修正) | ✅ live |
| CK Dispatch / Receiving / shortage flags | ✅ live |
| PO email open tracking | ✅ live |
| Branch delivery addresses | ✅ live |
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
