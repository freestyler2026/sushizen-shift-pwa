# Claude Code セットアップガイド

## ユーザーが実行する2コマンド（これだけ）

### Step 1: インストール（3択、どれか1つ）
```bash
# 推奨: 公式インストーラー（自動更新あり）
curl -fsSL https://claude.ai/install.sh | bash

# または Homebrew
brew install --cask claude-code

# または npm（パッケージ名に注意: @anthropic-ai）
npm install -g @anthropic-ai/claude-code
```

### Step 2: 起動 & 認証
```bash
cd /Users/jaynishimura/Desktop/sushizen-shift-pwa
claude
# → ブラウザが開いてAnthropicにログイン → 完了
```

**以上で使用開始できます。**

---

## 日常の使い方

### セッション開始
```bash
# フロントエンド作業
cd /Users/jaynishimura/Desktop/sushizen-shift-pwa
claude

# バックエンド作業
cd /Users/jaynishimura/Desktop/sushizen_shift_app_clean
claude
```

### 前回の続きから再開
```bash
claude --continue
# または起動後に
/resume
```

### コンテキストが長くなったら（1M制限回避）
```bash
/compact
# → 会話を要約・圧縮して継続
```

### セッション中のよく使うコマンド
```
/compact          コンテキスト圧縮（制限対策の主要コマンド）
/clear            会話をリセット（新しいタスク開始時）
Ctrl+C            現在の処理を中断
```

---

## 作業フロー

### 開始時の声がけ例
```
「CLAUDE.mdとCURRENT_TASKS.mdを読んで、今日は〇〇を修正したい」
```

### Claude Codeが自動でできること（Coworkとの違い）
- `git push heroku HEAD:master --force` を直接実行 ✅
- `heroku logs -a sushizen-shift-app` をリアルタイム確認 ✅
- `npm run lint` でエラーを即時修正 ✅
- Herokuのクラッシュを確認してその場でデバッグ ✅

---

## ディレクトリ構成（設定済み）

```
sushizen-shift-pwa/
  CLAUDE.md              ← Claude Codeが毎回自動で読む
  .claude/
    settings.json        ← 権限設定（git/heroku/npm許可済み）
  docs/ai/
    CURRENT_TASKS.md     ← セッション引き継ぎ情報
    FRONTEND_MAP.md      ← フロント全ページ一覧
    BACKEND_MAP.md       ← API一覧
    DATABASE_SCHEMA.md   ← DB定義
    API_MAP.md           ← APIパス一覧
    SYSTEM_OVERVIEW.md   ← 全体アーキテクチャ

sushizen_shift_app_clean/
  CLAUDE.md              ← バックエンド用ガイド
  .claude/
    settings.json        ← 権限設定（git/heroku/python許可済み）
```

---

## トラブルシューティング

### `claude` コマンドが見つからない
```bash
# npmのグローバルパスを確認
npm config get prefix
# 表示されたパスの/bin/をPATHに追加
export PATH="$(npm config get prefix)/bin:$PATH"
```

### 認証エラーが出る
```bash
claude logout
claude  # 再ログイン
```

### Herokuコマンドが通らない
```bash
# Heroku CLIがインストールされているか確認
heroku --version
# なければインストール: https://devcenter.heroku.com/articles/heroku-cli
```

---

## Cowork vs Claude Code 使い分け

| 状況 | 推奨 |
|---|---|
| 長時間の開発セッション | **Claude Code**（/compactで制限回避） |
| Herokuのクラッシュデバッグ | **Claude Code**（ログを直接確認） |
| デプロイを自動化したい | **Claude Code**（git pushを直接実行） |
| 画面を見ながらUI調整 | Cowork（スクリーンショットで確認） |
