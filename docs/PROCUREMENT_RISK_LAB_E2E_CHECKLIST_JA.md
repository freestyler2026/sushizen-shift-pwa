# Procurement Risk Lab — E2Eテスト手順書（運用仕上げ）

本書は ` /admin/procurement/risk-lab ` の最終受け入れ確認用チェックリストです。  
対象は「共有閾値の設定運用（理由・監査・競合・レポート）」です。

---

## 1. 事前準備

- テスト環境で API と PWA が起動していること
- 検証ユーザーを2種類用意
  - **HQ書込ユーザー**: `procurement.config.write` を持つ
  - **閲覧ユーザー**: `procurement.config.write` を持たない
- `Risk Lab` にアクセス可能なロールでログインできること
- できればブラウザを2つ（またはシークレット）で同時ログインできる状態にする

---

## 2. 保存成功（正常系）

### 2.1 共有閾値を保存できること

1. HQ書込ユーザーで ` /admin/procurement/risk-lab ` を開く
2. `Risk Threshold Settings` で任意の閾値を1つ変更
3. `Change reason` を選ぶ（例: `Threshold tuning`）
4. `Save Shared Thresholds` を押す

期待結果:
- エラーが出ない
- `Last shared update` が更新される
- `Shared Settings Update History` に新規行が追加される
- 履歴行に以下が表示される
  - 更新者
  - 時刻
  - 理由
  - changed項目の before/after

### 2.2 OTHER理由の必須入力

1. 理由を `Other (specify detail)` に変更
2. 詳細を空欄で保存

期待結果:
- 保存されない
- 詳細必須メッセージが出る

---

## 3. 権限ガード（HQ限定書込）

1. 閲覧ユーザーで ` /admin/procurement/risk-lab ` を開く

期待結果:
- `Risk Threshold Settings` が read-only 表示になる
- 入力欄・保存ボタン・履歴スナップショット読込ボタンが無効
- 「HQ users with procurement.config.write only」旨の案内が表示される

---

## 4. 競合（409）と差分解消

### 4.1 競合を再現

1. ブラウザA/Bの両方で HQ書込ユーザーとして同ページを開く
2. Aで閾値を変更して保存（成功させる）
3. Bはページ再読込せず、別の値で保存

期待結果:
- B側で409相当の競合エラーが表示される
- `Conflict detected` パネルが出る
- サーバ最新値 vs 自分のドラフト差分が表示される

### 4.2 競合解消ボタン確認

1. `Load Latest Shared Values` を押す

期待結果:
- 画面値が共有最新値へ置換される
- 競合表示が消える

2. 再度4.1を再現し、今度は `Keep My Draft and Retry Save` を押してから保存

期待結果:
- 再保存できる（最新version前提）
- 履歴に更新が残る

---

## 5. 履歴分析・フィルタ・CSV

### 5.1 フィルタ動作

1. `Shared Settings Update History` で
   - 理由フィルタ
   - 月フィルタ
   - Top changed thresholdチップ
   を順に切り替える

期待結果:
- 履歴一覧が選択条件に一致して更新される
- `No history ...` 表示が条件に応じて正しく出る

### 5.2 サマリー表示

期待結果:
- 理由サマリーに件数と割合 `%` が表示される
- Top changed thresholds に件数と割合 `%` が表示される

### 5.3 CSVエクスポート

1. `Export History CSV` を押す
2. `Export Summary CSV` を押す

期待結果:
- 両CSVがダウンロードされる
- Summary CSV に `percentage` 列が含まれる

---

## 6. 履歴スナップショット再適用

1. 履歴行の `Load This Snapshot as Draft` を押す

期待結果:
- 閾値フォームが該当時点の値に変わる
- 理由コードが `TEAM_CALIBRATION` にセットされる
- 理由詳細に「履歴から読み込み」文言が入る

2. 必要なら保存して履歴に反映

---

## 7. 受け入れ完了条件（Done）

以下を満たせば、Risk Lab設定運用は完成判定とする:

- HQのみが共有設定を書き込める
- 理由コードと監査ログが必ず残る
- 競合時に上書きせず、差分を見て解消できる
- 履歴を理由・月・変更閾値で分析できる
- CSVで監査/報告資料へ持ち出せる
- 履歴スナップショットを再利用して再調整できる

---

## 8. テスト実施ログ（記録テンプレート）

### 8.1 実施メタ情報

| 項目 | 記録 |
|------|------|
| 実施日 | YYYY-MM-DD |
| 実施者 |  |
| 環境 | local / staging / production-like |
| フロントバージョン |  |
| バックエンドバージョン |  |
| 備考 |  |

### 8.2 ケース別結果

| ケースID | ケース名 | 結果 (PASS/FAIL/BLOCKED) | 証跡（URL/CSV/スクショ名） | 不具合チケット | 備考 |
|---------|----------|--------------------------|-----------------------------|----------------|------|
| RL-01 | 共有閾値保存（正常系） |  |  |  |  |
| RL-02 | OTHER理由の必須入力 |  |  |  |  |
| RL-03 | 権限ガード（read-only） |  |  |  |  |
| RL-04 | 409競合の再現 |  |  |  |  |
| RL-05 | 競合解消（Load Latest） |  |  |  |  |
| RL-06 | 競合解消（Keep Draft + Retry） |  |  |  |  |
| RL-07 | 履歴フィルタ（理由/月/changed threshold） |  |  |  |  |
| RL-08 | 理由サマリー割合表示 |  |  |  |  |
| RL-09 | Top changed thresholds表示 |  |  |  |  |
| RL-10 | CSV出力（History/Summary） |  |  |  |  |
| RL-11 | 履歴スナップショット再適用 |  |  |  |  |

### 8.3 最終判定

- 最終判定: `GO` / `NO-GO`
- 判定者:
- 判定日時:
- NO-GO理由（該当時）:
- 次アクション:

