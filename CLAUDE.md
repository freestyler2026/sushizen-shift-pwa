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
| **Receipt Log**（`/store/receipt-log` 入力フォーム / `/admin/procurement/receipt-log` 全件一覧・月次） | **Receipt Log**（日英切替・スタッフ向け） | `docs/manuals/receipt-log-manual.html` |
| **Morning Review**（`/store/management/review` / レーン分割 / D評価 / 前日レビューの生成） | **The Morning Review**（日英切替・マネージャー向け） | `docs/manuals/morning-review-manual.html` |
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

   - file_path: docs/manuals/receipt-log-manual.html
   - url: https://claude.ai/code/artifact/2ca823ce-1649-4a06-b8cd-eb832c88bf33   ← Receipt Log（日英切替）
   - favicon: 🧾

   - file_path: docs/manuals/morning-review-manual.html
   - url: https://claude.ai/code/artifact/14fd264c-7a57-4489-a604-21f869666e7b   ← The Morning Review（日英切替）
   - favicon: 🌅
   ※ **日英切替式**（既定は英語）。読者はマニラの店舗マネージャーと、日本側の管理。
     「できていないこと」の表は削らないこと — ドバイのPrep Time・Dispatch Time・
     Stock Shortage・繰り返しの可視化が未達であることを現場が知っている状態が、
     この文書の価値。実装が進んだら表から消す。
   ※ **日英切替式**（右上のトグル・既定は英語）。読者はレジに立つ店舗スタッフと、
     月次を締めるマニラ／日本の事務。既定を日本語にしないこと — 実際に入力するのは
     現地スタッフで、UIも英語のため。片方の言語だけ直すと、もう片方が嘘になる。
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
    - ⚠️ **2026-09-04: `set_staff_master_status()` を直接呼んでも凍結されない。** この関数は
      `staff_master` の行を書き換えるだけで、**凍結・セッション切断・給与設定停止・監査ログは
      エンドポイント側（`main.py` の status 変更API）に書かれている**。スクリプトからDB関数だけ
      呼ぶと、status は ON_LEAVE なのに **PINでログインできる**状態が残る（実際に作った）。
      教訓20と同型 — UIが正とする処理をDB関数の直呼びで代替しない。**やるなら
      `freeze_staff_account` + `invalidate_staff_sessions` + `insert_staff_audit_log` まで揃える。**
    - ⚠️ **`auto_frozen=True` の凍結は `is_active` が TRUE に戻ると自動解除される**
      （`api_auth_verify` 内。名簿が正なので意図どおり）。凍結を効かせたいなら
      `is_active=False`（＝status が ACTIVE 以外）と揃っていること。手動凍結は自動解除されない。
    - ⚠️ **`remove_staff_role_assignment()` はソフト削除**（`is_active=FALSE`）。行は残るので、
      確認クエリで `is_active` を見ないと「消えていない」と誤読する。効いたかどうかは
      行ではなく **`resolve_staff_access_profile()` の権限数**で見る。

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

45. **取込が「人が押すボタン」1つに依存していると、外部セッション切れで静かに欠測する — 欠測は正しいテーブルほど気づけない** → AR Payouts の入金データは Drive → Syncボタン（手動）の一経路だけ。ポータルのセッションが切れると誰もエクスポートできず、Driveが空のまま画面は健全に見える。**Grab は517回連続で毎日入金があり、それが6日間止まっていたのに、どの画面も何も言わなかった。**保持している行は全部正しく、行が少ないだけだから。（2026-09-01 発見）
    - **セッションが回復しても直らない。** ファイルがDriveに戻ってきても Sync を押す人がいなければ入らない。**取込は worker で自動化する**（`run_ar_payout_auto_sync`、毎時）。押し忘れが原因の欠測は、押す必要をなくす以外に直しようがない。
    - 検知は**各ストリーム自身の履歴**で行う（`ar_payout_gaps()`）。Grabは1日、Careem/Noonは週、Smilesは月で、**固定の閾値は30倍ずれる**。
    - ⚠️ **中央値を使うと Foodpanda で毎週誤報が出る。** Foodpandaは「日次の行を週1回まとめて」届くので gap は 1,1,1,1,5,1,1,1,1,5… となり中央値は1日。**p90を使う**（p90=4〜5なので週次バッチは通り、本当の停止だけ出る）。実測して決めること。
    - **兄弟店舗の比較はカレンダーより鋭い。** Smiles は AB/AM が8/31に入金され ARJ/BB/JLT だけ来ていない。「1サイクル遅れ」で即検知できる（閾値は半サイクル）。ただし**店舗コードが総入れ替えされたプラットフォームでは兄弟比較は嘘になる**（Talabat: 旧AVS/RZ/SZ → 新671526/AB/… の3体制が混在）。履歴のない新コードが直近の大半を占めるなら `roster_changed` として「店舗別の判定はできない」と正直に出す。推測で「欠測」と言わない。
    - 結果は**5件のみ**（Grab 1・Smiles 3・Talabat 1）。閾値なしなら数百件になり教訓39の再演になっていた。

46. **保存のレスポンスを見ないUIは、失敗を成功と同じ見た目にする — 金額を記録する画面では特に** → AR Payouts の Confirm はモーダルを閉じて一覧を再取得するだけで、`res.ok` を一切見ていなかった。403でも404でも「確認しました」と同じ挙動になる。（2026-09-01 修正）
    - 実際に到達可能だった: `channel.admin.ar_payouts.manage` は**どのロールも保有していなかった**。HQ/ADMIN はロール名で通るので動いていたが、Role Management で AR Payouts を誰かに配ると **Confirmボタンだらけの画面で全部が無言で失敗する**。死に権限は `DEFAULT_ROLE_GRANTS` に足して解消（教訓33）。
    - あわせて発覚: **`parsed <= 0` を拒否していた。** 「入金ゼロ」と「チャージバック」はこのページが存在する理由そのものの2件で、既に負の expected_amount が7件ある。**不一致だけが書けない照合画面**になっていた。
    - KPIヘッダーが `careem_balance_%` 30行を含んでいた（表側は最初から除外）。**AED 90,925 の二重計上が、二重計上を防ぐためのページの見出しに出ていた。**

47. **「成功」を返す取込ジョブは、アラートが無いより悪い** → Grab の GitHub Actions は毎朝走り、`❌ SESSION_EXPIRED` と表示した上で **`process.exit(0)`** していた。コメントには「exit 0 so CI does not flag the whole workflow」とある。結果、**セッションが死んだ6日間、CIは毎日緑のチェックを出し続けた。** 517日連続で欠けたことのないストリームが止まっているのに、唯一人が見ている信号が「正常」と言っていた。（2026-09-01 発見・修正）
    - 同じ書き方が **Careem・Keeta** にもあった。**Talabat だけが正しく** `vendor_id:'SESSION_EXPIRED'` を webhook に送り Discord DM を出していた。
    - **セッション切れはコードのバグではないが、失敗した実行である。** 「バグではない」を「成功」と表示してはいけない。
    - 検知は各スクリプトに足すのではなく、**データ側で一般化する**（`ar_payout_gaps()`）。スクリプトが無いプラットフォームも将来増えるものも同じ仕組みで拾える。個別通知を3つ足すのは同じ機能の二重実装。
    - ⚠️ **`gh run list` の success/failure を信用しない。** `gh run view <id> --log` で本文を読むこと。

48. **同じテーブルに違う意味の行を入れたら、全ての読み手が同じ除外を書かねばならない — 1つ忘れれば嘘になる** → `ar_payouts` には入金(`net_payout`)以外に、Careemの残高スナップショット(`careem_balance_%`)と Talabatの日次売上(`data_type='gross_sales'`)が同居している。db.py の**8箇所は正しく除外**していたが、AR Payoutsの一覧・KPI・新規の欠測検知は除外していなかった。結果、**AED 90,925 の二重計上**と、**銀行明細に決して現れない売上9日分**が「入金待ち」として並んでいた。（2026-09-01 修正）
    - 除外は**1箇所に定義して共有する**（`_NOT_BALANCE`）。各クエリに手で書くと必ずどれかが漏れる。
    - **消してはいけない。** gross_sales はドバイの日次P&Lと曜日別トラフィック重みが `store_code` で読んでいる。削除・改名すれば売上が支店間を移動する。

