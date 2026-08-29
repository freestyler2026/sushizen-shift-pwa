# 引き継ぎ: Management Channel — 送信を実際に届くようにする

Session 2 → Session 1（2026-08-29）。**通知連携と当番表の新設が要るため移送。**
発端は西村さん自身が Send を押して「どこに送られたのか分からない」と気づいたこと。

---

## 一行でいうと

**Send は誰にも送っていない。** status を `sent` にして `task_messages` に1行書くだけで、
**宛先も通知も存在しない。**

そして**宛先を付けるだけでは直らない。** 今のまま配送を通すと担当1人に1日15通届き、
その4分の3は「写真1枚がC評価」で、受け取った側に次の動作が無い。**1週間で通知を切られる。**
そのとき今より悪くなる — 記録上は「送信済み」になり、Compliance Score の分母に入り、
**届いていないのに本人の点が下がる。** 今日クリアした90件と同じ構図が通知付きで再生産される。

→ **量を決める工程（Phase 0）を、配送より先に入れる。**

---

## 対象範囲 — マニラのみ（2026-08-29 西村さん判断）

TAFT / PAR / CUB / CK の4店舗。**ドバイ（BB / AM / ARJ / JLT / AB）は対象外。**
理由は「ドバイは営業4年目で安定している。まずマニラで試す」。

⚠️ ドバイでもタスクは生成され続ける（直近7日で72件）。**Phase 1 の「宛先が無ければ
Send を押せない」を全都市に効かせると、ドバイが恒久的に送信不可になる。**
ガードは `city='manila'` に限定し、ドバイは現状の挙動のまま残すこと。

---

## すぐ着手してよい

**未確定が3件あるが、どれも Phase 0・1・2 を止めない**（→ 末尾「未確定」）。
先に読むのはここまでの節と「決まっていること」「なぜ届かないか」で足りる。

### 最初の30分
1. 量を自分の目で確認する（下の SQL）。**ここを飛ばすと、なぜ Phase 0 が先なのか腹に落ちない**
   ```sql
   SELECT type, count(*), round(count(*)/7.0,1) AS per_day
   FROM management_tasks
   WHERE city='manila' AND created_at > NOW() - INTERVAL '7 days'
   GROUP BY 1 ORDER BY 2 DESC;
   ```
2. `management_tasks` に `manager_name` が入っていないことを確認
   （`SELECT count(*) FILTER (WHERE COALESCE(manager_name,'')='') FROM management_tasks`）
3. `app/db.py:62663` `create_task_message` を読む — INSERT して返すだけで通知が無い
4. 当番表テーブルを作り、下の表を投入（**画面から編集できる形にする。ハードコード禁止**）
5. タスク生成時に「日付の曜日 × 店舗」で `manager_name` を引く
6. 宛先が空なら Send を押せなくする（**マニラのみ**）

---

## 決まっていること（2026-08-29 西村さん回答・再確認不要）

### 担当マネージャー → **曜日で交代する当番表**

⚠️ **「店舗＝担当者1人」ではない。** `manager_name` は**タスクの日付から曜日を出して引く。**

| 店舗 | 月 | 火 | 水 | 木 | 金 | 土 | 日 |
|---|---|---|---|---|---|---|---|
| **TAFT** | Ayako Nishimura | Francis Ibana | Francis Ibana | Francis Ibana | Francis Ibana | Francis Ibana | Francis Ibana |
| **PAR** | Peter Villafuerte | Peter Villafuerte | Peter Villafuerte | Richard S. Gante | Peter Villafuerte | Richard S. Gante | Richard S. Gante |
| **CUB** | Richard S. Gante | Yusuke Uejima | Richard S. Gante | Yusuke Uejima | Richard S. Gante | Yusuke Uejima | Yusuke Uejima |
| **CK** | Richard S. Gante | Yusuke Uejima | Richard S. Gante | Yusuke Uejima | Richard S. Gante | Yusuke Uejima | Yusuke Uejima |
| **ALL** | 未定 | 未定 | 未定 | 未定 | 未定 | 未定 | 未定 |

原文: 「Taft➡️Francis（火〜日曜日）、月曜日とFrancisが休んだら私 /
Paranaque➡️Richard木、土日、残りはPeter / CK/Cubao➡️月水金Richard、火木土日植嶋さん」

