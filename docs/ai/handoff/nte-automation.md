# 引き継ぎ: NTE の自動化と滞留解消

Session 2（hotfix worktree）で調査。**スキーマ変更を伴うため Session 1 に移送。**
調査日 2026-08-28 / 依頼元 HQスタッフ（Ayako Nishimura 経由）

---

## 依頼の原文（要約せず判断の根拠に使うこと）

> 1) 勤怠に関する NTE は自動送信され、HR はスタッフ別に履歴を確認できる。
>    もしくは自動的に下書きが作成され、HR は confirmed を押すだけで本人の
>    OS アカウントに送られる（draft/approval を1回に省略）
>    ・Discord に連絡がない欠勤（無断欠勤）
>    ・欠勤2回以上を1週間以内（Medical Certificate の提出なし）
>    ・60分以上の遅刻
>    ・週2回以上30分以上の遅刻
>
> 2) 勤怠以外の NTE はリクエストしてもドラフトにならない。リクエストする人
>    （最初は HQ のみ）が violation のリストからテンプレを選び Draft として提出。
>    HR は draft review (Ms. Camilla)、approve/送信を Mr. Peter が行う。
>    2日以上どちらかのプロセスが行われない場合、HQ に警告が送られる。

---

## 先に読むべき「調べ直さなくていい」事実

### 現状は壊れていない。止まっているだけ
`nte_requests` のワークフロー（submit → approve → issue）は**実装済みで動いている**。
2026-08-28 時点の本番:

```
PENDING    5件  平均滞留 9.2日（最長 39日）
APPROVED   1件  滞留 39日   ← 承認済みなのに発行されていない
ISSUED     3件
```

**「リクエストしてもドラフトにならない」の実体は「ドラフトにはなるが誰も次に進めず、
止まっていることに誰も気づかない」。** 作り直しではなく、担当の分離と督促を足す話。

本人への配信は**既に動く**。`/store/my-nte` が `/api/store/conduct/my-notices` と
`/api/store/nte-v2/my-cases` を読み、本人が回答まで返せる。ここは作らなくてよい。

### ルールが実際に何件発火するか（Manila / 2026-08-01 以降の約4週間）

| ルール | 件数 | 判定に使う列 |
|---|---|---|
| 60分以上の遅刻 | **24件 / 10名**（最大 373分） | `manila_attendance_daily.late_minutes >= 60` |
| 週2回以上の30分遅刻 | **15件** | 同 `>= 30` を `date_trunc('week', work_date)` で集計 |
| 週2回以上の無給欠勤 | **10件** | `absent_without_pay AND NOT paid_leave_flag` |
| | **計 約49通/月** | |

**自動送信（HR確認なし）は採用しないこと。** 月49通が本人アカウントに直接届く設計は、
誤検知1件で信用を失い以後全部が無視される。依頼文の後半
「自動下書き → HR が Confirm を押すだけ」を採る。**1画面で全件確認して一括 Confirm**
できる形にする（1件ずつ49回押させない）。

### 2つのルールは今のデータでは判定できない — ここが最初の作業

- **「Discord に連絡がない欠勤（無断欠勤）」**
  `absences` テーブルは `absence_type` が `ABSENT`(107件) / `VACATION_LEAVE`(96件) のみ。
  **事前連絡の有無を持つ列が存在しない。** `note` は自由記述で判定に使えない。
- **「Medical Certificate の提出なし」**
  **提出有無を持つ列が存在しない。**

→ **先に Absence ページに「事前連絡あり/なし」「MC提出あり/なし」を追加する。**
   これが入るまで、この2ルールは実装しない。判定できる3ルールから始める。
   （`absences` テーブル定義は `app/db.py` 4175行付近）

---

## 進捗（Session 1 / 2026-08-28）

**Phase 0 〜 C すべてデプロイ済み（自動生成は既定OFF）。** 詳細と、この仕様書を上書きした調査結果は
`docs/ai/CURRENT_TASKS.md` の先頭にある。要点だけ:

- 39日放置の原因は権限ではなく **city フィルタによる非表示** だった
- **承認を HQ 限定にしない**こと。Peter=HR_MANAGER / Cyrine=ADMIN が締め出される
- 滞留の時計は **段階ごと**（PENDING=created_at / APPROVED=reviewed_at）
- Phase B で正とするのは **`absences`**（両都市をカバーする唯一のテーブル）
- `dubai_attendance_daily.late_minutes` は全行0 → **遅刻ルールはマニラ限定**
- 発行のたび `issued_nte_id` が NULL になっていた（修正済・既存4件復旧済）
- **`absences` の新2列は3値TEXT**（`''`/`YES`/`NO`）。BOOLEANにすると既存2,808件が
  「連絡なし」を主張する。空欄を `NO` と読まないこと
- **自動生成は `NTE_AUTO_DRAFTS_ENABLED=1` まで動かない。** 初回は約40件を一度に積む
- 実測: late60 31 / late30x2 15 / absent2x 19 / awol 0 = 月65件
- DTR同期で**打刻なしセッションが欠勤記録を握り潰していた**（39日分・修正済）。
  過去期間の再同期は未実施

---

## 実装の範囲

### Phase A — 滞留の可視化と督促（スキーマ変更なし・先にやる）
依頼 2) の中核。既存テーブルの日付だけで成立する。