49. **同じ支払先が3通りの名前を持つと、1本の履歴が「全部途切れた6本」に見える** → Talabat はブランド単位で入金するのに、識別子が `SZ/RZ/AVS`（月次xlsx・2025-09〜2026-07）と `671526/673913/698589`（ポータル・2026-08〜）の2系統あった。時間の重複はゼロ、つまり**同一の支払先の連続した履歴**。店舗別の照合は不可能で、欠測検知も「識別子が入れ替わったので判定できない」としか言えなかった（正しいが役に立たない）。（2026-09-01 統合 → `TALABAT_SZ/RZ/AVS`）
    - 正規名は**他のドバイ系と同じ規約**に合わせる（`CAREEM_SZ_BB` / `KEETA_SZ_JLT` → `TALABAT_SZ`）。4つ目の命名を発明しない。
    - **取込時に正規化する**（`app/talabat_codes.py`）。DBだけ直すと外部の抽出スクリプトが次回また元の名前で入れる（教訓20と同型）。
    - `payout_id` には生のIDを残す。変えると既存分が新しいキーで再インポートされる。
    - ⚠️ **周期が変わった支払先は、履歴全体のp90では捕まらない。** Talabatは月次→3日周期に変わったので180日のp90は30日になり、15日の停止を見逃す。**「直近の間隔の3倍（最低7日）」を第2の規則として OR で足す**（7日の下限がないとFoodpandaの週次バッチで誤報）。

50. **`timeout-minutes` の無いCIジョブは、ハングすると6時間ぶんの並列枠を食い、無関係な業務ジョブを全部止める** → `Frontend Tests`（vitest）は数日前からハングしており、`timeout-minutes` が無いためGitHubの上限6時間まで走り続ける。**10本溜まってリポジトリ全体のActions並列枠を占有し、Grab/Careem/Keeta/Talabat の日次入金取込と Smiles の月次取込が数時間キューで止まった。**（2026-09-01 発見）
    - **テストが落ちるのは普通。テストが他の全ジョブを止めるのは普通ではない。** 業務ジョブと同じ枠を使う以上、テストには必ず `timeout-minutes` を付ける。
    - 症状は「Smilesが28分 queued」だったが、原因はSmilesと無関係。**`gh run list --status in_progress` で枠を誰が持っているかを見る。**
    - vitest は752件失敗（`<body><div /></body>` の空レンダリング＝グローバルなセットアップ破損）。日次のpushで毎回1本ずつ滞留が増える。
    - 滞留の解除は `gh run cancel <id>`。放置しても6時間で自然に落ちるが、その間ずっと業務ジョブが止まる。

51. **ログイン用スクリプトが「別タブを開くボタン」を押していたら、永久にログイン画面に着かない** → `scripts/grab/setup-session.js` はマーケティングページで "Go to Portal" をクリックしていたが、**このボタンは新規タブを開く**。スクリプトは元のタブを見続けるため、5分間マーケティングページの前で待ち続ける。しかもセッション無しだと地域判定で **GrabMerchant Malaysia** が出るので、利用者には「マレーシアの宣伝ページが出てログインできない」と見える。（2026-09-01 修正）
    - `https://merchant.grab.com/portal` に直接行けばクリックも別タブも無しで `weblogin.grab.com` のサインインに着く。**中間ページを経由しない。**
    - 診断は**ヘッドレスで公開ページのフォーム要素を読むだけ**でできる（認証情報は不要）。`inputs` に `Enter your username` が出るかどうかで、到達しているかが一目で分かる。
    - 待機ループは `page.url()` ではなく `context.pages()` を見る。サインインが別窓で完了しても拾える。

52. **モジュールのモックを「使うものだけ列挙」で書くと、共有コンポーネントが1つアイコンを足した日に全滅する** → 各テストが `vi.mock("lucide-react", () => ({ 使うアイコンだけ }))` としていた。`SelectDark` が `ChevronDown` を描画するため、native `<select>` 一括置換で SelectDark が全管理ページに入った瞬間、**30ファイルのモックが不足**になった。（2026-09-01 発見・修正）
    - **症状がエラーの場所を指さない。** モックに無いキーへのアクセスでReactがレンダー中に例外→ページが空→全アサーションが `Unable to find an element with the text: ...` で落ちる。**アイコンではなく文言を探しに行く。**
    - しかも各アサーションが5秒タイムアウトを待つため、**752件×5秒でスイートが数時間**になり `timeout-minutes` の無いCIが並列枠を6時間占有した（教訓50）。
    - 対策は `tests/lucide-mock.ts`（Proxyで任意のアイコンを解決／assertしたいものだけ名前を付ける）。
    - ⚠️ **`get` トラップだけでは効かない。** vitest は `key in module` を先に見て自前の "No X export is defined on the mock" を投げる。**`has` トラップが必須。**

53. **native `<select>` を独自コンポーネントに置き換えたら、`role="combobox"` と `aria-expanded` を必ず付ける — テスト以前にアクセシビリティの実害** → `SelectDark` は素の `<button>` で、role も aria-expanded も aria-label も無かった。スクリーンリーダーには**名前の無いボタン**としか聞こえない。テスト側も `getByRole("combobox")` で53件落ちていた。（2026-09-01 修正）
    - **`getByDisplayValue` と `fireEvent.change` はARIAをいくら足しても救えない。** display value は値を保持するフォーム部品の概念で、change イベントは発火先の control を要求する。テスト側を「開いてクリック」に書き換えるしかない（`tests/select-dark.ts`）。
    - `data-value` を trigger と option に持たせると、**表示文言ではなくページが受け取る値**で選べるので変換がほぼ1:1になる。
    - ⚠️ **`getByDisplayValue` の一括置換は禁止。** テキスト入力にも使われており、私は一律変換して401→403に悪化させた。**選択肢か入力欄かを1件ずつ見ること。**
    - 残課題: SelectDark の大半が **aria-label 無し**で描画されている（既定名が全部 "— Select —" になる）。同一ページに2つあると区別できない。名前付けは未実施。

54. **一括処理の「効かないこと」を本番で検証するときに、極端な引数を渡してはいけない** → 2026-09-02 に私が実際にやった。`expire_stale_management_tasks` が `kpi_*` を除外するようになったかを確かめるため `days=0`（＝全件が期限切れ扱い）を本番で実行し、**未送信のopenタスク89件（ドバイ79・マニラ10）を実際にクローズした**。検証したかったのは「kpi_が0件であること」で、その結論自体は正しく出たが、代償が本物の89件だった。
    - **除外の検証に実行は要らない。** 対象件数を数える `SELECT` を同じ `WHERE` で流せば同じことが分かる。書き込みを伴う関数を検証に使うなら `conn.rollback()` で閉じるスクリプトにする。
    - 復旧できたのは `closed_by='auto-expired' AND closed_at > NOW() - INTERVAL '20 minutes'` で**自分が触った行だけを特定できた**から。掃引が `closed_by` に固有の名前を書いていなければ、正規の auto-expired と混ざって戻せなかった。**自動処理は必ず実行者名を残すこと**が、この復旧の前提になっている。
    - 教訓38（本番にテストレコードを作らない）の裏返し。**テストデータを作るのも、テスト引数で本物を消すのも、同じ「本番を実験台にした」**。

55. **「押されないボタン」の裏には、そのボタンしか呼ばない検知関数がある** → BO Dashboard の `push_kpi_alerts_to_management_tasks` は `/admin/mgmt-accounting` のボタンからしか呼ばれていなかった。**結果を読む画面と、起動する画面が別**。全社で発生したコスト警告は**2026-08-21 の同一秒に作られた2件だけ**で、それも未送信のまま8日後に一括クローズされた。（2026-09-02 修正）
    - `run_management_channel` の docstring に**まったく同じ話が既に書いてある**（「Run Detection ボタンからしか動かず 8/22〜8/26 は何も検知されなかった」）。1階層上で同じ穴が残っていた。**「ボタンでしか動かない検知」を1つ直したら、同種を grep で全部数えること。**
    - 検知関数を worker に載せる前に、**それが1日1回鳴ったらどうなるかを実データで確かめる**。今回 `revenue_decline` は9/1時点で `days_covered=1`（1日 ₱74,292 vs 8月平均 183,367）で「-59.5%」と鳴っていた。日数で割って比較しても**1日は1ヶ月と比較できない**。平均以下の日は全体の約半分なので、そのまま毎晩鳴らせば教訓39の再演だった。**週1周（全曜日を1回ずつ）を下限にする**（`MGMT_REV_TREND_MIN_DAYS`）。
    - 一括クローズから守る線引きは **severity ではなく「タスクの性質」**。「19日の廃棄記録を出せ」は1週間後には無意味なので期限切れが正しく、実際この掃引が消してきたのは全部その種類（red の product_score_c 8件を含む）。「プライムコストが基準超」は来週も再来週も真なので消してはいけない。

56. **「取り消せます」と書いた操作は、押した直後にその取り消し口が画面に残っていなければ嘘になる** → BO Dashboard の1タップ Close を **APIの往復テストでは全部通したのに、実際にボタンを押したら壊れていた**。Responded で絞った状態で閉じると行が即座にリストから消え、**「Reopen if you pick the wrong one」と書いてあるすぐ下でその Reopen ごと消える**。Closed フィルタに切り替えれば辿り着けるが、それを知らない人には辿り着けない。（2026-09-02 発見・修正）
    - **fetch を直接叩く検証では絶対に出ない。** close は200を返し、DBも正しく、reopen も動く。壊れているのは**行が消えた後に人が何をできるか**だけ。**最後は必ずボタンを押すこと。**
    - 直し方は「Closedを見てください」と案内を足すことではなく、**そのセッション中に閉じた行をリストに残す**こと（`justClosed`）。取り消し口が同じ場所にあり続ける。消えるのは Refresh を押したときだけで、それが「もう終わり」の明示操作になる。
    - 教訓22は「取り消し経路を用意して画面に書く」だったが、**書いただけでは足りない**。書いた直後に消えるなら、書かない方がまだ正直。

