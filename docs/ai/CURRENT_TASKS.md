# CURRENT_TASKS.md

Last updated: 2026-06-07 (session 34 — end)

> **New session start protocol:**
> 1. Read `CLAUDE.md` (root) — always first
> 2. Read THIS file — understand where things left off
> 3. Load only the additional `docs/ai/` file(s) needed for the specific task

---

## ⚠️ Deployments Pending

- **Manila P&L データ** — `/Users/jaynishimura/Downloads/[Manila] PLアプリ用データ (3).xlsx` (8シート: 202510〜202605) は DB 未インポート
  - 対処: Management P&L ページ → Summary タブ → **「Upload Excel」ボタン**でファイルを選択してアップロード
  - インポート成功後、5月の正確な数値が表示される: Revenue 2,903,278 / Opex 3,179,308 / Operating Profit -276,029

## Recently Completed (2026-06-07 session 34) — live (Heroku v1201)

| 修正 | ファイル | 内容 |
|---|---|---|
| P&L データ欠落警告バナー | `src/app/admin/finance/page.tsx` | P&L 未インポート月選択時に amber 警告バナーを表示。KPI ラベルを "Opex (target-based est.)" / "Est. operating profit" に動的切替 |
| Upload Excel ボタン追加 | `src/app/admin/finance/page.tsx` | "Sync P&L from Google" の隣に "Upload Excel" ボタン追加。全シート一括インポートエンドポイントを呼ぶ |
| P&L Excel 全シート一括インポート | `app/services/pl_excel_import.py`, `app/main.py` | `import_all_pl_excel_sheets_bytes()` 追加。`POST /api/admin/pl/import/excel/all-sheets` エンドポイント追加 |

### 問題の根本原因（2026/05 Manila P&L が Wrong）
- 5月 P&L データが DB に未登録 → app が4月データにフォールバック（Revenue = 2,138,285）
- Operating Profit 405,037 は「売上 × (1-63%)」のターゲット比率試算値（実データではない）
- FLR cost / Other expenses が「—」なのが P&L データなしの証拠
- **Fix**: 上記「Upload Excel」ボタンから Excel ファイルをアップロード → 正確な数値が表示される

## Recently Completed (2026-06-07 session 33) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| HR バグ修正 + テスト環境 | `app/db_hr.py`, `app/main.py`, 4フロントページ, `tests_pure/test_hr_pure.py` | 発見バグ18件を修正。純粋関数テスト51件追加（合計98テスト全PASS） |

### 修正バグ一覧
| # | 重大度 | 場所 | 内容 |
|---|---|---|---|
| 1 | CRITICAL | main.py | PATCH /onboarding/items/{id} が /onboarding/{id} より後に定義 → 到達不能（FastAPI route 衝突） |
| 2 | CRITICAL | main.py | PATCH /separations/items/{id} が /separations/{id} より後 → 同上 |
| 3 | CRITICAL | db_hr.py | create_separation: plain cursor で row[0] → None 時クラッシュ |
| 4 | CRITICAL | separation/page.tsx | API_BASE なしのベアパス fetch → 本番環境でルーティング不整合 |
| 5 | CRITICAL | separation/page.tsx | refreshAuthFromApi / ログインリダイレクトがない |
| 6 | CRITICAL | performance/page.tsx | Draft 保存がスコア0検証でブロック（Submit 時のみに限定すべき） |
| 7 | HIGH | db_hr.py | update_separation_item: plain cursor row[0]/pending_row[0] |
| 8 | HIGH | db_hr.py | sync_review_schedules: conn.close() 後に RealDictRow.get() |
| 9 | HIGH | db_hr.py | 6関数で WHERE id=%s に ::uuid キャスト欠落 |
| 10 | HIGH | separation/page.tsx | DetailPanel が毎回 items を再フェッチ（既ロード時スキップ不可） |
| 11 | HIGH | separation/page.tsx | ChecklistItemRow Save ボタンに isDirty ガードなし |
| 12 | HIGH | separation/page.tsx | allDone: total_items=0 のとき永久 false |
| 13 | HIGH | separation/page.tsx | header フィールドが別レコード開時に stale データをフラッシュ |
| 14 | HIGH | onboarding/page.tsx | handleItemUpdated の stale closure（items を古い参照で渡す） |
| 15 | HIGH | performance/page.tsx | handleAcknowledge が res.ok チェックなし → 失敗時サイレント |
| 16 | HIGH | performance/page.tsx | handleSync が非 2xx エラーをサイレント無視 |
| 17 | MEDIUM | recruitment/page.tsx | DetailPanel に key prop なし → 別 applicant 選択時 stale state 残存 |

