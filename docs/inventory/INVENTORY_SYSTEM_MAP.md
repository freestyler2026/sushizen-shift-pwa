# 在庫システム全体像 — 触る前にこの1本を読む

**2026-09-27 作成。** 在庫まわりは「同じことを言う仕組みが4つある」状態で、
どれを正とするかを確かめずに答えると必ず外す。全コードを読む必要はない。
**§0 と §1 と、触る画面の節だけ読む。数字を報告する前に §8 の検算を通す。**

検証方法: コードは `path:line` で引用、数値は**本番DBで実測**（2026-09-27）。
推測は「未確認」と書いてある。**書いていないものは実測値。**

---

## §0 いちばん大事なこと — 在庫には「4つの別システム」がある

**「在庫」という1つの仕組みは存在しない。** 目的も、item の語彙も、単位も、
書く人も違う4系統が並走していて、**互いに突き合わせるコードはどこにも無い。**

| # | 系統 | 在庫数の出どころ | 主テーブル | 30日の書き込み | 実質の用途 |
|---|---|---|---|---|---|
| A | **永久棚卸台帳** | 直前行の `balance_qty_after` + delta | `inv_stock_ledger` | **294,483行** | **数字は壊れている（§2）** |
| B | **CK/WH の理論値差分** | 最終カウント + それ以降の調整をPythonで合算 | `ck_stock_counts` / `wh_stock_counts` | WH 275行 / CK 0行 | WHのみ生存 |
| C | **CK セッション棚卸** | 理論値なし。**数えた値そのもの** | `ck_inventory_sessions` / `_entries` | 16セッション / 2,640行 | **CKで実運用中** |
| D | **Daily Inventory** | 理論値なし。**数えた値そのもの** | `daily_inv_reports` / `daily_inv_entries` | 121報告 / **14,114行** | **店舗で実運用中・発注の入力** |

- A は `app/inventory_db.py`、C は `app/db.py:58827+`、D は `app/db_daily_inventory.py`。
- **C と D は同じ `daily_inv_report_items` を item マスタとして共有している**
  （`app/db.py:59011-59080` が `is_commissary=TRUE` で書く）。他は共有していない。
- **現場が毎日使っているのは C と D だけ。** A は自動で減り続けるだけ、B の CK 側は0行。

### par level も4つある（相互参照なし）

| par | テーブル / 列 | 誰が使うか |
|---|---|---|
| 1 | `inv_items.par_level` / `minimum_level` / `maximum_level`（`inventory_db.py:255`） | A系。実質未使用 |
| 2 | `inv_item_levels_by_branch`（`inventory_db.py:314`） | **0行** |
| 3 | `daily_inv_par_patterns`（`db_daily_inventory.py:812`） | Daily Inventory の曜日別par |
| 4 | `backup_par_levels`（`app/db.py:73463`） | Backup Report の判定。376行 |
| (5) | `ck_par_levels`（**dubai 345 / manila 468**・city列あり・支店なし） / `store_supplier_catalog.par_level` | CK発注 / 店舗自動発注 |

⚠️ **2026-10-02 訂正: `store_supplier_catalog` に `par_level_weekday/weekend` は無い。** 実際の列は `par_level` 1本（実測）。`/admin/store-par-levels` が書くのはこれで、**`STORES=["PAR","CUB","TAFT"]` をベタ書きしており city の概念が無い**。各店22品のみ。

⚠️ **`daily_inv_par_patterns` の曜日は Sunday / Thursday / Tuesday の3つだけ**（実測）。「曜日別」ではなく**納品日別**。

**「par を直してください」と言われたら、まずどの par かを確定させる。** 6箇所ある。

⚠️ **店舗の par は 3 が正。** `daily_inv_report_items.par_level`（全店共通・241品目）
ではなく、`daily_inv_par_patterns` の **`WAREHOUSE_<曜日>` を土台に
`<支店>_<曜日>` で上書き**したもの。入力画面が使っているのがこちらで、
在庫表示が master の方を読むと**同じ品で「par割れ」の件数が画面ごとに変わる**
（実測: TAFT で 113件 → 正しくは 76件）。読むときは必ず
`db_daily_inventory.par_for_branch_on_date()` を通す。

---

## §1 最初に間違える6つ

### 1. 「在庫数」を `inv_stock_ledger` から答えてはいけない

**この台帳は一方通行で、入荷が一度も入っていない。**

| 向き | 行数 | 合計qty |
|---|---:|---:|
| OUT（−） | **359,127** | −25,121,675 |
| IN（+） | **56** | +15,602 |

入庫を書く関数は `close_inv_count` / `close_inv_spot_check` / `close_inv_transfer` /
`close_inv_production` / `close_inv_quantity_adjustment` の5つで、**対応する表は
全部0行〜数行**（§3）。

⚠️ **2026-09-27 に受領→台帳の経路を足した（§3.5）が、まだ1行も入っていない。**
`RECEIVING_LEDGER_ENABLED` が既定 OFF で、期首残高（A-2）を置くまで入れても
残高は正しくならないため。**上の数字（入庫56行）は、この節を読む時点でも
実測し直すこと** — §8 のクエリで1本。

結果、最新残高は全拠点でほぼ全品マイナス:

| 都市 | 支店 | 品目 | マイナスの品 | 最悪値 |
|---|---|---:|---:|---:|
| manila | TAFT | 219 | **219 (100%)** | −790,903 |
| manila | CUB | 188 | **188 (100%)** | −3,501,585 |
| manila | PAR | 184 | **184 (100%)** | −1,311,947 |
| dubai | AL_BARSHA | 382 | 372 (97.4%) | −316,612 |

**`/admin/inventory/ledger` と `/balances` が出す数字は現状すべて無意味。**
画面には何の注意書きも無い。

### 2. `inv_stock_balance_daily` はほぼ書かれるだけ

30日で30,573行書かれている（`_inv_refresh_daily_snapshot`, `inventory_db.py:1352`）。
読むのは2箇所だけ — item 統合の後始末 `_inv_merge_inv_stock_balance_daily`
（`inventory_db.py:3410`）と、2026-09-27 に足した `inv_ledger_health`
（マイナスの割合を数えるため）。**残高の読み取り本体**
（`list_inv_stock_balances`, `inventory_db.py:5558`）は台帳の最新行を見るので、
この表は通らない。

### 3. item の名前空間が4つあり、ほとんど繋がっていない

90日実測（正規化して突合）:

| | 名称数 | `inv_items`(manila) と一致 |
|---|---:|---:|
| `daily_inv_report_items`（有効） | 284 | 115 (40%) |
| `backup_report_lines` | 71 | 14 (20%) |
| `disposal_report_lines` | 201 | 29 (14%) |
| `inv_items`(manila, ACTIVE) | 285 | — |

`daily_inv` と `backup` の重なりは **10語だけ**。
**名前で繋がると仮定したクエリは、7〜8割を静かに落とす。**

### 4. 単位は保存されているが、計算に一度も使われていない

- `inv_items.storage_to_ingredient`（仕入単位→レシピ単位の換算率, `inventory_db.py:261`）は
  **保存・API往復のみで、掛け算も割り算も1箇所も無い**（全文grepで演算子との共起ゼロ）。
- `_expand_cost_calc_bom`（`inventory_db.py:5645-5651`）は `mc.quantity` をそのまま
  数量として扱い、**`mc.unit` と `ingredient_master.unit` の一致を検査しない。**

⚠️ **2026-10-06: その結果、`inv_items.ingredient_unit` が実データと食い違っていた。**
消費のある182品のうち**27品**（消費原価の43%）で、レシピが `g` と書いているのに
item 側が `KG` / `CAN` / `PKT` / `1000.0`（単位欄に換算率が入っていた）だった。
**最大の SALMON がその筆頭**で、599,044 という数字に `KG` と書いてあった（実体は 599kg）。

判定はデータだけで付く。**`cost × 1000` がカタログの ₱/kg と一致すれば、`cost` は
グラム単価であり数量もグラム**。16品が 0.8〜1.7倍で一致し（PEPPER BLACK POWDER は
578.9 対 578.95 で 1.00倍）、缶・パック品は「カタログ価格 ÷ cost×1000」で1個あたりの
重量を逆算して規格と照合した（VEGETABLE OIL 15.2kg/缶・SWEET CORN 247g/缶の固形量）。

**25品を修正済み**（`ingredient_unit` のみ。`cost` と `storage_unit` は未変更、
退避 `_inv_items_unit_bk_20261006`）。残り2品は保留:
- `SHICHIMI TOGARASHI` — 受領単価 ₱45/PKT が同じ品の他の行（₱180・₱278）と矛盾し、根拠にならない
- `STAR ANISE` — **レシピ側が2行で単位が違う**（menu 4462 が 8 `pc`、menu 3953 が 2 `g`）。
  item 側の `g` は正しく、これは「食い違い」ではなく**レシピ内の正当な使い分け**の可能性がある

⚠️ **名前で UPDATE してはいけない。** `SALT` と `Soy Sauce Tray` は inv_items に
同名2行（ACTIVE と DELETED）があり、しかも**DELETED 側は既に正しい単位を持っていた**。
台帳が参照しているのは ACTIVE 側。**id を台帳から引いてから更新する。**
- ~~`disposal_report_lines.unit` を `sync_disposal_report_to_ledger` が参照しない~~
  → **2026-09-27 修正済み（§2）。** いまは `menu_item_master.output_qty/output_unit`
  へ換算してから BOM に渡し、換算できない組み合わせは書かずに理由を返す。
