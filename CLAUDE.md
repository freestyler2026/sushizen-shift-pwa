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

---

## git index.lock クリーンアップ

```bash
rm /Users/jaynishimura/Desktop/sushizen-shift-pwa/.git/index.lock
rm /Users/jaynishimura/Desktop/sushizen_shift_app_clean/.git/index.lock
```