### テスト環境（`tests_pure/test_hr_pure.py`）
- `_compute_grade()` — 境界値含む全グレード (Excellent/Good/Satisfactory/NI/Unsat)
- `ONBOARDING_ITEMS` — 16件・重複なし・カテゴリ全検証
- `SEPARATION_ITEMS` — 13件・重複なし・カテゴリ全検証
- `REVIEW_TYPES` / `SEPARATION_TYPES` — キー・ラベル検証
- alert_level 境界値 (OVERDUE/URGENT/SOON/UPCOMING)
- 正規化 alert_level 境界値 (EXPIRED/CRITICAL/WARNING)
- レビュースケジュール日付計算 (90日・180日・150日・12月1日)

## Recently Completed (2026-06-07 session 32) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| HR Offboarding フロントエンド (Phase C-4) | `src/app/admin/hr/separation/page.tsx` (新規), `src/components/NavBar.tsx` | 離職管理ページ。カード一覧 + 詳細パネル (日付/Final Pay/チェックリスト)。13項目チェックリスト (Exit/Clearance/Final Pay/Documents)。NavBarに HR Offboarding リンク追加 |
| HR Offboarding バックエンド (Phase C-4) | `app/db_hr.py` (追記), `app/main.py` (追記) | hr_separation + hr_separation_items テーブル。create/list/detail/update/update_item。5エンドポイント。pending=0 で自動 complete 昇格 |
| HR Performance Review フロントエンド (Phase C-2) | `src/app/admin/hr/performance/page.tsx` (新規), `src/components/NavBar.tsx` | 3タブ (Upcoming/History/New Review)。スコアボタン1-5、live合計/グレード、昇給推薦、Save Draft/Submit |
| HR Performance Review バックエンド (Phase C-2) | `app/db_hr.py` (追記), `app/main.py` (追記) | hr_performance_reviews + hr_review_schedule。sync_review_schedules() で3ヶ月/6ヶ月/年次を自動生成。OVERDUE/URGENT/SOON/UPCOMING アラートレベル |

### HR Offboarding 13項目
| カテゴリ | 項目 |
|---|---|
| 🚪 Exit Process | Resignation Letter, Exit Interview, 30-Day Notice |
| ✅ Clearance | Uniform, Equipment, Loans/Advances, Keys/Access Cards |
| 💰 Final Pay | Computed, Released |
| 📋 Documents | COE Issued, SSS R-5, PhilHealth Update, Pag-IBIG Update |

### HR システム全フェーズ完了状態
| フェーズ | 内容 | 状態 |
|---|---|---|
| Phase A | 採用パイプライン (Kanban) | ✅ live |
| Phase B | オンボーディング書類管理 | ✅ live |
| C-1 | 正規化トラッカー (Renewals) | ✅ live |
| C-2 | パフォーマンスレビュー | ✅ live |
| C-4 | 離職管理 (Offboarding) | ✅ live |

## Recently Completed (2026-06-07 session 29) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| HR Onboarding フロントエンド (Phase B) | `src/app/admin/hr/onboarding/page.tsx` (新規), `src/components/NavBar.tsx` | 16項目チェックリスト管理ページ。RecordCard（デュアル進捗バー）+ DetailPanel（カテゴリ別アイテム編集）+ AddModal。NavBarにリンク追加 |
| HR Onboarding バックエンド (Phase B) | `app/db_hr.py` (末尾399行追記), `app/main.py` (末尾95行追記) | DB: hr_onboarding / hr_onboarding_items テーブル + ONBOARDING_ITEMS定数(16項目) + ensure_onboarding_tables() + 5つのCRUD関数。API: /api/admin/hr/onboarding に5エンドポイント追加 |

