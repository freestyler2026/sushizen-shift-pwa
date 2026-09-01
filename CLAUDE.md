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
| 残業（**Overtime Requests** / Add to Payroll / DTR の OT 同期 / 未加算警告） | **Overtime to Payroll** | `docs/manuals/overtime-manual.html` |
| Store Operation Management Channel（BO Dashboard / Manager Inbox / Exception Templates / Pattern Detection / Area Manager Review） | **Management Channel Manual** | `docs/manuals/management-channel-manual.html` |
| Management Channel の**配信**（当番表 / 送信ガード / Discord通知 / エスカレーション / 送信量の決め方） | **Management Channel Delivery** | `docs/manuals/management-channel-delivery-manual.html` |
| Management Accounting系（全社管理 / コスト分析 / 月次レポート / 日次P&L / 設定） | **管理会計マニュアル** | `docs/manuals/management-accounting-manual.html` |
| 税務・証憑系（**Vendors 取引先マスタ** / 証憑台帳 / レシート自動仕分け） | **税務・証憑マニュアル** | `docs/manuals/tax-filing-manual.html` |
| 緊急通報系（**Report Something** / Waiting for Someone / My Phone Number / Emergency Contacts） | **Emergency Reporting**（スタッフ向け・英語） | `docs/manuals/emergency-reporting.html` |
| Recruitment系（Applicants / Requisitions / Hiring Plans / 面接結果記録） | **Recruitment Guide**（HRスタッフ向け・英語） | `docs/manuals/recruitment-guide.html` |

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

   - file_path: docs/manuals/overtime-manual.html
   - url: https://claude.ai/code/artifact/eb8926ea-2755-4b3a-a946-543b137cc823   ← Overtime to Payroll
   - favicon: ⏱️
   ※ 申請→Approve→Add to Payroll→給与計算の流れ専用。Payroll Manual とは役割が別。

   - file_path: docs/manuals/management-channel-manual.html
   - url: https://claude.ai/code/artifact/5dbc366b-bd8e-4aca-80bd-763f8ddbe9e3   ← Management Channel Manual
   - favicon: 🏪

   - file_path: docs/manuals/management-channel-delivery-manual.html
   - url: https://claude.ai/code/artifact/ed3cb8da-3690-4604-b02b-80b2c54ab35a   ← Management Channel Delivery
   - favicon: 📬
   ※ 配信の仕組み（当番表・宛先ガード・Discord・24時間エスカレーション・送信量）専用。
     チャンネル全体の運用は上の Management Channel Manual と役割が別なので統合しないこと。

   - file_path: docs/manuals/management-accounting-manual.html
   - url: https://claude.ai/code/artifact/7d9e43e9-7884-489a-9497-5eb08a960183   ← 管理会計マニュアル
   - favicon: 📊

   - file_path: docs/manuals/tax-filing-manual.html
   - url: https://claude.ai/code/artifact/a1d6d054-68fd-42e2-90d8-51c22192cfa5   ← 税務・証憑マニュアル
   - favicon: 🧾

   - file_path: docs/manuals/emergency-reporting.html
   - url: https://claude.ai/code/artifact/9b1b9346-202a-4c94-9dd3-2ad3f39cd702   ← Emergency Reporting（スタッフ向け）
   - favicon: 🚨
   ※ これだけ英語・スマホ1画面スクロール。読者が店舗スタッフで、
     緊急時に端末で読むため。他マニュアル（日本語・サイドバー式）と体裁を揃えないこと。

   - file_path: docs/manuals/recruitment-guide.html
   - url: https://claude.ai/code/artifact/88b8c09e-8bff-4dab-8525-f3782bcf6dc9   ← Recruitment Guide（HRスタッフ向け）
   - favicon: 🧭
   ※ 英語。読者はマニラのHRスタッフ・HRマネージャー。
     「入力が増えるのではなく減る」という論旨が定着の条件なので、
     機能追加として書き直さないこと。HR Manual とは役割が別。
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

## 🧭 設計思想 — 「難しそうで使えない」を無くす

> **このOSの目的は、機能を持つことではなく、現場が実際に使うこと。**
> 使われない機能はゼロと同じであり、しばしばゼロより悪い（記録があるように見えて無いため）。

10店舗以上への拡大を前提にしている。**その規模では、直感的でない画面は「使われない」ではなく「嘘のデータを生む」。**
実装・レビューのたびに以下を判断基準にすること。

### 使われなくなる原因は、ほぼこの10パターン

2026-08-31 にHR全9ページを実測して得た型。**新機能を作る前に、この一覧に照らすこと。**