⚠️ **原文の「私」＝西村さんは、2026-08-29 に `Ayako Nishimura` へ差し替え。**
理由は「開発と経営で店舗管理はできない」。**TAFT 月曜も、Francis 休務時の代理も Ayako。**
`Yukihiro Nishimura` は当番表に載せないこと。

**当番表は画面から編集できるようにする。** 人は入れ替わる。
置き場は `/admin/management/assignments`（BO側の担当割り当てが既にある画面）。

在籍確認済み（2026-08-29・全員 ACTIVE）:
`Francis Ibana`(MANILA_MANAGER) / `Richard S. Gante`(MANILA_MANAGEMENT) /
`Peter Villafuerte`(HR_MANAGER) / `Yusuke Uejima`(HQ) / `Ayako Nishimura`(HQ)

⚠️ **`Francis Angelo Dizon` という別人がいる**（実在確認済み）。部分一致で引かず、フルネームで保持すること。

### 通知の経路 → **Discord チャンネル投稿＋ `<@ユーザーID>` メンション**

`send_discord_message(city, message)`（`app/attendance_discord.py`）は**都市単位の webhook**
で、Manila チャンネルへの一斉投稿しかできない。個人宛の既存経路は Web Push
（VAPID / `push_subscriptions` が `discord_user_id → staff_name`）だが、**本番の購読は全5件**で、
購読済みは西村さんと綾子さんのみ。**Francis / Richard / Peter / Yusuke は未購読。**

→ 既存 webhook にメンションを載せる方式を採る。**端末側の作業が要らない**のが理由。

#### ユーザーID対応表（2026-08-29 西村さん提供）

`staff_master.staff_name` は**下の左列で固定**すること。西村さんから来た表記は
Discord 表示名で、名簿と一致しない（実データで各1名に一意対応することは確認済み）。

| `staff_name`（名簿・これが正） | Discord 表示名 | `discord_user_id` |
|---|---|---|
| `Peter Villafuerte` | Peter John Villafuerte | `1458636250171965551` |
| `Richard S. Gante` | Richard Gante | `1519927893398917202` |
| `Yusuke Uejima` | yuejim | `448139655448100865` |
| `Ayako Nishimura` | マハロ | `871028335315124225` |
| **`Francis Ibana`** | — | **未取得** |

⚠️ **未取得は Francis Ibana の1件だけ。** TAFT の火〜日を担当し、TAFT は最も件数の多い店舗
（`product_score_c` だけで1日12.4件）。**IDが無いと、一番届けたい相手に届かない。**
Web Push も未購読なので代替経路も無い。

⚠️ 対応表は**画面から編集できる形**にすること（当番表と同じ理由。人は入れ替わる）。
置き場は当番表と同じ `/admin/management/assignments` が自然。

⚠️ **IDが未登録の担当者には、メンション無しで投稿しない。** 誰宛か分からない投稿が
チャンネルに流れるだけになり、今と同じ「送ったのに誰も見ない」に戻る。
未登録ならタスクは送信不可にし、理由を画面に出すこと（Phase 1 の宛先ガードと同じ扱い）。

**Phase 0〜2 はこの表の完成を待たずに進めてよい**（受信箱とバッジだけで
「送ったのに誰も見ない」は解消する）。

### エスカレーション先 → 24時間無反応で
```
担当者 が Yusuke Uejima 以外  → Yusuke Uejima へ
担当者 が Yusuke Uejima       → Ayako Nishimura へ
```
Yusuke は CUB / CK の火木土日の担当でもあるため、素直に実装すると**彼が落としたタスクが
彼自身に上がる。**

⚠️ **一般則として実装すること。**「エスカレーション先が担当者本人と一致したら、次の宛先へ」。
名前を2つ書き分けるだけの実装にすると、**担当表が変わった瞬間に同じ輪が戻る。**

⚠️ **Ayako は TAFT 月曜の担当でもあるため、上げ先は Yusuke ⇄ Ayako の相互になる。**
これは意図どおり — 2人が最上位で、この上は無い。**3段目を足さないこと。**

---

## なぜ届かないか（3つ全部が欠けている）

```
management_tasks 全322件（2026-08-29 時点）
  manager_name が入っている        1件（値は "Test Manager"）
  status='sent' なのに宛先が空     11件  ← 全て本日 10:02〜10:48 UTC

task_messages
  BO が送ったメッセージ 10件 → 返信 0件
```

