# Sushi ZEN シフトアプリ — HQ向け 全体説明・使用説明書

本書は、**Sushi ZEN Staff / Shift PWA**（フロントエンド）と **FastAPI バックエンド**（`sushizen_shift_app_clean`）の構成・データの流れ・Google スプレッドシート連携を、HQ メンバーが運用で迷わない粒度でまとめたものです。

---

## 1. アプリ全体の説明

### 1.1 目的

- スタッフの**シフト閲覧**（週・月）、**変更・スワップ・欠勤などの申請ワークフロー**、店舗・HQ による**承認・可視化**を一元化する。
- 従来の **Google スプレッドシート上のマスターシフト**を正として取り込み（ingest）、アプリ内の **ドラフト作成 → 公開（Published）** と **月次エクスポート**で、別の「エクスポート用」スプレッドシートへ集計結果を書き出す。

### 1.2 システム構成（ざっくり）

| 層 | 技術 | 役割 |
|----|------|------|
| フロントエンド | Next.js（PWA） | ログイン、週ビュー、マイシフト、申請、管理画面（`/admin/*`） |
| バックエンド | FastAPI（Heroku 等にデプロイ想定） | REST API、認証、DB、Google Sheets API 連携 |
| データベース | PostgreSQL | シフトセグメント、申請、ドラフト、公開版、勤怠など |
| 外部 | Google Sheets | **マスター取り込み元**と**月次エクスポート先**（別ブック） |

環境変数 `NEXT_PUBLIC_API_BASE_URL` で PWA が参照する API のベース URL を指定します（未設定時はローカル `http://127.0.0.1:8000` 前提のコードがあります）。

### 1.3 主要な画面（URL）

| パス | 想定ユーザー | 内容 |
|------|----------------|------|
| `/` | 全員 | ポータル（ログイン・スタッフ作成への導線） |
| `/login` | 全員 | ログイン |
| `/signup` / `/setup-pin` / `/change-pin` | 新規・既存スタッフ | サインアップ・PIN 設定 |
| `/week` | スタッフ | **週単位**のシフト表（店舗・週の切り替え） |
| `/my-shift` | スタッフ | **月単位**の自分のシフト |
| `/calendar` | スタッフ | カレンダー表示 |
| `/request` | スタッフ | 変更・スワップ等の申請 |
| `/swap-approve` | 関係者 | スワップ承認フロー |
| `/admin` | HQ / 管理者 | 申請キュー、**月次エクスポート（2段階確認）** など |
| `/admin/draft` | HQ / 管理者 | **ドラフト生成・編集・Apply（公開）**、バッチ処理 |
| `/admin/analytics` | 権限あり | 売上・分析（ロール・MFA 等で制御される機能あり） |
| `/admin/staff/*` | HQ / 管理者 | スタッフマスタ、ロール変更、監査ログ |
| `/admin/attendance/*` | 権限あり | 勤怠・給与関連モジュール |
| `/admin/absences` 等 | 権限あり | 欠勤・補正など |

※ 実際に各 URL にアクセスできるかは **ロール（後述）** と **サーバ側のガード** によります。

### 1.4 ロール（権限）の目安

コード上で想定される主なロール（例）:

- `STAFF` — 一般スタッフ  
- `MANAGER` — 店舗マネージャー  
- `MANAGEMENT` / `DUBAI_MANAGEMENT` / `MANILA_MANAGEMENT` — 地域・店舗管理系  
- `HQ` — 本社オペレーション（承認・エクスポート・ドラフト Apply 等の高度操作）  
- `ADMIN` — システム管理者（HQ に近い権限）

**月次エクスポートの準備/確定**や **ドラフト Apply の準備/確定**は、API 上 **HQ または ADMIN**（＋承認者名と PIN）が前提です。運用では「誰の PIN で何を承認するか」を社内ルールで固定してください。

---

## 2. データの流れ（最重要）

### 2.1 用語

| 用語 | 意味 |
|------|------|
| **マスター（ソース）スプレッドシート** | 環境変数 `DUBAI_SHEET_ID` / `MANILA_SHEET_ID` が指すブック。店舗ごとのタブなどから **DB へ取り込み**される。 |
| **ドラフト（Draft）** | DB の `shift_draft_*`。アプリ上で AI/コピー生成・編集。**この時点では Google スプレッドシートには自動反映されない。** |
| **公開（Published）** | DB の `shift_published_*`。ドラフトから **Apply** で確定した週の公式スケジュール。 |
| **月次エクスポート** | DB のデータを **`EXPORT_SHEET_ID_*` が指す別ブック**に、指定月・店舗のタブとして書き込む。 |

### 2.2 「シフトを作成しただけ」ではスプレッドシートは変わらない

