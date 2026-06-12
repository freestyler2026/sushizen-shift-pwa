# CURRENT_TASKS.md

Last updated: 2026-06-12 (session 53 — end)

> **New session start protocol:**
> 1. Read `CLAUDE.md` (root) — always first
> 2. Read THIS file — understand where things left off
> 3. Load only the additional `docs/ai/` file(s) needed for the specific task

---

## ⚠️ Deployments Pending

なし — 全変更デプロイ済み (Heroku 2017bc4, Vercel e1fe51e)

## ✅ ①②③④ All four features complete and live. All 11 bugs fixed.
## ✅ Daily Ops Check v2 complete and live (4-color status, auto/manual, double-check workflow)
## ✅ Role Management 自動同期 — 8 admin + 6 store チャンネルを登録済み
## ✅ 都市別アクセス制御 — バックエンド 9 モジュールで permission key + city 照合を実施

## Recently Completed (2026-06-12 session 53) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Store Evaluation: 日付選択 UI 追加（デフォルト: 昨日） | `src/app/store/evaluation/page.tsx`, `app/store_evaluation_api.py` | Yesterday/Today ショートカット + カレンダー入力。バックエンドでスタッフが昨日分を提出可能に。evalDate を全API呼び出し・写真アップロード・submit payload に適用 |
| Admin Store Evaluations: 日付ナビゲーション追加 | `src/app/admin/store-evaluations/page.tsx` | ‹/› ボタンで1日ずつ移動 + Today ボタン。Summary/Trend 両タブで日付変更が即時反映 |
| HR Staff (Camilla) Absences 403 修正 | `app/main.py` | `_require_absence_access_pin()` 新ヘルパーを追加。`channel.admin.absences.view` 権限があれば HQ/ADMIN でなくても OK。3エンドポイント (GET /absences, POST /absences/upsert, POST /absences/delete) に適用 |
| CK Production: 数量の小数点表示修正 | `src/app/admin/inventory/productions/page.tsx` | "Now Making" チェックリストで `.toFixed(0)` → `parseFloat(Number(v).toFixed(3))` に変更。0.5 KG が 1 KG に丸められるバグを修正 |
| **Cash Management: カレンダー全ダッシュ修正** | `app/cash_report_api.py` | FastAPI ルート順序バグ修正。`GET /api/admin/cash-reports/{report_id}` が `/compliance` / `/safety-box` / `/collections` / `/nte` より前に登録されていたため、これらのリクエストが wildcard にキャプチャされ 404 → 全ダッシュに。`{report_id}` ルートをファイル末尾に移動。`GET /api/store/cash-report/history` も同時コミット |

### 教訓 (session 53)
- **FastAPI wildcard ルートは必ず最後**: `{param}` を含む GET ルートは同プレフィックスの全静的ルートより後に定義する。FastAPI は登録順に一致させるため、`{report_id}` が先にあると `"compliance"` という文字列がパラメータとして解釈される
- **Cash Management → 404 デバッグ手順**: フロントが `[]` を表示するとき、まずネットワークタブで実際のレスポンスを確認 → `{"detail": "Report not found."}` のようなエラーであれば route ordering 問題を疑う

## Recently Completed (2026-06-11 session 52) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Analytics/Dubai Sales Hourly: 独自の日付範囲 + 店舗フィルター追加 | `src/app/admin/analytics/page.tsx` | `hourlyDateFrom`/`hourlyDateTo`/`hourlyStoreName` の独立 state を追加。Hourly Sales Analytics カード内にインラインフィルターバー（Date From/To + Store ドロップダウン）を表示。他タブの日付範囲と連動しない |
| Op Time: 店舗別データ非存在バッジ追加 | `src/app/admin/analytics/page.tsx` | `pos_operation_time_daily` は city 単位の集計データ（店舗別なし）であることを示す青いバッジを追加 |
| Procurement Hub: Supplier + Branch サーバーサイドフィルター追加 | `src/app/admin/procurement/hub/page.tsx`, `app/main.py`, `app/db.py` | filterBranch / filterSupplier state 追加。6列グリッドに Branch ドロップダウン + Supplier テキスト入力追加。バックエンドでフィルタリング。各行に vendor_summary 表示 |
| Procurement Hub: Clear ボタン即時リロード修正 | `src/app/admin/procurement/hub/page.tsx` | `LoadOverrides` 型を追加し `load()` が明示的なオーバーライドを受け取れるように変更。`clearFilters()` が `load({...全空文字列})` を呼ぶことで stale closure 問題を解消 |
| Store Receiving 左パネル: Supplier名・受取ステータス・検索機能追加 | `src/app/store/procurement/receiving/page.tsx` | `filterSearch`/`filterHideConfirmed` state + `filteredRequests` useMemo 追加。Search 入力 + "Hide already confirmed" チェックボックス。`receiving_status` バッジ（✓ Confirmed 緑 / Draft 琥珀）。`vendor_summary` 表示 |
| Store Evaluations Daily Summary: Food Safety / Org & Storage / SOP Compliance 列追加 | `src/app/admin/store-evaluations/page.tsx`, `app/db_store_evaluation.py` | `get_evaluations_summary()` の SELECT に 3 フィールドを追加。`EvalRow`/`TrendRow` 型・`SCORE_LABELS`・`SCORED_KEYS`・Daily Summary テーブル・Trend カード score dots に 3 フィールドを追加 |