⚠️ **Session 2 は 8/29 に90件をクリアして「残り0件」にしたが、同日中に11件再発した。**
BO は今も押している。**穴は生きていて、1日あたり約11件のペースで再び溜まる。**

1. **宛先が無い。** `management_tasks.manager_name` はほぼ常に空。
   タスク生成時に店舗→担当を引く処理が無い。
2. **通知が無い。** `create_task_message`（`app/db.py:62663`）は INSERT して返すだけ。
3. **本人宛の受信箱が無い。** `/store/management/inbox` は
   `GET /api/store/management/tasks`（`app/main.py:48890`）を呼ぶ。
   この関数は `city` / `branch` のクエリしか取らず、**`Request` を受け取っていないので
   ログイン中の本人が誰か知る手段がそもそも無い。** 署名から変える必要がある。
   NavBar の Management Inbox に**バッジも無い**（`src/components/NavBar.tsx:190`。
   ただし `badgeCount` / `badgeCritical` / `BADGE_EVENTS` の基盤は既にある）。

→ マネージャーは「自分でページを開き、正しい店舗を選ぶ」以外に知る方法が無い。

---

## Phase 0 — 送る量を決める（配送より先）

### 実測（マニラ・直近7日）

| 型 | 7日 | 1日 | 送信 | 回答 | 回答率 |
|---|---:|---:|---:|---:|---:|
| `product_score_c` | 149 | **21.3** | 11 | 2 | **18%** |
| `disposal_missing` | 28 | 4.0 | 4 | 2 | 50% |
| `backup_below_50` | 9 | 1.3 | 1 | 1 | 100% |
| `complaint_no_photo` | 8 | 1.1 | **0** | – | – |
| `rush_check_missing` | 8 | 1.1 | 3 | 3 | **100%** |
| `backup_below_70` | 8 | 1.1 | 1 | 1 | 100% |
| `pm_backup_missing` | 7 | 1.0 | **0** | – | – |
| `salmon_yield_alert` | 3 | 0.4 | **0** | – | – |
| | **220** | **31.4** | | | |

`product_score_c` の内訳: TAFT 87 / PAR 34 / CUB 28（**TAFT だけで1日12.4件**）。

### 読み取れること

**答えられている型と、答えられていない型がはっきり分かれている。**

- `rush_check_missing` は本文が「Dinner 18:00 のチェックが未提出です」で、
  受け取った人が次に何をするか**一意に決まる** → 3/3 回答
- `product_score_c` は「15:15 に投稿された商品が C」で、**次の動作が無い** → 2/11 回答

そして `product_score_c` は **QC写真1枚につき1行**（source_id 237種／237行）。
Alexandra さん・Alex Delgado さんが投稿するたびに1件増える。**これが量の正体で、
全体の74%を占める。**

もう1つ。本日の送信11件は **10:02〜10:48 の46分間に集中**している。1件ずつ判断したのではなく
**溜まったキューをまとめて押した**動き。宛先を付けても、まとめ押しがまとめ配信になるだけ。

### やること

**① `product_score_c` を1件1通にしない。**
店舗ごとに**1日1通の要約**にする。`context` に `grade` / `scored_at` / `total_score` /
`posted_by` / `food_category` が入っているので、そのまま並べられる。

```
TAFT — 本日 C以下の評価が3件
  15:15  C  32.9  Alexandra
  17:40  F  28.1  Alex Delgado
  19:05  C  33.4  Alexandra
→ 原因を確認して返信してください
```

⚠️ 型名は `product_score_c` だが **grade F も入っている**（実データで確認）。要約には
grade を出すこと。「C」だけの表記にすると F が埋もれる。

**② 一度も送られていない型を止める。**
`complaint_no_photo` 8件 / `pm_backup_missing` 7件 / `salmon_yield_alert` 3件 は
**生成されているが BO が一度も送っていない**（1日2.5件）。送らないものを作り続ける理由が無い。
BO に「送らない理由」を聞き、不要なら生成を止める。必要なら送れる形に本文を直す。

**③ 回答率を型ごとに画面に出す。**
BO ダッシュボードに上の表を常設する。**答えられていない型は送るのをやめる** —
これが形骸化を止める唯一の仕組み。無いと、追加された型が誰にも読まれないまま積み上がる
（`product_score_c` がまさにそれ）。月1回見る運用にする。

### ⚠️ 要約化は Compliance Score の目盛りを変える（見落とし注意）

