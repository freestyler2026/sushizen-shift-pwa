# 引き継ぎ: COE（在職・退職証明書）の発行機能

Session 2（hotfix worktree）で調査・設計。**新規テーブル＋新規ページ＋PDF生成のため Session 1 に移送。**
調査日 2026-08-29 / 依頼元 HQ Ayako Nishimura（Peter Villafuerte の負荷問題が発端）

---

## なぜ急ぐか

**DOLE Labor Advisory No. 06-20**：従業員から請求があった場合、**3日以内**に COE を発行する義務。
DOLE は 2026年1月に改めてこれを周知している。**遅延・拒否は従業員が DOLE に申立てる事由になる。**

現状、COE は **`hr_offboarding` のチェックリスト項目「COE_ISSUED」（`app/db_hr.py:1564`）としてしか存在しない。**
発行する機能はゼロで、実務は Peter Villafuerte に依存している。**その依存を外すのが依頼の目的。**

---

## 依頼の原文（要約せず判断の根拠に使うこと）

> 1) COE は求められたら3日以内に出す必要があると DOLE からアドバイスが出ている。
>    OS に COE を発行する機能を加えてほしい。**Camilla さんがスタッフを選択、必要事項を記入、
>    私か他のマネージメントでアプルーバル**して、Peter さんに頼まない方が良さそう。
>
> 2) （テンプレート本文。下記「確定テンプレート」に転記）
>    **スシゼンと 7CZ を選択できる様にして頂ければ、どちらも対応できて早く問題解決できる。**

---

## 確定テンプレート（依頼者提供・変更しないこと）

```
CERTIFICATE OF EMPLOYMENT

TO WHOM IT MAY CONCERN:

This is to certify that [EMPLOYEE FULL NAME] was employed by
7CZ ANGEL CORP. / SUSHIZEN from [START DATE] to [LAST DATE OF EMPLOYMENT]
as [POSITION / JOB TITLE].

This certification is issued upon the request of the above-named individual
for whatever lawful purpose it may serve.

Issued this [DAY] day of [MONTH, YEAR] in the Philippines.

For 7CZ ANGEL CORP. / SUSHIZEN:

⸻
[AUTHORIZED SIGNATORY NAME]
[Position]
7CZ ANGEL CORP. / SUSHIZEN
```

**法人名は選択式にする**（`SUSHIZEN` / `7CZ ANGEL CORP.`）。テンプレートの
「7CZ ANGEL CORP. / SUSHIZEN」は、選ばれた方だけを出力する。

⚠️ **在職者にも発行義務がある。** テンプレートは退職者向けの文面なので、在職中は
`from [START DATE] to the present` とする分岐が要る（`was employed` → `has been employed`）。

---

## 先に読むべき「調べ直さなくていい」事実

### テンプレートを埋めるデータが揃っていない

```
[POSITION]     manila_staff_profiles.position        34 / 89名  (38%)
[START DATE]   manila_staff_profiles.official_hire_date  58 / 89名  (65%)
               staff_master.hired_at                 40 / 94名  (43%)
[LAST DATE]    hr_separation.last_working_date       2件のみ
法人区分       7CZ / SUSHIZEN を持つ列が存在しない     0
```

### 入社日は実績から復元できない（推定機能を作らないこと）

打刻から推定できるか実測した:

```
入社日と打刻の両方がある 55名
  完全一致           14名 (25%)
  入社日から7日以内   20名 (36%)
```

**4人に3人が一致しない。** さらに入社日が空の31名のうち23名は「初出勤日」が取れるが、その値は:

```
John Paul Cuevas / Nathaneil Santos / Cyrine Fernandez /
Peter Villafuerte / Jason Mark Fabillar …  全員 2026-04-01
```

これは入社日ではなく **OS が勤怠を取り始めた日**。Peter が2026年4月入社でないことは明らか。
**自動推定は実装しない。**

### 役職も OS の中には無い

`staff_master.role` は167件あるが**アクセス権限（ADMIN / STAFF / HQ）で職名ではない。**
`hr_onboarding.position` は9件のみ。**役職・入社日は契約書・201ファイルにしか存在しない。**

---

## 決定済みの方針（西村さん承認済み・再検討不要）

### 1. 新規登録は必須にする
Staff 作成フォームで **役職・入社日・所属法人を必須**にする。空欄が増えるのを止める。

### 2. 既存レコードの編集は必須にしない
**編集フォームを必須ゲートにしてはいけない。** 電話番号を直しに来た人が、保存するために
知らない入社日を入力せざるを得なくなる。**COE は法的文書で、「遅い COE」より
「日付が間違った COE」の方が深刻。** 推測させると半分外れ、外れた側が害になる（教訓34と同型）。