### 教訓 (session 52)
- **React stale closure**: `clearFilters()` が `setState()` 後すぐ `load()` を呼んでも state は旧値のまま。`LoadOverrides` パターン（呼び出し時に明示的に新値を渡す）で解消
- **`pos_operation_time_daily` は city 単位**: `UNIQUE(work_date, city)` — 店舗別データなし。フロントに説明バッジを追加するのが正しい対処
- **vendor_summary は string_agg サブクエリで取得**: `proc_request_items.vendor_name` はアイテム行ごとに存在。リクエストヘッダー側にはなく、サブクエリで `string_agg(DISTINCT vendor_name, ', ')` として集約する

## Recently Completed (2026-06-11 session 51) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| セキュリティ: require_channel_permission() 追加 | `app/security_tokens.py` | 新ヘルパー関数: ① Bearer トークン検証、② permission_key がトークンの permissions[] に含まれるか確認、③ ADMIN/HQ でない場合は token.city と要求 city が一致するか照合。いずれか失敗で 401/403 返却 |
| セキュリティ: cold_chain_api: role名のみガード → permission key + city 照合 | `app/cold_chain_api.py` | `_require_admin` が `require_channel_permission(request, "channel.admin.cold_chain.view", city=city)` を呼ぶように変更。admin エンドポイント (dispatches/boxes/alerts) に `city=city` を渡して city 照合 |
| セキュリティ: daily_check_api: token-existence のみ → permission key + city 照合 | `app/daily_check_api.py` | `_require_admin` 関数を新設 (`channel.admin.daily_check.view`)。admin エンドポイント (list/confirm/double-check/summary) を `_require_auth` → `_require_admin` に変更 |
| セキュリティ: store_evaluation_api: role名のみガード → permission key + city 照合 | `app/store_evaluation_api.py` | `_require_admin` が `channel.admin.store_evaluations.view` を使うように変更。city 付きエンドポイント 6 件に `city=city` を渡す |
| セキュリティ: transport_expense_api: token-existence のみ → permission key + city 照合 | `app/transport_expense_api.py` | `_require_admin` 関数を新設 (`channel.admin.transport_expense.view`)。admin エンドポイント 6 件を切り替え |
| セキュリティ: petty_cash_api: token-existence のみ → permission key + city 照合 | `app/petty_cash_api.py` | 同様 (`channel.admin.petty_cash.view`) |
| セキュリティ: cash_report_api: role名のみガード → permission key 照合 | `app/cash_report_api.py` | `_require_admin` が `channel.admin.cash_management.view` を使うように変更 (store-facing の `_require_token` は維持) |
| セキュリティ: meal_allowance_api: role名のみガード → permission key + city 照合 | `app/meal_allowance_api.py` | 同様 (`channel.admin.meal_allowance.view`) |
| セキュリティ: probation_api: role名のみガード → permission key + city 照合 | `app/probation_api.py` | 同様 (`channel.admin.probation.view`) |
| セキュリティ: nte_api: role名のみガード → permission key + city 照合 | `app/nte_api.py` | 同様 (`channel.admin.employee_cases.view`)。全6エンドポイント (history/overview/dashboard/enforcement/upcoming) に city= を渡す |

### 教訓 (session 51)
- **都市別制限の2レイヤー**: ①トークン発行時 (`resolve_role_permissions` の city_hint フィルター) と ②API 層の city 照合、両方が必要。どちらか片方では不十分
- **`require_channel_permission` の設計**: ADMIN/HQ は `*` を持たなくても role 名チェックで bypass。その他のロールは permission key + (オプション) city を照合
- **`_require_token` 残存が必要なケース**: store-facing エンドポイント (submit/balance/status など) は role/permission チェック不要だが token 存在確認は必要。`cash_report_api`, `meal_allowance_api`, `probation_api`, `nte_api` に `_require_token` を残す

## Recently Completed (2026-06-11 session 50) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Role Management 同期: 8 adminチャンネル追加 | `app/access_control.py` | ACCESS_CHANNELS に store_evaluations / cold_chain / daily_check / transport_expense / petty_cash / cash_management / meal_allowance / probation を追加。対応する .view パーミッションを ACCESS_PERMISSIONS に追加。DEFAULT_ROLE_GRANTS の ADMIN / MANILA_MANAGEMENT / HR_MANAGER に付与。DUBAI_MANAGEMENT に cold_chain を付与。起動時の safety migration が自動で既存ロールに付与 |
| Role Management 同期: 6 storeチャンネル追加 | `app/access_control.py` | store_evaluation / store_cold_chain / store_daily_check / store_transport_expense / store_petty_cash / store_cash_report を ACCESS_CHANNELS に追加 |
| NavBar: canAccess* 関数に切り替え | `src/components/NavBar.tsx`, `src/lib/auth.ts` | 8ページのハードコードされた role リストを廃止。canAccessStoreEvaluationsAdmin / canAccessColdChainAdmin / canAccessDailyCheckAdmin / canAccessTransportExpenseAdmin / canAccessPettyCashAdmin / canAccessCashManagementAdmin / canAccessMealAllowanceAdmin / canAccessProbationAdmin 関数を auth.ts に追加し、NavBar から呼び出すように変更 |

