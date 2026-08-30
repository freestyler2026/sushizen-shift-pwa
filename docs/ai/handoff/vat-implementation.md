# 引き継ぎ: マニラ・ドバイ VAT 実装

中断日 2026-08-30。**着手可。** 元計画 = `VAT実装計画.pdf`（2026-08-29、西村さん手元）。
このファイルはそれを実データで検証し直した差分と、確定した判断を記録したもの。

---

## 一行でいうと

**Phase 1〜4 は通しで実装できる。** 残るのは会計事務所・ポータルへの確認3件で、
うち2件は西村さん側で進行中。**実装を止めるものは「アグリゲーター手数料の請求書」だけ。**

---

## 確定した判断（2026-08-30 西村さん・再確認不要）

### ① プロモ値引きは自社負担 → 課税標準は**割引後**

output VAT の基礎は `manila_sales_by_channel` の **`source_system='storehub_api'` の
`total_sales`**。`grab_export` の `total_sales` は**割引前**なので使わない。

同一と確認済み（2026-05-01 以降250日）:
```
grab_export.net_sales  ≒  storehub_api.total_sales
  平均差 −55.27 ペソ/日   相関 0.9884
```

### ② デリバリーに SC/PWD の免税売上は無い → 集計元は **Cashier Log 単独**

プラットフォームが法定割引を適用していない。POS 明細の `senior_discount` /
`pwd_discount` / `buyer_id_no` が全件ゼロなのは**正しい状態**で、埋める必要がない。
計画の Phase 2（Cashier Log から集計）がそのまま正解。デリバリー側の取り込みは不要。

---

## 元計画から変わった点

### 「Paranaque 明細 73% 欠損」は現在成立していない

計画は明細を **grab_export の日次**と比べていた。storehub 日次と比べると一致する。

```
2026-08 明細 vs storehub日次
  Sushi ZEN - Paranaque   494,407 / 488,380   +1.2%
  Sushi ZEN Cubao       1,525,021 / 1,495,306  +2.0%
  Sushi Zen - Taft      2,401,914 / 2,375,526  +1.1%
```

**Phase 1 は想定より小さい。** 残るのは StoreHub API の `tax` / `serviceCharge` の
マッピング追加のみ（`app/services/storehub_api.py` の `_map_to_pos_transaction_row`）。

### 日次テーブルは2ソースが並存する（二重計上ではなく、割引前後）

```
store_name            source_system   意味
Taft / QC / Paranaque grab_export     割引「前」  ← 使わない
Sushi Zen - Taft 等    storehub_api    割引「後」  ← これが基礎
```

⚠️ **素直に SUM すると全期間で PHP 11,086,568 の過大計上**になる。
`source_system` で必ず絞ること。

---

## 実装済み — Phase 0 の検算（常設）

```
GET /api/admin/vat/source-uniqueness?city=manila&date_from=&date_to=
app/db.py :: vat_check_source_uniqueness()
```

「同じ 店舗×チャネル×日 が複数ソースで存在しないか」を読み取りのみで判定する。
**毎月の申告前に走らせること。** 一度きりの調査にしなかったのは、計画が正しく測った
数値が翌日には別の意味になっていたため。

名寄せできない店舗名は**捨てずに金額つきで返す**。今回の並存が誰にも見えなかったのは、
`branch_pos_map` が grab_export 側の名前しか持たず storehub 側が別店舗として
素通りしていたから。同じ隠れ方は再発しない。

最新の実行結果（全期間 2026-03-26〜08-29）:
```
二重に存在する 店舗×チャネル×日 : 292
名寄せ不能な店舗名               : なし
比率は全店で 1.91〜1.97（＝割引率。エラーではない）
```

---

## ⚠️ 未着手の発見 — アグリゲーター手数料の仕入VATが1件も無い

**金額が最大。急ぎ。**

```
2026-08 デリバリー売上（割引後） 約 3,945,000
        入金額                 約 2,382,000
        差額（手数料等）        約 1,563,000
```

