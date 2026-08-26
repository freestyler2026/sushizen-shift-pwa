# CLAUDE.md — Sushi ZEN Workforce OS (Frontend)

> **Claude Code運用ルール**
> - セッション開始時: このファイル → `/Users/jaynishimura/Desktop/sushizen_shift_app_clean/CLAUDE.md` → `docs/ai/CURRENT_TASKS.md` の順で読む
> - コンテキストが長くなったら: `/compact` コマンドで圧縮して継続
> - 大ファイル(main.py/db.py)は **絶対に全文読まない** — Grepで該当箇所±50行のみ
> - ユーザーは自然言語で問題・要望を伝える。Claudeがフロントとバックどちらのファイルをどう変えるか判断する

---

## 📂 ドキュメント読み込みルール

詳細は `docs/ai/` にある。タスクに応じて必要なものだけ読む。

```
タスクが...
├─ フロントページ・コンポーネント変更    → docs/ai/FRONTEND_MAP.md
├─ バックエンドAPIエンドポイント追加     → docs/ai/BACKEND_MAP.md
├─ DBテーブル・クエリ変更              → docs/ai/DATABASE_SCHEMA.md
├─ フロント→バックAPI呼び出し          → docs/ai/API_MAP.md
├─ アーキテクチャ・ビジネスフロー確認   → docs/ai/SYSTEM_OVERVIEW.md
└─ フルスタック機能                    → BACKEND_MAP → DATABASE_SCHEMA → FRONTEND_MAP の順
```

| ファイル | 用途 |
|---|---|
| `docs/ai/CURRENT_TASKS.md` | **毎セッション必読** — 現在の状態・pending tasks |
| `docs/ai/FRONTEND_MAP.md` | 全ページ・コンポーネント一覧 |
| `docs/ai/BACKEND_MAP.md` | APIエンドポイント・サービス一覧 |
| `docs/ai/DATABASE_SCHEMA.md` | テーブル定義 |
| `docs/ai/API_MAP.md` | APIパス・リクエスト/レスポンス形式 |
| `docs/ai/SYSTEM_OVERVIEW.md` | 全体アーキテクチャ |

### セッション終了時（必須）
`docs/ai/CURRENT_TASKS.md` を自動更新する:
1. 完了タスクを "Recently Completed" に移動
2. デプロイ待ちの変更を記録
3. 新たな既知問題・教訓を追記

### 📖 マニュアルArtifact 自動更新ルール

以下のページ・機能に変更・追加があった場合、**明示的な指示がなくてもセッション終了前に必ずマニュアルを更新して republish すること**。

| 変更があった対象 | 更新するマニュアル | ソースファイル |
|---|---|---|
| HR系ページ（Probation / NTE / Recruitment / Onboarding / Performance / Offboarding / Clearance） | **HR Manual** | `docs/manuals/hr-manual.html` |
| Inventory系ページ（Items / Count Templates / Recipes / POS Sync / Hub / Productions / CK・WH Inventory / Daily Inventory / Disposal / Backup / Full Count / Spot Check / Transfers / Qty・Cost Adj / Ledger） | **Inventory Manual** | `docs/manuals/inventory-manual.html` |
| Procurement系ページ（**Store Supplier Orders** / Approval Inbox / CK Orders / POs / Invoices / Payments / Vendors / Scorecards / Risk Lab / KPI / Exceptions / Cold Chain / Delivery Schedule / Whitelist / Catalog / Receiving / Evaluation） | **Procurement Manual** | `docs/manuals/procurement-manual.html` |
| Payroll系ページ（Manila Payroll / Dubai Payroll / Adjustments / Transactions / Loans / Leave Salary / Staff Profiles / Gov Tables / DTR Upload / Allowances / Remittances / My Pay / Inquiries） | **Payroll Manual** | `docs/manuals/payroll-manual.html` |
| Store Operation Management Channel（BO Dashboard / Manager Inbox / Exception Templates / Pattern Detection / Area Manager Review） | **Management Channel Manual** | `docs/manuals/management-channel-manual.html` |
| Management Accounting系（全社管理 / コスト分析 / 月次レポート / 日次P&L / 設定 / **Vendors 取引先マスタ**） | **管理会計マニュアル** | `docs/manuals/management-accounting-manual.html` |