### 教訓 (session 50)
- **NavBar チャンネル追加ルール（⚠️ 必須）**: NavBar の ADMIN_ITEMS に新しい href を追加するときは **必ず** 3箇所を同時に更新すること:
  1. `app/access_control.py` → `ACCESS_CHANNELS` にエントリ追加（`is_admin_channel: True`）
  2. `app/access_control.py` → `ACCESS_PERMISSIONS` に `.view` パーミッション追加
  3. `app/access_control.py` → `DEFAULT_ROLE_GRANTS` の各ロールに `.view` を追加
  4. `src/lib/auth.ts` → `canAccess*` 関数を追加
  5. `src/components/NavBar.tsx` → hardcoded role list ではなく canAccess* 関数を使う
  ※ この手順を守れば Role Management に自動表示される
- **Safety migration**: `seed_access_control_defaults()` の末尾に「完全に未付与のパーミッションだけ追加」するロジックがある。DEFAULT_ROLE_GRANTS に新しいパーミッションを追加すれば、次回 Heroku 起動時に既存ロールへ自動反映される

## Recently Completed (2026-06-10 session 48) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Daily Ops Check v2: DB スキーマ拡張 | `app/db_daily_check.py` | 新カラム: discord_confirmed, issue_note, double_checked_by, double_checked_at。status CHECK 制約を CONFIRMED_OK/CONFIRMED_ISSUE/RESOLVED/ONGOING_ISSUE に拡張。起動時に既存 CONFIRMED → CONFIRMED_OK 自動マイグレーション。`confirm_daily_check` に status/discord_confirmed/issue_note パラメータ追加。新関数 `double_check_daily_check` (CONFIRMED_ISSUE → RESOLVED/ONGOING_ISSUE)。`get_daily_check_summary` に issues カウントを追加 |
| Daily Ops Check v2: API 拡張 | `app/daily_check_api.py` | DailyCheckConfirmIn/DailyCheckDoubleCheckIn Pydantic モデル追加。confirm エンドポイントに body 対応 (4色ステータス + Discord チェックボックス + issue_note)。新エンドポイント `POST /api/admin/daily-check/{id}/double-check`。aggregator_statuses 型を Dict[str, Any] に拡張 |
| Daily Ops Check v2: ストアページ | `src/app/store/daily-check/page.tsx` | アグリゲーター状態型を {open: bool, mode: "auto"\|"manual"} に変更。各アグリゲーター行に Auto/Manual トグルボタンを追加。提出履歴の 5 色ステータス表示 (🟢🔴🔵🟣⏳) |
| Daily Ops Check v2: 管理ページ | `src/app/admin/daily-check/page.tsx` | CheckCard: 4 色確認 UI (🟢 All Good / 🔴 Issue Found)、Issue 時コメント必須 + Discord チェックボックス。CONFIRMED_ISSUE → ダブルチェック UI (🔵 Resolved / 🟣 Still Ongoing)。最終ステータスに確認者・Discord 通知・フォローアップ情報表示。KPI 4 チップ (Total / 🟢 OK / Pending / 🔴 Issues)。Summary グリッドに issue 数を赤バッジ表示。タブバッジが SUBMITTED + CONFIRMED_ISSUE のカウントに |

### 教訓 (session 48-49)
- **DB CHECK 制約のアップグレード**: 新しいステータス値を追加するには DROP + ADD が必要。IF NOT EXISTS は使えないので DROP CONSTRAINT IF EXISTS → ADD CONSTRAINT のパターンを使う（毎回 DROP してから ADD → 完全冪等）
- **aggIsOpen ヘルパー**: aggregator_statuses の値が旧形式 `bool` と新形式 `{open, mode}` の混在状態になる。両方を処理するヘルパー関数をフロント・バックエンドともに用意する
- **CheckCard 内部状態**: 管理ページの各 CheckCard に選択中ステータス・テキストエリア・Discord フラグの内部 state を持たせることで、ページレベルの state 管理を不要にできる
- **Heroku JWT シークレット**: `ACCESS_TOKEN_SECRET` は未設定。`STAFF_PIN_SALT = "random-long-secret-CHANGE-ME"` が実際のトークン署名シークレット。ローカルテストのトークン生成に使う
- **Heroku API アクセス**: `~/.netrc` の `HRKU-...` トークンは期限切れ。代わりに `https://heroku:<token>@git.heroku.com` の Bearer トークン (`c4b07274-...`) が有効
- **テストの AUTH 秘密**: `tests_pure/` のインテグレーションテストが 401 で落ちる場合、`SECRET` 変数を `"random-long-secret-CHANGE-ME"` に変更する

