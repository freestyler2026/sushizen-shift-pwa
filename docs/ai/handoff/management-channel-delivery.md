# 引き継ぎ: Management Channel — 送信を実際に届くようにする

Session 2 → Session 1（2026-08-29）。**通知連携と当番表の新設が要るため移送。**
発端は西村さん自身が Send を押して「どこに送られたのか分からない」と気づいたこと。

---

## 一行でいうと

**Send は誰にも送っていない。** status を `sent` にして `task_messages` に1行書くだけで、
**宛先も通知も存在しない。**

---

## すぐ着手してよい

**未確定が2件あるが、どちらも Phase 1・2 を止めない**（→ 末尾「未確定」）。
先に読むのはここまでの3節（「一行でいうと」「決まっていること」「なぜ届かないか」）で足りる。

### 最初の30分
1. `management_tasks` に `manager_name` が入っていないことを自分の目で確認
   （`SELECT count(*) FILTER (WHERE COALESCE(manager_name,'')='') FROM management_tasks`）
2. `app/db.py:62493` `create_task_message` を読む — INSERT して返すだけで通知が無いことを確認
3. 当番表テーブルを作り、下の表を投入（**画面から編集できる形にする。ハードコード禁止**）
4. タスク生成時に「日付の曜日 × 店舗」で `manager_name` を引く
5. 宛先が空なら Send を押せなくする

---

## 決まっていること（2026-08-29 西村さん回答・再確認不要）

### 担当マネージャー → **曜日で交代する当番表**

⚠️ **「店舗＝担当者1人」ではない。** `manager_name` は**タスクの日付から曜日を出して引く。**

| 店舗 | 月 | 火 | 水 | 木 | 金 | 土 | 日 |
|---|---|---|---|---|---|---|---|
| **TAFT** | Yukihiro Nishimura | Francis Ibana | Francis Ibana | Francis Ibana | Francis Ibana | Francis Ibana | Francis Ibana |
| **PAR** | Peter Villafuerte | Peter Villafuerte | Peter Villafuerte | Richard S. Gante | Peter Villafuerte | Richard S. Gante | Richard S. Gante |
| **CUB** | Richard S. Gante | Yusuke Uejima | Richard S. Gante | Yusuke Uejima | Richard S. Gante | Yusuke Uejima | Yusuke Uejima |
| **CK** | Richard S. Gante | Yusuke Uejima | Richard S. Gante | Yusuke Uejima | Richard S. Gante | Yusuke Uejima | Yusuke Uejima |
| **ALL** | 未定 | 未定 | 未定 | 未定 | 未定 | 未定 | 未定 |

原文: 「Taft➡️Francis（火〜日曜日）、月曜日とFrancisが休んだら私 /
Paranaque➡️Richard木、土日、残りはPeter / CK/Cubao➡️月水金Richard、火木土日植嶋さん」

**当番表は画面から編集できるようにする。** 人は入れ替わる。
置き場は `/admin/management/assignments`（BO側の担当割り当てが既にある画面）。

在籍確認済み（2026-08-29・全員 ACTIVE）:
`Francis Ibana`(MANILA_MANAGER) / `Richard S. Gante`(MANILA_MANAGEMENT) /
`Peter Villafuerte`(HR_MANAGER) / `Yusuke Uejima`(HQ) / `Yukihiro Nishimura`(HQ) /
`Ayako Nishimura`(HQ)

⚠️ **`Francis Angelo Dizon` という別人がいる。** 部分一致で引かず、フルネームで保持すること。

### 通知の経路 → **Discord**
WhatsApp は使わない。既存の Discord 連携に乗せる。

### エスカレーション先 → 24時間無反応で
```
担当者 が Yusuke Uejima 以外  → Yusuke Uejima へ
担当者 が Yusuke Uejima       → Ayako Nishimura へ
```
Yusuke は CUB / CK の火木土日の担当でもあるため、素直に実装すると**彼が落としたタスクが
彼自身に上がる。**

⚠️ **一般則として実装すること。**「エスカレーション先が担当者本人と一致したら、次の宛先へ」。
名前を2つ書き分けるだけの実装にすると、**担当表が変わった瞬間に同じ輪が戻る。**

---

## なぜ届かないか（3つ全部が欠けている）

```
management_tasks 全308件
  manager_name が入っている        1件（値は "Test Manager"）
  status='sent' なのに宛先が空     90件   ← Session 2 でクリア済み

task_messages
  BO が送ったメッセージ 10件 → 返信 0件
  status='sent' 90件    → responded 4件
```

1. **宛先が無い。** `management_tasks.manager_name` はほぼ常に空。
   タスク生成時に店舗→担当を引く処理が無い。
2. **通知が無い。** `create_task_message`（`app/db.py:62493`）は INSERT して返すだけ。
3. **本人宛の受信箱が無い。** `/store/management/inbox` は
   `GET /api/store/management/tasks?city=…&branch=…`（`app/main.py:48789`）を呼ぶ。
   **ログイン中の本人ではなく、画面のドロップダウンで選んだ店舗**で引く。
   NavBar の Management Inbox に**バッジも無い**（`src/components/NavBar.tsx:190`）。

→ マネージャーは「自分でページを開き、正しい店舗を選ぶ」以外に知る方法が無い。

---