**Republish 手順:**
```
1. docs/manuals/hr-manual.html (または inventory-manual.html) を Edit で更新
2. Artifact tool で以下を指定して publish:
   - file_path: docs/manuals/hr-manual.html
   - url: https://claude.ai/code/artifact/fbe4c31a-c572-4cc5-a46a-70b62c4dbdb8   ← HR Manual
   - favicon: 📋  (HR) / 📦 (Inventory)

   - file_path: docs/manuals/inventory-manual.html
   - url: https://claude.ai/code/artifact/f4964149-6a34-432c-b86e-46f55b14ce31   ← Inventory Manual
   - favicon: 📦

   - file_path: docs/manuals/procurement-manual.html
   - url: https://claude.ai/code/artifact/16adcf00-0548-4a96-9be1-3e6a228f0ec3   ← Procurement Manual
   - favicon: 🛒

   - file_path: docs/manuals/payroll-manual.html
   - url: https://claude.ai/code/artifact/8f872423-b304-402b-9125-29666285a6ce   ← Payroll Manual
   - favicon: 💰

   - file_path: docs/manuals/management-channel-manual.html
   - url: https://claude.ai/code/artifact/5dbc366b-bd8e-4aca-80bd-763f8ddbe9e3   ← Management Channel Manual
   - favicon: 🏪

   - file_path: docs/manuals/management-accounting-manual.html
   - url: https://claude.ai/code/artifact/7d9e43e9-7884-489a-9497-5eb08a960183   ← 管理会計マニュアル
   - favicon: 📊
```

**更新対象の判断基準:**
- 新しいUI要素・ステップが追加された → 対応セクションに手順を追記
- 既存の動作が変更された → 既存の説明を修正
- バグ修正で挙動が変わった → 該当箇所を更新
- 単なるバックエンド内部変更・見た目に影響のない修正 → 更新不要

> ⚠️ **新規ページ追加時の必須作業**: 新しいページを実装したら、上記テーブルの該当行にそのページ名を追加すること。リストに載っていないページは自動更新ルールが発動しない（2026-08 Store Supplier Ordersで実際に発生）。HR/Inventory/Procurement/Payroll系のページを変更・追加した際は、**明示的な指示がなくても必ずマニュアルを更新してartifactを再publishすること**。

---

## アプリ概要

**"Sushi ZEN Workforce OS"** — ドバイ・マニラのSushi ZENレストラン向け内部管理システム。
シフト管理・勤怠・調達・在庫・スタッフ管理を統合。

**UIルール: 全UIテキストは英語のみ。** ユーザーが明示的に要求しない限り日本語禁止。

---

## リポジトリ構成

```
sushizen-shift-pwa/          ← このリポジトリ (Next.js 15 App Router)
  src/app/                   ← ページ (全て "use client")
  src/components/            ← 共有コンポーネント
  src/lib/                   ← ユーティリティ・クライアント

sushizen_shift_app_clean/    ← バックエンド (Python FastAPI / Heroku)
  app/main.py                ← 全APIルート (~31,500行)
  app/db.py                  ← 全DB関数 (~45,700行)
```

---

## デプロイコマンド

```bash
# フロントエンド (Vercel auto-deploy)
cd /Users/jaynishimura/Desktop/sushizen-shift-pwa
git add -A && git commit -m "メッセージ" && git push origin HEAD:main

# バックエンド (Heroku)
cd /Users/jaynishimura/Desktop/sushizen_shift_app_clean
git add -A && git commit -m "メッセージ"
git push heroku HEAD:master --force

# Herokuログ確認
heroku logs -a sushizen-shift-app -n 200

# lint
cd /Users/jaynishimura/Desktop/sushizen-shift-pwa && npm run lint

# TypeScript check
npx tsc --noEmit
```

