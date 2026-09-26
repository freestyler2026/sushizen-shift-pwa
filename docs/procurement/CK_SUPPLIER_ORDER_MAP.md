# CK→Supplier 発注フロー 全体地図

> 2026-09-26 作成。Yusuke の Direct Purchase 改善要望（①〜⑤）を調査する過程で、
> コードと**本番データの実測**から確定させた事実だけを書いてある。
> 推測は「未確認」と明記する。**この文書を読まずに Direct Purchase 周りを触らないこと。**

---

## §0 最初に誤解する7つのこと

私（Claude）は今回の調査で、以下を**全部いちど間違えた**。同じ順で間違うので先に置く。

| # | 誤解 | 事実 |
|---|---|---|
| 1 | Direct Purchase は「買った後の記録」だから PO は出ない | **出る。** 619件の承認済みのうち512件に PO がある。作成APIは PO を作らないが、**人が後から PO 画面で作る**のが正規の運用 |
| 2 | 全リクエストが同じ種類 | **5種類**（`standard` / `direct_purchase` / `cash_purchase` / `ec_purchase` / `prepaid`）。マニラは**49%が direct_purchase**（770/1568） |
| 3 | `/api/admin/procurement/requests` を見れば種類が分かる | **`purchase_type` が SELECT に無い。** この API を見ている限り両者は区別できない（私もできなかった） |
| 4 | 「承認済みだがPO無し」は321件 | **107件。** 321は direct_purchase を混ぜた汚染値 |
| 5 | 「PO発行済み未受領」は62件 | **60件**（direct_purchase 側）。standard 側は**2件**。都市で正反対 → §6 |
| 6 | Overdue 389件は本当に遅れている | **68%（264件）がノイズ。** 内訳は §5。本物は13件＋短納品67件 |
| 7 | `po_status` は信用できない | **100%正しい**（60件を実PO行と突合して60/60一致）。信用できないのは `receiving_status` の方 |

**教訓55の型**: ①②④⑤に必要な列は**すべて既に存在し、値も正確**。画面が取得していないだけ。
③だけが本当に未実装。

---

## §1 登場する4つのチャンネルと画面

Yusuke の要望は3チャンネルにまたがる。

```
Procurement チャンネル
  /admin/procurement/direct-purchases   776行  ← ①② の対象。CK→Supplier 発注の入口
  /admin/procurement/pos               1252行  ← PO 作成・送信（③の対象）
  /admin/procurement/hub               1344行
  /admin/supplier-confirmations                ← ③の半分がここに実装済み（§4）

Store Procurement チャンネル
  /store/procurement/request                   発注フォーム
  /store/procurement/receiving         1017行  ← ④ の対象（Request/Approval/Receiving の3段）
  /store/purchase                       658行

Daily Inventory チャンネル
  /admin/daily-inventory                 81行  ← 実体は components/admin/AdminDailyInventoryTab
                                               ⑤ の対象。incoming の概念は**どこにも無い**
```

---

## §2 データモデル — どのテーブルが何を持つか

### 2.1 3層構造

```
proc_requests          発注依頼 1行           ← status, po_status, receiving_status, invoice_status, payment_status
  └ proc_request_items  明細 N行              ← vendor_name は**自由入力でマスタ未接続**（教訓92）
proc_purchase_orders   PO  N行（仕入先ごと1本） ← delivery_date, receipt_confirmed_at, has_shortage
  └ line_items_json                          ← source_row_id = proc_request_items.id
proc_receivings        受領 N行               ← po_id, status, shortage_qty
  └ proc_receiving_items                      ← request_item_id
```

**`proc_purchase_orders.request_id` は `NOT NULL REFERENCES proc_requests(id)`** —
PO とリクエストの紐付けは**最初から必須で存在する**。①②の「紐付けできないか」は
紐付けが無いのではなく、**画面がそれを表示していない**という話。

### 2.2 一番重要な構造的欠陥 — 粒度のずれ

| 事実 | どの粒度で発生するか | どこに保存されるか |
|---|---|---|
| 承認された | リクエスト単位 | `proc_requests.status` ✅一致 |
| PO を出した | **仕入先（PO）単位** | `proc_requests.po_status` ❌**リクエスト単位** |
| 物が届いた | **仕入先（PO）単位** | `proc_requests.receiving_status` ❌**リクエスト単位** |

`infer_receiving_status()`（`app/services/procurement_control.py:548`）:

```python
if "CONFIRMED" in statuses:      # ← 受領行が1本でも CONFIRMED なら
    return "CONFIRMED"           #    リクエスト全体が CONFIRMED
```

**4仕入先に発注して1社だけ届いた場合、リクエストは「受領済み」になる。**
これが Yusuke の「どの仕入先が届いたのか画面で判断できない」の正体。
実測で**42件**がこの状態（§5 C2）。

---