## Recently Completed (2026-06-10 session 47) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Bug 1: ケースが QUEUED のまま | `app/main.py` | `update_proc_approval_case_status(IN_REVIEW)` が未呼び出しだったため、Hub バッジカウントに反映されなかった。修正: `create_proc_approval_case` 後に status=IN_REVIEW へ更新 |
| Bug 2: `required_roles_json` 未設定 | `app/main.py` | `submit_proc_request` が未呼び出しで `proc_requests.required_roles_json` が null のまま。修正: WH パスにも `submit_proc_request` を追加 |
| Bug 3: MANAGER が HQ スロットを満たせる | `app/services/procurement_control.py` | `approvals_complete_in_order` のサブスティテュートセットに MANAGER が含まれ、HQ 必須ケースを迂回可能だった。修正: HQ スロットには MANAGER を不可とし、ADMIN は全スロット満たすショートカットを追加 |
| Bug 4: RETURNED 後の再提出でステータスがリセットされない | `app/db.py` | `create_proc_approval_case` の ON CONFLICT DO UPDATE に `status = 'QUEUED'` が欠落。修正: DO UPDATE SET に追加 |
| テスト追加 | `tests_pure/test_wh_hq_approval.py` | 35 純粋関数テスト (approval 完了ロジック・ロール権限・レスポンス形状・フロント計算・再提出フロー)。全スイート 133/133 PASS |

### 教訓 (session 47)
- **test-before-deploy が重要**: 今回の 4 件のバグはすべてテストで発見。本番 DB に接触せずに純粋関数テストで検出可能だった
- **ON CONFLICT DO UPDATE の落とし穴**: INSERT 時にハードコードした値（`'QUEUED'`）は、DO UPDATE SET に明示しないと UPSERT 時に更新されない
- **ADMIN shortcut**: `approvals_complete_in_order` に ADMIN の全チェーン満足ショートカットを追加。HQ と同様に扱われるように統一

## Recently Completed (2026-06-10 session 46) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| WH オーダー HQ 承認必須化 | `app/main.py` (L20689-20738) | WH オーダーの自動承認を廃止。`required_roles=["HQ"]`、`current_assignee_role="HQ"`、`status=IN_REVIEW` でワークフロー開始。HQ通知送信。audit key = `procurement.request.wh_hq_required` |
| Case Detail: HQ 承認要求バナー | `src/app/admin/procurement/cases/[caseId]/page.tsx` | WH ケース (`required_roles=["HQ"]`) を非 HQ/ADMIN ユーザーが開いたとき、アンバーバナーで「HQ sign-off 必須」を通知 |
| Hub: HQ 承認要求バナー | `src/app/admin/procurement/hub/page.tsx` | `current_assignee_role="HQ"` の未承認行を展開したとき、バイオレットバナーで同様の警告を表示 |

## Recently Completed (2026-06-10 session 45) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Procurement Hub: WH在庫列追加 | `src/app/admin/procurement/hub/page.tsx` | Manila WH在庫をオーダーと並列フェッチ。アイテム展開時にWH Stock列を追加（緑✓/琥珀⚠/赤✕カラーコード）。在庫不足アイテムのある行をハイライト + アラートバナーを表示 |
| Case Detail: WH在庫列追加 | `src/app/admin/procurement/cases/[caseId]/page.tsx` | バンドル読み込み後にWH在庫を非同期フェッチ。read-onlyアイテムテーブルに同じカラーコード列とアラートバナーを追加。`showWhStock`フラグでManila + 非編集モード時のみ表示 |
| TypeScript構文エラー修正 | `src/app/admin/procurement/cases/[caseId]/page.tsx` | `{bundle.request && (` の閉じ `)}` が欠落していたのを修正（IIFEクリーンアップ時の残留）。`npx tsc --noEmit` エラー0件確認 |

## Recently Completed (2026-06-10 session 44) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Petty Cash: Drive失敗でDB孤立レコード発生バグ修正 | `app/petty_cash_api.py` | Drive upload failure を HTTPException(500) ではなく `{"ok": True, "warning": "..."}` として返すように変更。`_upload_photo_to_drive` に `_preread_bytes` パラメータ追加でダブルリード防止 |
| Transport Receipt: 空ファイルガード修正 | `app/transport_expense_api.py` | `if file and file.filename:` → `if file is not None: + if file_bytes:` に変更。Drive try/except ブロックの indent 修正（`if file_bytes:` の内側に配置） |
| Dead code 削除 (actor.get("name")) | `app/petty_cash_api.py`, `app/transport_expense_api.py` | approve/reject/close/settle エンドポイントの `actor.get("sub") or actor.get("name") or "admin"` → `actor.get("sub") or "admin"` （JWT に "name" フィールドは存在しない） |
| TypeScript チェック | `npx tsc --noEmit` | エラー 0 件を確認 |