- 唯一の単位正規化SQL `_QTY_NORM_SQL` / `_UNIT_NORM_SQL`（`app/db.py:73432-73447`）は
  **Backup par の検出処理専用**で、台帳にも BOM にも Daily Inventory にも効かない。

### 5. 認証は「ログイン必須」まで。権限チェックは画面によって無い

⚠️ **「認証が無い」と読み違えないこと。** `_AUTH_GATES`（`app/main.py:1356-1359`）が
`/api/admin/` と `/api/store/` の両方に掛かり、**本番はどちらも `enforce`**
（`heroku config` で確認済み。`ADMIN_AUTH_GATE=enforce` / `STORE_AUTH_GATE=enforce`）。
許可リストに在庫系のパスは無い。**未ログインでは到達できない。**

その上で、**権限**は次のとおり抜けている（＝ログインできる全員が通る）:

| 対象 | 実際 |
|---|---|
| `/api/admin/management/par-levels` GET/POST/DELETE/seed/confirm-matching（`main.py:58447-58530`） | **actor を一切見ない。** Backup par を誰でも書き換え・全件seed できる |
| `/api/store/ck-inventory/*` の items CRUD・`sessions/{id}/entries`（`main.py:29907-30020`） | actor を見ない。**棚卸の数値保存が権限チェック無し** |
| `/api/daily-inventory/save` `/submit`（`daily_inventory_api.py:683, 702`） | **書き込みなのに `permission="inventory.read"`** |
| `/admin/ck/par-levels` ページ | ページ内に権限チェック0箇所（APIは `_actor` あり） |
| `/admin/daily-inventory` ページ（`page.tsx:40-64`） | ログイン確認のみ。`canAccessDailyInventoryAdmin` を呼んでいない |
| `/admin/disposal` `/admin/backup` ページ | ページ側ゲート無し（バックエンドのロール判定のみ。実質「全スタッフ可」） |

**塞ぐ前に実績で誰が使っているか数えること**（教訓32・57）。この一覧は「塞げ」ではなく
「ここは開いている」という事実。

### 6. ~~`ensure_ck_inventory_tables()` はリクエストごとにDDLを流す~~ → 2026-09-27 修正

`app/db.py`。**メモ化フラグが無い**まま `ck_inventory_*` の全10関数から呼ばれ、
毎回 8本の接続で `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` ×7 と
`CREATE TABLE/INDEX IF NOT EXISTS` を実行していた。**教訓85そのもの**で、
**CKが棚卸しの数値を保存するたび**に通る経路だった。`inventory_db.py` と
`db_daily_inventory.py` は最初から `_READY` フラグで1回に抑えており、
**CKだけが抜けていた。** いまは同じ形（`_CK_INVENTORY_TABLES_READY` ＋ ロック、
フラグは DDL がコミットした後に立てる）。

---

## §2 Disposal の単位 — 2026-09-27 に修正済み（履歴は未訂正）

**何が壊れていたか。** `sync_disposal_report_to_ledger` が
`disposal_report_lines.quantity` を**単位を見ずに** BOM 展開へ渡していた。
`_expand_cost_calc_bom(menu_item_id, quantity=N)` の N は「レシピ何回分」なので、
1レシピ 3,145 g の酢飯を「23,546 g 廃棄」と入れるとレシピ 23,546 回分になる。

- 実測: DISPOSAL 由来の台帳行は **901行で合計 −11,700,029**
  （CONSUMPTION 361,250行で −13,421,646）。**行数0.25%で削減量の47%。**
- 最大の1行: CUB 2026-09-09 `Sushi Rice 2` で **−1,836,099**。
- 90日の実データで空回しすると、メニュー品の合計は
  **52,198 レシピ回分 → 742.70 レシピ回分**（70倍の過大計上）。

**直した内容**（`app/inventory_db.py:_disposal_recipe_batches`）:
- メニュー品は `menu_item_master.output_qty` / `output_unit` へ換算してから割る。
- 材料は `ingredient_master.unit` へ換算する（**従来は換算ゼロ**で、
  「AVOCADO 1.125 kg」が 1.125 g として引かれていた）。
- 換算できない組み合わせは**推測せず書かない**（90日で20行）。理由を
  `not_posted` で返し、提出した本人の画面に品名つきで出す。
- 台帳の note に `[entered 23546 g]` を残す。単位を取り違えた行は換算後の
  数字だけでは気づけないため。
- 単位の同一視は `app/units.py` に集約（`ck_par_level_api` から移設・再輸出）。
  `tests/test_disposal_units.py` と既存の `tests/test_ck_par_stock_units.py` が縁を固定。
