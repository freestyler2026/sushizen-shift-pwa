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

## [2026-08-27] FoodPanda キャンセルの返金自動確認 — 対応済み（Session 2で実装）
`scripts/foodpanda/sync-cancellations.js` + `POST /api/foodpanda/cancellation-status` で実装・本番反映済み。
判定は経理承認のマッピング（CANCELLED+NOT_BILLABLE → Refund Confirmed、手数料があれば金額に記録、
BILLABLE のままなら needs_review として残す）。

残課題（Session 1 向け）:
- **launchd の定期実行が動いていない。** `~/Library/Logs/sushizen-foodpanda-payouts.log` は全行が
  `Operation not permitted`。~/Desktop 配下のスクリプトを launchd から実行できていない（macOS TCC）。
  payout 抽出も同じ経路なので、FoodPanda の入金取り込みごと止まっている。
- **このスクリプトは headless では動かせない。** PerimeterX が ListOrders だけ 403 を返す
  （ListPayouts は headless でも通る）。実ウィンドウなら 200。GUI セッションが要る。

## [2026-08-27] Manual Shift をセル単位保存（スプレッドシート方式）に作り直す — 西村さん要望
理由: 30分では終わらない設計変更のため Session 1 へ。

**根本原因**: 書き込み単位が「週全体」であること。
- Publish も Save Draft も、ブラウザが持つ週全体を送って上書きする。
- そのため「手元のグリッドが古いと他人の変更を消す」→ 古さを検知してブロックする必要が生じる
  （`base_state_token` / `base_content_hash`）。
- 結果、1人で作業していてもブロックされる。localStorage ドラフトの破棄バナーも同じ原因。

**目指す形**:
1. セル1つの編集 → そのセルだけをサーバーの下書きに保存（新規 PATCH エンドポイント）
2. Publish はブラウザからグリッドを送らず、**サーバー側の下書きから公開**する
3. localStorage ドラフトを廃止（週全体モデルを延命するためだけに存在していた）
4. 衝突はセル単位の後勝ち。誰がいつ触ったかを表示
5. `base_state_token` / `base_content_hash` のガードを削除（送らないので不要になる）
6. 削除も「そのセルは空」という下書き上の記録にする（published を直接消さない）

**注意点**:
- `/week`・My Shift・DTR・給与が `shift_published_rows` に依存している。公開の出力形式は変えないこと。
- 「下書きは非公開、Publish で公開」という区別は維持する（現場が週をかけて組むため）。
- 下書き全体を破棄して公開状態に戻す操作を用意すること（今は「publishしない」がその役割）。
- `shift_draft_rows` は既にセル単位の行を持つが、`save_draft_only` が毎回 version を作り直して
  全行を入れ直す作りなので、そこを upsert に変える。

**今日入れた暫定修正**（根本解決ではない）:
- 自分の削除で自分のグリッドが stale になる不具合を修正（`restampBasisAfterOwnEdit`）
- デプロイ時の強制リロードで入力が消える件を修正（`useUnsavedGuard` 登録）

## [2026-08-28] HQスタッフ / NTE 自動化（勤怠連動・承認フロー）
理由: 勤怠→NTE自動下書きは新テーブル（判定履歴・重複防止）と worker 追加が必要。
      無断欠勤の判定に必要な「Discord連絡の有無」「Medical Certificate提出」の
      データが存在せず、Absence ページへの入力項目追加（スキーマ変更）が要る。
      Session 2 の範囲外（スキーマ変更 + 30分超）。

実測（2026-08-01以降・Manila）:
  60分以上の遅刻          24件 / 10名
  週2回以上の30分遅刻     15件
  週2回以上の無給欠勤     10件
  → 自動発行にすると月49通。HR確認を1回挟む案が妥当。

既存: nte_requests (PENDING 5 / APPROVED 1 が39日放置) — ワークフローは存在するが
      滞留の可視化と督促が無い。/store/my-nte で本人への配信は既に動く。

対応済み(Session 2): 作成中ドラフトの消失 → 5d3f55d1

**仕様書: `docs/ai/handoff/nte-automation.md`**（Session 1 はここを読む。
`docs/ai/CURRENT_TASKS.md` の先頭からリンク済み）

## [2026-08-29] HQ Ayako / COE（在職・退職証明書）の発行機能
理由: 新規テーブル＋新規ページ＋PDF生成。Session 2 の範囲外。
      DOLE Labor Advisory 06-20 で請求から3日以内の発行義務があり優先度が高い。

仕様書: `docs/ai/handoff/coe-issuance.md`
       （`docs/ai/CURRENT_TASKS.md` の先頭からリンク済み）

調査で判明:
  役職      manila_staff_profiles.position       34/89名
  入社日    official_hire_date                   58/89名
  法人区分  7CZ / SUSHIZEN を持つ列が存在しない    0
  入社日の自動推定は不可（打刻と一致するのは25%。空欄者の初出勤日は全員 2026-04-01
  ＝勤怠収集の開始日であって入社日ではない）