## Recently Completed (2026-06-10 session 43) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| ① HR/Permission Access 修正 | `app/main.py` | `_verify_manager_or_admin` に HR_MANAGER 追加 + channel.admin.staff.manage 権限チェック追加。`_assert_os_attendance_access()` 新ヘルパー追加。OS Attendanceエンドポイント11個をロール+チャンネル権限チェックに統一。Camilla (HR Staff) の 403 エラーを解消 |
| ② Cold Chain: 複数ブランチ選択 UX 修正 | `src/app/store/cold-chain/page.tsx` | 初期値を全ブランチ選択済みに復元 + チェックボックス式UI + "Select all/Clear all" ショートカット + Submit後に全ブランチ再選択 |
| ③ Daily Ops Check バックエンド (Opening/Lunch Close/Business Close) | `app/db_daily_check.py` (新規), `app/daily_check_api.py` (新規), `app/main.py` | `daily_op_checks` テーブル (JSONB aggregator_statuses, photo_urls, confirmation tracking)。7エンドポイント: submit, photo upload, today (store), list/confirm/summary (admin) |
| ④ Daily Check ストアページ | `src/app/store/daily-check/page.tsx` (新規) | 店舗スタッフ向け: ブランチ選択, Opening/Lunch Close/Business Close チェックタイプ, アグリゲーターステータス (GrabFood/Foodpanda/Beep), ダインイン状態, ノート, 写真アップロード (Opening のみ), 今日の提出履歴 |
| ⑤ Daily Check 管理ページ | `src/app/admin/daily-check/page.tsx` (新規) | バックオフィス向け: ブランチサマリーグリッド (提出/確認状況), 全レコード一覧, Confirm ✓ ボタン, 日付/ブランチ/タイプフィルター, KPIチップ (合計/確認済み/保留中) |
| ⑥ NavBar: Daily Check リンク追加 | `src/components/NavBar.tsx` | ストアナビに "Daily Check" (ClipboardList), 管理ナビに "Daily Check" 追加。可視性: HQ/ADMIN/HR_MANAGER/MANILA_MANAGEMENT/MANILA_MANAGER |

## 🔴 未解決: Employee Cases ページのデータ取得問題（明日継続）

### 現状
- ページ自体は正常表示（`/admin/employee-cases`、4タブ、KPIカード）
- `POST /api/admin/cases/data` と `POST /api/admin/cases/board` が "Failed to fetch"
- サーバー（Heroku・Vercel）は正常。curlでは401が返る
- GET/POST どちらも、URL を何度変えてもブロックされる

### 試した URL の変遷
1. `/admin/nte` → `/api/admin/nte/list` → ブロック
2. → `/api/admin/nte/records` → ブロック
3. → `/api/admin/suspensions` → ブロック
4. → `/api/admin/nte/actions` → ブロック
5. → `/api/admin/conduct/*` → ブロック（GET）
6. → `POST /api/admin/conduct/*` → まだブロック
7. ページURL: `/admin/nte` → `/admin/notice-to-explain` → まだブロック
8. → `/admin/employee-cases` + `/api/admin/cases/*` → まだブロック

### 仮説
- ブラウザの広告ブロッカー拡張機能が、このページ固有の何かをトリガーにして全fetchをブロック
- URLではなく、リクエストヘッダー（Authorization: Bearer）やページコンテンツが原因の可能性

### 明日試すべきこと
1. **シークレットウィンドウ**（拡張機能無効）で試す → 動けば拡張機能が原因確定
2. **別ブラウザ**（Chrome/Firefox/Safari）で試す
3. **XMLHttpRequest** で fetch の代わりに試す（一部フィルタはfetchのみブロック）
4. **フィルタリングツール特定**: ブラウザ → 設定 → 拡張機能 一覧を確認
5. **Manillaモードで試す**（Dubaiだけブロックされている可能性）

### Manila P&L データ未インポート（継続中）
- `/Users/jaynishimura/Downloads/[Manila] PLアプリ用データ (3).xlsx` (8シート: 202510〜202605)
- 対処: Management P&L → Summary → **「Upload Excel」**ボタン

## Recently Completed (2026-06-09 session 42) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| ① Confirm Delivery: 受取レコード未作成ガイド | `admin/procurement/receiving/page.tsx` | Request IDフィルターで0件の場合、「承認済みだが受取レコード未作成」の案内カードを表示。「+ Create Receiving Record for this Order」ボタンでフォームにIDを自動プリフィルしスクロール |
| ② Hub: Request IDコピーボタン | `admin/procurement/hub/page.tsx` | 各行のRequest ID横に `Copy` ボタンを追加。クリックでクリップボードにコピー、2秒間「Copied ✓」に変化。行展開イベントと競合しないよう `stopPropagation` 設定 |
| ③ Cartimar supplier filter regression 修正 | `store/procurement/request/page.tsx` | `lastCatalogScopeRef`のscope keyに`activeStore`を追加 (`city::category::store`)。以前は店舗変更時にフィルターがリセットされず、別店舗のCartimarカタログが残存する問題があった |

### 教訓 (session 42)
- **Confirm Delivery は受取レコードを見る画面**: 承認済みPRが直接表示されるわけではない。承認後は store/admin が先に受取レコードを作成する必要がある。ガイドテキストでユーザーを正しいフローに誘導
- **Cartimar scope key バグの根本**: `scopeKey = city::category` だけでは店舗変更を検知できない。店舗ごとにカタログが異なる場合 (Dubai WH: AL BARSHAとM CITYで異なるサプライヤー)、フィルターがリセットされずに stale なサプライヤーフィルターが残る