---

## アーキテクチャ

### APIプロキシ
- `/api/admin/*` → `src/app/api/admin/[...slug]/route.ts` → Heroku
- `/api/store/*` → `src/app/api/store/[...slug]/route.ts` → Heroku
- 本番: Vercelの rewrite で全 `/api/*` を Heroku へ転送

### ブラウザ操作時のログインアカウント
- **必ずこのアカウントでログイン**: `Yukihiro Nishimura`（ロール: HQ）
- PINはユーザーに確認する。ログインページ: https://sushizen-shift-pwa.vercel.app → "Log In" → Staff Name入力 → PIN入力
- HQロールは全admin機能にアクセス可能

### 認証 (`src/lib/auth.ts`)
- `localStorage["sushizen_shift_auth"]` に保存
- ロール: `ADMIN`, `HQ`, `MANILA_MANAGEMENT`, `DUBAI_MANAGEMENT`, `HR_MANAGER`, `STAFF`
- `isAdmin(auth)` → `role === "ADMIN"` のみ
- `canAccessAdminNav(auth)` → `permissions[]` をチェック

### デザインシステム (`src/lib/ui-tokens.ts`)
`GLASS_CARD`, `PRIMARY_BUTTON`, `TAB_ACTIVE`, `KPI_CARD`, `T_PAGE_TITLE` 等。
**必ずここからimport — ページにrawのTailwindクラスを直書きしない。**

---

## 重要ページ

| ルート | ファイル | 備考 |
|---|---|---|
| `/week` | `src/app/week/page.tsx` | **Critical — 意図せず触れない** |
| `/admin/draft` | `src/app/admin/draft/page.tsx` | 2524行 — 要注意 |
| `/store/procurement/request` | `...request/page.tsx` | Store発注フォーム |
| `/store/cold-chain` | `...cold-chain/page.tsx` | コールドチェーン記録 |
| `/store/evaluation` | `...evaluation/page.tsx` | 店舗評価フォーム |
| `/admin/store-evaluations` | `...store-evaluations/page.tsx` | 評価管理・Dashboard |

---

## ⚠️ 教訓 — 繰り返し禁止