| # | 型 | 実際に起きたこと |
|---|---|---|
| 1 | **同じ事実に「安い道」と「高い道」があり、安い道が何も残さない** | ステータス1クリック vs 6項目フォーム → 面接済み92名 / 記録3件 |
| 2 | **唯一の道が重い** | 13項目フォームしか無い → 評価予定177件 / 記録**0件** |
| 3 | **キューの唯一の出口が最重量アクション** | 「NTE発行」しか選べない → 下書き170件 / 処理**0件** |
| 4 | **閾値が無く、ノイズが本物を埋める** | ₱0.03でも始末書 → 83%がノイズ → ₱7,001の実害が3ヶ月埋没 |
| 5 | **画面が「次に何をすべきか」を示さない** | Clearanceが作成日順 → 74日待ちの人が最下部 |
| 6 | **作ったが繋いでいない** | `overdue_reviews()` を実装しUIから呼ばず → 報告15件 / 画面18件 |
| 7 | **読める数字が押せない** | 「Active Notices: 21」がただの表示で、21件に到達できない |
| 8 | **システムが知っていることを人に打たせる** | Verified By を1人16回・Reviewed By を毎回手入力 |
| 9 | **ルールが画面に無い** | 閾値・並び順・自動処理の条件が見えない＝信用されない |
| 10 | **無言の行き止まり** | 取得失敗でボタン0個・保存不可・説明なし |

### 実装時の規則

- **判断は3タップ以内。** 結果ボタン → 理由チップ → 保存。それ以上かかる記録は書かれない
- **署名者と日時は聞かない。** ログイン中の本人と当日で確定する。**聞く項目は飛ばされる項目**
- **理由が必要なのは「後で必ず聞かれる結果」だけ。** 前に進む判断に理由は要らない
- **重い詳細フォームは消さず、隣に残す。** 「Full scored review instead」のように逃げ道を用意する
- **一括操作は人単位。** 170件を1件ずつは着手されず、全件一括は無審査で消える。**人単位が判断の粒度**
- **取り消し方を画面に書く**（教訓22）
- **副作用は実行前に名前で言う。** 「このプランを閉じると配下の求人票も閉じます」
- **専門用語を作らない。** オーナーが「なんのことですか」と聞く名前の機能は、現場も分かっていない

### レビュー時の判定（主観で決めない）

| 操作 | 目標 | 判定 |
|---|---|---|
| 判断を1件記録する | **30秒以内・3タップ以内** | 実測 |
| 「一番古い案件」を特定する | **5秒以内・スクロールなし** | 実測 |
| 対応が必要な件数を知る | **画面を開いた瞬間** | 実測 |

**受け入れテストは本人にやらせる。** Impersonation で開発側が確認しても不十分（正解を知っているので必ず速い）。
**説明が必要になった箇所は、その画面の不具合として記録する。** 本人の理解不足として扱わない。

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

23. **FormData を送る fetch に `getAuthHeaders()` を使わない — 必ず `getUploadHeaders()`** → `getAuthHeaders()` は `Content-Type: application/json` を固定で付ける。これがブラウザの multipart boundary を上書きし、FastAPI 側では「fileフィールドが無い」と見えて **422** になる。ファイルサイズに関係なく**全てのアップロードが失敗**する。他の全アップロード箇所は `getUploadHeaders()` を使うか `delete headers["Content-Type"]` しているが、Store Supplier Orders だけ抜けていた（2026-08-27 実際に発生。スタッフからの「Invoiceが添付できない」の真因）。

24. **Vercel の Function リクエストボディ上限は約4.3MB — スマホ写真は超える** → 本番で実測: 4000KB→200 / 4400KB→413（`FUNCTION_PAYLOAD_TOO_LARGE`、**text/plain**）。バックエンドが20MBを許可していても、リクエストはそこに到達しない。写真アップロードは必ず `src/lib/image-compress.ts` の `prepareUpload()` でブラウザ側で縮小してから送る。またエラー処理で `res.ok` を見る**前に** `res.json()` を呼ぶと、text/plain の413で例外になり原因が消える。`readError()` を使うこと。

25. **アクセス判定にロール名のベタ書きだけを使わない — Role Management が嘘になる** → カスタムロール（MANILA_STAFF / MANILA_MANAGER / INVENTORY_PURCHASING 等）は `staff_auth.role` こそ STAFF だが、トークンの `role` には**解決済みのカスタムロール名**が入る（例 `INVENTORY_PURCHASING`）。いずれにせよ `["HQ","ADMIN","MANILA_MANAGEMENT"].includes(role)` には該当せず、どれだけ権限にチェックを入れても**永久に false**。ロール名リストは残してよいが、必ず権限による経路を `||` で足す。（2026-08-27 Store Supplier Orders で発覚 → 構造修正は次項）

30. **Driveのファイルは「アップロードしたサービスアカウント」でしか読めない** → 2026-08-27 に発生。レシートは用途ごとに別のSAでアップロードされている（petty cash / receipt log = `procurement_drive_chain`、請求書 = `Dubai_Discord_Invoice_Json`）。他方のSAで読むと **404 File not found**（権限エラーではないので原因が分かりにくい）。`app/services/receipt_ocr.py` の `_drive_services()` が複数の認証を順に試す。新しいDrive保存先を追加したら、この関数にも足すこと。