- 入力側: `search_disposal_items` が全メニュー品に `'pcs'` を固定で返していた
  （`app/db.py:50685`）のを、その品の `output_unit` ＋ `output_qty` に。
  画面は**その品について台帳が換算できる単位だけ**を出す
  （その品の単位／g↔kg・ml↔L／1レシピ=1個なら pcs）。既定はその品の単位。
  ⚠️ **一度「単位を固定」にしたが、それは行き過ぎだった。** 過去90日の
  141行のうち**71行しか元の単位で打てなくなった**（寿司ボックスを box と
  数える、hosomaki を pcs と数える等）。選べる形に戻して120行。
  **打てない入力を作ると、現場は品名の手入力へ逃げる＝在庫を動かさない行が増える。**

⚠️ **既存の901行は直っていない。** 台帳の鍵は
`uuid5(report_id, line_id, item_id)` ＋ `ON CONFLICT DO NOTHING` なので、
**再syncしても正しい行に置き換わらない**（実測: 報告808で再実行 → 増減0行）。
履歴の訂正は別の破壊的操作で、オーナーの判断が要る。

⚠️ **kg を選んで g を打った行は、正しく換算すると1000倍になる。**
90日で6行（AVOCADO 11,961 kg = ₱4,271,785 など。明細1行の金額は
中央値 ₱21.65 / p95 ₱492）。上限は設けていない（頼まれていない既定値は
仕様になる／教訓123）。画面から単位の選択を外したので新規では起きない。

**マスタと現場の数え方が食い違う品（21行分・Cost Calculation 側の修正が要る）**:
`Milk Fish Tempura`（1レシピ45g・現場は個数）/ `Best Value Sushi Box 12pcs`
（マスタ set・現場は box）/ `Shrimp Tempura for ROLL`（マスタ pc・現場は g）など。
**画面で辻褄を合わせない** — 1個が何グラムかはその行からは決まらない。

同じ画面の入力品質（90日）— **こちらは未対応**:
- 行の **59.7%（293/491）が `item_id` NULL**＝マスタに繋がらない自由入力。
  記録には残るが在庫は動かない。画面に "not in stock list" と出るようにしただけ。
- 491行に対し**異なる名称が213個**。

---

## §3 生きている画面・死んでいる画面（30日実測）

### 毎日使われている（＝壊すと即止まる）

| 画面 | 実測 | 誰が |
|---|---|---|
| `/admin/daily-inventory` | 121報告 / **14,114行**（1報告あたり約117項目） | 店舗スタッフ。Mary Jane 3,403行 / Reymar 2,428行 / James Ray 2,212行 |
| `/admin/backup` | 207報告 / 10,913行（1報告45〜59行、1日2.2〜2.6回） | 店舗スタッフ12名以上 |
| `/store/ck-inventory` | 16セッション / 2,640エントリ（1回約206品） | CKの Gerald Solomon 他4名 |
| `/admin/disposal` | 87報告 / 237行 | 店舗スタッフ |
| `/store/ck-production-plan` | 13計画 / 380行 | CK |
| `/admin/inventory/wh-inventory` | `wh_stock_counts` 275行 | **1名のみ** |

### タブから外したもの（2026-09-27・**コードとルートは残っている**）

一覧から外しただけで、URL を直接開けば今も使える。使い始めるときは
`src/components/InventoryTabs.tsx` に行を戻す。

| 外した | 根拠 |
|---|---|
| Transfer Orders | `inv_transfer_orders` / `inv_transfers` が開設以来 **0行** |
| Quantity Adjustments | `inv_quantity_adjustments` **0行** |
| Cost Adjustments | `inv_cost_adjustments` **0行** |

⚠️ **Full Inventory Count は外していない。** 行数だけ見ると止まって見えるが、
2026-09-08 に TAFT で **7件（23分・同じ人・全部0品目）**作られている。
「使われていない」ではなく**「使おうとして進めなかった」**。同じ理由で
CK Production（2026-06 に6件・全部DRAFT）と Quick Spot Check（2026-03 に4件・
CLOSED まで到達）も残した。

### Full Inventory Count が進まない理由（2026-09-27 調査）

1. **画面側の不具合（修正済み）**: ヘッダと品目を別々の要求で書いていたので、
   品目が落ちるたびに空のカウントが1件残った。**7件はその痕跡。**
   いまは1回の要求で書き、失敗したらヘッダも残さない
   （`discard_empty_inv_count` は **DRAFT かつ0品目のときしか消さない**）。
2. **データ側（未対応・コードでは直らない）**: **TAFT に 15TH のカウント
   テンプレートが無い。** 唯一の TAFT シートは MONTH_END の
   「Paranaque Month End 2026-04-28」の写しで**3品目**。
   PAR は 15TH に160品目のシートがあり、だから5〜6月の PAR は SUBMITTED まで
   到達している。**誰かが TAFT / CUB の 15TH シートを作る必要がある。**

### 作ってあるが実質ゼロ