57. **書き込みAPIを足す前に、その区画に認可があるか確認する — 無ければ「無い」と報告する（勝手に塞がない）** → close/reopen を足してから気づいたが、`/api/admin/management/tasks/*` は**権限を一切見ていない**。`admin_auth_gate` はログイン確認のみ（教訓26）、`ADMIN_AUTHZ_MODE` は **off**。ログインできる167名全員が管理タスクを閉じられる。
    - **ただし即座に塞いではいけない。** `channel.admin.management_back_office.view` で塞ぐと、**担当2位の Camille Santos（69件）が権限を持っていない**ので実務が止まる（教訓32）。**塞ぐ前に「誰が実際に使っているか」をDBで数え、名前で列挙してユーザーに渡す。**
    - 既存の `PATCH /tasks/{id}` が同じことをできるので、**新しい2本だけ塞いでも実効的な意味は無い**。「自分が足した分だけ塞いで安心する」のは、穴を塞がずに見えなくするだけ。区画全体の話として報告する。
    - このチャンネルには **`.view` しか権限が存在しない**。閲覧と書き込みを分けるなら `.manage` の新設が要る。**権限が1種類しかない画面は、認可を足そうとした瞬間に「全部見せるか全部禁じるか」しか選べない。**

58. **「測れない要素は除外して重みを再正規化する」は正しい設計だが、そのままだと死んだデータ源を完全に隠す** → マネージャースコアは attendance（20点）を「今週は該当なし」として除外し、`6/7` と表示していた。実際は `detect_attendance_anomalies` が読む `actual_attendance`（Bayzat取込先）の最終行が **2026-07-08 で55日前**。打刻は `os_attendance_sessions`（2026-09-01・生存）に移行済みなのに、突合クエリだけ古い取込先を読み続けていた。**100点中20点が全支店・全週で8週間測れておらず、正しい除外ロジックがそれを見えなくしていた。**（2026-09-02）
    - **「今週は何も無かった」と「見る手段が無い」を同じ表示にしてはいけない。** 前者は健全、後者は障害。要素に `quiet` / `blocked` を持たせて区別する。
    - **検知器が動いているかだけ見て「実装済み」と判断しない。** 検知器は毎日動き `errors=0` を返していた。空だったのは1階層下のデータ源。**「0件」の理由は必ず入力側まで辿る。**
    - 障害の告知は**支店ごとに繰り返さない**。取込先が1つ死んだのは1つの問題であって、支店数ぶんの問題ではない。画面上部に1回。
    - **`nothing to do` は、見えている場合にだけ真。** 見えていない場所について「やることなし」と表示するのは、この種の画面が出しうる最悪の嘘。
    - 教訓40（手動インポートの欠落）・45（取込停止の無言化）と同型。違いは、**ここでは正しく設計されたスコアリングが隠蔽装置として働いた**こと。
    - ⚠️ **閾値は必ずそのストリーム自身の履歴から決める（教訓45の再確認）。** 私は最初「週次バッチなら7日で足りるだろう」と推測で置いた。実測すると `actual_attendance` は p90=1日だが**過去に9日（manila）・12日（dubai）の空きが実在**し、7日だと「遅れているだけ」を3回「止まった」と報告していた。14日に変更（履歴上の誤検知0、現在の55日は過去最大の6倍なので当然検知）。**AR Payoutsで守った規律を、別の機能で忘れた。**
    - ⚠️ **`try/except` で例外を捕まえても、psycopg2 のトランザクションabortは封じ込められない（教訓7）。** ソース存否チェックを「診断がスコアを壊さないように」と防御的に書いたが、1つ失敗すると**後続のソースが全て「確認できない」になり、この関数の後のクエリも全滅**する。**ソースごとに SAVEPOINT を張り、失敗時に ROLLBACK TO SAVEPOINT する。** 例外を捕まえることと副作用を封じることは別物。
    - `LOWER(col) = LOWER(%s)` は**インデックスを無効化する**。格納値が既に小文字だと確認できたら素の等価比較にする（52,000行のseq scan 31ms → Index Only Scan 0.9ms）。

59. **既存テーブルに列を足したら、そのテーブルの `SELECT *` を全部数える — 追加した本人以外は誰も気づかない** → 2026-09-02、店内確認のために `os_attendance_sessions` に `in_store_photo`（base64画像）を足した。このテーブルには `SELECT *` が3箇所あり、うち1つは**一覧で200行**、1つは**打刻画面を開くたび**に呼ばれる。さらに `RETURNING *` が4箇所あり、そのうち2つは **clock-in / clock-out 本体**で、戻り値はそのまま端末へのレスポンスになる。つまり列を1本足しただけで、教訓29（本番3回ダウン）の構造が打刻という最も止めてはいけない経路に再現される寸前だった。
    - **列名を書き並べる修正は次の追加でまた漏れる。** `information_schema` から列を読み、blob列だけを外してキャッシュする `_session_cols()` にした。後から列が増えても自動で入り、外すべき列は `_SESSION_BLOB_COLS` の1箇所だけ。
    - 移行関数（`ensure_in_store_confirmation`）の末尾で**キャッシュを破棄する**。列を足した直後に古いリストが残ると、新しい列だけが静かに消える。
    - 検証は**打刻の書き込みを実際に往復させる**こと。読み出しだけ確認しても、`RETURNING` は通らない。存在しない `city`（`qa-selftest`）を使えば、どの集計・同期・名簿からも見えない場所で clock-in→clock-out まで実行でき、その場で削除できる（教訓38）。
    - ⚠️ 検証スクリプトのキー名を実列で確認すること。`gps_ok` は存在せず実際は `check_in_gps_ok` で、`.get()` を使っていた間はこの誤りが「値が None」に見えて隠れていた。**`[]` で取れば落ちる。テストでは `.get()` を使わない。**

60. **「外れ値かどうか」の閾値を、判定対象と同じデータから作らない** → 店舗QRが遠くから読まれたのを検知する `far_confirmations` は、拠点ごとの基準を「その拠点の確認距離のp90×2」にしていた。確認が1件（230m）しか無い拠点では p90 = 230 になり、`230 > 460` は成立しない。**最初に持ち出されたQRが、自分自身を「この拠点の普通」と定義して不可視になる。**その1件こそがこの機能の存在理由だった。
    - テストで230mを入れて「検出0件」になり発覚。**実データが無い機能は、異常値を自分で入れて鳴ることを確認するまで動作確認とは言えない。**
    - 基準は**独立した別の分布**から取る。ここでは打刻距離の120日p90（拠点あたり数百件）。TAFT 12m / Al Quoz 71m と拠点差がそのまま出るので、固定値では代用できない。件数50未満の拠点はジオフェンス半径にフォールバック、下限40m。

61. **モジュール直下で設定を読むと、ヘルパーの定義位置ひとつで本番が落ちる** → 2026-09-02、休憩の閾値を `BREAK_TOLERANCE_MIN = _env_int(...)` と**モジュール直下**に書いた。`_env_int` は同じファイルの18,000行下で定義されているため `app.db` の import が NameError で失敗し、**API全体が503**になった（約4分）。
    - 症状が原因を指さない。落ちるのは import なので、どのエンドポイントも一律503になり、直前に触った機能とは無関係に見える。
    - **設定は関数の中で読む。** そうすれば定義順に依存せず、`heroku config:set` でデプロイ不要に変えられる（この方が本来の作法でもある）。
    - デプロイ後に `curl` でHTTPコードを見る癖をつける。401が返れば生きている。**503はログインページだけ見ても分からない**（Vercel側は200を返す）。

62. **同じ計算を3か所に写すと、そのうち1つは必ず何もしていない** → マニラの休憩控除は `_undertime_after_break`（DTR同期）・DTRのスケジュール手修正・`manila_payroll_engine.py` の3か所に書かれていた。手修正の経路は**休憩調整を一切していなかった**ので、同じ日を同期で処理するか鉛筆アイコンで直すかで結果が違った。教訓32と同型で、今回は `app/db.py` の `undertime_after_break()` に集約した。
    - ⚠️ **集約時に「未記録の休憩」の扱いが2経路で逆だったことが判明。** 同期側は「所定どおり取った」（調整なし）、エンジン側は `taken = actual or 0` で「1分も取っていない」（所定分を戻す）。マニラは66%が未記録なので影響は大きいが、**給与額が動くため今回は変えず、既存挙動をそのまま再現した。** 直すなら会計事務所の見解が要る。
    - 集約する関数に既存の呼び出しを差し替えるときは、**None の意味が両者で同じか必ず確認する。** ここでは `None` を渡すと挙動が反転するので、エンジン側は明示的に `0` を渡している。