29. **画像を base64 で DB に持つ列を、一覧クエリで SELECT しない** → 2026-08-27 に本番を3回落とした原因。
    - `proc_po_invoice_checks.photo_data` = **416行で864MB**（最大5.8MB/行）、`proc_receivings.invoice_photo_b64` = **379行で839MB**。
    - `list_pending_po_invoice_checks` がこの2列を **最大500行ぶん** SELECT していた。100行読むだけで one-off dyno が即死（＝完全再現）。web dyno は 1024MB、常時 約295MB。
    - 修正: 一覧は `has_photo_data` / `has_store_invoice_photo` の真偽値だけ返し、画像は開いた1件だけ `GET /api/admin/procurement/po-invoice-checks/{id}/photo` で取る。**148行 +3MB**（修正前は死亡）。
    - **DB全体を実測して洗い出し済み（2026-08-27）**。100KB/行を超える列は6つだけ:
      | 列 | 合計 | 最大/行 | 状態 |
      |---|---:|---:|---|
      | `proc_po_invoice_checks.photo_data` | 869MB | 5.7MB | 一覧から除外済 |
      | `proc_audit_logs.after_json` | 860MB | 5.7MB | 828MBが写真のコピー。読み書き両方で除去済 |
      | `proc_receivings.invoice_photo_b64` | 849MB | 5.7MB | 一覧から除外済 |
      | `proc_po_invoice_checks.extra_photos` | 13MB | 2.1MB | 小 |
      | `expense_reimbursement_requests.receipt_image` | 3MB | 0.4MB | 小 |
      | `policy_documents.file_content` | 2MB | 0.7MB | 小 |
      再点検するときは `information_schema.columns` から text/jsonb 列を総なめして `MAX(octet_length(...))` を測る（このやり方でこの表を作った）。
    - **監査ログに画像を入れない**。`_strip_blobs()`（db.py）が `invoice_photo_b64` / `photo_data` / `extra_photos` / `receipt_image` / `image_b64` を書き込み前に落とす。新しい画像列を作ったらこのタプルに足す。
    - 調査手順: `heroku labs:enable log-runtime-metrics` → `sample#memory_total` を追う。**落ちたリクエストはアクセスログに残らない**（uvicornは完了時にしか記録しない）ので、`main.py` の `memory_watch` ミドルウェアが入口/出口でRSSを記録する。閾値は環境変数で**デプロイ不要**に調整可能:
      ```bash
      heroku config:set RSS_ALARM_MB=650 RSS_DELTA_MB=15 -a sushizen-shift-app
      ```
    - ⚠️ **RSSはプロセス全体なので、重い処理と重なっただけのリクエストが濡れ衣を着る**（badge系が "+218MB" と出た）。必ず one-off dyno で単独実測して裏を取ること。
    - **画像アップロードは28画面すべてクライアント圧縮済み（2026-08-27）**。`src/lib/image-compress.ts`:
      | 関数 | 用途 |
      |---|---|
      | `prepareUpload(file)` | 画像を長辺2000pxに縮小。PDFは素通し、超過時はエラー |
      | `prepareDataUrl(file)` | 縮小してから base64 data URL に。**DBに入れる画面はこれ** |
      | `prepareIfImage(file)` | 画像だけ縮小、xlsx等は素通し。**混在acceptの入力はこれ** |
      新しいアップロード画面を作ったら必ずどれかを通すこと。

28. **`/api/admin/*` の認可は「まず計測、次に区画ごとに有効化」** → 2026-08-27 導入。471件が認証のみで無防備だったが、一括で塞ぐと現に働いている人を止める。
    - 実装: `app/api_authz.py` + `admin_auth_gate` 内のチェック。APIパス→チャンネルを導出し（`_EXPLICIT` に例外表）、拒否すべき要求を `api_authz_observations` に記録**するだけ**で通す。
    - 環境変数:
      ```bash
      heroku config:get ADMIN_AUTHZ_MODE -a sushizen-shift-app     # 未設定=log（既定・無害）
      heroku config:set ADMIN_AUTHZ_ENFORCE=/api/admin/inventory -a sushizen-shift-app  # 区画ごとに有効化
      heroku config:set ADMIN_AUTHZ_MODE=enforce -a sushizen-shift-app
      ```
      **enforce は `ADMIN_AUTHZ_ENFORCE` に列挙したプレフィックスにしか効かない。** 戻すのは config を消すだけ（デプロイ不要）。
    - 確認: `GET /api/admin/authz-survey`（`admin.security` 権限が必要）。**有効化する前に必ず読む** — その業務を実際にしている人の名前が出ている行は、有効化すればその人が止まる。
    - マッピングできないサブツリーは**推測せず素通り**させる。誤った推測で締め出す方が有害。
    - 計測は絶対にリクエストを壊してはいけない（全体を try で囲み、例外はログのみ）。

27. **権限の検証は Impersonation（Login As）で行う — 合成トークンでは嘘の結果が出る** → 2026-08-27 に修正。
    - `/admin/staff/roles` の "Login As" → 対象者として本番を操作できる。終了は上部バナーの Exit。
    - トークンは **httpOnly Cookie `sz_imp`**（`/api/admin/impersonate` が発行）。JSからは読めない。プロキシは `sz_imp` → `sz_access` の順で採用する。
    - **プロキシで Cookie を読む箇所は `sessionToken(req)`（`src/lib/proxy-auth.ts`）を使う。** 各ルートで `req.cookies.get("sz_access")` を直に読むと impersonation が効かなくなる（20ルートが該当していた。教訓19と同じ罠）。
    - Impersonation 中は **401の自動リフレッシュを行わない**（`sz_session` は管理者のもので、リフレッシュすると管理者権限に戻る）。多重 impersonation も409で拒否。ログアウトは `sz_imp` も消す。
    - ⚠️ **`issue_access_token(role="STAFF", ...)` で自作したトークンで検証してはいけない。** カスタムロールの実トークンは `role` に解決済みのロール名（`INVENTORY_PURCHASING` 等）が入る。role="STAFF" で作ると通ってしまい、実ユーザーが403になるバグを見逃す（実際に `store_supplier_api._require_view` の不具合を見逃した）。

