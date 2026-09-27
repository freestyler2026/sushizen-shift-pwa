# Procurement 全体地図 — 38画面・40テーブル・どれが生きているか

> 2026-09-27 作成。**本番データの実測とコードだけで書いてある。** 推測は「未確認」と明記する。
>
> **姉妹文書**: `docs/procurement/CK_SUPPLIER_ORDER_MAP.md`（2026-09-26）は
> **CK→Supplier の発注1本に絞った深掘り**。粒度のずれ・stage の定義・
> Direct Purchase の実態はあちらが正で、**ここでは繰り返さない。**
> こちらは**チャンネル全体の地図と、どのキューが動いていないか**を扱う。
>
> ⚠️ **Procurement を触る前に両方読むこと。** 片方だけだと必ず取り違える。

---

## §0 先に — 私がこの調査で間違えかけた5つ

順番に間違えたので、同じ順で置く。**どれも「1本クエリを足せば」防げた。**

| # | 言いかけたこと | 事実 | 防ぎ方 |
|---|---|---|---|
| 1 | 「38画面中35画面がメニューに無い＝孤児」 | **全部到達できる。** admin側は `ProcurementTabs.tsx` の4グループ34タブ、store側は `/store/procurement` からのリンク | NavBar だけを見ない。**ハブ経由の導線を数える** |
| 2 | 「store の request / receiving / claim はどこからもリンクされていない」 | **リンクされている。** `` href={`/store/procurement/request?city=${x}`} `` のテンプレートリテラルなので、`"..."` の完全一致検索では出ない | 文字列検索は**引用符なしの部分一致**でもやる |
| 3 | 「Exceptions（Alerts）は3ヶ月レビュー0件で死んでいる」（教訓81の記述） | **生きている。** Yuri Yamada が 9/4〜9/26 に87件クローズ | 教訓の記述を現在形で引用しない。**測り直す** |
| 4 | 「Hub のバッジが未配線なので仕事が隠れている」 | **隠れていない。** `action_needed_count` の条件（cash/ec/prepaid の承認済み）に該当する行は**全期間で6件・直近30日0件**。配線しても0のまま | 「配線が切れている」と「隠れている仕事がある」は別。**中身を数える** |
| 5 | 「Claims の被害額は約80万」 | **通貨を混ぜていた。** マニラ ₱610,158 とドバイ AED 119,312 は足せない | `proc_claims.amount_impact` に通貨列は無い。**`proc_requests.city` で必ず分ける** |

---

## §1 パイプライン — 何がどの順で起きるか

```
   店舗が発注                     承認                  発注書               納品
/store/procurement/request → 承認ケース → PO 作成・送信 → 受領確認 → 請求書照合 → 支払
   proc_requests          proc_approval  proc_purchase   proc_       proc_po_     proc_
   proc_request_items       _cases        _orders        receivings  invoice_     payments
                            _actions      proc_po_email  proc_       checks       （0行）
                                           _logs         receiving_
                                                          items
                                              │                │            │
                                              │                ▼            ▼
                                        proc_exception   proc_claims   （差異）
                                          _events         ← 自動生成      DISCREPANCY
                                        （ルール検知）     （欠品/過剰）
```

**上流（発注〜PO送信〜受領）は健全。** 直近30日で発注890件・PO送信563件・受領686件、
どれも毎日動いている。**止まっているのは下流の2つ**（§3）。

### 都市で性格が全く違う

| | ドバイ | マニラ |
|---|---|---|
| 直近30日の発注 | 625件（**全部 standard**） | 288件（**206件が direct_purchase**） |
| Claims 1件あたり | 74%が100未満（少額ノイズ） | 34%が1,000超（**₱615,966**） |
| PO Match の処理 | Aliana Manuel が継続 | **8月中旬から実質停止** |

**片方の都市で測った比率を、もう片方に当てはめないこと。**

---

## §2 画面一覧 — 38画面、到達経路と生死

到達経路は3つしかない。
**① NavBar に直接ある（3画面だけ）／② `ProcurementTabs` の4グループ／③ 他画面からのリンク**

### NavBar に載っている3画面

| ルート | チャンネル |
|---|---|
| `/admin/procurement` | `admin.procurement`（Requests。タブ帯の親でもある） |
| `/admin/procurement/receipt-log` | Receipt Log |
| `/store/procurement` | `store_procurement` |

**他の35画面は NavBar に無い。** 孤児ではなく、タブ帯とリンク経由。
`src/lib/access-channels.ts` にも同じ3つしか無い。

### ProcurementTabs の4グループ（`src/components/ProcurementTabs.tsx`）

`accessLevelFor()` が `staff` / `manager` / `inventory` / `full` を決める。
**`full` = HQ・ADMIN・DUBAI_MANAGEMENT・MANILA_MANAGEMENT のみ。**