63. **休憩の規定時間は設定値ではなく公開シフトから導ける** → ドバイのスプリット勤務は「2本目の開始時刻まで」が休憩で、シフト表に区間が2行で入っている。つまり**維持すべき設定が存在せず、陳腐化しようがない**。通常勤務は60分。
    - 固定閾値（75分超）で作ると、**拘束10.1〜10.6時間・実働8.0〜8.9時間で正しく運用しているスプリット勤務者12名**を呼び出すことになる。実データに当てて取りやめた。
    - ⚠️ **区間の隙間が0または負になる日が64日ある**（`12-13`＋`13-21` のような連続、重複行）。そのまま計算すると許容0分になり**どんな休憩も違反**になる。補正前は3名が常習者として出ていたが、補正すると全員消えた。**隙間≤0は通常勤務として扱う。**
    - **許容の3倍を超える休憩は「長い休憩」ではなく「Break Outの押し忘れ」。** 退勤打刻が落ちた日は休憩が閉じずに走り続ける（434分 vs 許容60分）。別バケットにして「記録を直す」と表示し、名前を出す側には入れない。

64. **現場に「やってください」と言う画面は、対象物が現実に存在する日まで出してはいけない** → 2026-09-02、店内QR確認カードをデプロイした時点でポスターは1枚も貼られていなかった。数時間後のマニラ朝番が、出勤直後に「もう1ステップ — ポスターを読み取ってください」と言われ、読むものが無い状態になるところだった。**指示に従えない画面は「この画面は嘘をつく」と教える**ので、運用開始後もその学習が残る。
    - 対策は `IN_STORE_CONFIRM_FROM`（未設定＝要求しない）。**コードは暗いままデプロイし、ポスターが貼られた日にconfigで点灯する。**不正な日付値も安全側（要求しない）に倒す。
    - **さらに「そもそもポスターが存在する拠点か」で条件を絞る**（`os_branch_qr` に行があるか）。ドバイの `DRIVER` は拠点実体もピンもポスターも無く、1名が月1回打刻する。日付ゲートだけでは彼が行き止まりに入る。ポスター発行に連動させれば、**印刷後に開店した拠点でも自動で正しくなる**。
    - 検証は「有効化した状態を模擬して、誰が要求されるか名前で列挙する」。店舗スタッフ→True / BO→False / ドライバー→False を実データで確認してから点灯する。

65. **「記録が無い」を集計するとき、閉じていないレコードを『無い』に数えない** → 休憩の「記録ゼロ」を*閉じた*休憩の有無で判定していたため、Break In を押して Break Out を押さなかった人が「1件も記録していない」側に入った。彼は記録している。押し忘れただけで、それは別の行（未クローズ）で既に扱っている。
    - 同じ間違いで**記録率が過少**になり、「3回以上の休憩」も実行中の3本目を見落とす。
    - 検証は1人を選んで**日別に手で数え、集計値と一致させる**（Mona Medrano 13日＝13日）。合計だけ見ていると気づけない。

66. **「そのチェックは未実装だ」と言う前に、実装があって効いていないだけではないか確かめる** → ジオフェンス遮断について「`gps_ok` はフラグのみで圏外打刻は成功する」と報告したが、**実際には `raise 403` が最初から書かれていた**。それでも60日で284件通っていたのは、`_is_staff_gps_exempt` が **WFH宣言でも True を返す**ためで、`/api/attendance/wfh_declare` は本人が1タップで登録でき承認も画面表示も無い。**231件がこの経路。**
    - 「機能が無い」と「機能があるが迂回されている」は、**やるべきことが正反対**。前者は実装、後者は迂回路を塞ぐこと。取り違えると、動いているコードの隣にもう1つ同じチェックを書いて満足することになる。
    - 判定方法は**コードを読むだけでは足りない**。`check_in_gps_ok=FALSE` の行が実在するかをDBで数え、**そのうち何件がどの免除経路で通ったか**を突き合わせる。今回は `os_wfh_days` との JOIN で231/284と出て初めて原因が確定した。
    - ⚠️ **宣言回数を悪用の証拠にしない。** Mark Arvin Ocampo は50回宣言しているが圏外打刻は0件、Muna Rana Magar は29回宣言して実際には5〜45mで打刻していた。**「その権限を使ったか」ではなく「使って何をしたか」で見る。**
    - 58名が使っている機能を無審査で塞がない。**スイッチだけ作って既定は無制限にし、名前の一覧をユーザーに渡して判断を仰ぐ**（教訓32と同じ規律）。

67. **「読める人」の判定を広げると、その関数名を使っている「書ける人」の判定も一緒に広がる** → 2026-09-02、給与マスクを「HQのみ」から「HQ＋権限保有者」に広げるため `_is_hq()` の意味を変えたところ、**3つの書き込みガードが `if not _is_hq(...)` と書かれていた**ため、支払い登録・退職処理・ドバイのプロフィール保存が同時に開いた。閲覧しか依頼されていないのに書き込みまで広がっていた。
    - 関数名が `_is_hq` のままだったのが原因。**「HQか」ではなく「何ができるか」で命名する**（`_salary_view_mode()` / `_may_write_salary()`）。名前が役割を指していると、意味を変えたときに全呼び出し元を確認する動機が働かない。
    - 広げる前に `grep -n "関数名(" ` で**全呼び出し元を列挙し、1件ずつ読み取り／書き込みを判定する**。3件しかなかったので目視で足りた。
    - **書き込み許可は人単位で持つ。** 「一部の人の給与だけ見えない」担当者の画面は、その人の欄が空で届く。そのまま保存すれば実額が消える。`_may_write_salary(actor, staff_name)` のように**対象者を引数に取る**形にし、見えない人は既存値へピン留めする。
    - 画面側は「利用者の権限」ではなく**サーバーが付けた行単位の印**（`salary_hidden`）で編集可否を決める。「金額が空欄だから隠されているのだろう」と推測させると、**本当に未設定の人**と区別できない。

68. **機密のマスクを検証するなら、ミドルウェアを通る実HTTPで測る** → `_mask_salary()` を直接呼ぶ単体確認は通るが、それは第2層でしかない。境界はミドルウェアで、パスのプレフィックス一覧に載っていないエンドポイントは素通りする。
    - 検証手順: ①全ルート（1,781件）を列挙し、給与関連の語を含むのにマスク対象外のものを洗う ②非JSONを返す経路はミドルウェアが早期returnするので個別に中身を確認する（法定ファイルは `SUM()` 集計で個人別金額なしと確認）③実トークンを発行して TestClient で往復させる。
    - **薄いJWT（権限はリクエスト時にDBから解決）なら、トークンを自分で発行しても権限は偽装されない**ので教訓27の罠を回避できる。渡すのは `role` だけなので、そこだけ実データから取る。
    - ⚠️ **自由記述列はマスクされない。** `final_pay_notes` / `deduction_reason` は現在すべて空だが、誰かが金額を書けばそのまま見える。マスクは列名の一覧で動くので、金額を入れうる text 列は運用で塞ぐしかない。

69. **同じ住所にある2拠点を、GPSで区別しようとしてはいけない** → マニラの CK と CUB は同一キッチンで、ピンも同一。`_nearest_branch` は `if d < best_dist` で厳密比較するため、同点では**先に評価された方（CK）が必ず勝つ**。結果、**CUB所属16名の打刻755件（2026-05-12〜09-02）がCKとして記録**され、人件費もマネージャースコアもCKに付いていた。
    - **半径をいくら調整しても直らない。** 距離が同じなのだから、距離では決まらない。GPSが言えるのは「そこにいる」までで、**どちらの部署かは名簿しか知らない**。
    - 対策は名簿を**同点時の決着にだけ**使うこと（`prefer_branch`、最近傍から60m以内のときのみ採用）。**引き寄せてはいけない** — 本当に別拠点にいる人を所属拠点として記録すると、今度は応援勤務が消える。TAFTに立つCUB所属者がTAFTのままであることを実データで確認した。
    - **退勤と応援訪問には適用しない。** どちらも「ホーム以外で働く人」のための経路なので、ホームを優先すると逆に壊れる。
    - 発見の入口は「CUBの打刻が30日で2件しかない」という**件数の不自然さ**だった。在籍16名に対して2件はありえない。**拠点別の件数を在籍数と突き合わせる**と、この種の取り違えは見つかる。

70. **ジオフェンスの半径は、拠点ごとの打刻距離の分布から決める** → 75mに設定したところ、ドバイBBは198件中196件、マニラCKは367件中361件が**75〜150m**に分布しており、事実上ほぼ全員が店内にいても弾かれていた（p90=114m / 95m）。建物の大きさとピン位置で「店内」の実測値は拠点ごとに大きく違う。
    - 150mにして全体の通過率が **69% → 97%** に回復。
    - ⚠️ **QRの遠距離検知の閾値は打刻p90×2で自動計算しているので、フェンスを広げると検知も緩む**（BB 228m / マニラCK 190m）。これは「その拠点で人が立つ距離が実際に広い」ことの反映なので誤検知は増えないが、**フェンスと検知が連動していることは意識しておく**。