`app/manager_score_api.py` の `TASK_COMPONENTS` は
`complaints = ["complaint_no_photo", "product_score_c"]`（重み15）。
そして `complaint_no_photo` は**一度も送られていない**ので、
**この成分は実質 `product_score_c` だけで決まっている。**

要約化すると、TAFT の `complaints` の母数が **週約85件 → 週約7件**になる。
スコアは `answered / sent` の比なので比自体は残るが、**1件落としたときの重さが約12倍になる**
（成分の 1.2% → 14%、総合点で 約0.18点 → 約2.1点）。

対処は2つ。**どちらも実装すること。**

1. **切替日を記録し、それを跨いだ週次比較をしない。** 記録が無いと「8月より9月のほうが
   点が低い」が運用の悪化に見える。実際は目盛りが変わっただけ。
2. **`complaint_no_photo` の扱いを先に決める**（上記②）。止めるなら `complaints` 成分は
   `product_score_c` 単独になると明記する。残すなら送れる形に直す。**どちらも選ばないと、
   重み15の成分が「一度も送らない型」と「要約1通」の混成のままになる。**

### 修正後の見込み

```
        現在                    Phase 0 後
  product_score_c  21.3/日   →   3/日（店舗ごと1通）
  その他            10.1/日   →  7.6/日（②で2.5件停止）
  ─────────────────────────────────────────
  合計             31.4/日   →  10.6/日
  担当1人あたり     約15/日   →   4〜5/日
```

**4〜5件なら1件ずつ判断できる。** ここまで下げてから配送を通すこと。

---

## 実装（この順で）

### Phase 1 — 宛先を人にする
- 当番表テーブル（`branch` × `weekday` × `staff_name`）。**上の表を初期値に。**
- タスク生成時に `manager_name` を埋める。
- **宛先が決まらないタスクは Send を押せない**（**`city='manila'` のみ**。ドバイに効かせない）:
  ```
  送信できません — TAFT の担当マネージャーが未設定です
  [ 担当を設定する ]
  ```

### Phase 2 — 本人宛の受信箱
- Manager Inbox の初期表示を**ログイン中の本人宛**に。店舗ドロップダウンは残す。
  API は `Request` を取る形に変える（Cookie 経路は教訓13・27）。
- **NavBar にバッジ**（未対応件数／期限超過は赤）。基盤は既にある。

### Phase 3 — Discord 通知
- 送信時に担当本人へ1通。**経路は上記の判断待ち**（推奨: チャンネル投稿＋メンション）。

### Phase 4 — BO 側に状態を出す
現在は `Not sent yet / 14h ago` しか出ない。送った後が分からない。
```
送信済み · Francis Ibana 宛 · 2時間前
  ├ 未読 / 既読(10:32) / 回答済み: Report Submitted(11:05)
```

### Phase 5 — エスカレーション
24時間無反応で Waiting for Someone に載せる（`app/waiting_api.py` にプロバイダー追加）。

⚠️ **Phase 0 の後に着手すること。** 1日15件のままエスカレーションを入れると
**Yusuke さんに毎日15件上がる。** 上がってきたものが多すぎれば、上でも読まれない。

### ボタンの文言も変える
```
変更前: [ Send Instruction ]
変更後: [ Francis Ibana に送る ]
        送信すると本人に通知が届きます。24時間以内に返信がなければ
        Yusuke Uejima に上がります。
```

---

## ⚠️ 実装中に必ず踏む罠

### 担当3名が `city='dubai'` 登録
`Yusuke Uejima` と `Ayako Nishimura` は `staff_master.city='dubai'` / `branch_code='HQ'`
（実データで確認）。**タスクは `city='manila'`。受信箱は city で絞る。**

該当するのは **TAFT月曜・CUB/CKの火木土日・エスカレーション全件** —
**当番表を正しく作っても、この2人の分だけ届かない**という結果になりうる。
**Impersonation で実機確認すること**（教訓27。合成トークンでは嘘の結果が出る）。

### Send のガードを全都市に効かせない
ドバイは対象外だがタスクは生成され続ける（7日で72件）。ガードを無条件にすると
ドバイが恒久的に送信不可になる。`city='manila'` で限定する。

### 送信済み90件を実績に数えない
Session 2 でクリア済み（下記）。**一度も届いていないので「対応済み」ではない。**

---