| グループ | タブ | 見える人 | 状態（実測） |
|---|---|---|---|
| **Operations**「Daily work」 | Hub | manager, full | 生きている |
| | Requests | 全員 | 生きている（30日890件） |
| | Order Grid / CK/WH Grid | staff〜/ manager〜 | 未計測 |
| | **Needs My Approval** | 全員 | 生きている（バッジあり） |
| | Item Price Search | 全員 | 未計測 |
| | Quotes | manager, full | **`proc_vendor_quotes` 0行** |
| | PO | manager, full | 生きている（30日795件） |
| | CK Orders / Direct Purchases | manager, full | CK_SUPPLIER_ORDER_MAP.md 参照 |
| | Receipt Log | manager, full | 生きている |
| | Confirm Delivery | manager, full | 生きている（30日686件） |
| **Financials**「Billing & payments」 | **PO Match** | inventory, full | **⚠️ マニラで停止（§3.2）** |
| | Invoices | inventory, full | **`proc_invoices` 0行** |
| | Intelligence | inventory, full | 未計測 |
| | **Claims** | **full のみ** | **⚠️ 完全停止（§3.1）** |
| | Payments | inventory, full | **`proc_payments` 0行** |
| | Supplier Price Checks | inventory, full | `proc_price_check_tasks` 0行（バッジは別ソース） |
| **Analytics**「KPI & risks」 | Dashboard | inventory, full | 未計測 |
| | KPI | full | **`proc_kpi_monthly` 0行** |
| | Scorecards | full | 未計測 |
| | Stock Risk | full | **`proc_stockout_risk_snapshots` 0行** |
| **Admin**「Config & audit」 | Vendors | full | 64行・9月も追加あり |
| | Ingredients / Order Catalog | full | catalog 1,583行 |
| | Delivery Schedule | full | **`proc_delivery_schedule` 0行** |
| | Branch Addresses | full | 13行（6月で更新停止） |
| | Approval Matrix | full | 4行（閾値の正） |
| | Imports | full | 3月で停止（`proc_order_import_rows` 114,486行は過去データ） |
| | Emergency Vendors | full | **`proc_emergency_whitelist` 0行** |
| | **Alerts**（exceptions） | full | **生きている**（Yuri が87件処理） |
| | Audit | full | 28,405行・毎日記録 |

### store 側（`/store/procurement` から）

| ルート | 用途 |
|---|---|
| `/store/procurement/request` | 発注フォーム（`?edit=` で編集） |
| `/store/procurement/receiving` | 受領確認 → **ここが Claims を自動生成する** |
| `/store/procurement/claim` | 店舗からのクレーム申告 |
| `/store/procurement/wh-delivery/[id]` | WH 納品 |

⚠️ **4つとも NavBar にも access-channels にも無い。** リンクからしか行けない。

---

## §3 動いていない2つ — 毎日入って、出ていかない

判定は**コホート**で行う。「今何件あるか」ではなく
**「その週に入った行のうち、何件が出ていったか」**で見る。

### §3.1 Claims — 4ヶ月で1,190件、処理**0件**

```
proc_claims:  1,190行  全件 status='OPEN'
              resolved_at / assigned_at / escalated_at / resolution_note  → 全件 NULL または空
              直近10週で890件作成、クローズ 0件（週ごとに1件も無い）
```

| | 件数 | 金額 |
|---|---:|---:|
| マニラ SHORTAGE | 193 | **₱610,158** |
| マニラ EXCESS | 103 | ₱62,341 |
| ドバイ SHORTAGE | 498 | AED 119,312 |
| ドバイ EXCESS | 396 | AED 7,773 |

**関門を全部評価した結果（ひとつ目の説明で止めない）:**

| 関門 | 判定 |
|---|---|
| 画面はあるか | **ある** — `/admin/procurement/claims`（602行）。assign / resolve / escalate の3操作を実装済み |
| 到達できるか | **できる** — Financials → Claims |
| 誰が見えるか | **`showTo: ["full"]`。** HQ・ADMIN・両 MANAGEMENT だけ。**作っている店舗側も、請求書を入力している inventory ロールも見えない** |
| 件数を知らせるか | **知らせない。** `ProcurementTabs.tsx` の `badgeMap` は hub / approval-inbox / exceptions / price-checks / invoices の**5つだけ**。Claims は入っていない。worker にも Discord 通知にも無い |
| 誰かに割り当たるか | **割り当たらない。** `assigned_to` は1,190件すべて空。自動割当は無い |
| 出口の重さ | **3操作すべて `_require_action_with_pin`。** 承認者名＋PIN が要る（`app/main.py:32239 / 32288 / 32337`）。**教訓77と同型**（Prep Time が同じ理由で確認0件だった） |
| 入口の重さ | **ゼロ。自動生成。** 受領確認時に欠品・過剰・品質NGがあれば無条件で1件作る（`app/main.py:29411`）。請求書照合が hold でも作る（`:33428`） |
| 閾値 | **無い。** ドバイは663件（74%）が100未満。**教訓39と同型** |

