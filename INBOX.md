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

---

## [2026-08-25] Ayako Nishimura / Discount Rates を Dubai の3ブランド別に入力できるようにする

**調査は完了済み。設計判断も確定済み。そのまま実装に入れる状態。**

### 要件
Dubai は同じ5店舗で **Sushi ZEN / Ramen ZEN / All Veggie Sushi** の3ブランドを運営していて、
アグリゲーターの割引率はブランドごとに交渉している。現在の画面は city + platform で1つの
数字しか持てないため、3ブランドが1つの✅に潰れている。ブランド別に入力できるようにする。

Manila は分割しない（今回の指示は Dubai のみ）。`brand=''` のまま据え置きで従来通り動く。

### なぜ Session 1 案件か
**スキーマ変更が必須**。列追加だけでは足りず、一意制約の張り替え（DROP → CREATE）が要る。
現在の `UNIQUE (city, platform, effective_date)` があると `dubai + careem + 8/25` は1行しか
持てないため、3ブランドを保存できない。
※ Session 2 で実装しようとしたが、`DROP CONSTRAINT` / `DELETE` を含むため権限ガードで
　 ブロックされた（ファイルは未変更）。

### 確定済みの設計判断

**1. ブランドキーは既存の語彙を使う（新規定義しない）**
`sushi_zen` / `ramen_zen` / `all_veggie`
→ `app/db.py` の `_LEGACY_PAYOUT_STORE_MAP`（ar_payout）で既に使われているキー。

**2. 既存データの移行は「3ブランドすべてにコピー」**
現在の中身は5行のみ、すべて Dubai・50%・effective_date 2026-08-24。Manila は0行。
```
dubai | careem / keeta / noon / smiles / talabat | 50.00 | 2026-08-24
```
スタッフと「1つの✓に3ブランド分が入っている」と合意が取れているため、既存行を3ブランドに
複製すれば現状の意味がそのまま保たれる（5行 → 15行、すべて50%）。
**どれか1ブランドに割り当てて他を空にするのは誤り。** 入力済みの値が消えたり意味が変わったり
しない移行になる。

### 実装手順

**① `app/db.py:64560` `_ensure_aggregator_discount_rate_table()` にマイグレーションを追加**
```sql
ALTER TABLE aggregator_discount_rate
  ADD COLUMN IF NOT EXISTS brand VARCHAR(30) NOT NULL DEFAULT '';

ALTER TABLE aggregator_discount_rate
  DROP CONSTRAINT IF EXISTS aggregator_discount_rate_city_platform_effective_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_aggregator_discount_city_platform_brand_date
  ON aggregator_discount_rate (city, platform, brand, effective_date);

-- 一度きりのバックフィル。brand='' の Dubai 行が無くなれば no-op になるので冪等。
INSERT INTO aggregator_discount_rate
    (city, platform, brand, discount_pct, effective_date, notes, updated_at)
SELECT r.city, r.platform, b.brand, r.discount_pct, r.effective_date, r.notes, r.updated_at
FROM aggregator_discount_rate r
CROSS JOIN (VALUES ('sushi_zen'),('ramen_zen'),('all_veggie')) AS b(brand)
WHERE r.city = 'dubai' AND r.brand = ''
ON CONFLICT (city, platform, brand, effective_date) DO NOTHING;

DELETE FROM aggregator_discount_rate WHERE city = 'dubai' AND brand = '';
```

**② 同ファイルの3関数を brand 対応にする**
- `list_aggregator_discount_rates`（64581）: `DISTINCT ON (city, platform)` → `(city, platform, brand)`。
  戻り値に `brand` を追加
- `upsert_aggregator_discount_rate`（64611）: 引数に `brand` を追加、
  `ON CONFLICT (city, platform, effective_date)` → `(city, platform, brand, effective_date)`
- `list_aggregator_discount_rate_history`（64636）: `brand` を SELECT と絞り込みに追加

**③ `app/main.py:47985` POST エンドポイントで `brand` を受け渡す**
`payload.get("brand")` を `upsert_aggregator_discount_rate` に渡す。
GET（47979）と history（47973）は db 側の戻り値に追従するだけ。

**④ フロント `src/components/admin/AdminDiscountRateTab.tsx`**
- `AGGREGATORS`（27行目）は city+platform の配列。Dubai だけ brand 次元を持たせる
- Dubai セクションを3ブランドの小見出しに分けて描画（5行 → 3×5行）
- `key()` は現在 `${city}:${platform}`。**`${city}:${platform}:${brand}` に変える必要がある**
  （ここを直さないと3ブランドが同じ state を共有して壊れる。最重要）
- 保存時の POST body に `brand` を追加
- Manila は brand なし（`''`）で従来通り

### 検証
- マイグレーション後: `SELECT city, platform, brand, discount_pct FROM aggregator_discount_rate ORDER BY 1,2,3;`
  → Dubai 15行（3ブランド × 5アグリゲーター、すべて50.00）、`brand=''` の Dubai 行が0件
- 画面で Ramen ZEN の Careem だけ別の数字にして保存 → 他ブランドが変わらないこと
- Change History にブランドが出ること

### 未対応の別件（同じ問い合わせに含まれていた）
Talabat は「トップページに50%と表示されない日・店舗があるが、店舗内に入ると割引されている」
という報告あり。表示上の問題か Talabat 側の出し分けかは未調査。ブランド分割とは別論点。