1. **JSXブロックの削除はRegex禁止** → 行番号ベースのみ
2. **Vercelロールバック** → git resetではなく Dashboard → "Promote to Production"
3. **スマートクォート注意** `"` / `"` がTypeScriptを壊す
4. **`/admin/draft` 認証ガード** → `canAccessAdminNav()` だけでなく `|| role === "HQ"` も必要
5. **AutoReload削除禁止** → `LayoutShell.tsx` の `<AutoReload />` は常に必要
6. **RealDictCursor + `[0]` 禁止** → Python側で `cur.fetchone()[0]` はKeyError(0)を引き起こす。`.get("col", 0)` を使う
7. **psycopg2トランザクションabort連鎖** → 1接続で複数クエリを実行する場合、1つ失敗すると後続が全滅。クエリごとに独立した接続を使う
8. **CKアイテム一括操作は is_commissary フィルタが必須** → `deactivate_items_not_in()` は必ず `AND is_commissary = FALSE` を含める。これが欠落するとReplace-modeインポートがCKコミサリーアイテムも消す（2026-07 実際に発生）
9. **restore_commissary_items() は過去アイテムを全部戻す危険がある** → 無条件で `is_commissary=TRUE AND is_active=FALSE` を全件復元すると、`[Retired]`アイテムや旧セクションの重複エントリまで復活する。現在の実装は「7日以内に非アクティブ化 + [Retired]除外」に制限済み。CK復元後に問題が起きたら **Manage Items → "Fix Restore Issues"（オレンジ）ボタン** を実行して重複・[Retired]を再クリーンアップする
10. **apiFetch のパス引数に `${API_BASE}` を含めない** → `apiFetch` は内部で `${API_BASE}${path}` を組み立てるため、引数に `${API_BASE}/api/...` を渡すとURLが二重になり "Failed to fetch" が発生する（2026-07 Restore CK Items で発生）
12. **openpyxl で Excel を読む場合は必ず `read_only=True` + `iter_rows` を使う** → `load_workbook()` デフォルトモードで保存されたExcelを開くと `ws.max_row` が 1,048,576（Excelの最大行数）に膨らむことがある。`for r in range(5, ws.max_row+1)` でループすると100万行をスキャンしてHerokuの30秒タイムアウトを超え "Failed to fetch" になる。必ず `load_workbook(data_only=True, read_only=True)` + `ws.iter_rows(min_row=5, values_only=True)` + 連続空行カウンタ（30行超でbreak）の3点セットで実装する。また、Excelテンプレートは最初の行にしかCityやCategoryを書かない「視覚的マージ」パターンがあるため、空白セルは直前の有効値をcarry-forwardする（明示的な不正値はエラー+スキップ、空白のみcarry-forward）。（2026-07 CK Par Level Import で発生）
11. **NavBarにメニューを追加したら必ずRole Managementも更新する** → 新規ページを NavBar に追加したとき、`access_control.py` の `ACCESS_CHANNELS`（チャンネル登録）と `ACCESS_PERMISSIONS`（`channel.xxx.view` パーミッション）に同時追加しないとRole ManagementのChannels/Rolesタブに表示されない。追加後は Heroku デプロイを行い、Role Management → "Resync System Channels" ボタンを押してDBを同期する。カスタムロール（HR Staff等）はデフォルトでは権限が付かないため、管理者がRoles タブで手動チェックして Save する必要がある。（2026-07 Probation/Camilla 件で発生）
13. **ブラウザ側の fetch は必ず相対 URL `/api/...` を使う — `${getApiBase()}/api/...` 禁止** → Phase 3認証では認証情報が `sz_access` httpOnly Cookie に保存される。この Cookie は Vercel ドメインにのみ送られるため、ブラウザから Heroku に直接リクエスト（`https://sushizen-shift-app.herokuapp.com/api/...`）するとCookieが届かず 401 "Authentication required" になる。必ず `/api/...` の相対 URL を使い、Next.js プロキシ経由で Heroku に転送させること。プロキシが `sz_access` を読んで `Authorization: Bearer` ヘッダーとして付与する。新しい API エンドポイントを使うコンポーネントを作る場合は、対応する `src/app/api/...` プロキシ Route Handler を先に作ること。（2026-08 AI Analytics Pro Saved Answers / Private Reports で発生）
14. **公開シフトの「最新」判定は `shift_published_rows.updated_at` を使う — `shift_published_versions.published_at` 禁止** → Manual Shift の編集は `(city, branch_code, week)` の **既存** version 行に行を追加するだけで `published_at` を更新しない。そのため `published_at` で並べると「今直した行」が「後から publish された別ブランチの古い行」に負ける。`shift_published_rows` を複数バージョン跨ぎで読む箇所は必ず `DISTINCT ON (staff_name, work_date) ... ORDER BY r.updated_at DESC, v.published_at DESC` にする。（2026-08 発見。※Patrick 8/20 の実際の原因はこれではなく下記16だった — これは予防的ハードニング）
15. **`WHERE ... != 'approved'` 付き UPSERT の成功件数は `cur.rowcount` で数える** → `manila_attendance_daily` の UPSERT は approved 行を更新しない。それを無条件に `written += 1` していたため「Sync complete — N rows written」と出るのに実データは1行も変わらない、という最悪の沈黙バグになった。ガード付き UPSERT は必ず `cur.rowcount == 0` を検知し、スキップした行をレスポンス＋UIに出す。（2026-08 DTR Sync で発生）
16. **DTR Sync が「効かない」ときは、まず Preview Sync のブロック表示を見る** → `shift_data_missing` / `suspicious_sessions` が1件でもあると「Sync to DTR」ボタンが `disabled` になり、**1行も書き込まれない**。他人（例：Anthony/Tricia のシフト未公開、Gessa/Mayorico の打刻漏れ）が原因でも全員分の同期が止まる。「シフトを直したのに DTR が変わらない」の実際の原因はほぼこれ。個別に急ぐ場合は DTR Records の Schedule 列（鉛筆アイコン）をクリックして `HH:MM-HH:MM` を直接入力すれば、その行だけ late/undertime が再計算される。（2026-08 Patrick 8/20・8/22 で発生）
17. **給与系の一括処理で「1件でも不備があれば全体を中断」は作ってはいけない** → DTR Sync は `shift_data_missing` / `suspicious_sessions` があると全員分を書かずに `return {"error": ...}` していた。結果、他人の不備で数ヶ月間シフト修正がDTRに届かず、しかも画面上は原因が分かりにくかった。**不備のある行だけスキップして残りは処理し、スキップした行を必ずレスポンスとUIに出す**こと。安全ゲートの目的（誤った値を書かない）は行単位スキップで完全に満たせる。（2026-08-24 改善済み）
19. **Nextのプロキシにヘッダーを追加するときは `[...slug]` だけを直してはいけない** → `src/app/api/auth/verify/route.ts` のような**個別ルートが catch-all より優先される**。catch-all にだけ転送を足すと、その個別ルートを通る経路（＝ログイン）でヘッダーが落ちて全員ログイン不能になる。`find src/app/api -name route.ts` で個別ルートを必ず列挙してから着手し、**デプロイ後は必ず実ブラウザでログインを検証する**。（2026-08-25 X-Approver-Pin 移行で実際に発生・即revertで復旧）

