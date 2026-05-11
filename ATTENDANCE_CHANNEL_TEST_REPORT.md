# Attendance チャンネル テスト作成・バグ調査レポート

作成日: 2026-05-12

---

## 概要

Attendance チャンネル（`/admin/attendance` およびサブページ全5ページ）に対してテスト環境を構築し、バグ・問題点の調査・修正を行いました。

---

## 作成したテストファイル

### `tests/admin/attendance/attendance-main.test.tsx`（16テスト）

| テストスイート | 件数 | 内容 |
|---|---|---|
| auth guard | 3件 | ログインリダイレクト・権限なし表示・ページタイトル |
| status dashboard | 7件 | SUCCESS バッチ表示・All mapped/matched・未マップ数・未マッチ数・インポートなし・日付カバレッジ |
| pending banner | 2件 | バナー表示・非表示 |
| workflow cards | 3件 | Daily Workflow 6ステップ・リンク href・Quick Access 4カード |
| refresh button | 1件 | Refresh ボタンで再フェッチ |

### `tests/admin/attendance/attendance-subpages.test.tsx`（40テスト）

| テストスイート | 件数 | 内容 |
|---|---|---|
| AttendanceEmployeesPage | 9件 | ローディング・行表示・空表示・APIエラー・Unmatched/Matchedバッジ・Save・バリデーション・ページタイトル |
| AttendanceLocationsPage | 8件 | ローディング・行表示・空表示・APIエラー・マップ済みバッジ・Unmappedバッジ・タイトル・件数 |
| AttendanceHistoryPage | 8件 | ページ見出し・行表示・SUCCESS/FAILED バッジ・APIエラー・KPI カード・Refresh・戻りリンク・重複フィルター |
| AttendanceImportPage | 9件 | ページ見出し・名前プリフィル・ボタン有効/無効・Drive File List・Sync All API・結果表示・エラー・フォルダID |
| AttendanceMonthlyClosingPage | 5件 | ページ見出し・月状態行・ステータスラベル・戻りリンク・確認ダイアログ非表示 |

---

## バグ・問題点の調査結果

### 問題① 本番コードバグ：UIテキストが全て日本語（重大）

**ファイル**: `src/app/admin/attendance/import/page.tsx`

**CLAUDE.md ルール違反**: "All UI text must be in English."

テスト作成中に発見・修正済み。以下が修正箇所：

| 修正前（日本語） | 修正後（英語） |
|---|---|
| `"同期に失敗しました。時間をおいて再試行してください。"` | `"Sync failed. Please try again later."` |
| `"PINが正しくありません。"` | `"Incorrect PIN."` |
| `"Drive ファイル一覧"` ボタン | `"Drive File List"` |
| `"個別ファイルをSync"` ボタン | `"Sync Selected File"` |
| `"Sync All（全件取り込み）"` ボタン | `"Sync All"` |
| `"同期結果"` 見出し | `"Sync All Result"` |
| `"このIDを使う"` ボタン | `"Use this ID"` |
| `"ファイルが見つかりません"` | `"No files found"` |
| `"個別Sync 結果"` 見出し | `"Single File Sync Result"` |
| ページ副題・フォルダID説明文 等 | 英語化済み |

---

### 問題② テスト修正が必要だった DOM 構造の把握

テスト実行時に発見した DOM 構造上の注意点（バグではなく設計上の仕様）：

| 現象 | 原因 | 対応 |
|---|---|---|
| `getByText("2")` が複数マッチ | ワークフローカードのバッジ＋ステータスカード両方に数値が表示される | `getAllByText("2").length > 0` に変更 |
| `getByText("Analytics")` が複数マッチ | ヘッダーボタン（line 201）と Quick Access カード（line 423）の2か所に表示 | `getAllByText("Analytics")` に変更 |
| `getByText("SUCCESS")` が複数マッチ | 履歴テーブルのバッジ＋フィルター `<select>` の `<option>` に同じテキスト | `getAllByText("SUCCESS")` に変更 |
| `getByText("In review")` が複数マッチ | 月状態行が `<p>` と `<span>` の両方でステータスを表示する設計 | `getAllByText("In review")` に変更 |
| `getByText("EMP001")` が見つからない | ページが `"ID: EMP001"` というフォーマットで表示する | `/EMP001/` 正規表現に変更 |
| `findByText("Santos Maria")` が見つからない | Employees ページがデフォルトで `unmatchedOnly = true`（未マッチのみ表示） | チェックボックスをクリックしてフィルター解除後に確認 |
| `getByText("Total")` が見つからない | KPI ラベルは `"Total Batches"` が正しいテキスト | `"Total Batches"` に修正 |
| `findByText("Drive File List")` が複数マッチ | ボタンとセクション見出しの両方に同テキスト | ファイル名 `bayzat_dubai.xlsx` の存在確認に変更 |
| Import リンクの accessible name | ワークフローカードのリンクにはステップ番号・説明文も含まれるため `/Import$/i` にマッチしない | `getAllByRole("link")` でフィルタして `href` 属性を直接確認 |

---

### 確認済み（バグなし）

| 確認項目 | 結果 |
|---|---|
| Auth guard（リダイレクト・権限なし表示） | 正常動作 ✓ |
| Refresh ボタンで再フェッチ | 正常動作 ✓ |
| `Promise.allSettled` による並列フェッチ（一部失敗でも継続） | 正常動作 ✓ |
| Employees ページの Save / upsert エンドポイント呼び出し | 正常動作 ✓ |
| Employees ページの「スタッフ名未選択」バリデーション | 正常動作 ✓ |
| Locations ページの Mapped/Unmapped バッジ | 正常動作 ✓ |
| History ページの重複フィルター（Show duplicates only） | 正常動作 ✓ |
| Import ページの Sync All / Drive File List ボタン状態管理 | 正常動作 ✓ |
| Monthly Closing の確認ダイアログ（Click Close Month で表示） | 正常動作 ✓ |

---

## テスト最終結果

```
Test Files  31 passed (31)
     Tests  640 passed (640)
  Duration  42.67s
```

Attendance テスト（56テスト・2ファイル）追加分を含む全640テスト・全31ファイル合格。

---

## デプロイ待ち変更

`src/app/admin/attendance/import/page.tsx` の日本語UI修正（問題①）をフロントエンドにデプロイする必要があります。

```bash
cd /Users/jaynishimura/Desktop/sushizen-shift-pwa
git add -A
git commit -m "fix: attendance import page English-only UI; add attendance+private-reports tests"
git push origin main
```