**つまり：入口は自動で無料、出口は人手でPIN付き、件数は誰にも表示されない。**
この3つが揃えば溜まる。**1,190件はその必然の結果であって、誰かの怠慢ではない。**

⚠️ **「PINを外す」だけでは直らない。** 誰も件数を知らないので、外しても開かれない。
**バッジ・宛先・閾値の3つが同時に要る。**

### §3.2 PO Match（請求書照合）— マニラが8月中旬から停止

`proc_po_invoice_checks` は店舗/BOが請求書を入力 → PENDING で着地 →
`finalize` で MATCHED か DISCREPANCY に変わる、という流れ。

**DISCREPANCY は機能している**（227件中226件が resolved）。**PENDING が出ていかない。**

週ごとの「入った件数 → PENDING を出た件数」:

| 週 | ドバイ | マニラ |
|---|---|---|
| 08-03 | 72 → 50 (69%) | 49 → 36 (73%) |
| 08-10 | 83 → 0 | 73 → 0 |
| 08-17 | 82 → 78 (95%) | 40 → 1 |
| 08-24 | 72 → 72 (100%) | 50 → 0 |
| 08-31 | 38 → 8 | 56 → 1 |
| 09-07 | 160 → 3 | 70 → 0 |
| 09-14 | 75 → 3 | 71 → 4 |
| 09-21 | 143 → 40 (28%) | 70 → 0 |

現在 PENDING **907件**（ドバイ470・マニラ437）、平均19〜23日、274件が30日超。

**原因は画面ではなく人の割当。**

| 関門 | 判定 |
|---|---|
| Pending キューは画面にあるか | **ある** — `/admin/procurement/po-match` が `/procurement/po-match/pending?limit=500` を読む |
| 一覧に出るか | 出る。ただし**通常一覧からは PENDING を明示的に除外**している（`app/db.py:65738`「they belong in the pending queue」） |
| バッジはあるか | **無い。** PO Match タブにバッジ定義が無い |
| 入力する人 | ドバイ2名、**マニラ8名**（Daisy Rose・Victoria・Reymar・James Ray ほか。今日も入力あり） |
| finalize する人 | **Aliana Manuel ただ1人**（ドバイ197件・マニラ11件）。マニラは他に Erica が3件のみ、最終 9/17 |

**マニラは入力者が8人いて、処理する人が0人。** ドバイは同じ画面で回っている。
**コードの不具合ではない。**

---

## §4 データが1行も無いページ（7つ）

画面は存在するが、テーブルが空。**「壊れている」のではなく「まだ始まっていない」。**
次に触る人が「動いていない」と誤診しないように列挙しておく。

| ページ | テーブル | 行数 |
|---|---|---|
| Invoices | `proc_invoices` | 0 |
| Payments | `proc_payments` | 0 |
| KPI | `proc_kpi_monthly` | 0 |
| Quotes | `proc_vendor_quotes` | 0 |
| Stock Risk | `proc_stockout_risk_snapshots` / `proc_risk_lab_settings` | 0 |
| Delivery Schedule | `proc_delivery_schedule` / `proc_delivery_alert_log` | 0 |
| Emergency Vendors | `proc_emergency_whitelist` | 0 |

他に空のもの: `proc_improvement_actions` / `proc_item_benchmark_master` /
`proc_price_baselines` / `proc_price_check_rules` / `proc_price_check_tasks` /
`proc_request_alerts`。

⚠️ **請求書は `proc_invoices` ではなく `proc_po_invoice_checks` に入っている。**
テーブル名で判断すると必ず外す。

---

## §5 バッジの配線 — 画面が期待する15項目のうち、届くのは3項目

`ProcurementTabs.tsx` は `BadgeSummary` として**15フィールド**を読む。
実際に値が来るのは**3つだけ**。

```
/api/admin/procurement/badge-summary
  ├─ src/app/api/admin/procurement/badge-summary/route.ts   ← ★これが応答する
  │     3つの別APIを呼んで6フィールドを自分で組み立てる
  └─ app/main.py:25674（Heroku側の同名エンドポイント）        ← ★呼ばれない
        get_proc_badge_summary() が action_needed_count 等を返すが届かない
```

**教訓19と同型** — Next の個別ルートが catch-all より優先されるので、
バックエンド側を直しても画面には出ない。