`invoice_summary` に Grab / foodpanda の請求書が **0件**。

```
manila 771件 / 60社 / VAT 204,383（2026-02〜07）
  上位は Three-S Food Services / Richcaths / J&J Fresh Seafoods … 食材のみ
aggregator commission invoices: NONE FOUND
```

手数料に VAT が乗っているなら **月あたり約16万ペソの控除**。現在計上している
マニラの仕入VAT（月4万強）の**4倍近い規模**が抜けている。

計画は Phase 4 を「データが最も揃っている」と書いているが、**金額最大の相手が丸ごと欠けている。**

**次にやること**: Grab / foodpanda のマーチャントポータルで、手数料の請求書が
VAT 付きで発行されているか確認する。発行されていれば取り込みが必要。
（2026-08-30 時点で西村さんから「ポータルで確認してください」と依頼あり。**未着手。**）

---

## 残る確認事項

| # | 内容 | 担当 | 状態 |
|---|---|---|---|
| 1 | **アグリゲーター手数料の VAT 請求書** | Claude（ポータル確認） | **未着手・金額最大** |
| 2 | マニラの TIN と法人構成（3店舗が1納税者か） | 西村さん → スタッフ | 確認中 |
| 3 | ドバイ JLT の QFZP 資格（法人税・別件） | 西村さん → 会計事務所 | 確認中 |

### #2 の背景

`own_tax_numbers` は **1行のみ**（dubai / RAMENZEN / 104172381600003）。
**マニラの登録がゼロ。** 計画はこれをドバイの論点として扱っているが、同じ欠落が
マニラ側にもある。スタッフ情報には `SUSHIZEN` と `7CZ ANGEL CORP.` の2法人があるため、
3店舗が1納税者かを確認せずに1本の申告へ集約するのは危険。

### #3 の背景

ZEN FOOD LABS DMCC（JLT / TRN 105491096100001）が `own_tax_numbers` に未登録。
VAT 上は DMCC が Designated Zone でないため特別扱い不要（計画 §1 で決着済み）。
法人税の QFZP 資格は別問題で、失えば当年度＋以後4年間 9% 課税。**金額の桁が違う。**

---

## 再開時の手順

1. このファイルと `VAT実装計画.pdf` を読む（計画の設計思想は有効。着手順だけ変わった）
2. `GET /api/admin/vat/source-uniqueness` を走らせ、割引前後の並存が続いているか確認
3. **確認事項 #1（手数料請求書）に着手** — ここが決まらないと Phase 4 の規模が読めない
4. #2 が返ってきたら `own_tax_numbers` にマニラを登録
5. Phase 1（`tax` / `serviceCharge` のマッピング）→ Phase 2 → Phase 3 → Phase 4

**Phase 1〜3 は #1・#2 の回答を待たずに進められる。**

---

## 実測値の一覧（2026-08-30 時点）

| 項目 | 値 |
|---|---|
| `manila_pos_transactions` | 25,107件 / 2026-04-22〜08-29 |
| 8月の VAT 列 | `vatable_sales` `vat_12pct` `vat_exempt_sales` `senior_discount` `pwd_discount` `buyer_id_no` `delivery_fee` **全件ゼロ**（6,705件中） |
| `own_tax_numbers` | 1行（dubai / RAMENZEN のみ） |
| 8月 storehub 売上 | Taft 2,375,526 / Cubao 1,495,306 / Paranaque 488,380 |
| 8月 AR 入金 | grab: TAFT 915,556 / CUB 716,542 / PAR 636,942<br>foodpanda: FP_TAFT 451,648 / FP_QC 165,306 / FP_PARANAQUE 96,319 |
| SC/PWD（Cashier Log） | 8月 109取引 / ₱15,750 / ID画像92枚 → 免税売上 約 ₱78,750 |
| `invoice_summary` マニラ | 771件 / 60社 / VAT 204,383（2026-02〜07）。**アグリゲーター 0件** |