- **ドラフト生成・編集**は **PostgreSQL 上のみ**です。  
- **Apply（公開）**も **PostgreSQL の Published テーブル更新のみ**です（マスター Google シートへの自動書き戻しは行いません）。  
- **Google スプレッドシートに行が追加・更新される**のは、主に次の操作です。  
  1. **月次エクスポート** API（管理画面から 2 段階確認）  
  2. **Apply 確定時に「自動エクスポート」オプション**を付けた場合（内部で同じ `export_month_to_sheets` を呼ぶ）

### 2.3 マスター取り込み（Sheets → DB）

管理者向け HTTP エンドポイント（例）:

- `GET /admin/ingest?city=dubai&a1=A1:BK100`  
  - 単一タブ。`city_to_source(city)` が参照する **`DUBAI_SHEET_ID` + `DUBAI_TAB_NAME`**（マニラは `MANILA_*`）を読み、シフト・欠勤を正規化して DB に upsert。  
- `GET /admin/ingest_weeks?city=dubai&tab_regex=店長作&...`  
  - 同一ブック内で **タブ名が正規表現に一致するもの**を複数 ingest。

**ここで使うスプレッドシート ID** = `DUBAI_SHEET_ID` / `MANILA_SHEET_ID`（**エクスポート先とは別**）。

### 2.4 月次エクスポート（DB → エクスポート用スプレッドシート）

実装: `app/exporter.py` の `export_month_to_sheets`。

**書き込み先ブック**は環境変数:

- Dubai: **`EXPORT_SHEET_ID_DUBAI`**
- Manila: **`EXPORT_SHEET_ID_MANILA`**

**作成・上書きされるタブ名**（店舗コード `BC`、月 `YYYY-MM`、モード `FINAL` または `DRAFT`）:

| タブ名パターン | 内容のイメージ |
|----------------|----------------|
| `{BC}_{YYYY-MM}_{FINAL\|DRAFT}_HEADCOUNT` | 時間帯別ヘッドカウント等 |
| `{BC}_{YYYY-MM}_{FINAL\|DRAFT}_MAIN` | スタッフ別タイムテーブル（メイン） |

エクスポート前に、同じ月・店舗・モードについて古い派生タブ（`*_TIMETABLE` 系）があれば削除する処理があります。

API 応答には通常次が含まれます（運用で URL を共有する際に使用）:

- `sheet_url` — スプレッドシート全体  
- `headcount_url` / `main_url` — 各タブへのディープリンク（`#gid=...`）

**FINAL と DRAFT**:

- **FINAL**: 確定シフトに基づく集計（`include_pending=False`）  
- **DRAFT**: 未確定（pending）を含めるモード（`include_pending=True`）— プレビュー用途

管理 UI からは API `/api/admin/export/month/prepare` → `/api/admin/export/month/confirm` の **2 段階（トークン有効期限約 5 分）** で実行されます。

### 2.5 ドラフト Apply と自動エクスポート

API: `/api/draft/apply/prepare` → `/api/draft/apply/confirm`

- **confirm** 時に `replace_published_week_from_draft_subset` が走り、**選択した週**のドラフト行だけが Published に反映されます（DB のみ）。  
- リクエストで **`auto_export` が true** の場合、**同じ confirm で** `export_month_to_sheets(city, branch_code, month, "FINAL")` が追加実行され、**上記 `EXPORT_SHEET_ID_*` ブック**に月次タブが出力されます。  
- `export_month` を省略すると、**週の開始日から `YYYY-MM` を推測**します。

---

## 3. 環境変数とスプレッドシートの対応（一覧）

運用担当者は **Heroku（またはデプロイ先）の Config Vars** で実際の ID を確認してください。ここに書く名前は **コード上の変数名**です。

### 3.1 マスター / 取り込み用（1 ブック＝1 都市の「元データ」）

| 変数名 | 用途 |
|--------|------|
| `DUBAI_SHEET_ID` | Dubai 用マスターブックのスプレッドシート ID |
| `DUBAI_TAB_NAME` | `city_to_source("dubai")` が単一タブ ingest で使う**デフォルトタブ名** |
| `MANILA_SHEET_ID` | Manila 用マスターブックの ID |
| `MANILA_TAB_NAME` | Manila 単一タブ ingest 用のデフォルトタブ名 |

`admin/ingest_weeks` は **同じブック ID** 内の **複数タブ**を regex で読みます。

### 3.2 月次エクスポート先（HQ が「出力を見る」ブック）

| 変数名 | 用途 |
|--------|------|
| `EXPORT_SHEET_ID_DUBAI` | Dubai の月次エクスポートの**書き込み先**ブック |
| `EXPORT_SHEET_ID_MANILA` | Manila の月次エクスポートの**書き込み先**ブック |

**重要**: マスター用 `DUBAI_SHEET_ID` とエクスポート用 `EXPORT_SHEET_ID_DUBAI` は **別物**です。混同しないでください。

### 3.3 その他（参考）

| 変数名 | 用途（概要） |
|--------|----------------|
| `PL_DUBAI_SPREADSHEET_ID` / `DUBAI_PL_SPREADSHEET_ID` 等 | P&amp;L 連携用（`pl_data_sync`） |
| `SHEET_QC` / `SHEET_DISPOSAL` / `SHEET_BACKUP` | 評価・廃棄チャネル等（別機能） |