71. **入れ子のルートを「最初に一致したもの」で選ぶと、深い方のページが自分の居場所を失う** → サイドバーを分類したとき、今いるページのグループを自動で開く処理を `find()`（最初の一致）で書いた。`/admin/finance`（Money）は `/admin/finance/vendors`（Procurement）の前方一致であり、定義順も先。結果、**Vendorsを開くと Money が開き、当のVendorsは畳まれたまま**という、自動展開が存在する理由そのものを裏切る動きになった。
    - **最長一致にする。** 同じ規則を `channelForRoute()` が既に使っており、そちらは正しかった。片方だけ別の照合規則で書いたのが原因。
    - 検出は総当たりで機械的にできる：全項目の href を突き合わせ、`h2.startswith(h + "/")` かつカテゴリが違う組を列挙する。今回は2組見つかった。**目視では気づけない**（該当ページを開かない限り症状が出ない）。

72. **分類の粒度は「全項目数」ではなく「その人に見えている数」で決める** → 管理側73項目を9グループにしたので、スタッフ側47項目も同じ粒度にしかけた。実測すると**スタッフが実際に見えるのは20〜24項目**（権限で絞られる）で、9分割だと1グループ2項目になる。**開けてみないと違うと分からない山が増えるだけ**なので6グループにした。
    - 併せて、**1日2回使う項目（Time-in / My Shift）はグループの外に出す。** 全員がその画面に来ている目的の前にクリックを置かない。
    - ⚠️ **折りたたみはバッジを隠す。** バッジは「見に行く理由」なので、畳んだ時点で menu の存在理由が消える。閉じたグループに**中身のバッジ合計を持たせ、最も強い深刻度の色を採る**。「バッジのあるグループを自動で開く」は、9つ中7つがバッジ対象・常時5つ点灯だったので元の1列に戻るだけだった（実測して却下）。

73. **数字に動詞のラベルを付けたら、その動詞ができる件数だけを数える** → BO Dashboard のカードを状態名（`Sent 23`）から動作（`To chase 23`）に書き換えたが、23件のうち**催促できるのはSLA超過の8件だけ**で、残り15件はマネージャー待ち＝こちらは何もしない。しかも押すと23件が出て、一覧の表示は8件だった。**同じ画面でカードと一覧が同じものについて違うことを言う**状態を、自分で作った。
    - 「見出しを動作にする」改善は、**件数の定義も動作に合わせないと嘘になる**。状態の件数のまま動詞を被せると、そのラベルが指示する行為ができない行を数に含めてしまう。
    - 押した先も揃える。`sent` ではなく `sent かつ SLA超過` に飛ぶフィルタを別に作った。
    - 検証はカード・バッジ・一覧・ページ別チップの**4つの数字を突き合わせる**（8＝8、90＝90、40+32+27＝99）。1か所だけ見ても気づけない。
    - ⚠️ **内部キーを画面に出さない。** フィルタチップが `todo only` と表示していた。人が選んだ言葉（`waiting on you`）で書く。

74. **同じ「閉じる」処理を2本書くと、片方が記録を壊す** → BO Dashboard に一括クローズを足すとき、単体クローズと別に書いた。結果、一括側は ①`response_note` を上書きして**マネージャーの返答文を消し**、②`context["close"]` を書かないので**Reopenで元に戻せず**、③結果を「文の書き出し」でしか判別できない形にした。しかも単体側は既存メモに追記する（`"店長の言葉 — Too late to act…"`）ので、**`LIKE 'Too late%'` は永久に一致しない**。集計が0を返し続ける。
    - **結果は構造で持つ**（`context.close.outcome`）。文面から復元しようとした時点で負けている。
    - 一括は必ず**単体と同じ関数を呼ぶ**。別に書いた瞬間に、この3つは高確率で起きる。
    - **一括クローズはIDを鵜呑みにしない。** 「期限切れとして閉じる」APIは、渡された1件ずつを再判定する。しないと「期限切れ」という**真でない理由で何でも閉じられる**入口になる。実装後、期限内のタスクIDを投げて `refused: not past its window` が返ることを確認した。
    - 検証は隔離した `city='qa-selftest'` にタスクを作り、close → 中身確認 → reopen → 復元確認 → 削除。本番の実タスクは1件も触らない（教訓54）。

75. **「今日」を `CURRENT_DATE` で数えるとマニラの朝8時までが昨日になる** → スコアボードを `closed_at::date = CURRENT_DATE` で書いたが、Heroku の `CURRENT_DATE` はUTC。マニラは+8なので、**現地 00:00〜08:00 に起きたことは全部「昨日」に入る**。朝一番に開く画面で、その朝の出来事が消える。
    - `(created_at AT TIME ZONE 'Asia/Manila')::date = (NOW() AT TIME ZONE 'Asia/Manila')::date` のように**店舗のタイムゾーンで両辺を揃える**。片方だけ変換しても合わない。
    - あわせて**自動処理が閉じた件数を人の対応と分けて数える**（`closed_by_system`）。混ぜると「今日15件対応した」が実は掃引だった、が起きる。

76. **待ち行列を担当に割り当てる前に、「処理しても何も変わらない行」が何割かを測る** → 2026-09-03、放置されている持ち場を洗い出して「Prep Time 3,457件＋1日100件」を担当候補として報告した。実測すると**確認する意味があるのは625件＋1日15〜20件**で、残り2,834件（82%）は除外ルールで統計に一切入らない行だった（読めなかった写真1,327・その都市に無いプラットフォーム1,479・3分未満25）。**そのまま画面を作れば、82%がノイズのキューを自分で新設していた**（教訓39を警告する文書を書きながら、その隣で再演するところだった）。
    - 対策は `usable=1/0`。**除外行は作業として出さない**が、件数・理由・閾値は画面に出し、別タブで参照できる（ルールを疑えるように／教訓9・58）。
    - **除外理由は「行の実態」を書く。** 最初「GrabFoodはUAEに存在しない」と固定文を出したが、表示中の行は全て `aggregator='unknown'` で、**説明が目の前の行と無関係**だった。説明が外れる画面は、説明を読まれなくする。
    - **見出しの数字は待ち行列の大きさであって、読み込み上限ではない**（教訓73）。`To review 200` と出したが実際は625件。COUNT を別に返すようにした。
    - ⚠️ **「画面が無い」と「操作が無い」は違う。** 私は「Prep Timeの画面が存在しない」と報告したが、`src/components/analytics/PrepTimeTab.tsx` は存在した。無かったのは **Confirm ボタンだけ**（Deleteはあった）。`src/app` だけをgrepして `src/components` を見落とした。**「無い」と言う前に両方を見る。**

77. **1回あたりの頻度が高い操作にPINを要求すると、その機能は使われない** → Prep Time の確認APIは `_require_hq_or_admin_pin` で**1件ごとにPIN＋HQ/ADMINベタ書き**だった。1日十数件〜数十件の作業にこれは通らない。結果、APIは7月から在ったのに **2026-07-25 以降1件も確認されていない**。読み取り側は既にBearerトークンを受けていたので、**書き込みだけが取り残されていた**。
    - 直すときは**関数名を役割で書く**（`_require_prep_time_confirm`）。`_is_hq` のような名前にすると、意味を変えたときに呼び出し元を確認する動機が働かない（教訓67）。
    - `confirmed_by` は**トークンから取る**。聞く項目は飛ばされるか他人の名前が入る。
    - **一括確認は除外行に触らせない。** 直す前の `bulk_confirm` は pending 全件を confirmed にしており、統計に入らない行にまで「人が確認した」印を押していた。

78. **「取り消せます」と書いたら、APIがその状態に戻せるか確かめる** → Prep Time のキュー画面に Undo を付けたが、エンドポイントは `confirmed` / `rejected` しか受け付けず、**Undo は片方の判定をもう片方に入れ替えるだけ**になっていた。見た目は取り消しで、実際は別の判定を記録する。`pending` を受理し、**`confirmed_by` と `confirmed_at` も一緒に消す**ようにした（pending なのに確認者が残っていると「誰かが見た」と言っていることになる）。
    - 検証は**本番の1件で confirm→undo を往復させ、元の値に完全復帰したことを列単位で確認**する（id 9401、痕跡なし）。
    - ⚠️ **ブラウザのクリックが空振りしても、エラーは出ない。** ref座標のクリックが外れて「押したのに何も起きない」状態になり、コンソールもネットワークも無反応だった。**PATCHが飛んでいないことをネットワークで確認**して初めて分かる。押した結果は必ず通信で裏を取る。