| テーブル | 全行 | 最終書き込み |
|---|---:|---|
| `inv_transfers` / `inv_transfer_orders` / `_items` | **0** | — |
| `inv_quantity_adjustments` / `inv_cost_adjustments` / `_items` | **0** | — |
| `inv_item_levels_by_branch` | **0** | — |
| `ck_stock_counts` / `ck_stock_adjustments` / `wh_stock_adjustments` | **0** | — |
| `inv_spot_checks` | 4 | 2026-03-30 |
| `inv_productions` | 56 | 2026-06-30 |
| `inv_counts` | 32（2026-09は7件**全部DRAFT**） | 2026-09-08 |
| `inv_count_items` | 2,803 | 2026-06-29 |
| `inv_menu_recipes` | 7,263 | 2026-08-02 |

**`inv_counts` が DRAFT で止まっている＝唯一の閉ループ（§4）が閉じていない。**

### 導線が無い（URL直打ちでしか届かない）

- `/admin/inventory/recipes` — `InventoryTabs` にもハブのカードにも NavBar にも無い（grep で inbound 0件）。
- `/store/ck-production` — NavBar に無い（`access-channels.ts:119` に登録だけある）。

### ドバイはほぼ記録していない（30日）

Backup 3件 / Disposal 1件 / CKセッション 0 / Daily Inventory 0。
一方で台帳は AL_BARSHA 27,094行・JLT 2,246行を**削り続けている。**

---

## §3.5 受領 → 台帳（A-1・2026-09-27 実装・既定OFF）

```
proc_receivings ＋ proc_requests.city
   → レシピで消費される品だけ → inv_stock_ledger (event_type='RECEIVING')
```

- **レシピで消費される品だけ入れる。** 実測で、名簿にある受領の60%（金額41%）は
  台帳が一度も減らしていない品（紙袋・ステッカー・包材）。入れると
  「増える一方」になり、壊れ方が鏡写しになる。
- 90日の実測（都市別）: マニラ 6,339行中 **676行**、ドバイ 6,037行中 **1,880行**が入る。
- 入らない理由は3つに分けて名前で返す:
  `not_in_item_master` / `not_consumed_by_any_recipe` / `unit_not_convertible`。
- **単位の橋は `inv_items.storage_to_ingredient`。** 2026-09-27 までこの列は
  Items 画面が作成時に 1 を固定で書き、編集欄も無く、**計算に一度も使われて
  いなかった**。いまは入力でき、実際に換算に使われる。**空欄なら足さない**
  （20kg袋を「1」として入れると、その品だけ残高が2万分の1になる）。
- 答えてもらう問いは **マニラ36件 / ドバイ44件**（`1 PKT = ? G (MILK FISH)` の形）。
  単位そのものが数字・空の行（`1 5.75 = ? KG`）は `bad_units` に分け、
  人の一覧に混ぜない。
- 冪等: 台帳の id は受領明細の uuid5。何度流しても二重に入らない。
- **既定 OFF**（`RECEIVING_LEDGER_ENABLED`）。**期首残高（A-2）を置くまで、
  入れても残高は正しくならない。**

⚠️ **2026-09-27 に自分で入れて自分で直した不具合が2つ。**
① 都市で絞っていなかった（両都市とも全12,376行を見ていた）。`proc_receivings`
に city 列は無く、**`CK` は両都市に実在する**ので店名では絞れない。
`proc_requests.city` を辿る（教訓127と同型）。
② `store_code` は人の打った文字列で、`BB`/`B BAY`・`CUB`/`CUBAO` が混在する。
正規化せずに書くと1つの店が2支店として積み上がる（`_inv_canonical_branch`）。

## §3.6 Daily Inventory と Backup は二重入力ではない（2026-09-27 測定・C の結論）

統合しかけたが、**測ったらほとんど重なっていなかった。**

| | 品目数 |
|---|---:|
| Backup の品目（90日） | 82 |
| **Backup にしか無い** | **66** |
| 名前が重なる | 16 |

Backup 固有は `Base Roll 1〜11`・`Boiled Beansprout`・`Akadama`・`Box12 Set` —
**店で作った「出せる状態の在庫」**。Daily Inventory が数えているのは
**原材料と資材**。別の問いなので、統合すれば片方の意味が消える。

重なる16件（Bok Choy・Spring Onion・Sweet Corn 等）も、Backup 側の単位は
`container`/`pcs` で、生の kg とは状態が違う可能性が高い。**触る前に1品ずつ
「同じ状態のものを2回数えているか」を見ること。** 件数だけで統合しない。

## §3.7 par と min は互いに矛盾している（2026-09-27 測定）

**両方が設定されている312品のうち163品（52%）で `min_level` > `par_level`。**
`Coke Mismo` は min 10 に対し par 1、`Water Summit` も min 10 / par 1。
出どころが違う（min は `daily_inv_report_items` の全店共通、par は
`daily_inv_par_patterns` の支店×曜日）ため、誰も突き合わせていない。