### Onboarding 16項目
| カテゴリ | 項目 |
|---|---|
| 🏛️ Government | SSS, PhilHealth, Pag-IBIG, TIN, NBI Clearance |
| 🏥 Health | Health Certificate, Food Handler Certificate |
| 🏦 Bank | Bank Account (Payroll) |
| 📄 Contract | Employment Contract, NDA, Uniform Size & Issue |
| 🎓 Orientation | Store Rules, POS Training, Hygiene Training, Week 1 Check-in, Month 1 Check-in |

### Onboarding 自動ロジック
- `create_onboarding()`: ON CONFLICT で既存レコードを in_progress にリセット、16 items を自動seed
- `update_onboarding_item()`: status=submitted 時に submitted_at を自動set、全 items が pending=0 になったら親を complete に自動昇格

### 今後の残タスク (HR)
- Phase C-2 バックエンド: APIエンドポイント実装 (see session 30 pending tasks above)
- Phase C-4: 離職管理 (Offboarding)

## Recently Completed (2026-06-07 session 28) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| HR採用パイプライン Phase A (新規実装) | `app/db_hr.py` (新規), `app/main.py` | DB: hr_job_requisitions / hr_applicants / hr_interview_schedules / hr_interview_evaluations / staff_regularization の5テーブル + CRUD関数一式。API: /api/admin/hr/* に16エンドポイント追加 |
| HR Recruitment Kanban ページ (新規) | `src/app/admin/hr/recruitment/page.tsx` | マニラ専用 Kanban ボード (New→Screened→Interview Sched.→Interviewed→Offer Sent→Hired/Rejected)。応募者カード・詳細パネル（Info/Interview/Evaluation 3タブ）・Add Applicant モーダル・Add Requisition モーダル実装 |
| NavBar: HR Recruitment リンク追加 | `src/components/NavBar.tsx` | HR_MANAGER / MANILA_MANAGEMENT ロール向けサイドバーリンク追加 |
| Renewals: Regularization タブ追加 | `src/app/admin/renewals/page.tsx` | マニラ正規化アラート（入社5ヶ月 = 150日でアラート開始）。Regularize / Terminate ボタンで処理。staff_master.hired_at を参照 |

### 正規化アラートのロジック
- `staff_master.hired_at` + 150日 ≤ today → ALERT開始
- `staff_master.hired_at` + 180日 = 正規化期日
- alert_level: days_remaining < 0 = EXPIRED, < 14 = CRITICAL, それ以外 = WARNING
- Renewals ページ「Regularization」タブに表示
- 「✓ Regularize」で REGULARIZED（アラート消去）
- 「✕ Terminate」でメモ入力 → TERMINATED（アラート消去）

### 今後の残タスク (HR)
- Phase B フロントエンド: Onboarding 管理ページ (`/admin/hr/onboarding`) — バックエンドは完成済み
- Phase C-2: パフォーマンスレビューサイクル
- Phase C-4: 離職管理 (Offboarding)

## Recently Completed (2026-06-07 session 27) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Phase 1-3 バグ修正（7件） | `db_meal_allowance.py`, `db_probation.py`, `db_nte.py`, `main.py`, `admin/nte/page.tsx` | evaluate_probation_cycle コミット漏れ修正、get_hired_at city フィルター追加、end_hour NULL クラッシュ修正、NTE 重複 suspension 防止、midnight シフト早退判定修正、suspension 日付 PHT 化、NTE admin の res.ok チェック追加 |
| Phase 1-3 ユニットテスト追加 | `tests_pure/` (新ディレクトリ) | 47テスト全 PASS。境界値（遅刻グレース・早退グレース・欠勤停職・週末スキップ）を網羅 |
| 遅刻グレースピリオド変更 | `db_meal_allowance.py`, `db_probation.py` | 15分 → 5分以内をオンタイムに変更 |

## Recently Completed (2026-06-06 session 26) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Direct Purchase: Unit に packet/ctn/case を追加 | `src/app/store/purchase/page.tsx` | UNITS 配列に3つ追加 |
| Approval Inbox: PR No. / Date / Supplier 行を追加表示 | `approval-inbox/page.tsx`, `db.py` | CaseRow 型に request_date/vendor_names 追加。バックエンドで vendor_names を STRING_AGG サブクエリで取得。カード表示に PR No.（紫モノスペース）/ Date / Supplier 行を追加 |

