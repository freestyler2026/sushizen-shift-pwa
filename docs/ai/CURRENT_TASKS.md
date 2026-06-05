# CURRENT_TASKS.md

Last updated: 2026-06-05 (session 10)

> **New session start protocol:**
> 1. Read `CLAUDE.md` (root) — always first
> 2. Read THIS file — understand where things left off
> 3. Load only the additional `docs/ai/` file(s) needed for the specific task

---

## ⚠️ Deployments Pending

### バックエンド (Heroku) — 必須
```bash
cd /Users/jaynishimura/Desktop/sushizen_shift_app_clean
git add -A && git commit -m "feat: add food_safety_score + organization_score, scoring 10items×10pts"
git push heroku HEAD:master --force
```

### フロントエンド (Vercel)
```bash
cd /Users/jaynishimura/Desktop/sushizen-shift-pwa
git add -A && git commit -m "feat: Food Safety & Organization items + full rubrics, 10×10pts scoring" && git push origin HEAD:main
```

---

## In Progress Tasks

なし

---

## Pending Tasks

なし

### Phase 3: 自動データ精度向上
- cancel_count: Manila branch名のマッピング精度改善（cancellations.branch vs branch_code）
- offline_rate_pct: store_name → branch_code マッピング追加
- low_rating_count: branchマッピング統一

### Phase 4: 比較チャート・月次トレンド
- 店舗間スコア比較グラフ（週次/月次）
- 低スコア自動アラート

---

## Recently Completed (2026-06-05 sessions 4–8) — すべてlive

| 修正 | ファイル | 内容 |
|---|---|---|
| Store Evaluation DBモジュール | `app/db_store_evaluation.py` | 新規テーブル2つ（store_daily_evaluations, store_eval_images）+ 全CRUD + PHT 14:00自動データロジック |
| Store Evaluation API | `app/store_evaluation_api.py` | 6エンドポイント: auto-data, today, submit, branches, admin summary/detail/trend/list |
| main.py登録 | `app/main.py` | store_evaluation_routerをimport+include |
| フロントエンド：店舗入力フォーム | `src/app/store/evaluation/page.tsx` | 8項目1〜5評価 + 4項目バイナリ + リアルタイムスコア + ルーブリック表示 + 自動データパネル |
| フロントエンド：管理閲覧ページ | `src/app/admin/store-evaluations/page.tsx` | Daily Summary（全店舗スコア表） + Branch Trend（日次履歴）+ 詳細モーダル |
| Storeプロキシ追加 | `src/app/api/store/[...slug]/route.ts` | /api/store/* をHerokuへ中継（既存adminプロキシと同パターン） |
| NavBar更新 | `src/components/NavBar.tsx` | 「Store Evaluation」を二次メニュー追加（役割ゲート）+「Store Evaluations」を管理メニューに追加 |

## Recently Completed (2026-06-04 session 3) — すべてlive

| 修正 | ファイル | 内容 |
|---|---|---|
| Receiving record 展開表示 | `src/app/store/procurement/receiving/page.tsx` | receiving recordをクリックすると注文アイテム一覧が展開表示。Confirmボタン前に内容確認可能 |
| CK Dispatch修正 | `app/inventory_db.py`, `app/db.py` | production close時にPOを自動生成 → CK Dispatchに表示。POなし旧オーダーもfallbackで表示。dispatch時にPO自動作成対応 |
| PO email/cc自動入力 | `app/main.py` | `suppliers.append()`に`email`と`cc_emails`を追加。Load Request時にVendor MasterのSuppier Email・CC Emailsが自動反映 |

## Recently Completed (2026-06-04 session 2) — すべてlive

| 修正 | ファイル | 内容 |
|---|---|---|
| CK catalog エラー修正 | `app/db.py`, `app/main.py` | source3の`suggested_unit_price`エラー除去。Kitchen IngredientタブにGolden Dunes等表示 |
| CK自動承認フラグ | `app/main.py`, `request/page.tsx` | `is_ck_order`フラグ導入。Manila CKオーダー常に自動承認 |
| モバイルSubmitバー | `request/page.tsx` | `z-40`→`z-[75]`でNavBar（z-70）の上に表示 |
| Store Procurement Requests | `store/procurement/page.tsx` | 全員表示・配送確認後に非表示・ラベル変更 |
| Order Catalog supplier dropdown | `catalog/page.tsx` | Supplier NameをVendor Master選択式に変更 |
| Hub expand アイテム表示 | `hub/page.tsx` | `data.request.items`参照に修正 |

## Recently Completed (2026-06-03) — すべてlive

| 修正 | 内容 |
|---|---|
| Heroku Postgres Essential-0 → Standard-0 | 接続上限 20→120 |
| DB接続プール拡張 | 63/120接続設計 |
| #10-#44 各タスク | Travel path, CK Dispatch/Receiving, Branch Addresses, PO tracking等 |

---

## Known Debt

### `admin/draft/page.tsx` — Sheet Proposals Removal (DO NOT TOUCH yet)
`sheetTabMain`, `sheetTabs`, `sheetTabsBusy`, `pendingVisibleRows`, `proposeFromSheet`, `DUBAI_DRAFT_SHEET_URL`, `selectedProposalIds`
**⚠️ Rule**: Line-number-based deletion ONLY. No regex.

### Vendor名照合（catalog_aliases）
Vendor MasterのOrder Catalog登録名と`supplier_name`が一致しない場合、PO作成時にemail/payment_termsが空になる。
**対処**: 該当ベンダーの`catalog_aliases`フィールドに旧称を登録する（Golden Dunes等）

---

## System State Snapshot

| Feature | Status |
|---|---|
| Heroku Postgres | ✅ Standard-0 (120接続) |
| CK catalog (Golden Dunes / Kitchen Ingredients) | ✅ live |
| CK自動承認 (is_ck_orderフラグ) | ✅ live |
| CK Production → CK Dispatch 連携 | ✅ live |
| Store Procurement Requests (全員・完了非表示) | ✅ live |
| Mobile Submit bar z-index | ✅ live |
| PO作成時 email/payment_terms自動入力 | ✅ live |
| Order Catalog supplier dropdown | ✅ live |
| Hub expand / Receiving record expand | ✅ live |
| Branch delivery addresses | ✅ live |
| PO email open tracking | ✅ live |
| CME メール未達 | ⏳ CME IT担当ホワイトリスト登録待ち |
| Store Daily Evaluation Phase 1–4 | ✅ live |
| インライン写真アップ（Backup/Station/Cleanliness/Awareness） | ✅ live |
| pytz → zoneinfo クラッシュ修正 | ✅ live |
| CK Dispatch "0"エラー修正 (KeyError→.get()) | ✅ live |
| Review & Submit パネル修正 (catalog reload) | ✅ live |
| Food Safety & Organization 項目追加 (10項目×10pt) | ⏳ デプロイ待ち |
| 全10項目 英語ルーブリック整備 | ⏳ デプロイ待ち |

---

## Heroku Diagnostics

```bash
heroku logs -a sushizen-shift-app -n 200 | grep -E "error|CK|dispatch" -i

heroku pg:psql -a sushizen-shift-app

# Reset attendance sync duplicate hash
UPDATE attendance_drive_sources SET last_sync_status = '' WHERE id = 1;
```