### 3. 止めるのは COE 発行時にする
役職または入社日が空のスタッフは、**COE 画面が発行を拒否し、何が足りないかを名指しする。**

```
COE を発行できません
  Peter Villafuerte — 入社日が未登録です
  契約書を確認して Staff ページで登録してください
```

法的リスクのある一点だけで止まり、94件のレコードに嘘が入らない。
期限が迫っている人から自然に埋まる。

### 4. 未入力者の一括入力画面を用意する
**編集フォームのゲートではなく、作業リストとして。** 未入力者だけを並べ、契約書を見ながら順に埋める。
対象は役職55名・入社日31名。

### 5. 法人区分（7CZ / SUSHIZEN）は既存分も必須化してよい
**2択で、現時点で誰でも答えられる**（給与・BIR の記録が持っている）。入社日と違い
「思い出せない」種類の情報ではないので、一括で埋める価値がある。

---

## 実装の範囲

### Phase A — 項目を持てるようにする
- **法人区分の列を追加**。置き場は `staff_master.company`（両都市を含む名簿なので、
  給与専用の `manila_staff_profiles` ではなくこちら）。値は `SUSHIZEN` / `7CZ`。
- Staff 作成フォーム（`src/app/admin/staff/create/page.tsx`、381行）に
  **役職・入社日・法人を追加し必須にする。**
  ⚠️ **役職と入社日は現在 `manila_staff_profiles` にあり、給与画面
  （`src/app/admin/payroll/manila/staff-profiles/page.tsx`）でしか編集できない。**
  Staff 作成時にそこへ書くか、列を移すかは実装者判断。**どちらにせよ二重管理にしないこと**（教訓20）。
- 未入力者の一括入力画面（Phase A の最後）。

### Phase B — COE の発行
- 新規テーブル：請求日 / 対象者 / 法人 / 役職 / 入社日 / 最終出社日 / 発行目的 /
  申請者 / 承認者 / 発行日時 / PDF。**再発行の履歴も残す**（同じ人に複数回発行される）。
- **3日の期限を画面に出す。** 請求日から3日を超えたら赤。義務が3日である以上、
  期限が見えない仕組みは作らない。
- 発行画面（Camilla が使う）:
  - スタッフを選ぶと OS が持っている値を自動で入れる
  - **どの値が OS 由来で、どれが手入力かを画面に出す**（後から検証できるように）
  - 空欄があれば発行を拒否し、足りない項目を名指しする（方針3）
  - **法人は明示的に選択**。自動判定できるデータがないので推測しない
  - 在職者 / 退職者の分岐（上記テンプレート注意書き）
- 承認 → PDF 発行。**PDF は `app/db_nte_v2_letter.py` の `render_nte_letter_pdf`
  （ReportLab）と同じ作りで書ける。**

---

## 触るファイル

| 対象 | パス |
|---|---|
| Staff 作成フォーム | `src/app/admin/staff/create/page.tsx` |
| 役職・入社日の現在の編集画面 | `src/app/admin/payroll/manila/staff-profiles/page.tsx` |
| 名簿テーブル | `staff_master`（`company` を追加） |
| 役職・入社日 | `manila_staff_profiles.position` / `.official_hire_date` |
| 最終出社日 | `hr_separation.last_working_date` |
| 退職チェックリストの COE 項目 | `app/db_hr.py:1564`（発行済みと連動させる） |
| PDF 生成の手本 | `app/db_nte_v2_letter.py::render_nte_letter_pdf` |

---

## 完了の判定

- Camilla が **Peter に依頼せず**、選択 → 記入 → 承認 → PDF まで到達できる
- 役職か入社日が空の人では**発行できず、何が足りないか画面に出る**
- 請求から3日を超えた案件が**赤で見える**
- 同じ人への再発行が履歴に残る
- **新規スタッフ登録で役職・入社日・法人が空のまま保存できない**

---

## 実装前に西村さんに確認すること

1. **承認者の範囲。** 依頼文は「私か他のマネージメント」。Petty Cash は 2026-08-29 に
   **HQ + ADMIN**（自己承認禁止）に揃えた。**COE も同じでよいか、HQ のみにするか。**
   ※ ADMIN は現在10名おり、うち2つはテストアカウント。
2. **一括入力を誰にやらせるか**（役職55名・入社日31名。契約書が要る）。
3. **署名者名（AUTHORIZED SIGNATORY）を固定にするか、発行ごとに選ぶか。**