26. **アクセス制御は Role Management を唯一の正とする — ロール名判定は「追加の抜け道」としてのみ** → 2026-08-27 に構造修正済み。
    - `NavBar.canSeeAdminItem()` の末尾は `channelAccessForRoute(href, auth)`。**`return false` に戻してはいけない** — if連鎖に書き忘れたページが全員に見えなくなる（修正前は 76/146 の権限が死んでいた → 現在 14）。
    - ルート→チャンネル対応は `src/lib/access-channels.ts`（**自動生成・手編集禁止**）。バックエンドの `ACCESS_CHANNELS` を変えたら必ず再生成:
      ```bash
      python3 scripts/sync-access-channels.py           # 再生成
      python3 scripts/sync-access-channels.py --check   # 差分検出（stale なら exit 1）
      python3 scripts/audit-dead-permissions.py         # 効かない権限を列挙（新チャンネル追加後は必須）
      ```
    - バックエンドは `_actor_allows(actor, ROLES, "channel.xxx.view")`（`app/main.py`、`_actor_from_token_request` の隣）。
    - 新チャンネルの権限キーは**必ず `channel.` 接頭辞付き**。管理UI経由で作られたチャンネルは接頭辞が欠けており、8ロールに付与済みの権限が無効だった（`db.py` の auto-repair INSERT を修正済み）。
    - グローバルの `admin_auth_gate` は**ログイン済みかを見るだけで、認可はしない**。`/api/admin/*` の各エンドポイントは自前で権限を確認すること（Company Assets の13エンドポイントが全スタッフに開いていた実例あり）。
    - ⚠️ **残課題: `.manage` 系13権限が未配線**（`audit-dead-permissions.py` が列挙）。`view` は全て有効。


31. **「同時編集の衝突を検知してブロックする」を作り始めたら、書き込み単位を疑う** → Manual Shift は週全体をブラウザに持ち、Publish で公開週を丸ごと差し替えていた。だから「手元が古い」と他人の修正を消してしまう。そこで `base_state_token` / `base_content_hash` でブロックを入れたが、**直近8コミット中6件がそのブロックの手当て**になり、しかも `delete_published_row` が公開週を直接書き換える一方で基準スタンプは強制読み込みでしか更新されないため、**自分の削除で自分が publish 不能**になっていた（2026-08-27 現場から報告）。
    - 直し方は「ブロックを賢くする」ではなく **ブロックが要らない形にする**。書き込み単位をセルにし、Publish は**触ったセルだけを適用**する（`shift_week_edits` オーバーレイ + `publish_week_cell_edits`）。触っていないセルに書かないので、手元が古くても壊せるものが無い。トークンもハッシュも不要になった。
    - ⚠️ **「サーバー側の下書きから publish する」だけでは不十分。** 下書きが週全体のコピーなら、上書きがサーバー側に移るだけで消えていない。公開データは他に4経路（`publish_from_base` / AI Draft適用 / `inject_staff_rows` / 名前修正カスケード）が書くので、そこから同じ事故が再発する。**差分適用にすること。**
    - localStorage は全廃しない。**週のコピー**は捨て、**未送信の編集キュー**だけ残す（店舗の通信断で打鍵が消えるため）。
    - オーバーレイ行は publish 後も**消さずに published 印を付ける**。`since_rev` ポーリングは行の消滅を検知できないので、消すと他の人の画面に存在しない編集が残る。
    - 公開週を読み直したら**必ずオーバーレイを貼り直す**。片方だけ読むと未公開セルが公開値に戻って見える。
    - 詳細は `docs/design/manual-shift-cell-level.md`。**publish が差分適用になったので、変わっていない行の `updated_at` は更新されない** — 教訓14の方向としては改善だが DTR Sync は実データで再検証すること。

