# INBOX — Session 1 キュー

Session 2 で対応できなかった依頼をここに記録する。
西村さんが Session 1 のタイミングで処理する。

---

<!-- 例：
## [2026-08-24] Patrick Santiago / DTR スケジュール不一致
理由: バックエンドのスキーマ変更が必要
-->

## [2026-08-25] Ayako Nishimura / Discount Rates に Careem の追加割引エビデンス欄を追加
Discount Rates タブ（`src/components/admin/AdminDiscountRateTab.tsx`）への機能追加要望。

背景: Careem は取引履歴を見ないと分からない **追加割引** が存在する。Premium会員のみに
適用され、標準50%からさらに30%引きになるケースを実際に経験している。現在の
「Discount %」1項目だけでは実態を記録できない。

要望:
1. エビデンスのスクリーンショットを添付できるようにする
2. 「ポータルサイトで取引履歴を10件程度確認した」を記録できるチェック欄を追加する

Session 1 に回す理由:
- 画像アップロードのため **DBスキーマ変更**（添付テーブル or カラム追加）が必要
- ファイルストレージ（Google Drive 連携 or Heroku 側の保存先）の設計判断が必要
- `aggregator_discount_rates` の履歴テーブルにも確認フラグ列の追加が要る
- Session 2 のルール（スキーマ変更なし・30分以内）を明確に超える

※ 同時に報告された「Aggregator の表記が見えない」問題は **ライトモードのバグ**が原因で、
Session 2 で修正済み（`src/app/globals.css` の `--foreground`）。本件とは別件。