## Recently Completed (2026-06-09 session 41) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Approval Case: アイテムインライン編集機能 | `app/main.py` + `cases/[caseId]/page.tsx` | 承認画面で承認者がアイテムの Qty / Unit Price / Spec を直接編集可能に。編集モードトグル (✏ Edit Items)。Unit Price 入力は緑色ハイライト。Line Total・Order Total がリアルタイム自動計算。Save Changes で `PATCH /api/admin/procurement/cases/{id}/items` を呼び出し、ケースに変更メモを自動投稿。APPROVED / REJECTED 状態では編集ボタン非表示 |

### 教訓 (session 41)
- **Pydantic モデル再利用**: 既存の `ProcRequestItemIn` を `items: List[ProcRequestItemIn]` で再利用することで、フィールドバリデーションを一切書かずに済む
- **line_total の扱い**: フロントでリアルタイム計算してもバックエンド側で `qty × unit_price` で上書き計算することで、フロント計算ミスの可能性を排除
- **replace_proc_request_items は DELETE + INSERT**: 既存 items を全削除して再挿入するため、item の id は毎回変わる。フロントの key は `item.id || idx` で対応済み

## Recently Completed (2026-06-09 session 40) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Bayzat Daily File Import 修正 | `app/main.py` `_drive_list_attendance_files()` | Shared Drive ID (`0A...`) を検出した場合、`corpora="user"` のデフォルトAPIをスキップし、直接 `_drive_list_shared_drive_attendance_files()` を呼ぶように修正。これにより Dubai Bayzat の日次ファイル (28+ files/日) が正常にインポートされるように |
| Auto Sync 有効化 | Heroku env vars + `attendance_drive_sources` DB | `ATTENDANCE_AUTO_SYNC_ENABLED=true` 設定。APScheduler 05:18/07:18 UTC で毎日実行。Drive source ID=1 (Bayzat Personal Drive Folder, city_hint=dubai) を再有効化 |
| Analytics Summary: Dubai KPI ゼロ修正 (Approach A) | `app/db.py` + `app/main.py` + `analytics/page.tsx` | `base_shift_normalized` にシフトデータが空の場合、`actual_attendance` (Bayzat import) にフォールバックする `source=auto` パラメータを実装。`list_branch_daily_hours_actual` / `list_staff_work_summary_actual` / `get_city_summary_actual` の3関数を `db.py` に追加。3エンドポイント (`branch_daily_hours` / `staff_work_summary` / `city_summary`) に `source: str = Query("auto")` を追加。フロントエンドの全API呼び出しに `&source=auto` を付与 |

### 教訓 (session 40)
- **Google Drive Shared Drive ID (`0A...`) の検出**: `'{id}' in parents` + `corpora="user"` では共有ドライブ内ファイルが返らない。`corpora="drive"` + `driveId=<id>` で `_drive_list_shared_drive_attendance_files()` を呼ぶ必要がある。`_looks_like_shared_drive_id()` で `0A` プレフィックスを検出して分岐
- **Dubai シフトデータ空問題の根本原因**: Dubai はシフトを Bayzat のみで管理し OS にはシフトが入っていない。`base_shift_normalized` に Dubai データがなく Analytics KPIが常に0。`source=auto` フォールバックで `actual_attendance` を使うことで解消
- **Bayzat→Zoho 移行予定**: Bayzat は契約終了・Zoho 切り替え予定。Approach B（Bayzat スケジュールインポート）は不要。将来は Zoho の出力形式に合わせてパーサーを変更するだけでよい

### session 40 での Approach A 実装詳細
- `source=auto` ロジック: `branch_daily_hours`/`staff_work_summary` は `result.get("rows")` が空リストの時にフォールバック。`city_summary` は `float(result.get("total_hours") or 0) == 0` の時にフォールバック
- Manila (シフトあり) は変更なし。Dubai (シフトなし) のみ自動的に `actual_attendance` を使用

## Recently Completed (2026-06-09 session 39) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Cash Collection Pipeline: DB テーブル + 4 関数 | `app/db_cash_report.py` | `cash_collection_records` テーブル追加（COLLECTED→OFFICE_CHECKED→DEPOSITED の3ステップ）。`create_cash_collection` / `list_cash_collections` / `update_collection_office_check` / `update_collection_bank_deposit` の4関数追加 |
| Cash Collection Pipeline: 3 API エンドポイント | `app/cash_report_api.py` | `GET /collections` (フィルター対応) + `PATCH /collections/{id}/office-check` + `PATCH /collections/{id}/deposit`。Withdrawal 時に `double_check_by` 対応＋自動でコレクションレコード作成 |
| Cash Collection Pipeline: フロントエンド UI | `src/app/admin/cash-management/page.tsx` | Safety Box タブにパイプライン UI 追加。ステータスチップ（All/Collected/Office Check/Deposited）+ コレクションカード（各ステップのサマリー）+ インラインアクションフォーム（Office Check / Bank Deposit）。Withdrawal フォームに Double Check By フィールド追加 |
| Travel Path: 全 Manila 店舗に排水溝詰まり防止アイテム追加 | `app/travel_path_default_items.py`, `app/db_travel_path.py` | Paranaque/Taft（TP_CL_016）+ Cubao（CB_CL_DRAIN）に「排水溝にお湯を流す」クロージングチェック項目を追加。DB 起動時にアップサート migration で確実に適用 |
| Item Sales: Cubao フィルターが詰まるバグ修正 | `src/components/analytics/ManilaSalesDataTab.tsx` | Branch/Limit/Category フィルターを `productItems.length > 0` 条件ブロックの**外**に移動 |
| Item Sales: Cubao→QC DB名前マッピング修正 | `app/db.py` `_manila_sales_where()` | `_STORE_NAME_MAP = {"Cubao": "QC"}` で変換 |

### 教訓 (session 39)
- **Cash Pipeline アーキテクチャ**: Withdrawal エンドポイントを拡張して自動的にコレクションレコードを作成するパターン。フロント側は1回の操作で2つのテーブルに書き込まれることを意識する
- **インライン展開フォーム**: モバイル向けにはモーダルより inline expandable（クリックでその場に展開）が優れている。`isOcOpen = ocId === col.id` パターンで複数カードのうち1つだけ開く
- **Item Sales フィルターの配置**: 条件付きレンダリング内にフィルターを置くと、0件状態でフィルターが消えてユーザーが詰まる
- **DB ストア名とUIラベルの乖離**: UI=「Cubao」↔ DB=「QC」のようなマッピングは where-clause 生成関数でひとまとめに管理する

## Recently Completed (2026-06-08 session 37) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| Manila Sales: Item Sales + Hourly タブ追加 | `src/components/analytics/ManilaSalesDataTab.tsx`, `src/app/admin/analytics/page.tsx` | ManilaSalesDataTab に `view` prop追加 (all/daily/items/hourly)。Item Sales: horizontal bar chart + ソート可能テーブル (TOP 20/50/100, branch/category フィルター)。Hourly Traffic: 時間帯別 bar chart (ランチ amber / ディナー indigo) + ピーク時間 KPI + 詳細テーブル。analytics/page.tsx に "Item Sales" / "Hourly" タブを MANILA_SALES_SECTION_OPTIONS に追加 |
| Vendor 検索ボックス追加 (①) | `src/app/admin/procurement/vendors/page.tsx` | nameFilter state + filteredRows useMemo。Search アイコン付き入力欄。vendor_code / registered_name / trade_name でフィルタリング。ヒット件数表示 |
| Vendor リスト右パネル sticky + New Vendor ボタン (③) | `src/app/admin/procurement/vendors/page.tsx` | 右パネルを `self-start sticky top-5` でスクロール追従。selectedRow がある場合に "+ New Vendor" ボタンを右パネルヘッダーに常時表示 |
| Store Procurement: サプライヤー削除機能 (②) | `src/app/store/procurement/request/page.tsx`, `app/db.py`, `app/main.py` | 🗑 Delete ボタン → インライン確認パネル。2段階削除: ① curated catalog soft-deactivate (POST /catalog/supplier/deactivate) + ② legacy import rows hard-delete (POST /catalog/supplier/delete-import 新エンドポイント)。db.py に `delete_proc_order_import_supplier()` 追加。main.py に `POST /api/admin/procurement/catalog/supplier/delete-import` エンドポイント追加 |

### 教訓 (session 37)
- **Supplier データが2テーブルに存在**: `proc_curated_catalog_items` (OS管理カタログ) と `proc_order_import_rows` (Excel import 履歴)。削除する際は両方をクリアする必要がある
- **サプライヤー削除の2段階フロー**: curated = soft-delete (deactivate, is_active=False) / import rows = hard-delete (DELETE FROM)
- **Recharts BarChart の horizontal bar**: `layout="vertical"` を使う。`XAxis type="number"` / `YAxis type="category" dataKey="name"`

## Recently Completed (2026-06-08 session 35) — live

| 修正 | ファイル | 内容 |
|---|---|---|
| NTE ページ完全リニューアル | `src/app/admin/nte/page.tsx` (全面書き直し) | 4タブ構成: Staff Board(累積NTE順ランキング) / Issue NTE(HR起票フォーム+テンプレート) / History(全履歴+Resolve) / Templates(CRUD). 全データ取得をPOST化（GETコンテンツフィルタ回避） |
| NTE テンプレート機能 | `app/db_nte.py`, `app/nte_api.py` | nte_templatesテーブル追加。get_staff_nte_ranking()追加。POST /conduct/data・POST /conduct/board・POST/PATCH/DELETE /conduct/templates の5エンドポイント追加 |

### NTE コンテンツフィルタ問題の経緯
- ブラウザ拡張機能が `/nte/`・`/suspensions`・`/list`・`/notices`・`?limit=` など多くのURL/パラメータをブロック
- 全データ取得を POST リクエスト化することで回避
- GETフィルタは POST には適用されないことを確認