- `nte_requests` の `PENDING` / `APPROVED` を**滞留日数つきで表示**。2日超を強調
- **2日超を Waiting for Someone に載せる**（`app/waiting_api.py` にプロバイダーを追加。
  ページ側の変更は不要な設計になっている）
- **担当を分ける**: 現在 approve も issue も `HR_ROLES = {ADMIN, HQ, HR_MANAGER}` で
  ひとくくり（`app/nte_api.py` 353行）。**PENDING = レビュー担当（Camilla）待ち、
  APPROVED = 発行担当（Peter）待ち**と画面で分かるようにする
- **申請者を HQ に限定**（現状は閲覧権限があれば誰でも submit できる）
- ~~violation テンプレを Request 側でも選べるように~~ → **Session 2 で対応済み**（下記参照）

### Phase B — Absence への入力項目追加（スキーマ変更）
`absences` に事前連絡有無・MC提出有無を追加し、Absence ページで入力できるようにする。
**Phase C の前提。**

### Phase C — 勤怠連動の自動下書き
- 判定と生成は **worker の日次パス**に置く（`worker.py`。既存の時間帯ディスパッチに倣う）
- **重複防止が必須**: 同じ staff × 同じ違反 × 同じ期間で二重に下書きを作らない。
  判定履歴テーブルを持ち、生成済みを記録する（`store_supplier_item_edits` と同じ発想）
- `nte_requests` に `source`（`manual` / `auto:late60` 等）を持たせ、
  **Case History で自動生成分を絞り込めるように**する（依頼の「HR がスタッフ別に履歴を確認」）
- **1件でも判定に失敗したら全体を止める作りにしないこと**（教訓17）

---

## 触るファイル

| 対象 | パス |
|---|---|
| NTE API（request ワークフロー・権限） | `app/nte_api.py`（351行〜が request 部分） |
| NTE テーブル定義 | `app/db_nte.py`（`nte_requests` は93行付近） |
| 勤怠データ | `manila_attendance_daily`（`late_minutes` / `absent_without_pay` / `paid_leave_flag`） |
| 欠勤データ | `absences`（`app/db.py` 4175行付近） |
| 待ち行列 | `app/waiting_api.py` |
| 管理画面 | `src/app/admin/employee-cases/page.tsx`（4807行・要注意） |
| 本人画面 | `src/app/store/my-nte/page.tsx`（変更不要の見込み） |
| 定期実行 | `worker.py` |

---

## Session 2 で対応済み（やり直さないこと）

**違反カタログを Request 側でも使えるようにした**（フロント `73813835` / バックエンド `2d3a4d82`）。
「リクエストしてもテンプレートが出てこない」という報告の直接の原因。

- Request フォームに Issue Notice と同じ違反ピッカー（161件）を追加
- 選んだ `violation_code` を `nte_requests` と `staff_nte_records` に保存（列は追加済み）
- `/api/admin/nte-v2/catalog/{code}/render` に **`mode=blank`** を追加。
  従来の `mode=sample` は「03 Jul 2026 … Late by 22 min」のような**本物に見える日付**を
  返しており、無編集で発行すると存在しない違反を告知することになる。
  フォームは `blank` を使い、事実部分を `________` にする
- render の権限を `_require_hq` → `_require_hr` に変更（発行するのはHR）

本番で往復確認済み: 申請(ATT-001) → 一覧表示 → 承認 → 発行 → 通知に `ATT-001` が残る。

**作成中ドラフトの消失を修正・デプロイ済み**（`5d3f55d1`）。
同じスタッフから「3回ほど途中で閉じられてしまいました」と報告があった件。

原因は3つ:
1. フォームをメモリだけで保持していた
2. `useUnsavedGuard` に未登録で、デプロイ検知の自動リロードが入力中でも走った
3. `city` をマウントのたびにアカウント登録都市で上書きしていた
   （Dubai 登録の人が Manila で作業すると毎回 Dubai に戻る）

修正: NTE Request / Issue Notice の入力を sessionStorage に保持、選択した都市を記憶、
入力中は AutoReload を待機。添付画像だけは File のため復元しない。

⚠️ **実機確認は未実施**（ログインPIN入力が必要なため）。**Phase A に入る前に
「入力途中で別タブ → 戻る」を実機で1回確認すること。**

---

## 完了の判定

- Phase A: PENDING/APPROVED が2日を超えたら Waiting for Someone に名前が出る。
  39日放置の APPROVED 1件が消える（発行されるか、明示的に取り下げられる）
- Phase B: Absence ページで事前連絡・MC を記録できる
- Phase C: 自動下書きが1画面に並び、HR が一括 Confirm できる。
  **同じ違反で2通目が出ないことを実データで確認する**

---

## 判断が要る点（実装前に西村さんに確認）

1. **Camilla / Peter を役職で持つか個人名で持つか。** 現在は `HR_ROLES` のロール判定のみ。
   個人に固定すると休暇で止まる（教訓21: 実行できる人が実在するかDBで確認すること）
2. **自動下書きの発火時刻。** DTR の確定後でないと遅刻分数が動く
3. **既存の滞留5件をどう扱うか**（自動で警告対象に含めるか、一度クリアしてから始めるか）