## Recently Completed (2026-06-06 session 25) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Store Procurement: モバイルでカテゴリ切り替え時に古いサプライヤーが残るバグ修正 | `src/app/store/procurement/request/page.tsx` | `loadItemCatalog` 開始時に `setCatalogSuppliers([])` を追加。WH→CKに切り替えた際、モバイルの遅いネットワークで Cartimar (WH) アイテムが数秒間残っていた問題を解消 |
| Cost Calculation: 列ヘッダー sticky 修正 + レンダリング改善 | `src/app/admin/cost-calculation/page.tsx` | スクロールコンテナの `pt-4` 除去でヘッダーが正しく固定表示。`content-visibility: auto` で304行の初期レンダリングを大幅改善 |

## Recently Completed (2026-06-06 session 24) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Admin Confirm Delivery: Confirm 2段階ガード | `admin/procurement/receiving/page.tsx` | Confirm → "Yes, Confirm" / Cancel の2段階確認に変更。誤クリック防止 |
| アイテム別受取記録 Option B 実装 | `db.py`, `main.py`, 2フロントファイル | `proc_receiving_items` テーブル新設。Store Receiving 作成時にアイテム別数量を保存。Admin Confirm Delivery でアイテム別 qty_received・unit_price が編集可能に。Save ボタンで親レコードの合計を自動再計算。旧レコードは "no per-item data" メッセージ表示 |
| Renewals: Expired/Critical/Warning チップをフィルターボタン化 | `src/app/admin/renewals/page.tsx` | クリックでそのレベルのアラートのみ表示。再クリックで解除。✕ Clear filter ボタン追加。Active/Resigned フィルターと組み合わせ可。バックエンド変更なし |

## Recently Completed (2026-06-06 session 23) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| PC ナビゲーション: 横タブ → 左サイドバー | `NavBar.tsx`, `LayoutShell.tsx` | デスクトップで幅240px固定サイドバーを追加（createPortal でbodyに描画）。Staff / Admin セクション区切り、アイコン+ラベル+バッジ表示、ユーザー情報・Logout を配置。モバイルUIは完全に変更なし |

## Recently Completed (2026-06-06 session 22) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Store Receiving: Confirm ボタン表示バグ修正 | `src/app/store/procurement/receiving/page.tsx` | `lastCreatedId` フィルターを削除し `isNew = row.id === lastCreatedId` で強調表示に変更。新規DRAFT レコードが Receiving Records リストに表示され Confirm ボタンが押せるようになった |
| Admin Confirm Delivery: request_id 検索時の city フィルター除去 | `app/db.py` | `list_proc_receivings` で `request_id` が指定されている場合は `r.city` フィルターをスキップ。PRナンバーで検索すると "No records found" になっていた問題を修正 |
| Admin Confirm Delivery: アイテム詳細展開パネル追加 | `src/app/admin/procurement/receiving/page.tsx` | Receiving No をクリックで注文アイテム一覧を展開表示。Item/Vendor/Category/Qty/Unit/Unit Price/Line Total + 合計行。キャッシュ済みで重複フェッチなし |

## Recently Completed (2026-06-06 session 19) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Travel Path: レポート詳細パネル改善 (B-1/F-1/F-2) | `db_travel_path.py`, `travel-path/page.tsx` | get_travel_path_report_with_entries を LEFT JOIN 全件取得に変更（未入力項目も表示）; フロントにReportEntry型追加; 詳細パネルでitem_text表示・温度値OK🟢/DANGER🔴表示・未チェック項目を赤ブロックで強調 |
| Travel Path: Monthly Compliance 温度ログ (F-3) | `db_travel_path.py`, `travel_path_api.py`, `travel-path/page.tsx` | GET /api/travel-path/temp-log 新規エンドポイント; Monthly Compliance 内に日付×Opening/Mid-Shift/Closing の温度一覧カードを追加; TEMP VIOLATION バッジ表示 |