32. **同じ判定を3か所に手で写すと、ロール一覧が3種類になる** → Manual Shift のシフト変更は3か所で別々のロール一覧を持っていた（`manual_publish`＝HQ/ADMIN/HR_MANAGER＋`channel.admin.staff.manage`、`publish_from_base`＝+MANAGEMENT/MANILA_MANAGEMENT/MANAGER、`delete_published_row`＝HQ/ADMIN/MANAGER/MANILA_MANAGEMENT）。しかも **Role Management が用意している `channel.admin.manual_shift.publish` はどこからも読まれていなかった**（grep で `access_control.py` 以外に出現ゼロ＝完全な死に権限）。実効的な鍵は `channel.admin.staff.manage`（Staff管理用・8ロール保有）で、結果として**約42人が公開済みシフトを書き換えられた**。NavBar も `canAccessAdminNav(auth) || ...` だったため、Manual Shift のトグルをOFFにしても誰も締め出せなかった。（2026-08-27 発覚・修正済み）
    - 閉じる前に**実績で誰が使っているかを測る**。`shift_publish_log`（1,408件／2026-07-21〜08-27）と `shift_change_events` を集計したところ、publish も delete も**全員 ADMIN か HQ**。よって Staff管理鍵は温存せず削除できた。
    - **Impersonation で穴の実在を証明してから塞ぐ**（教訓27）。Richard S. Gante（MANILA_MANAGEMENT）で実際にセル書き込みと publish が通ることを確認 → 修正後 403 を確認。
    - **ADMIN をハードコードしない。** ADMIN は付与済みの `channel.admin.manual_shift.publish` で通す。そうしないとトグルが ADMIN に対して嘘のままになる。HQ だけはハードコード（Channels UI が全チャンネルで HQ を `locked` 表示しているので、それと整合させる）。
    - **戻し道を用意する**: `heroku config:set SHIFT_EDIT_ALLOW_STAFF_MANAGE=1` で旧鍵を復活（デプロイ不要）。
    - 締め出される人を**名前で列挙してユーザーに渡す**（今回7名）。「誰も使っていない」で終わらせない。

33. **Role Management で外した既定権限は、次のログインで復活する（教訓20の再発）** → `seed_access_control_defaults()` は `api_auth_verify` から毎回呼ばれ、末尾の「safety migration 2026-05」が **`DEFAULT_ROLE_GRANTS` にあってDBに1行も無い権限を無条件に再INSERT**する。したがってRole ManagementのUIでチェックを外しても、誰かがログインした瞬間に戻る。**システムロールから既定権限を外すには `app/access_control.py` の `DEFAULT_ROLE_GRANTS` を編集するのが必須**で、DBだけ触っても無意味（2026-08-28 ADMINからHR Clearanceを外そうとして実際に発生・DELETEが巻き戻された）。
    - **2026-08-28 修正済み**: 外した権限を `access_role_permission_revocations` に記録し、シード側がそれを読み飛ばす。Rolesタブ（`replace_access_role_permissions`）とChannelsタブ（`replace_channel_view_roles`）の両方に実装。**新しい既定権限が既存ロールに配られる利点は維持**され、再度チェックを入れると記録が消えて元に戻る。
    - 検証手順: 既定権限を1つ外す → **ログイン＋Resync System Channels を実行** → 外れたままなら正常。以前はここで復活していた。
    - あわせて**ロール名のベタ書きも消すこと**。`_clearance_auth_check` が `role in ("HQ","ADMIN")` だったため、権限を外しても11名のADMINがページを開けたままだった（教訓32と同型）。

34. **退職者はロールを持ち続ける — 割り当てを消すだけでは戻ってくる** → 2026-08-28 に発覚。`staff_master.is_active=false` の9名が生きたロールを保持し、うち **Jason Mark Fabillar は最終出社から2か月後もADMIN**、PINも有効だった。`/api/auth/verify` には**在籍チェックが一切ない**（存在確認・凍結・PINのみ）。
    - `staff_role_assignments` を消すだけでは不十分。`resolve_staff_access_profile` は割り当てが無いと **`staff_master.role` にフォールバック**し、そこも `ADMIN` のままだった。**両方を塞ぐには解決関数側で止める。**
    - ⚠️ **`is_active` を退職の判定に使ってはいけない。** 最初の実装はこれで判定し、**産休中の社員から権限を剥奪した**。この会社は `is_active=false` を「退職」と「休職」の**両方**に使っている。区別できる列は存在しない（`hr_separation` は9名中2件、`status` は167名全員 `ACTIVE`）。
    - 実装: `resolve_staff_access_profile` が **`staff_master.status='SEPARATED'`** のとき STAFF・権限ゼロを返す。`status` は他がどこも書かないので、明示的に退職とマークした人だけが権限を失う。逃げ道は `ALLOW_INACTIVE_STAFF_ROLES=1`。
    - **ログインは止めていない。** 誤マークの人はメニューを失うだけで、アカウントは失わない。退職者のPINは有効なままなので、締め出すなら別途凍結が要る。
    - **2026-08-28 に3値化して解消**: `staff_master.status` を `ACTIVE` / `ON_LEAVE` / `SEPARATED` の在籍状態にした。3つとも Staff ページから設定する。`ON_LEAVE` と `SEPARATED` は**どちらもアカウント凍結・セッション切断・給与設定停止**を行い、違いは**ロールを残すか奪うか**だけ。`is_active` は payroll・名簿・スタッフ選択が読むので `ACTIVE` のときだけ TRUE に同期する。
    - 旧 `INACTIVE` は **400 で拒否**する（`ON_LEAVE` に寄せる推測もしない）。推測すると半分は外れ、外れた側は「復職者が締め出される」か「退職者が権限を持ち続ける」のどちらかになるため。既存行の `INACTIVE` 表示だけは `ON_LEAVE` として読む。
    - 検証は Test Account で往復すること: ACTIVE(ADMIN/167) → ON_LEAVE(**ADMIN/167 維持**) → SEPARATED(**STAFF/13**) → ACTIVE(ADMIN/167 復帰)。