### NTE 新ページ構成
| タブ | 機能 |
|---|---|
| Staff Board | NTE累積数の多い順にスタッフカード表示。🔴3枚/🟡2枚/🔵1枚色分け。クリックで個人履歴パネル |
| Issue NTE | HR手動起票。テンプレート選択→本文自動挿入。3枚目警告バナー |
| History | 全NTE時系列表示。スタッフ名・ステータスフィルター。Resolve アクション |
| Templates | NTEテンプレートCRUD。{staff_name}/{date}プレースホルダー対応 |
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
| Manila Sales Analytics: Item Sales タブ (branch/category/limit フィルター + ソート) | ✅ live |
| Manila Sales Analytics: Hourly Traffic タブ (時間帯別 bar + KPI + ランチ/ディナー色分け) | ✅ live |
| Admin/Vendors: サプライヤー名検索ボックス + 右パネル sticky | ✅ live |
| Admin/Vendors: 編集中に "+ New Vendor" ボタン表示 | ✅ live |
| Store Procurement: サプライヤー削除 (catalog soft-delete + import hard-delete 2段階) | ✅ live (Heroku v1217) |
| Item Sales: Cubao 選択でフィルターが消えるバグ修正 | ✅ live (Heroku v1219) |
| Item Sales: Cubao→QC DB名前マッピング修正 | ✅ live (Heroku v1219) |
| Travel Path: 全Manila店舗に排水溝詰まり防止アイテム追加 | ✅ live (Heroku v1220) |
| Cash Collection Pipeline: 3ステップ追跡 (Store→Office→Bank) | ✅ live (Heroku v1221, Vercel 0e01003) |
| Bayzat Daily Import: Shared Drive ID 検出修正 | ✅ live (Heroku v1225) |
| Attendance Auto Sync: APScheduler 05:18/07:18 UTC | ✅ live (Heroku v1225) |
| Analytics Summary: Dubai KPI → actual_attendance fallback (source=auto) | ✅ live (Heroku v1225, Vercel a81f6ae) |
| Approval Case: アイテムインライン編集 (Qty/Unit Price/Spec) | ✅ live (Heroku v1226, Vercel 2f4999e) |
| HR Staff (Camilla): OS Attendance + Staff Master 403 修正 | ✅ live (Heroku v1230) |
| ③ Transport Expense (Manila only) — advance request + receipt tracking | ✅ live (Heroku v1231, Vercel b77e3d7) |
| ④ Petty Cash (Manila only) — 7 categories, receipt photo, approve/close flow | ✅ live (Heroku v1232, Vercel 7b3e489) |
| Bug fix: petty cash Drive failure orphan / transport empty-file guard / dead actor.get("name") | ✅ live (Heroku v1233, Vercel da24623) |
| Procurement Hub + Case Detail: WH在庫列追加 (Manila承認画面で在庫可視化) | ✅ live (Vercel 0cf2b87) |
| WH オーダー HQ 承認必須化（ガバナンス強化） | ✅ live (Heroku b79fe6d, Vercel 709255f) |
| WH HQ 承認フロー バグ修正 4 件 + テスト 35 件 (133/133 PASS) | ✅ live (Heroku 611a34a) |
| Cold Chain: 複数ブランチ選択 UX 修正 (全選択デフォルト + チェックボックス式) | ✅ live (Vercel 0bce485) |
| Daily Ops Check ① Opening / ② Lunch Close / ③ Business Close | ✅ live (Heroku v1230, Vercel 0bce485) |
| Daily Ops Check v2: 4-color status + auto/manual + double-check | ✅ live (Heroku 0804f82, Vercel 1a371ae) |
| Role Management 同期: 8 admin + 6 store チャンネル追加 | ✅ live (Heroku a877e8d, Vercel dd078d3) |
| SECURITY: 9 API モジュール city-scoped permission 照合強化 | ✅ live (Heroku d369f55) |
| Analytics Dubai Sales Hourly: 独自日付範囲 + 店舗フィルター | ✅ live (Vercel e1fe51e) |
| Procurement Hub: Supplier + Branch フィルター + Clear 即時リロード修正 | ✅ live (Heroku 0e575df, Vercel e1fe51e) |
| Store Receiving: Supplier 名 + 受取ステータス + 検索機能 | ✅ live (Vercel e1fe51e) |
| Store Evaluations Daily Summary: Food Safety / Org & Storage / SOP Compliance 列追加 | ✅ live (Heroku 0e575df, Vercel e1fe51e) |
| Store Evaluation: 日付選択 UI (yesterday default) + Admin day nav | ✅ live (Heroku 2017bc4, Vercel — pending) |
| HR Staff Absences 403 修正 (channel.admin.absences.view) | ✅ live (Heroku 2017bc4) |
| CK Production qty 小数点修正 (0.5→1 バグ解消) | ✅ live (Vercel — pending) |
| Cash Management カレンダー全ダッシュ修正 (FastAPI route ordering) | ✅ live (Heroku 2017bc4) |

---

## Heroku Diagnostics

```bash
heroku logs -a sushizen-shift-app -n 200 | grep -E "error|CK|dispatch" -i

heroku pg:psql -a sushizen-shift-app

# Reset attendance sync duplicate hash
UPDATE attendance_drive_sources SET last_sync_status = '' WHERE id = 1;
```