79. **検知ルールが「全件を同じ点数で」出しているときは、閾値ではなく測っている対象が間違っている** → 2026-09-03、`SPLIT_ORDER_SUSPECT` が925件すべて score 80.0 / HIGH で、閾値を上げれば実務になると考えた。コードを読むと**分割発注を全く見ていなかった**: `vendor|category` ごとに**市全体の14日分の明細を合計**し、固定値200,000超で発火する。主要仕入先から2週間で₱20万仕入れるのは通常業務なので、見た全リクエストで発火する。**閾値をいくら動かしても直らない。**
    - 本物の分割は「**同一人物・同一店舗・同一仕入先・同日**に、各々が承認ラインの下、合計が上」。書き直して180日をリプレイすると **925件 → 111件（0.62件/日）**、内訳は重複88・閾値際13・分割10。
    - **閾値はコードに書かず、生きている承認マトリクスから読む**（`proc_approval_matrix_php` の level1 上限 ₱20,000＝MANAGER→HR_MANAGER の壁）。画面で編集したら検知も動く。ベタ書きすると「画面の設定」と「実際の判定」が別物になる。
    - **スコアを定数にしない。** 全件80.0では一覧が並び替えられず、どれから見るか決められない。超過率でスケールさせた。
    - ⚠️ **通貨の異なる都市に同じ閾値を当てていた。** マトリクスは名前からしてPHP専用（`_php`）なのに両都市に適用され、ドバイの過去最大発注は **AED 2,910**（最低閾値20,000の1/7）。結果ドバイは2,385件中**検知ゼロ**、承認も全件level 0/1。**閾値を要するルールは通貨が合わない都市では実行せず、その旨を明示する**（黙って0件を返さない／教訓58）。

80. **壊れたルールを直すときは、そのデータに何が実在するかを先に数える — 名前が指すものが無いこともある** → 分割発注を検知しようとしたが、実データを1件ずつ開くと**分割は1件も無かった**。同日の複数発注15件のうち10件は**店舗別の通常発注**（TAFT/PAR/CUBに1本ずつ）、残る5件は**0.2〜2.4分間隔の重複申請**だった。
    - 実在したのは別の問題＝**同一金額の二重送信**（180日で88件、₱17,036が2分差で2本・片方APPROVED）。ルール名に引きずられず、**データにある問題を検知する**ルールを足した（`DUPLICATE_REQUEST`）。
    - 判定の分かれ目は `store_code` だった。**「同じ人が同じ日に同じ仕入先へ複数回」だけでは分割と言えない。** 店舗が違えば正常。
    - 遡って検知させる前に「**まだ手を打てるか**」を確認する。直近60日の42件は全て未払いだったので投入した。6月分は解決済みで着手できないため入れていない。

81. **「担当に割り当てる」前に、その画面が判断できる情報を出しているか見る** → 例外アラートの行は `DUPLICATE_REQUEST · Score 85.0` だけで、**金額もどの発注と重複しているかも出ていなかった**。APIは `detected_payload_json`・`total_amount`・`store_code` を全部返しており、**画面が使っていないだけ**。この状態で渡すと、1件ごとに別画面で発注番号を調べる作業になる。
    - 各ルールに「何が起きたか／合計いくらか／何を見るか」を書いた。**「店舗が違うなら正常なので閉じてよい」も書く** — 閉じ方が分からないキューは溜まる。
    - ⚠️ **レビューは60名が実行可能**（うち31名は INVENTORY_PURCHASING の店舗スタッフ）。担当を決めても他の59名が閉じられる。3ヶ月間レビュー実績0件なので締め出す相手はいないが、**勝手に狭めず名前を出して判断を仰ぐ**（教訓32・57）。

82. **LLMに調査させるなら「探す」だけでなく「読む」手段を渡す — grepだけ渡すと答えに辿り着かない** → 2026-09-04、AI Analytics Pro に `run_sql` / `describe_schema` / `search_code` / `read_lessons` を実装して本番投入した。単体では全部通ったが、実際に質問させると **`search_code` を33回呼んで回答ゼロでラウンド上限**に達した。原因は `search_code` が**前後2行しか返さない**こと。除外ルールは4行のSQL定数（`PREP_TIME_ECHO_SQL`）なので、1行だけ見えても意味が取れず、言い回しを変えて再検索し続ける。**私自身は「grepで場所を特定 → 周辺±50行を読む」をやっているのに、その後半を渡していなかった。** `read_code(path, line, radius)` を追加した瞬間に、8拠点の内訳が実測値と全項目一致した。
    - **ツールの単体テストは「答えに到達できるか」を測らない。** 4本とも正しい値を返していた。壊れていたのは**組み合わせて調査が完了するか**だけで、それは実際に質問を投げないと出ない（教訓56と同型 — 最後は必ずボタンを押す）。
    - ⚠️ **細切れのSQLを重ねると、結果と質問の対応が壊れる。** 初回（Sonnet）は15回の `run_sql` の末に、**マニラの `count(distinct order_no)` = 1,698 をドバイの有効件数として報告**した（正: 1,819）。`run_sql` が匿名の `{"rows": [...]}` しか返さず、記憶で対応づけていたため。**結果に実行SQLを添えて返す**ようにし、プロンプトに「総計と内訳は1本のクエリから出す」「表を出す前に再導出する」を足した。
    - 検証は**必ず自分で同じ数字を独立に測って突き合わせる**。「もっともらしい表」は誤りが見えない。今回も 4,224 と 4,070 の差154は、突き合わせるまで誰にも分からなかった。
    - ⚠️ 逆に**AIが正しいのに私の照合クエリの方が間違っている**ことがある（`grabfood` を 3,499 と数えて誤りだと判断しかけたが、AIの 2,389 は区分内の件数で正しかった）。差が出たら**どちらが間違っているかを決める前に、両方の定義を確認する**。
    - 設定: `AI_ANALYTICS_PRO_MODEL`（Opus に切替済）/ `AI_ANALYTICS_PRO_TIMEOUT`（900秒）/ `AI_ANALYTICS_PRO_ROUNDS`（30）。全てデプロイ不要。
    - ⚠️ **2026-09-04 追記: 私の「Backupは逆相関」は誤りだった。** 点数別のPar割れ平均（2点→0.00 / 5点→0.40）を見て逆相関と書いたが、各バケットが n=1〜5 しかない。8月全体の係数は **par割れ r=−0.031（無相関）・在庫ゼロ件数 r=−0.346（正しい向き）・提出シフト数 r=+0.177**。実態は「逆」ではなく**「向きは正しいが分解能が無い」**（87件中59件が4点に集中）。**バケット平均を相関の代わりに読んではいけない** — 小標本のバケットは簡単に逆転する。AI側の記述の方が正確だった。
    - 対応として `3b` を SYSTEM_PROMPT に追加: **corr() と n を必ず併記**し、|r|<0.2＝無連動 / 0.2〜0.5＝弱い連動 / r<0＝逆転（最重要）と読み分け、**点数別の平均も併せて出す**（勾配があるかどうかは散発的な事例では見えない）。n<20 のときは「結論できない」と明記させる。

83. **確認キューを軽くする前に、その母集団が実物の何割かを外部の正と突き合わせる** → Prep Time の「毎朝15〜20件を確認」を合理化しようとして、除外ルール・OCR信頼度・等級境界±3分と3つの絞り込みを検討した。**どれも件数の話で、母集団の話ではなかった。** Grabの注文台帳と突き合わせたら、OSは207件中116件（56%）しか持っておらず、しかも注文時刻の36%が誤っていた（最大581分ずれ＝別のレシートを読んでいる）。**44%が最初から存在しない待ち行列を、速く捌けるようにしようとしていた。**（2026-09-04）
    - **確認する人がOCRと同じ写真を見る設計は、精度を上げられない。** 写真が読めなければ人にも読めず、読めるなら人力でOCRをやり直しているだけ。私が2026-07に確認した241件は**訂正ゼロ**で、これは精度の証明ではなく判子の証明だった。
    - **「機能があるか」ではなく「その数字は何割を見ているか」を先に測る。** 除外ルールの精緻化（教訓76）は母集団が正しい前提の話で、母集団が半分なら意味がない。
    - **突合キーは実データで確かめる。** `displayID`(GF-286) が OSの `order_no` と同形式だったので 20/20 で繋がった。繋がることを確認するまでは「置き換えられる」と言わない。
    - ⚠️ **タイムゾーンは推測しない。** Grabの財務APIは現地時刻をZ表記で返し（教訓：Manila DTRと同型）、注文APIは本当にUTC。**同じポータルの2つのAPIで規則が違った。** 一致率を0%/64%/0%と3通り実測して初めて確定した。
    - 絞り込み案を捨てた記録も残すこと。等級境界±3分は74%が該当して無意味だったが、**測らずに実装していたら「合理化した」と報告していた**。