21. **「〇〇に依頼してください」と案内する前に、その〇〇が実在するかDBで確認する** → CK Inventory のロック解除で「マネージャーに依頼してください」と案内しようとしたが、Manila CK/WH/BO の25名は全員 STAFF ロールで、解除できる人は0名だった（解除可能なのは HQ の6名のみ、全員 dubai 登録）。実行できない案内は、案内が無いより悪い。権限を要する操作の文言を書くときは `staff_auth.role` を必ず実データで確認する。（2026-08-26 ユーザー指摘で発覚）

22. **取り消せない操作を主ボタンにしない／取り消し経路を必ず用意する** → CK Inventory は Finalize が紫の主ボタン、毎日使う Save Draft が控えめなセカンダリだった。結果、206件中13件しか入力していない状態でロックされ、しかも解除機能が存在しなかった。現場は「新しいセッションを作る」で回避し、30日で138セッション（本来約30）に膨れた。**頻度の高い操作を主ボタンに、取り消せない操作は従に。そして取り消し経路を権限制限＋記録つきで用意する。**（2026-08-26）

20. **シード関数と実DBの二重管理をしない — 片方だけ直すと「巻き戻しボタン」が生まれる** → Management Channel のテンプレートをDBに直接投入して完了としたが、BO Dashboard の「Seed Default Templates」ボタンが呼ぶ `seed_management_templates()` は古い定義のままだった。`ON CONFLICT DO UPDATE` なので、誰かが1回押すだけで新しい設定が全消えする。**UIにシード/リセットボタンがある設定は、必ずそのシード関数を唯一の正とし、DBへの直接投入はしない。**直した後は実際にシードを実行して往復を検証する。（2026-08-26 発見・修正済み）

18. **外部マスタ（公開シフト）を無条件に信じて実績データを上書きしない** → 公開シフトが誤っているケースは実在する（正しいDTR×誤シフト35行 vs その逆9行）。実打刻という「事実」を判定基準にし、乖離が大きい場合は上書きせず要確認リストに回す（`_SCHEDULE_CONFLICT_H = 2.0`）。真の遅刻者は既存スケジュールと公開シフトが一致するため影響を受けない。（2026-08-24 実装）

---

## git index.lock クリーンアップ

```bash
rm /Users/jaynishimura/Desktop/sushizen-shift-pwa/.git/index.lock
rm /Users/jaynishimura/Desktop/sushizen_shift_app_clean/.git/index.lock
```