**結果として「par割れ」は毎日 45〜69% の品が該当する**
（TAFT 76/167・CUBAO 116/167・PAR 78/165）。これは行動の一覧ではない。
在庫ゼロは1店あたり **11〜16品**で、こちらは閾値ではなく事実。

⚠️ **どちらも urgency の線には使えない。** 線を引きたくなったら、まず
この163品を直す。**画面側で percentage を発明して切らないこと**（教訓44）。

## §3.8 現場の1日（2026-09-27 実測）

| 画面 | 1店1日あたり | 備考 |
|---|---:|---|
| Daily Inventory | **177項目** | 1報告 60〜174分（CUBAO 平均174分）・1報告96〜141項目 |
| Backup Report | **122行** | 1日2回が要求（AM 11:30 / PM 18:00）・実際は行のある提出が 1.74〜1.84回 |
| Travel Path | 59行 | |
| Disposal | 3行 | |
| **合計** | **約361項目** | マニラ3店で1日 約1,083項目 |

⚠️ **「動かない項目を毎日数えている」は誤り（測って否定した）。** 60日で10回以上
数えた約182項目のうち、**値が半分以上の回で動いた項目が123〜144**。まったく
動かなかったのは**3項目だけ**（在庫ゼロのビール）。**項目を削って負担を下げる
案は成立しない。** 減らせるのは作業ではなく、返ってこない結果の方。

⚠️ **Daily Inventory の完走率は高い。** 90日で 321/331 が SUBMITTED（下書き放置は10件）。
入力が重いのは事実だが、途中で投げ出されてはいない。

## §3.9 Backup Report は2つの仕事を兼ねている（2026-09-27 発見・修正）

同じフォームが **①shift の在庫チェック** と **②サーモンの計量** を受ける。
②だけ出すと `backup_reports` の行はできるが `backup_report_lines` は0本。

**Required Reports は表に行があるかしか見ていなかったので、在庫チェックを
1品も出していない日が「AM/PM Backup Report 提出済み」と表示されていた。**
90日で **436件中12件**（全部 closing / TAFT 4・BB 4・CUB 2・PAR 1・CK 1）。
`requires_rows` を足して、行のある提出だけを数えるようにした
（`tests/test_required_reports_rows.py` が他の提出物に広がっていないことも固定）。

⚠️ **調査中に私が2回誤読した。** ①「行が0の提出48件」を現場がフォームを
埋められていない証拠と読み、担当者名まで挙げかけた。**47件はサーモンの提出**で、
フォームは最初から空提出を止めている。②「動かない項目が多い」と仮説を立てた
（上のとおり否定）。**どちらもクエリ1本で否定できた。数える前に人を疑わない。**

## §3.10 発注に単価が出ない3つの理由（2026-09-27 実測・Yusuke 報告）

棚卸し → 発注（`POST /api/daily-inventory/reports/{id}/generate-order`）で単価が
0 になるのは、**カタログに無いから**とは限らない。原因は3つあり、対応が全部違う。
「カタログに登録してください」と案内する前にどれなのかを見る（教訓97）。

| 理由 | 実測 | 見分け方 | 対応 |
|---|---|---|---|
| **名前が違う** | Mirin（棚卸し）vs `Mirin 1L`・`OZAKI HONMIRIN 18L`（カタログ）／Ajinomoto vs `Ajinomoto China` | 前方一致も効かない（残りが仕様の綴りでない＝別物） | どちらかの名前を寄せる。**綴りの揺れだけ寄せる。語が増えたら別物**（教訓92・`app/item_names.py`） |
| **単位が違う** | カタログに名前がある244件のうち **28件** | レスポンスの `price_unit_mismatch` | 棚卸しをカタログの単位で数える、または `package_spec` を埋める |
| **カタログに行が無い** | `Paper Bowl White 780(1PKT = 50pcs)` は `inv_items`（SK-3743・₱255）にあってカタログに1行も無かった | レスポンスの `unpriced` | カタログに1行作る |

### `package_spec` は単価の橋になる（2026-09-27 実装）

`proc_curated_catalog_items.package_spec`（702行中109行が記入済み）に
`<数字><単位>` が入っていれば、カタログ単位が棚卸し単位に換算できなくても
単価を割り出す。Salt = 1 SACK ₱400・`package_spec='25kg'` → **₱16.00/kg**。

- 受けるのは `25kg` `500g` `1kg` のような綴りだけ。`Half Bottle` `Paranaque`
  `500 pcs per bundle` `1Container` は**実在する値**で、推測で数に直さない。
- **カタログ単位が棚卸し単位に直接換算できるときは使わない**（KG の行の `25kg` は
  袋の中身なので、割ると 1/25 になる）。
- 28件のうち3件が単価を取り戻した（Salt / CURRY POWDER / Dried Shrimp）。
  残る25件は `package_spec` が空で、**発注のたびに画面が名前で列挙する**。

## §3.11 倉庫カタログは「1品1行」— 店舗別の行は品を消す（2026-09-27 修正）