84. **Pythonの構文検証に `ast.parse` を使わない — `compile()` を使う** → 2026-09-05、`global` を同一関数内に2回書いて本番を4分落とした（全エンドポイント503）。`SyntaxError: name '_IN_STORE_MIGRATED' is used prior to global declaration` はシンボル表の構築時に出るため、**`ast.parse` は通してしまう**。`compile(src, path, 'exec')` なら捕まる。教訓61（モジュール直下の設定読みで503）と同じ入口で、症状も同じく「直した機能と無関係に全部落ちる」。
    - デプロイ後は必ず `curl` でHTTPコードを見る。**401なら生存、503なら落ちている。** Vercel側は200を返すので画面だけ見ても分からない。
    - 落ちたら `heroku logs -n 60 | grep -iE "error|SyntaxError|crashed"` で即座に原因が出る。

85. **`CREATE TABLE IF NOT EXISTS` 系の移行関数を、リクエスト経路から毎回呼ばない** → 店内QR確認の `ensure_in_store_confirmation()` は7箇所から呼ばれ、そのうち1つが**スタッフがポスターを読むたびに走る `confirm_in_store`** だった。中に `ALTER TABLE ... DROP CONSTRAINT` があり ACCESS EXCLUSIVE ロックを取るため、**2人が同時に読むと2人目が `canceling statement due to statement timeout`** になる。本番で2回連続の確認を実行し、毎回2回目が失敗することを再現した。朝の打刻は130人が数分に集中するので、最も混む瞬間に競合する設計だった。
    - 対策はプロセス単位のフラグで1回に抑えること。**フラグはDDLがコミットした後に立てる** — 先に立てると失敗した移行を「済み」と記録し、そのdynoの生存中ずっと列が無いままになる。
    - 発見の入口は機能テストの5番目（二重読み取り）だった。**正常系だけ通して終わりにしていたら、朝の本番で初めて出ていた。**

86. **「どの店舗としてログインしたか」を確認しない取得スクリプトは、店舗を入れ替えたデータを黙って書く** → 2026-09-05、QC のGrabセッションを取り直す際に **Paranaque のアカウントでログインしたまま `qc-session.b64.txt` に保存された**。スクリプトは引数の店舗名でファイル名を決めるだけで、実際に誰が入ったかを一切見ていない。そのまま `gh secret set GRAB_SESSION_QC` していれば、**Paranaque の入金が Quezon City として記録され続けた**。
    - **マニラ3店舗は `merchant_group_id` が同一**（`PHMG20250807052040017951`）。つまり**後段のどこにも店舗を判別する材料が無く**、ログインしたアカウントだけが店舗を決める。エラーも警告も出ない。
    - 対策は `setup-session.js` のログイン直後に `userprofileInfo.user_profile.username` を読み、`CREDS[LOCATION]` と違えば**何も保存せずに exit 1**（既存ファイルも触らない）。取得系スクリプトは「取れたか」ではなく **「誰として取れたか」を検証する**。
    - 気づけたのは、ターミナルに出た売上サマリ（`net_sales` 17,473 / 25件）が QC の規模と合わなかったから。**生の数字を出力していなければ発見できなかった。**
    - ⚠️ **`Account Not Found` の原因はタブの選択だった。** Phone タブに UAE の番号（+971）を入れていた。マニラ3店舗は `user_profile.mobile_number` が全て空で、**Phone タブでは原理的にログインできない**。ログイン画面は認証情報なしでヘッドレスに読める（入力欄の `placeholder` を見れば、どのタブに居るか分かる／教訓51）。

87. **更新手順を案内する側は、そのシークレットを「読む側」のコードで検証する — 書く側の都合で決めない** → 同じ 2026-09-05、`scripts/ops/session-health.py` が Noon だけ `gh secret set NOON_SESSION < noon-session.json`（生JSON）を案内していた。根拠はコメントに残っていた「noon だけ b64 を書き出さないので JSON をそのまま入れる」。**書き出さないだけで、要求されていないわけではなかった。** `get-payouts.js:71` は `JSON.parse(Buffer.from(b64,'base64'))` なので、生JSONを入れると復号が壊れて翌朝の取込が落ちる。案内どおりに実行させてしまった。
    - **6プラットフォームのうち Noon だけ**が、b64 をファイルではなく標準出力に出す。`.b64.txt` が無いことを「JSONでよい」の根拠にしたのが誤り。**ファイルの有無ではなく、読む側の1行を見る。**
    - 検証は往復でやる。`base64 < file | tr -d '\n'` を読む側と同じ式に通し、`savedAt` と必須キーが戻ることを確認した。**生JSONの側も流して、実際に例外になることまで見る** — 通らないことを確認しないと「たぶん動く」で終わる。
    - 教訓21と同型（実行できない案内は、案内が無いより悪い）。あのときは「依頼先が実在するか」、今回は「その形式を受け取る側が実在するか」。

88. **GitHub Actions の `A && '' || B` は常に B を返す — 空文字は falsy なので、この形の `dry_run` は一度も効かない** → `${{ inputs.dry_run == 'true' && '' || 'https://...' }}` は、`dry_run=true` でも `'' || URL` に落ちて**本番URLを返す**。2026-09-05、Noon のシークレット形式を「何も書き込まずに」検証するつもりで実行し、**実際には10件が本番に投稿された**。
    - **3ファイル・4箇所すべて同じ書き方だった**（noon / keeta×2 / smiles）。`grep -rn "&& '' ||" .github/workflows/` で全部出る。
    - 直し方は **URLを `&&` の左に置く**: `${{ inputs.dry_run != 'true' && 'https://...' || '' }}`。真の側が truthy になるので両方向に効く。
    - **ログの env セクションを読めば実行前に分かった。** `WEBHOOK_URL: https://...` と出ており、dry なら `DRY: <payout_id>` と表示されるはずが `✓ AM ...` になっていた。**「success」だけ見て閉じると気づけない**（教訓47）。
    - ⚠️ **投稿された10件は正当なデータ**（8/24〜8/31の未取込分、70件は重複としてskip）で害は無かった。だが「書き込まない」と説明した操作が書き込んだ事実は変わらない。**副作用が無いと説明するなら、その分岐が実際に効くことを先に確かめる。**

89. **同じ取込の一部だけが自動化されていると、止まったことが画面から見えない** → Grab マニラの日次ワークフローは **Paranaque 1店舗しか回していなかった**。Taft と Cubao は誰かが手元で実行して入れており、それで何ヶ月も回っていたが、**2026-09-02 のセッション切れ以降、誰も実行しなくなって3日欠測した**。PAR は毎日入り続けるので、`ar_payouts` を見ても異常に見えない（教訓45の変種で、今度は**店舗間**で欠測が隠れる）。
    - 直し方は「手で回す人を決める」ではなく、**3店舗とも同じワークフローに載せる**こと（FoodPanda は最初からそうなっていた）。押し忘れが原因の欠測は、押す必要を無くす以外に直しようがない。
    - **各店舗のステップは `if: always()`。** 1店舗のセッション切れで残り2店舗が skip されると、教訓17の再演になる。ジョブ全体は赤のままにして、止まった店舗が「成功」に見えないようにする（教訓47）。
    - ⚠️ **Grab は1セッション＝1店舗。** `merchant_group_id` は3店舗共通なので**何も選んでいない**。選んでいるのはセッション。ソース冒頭には「Paranaque のマネージャー1つで3店舗を賄える」と書かれていたが誤りで、実測すると各セッションは自店舗の取引しか返さない。**共有IDを「全店が見える」根拠にしない。**
    - ⚠️ **ログイン名と店舗コードが違う。** ログインは `qc` だが Grab の精算単位は `CUB`（Cubao）。どちらかに寄せると既存行かシークレットが孤児になるので、両方を残して対応表をワークフローに書いた。

90. **Cookie の `exp` は「いつまで有効か」の申告であって、通る保証ではない** → 2026-09-05、Grab Taft の `mexusers_authn_token` は**残り34.5時間**と書いてあるのに API は **401** を返した。`session-health.py` はその申告だけを見て 🟢 と表示しており、**取込が動かない状態を「問題なし」と報告していた**。
    - 対策は `grab_still_accepted()`。取引APIを1回叩いて 200/401 を見る。ブラウザ不要・1リクエストで済むので毎朝の確認に載せられる。**事実が取れたら予測より優先する。**
    - **確かめられなかったとき（タイムアウト・ネットワーク断）は `None` を返して判定を変えない。** 確認できないことを根拠に「死んでいる」と報告すると、今度は逆向きの嘘になる（教訓58）。
    - 期限が読める他プラットフォーム（Keeta）にも同じ疑いが当てはまる。**期限を読めることと、生きていることは別。**