シフトの「週次マスター取り込み」とは直接関係しないものもあるため、**シフト運用の主眼は 3.1 と 3.2** に置いてください。

---

## 4. HQ向け操作手順（典型フロー）

### 4.1 週次: マスターから DB へ同期したいとき

1. バックエンドが参照する **マスター**（`DUBAI_SHEET_ID` / `MANILA_SHEET_ID`）上で、該当タブを更新する。  
2. 運用ルールに従い `GET /admin/ingest` または `GET /admin/ingest_weeks` を実行（認証・ネットワークは本番ポリシーに従う）。  
3. レスポンスの `shift_rows_upserted` 等で件数を確認。

### 4.2 ドラフトで月・週の案を作る

1. PWA `/admin/draft` を開く（HQ/ADMIN 権限が必要）。  
2. 都市・店舗・対象月（または週）を選び、**週コピー / 月次 AI ドラフト** 等で `version_id` を得る。  
3. 画面上でセルを編集（API は `shift_draft_rows` を更新）。

Dubai の店舗コードは API 側で **BB, JLT, ARJ, AM, AB, CK, DRIVER** などにフィルタされるロジックがあります（`/api/draft/branches`）。

### 4.3 ドラフトを「公開」する（Apply）

1. **Prepare**: 週開始日・ドラフト `version_id` を指定しプレビュー → `confirm_token` 取得。  
2. **Confirm**: 同じ承認者が PIN で確定。**その週の Published が DB で置き換わる。**  
3. スプレッドシートにすぐ反映したい場合は **自動エクスポート**を有効にし、対象月を確認。

### 4.4 月次レポートをスプレッドシートに出す（エクスポートのみ）

1. `/admin` の **Export** フロー（prepare → confirm）で月・店舗・FINAL/DRAFT を指定。  
2. 返却された `sheet_url` / `main_url` / `headcount_url` を関係者に共有。  
3. Google 上では **`EXPORT_SHEET_ID_*` ブック**を開き、タブ名 `{BC}_{月}_{モード}_*` で探す。

---

## 5. トラブルシューティング（HQ）

| 症状 | 確認すること |
|------|----------------|
| ingest で `spreadsheet_id is empty` | `DUBAI_SHEET_ID` / `MANILA_SHEET_ID` が Heroku に設定されているか |
| 単一タブ ingest で `sheet_name is empty` | `DUBAI_TAB_NAME` / `MANILA_TAB_NAME` |
| エクスポートで `Missing EXPORT_SHEET_ID_*` | **エクスポート先**用の変数が別途必要（マスター ID だけでは足りない） |
| Apply したがシートが変わらない | **正常**。シート更新はエクスポート操作時のみ（または Apply の auto_export 時） |
| 別の人が export の confirm を押せない | トークン作成者と承認者が同一である必要がある実装（`created_by` チェック） |

---

## 6. まとめ（スプレッドシート早見表）

| あなたがやること | 影響が出るスプレッドシート（環境変数） |
|------------------|--------------------------------------|
| マスターを編集して ingest | **`DUBAI_SHEET_ID` / `MANILA_SHEET_ID`** のブック（読み取り元）→ 中身は DB に取り込まれる |
| ドラフト作成・編集 | **Google シートは変わらない**（DB のみ） |
| Apply（公開） | **Google シートは変わらない**（DB の Published のみ）。オプションで自動エクスポートすれば次行へ |
| 月次エクスポート or Apply+auto_export | **`EXPORT_SHEET_ID_DUBAI` / `EXPORT_SHEET_ID_MANILA`** のブックに、命名規則どおりのタブが作成・更新される |

---

## 7. 改訂・問い合わせ

- 実際のスプレッドシート名・URLは **Google ドライブ上の共有設定** と **Heroku Config Vars** で管理されています。本書の変数名と対応表を社内 Wiki にコピーし、**ブックごとの「通称」** を追記すると運用が楽になります。  
- API の詳細はバックエンド `app/main.py`（ドラフト・エクスポート・ingest）および `app/exporter.py` を参照してください。

---

## 8. Procurement Risk Lab（統制設定）受け入れテスト

仕入れ統制 Phase 3 の設定運用（理由コード・監査・競合解消・CSV）については、専用チェックリストを参照してください。

- `docs/PROCUREMENT_RISK_LAB_E2E_CHECKLIST_JA.md`

---

## 9. Procurement 通知運用

Approval Inbox / Case Messenger を中心にした通知運用（Workforce OS Push / Twilio WhatsApp）の設定方法と確認手順は以下を参照してください。

- `docs/PROCUREMENT_NOTIFICATION_RUNBOOK_JA.md`

---

*このドキュメントはリポジトリのコード（`sushizen_shift_app_clean` / `sushizen-shift-pwa`）に基づき 2026-03-22 時点で整理しました。*