店舗が倉庫から買う有効行は **60件**、そのすべてが

```
store_scope='ALL'  catalog_category='Warehouse'  order_type='WH_to_supplier'  supplier_name='Warehouse'
```

`GET /api/admin/procurement/requests/item-catalog` はこの4つ全部で絞るので、
**どれか1つ違うだけで、その品はどの店舗の Warehouse タブにも出ない。**

- 2026-09-27 修正前、`Onigiri Film (1PKT = 100PC)` は `store_scope='Paranaque'`・
  `catalog_category='Packaging'`・`order_type='WH'` の1行だけが有効で、
  **59件中この1件だけが形が違っていた**（＝プルダウンに出ない）。ALL/Warehouse/
  WH_to_supplier に直し、`Paper Bowl White 780(1PKT = 50pcs)` の欠けていた行を作った。
  退避は `_proc_catalog_bk_20260927`。
- **未解決**: `order_type='WH'` の品名 **38件**が3店舗そろって有効ではなく、**8件**は
  どの店舗でも有効行が無い。それでも店舗は90日で 100〜147 品を倉庫から注文しており、
  **23〜58 品がカタログを通らない経路で入っている**（自由入力・過去発注からの引き当て）。
  その行が単価0の発注になる。§3.10 と同じ根。

```sql
-- 形が違う行を出す（1件でもあれば、その品はどこかの店舗で見えていない）
SELECT btrim(item_name), store_scope, catalog_category, order_type, unit_price
  FROM proc_curated_catalog_items
 WHERE city='manila' AND active AND lower(btrim(supplier_name))='warehouse'
   AND (store_scope <> 'ALL' OR catalog_category <> 'Warehouse'
        OR order_type <> 'WH_to_supplier');
```

## §4 唯一の閉ループ

`inv_counts` だけが台帳と往復している:

1. `submit_inv_count`（`inventory_db.py:6064`）が `theoretical_qty` を
   `_inv_current_balance`（台帳の最新残高）から埋める。
2. `close_inv_count`（`inventory_db.py:6087`）が `variance_qty` を
   `COUNT_ADJUSTMENT` として台帳へ戻す。

**この往復が成立した実績は 2026-04-29 の55行のみ。** それ以降ゼロ。
B系（`get_ck_stock_view`, `inventory_db.py:7538-7549`）は Python で
「最終カウント+以降の調整」を組み立てる**完全に別の計算**で、A と突き合わせない。

---

## §5 データが実際に流れている経路（価値のある線）

```
Daily Inventory 入力 (daily_inv_entries)
        └→ db_store_supplier.generate_store_supplier_orders (db_store_supplier.py:510)
             └→ store_supplier_orders（scheduler が自動作成・30日で44件 received）
CK セッション棚卸 (ck_inventory_entries)
        └→ ck_par_level_api → CK発注・生産計画
Disposal 報告 → sync_disposal_report_to_ledger → inv_stock_ledger（§2の不具合あり）
Backup 報告 → backup_par_levels と名称で突合（70/71一致・ここは健全）
POS売上 → rebuild_inv_order_consumptions_from_pos → 台帳 CONSUMPTION
```

**2026-09-27 追加: 店舗の在庫表示（`store_stock_view`）**

```
直近のカウント（Daily Inventory）＋ そのカウント以降に着いた納品（受領）
  → /api/daily-inventory/stock?branch=  → Daily Inventory 画面の [Stock]
```

- **新しく数えさせるものは無い。** 既に毎日打っている数字を在庫として読むだけ。
- 受領の突き合わせ実測（マニラ3店・30日 2,865行）: **2,772行（96%）が
  品名一致＋単位換算に成功**。品名が無い78行・単位が換算できない15行は
  `unmatched_receipts` に名前で返す（`Sheet→PC`・`LTR→KG` 等）。
- 9/25 の実測: TAFT で **113品目**にカウント後の納品が足された。
- ⚠️ **消費（売れた分）は引いていない。** POS の明細と棚卸しの品名は別の名簿で、
  繋ぐと7〜8割落ちる（§1-3）。画面に「数えた時点＋その後の入荷であり、
  売れた分は引いていない」と書いてある。
- ⚠️ **ドバイには出ない。** 日次カウントが30日で0件なので読む元が無い。
  ボタン自体を出さない。

⚠️ **`daily_inv_entries` を読むのは `daily_inventory_api.py` と
`db_store_supplier.py` と `store_stock_view` の3つ。** 30日で188種類の item_code が
入力され、**発注に自動で繋がっているのは22種類**（`store_supplier_catalog.daily_inv_item_code`、
有効23・重なり22）。残り166種類は発注には繋がらないが、
**2026-09-27 以降は Stock 画面で在庫として読める。**