## Session 2 で対応済み（やり直さないこと）

**宙に浮いていた90件を 2026-08-29 にクリア。**「過去の内容で営業は既に進んでいるので、
処理に時間を使うより先の運用を正しくしたい」という西村さんの判断。

- 対象: `status='sent' AND manager_name='' AND response IS NULL`（90件、8/21〜8/29）
  TAFT 39 / PAR 29 / CUB 18 / ALL 2 / CK 2 ・
  product_score_c 56 / disposal_missing 9 / backup_below_50 6 / rush_check_missing 5 ほか
- **バックアップ: `_management_tasks_backup_20260829`（90行・存在確認済み）**
- `status='closed'` / `closed_by='cleanup-2026-08-29'` / `closed_at=NOW()` /
  **`sent_at=NULL`** / `response_note` に経緯
- **`sent_at` を NULL にした理由**: Manager Compliance Score は
  `COUNT(*) FILTER (WHERE sent_at IS NOT NULL AND NOT self_reported)` を分母に取る
  （`app/manager_score_api.py:88`・式まで一致を確認）。放置すると**届いていない90件が
  「送信済み・未回答」としてマネージャーの点を下げ続ける。**
- `task_messages` の10件は履歴として残した。

⚠️ **同日中に11件再発している。** クリアは対症療法で、Phase 1 が入るまで止まらない。

---

## 触るファイル

| 対象 | パス |
|---|---|
| BO 側ダッシュボード（Send ボタン・状態表示・回答率表） | `src/app/admin/management/back-office/page.tsx` |
| 当番表の置き場 | `src/app/admin/management/assignments/page.tsx` |
| マネージャー受信箱 | `src/app/store/management/inbox/page.tsx` |
| 受信箱の API（本人宛にする） | `app/main.py:48890` `api_store_get_tasks` |
| メッセージ作成（通知を足す） | `app/db.py:62663` `create_task_message` |
| タスクの宛先 | `management_tasks.manager_name` |
| NavBar（バッジ） | `src/components/NavBar.tsx:190` |
| Discord 送信（都市単位 webhook） | `app/attendance_discord.py` `send_discord_message` |
| 個人宛 Push の購読表 | `push_subscriptions`（`discord_user_id → staff_name`） |
| エスカレーション | `app/waiting_api.py` |
| スコア（分母の定義） | `app/manager_score_api.py:88` |

⚠️ 行番号はファイルが伸びるとずれる。**関数名で探すこと**（前版の2件がずれていた）。

---

## 完了の判定

- **担当1人あたりの1日の受信が5件以下**（Phase 0 の目的。これを超えたら通知は切られる）
- **宛先が未設定のマニラ店舗では Send が押せない**／ドバイは従来どおり動く
- Richard / Francis が**自分でページを開かなくても**、バッジか Discord で気づく
- BO 側で**既読・回答の状態**と**型ごとの回答率**が見える
- 送信から24時間無反応のものが Waiting for Someone に出る
- **`status='sent'` かつ `manager_name` が空の行が新たに増えない**（定期的に確認する）
- **`city='dubai'` の3名が、自分宛のマニラのタスクを受信箱で見られる**（Impersonation で確認）

---

## 未確定（Phase 0・1・2 は止めない）

| # | 内容 | 影響 | 止まるもの |
|---|---|---|---|
| 1 | **`ALL` 系統の担当** | 現在2件。全店に関わる例外が入る | `ALL` のタスクのみ送信不可のまま。他は動く |
| 2 | **「Francis が休んだら Ayako」の判定方法** | TAFT の代理 | TAFT の代理運用のみ。当番表どおりなら動く |
| 3 | **`Francis Ibana` の Discord ユーザーID** | Phase 3 のみ | **TAFT 火〜日の通知のみ**（最も件数が多い）。他は送れる |

**2 について**: 公開シフト（`shift_published_rows`）から自動判定するか、当番表に「代理」列を
持たせて手動にするか。**自動にする場合は公開シフトが正しいことが前提**（教訓18: 公開シフトが
誤っているケースは実在する）。**推測で外すと通知が誰にも届かない。**

**3 について**: 経路は決着（チャンネル投稿＋メンション）。当番表の5名中4名のIDは受領済みで、
**残りは Francis Ibana の1件だけ。** TAFT 火〜日の担当なので、ここが埋まらないと
Phase 3 で一番件数の多い経路だけが動かない。