## §3 ステータスの全集合（実測値、マニラ 1,568件）

`status`: DRAFT / SUBMITTED / IN_REVIEW / APPROVED / REJECTED / IN_PRODUCTION / PURCHASED / DELIVERED
`po_status`: DRAFT / ISSUED
`receiving_status`: PENDING / IN_PROGRESS / CONFIRMED / NOT_RECEIVED / INVOICE_CHECKED / CLAIM_REVIEW

⚠️ **画面のフィルタは All / IN_REVIEW / APPROVED / REJECTED の4つしか出さない。**
DRAFT（219件）・IN_PRODUCTION（33件）には**画面から到達できない**。

### direct_purchase（CK→Supplier、マニラ 770件）

| status | 件数 |
|---|---|
| APPROVED | 619 |
| その他（IN_REVIEW / REJECTED / DRAFT） | 151 |

承認済み619件の内訳（**これが①②④⑤が必要とする全データ**）:

| po_status | receiving_status | 件数 | 意味 |
|---|---|---|---|
| ISSUED | CONFIRMED | 441 | 完了 |
| DRAFT | PENDING | 94 | **②承認済みだがPO未発行** |
| ISSUED | PENDING | 60 | **④⑤発注済み・未着（= Incoming）** |
| DRAFT | CONFIRMED | 10 | PO を飛ばして受領 |
| ISSUED | INVOICE_CHECKED | 6 | |
| ISSUED | NOT_RECEIVED | 4 | |
| その他 | | 4 | |

**②の母数 = 107件（po=DRAFT の合計）。⑤の母数 = 60件。**

---

## §4 ③ の正体 — 半分実装されている

`proc_purchase_orders.delivery_date` は **INSERT でしか書かれない**（db.py:15306, 15603）。
UPDATE は9箇所あるが、**どれも delivery_date に触らない**（全数確認済み）。
つまり**作成後に納品予定日を変更する経路はコード上どこにも存在しない。**

ところが**別の場所に納品日の改定を記録する仕組みが既にある**:

```
supplier_confirmation_calls  （db.py:62467）
  expected_delivery_date  ← 仕入先に電話して「◯日になる」と言われた日付
  result, called_by, notes, retry_at, escalated_to ...
proc_purchase_orders.supplier_confirmation_status  （db.py:62453）
```

画面も存在する: `/admin/supplier-confirmations`。**本番の利用は5件のみ。**

そして **Overdue 判定はこの改定日を一切見ない**（db.py:62249）:

```sql
AND store_today(r.city) > COALESCE(po.delivery_date::date, r.request_date::date + 1)
```

→ 仕入先が日付を変えても Overdue のまま。**Yusuke の③の症状はこれ。**
つまり③は「新機能」ではなく、**既にある改定日を `delivery_date` に反映させること**。

---

## §5 なぜ機能していないのか — Overdue 389件の解剖（マニラ、全件実測）

Overdue の条件（db.py:62249）:
```sql
WHERE (po.receipt_confirmed_at IS NULL OR po.has_shortage = TRUE)
  AND store_today > COALESCE(po.delivery_date, request_date + 1)
```
**`overdue_ack_status` は 389件すべて `pending`。承認された件数はゼロ。** 誰も見ていない。

| # | 原因 | 件数 | 金額 | 直し方 |
|---|---|---:|---:|---|
| C1 | **2026-07-24 より前に受領確定したため PO に印が付いていない** | **222** | ₱2,037,973 | **一度きりのバックフィル。コード修正不要** |
| C2 | 複数PO のリクエストで、受領が**兄弟PO**に印を付けた | **42** | ₱371,007 | 受領を PO 単位にする（§2.2） |
| C3 | 受領記録が1本も無い（本当に未着 or システム外で受領） | **58** | ₱559,381 | うち**45日以内は13件** ← **本物の信号** |
| C4 | 受領済みだが短納品が未解決 | **67** | ₱656,662 | 正常動作。40件中38件は実際に shortage_qty>0 |

**C1 の根拠**: `c2d7d472 2026-07-24 "stamp PO on receiving confirm"` で受領時の PO 押印が追加された。
該当222件の受領確定日を全件調べると **222/222 が 2026-07-25 より前**。**7/25以降は0件。**
→ 押印コードは正しく動いている。**過去分が取り残されているだけ。**

### 結論
**389件のうち264件（68%）がノイズ。** 本物は「45日以内で未着13件」＋「短納品67件」。
だから Aliana は CK スタッフを追いかけ続けることになり、CK 側は
「また間違ったリストが来た」と学習する。**教訓39（ノイズが本物を埋める）そのもの。**

---

## §6 ドバイは正反対 — 同じ閾値を当ててはいけない