⚠️ 店舗コードが2系統ある: `daily_inv_reports.branch` は `TAFT/CUBAO/PARANAQUE`、
`store_supplier_catalog.store` は `TAFT/CUB/PAR`。変換は
`db_store_supplier._STORE_TO_BRANCH`。**直接JOINすると0件になる**（実際に私が一度外した）。

---

## §6 支店コードが汚れている — city 列も信用しない

`inv_stock_balance_daily` の最新行を支店別に出すと、**同じ店が2つのコードで存在**する:

- `CUB` と `CUBAO`、`PAR` と `PARANAQUE`、`ARJ` と `ARJAN`、`BB` と `BUSINESSBAY`
- **`city='manila'` に `AL_BARSHA`（ドバイの店）が59品ぶん入っている**

古い側（CUBAO/PARANAQUE/QC）は 2026-07〜08 で更新が止まり、新しい側が現役。
**支店で集計するクエリは、必ず正規化してから数える**（教訓96と同型）。

---

## §7 本番に残っているテスト行

`inv_stock_ledger` の `created_by`:

| created_by | 行数 | 期間 | 合計qty |
|---|---:|---|---:|
| `verify_test` | **38,150** | 2026-07-27〜08-02 | −1,284,688 |
| `verify` | **14,658** | 2026-08-31〜09-02 | −541,612 |
| `cursor-agent` / `Cursor Agent` | 109 | 2026-03 | −7,127 |

**合計52,917行**が本番の台帳に残り、残高を削っている（教訓38）。
`store_supplier_orders` にも `verify-fresh` 2件・`v` 1件がある。
**消すかどうかはオーナー判断。件数とIDを出してから消すこと（教訓54）。**

---

## §8 報告する前の検算

```bash
# 台帳が一方通行のままか（IN の行数が増えていれば状況が変わった）
SELECT CASE WHEN delta_qty>0 THEN 'IN' ELSE 'OUT' END, COUNT(*) FROM inv_stock_ledger GROUP BY 1;

# 現在の残高がマイナス何割か（拠点別）
WITH latest AS (SELECT DISTINCT ON (city,branch_code,item_id) * FROM inv_stock_balance_daily
                 ORDER BY city,branch_code,item_id,business_date DESC)
SELECT city,branch_code,COUNT(*),COUNT(*) FILTER (WHERE on_hand_qty<0) FROM latest GROUP BY 1,2;

# Daily Inventory の入力が発注に届いている割合
WITH typed AS (SELECT DISTINCT e.item_code FROM daily_inv_entries e
                 JOIN daily_inv_reports r ON r.id=e.report_id WHERE r.report_date>=CURRENT_DATE-30),
     used AS (SELECT DISTINCT daily_inv_item_code cd FROM store_supplier_catalog
               WHERE is_active AND daily_inv_item_code IS NOT NULL)
SELECT (SELECT COUNT(*) FROM typed),(SELECT COUNT(*) FROM used),
       (SELECT COUNT(*) FROM typed JOIN used ON used.cd=typed.item_code);

# Disposal の単位換算が効いているか。2026-09-27 以降に作られた行だけを見る
# （それ以前の901行は訂正していないので、全期間で見ると常に古い値が出る）
SELECT MIN(delta_qty), COUNT(*) FROM inv_stock_ledger
 WHERE event_type='DISPOSAL' AND created_at >= '2026-09-27';
```

`python3 scripts/verify-inventory-doc.py` が、この文書のコード側の主張
（単位換算が未使用・DDLの非メモ化・権限の欠落・孤立ページ）をコードと突き合わせる。
**コードを直したら、この文書と検査スクリプトも同じコミットで直す。**

---

## §9 変更するときの手順

1. **どの系統（A/B/C/D）の話かを先に確定する。** 「在庫」で始めない。
2. **その画面が実際に使われているか §3 で確認する。** 0行の機能を直すのは後回し。
3. **item を名前で繋ぐ実装を足さない。** §1-3 のとおり7〜8割落ちる。
   繋ぐなら `daily_inv_report_items.item_code` か `inv_items.id` を使う。
4. **数量を扱うときは単位列を必ず読む。** 現状ほぼ全経路が無視している（§1-4）。
5. 台帳に書く機能を足すなら、**入庫側も同時に入れる。** 片側だけ足すと §1-1 が悪化する。
6. マニラで確かめたことをドバイの根拠にしない（§3 — ドバイは記録自体が無い）。

## §10 未確認（この文書で答えていないこと）

- `inv_transfer_orders` と `inv_transfers` が別概念なのか二重実装なのか（どちらも0行のため判定せず）
- `salmon_yield` 系テーブルの正確な名称とDDL位置
- ドバイの `inv_items` 1,066件が何に使われているか（台帳の削減以外の用途）
- `/admin/inventory/productions`(2,316行) と `/store/ck-production-plan`(2,181行) の
  機能重複の有無
- 各画面の実測タップ数・所要時間（現場での受け入れテスト未実施）
