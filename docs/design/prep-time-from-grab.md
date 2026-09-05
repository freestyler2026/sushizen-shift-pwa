# Prep Time を写真ではなく Grab から取る

調査日 2026-09-04 / 次回はここから再開する

## 結論

**実現可能。** Grabの注文台帳は注文単位で取得でき、調理タスクの遅延判定まで付いてくる。
写真→OCR→毎朝の目視確認という連鎖は不要になる。

## 現行方式が壊れている根拠（実測）

Taft店・2026-09-01〜03 を Grab と OS で突き合わせた。

| 検証 | 結果 |
|---|---|
| Grab側の注文総数 | **207件** |
| OSに記録がある注文 | **116件（56%）** |
| **写真が撮られず記録されていない注文** | **91件（44%）** |
| OCRの注文時刻がGrabと一致（±2分） | **74/116（64%）** |
| Grabが調理遅延と判定 | 22件（3〜19分） |

つまり毎朝15〜20件を確認する作業は、**半分しか無い母集団の、3分の1が誤っている時刻**に
判子を押していた。ずれ方は数分ではなく最大581分で、別のレシートを読んでいる。

確認する人はOCRと同じ写真を見るので、この誤りは人力では見つからない。
**件数を減らす工夫では直らない。**

補足：
- ドバイの `grabfood` 2,270件（直近30日で最大の塊）は**UAEにGrabFoodが存在しない**ため全て誤読
- `ocr_confidence` は未処理668件すべて `medium` で、優先順位に使えない
- 私が2026-07に確認した241件は**訂正ゼロ** — 判子を押しただけだった

## 使うAPI

```
GET https://api.grab.com/delvplatformapi/merchant/v1/reports/daily-pagination
    ?states=
    &startTime=2026-09-01T00:00:00+04:00
    &endTime=2026-09-01T23:59:59+04:00
    &pageIndex=0&pageSize=50
```

ポータルの **Orders → History** タブが叩いている。認証はセッションCookie（`credentials: 'include'`）。

返る値（1注文＝1行）:

| フィールド | 例 | 備考 |
|---|---|---|
| `displayID` | `GF-286` | **OSの `order_no` と同形式・突合キー** |
| `ID` | `001807329429-C8EFGVMCEAMKLJ` | 長い注文ID |
| `createdAt` | `2026-09-04T15:16:10Z` | **UTC。マニラは +8** |
| `updatedAt` | `2026-09-04T17:07:51Z` | 取引確定。**調理完了ではない**（中央値48分） |
| `deliveryStatus` | `COMPLETED` / `FAILED` | |
| `priceDisplay` | `782.12` | |
| `preparationTaskID` | `...-PREP-C8EFGVMDEKMKLJ` | 207件**全件にあり** |
| `isPreparationTaskDelayed` | `true` / `false` | **Grab自身の判定** |
| `preparationTaskDelayedByMin` | `3`〜`19` | 遅延分数 |

### 取れなかったもの

**調理完了の絶対時刻は無い。** 注文行をクリックしても詳細APIは呼ばれない。
取れるのは「遅れたか」「何分遅れたか」まで。

所要時間そのものは出ないが、**全注文についてGrabの判定が分単位で分かる**ので、
「20分だが正しいか誰も分からない値」より判断に使える。

### 併せて取れるもの

`GET https://merchant.grab.com/troy/insights/v1/trends?...&duration=7_DAYS`
→ `avg_driver_wait_time`（秒）。ダッシュボードの「Driver waiting time」。
7日集計だが、Grabが計測した配達員待ち時間そのもの。

## スクリプト

`scripts/grab/get-orders.js`（2026-09-04 作成・動作確認済み）

```bash
node scripts/grab/get-orders.js taft 2026-09-01 2026-09-03   # 期間指定
node scripts/grab/get-orders.js taft                         # 前日のみ
```

JSONを標準出力に出すだけで、**どこにも保存しない**。取り込みは次の段階。
セッション切れは **exit 1**（緑のまま何も取り込まない事故を避ける／教訓47）。

### 前提：セッション

**1ログイン＝1店舗**（get-payouts.js と同じ）。3店舗ぶん必要。

```bash
node scripts/grab/setup-session.js taft        # paranaque | taft | qc
```

**Grabのセッションは数日で切れる。** 明日はまずこれを実行するところから。
ログイン操作は本人が行う（Claudeは認証情報を入力しない）。

店舗の識別子（参考）:
- Taft の `merchantID` = `2-C7VCJXCDDA5FRX`
- `merchant_group_id` = `PHMG20250807052040017951`（3店舗共通）

## 明日やること

1. `setup-session.js` で3店舗のセッションを取り直す
2. `get-orders.js` で3店舗ぶんを取得し、件数がOS側と何倍違うかを店舗別に出す
3. 取り込み先テーブルを作る（`grab_orders`。注文番号・時刻・状態・遅延分）
4. worker で日次取り込み（`grab-manila-daily-payout.yml` と同じ枠に載せる）
5. **写真ベースと並走させて数字を比較**してから切り替える

## 切り替えの方針

- 既存の `prep_time_records` 9,808件は**削除しない**。「旧方式」として残す（教訓43と同じ扱い）
- 写真投稿は残してよいが、**スコアの根拠から外す**
- 毎朝の確認キューは廃止する。**確認しても精度が上がらないため**

## 他プラットフォーム

| | 注文単位API | 直近30日の実記録 |
|---|---|---|
| Manila GrabFood | **あり（本件）** | 1,943件 |
| Manila Foodpanda | あり（`order-api-gdp-ph.as.restaurant-partners.com`） | 48件のみ |
| Dubai Careem / Keeta / Noon / Talabat | 未発見（スクリプトは入金専用） | 671 / 217 / 39 / 401件 |

ドバイは別途調査が要る。ただしドバイの最大の塊（grabfood 2,270件）は
そもそも誤読なので、**ドバイのPrep Timeは現状ほぼ根拠を持たない**。
