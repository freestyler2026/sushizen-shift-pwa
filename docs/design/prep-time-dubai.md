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
| **Keeta** | 217 | 未確認 | セッションは生存。Financials は開ける |
| **Noon** | 39 | 未確認 | 件数が少なく優先度低 |

マニラ（Grab）のように**すぐ取れるものは1つも無い。**

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

## Keeta — 未確認

セッションは生存（2027-02 まで）。`merchant.mykeeta.com/web/app/finance` は開け、
Billing report の生成・ダウンロードができる。**Operations 相当の区画は未探索。**

## Noon — 未確認

30日で39件と少ない。優先度を下げた。

## 提案

1. **Careem に Operations/Analytics の権限を依頼する** — 最も見込みが高い。
   指標も定義も API も判明済みで、権限だけが足りない
2. **Keeta と Noon を次回調べる** — セッションは生きているので調査自体は可能
3. **Talabat は当面あきらめる** — 認証の壁が自動化と相容れない
4. **それまで、ドバイの Prep Time 画面は「計測していない」と明記する**
   （教訓58 — 見えていない場所について「問題なし」と表示しない）

現行のドバイの数字（写真OCR）は**誤読が大半なので、消すか旧方式として隔離する**。
残したまま新方式と並べると、マニラだけが正しい画面になる。