| フィールド | 供給元 | 実際の値 |
|---|---|---|
| `incoming_requests_count` | Next route が承認キューを数える | **有効** |
| `issue_count` / `issue_critical_count` | Next route が exceptions を `status=OPEN` で数える | **有効** |
| `price_check_pending_count` | catalog-drift の total | **有効** |
| `action_needed_count` | どこからも来ない | **常に0** |
| `invoice_alert_total` ほか invoice 系5つ | どこからも来ない | **常に0** |
| `new_vendor_alert_count` ほか3つ | どこからも来ない | **常に0** |

⚠️ **`action_needed_count` を配線しても今は0のまま。**
条件は「cash/ec/prepaid の承認済み」だが、その3種は**全期間で6件・直近30日0件**。
「配線が切れている」を「仕事が隠れている」と読み替えないこと。

⚠️ **Heroku側 `get_proc_badge_summary` は `e.status = 'new'` で例外を数えている**
（`app/db.py` 内）。実際の値は `OPEN` / `REVIEWED` / `CLOSED` なので**常に0**。
今は使われていないので実害は無いが、**このエンドポイントに切り替えた瞬間に
Alerts バッジが消える。**

⚠️ グループのバッジは**合計を「9+」で打ち止め**にする。128件も9件も同じ表示になる。

---

## §6 生きているものの確認（誤って「壊れている」と書かないために）

直近30日の実測。**これらは正常に動いている。**

| 何 | 実測 |
|---|---|
| 発注 | 913件（ドバイ625・マニラ288） |
| 承認ケース | 894件作成・871件 APPROVED |
| PO | 795件作成 |
| PO メール送信 | SENT 563 / RECEIVED_CONFIRMED 230 / FAILED 9 |
| 受領 | 686件・明細5,833行 |
| ケース上のやり取り | 1,196メッセージ / 605ケース |
| 仕入先請求書の同期ジョブ | COMPLETED 270 / FAILED 4 |
| 例外検知 | 307件発生・**Yuri Yamada が87件クローズ**（9/4〜9/26） |
| 監査ログ | 6,994行 |

### 承認ケースの滞留512件は「過去の山」

`proc_approval_cases` の `IN_REVIEW` 512件のうち:
- **334件は request 側が既に APPROVED**（ケースだけ閉じていない／memory の既知issue）
- 173件は request も IN_REVIEW（本当に未処理）
- **最新でも 2026-08-20。直近30日の新規は0件** → 8月下旬に何かが直っている

**毎日増えているわけではない。** 掃除の対象であって、機能不全ではない。

---

## §7 再測定のしかた

```bash
cd /Users/jaynishimura/Desktop/sushizen_shift_app_clean
export DATABASE_URL=$(heroku config:get DATABASE_URL -a sushizen-shift-app)
```

**キューが生きているかは、残高ではなくコホートで見る:**

```sql
-- その週に入った行のうち、何件が出ていったか
SELECT date_trunc('week', created_at)::date wk, city, count(*) entered,
       count(*) FILTER (WHERE match_status <> 'PENDING') finalised
  FROM proc_po_invoice_checks
 WHERE created_at >= NOW() - INTERVAL '10 weeks'
 GROUP BY 1,2 ORDER BY 1,2;

SELECT date_trunc('week', created_at)::date wk, count(*) created,
       count(*) FILTER (WHERE status <> 'OPEN') closed
  FROM proc_claims WHERE created_at >= NOW() - INTERVAL '10 weeks'
 GROUP BY 1 ORDER BY 1;
```

**画面が誰に見えるかは `ProcurementTabs.tsx` の `showTo` を読む。**

`access_control.py` に登録されている procurement のチャンネルは**2つだけ**で、
どちらも `route_match: "prefix"`:

| channel_key | route_path | 権限 |
|---|---|---|
| `store_procurement` | `/store/procurement` | `channel.store_procurement.view` |
| `admin.procurement` | `/admin/procurement` | `channel.admin.procurement.view` / `.manage` |

つまり **Role Management で制御できるのは「配下ぜんぶ」か「ぜんぶ無し」かの2択**で、
サブページ単位の可否は**タブ帯のコードにしか無い**。

⚠️ **`channel.admin.procurement.manage` を持っていても Claims は見えない。**
`accessLevelFor()` はこの権限を `inventory` に落とし、Claims は `showTo: ["full"]`。
**Role Management で権限を足しても、このタブだけは出ない。**

---

## §8 次に直すなら（着手していない・オーナー判断待ち）

1. **Claims にバッジと宛先を付ける。** PIN を外すのは同時にやる。
   片方だけでは動かない（§3.1）。閾値も要る — ドバイの74%は100未満。
2. **マニラの PO Match に担当を決める。** コードは動いている。
   Aliana さん1人が両都市を見ていて、マニラが落ちている。
3. `proc_approval_cases` の滞留512件を掃除（334件は request 側が既に承認済み）。

**1と2はコードの問題と運用の問題が半々。** 実装だけで解決すると考えないこと。
