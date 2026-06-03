# 新しいセッション開始テンプレート

## ユーザーが毎回コピペするプロンプト（これだけでOK）

```
作業フォルダ：
- /Users/jaynishimura/Desktop/sushizen-shift-pwa
- /Users/jaynishimura/Desktop/sushizen_shift_app_clean

まず以下を読んでください：
1. /Users/jaynishimura/Desktop/sushizen-shift-pwa/CLAUDE.md
2. /Users/jaynishimura/Desktop/sushizen-shift-pwa/docs/ai/CURRENT_TASKS.md

読み終わったら「Ready」と言ってください。その後タスクを伝えます。
作業が終わったら「作業終了」と言います。その時点でCURRENT_TASKS.mdを更新してください。
```

---

## タスク指示の例（「Ready」の後に送る）

### 例1: 新機能
```
/store/ck-production/ ページを作ってください。
CKスタッフがディスパッチできるページです。
```

### 例2: バグ修正
```
CK Productionのペンディングオーダーが表示されていないので直してください。
```

### 例3: UI改善
```
POページのEmailログに開封日時を表示したい。
```

---

## セッション終了（「作業終了」と言うだけ）

Claudeが自動でやること：
- 今日完了したタスクを「Recently Completed」に移動
- 未デプロイの変更を「Deployments Pending」に記録
- 残タスクのステータス更新
- `CURRENT_TASKS.md` を上書き保存

ユーザーがやること：
- 「作業終了」と言う（これだけ）
- デプロイコマンドの実行（Heroku/Vercel）

---

## Claudeが自動でやること（ユーザーは指示不要）

- タスクに応じて必要な docs/ai/ ファイルを自判断でロード
- 関係するソースファイルをgrepで特定してから読む
- 実装 → TypeScriptビルド確認 → 完了報告
- セッション終了時に `CURRENT_TASKS.md` を更新
