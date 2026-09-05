# ドバイの Prep Time — アグリゲーター別の取得可否

2026-09-05 調査

## 前提: ドバイの現行データはほぼ根拠が無い

`prep_time_records` の直近30日でドバイ最大の塊は **`grabfood` 2,270件**だが、
**GrabFood は UAE に存在しない**。全件が写真の誤読で、除外ルールで統計から外れている。
実記録は Careem 671 / Talabat 401 / Keeta 217 / Noon 39 件。

## 結論（アグリゲーター別）

| | 30日の記録 | Prep time | 状況 |
|---|---:|---|---|
| **Careem** | 671 | **指標は存在するが 403** | アカウント権限。**Careemに依頼が要る** |
| **Talabat** | 401 | 注文画面に到達不可 | **長押しの人間認証**。突破しない |
| **Keeta** | 217 | **✅ 取得できる** | `readiedStatusTime − confirmedStatusTime` |
| **Noon** | 39 | **調理時刻が無い** | 注文一覧は取れるが `placedAt` のみ |

**Keeta だけが今すぐ実装できる。**

## Careem — 指標はあるが権限が無い

Store Manager → **More in Operations** に「Order preparation efficiency」があり、
画面の定義はこう書かれている:

> **Prep time**: Time taken from order acceptance until the order was marked
> Ready for pickup.

**Grab の `readyAt − acceptedAt` と同じ定義**で、Delays% / Wait Time / Marked Ready%
も並ぶ。Export ボタンもある。

API と指標名まで判明している:

```
POST https://partners.careem.com/api/saturn-ext/partner/analytics/v4/graph
{"merchantIds":[...],"brandIds":[...],"company_ids":[1022317],
 "group":"day","fromDate":"...","toDate":"...",
 "filters":{"city":["Dubai"]},
 "type":["food_operations_quality_avg_prep_time"]}
```

他に `/v4/table`（`food_order_preparation_by_meal_type`）と `/v4/realtime` がある。

**ただし全て 403**。画面にも「Something went wrong / We couldn't load this tab」と出る。
セッションは正常（同じセッションで入金データは取得できている）ので、
**このアカウントに analytics の権限が無い**ということ。

→ **Careem の担当者に、パートナーポータルの Operations / Analytics 閲覧権限を
依頼する必要がある。** 権限さえ付けば、実装は Grab と同じ形でできる。

⚠️ 現状で取れるのは**日次の平均値**までと思われる。注文単位かどうかは
権限が付いてから確認する。

## Talabat — 人間認証の先にある

ダッシュボードは開けるが、**注文一覧に進むと
「Press and hold to confirm you are a human」** が出る。
これは自動化で突破しない（FoodPanda の月曜同期と同じ扱い）。

ダッシュボードには
**「Riders waited an average of 6 extra minutes for your orders」** という
配達員の待ち時間が出ており、Grab の driver wait time に相当する数字は持っている。
ただし注文一覧の列は Status / Order ID / Restaurant / Issues / Subtotal /
Estimated earnings で、**prep time の列は見当たらない**。

→ 人が認証を通した状態でセッションを取れば先に進める可能性はあるが、
**取れたとしても日次バッチ化は難しい**（毎回認証を求められるなら自動化できない）。

## Keeta — ✅ 取得できる

Orders → **Order history** が叩く API に注文ごとの状態遷移時刻が入っている。

```
POST https://merchant.mykeeta.com/api/order/history/getOrders
  confirmedStatusTime   受注
  readiedStatusTime     調理完了   ← これ
  completedStatusTime / arrivedStatusTime / createdStatusTime
調理時間 = readiedStatusTime − confirmedStatusTime
```

**実測: 30件中30件で計算でき、中央値14分（6〜20分）。**
Grab の `readyAt − acceptedAt` と同じ定義で、しかも**一覧に入っているので
注文ごとの追加リクエストが要らない**（Grab より軽い）。

セッションは2027-02まで有効。`scripts/keeta/keeta-session.json` がそのまま使える。

⚠️ ポータルは iframe 構成で、ページ遷移はクリックで行う必要がある
（URL直打ちでは中身が描画されない）。Playwright が要る。

## Noon — 注文は取れるが調理時刻が無い

```
POST https://restaurant.noon.partners/_food-restaurant/order/search
  {"startDate":"2026-09-01","endDate":"2026-09-05"}
```

日付ごとに注文が返る（**9/4 は173件**。`prep_time_records` の30日39件とは桁が違う）。
ただし時刻は **`placedAt` の1つだけ**で、受注・調理完了は無い。

```
orderNr / orderRef / channelCode / status / amount / paymentStatus /
currencyCode / placedAt / outletCode / outletName / 金額各種
```

注文詳細のエンドポイントは見つからなかった（試した4経路すべて404）。
**現状 Noon の調理時間は取得できない。**

⚠️ Noon のポータルはヘッドレスブラウザを HTTP/2 レベルで拒否する
（`ERR_HTTP2_PROTOCOL_ERROR`）。素の fetch は通るので、UI探索ができない。
追加のエンドポイントを見つけるには、人が実ブラウザで開いて通信を記録する必要がある。

## 提案

1. **Keeta を実装する** — 今すぐできる。追加リクエスト不要で Grab より軽い。
   ドバイで最初に本物の調理時間が出るのはここ
2. **Careem に Operations/Analytics の権限を依頼する** — 指標も定義も API も
   判明済みで、権限だけが足りない。件数はドバイ最大（671件）なので効果も大きい
3. **Noon は保留** — 注文は取れるが調理時刻が無い。人が実ブラウザで
   ポータルを開いて通信を記録すれば別経路が見つかる可能性はある
4. **Talabat は当面あきらめる** — 人間認証が自動化と相容れない
5. **Keeta が入るまで、ドバイの Prep Time は「計測していない」と明記する**
   （教訓58 — 見えていない場所について「問題なし」と表示しない）

現行のドバイの数字（写真OCR）は**誤読が大半なので、消すか旧方式として隔離する**。
残したまま新方式と並べると、マニラだけが正しい画面になる。