35. **同じ計算の前半と後半で、同じ欠損値に逆の仮定を置かない** → マニラ給与の1日計算は「労働時間＝在社−休憩60分（所定・無条件）」と「Undertime＝早退−(60−休憩実績)」の2段。休憩実績が未記録のとき後者の `or 0` が「1分も取っていない」と解釈し、**前半で引いた60分を後半で返していた**。2026-08後半は659勤務日中432日（66%）が未記録なので、これは例外ではなく通常ケース。11日・544分（約₱898）の控除が消え、店舗のマニュアルシートが1人ずつ拾っていた。（2026-08-28 修正）
    - 修正は `_undertime_after_break()` に集約。**未記録＝所定どおり取った**（労働時間側と同じ仮定）。**記録があれば従来どおり未取得分を返す**（41分しか取らなかった人の残19分は正当な労働）。
    - 修正時に判明: **鉛筆アイコンのスケジュール修正経路は休憩調整を一切していなかった**。同じ日でも同期経由と手修正で結果が違う。ルールを2か所に書くとこうなる。
    - 検証は「差額の所在」から入ること。5名の差額を1行ずつ突き合わせたら4名がUndertimeの1項目に集中し、そこから式に到達した。合計額だけ見ていると辿り着けない。
    - ⚠️ **マニュアルシートが常に正しいわけではない**。Renzy 8/21 のHoliday差異は、シートの値が同シートのND合計と1円まで一致しており転記ミスだった。OS側が打刻と整合していた。

36. **統計控除（SSS）の算定基礎に Adjustment が入っている（未修正・方針待ち）** → `compute_payroll_run` は「基本給・OT・ND・遅刻/早退/欠勤」→「Adjustment」→ その合計を `monthly_gross` としてSSS表を参照する。寮の電気代 −272.55 を入れるとSSSが 450.00→437.50 に落ちる（ブラケット降格）。フィリピンの制度上SSSは報酬に対する掛金で、寮費の回収は報酬の減額ではない。
    - **PhilHealth と Pag-IBIG は `staff.monthly_rate`（基本給）ベースなので影響を受けない。** 修正範囲はSSSのみ。
    - 欠勤・遅刻による減額も同じ基礎に入っている。こちらはMSCに反映されるという解釈も成り立つので、会計事務所の見解が要る。
    - 明細の `note` に `monthly_gross=17661.54` / `basic=21000.00` が残っているので、どちらを基礎にしたかは実データで確認できる。

37. **過去の給与期間を再計算してはいけない — 現在のスタッフプロファイルで上書きされる** → 2026-08-28 に2026-07-1H/2Hを再計算したところ、**42名中37名の月額が現在の給与額に書き換わった**（合計 +₱84,235）。エンジンは `manila_staff_profiles` を実行時に読むため、7月以降の昇給が7月の計算に遡って適用される。日割り基準の `official_hire_date` も同様。
    - **再計算前に必ずバックアップを取る**: `CREATE TABLE _payroll_items_backup_YYYYMMDD AS SELECT * FROM manila_payroll_items WHERE period_id IN (...)` と `manila_payroll_runs` の両方。今回はこれで7月を完全復元できた。
    - 検証は `manila_payroll_runs.monthly_rate` をバックアップと比較する（`WHERE r.monthly_rate <> b.monthly_rate`）。1件でも動いていたら遡及汚染。
    - **過去期間の統計控除だけ直したい場合、再計算は使えない。** SSS行だけを個別に更新するか、OS外（SSSの修正申告）で処理する。
    - 当期（8月）は現在レートと一致しているので再計算しても安全だった。**「安全な期間」と「そうでない期間」を分けるのはレートが動いたかどうか**であって、期間の新しさではない。
    - 再計算は他の変更も巻き込む。8月は SSS修正に加えて、入社日日割り（8/5入社の3名、−₱18,358.73＝本来正しい）・OT承認・DTR修正が同時に反映された。**「この差額は今回の修正によるもの」と言えなくなる**ので、差分は必ず項目別に出して原因を分けること。