91. **生成時にコピーした値は、元を直しても追いつかない — 「元を直してください」と案内する前に、元が既に正しくないか確かめる** → Store Supplier Orders の発注明細は、発注書を作った瞬間のカタログ単価を `unit_price` にコピーする。後からカタログに単価を入れても既存明細には届かない。私は現場に「カタログに単価を入れてもらえれば反映されます」と案内したが、**単価の無い160行は全てカタログに単価が入っていた**（カタログ入力 8/14〜8/27 に対し発注書作成 8/8〜8/27）。**既に終わっている作業を要求し、しかもやっても直らない案内**だった。2026-08 の全店発注額は ₱433,082 と表示され、実際は ₱692,766 — **37%（₱259,684）が欠けていた。**（2026-09-05 修正）
    - 直し方は `COALESCE(i.unit_price, c.unit_price)`。ただし**フォールバックを使った件数は必ず別に返す**（`items_priced_from_catalog`）。その行は発注当日ではなく現在の単価なので、黙って混ぜた合計は、欠けた合計より悪い。
    - **気づけなかったのは、現場が「カタログには既に入っている」と言ったから。** 案内どおりにやっても直らない、という報告は**案内が間違っている証拠**として扱う。教訓21（実行できない案内は無いより悪い）と同型で、今回は「実行済みの作業を要求した」。
    - 同型を疑う場所: 生成時に値をコピーしている箇所すべて。`item.get(...)` でスナップショットを取る実装は、元が後から変わる前提が抜けている。

92. **自由入力の分類欄が空欄になったバケットは、まず「外部」ではなく「内部」を疑う — そして名寄せは大小文字までにする** → Store Procurement の unclassified（₱135,904）を現場は「未登録の外部業者だろう」と見ており、私も最初そう考えた。実際は **76% が Warehouse と Central Kitchen**、つまり社内供給だった。金額が消えていたのではなく、Warehouse/CK の欄に入るべき額が落ちていた。`proc_request_items.vendor_name` は**マスタと繋がっていない自由入力**で、空欄でも保存できる。（2026-09-05 発見・A群のみ補完）
    - 補完は**同一店舗・同一品目で仕入先が1社しか記録にない行だけ**に限る（299行・₱94,423）。適用後、TAFT 8月は ₱29,410 → ₱8,400 と**事前予測どおりの全項目一致**になった。
    - ⚠️ **表記ゆれの吸収は「同じ文字列の大小・空白違い」まで。打ち間違いまで寄せてはいけない。** `Paper Bag S (TB3) (1BDL = 50pcs)` は JZP から、`(1BNDL = 50pcs)` は Warehouse から来ている。1文字の差だが**別の仕入先**で、名寄せすれば ₱20,300 の行き先を当てずっぽうで決めることになる。安全に寄せられたのは `CK`→`Central Kitchen`、`Cash & Carry`→`Cash & Carry Supermarket`、`hair net black`→`Hair Net BLACK` まで。
    - **確定できない分は残して現場に返す**（₱41,482）。教訓40と同じ — 作った数字より NULL の方が正しい。
    - 適用前に `_proc_req_items_vendor_bk_YYYYMMDD` へ対象299行の before を退避し、`btrim(vendor_name)=''` のガード付きで UPDATE する（教訓37）。**レビュー用に出した一覧の行IDをそのまま対象にする** — 再計算すると、見せたものと書いたものが別になる。

93. **タイムアウトで落ちるテストを見て、真っ先に「時間が足りない」と決めつけない — 22msの処理が5秒待って現れないなら、それは遅さではなく「出ない」** → 2026-09-05、Frontend Tests が毎日数回落ちて失敗メールが届いていた。私はまず `waitFor` の既定が1000ms（vitest の `testTimeout: 20000` は効かない）である点に飛びつき、5000msに広げて「直った」と報告した。**次の日また落ちた。5秒使い切って（5050ms）同じテストが失敗した。** 対象のアサーションはローカルで22〜49msなので、5秒待って出ないものは待てば出るものではない。
    - **推測をやめてローカルで再現させたのが転機。** `for i in $(seq 1 25)` で同一ファイルを回すと **25回中4回（16%）失敗**し、CIの3/12とほぼ同率で再現した。ここから先はログを読むだけで済む。**再現しない前提で本番CIを何度も回すのは、証拠にならないうえ遅い。**
    - 真因は `src/app/admin/page.tsx` の**遅延実行される `useEffect` がURLの `tab` からタブを復元し直すこと**。`renderAndWait()` はDOMの変化でresolveするので、この effect が保留のままクリックが起き、その後に走って `dashView` を "requests" に戻していた。**製品側の不具合でもある**（URLが更新されるまでの窓でユーザーのタブ選択が戻りうる）。
    - 直し方は「URLが変わったときだけURLに従う」。初期値を `useState(() => tabParamToDashView(...))` でURLから取り、`appliedTabParam` の ref と一致するなら何もしない。**30回中0回**に落ちた（16%が続いていれば30連続成功は約0.5%）。
    - ⚠️ **誤診に基づく変更は、直った後に撤回する。** `asyncUtilTimeout: 5000` は原因ではなかったので戻した。残せば「本物の失敗が5倍遅く出る」だけで、しかもコメントが嘘になる。
    - ⚠️ **1回の緑を根拠にしない。** 修正前も12回中9回は緑だった。直したと言えるのは、**直す前の失敗率を測ってあり、直した後に同じ条件で再測して差が出たとき**だけ。
    - **同じ形が別ページにもあった**（2026-09-06）。menu の4ページは読み込みエラーと入力検証が**同一の error state・同一のバナー**を共有し、一覧読み込みの先頭にある `setError("")` が「名前を入れてください」を消していた。25回中3回。**利用者から見ると「Createを押しても何も起きない」ボタン**になる。検証メッセージは `formError` に分け、一覧読み込みが触れないようにした（25回中0回）。
    - **遅延effectが利用者の操作結果を消す形は、1つ見つけたら同種を探すこと。** タブの復元・エラーバナーの初期化・フォームのリセットが候補。共通点は「マウント直後に走る非同期処理が、完了時に何かをクリアする」。
    - ⚠️ **その「同種を探す」を文言で検索して3ページ取りこぼした。** 私は `setError("Please enter` の直後に `return;` がある形だけを数え、`return setError("Please enter …")` の**一行形**を見落とした。結果 products / modifier-options / tags が残り、次のCIで products が落ちた。**探すときは文言ではなく構造で数える** — 「読み込みが `setError("")` する」かつ「検証を同じ state に書く」ページを列挙すれば、書き方の違いに関係なく全部出る。

94. **投げっぱなしの非同期処理は、画面より長生きする — 止め方を持たせる** → `/admin/draft` の自動エクスポートは `void (async () => {...})()` で、店舗ごとにAPIを呼びながら300ms待つループを回していた。**開始したクリックが終わっても走り続け、画面を離れても止まらない。** 誰も見ていない画面のためにエクスポートAPIを呼び続け、最後に消えたコンポーネントへ setState する。（2026-09-06 修正）
    - CIでの見え方が特徴的:**テストは70ファイル全て成功しているのにジョブが失敗**した。teardown後の setState が `window` に触れて `ReferenceError: window is not defined` を投げ、未処理のrejectionとして vitest が exit 1 する。**「全部成功したのに赤」を見たら、テストではなく後片付けを疑う。**
    - 直し方は `aliveRef`（unmountでfalse）を**各周回の先頭と最後のsetStateの前**で見る。片方だけでは、ループの途中で離脱したときに残りの店舗へAPIを撃ち続ける。
    - この処理は**2箇所にコピーされていた**（教訓62と同型）。片方だけ直せば、もう片方が同じ事故を起こす。1つの関数に集約してから直すこと。

95. **一意制約を広げる移行をしたら、その制約名を書いている `ON CONFLICT` を全部数える — 症状は「誰も使わない画面の500」なので気づけない** → `backup_par_levels` は `(city, branch_code, item_name)` の制約を落として `(city, branch_code, item_name, shift, day_type)` に広げたが、`upsert_backup_par_level` と `seed_backup_par_levels_from_history` の `ON CONFLICT` が旧制約のままだった。`InvalidColumnReference` で**保存が全て500**になり、Par Levels 画面は**開設以来1件も手入力の値を持っていない**（228行すべてシードかスクリプト）。「Propose from last 30 days」も同様に壊れていた。（2026-09-06 修正）
    - ⚠️ **私は原因を「導線が無いから誰も辿り着けない」と診断し、それで報告した。** 実際には辿り着いた人が保存できなかった。**「使われていない」の理由を、使う手前で止めずに、実際に押すところまで辿ること**（教訓56）。ブラウザで✓を押して初めて500が出た。APIの往復テストでは出ない。
    - 移行を書いたら `grep -n "ON CONFLICT (" ` で同じテーブルを触る箇所を列挙する。DDLを足す作業と、それを前提にしているSQLを直す作業は別物で、後者は忘れられる。
    - **スコープ列を足したら、一覧・保存・比較の3つ全部に通す。** 一覧が `shift`/`day_type` を返していなかったので、画面は編集中の行がどのスコープか分からず、保存すれば別の行を作るところだった。統計側も同様で、midday の Par を closing の実績と比べては判定にならない。
    - 画面に出す文言もスコープに従わせる。「No closing report has carried this item」を midday の行に出すと、実際とは別の問題を報告することになる。

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