## 実装（この順で。1と2だけで「送ったのに誰も見ない」は解消する）

### Phase 1 — 宛先を人にする
- 当番表テーブル（`branch` × `weekday` × `staff_name`）。**上の表を初期値に。**
- タスク生成時に `manager_name` を埋める。
- **宛先が決まらないタスクは Send を押せない**（押せると今回と同じことが起きる）:
  ```
  送信できません — TAFT の担当マネージャーが未設定です
  [ 担当を設定する ]
  ```

### Phase 2 — 本人宛の受信箱
- Manager Inbox の初期表示を**ログイン中の本人宛**に。店舗ドロップダウンは残す。
- **NavBar にバッジ**（未対応件数／期限超過は赤）。

### Phase 3 — Discord 通知
- 送信時に担当本人へ1通。

### Phase 4 — BO 側に状態を出す
現在は `Not sent yet / 14h ago` しか出ない。送った後が分からない。
```
送信済み · Francis Ibana 宛 · 2時間前
  ├ 未読 / 既読(10:32) / 回答済み: Report Submitted(11:05)
```

### Phase 5 — エスカレーション
24時間無反応で Waiting for Someone に載せる（`app/waiting_api.py` にプロバイダー追加）。

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
`Yusuke Uejima` / `Yukihiro Nishimura` / `Ayako Nishimura` の3名は
`staff_master.city='dubai'`。**タスクは `city='manila'`。受信箱は city で絞る。**

該当するのは **TAFT月曜・CUB/CKの火木土日・エスカレーション全件** —
**当番表を正しく作っても、この3人の分だけ届かない**という結果になりうる。
**Impersonation で実機確認すること**（教訓27。合成トークンでは嘘の結果が出る）。

### 送信済み90件を実績に数えない
Session 2 でクリア済み（下記）。**一度も届いていないので「対応済み」ではない。**

---

## Session 2 で対応済み（やり直さないこと）

**宙に浮いていた90件を 2026-08-29 にクリア。**「過去の内容で営業は既に進んでいるので、
処理に時間を使うより先の運用を正しくしたい」という西村さんの判断。

- 対象: `status='sent' AND manager_name='' AND response IS NULL`（90件、8/21〜8/29）
  TAFT 39 / PAR 29 / CUB 18 / ALL 2 / CK 2 ・
  product_score_c 56 / disposal_missing 9 / backup_below_50 6 / rush_check_missing 5 ほか
- **バックアップ: `_management_tasks_backup_20260829`（90行）**
- `status='closed'` / `closed_by='cleanup-2026-08-29'` / `closed_at=NOW()` /
  **`sent_at=NULL`** / `response_note` に経緯
- **`sent_at` を NULL にした理由**: Manager Compliance Score は
  `COUNT(*) FILTER (WHERE sent_at IS NOT NULL AND NOT self_reported)` を分母に取る
  （`app/manager_score_api.py:88`）。放置すると**届いていない90件が「送信済み・未回答」として
  マネージャーの点を下げ続ける。**
- `task_messages` の10件は履歴として残した。
- 検証済み: 宙に浮いた残り0件 / クリア印90件 / スコア分母に残る送信済み4件 /
  closed 201・open 103・responded 4。

---

## 触るファイル

| 対象 | パス |
|---|---|
| BO 側ダッシュボード（Send ボタン・状態表示） | `src/app/admin/management/back-office/page.tsx` |
| 当番表の置き場 | `src/app/admin/management/assignments/page.tsx` |
| マネージャー受信箱 | `src/app/store/management/inbox/page.tsx` |
| 受信箱の API（本人宛にする） | `app/main.py:48789` |
| メッセージ作成（通知を足す） | `app/db.py:62493` `create_task_message` |
| タスクの宛先 | `management_tasks.manager_name` |
| NavBar（バッジ） | `src/components/NavBar.tsx:190` |
| エスカレーション | `app/waiting_api.py` |
| スコア（分母の定義） | `app/manager_score_api.py:88` |

---

## 完了の判定

- **宛先が未設定の店舗では Send が押せない**
- Richard / Francis が**自分でページを開かなくても**、バッジか Discord で気づく
- BO 側で**既読・回答の状態が見える**
- 送信から24時間無反応のものが Waiting for Someone に出る
- **`status='sent'` かつ `manager_name` が空の行が新たに増えない**（定期的に確認する）
- **`city='dubai'` の3名が、自分宛のマニラのタスクを受信箱で見られる**（Impersonation で確認）

---

## 未確定（Phase 1・2 は止めない）

| # | 内容 | 影響 | 止まるもの |
|---|---|---|---|
| 1 | **`ALL` 系統の担当** | 現在2件。全店に関わる例外が入る | `ALL` のタスクのみ送信不可のまま。他は動く |
| 2 | **「Francis が休んだら私」の判定** | TAFT の代理 | TAFT の平日運用のみ。当番表どおりなら動く |

**2 について**: 公開シフト（`shift_published_rows`）から自動判定するか、当番表に「代理」列を
持たせて手動にするか。**自動にする場合は公開シフトが正しいことが前提**（教訓18: 公開シフトが
誤っているケースは実在する）。**推測で外すと通知が誰にも届かない。**

どちらも 西村さんの回答待ち。**回答が来る前に Phase 1・2 を進めてよい。**