## Recently Completed (2026-06-06 session 18) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Cold Chain: Submit UX修正 | `src/app/store/cold-chain/page.tsx` | エラー/成功メッセージをSubmitボタンの下に移動（スクロール時にも見える）; CK Dispatch欄に手動Reloadボタン追加; No dispatches時のメッセージをamber色で明確化 |

**判明した教訓**: Cold Chain はワークフロー順序が必須。①CK Dispatch タブでレコード作成 → ②Branch Receiving タブで Reload → ③Submit。CK Dispatch が未作成だと dispatchId = "" でボタンが disabled になる。

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
| SOP Compliance 追加（11項目）、ルーブリック常時表示 | ✅ live |
| スコア計算: sum/55×100（11項目均等） | ✅ live |
| 販売データ: 常に前日表示・14:00境界修正 | ✅ live |
| Travel Path 温度入力（冷蔵・冷凍ユニットごと数値入力） | ⏳ デプロイ待ち |
| Cold Chain Monitoring チャンネル（クーラーボックス単位3行表）| ✅ live |
| Store Eval auto-data: 接続分離バグ修正 + CUBパターン修正 | ✅ live |
| Cold Chain: 機材選択（Manila）equipment_json | ✅ live |
| Cold Chain: Storage Unit削除・モバイルレイアウト最適化 | ✅ live |
| Cold Chain: 機材選択（equipment picker）+ 外枠修正 | ✅ live |
| CK Receiving「0」エラー修正 (confirm_ck_receiving KeyError) | ✅ live |
| Store Procurement レビュー中の前回オーダー表示を非表示 | ✅ live |
| Cold Chain: msg位置修正 + Dispatch Reloadボタン | ✅ live |
| Travel Path: 詳細パネル改善 (B-1/F-1/F-2) | ✅ live |
| Travel Path: Monthly Compliance 温度ログ (F-3) | ✅ live |
| Direct Purchase: ON CONFLICT partial index バグ修正 | ✅ live |
| Cold Chain: Dispatch 時ボックスごと温度入力 + 写真UP (Manila) | ✅ live |
| Cold Chain: Branch Receiving 新フロー（CK事前設定分をUPDATE） + Received By セレクター | ✅ live |
| Cold Chain: 案Aフラグ (has_dispatch_boxes) 後方互換性対応 | ✅ live |
| Store Procurement: Manila Excel カタログ seed (Fresh/CK/WH) + Fresh タブ追加 | ✅ live |
| Cash Report チャンネル: Opening/Closing フォーム + Admin Dashboard (Compliance/SafetyBox/NTE) | ✅ live |
| Store Procurement: Fresh タブ削除（Fresh は通常 PO フローへ） | ✅ live |
| Procurement: CK オーダーを手動承認フローへ変更（承認後に PO 自動作成 → CK Production） | ✅ live |
| Store Receiving: Confirm ボタン表示バグ修正（lastCreatedId フィルター削除） | ✅ live |
| Admin Confirm Delivery: PRナンバー検索で "No records found" バグ修正（city フィルター除去） | ✅ live |
| Admin Confirm Delivery: アイテム詳細展開パネル追加（クリックで注文明細表示） | ✅ live |
| PC ナビゲーション: 横タブ → 左サイドバー（240px、Staff/Admin区切り） | ✅ live |
| Admin Confirm Delivery: Confirm 2段階ガード + アイテム別受取記録（Option B） | ✅ live |
| Renewals: Expired/Critical/Warning フィルターチップ化 | ✅ live |
| Direct Purchase: Unit に packet/ctn/case 追加 | ✅ live |
| Approval Inbox: PR No. / Date / Supplier 表示追加 | ✅ live |
| Procurement: WH Dispatch 新機能（承認 → WH Dispatch → Store Receiving） | ⏳ 後日実装 |

---

## Heroku Diagnostics

```bash
heroku logs -a sushizen-shift-app -n 200 | grep -E "error|CK|dispatch" -i

heroku pg:psql -a sushizen-shift-app

# Reset attendance sync duplicate hash
UPDATE attendance_drive_sources SET last_sync_status = '' WHERE id = 1;
```
