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

---

## git index.lock クリーンアップ

```bash
rm /Users/jaynishimura/Desktop/sushizen-shift-pwa/.git/index.lock
rm /Users/jaynishimura/Desktop/sushizen_shift_app_clean/.git/index.lock
```
