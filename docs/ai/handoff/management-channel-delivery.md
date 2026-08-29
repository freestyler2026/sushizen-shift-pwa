# 引き継ぎ: Management Channel — 送信を実際に届くようにする

Session 2（hotfix worktree）で調査。**通知連携と新規の対応表が要るため Session 1 に移送。**
調査日 2026-08-29 / 発端は西村さん自身が Send を押して「どこに送られたのか分からない」と気づいたこと

---

## 一行でいうと

**Send は誰にも送っていない。** status を `sent` にして `task_messages` に1行書くだけで、
**宛先も通知も存在しない。**

---

## 実測（調べ直し不要）

```
management_tasks 全308件
  manager_name が入っている        1件（値は "Test Manager"）
  status='sent' なのに宛先が空     90件   ← 2026-08-29 にクリア済み（後述）

task_messages
  BO が送ったメッセージ 10件 → 返信 0件
  status='sent' 90件    → responded 4件
```

### なぜ届かないか（3つ全部が欠けている）

1. **宛先が無い。** `management_tasks.manager_name` はほぼ常に空。
   タスク生成時に店舗→担当マネージャーを引く処理が無い。
2. **通知が無い。** `create_task_message`（`app/db.py:62493`）は INSERT して返すだけ。
   プッシュも Discord も WhatsApp も無い。
3. **本人宛の受信箱が無い。** `/store/management/inbox` は
   `GET /api/store/management/tasks?city=…&branch=…`（`app/main.py:48789`）を呼ぶ。
   **ログイン中の本人ではなく、画面のドロップダウンで選んだ店舗**で引く。
   NavBar の Management Inbox に**バッジも無い**（`src/components/NavBar.tsx:190`）。

→ マネージャーは「自分でページを開き、正しい店舗を選ぶ」以外に知る方法が無い。

---

## 優先順位（西村さん承認済み）

```
1. 宛先を人にする＋未設定なら送信不可     ← これが無いと2〜5は動かない
2. 本人宛の受信箱＋NavBar バッジ
3. 送信時の通知（WhatsApp / Discord）
4. BO 側に既読・回答の状態を出す
5. 24時間無反応のエスカレーション
```

**1と2だけで「送ったのに誰も見ない」は解消する。** 3以降は当日中に気づくための施策。
（今回の CK・TAFT のバックアップ未提出も、気づいたのは翌日だった）

### 1. 宛先を人にする
- 店舗→担当マネージャーの対応表を追加。BO 側の担当は
  `/admin/management/assignments` にあるが、**店舗側マネージャーの登録が無い。**同じ画面に足す。
- タスク生成時に `manager_name` を埋める。
- **宛先が決まらないタスクは Send を押せない**（押せると今回と同じことが起きる）:
  ```
  送信できません — TAFT の担当マネージャーが未設定です
  [ 担当を設定する ]
  ```

### 2. 本人宛の受信箱
- Manager Inbox の初期表示を**ログイン中の本人宛**に。店舗ドロップダウンは残す。
- **NavBar にバッジ**（未対応件数／期限超過は赤）。

### 3. 通知
- `staff_master.whatsapp_phone` と Discord は既に動いている。**送信時に本人へ1通。**

### 4. BO 側に状態を出す
現在は `Not sent yet / 14h ago` しか出ない。送った後が分からない。
```
送信済み · Francis Ibana 宛 · 2時間前
  ├ 未読 / 既読(10:32) / 回答済み: Report Submitted(11:05)
```

### 5. エスカレーション
24時間返信が無ければ Waiting for Someone に載せる（`app/waiting_api.py` にプロバイダー追加）。

### ボタンの文言も変える
```
変更前: [ Send Instruction ]
変更後: [ Francis Ibana に送る ]
        送信すると本人に通知が届きます。24時間以内に返信がなければ
        エリアマネージャーに上がります。
```

---

## Session 2 で対応済み（やり直さないこと）

**宙に浮いていた90件を 2026-08-29 にクリアした。**「過去の内容で営業は既に進んでいるので、
処理に時間を使うより先の運用を正しくしたい」という西村さんの判断。

- 対象条件: `status='sent' AND manager_name='' AND response IS NULL`（90件、8/21〜8/29）
  - TAFT 39 / PAR 29 / CUB 18 / ALL 2 / CK 2
  - product_score_c 56 / disposal_missing 9 / backup_below_50 6 / rush_check_missing 5 ほか
- **バックアップ: `_management_tasks_backup_20260829`（90行）**
- 更新内容: `status='closed'` / `closed_by='cleanup-2026-08-29'` / `closed_at=NOW()` /
  **`sent_at=NULL`** / `response_note` に経緯
- **`sent_at` を NULL にした理由**: Manager Compliance Score は
  `COUNT(*) FILTER (WHERE sent_at IS NOT NULL AND NOT self_reported)` を分母に取る
  （`app/manager_score_api.py:88`）。放置すると**届いていない90件が「送信済み・未回答」として
  マネージャーの点を下げ続ける。** 実際には誰にも届いていないので分母から外すのが正しい。
- `task_messages` の10件は履歴として残した。
- 検証済み: 宙に浮いた残り0件 / クリア印90件 / スコア分母に残る送信済み4件 /
  ステータス closed 201・open 103・responded 4。

⚠️ **この90件を「対応済み」として実績に数えないこと。** 一度も届いていない。

---

## 触るファイル

| 対象 | パス |
|---|---|
| BO 側ダッシュボード（Send ボタン・状態表示） | `src/app/admin/management/back-office/page.tsx` |
| 担当割り当て（店舗マネージャーの登録先） | `src/app/admin/management/assignments/page.tsx` |
| マネージャー受信箱 | `src/app/store/management/inbox/page.tsx` |
| 受信箱の API（本人宛にする） | `app/main.py:48789` |
| メッセージ作成（通知を足す） | `app/db.py:62493` `create_task_message` |
| タスク一覧・宛先 | `management_tasks.manager_name` |
| NavBar（バッジ） | `src/components/NavBar.tsx:190` |
| エスカレーション | `app/waiting_api.py` |
| スコア（分母の定義） | `app/manager_score_api.py:88` |

---

## 完了の判定

- **宛先が未設定の店舗では Send が押せない**
- Richard / Francis が**自分でページを開かなくても**、バッジか通知で気づく
- BO 側で**既読・回答の状態が見える**
- 送信から24時間無反応のものが Waiting for Someone に出る
- **`status='sent'` かつ `manager_name` が空の行が新たに増えない**（これがゼロであることを定期的に確認する）

---

## 実装前に西村さんに確認すること

1. **店舗ごとの担当マネージャー。** TAFT / PAR / CUB / CK / ALL の5系統。
   `ALL` と `CK` は誰が受けるか未定。
2. **通知の経路。** WhatsApp と Discord のどちらを主にするか（両方は通知過多になる）。
3. **エスカレーション先。** 24時間無反応のときエリアマネージャーは誰か。