38. **本番DBにテストレコードを作ったら、その場で消す — 自動処理がいつか実行する** → 2026-08-11 のブラウザ検証で作った `hr_separation` のテスト行（notes に "Test offboarding record - browser verification"）が20日間残り、`last_working_date=2026-08-31` に達した瞬間、深夜の `sync_separations_to_master()` が実在の従業員 Aaron Jay Pamplona を SEPARATED にした。**権限48→0、ログイン凍結**。9/29まで25日分のシフトが公開済みで、8/24に出勤していた。本人が「辞表を出していない」と申告するまで誰も気づかなかった。
    - **原因は掃引ではなくテスト行**。掃引は言われたとおり動いた。しかし「取り消せない操作を、人が見ていない時刻に、記録1行だけを根拠に実行する」設計だったため、間違った入力がそのまま人の締め出しになった。
    - 対策は `separation_contradictions()`（`app/db_hr.py`）。**記録の主張ではなく、人が実際にした事**を見る: ①最終出社日より後に公開シフトがある ②最終出社日より後に打刻がある。どちらかがあれば**その行だけスキップ**して `held_back` で報告（教訓17）。全体中断はしない。
    - **証拠はワーカーログではなくOffboarding一覧の行そのものに出す。** 誤った名前に最初に気づくのはその画面だから。「Not applied — still scheduled for 25 shifts, through 2026-09-29」と表示し、逃げ道（本当に退職ならシフトを消す／記録が誤りなら削除／今すぐ閉じるならStaffページ）も併記する。
    - **チェックがエラーで動かなかった場合は保留する**（`check_failed`）。動かなかったクエリを根拠にログインを奪う方向に倒してはいけない。
    - `created_by` はトークンから取る。既存の全レコードが空欄で、「誰が登録したのか」に答えられなかった。
    - 復旧手順: `staff_master` を ACTIVE に戻す（`set_staff_master_status`）→ `hr_separation` と `hr_separation_items` を削除 → `manila_staff_profiles.last_working_date` を NULL に。3つ全部やらないと戻らない。

39. **自動生成される懲戒文書に閾値が無いと、機能ごと死ぬ** → `cash_nte_drafts` はレジ差異が **1円でもあれば** NTE（始末書）の下書きを生成していた。3ヶ月で **170件・22名分、承認0件**。Cash Report 482件のうち138件（29%）が生成対象。
    - 内訳: CASH差異116件のうち **₱1以下が58件、₱20以下が96件**（最小 ₱0.03）。**3センターボで ₱7,001 の不足と同じ正式文書が作られていた。**
    - **83%がノイズのキューは読まれない。** 結果、₱7,001 / ₱6,000 / ₱-5,205 の実質的な差異が3ヶ月間誰にも報告されなかった。溜まったことより、**本物が埋もれたことが被害**。
    - 対策: `nte_tolerance()`（`app/db_cash_report.py`）。既定 ±₱20、`CASH_NTE_TOLERANCE_PHP` で**デプロイ不要**に変更可。
      ```bash
      heroku config:set CASH_NTE_TOLERANCE_PHP=50 -a sushizen-shift-app
      ```
    - **差異ごとに個別判定**する。1通の文書に「₱0.50の端数」と「₱900の不一致」を並べると文書全体が軽く見え、結局無視される。
    - **閾値は画面に表示する。** 見えないルールは信用されない。既存の下書きは閾値導入前のものなので、その旨も併記。
    - ⚠️ 検証時の罠: `submit_cash_report` は **金種内訳から実額を計算**し、渡した `cash_total` を無視する。テストで `cash_total` だけ変えても差異は動かない。`pos_cash_sales` 側を動かすこと（最初これで8件の誤FAILを出した）。

40. **手動インポートのテーブルは、抜けても誰も気づかない** → `manila_daily_sales` はマニラで唯一の手動インポート（PIN承認付き `/api/admin/analytics/manila/daily-sales/import`）。**2026年7月が丸ごと未取込のまま2ヶ月放置**され、現場からの指摘で発覚した。
    - **気づけなかった理由は、画面が2つのテーブルを混ぜていたこと。** Total/Net Sales は `manila_sales_by_channel`（7月あり）、Transactions は `manila_daily_sales`（7月なし）。**売上は普通に表示され、件数だけが0**になるので異常に見えない。
    - 他の manila_* 15テーブルは全て7月データあり。**欠けているのは手動の1つだけ**だった。
    - ⚠️ **オーダー数の集計は `total_orders` ではなく4つのチャネル列の合計だった。** 745行すべてで両者は一致するので、`COALESCE(total_orders, 内訳合計)` に変更（既存月の数字は不変、内訳未取得の日も正しく出る）。
    - **復元時の列対応は実データで確定させること。** `total_amount` = `net_sales`（191行中118行が一致、`total_sales` は0行一致）。店舗名は `QC` → `Cubao`（2026-04-17以降の表記）。
    - **チャネル内訳は復元しないこと。** `manila_sales_by_channel` から作れそうに見えるが、6月の Paranaque Foodpanda 155件がチャネル輸出に存在しない。総数が正しくても内訳は作れない。**NULLのまま残す方が、作った数字より正しい。**
    - 検知: `manila_daily_sales_gaps()`（`app/db_manila_daily_ops.py`）＋ worker の `run_manila_sales_gap_check`。**直近5日は除外**する（取込は1〜2日遅れるので、毎朝鳴る警告は無視されるようになり、本物の抜けも一緒に無視される）。

18. **外部マスタ（公開シフト）を無条件に信じて実績データを上書きしない** → 公開シフトが誤っているケースは実在する（正しいDTR×誤シフト35行 vs その逆9行）。実打刻という「事実」を判定基準にし、乖離が大きい場合は上書きせず要確認リストに回す（`_SCHEDULE_CONFLICT_H = 2.0`）。真の遅刻者は既存スケジュールと公開シフトが一致するため影響を受けない。（2026-08-24 実装）