| | マニラ | ドバイ |
|---|---|---|
| direct_purchase | 770件（49%） | **4件** |
| IN_REVIEW 滞留 | 123件（全件31日超） | **0件** |
| 承認済みPO未発行 | 107件 | 2件 |
| **PO発行済み・未受領** | **2件** | **667件** |
| Overdue | 389件 | **500件で上限に当たった（未計測）** |

**マニラは「受領するがPOを出さない」、ドバイは「POを出すが受領確定しない」。**
ドバイの承認は全件 level 0/1 で承認キューが存在しない（教訓79）。
**①の48時間アラートをドバイに出しても対象が0件、④はドバイで667件鳴る。**
→ **アラートは都市ごとに別の閾値を持たせる。共通閾値にすると片方が必ず無意味になる。**

⚠️ ドバイの数字は `limit=2000` / `limit=500` の上限に当たっており**切り捨てられている**。
ドバイを対象にする前に、日付範囲で分割して測り直すこと。

---

## §7 API が返さないもの（①②④⑤が動かない直接の理由）

### `/api/admin/procurement/direct-purchases` の返す列
```
id, request_no, parent_case_no, city, requested_by, store_code, request_date,
total_amount, status, purchase_type, receipt_url, new_vendor_flag,
data_verified_at, data_verified_by, created_at, updated_at, items
```
**po_status が無い。receiving_status が無い。納品予定日が無い。**
→ Direct Purchase 画面は**原理的に**PO 発行状況を表示できない。②は画面の問題ではなく API の問題。

### `/api/admin/procurement/requests` の返す列
`po_status` `receiving_status` `invoice_status` `payment_status` `po_match_status` ほか**全部返す**。
ただし **`purchase_type` を返さない**（§0-3）。

---

## §8 やってはいけないこと

1. **`purchase_type` を見ずに「承認済みなのに PO が無い」と数えない。** 49%が混ざる
2. **`receiving_status` を「届いた」の根拠にしない。** 複数仕入先だと1社で CONFIRMED になる。
   届いたかどうかは **`proc_purchase_orders.receipt_confirmed_at`**（PO単位）で見る
3. **Overdue の件数をそのまま現場に見せない。** 68%がノイズ。C1のバックフィルが先
4. **`has_shortage=TRUE` を誤フラグと決めつけない。** 実測40件中38件は本物の短納品
5. **マニラとドバイに同じ閾値を当てない**（§6）
6. **PO 明細と在庫品目を名前で突き合わせない。** `proc_request_items.vendor_name` は自由入力で
   マニラは90日で16%がカタログ未登録（教訓97）。PO 明細は `source_row_id` で
   `proc_request_items.id` に繋がるので、**そちらを使う**
7. **`delivery_date` の UPDATE を新設したら、Overdue クエリ・`supplier_confirmation_calls`・
   Store Procurement の3箇所が同じ日付を読むことを確認する**（教訓62）

---

## §9 検証レシピ

```js
// 本番読み取りは認証済みブラウザペインから（Heroku CLI は認証が壊れている）
const r = await fetch('/api/admin/procurement/requests?city=manila&limit=2000',{credentials:'include'});

// direct_purchase を分離する唯一の方法（requests API は purchase_type を返さない）
const dp = await fetch('/api/admin/procurement/direct-purchases?city=manila&limit=1000',{credentials:'include'});

// PO の実在確認（po_status を信じる前の裏取り）
await fetch('/api/admin/procurement/pos?request_id=<uuid>&limit=20',{credentials:'include'});

// 「届いたか」の唯一の正しい判定
//   proc_purchase_orders.receipt_confirmed_at IS NOT NULL   ← PO単位
//   proc_requests.receiving_status                          ← 使うな（§8-2）
```

```bash
# delivery_date を書く経路が増えていないか
grep -n 'set_parts.append("delivery_date' app/db.py    # 空であること
```

---

## §10 ファイル索引

| 役割 | 場所 |
|---|---|
| Direct Purchase 一覧 API | `app/main.py:31437` |
| Direct Purchase 作成（PO は作らない） | `app/main.py:31540` |
| リクエスト一覧 API（purchase_type 欠落） | `app/main.py:25486` / `app/db.py:12213` |
| PO 作成 | `app/main.py:28445`（単体） / `28494`（一括・仕入先ごと1本） |
| PO の delivery/receipt 更新（**delivery_date は含まない**） | `app/db.py:15404` |
| 受領作成 | `app/main.py:28820` / `app/db.py:16068` |
| 受領確定（PO に押印。2026-07-24 追加） | `app/main.py:29028` / `app/db.py:16454` |
| receiving_status の推論（**1本でCONFIRMED**） | `app/services/procurement_control.py:548` |
| Overdue 一覧（delivery_date のみ参照） | `app/db.py:62249` |
| 仕入先確認コール（改定日を持つ） | `app/db.py:62509` |
| バッジ集計（standard の PO 未発行を数えていない） | `app/db.py:13016` |