41. **`dangerouslySetInnerHTML` のテンプレートリテラル内で `\'` を書くと、ブラウザに届く前に素の `'` になる** → `layout.tsx` の ChunkLoadError 復旧スクリプトが `onclick="...removeItem(\'zen:reload-attempt\')..."` を innerHTML 文字列に埋めており、テンプレートリテラルが `\'` を `'` に変換した結果、JS文字列が途中で終端して `Uncaught SyntaxError: Unexpected identifier 'zen'` になっていた。**構文エラーはスクリプト全体を殺すので、末尾の `addEventListener` が一度も登録されていなかった** — デプロイ後に古いHTMLを掴んだ端末が自動リロードされず、白画面のまま放置される。**2026-08-09 から3週間、全ページで発動していた。**（2026-09-01 修正）
    - **インライン `<script>` は文字列を組み立てるのではなく DOM API で作る。** 入れ子の引用符が無ければ壊しようがない。
    - **検証は `node --check` で行う。** テンプレートリテラルを展開したものをファイルに書いて通す。ブラウザのコンソールを見るだけでは、どのスクリプトが死んでいるか分からない。
    - コンソールの `Uncaught SyntaxError` は**画面が正常に見えても機能が丸ごと死んでいる**サインなので、無害と判断しないこと。

42. **プリレンダーされたHTMLは全ユーザー共通 — localStorage の認証で初回描画を分岐すると「Access denied」が全員に一瞬出る** → 管理ページのHTMLは Vercel のエッジキャッシュから配信され（`x-vercel-cache: HIT`）、**サーバーには localStorage が無いので常に未ログイン状態で描画**される。`useState(getAuth)` で初回から認証を読むと、サーバーHTMLとクライアント初回描画が食い違い React #418（hydration mismatch）になる。`/admin/overtime` は権限ガードがこの初回描画で走っていたため、**アクセス権のあるマネージャーに毎回「Access denied — Manager or above required.」が一瞬表示**されていた。（2026-09-01 該当ページのみ修正）
    - 対処は `const [mounted,setMounted]=useState(false); useEffect(()=>setMounted(true),[])` を挟み、**mounted まで何も断定しない**。NavBar は既にこの形（`resolvedAuth` を null 始まり）で正しい。
    - **#418 自体は今も約半数の管理ページで発生している。** 見た目の実害があるのは「嘘の文言を出すページ」だけなので、そこを優先する。`curl` でページを取得し `<script>` を除去した本文を見れば、**そのページが全ユーザーに何と言っているか**が分かる。
    - 判定に `getAuth()` を使うページは 208 ファイルある。一括対応は影響範囲が大きいので、文言が嘘になるページから個別に直す。

43. **LLMに渡すプロンプトの「出力例」は、読めなかったときにそのまま返ってくる** → Prep Time のレシートOCRのプロンプト末尾が
    `{"has_receipt":true,...,"order_no":"GF-192","ordered_at":"7:59 PM","ready_by":"8:20 PM","prep_minutes":21,"confidence":"high"}`
    という**実在しそうな値**だった。レシートが読めない写真を渡すと `has_receipt:false` ではなく**この例を丸ごと返す**ため、
    `GF-192 / 7:59 PM→8:20 PM / 21分` が **8店舗・37日で1,757件（全記録の20%）**記録された。
    投稿はすべて別々のDiscordメッセージで、投稿者は実在スタッフ。**GrabFoodはドバイに存在しないのに967件がドバイ**だった。（2026-09-01 発見・修正）
    - **例はプレースホルダで書く。** `"<as printed>"` `"<platform>"` `<integer>` のように、返ってきたら一目で分かる形にする。
    - **プロンプトだけ直して終わりにしない。** サーバ側で「例と一致する応答」「`<` で始まる値」を弾く。次に誰かが例を書き換えたとき、受け止めるものが要る。
    - **気づけなかった理由は、値が現実的すぎたこと。** 21分・スコア80は平均そのもので、平均を見ている限り異常に見えない。
      発覚したのは「同一時刻の行が並んでいる」という**画面の見た目**から。集計値ではなく生データを見ること。
    - 検知クエリ: `order_no` と時刻ペアを **OR** で見る。AND（3項目一致）だと、例の片方だけを保持した534件を取りこぼす。
    - **消さずに除外する。** `excluded_reason` を付けて一覧には残し、除外件数をAPIに含める。誤った除外はフィルタを直せばよいが、誤った削除は戻らない。

44. **「あり得ない速さ」の下限はデータからは決まらない — 現場から決める** → Prep Time は10分以下が全て満点になる採点なので、
    1〜5分の記録（60日で23/22/11/19/25件）は**全件スコア100**。分布に切れ目が無く、統計的な根拠で線は引けない。
    「3分未満は受注と完了がほぼ同時＝ボタン操作であって調理ではない」という**厨房側の理屈**で3分に置いた。
    - **低めに置く。** 満点の水増しより、実在する速い仕事を捨てる方が有害。パック済みの箱は5分で出る。
    - `PREP_TIME_FLOOR_MIN` でデプロイ不要に変更可能。

---

## git index.lock クリーンアップ

```bash
rm /Users/jaynishimura/Desktop/sushizen-shift-pwa/.git/index.lock
rm /Users/jaynishimura/Desktop/sushizen_shift_app_clean/.git/index.lock
```
