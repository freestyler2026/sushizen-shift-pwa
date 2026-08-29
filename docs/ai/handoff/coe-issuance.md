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

## Session 1 の検証で確定した事項（2026-08-29 追記）

上記の数値は本番データで**すべて再現できた**（一致率25.5%、初出勤の 2026-04-01 集中10名、
`render_nte_letter_pdf` の実在）。推定を作らない判断・編集フォームを塞がない判断は正しい。
そのうえで、仕様書が触れていなかった4点を確定させた。

### A. 法人区分は**マニラ限定**。ドバイには関係しない

`SUSHIZEN` / `7CZ` は**フィリピンの法人**であり、7CZ は
**バックオフィスメンバーの一部の在籍法人**（全員フィリピン在住）。
`staff_master` は両都市の名簿（dubai 73 / manila 94）なので、
**この2択を全員に必須化してはいけない。**

- マニラのバックオフィス（`branch_code='BO'`）は **14名（うち在籍12名）**。7CZ はこの中の一部
- **ドバイ73名は COE の対象外**（DOLE はフィリピンの規則）。法人区分も不要
- 必須化するのは **city='manila' のときだけ**

> ドバイにも法人は2つある（RAMENZEN RESTAURANT LLC / ZEN FOOD LABS DMCC）が、
> これは VAT 申告の単位であり COE とは別系統。将来 VAT 実装で法人マスタを作るなら
> そちらと統合できるが、**COE のために先回りして作る必要はない。**

### B. 入社日の正は `manila_staff_profiles.official_hire_date`

両方に値がある37名のうち**3名が不一致**だった。判定基準ができたので確定できる ——
マニラのレストランは **2025年8月**に開業準備を開始しており、それ以前の入社日はあり得ない。

```
staff_master.hired_at         < 2025-08:  1件  ← Ricardo Lamis III (2025-02-24) 不正
official_hire_date            < 2025-08:  0件
カバー率                       58 / 89  vs  staff_master 40 / 94
```

**`official_hire_date` を正とする。** 件数が多く、不正値がゼロ。
`staff_master.hired_at` は表示専用にするか、`official_hire_date` から同期する。
**Ricardo Lamis III の `staff_master.hired_at` は誤りとして修正する**（正 2025-12-28）。

### C. 退職は `hr_separation` が正。`staff_master` へ**自動反映**する

HR が `hr_separation` に先に入力し、Admin スタッフがそれを聞いて `staff_master` に登録している。
**連携が存在しないため、2つの登録簿の重なりがゼロになっている。**

```
staff_master.status='SEPARATED'  4名 — 全員 hr_separation に記録なし（最終出社日が取れない）
hr_separation                    2名 — どちらも SEPARATED になっていない
```

⚠️ **発火は「登録時」ではなく「最終出社日の到来」で行うこと。**
実データで両方のケースが出ている:

| 氏名 | 最終出社日 | `staff_master` | 保持ロール | ログイン |
|---|---|---|---|---|
| Tricia Andrea Estrada | 2026-08-10（**19日前**） | ON_LEAVE | INVENTORY_PURCHASING | **可能** |
| Aaron Jay Pamplona | 2026-08-31（2日後） | ACTIVE | MANILA_STAFF | 可能（**正しい**） |

Aaron はまだ在籍しているので ACTIVE が正しく、登録時に発火させると**在職者を締め出す**。
Tricia は逆に、19日前に退職しているのにロールとログインが生きている。

**この連携は権限に直結する。** `resolve_staff_access_profile` は
`status='SEPARATED'` でロールを剥奪するため（2026-08-28 実装）、
反映した瞬間にその人の権限が消える。**意図した動作だが、実行前に対象者を名前で確認すること**（教訓21）。

### D-2. 承認者は5名。**当番表は権限に写さない** <span>確定</span>

西村さんから提示されたのは、店舗ごと・曜日ごとの**当番表**である。

```
Taft        Francis（火〜日） / 月曜と Francis 休みは Ayako
Paranaque   Richard（木・土・日） / 残りは Peter
CK・Cubao   Richard（月・水・金） / Uejima（火・木・土・日）
```

**これを曜日ルールとして実装してはいけない。**当番表の目的は
「いつでも誰かが対応できる」ことであり、曜日で承認者を縛ると、
**シフトを交代した日に、実際に出ている人が承認できなくなる。**
当番表が教えているのは<b>誰に権限を渡すか</b>であって、<b>いつ誰が使えるか</b>ではない。

COE は法人単位の対外文書で、店舗業務ではない。**店舗スコープも付けない。**
申請画面に対象者の所属を表示すれば、自然に担当者が拾う。強制はしない。

付与対象（全員 ACTIVE を確認済み）:

| 氏名 | 所属 | 現在の付与ロール |
|---|---|---|
| Ayako Nishimura | dubai / HQ | HQ |
| Yusuke Uejima | dubai / HQ | HQ |
| Peter Villafuerte | manila / BO | HR_MANAGER, MANILA_MANAGEMENT |
| Richard S. Gante | manila / CUB | MANILA_MANAGEMENT, MANILA_MANAGER |
| Francis Ibana | manila / CUB | MANILA_MANAGEMENT, MANILA_MANAGER |

✅ **Francis Ibana で確定**（2026-08-29 西村さん確認済み）。
同名の `Francis Angelo Dizon`（PAR・STAFF・ロールなし）とは別人。
権限を付ける際は**氏名の完全一致で照合すること** —— 部分一致で拾うと
ロールを持たない方に対外文書の承認が渡る。

> この構成でも依頼の目的は達成される。Peter は**全件の発行**から
> **Paranaque分の承認**に減り、作成は Camilla が行う。

### D. 承認者は既存ロールを流用しない

`ADMIN` は `staff_auth.role` には**存在せず**、`staff_role_assignments` に11名いる（教訓25）。
内訳は **Test Account / Test Admin Account の2件**、SEPARATED 1名（ゲート済）、
残る8名は**店舗・バックオフィスのスタッフでマネージメントではない**。
HQ と合わせると16名になる。

依頼文の「私か他のマネージメント」はこの16名を指していない。
**COE 専用の権限キーを作り、実際のマネージメントにだけ付ける**（教訓32：広い鍵を使い回さない）。
Petty Cash に揃える必然性はない —— あちらは社内の金銭処理、COE は対外文書で誤りの向きが違う。

### E. 署名者名 <span>確定</span>

**発行ごとに選択（既定値あり）**。固定にすると署名者交代のたびにコード変更が要る。

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

### Phase 0 — 印字する値を正しくする（Session 1 追加） <span>実施済 2026-08-29</span>

**完了分:**

- ✅ `Ricardo Lamis III` の `staff_master.hired_at` を 2025-02-24 → **2025-12-28** に修正
- ✅ `hr_separation` → `staff_master` の反映を実装（`sync_separations_to_master`）。
  **`last_working_date <= 今日` で発火**。worker が毎日マニラ08:10に実行、
  `create_separation` の末尾でも呼ぶ（遡り入力を翌日まで待たせないため）。
  **SEPARATED 方向にしか動かさない** —— 復職は Staff ページでの明示操作にする
- ✅ 実行結果：`Tricia Andrea Estrada`（最終出社 2026-08-10）を SEPARATED 化。
  `resolve_staff_access_profile` が `role=STAFF / 権限0` を返すことを確認。
  `Aaron Jay Pamplona`（最終出社 2026-08-31）は ACTIVE のまま・権限46を維持

**判断を保留した分:**

- ⚠️ **入社日の残る不一致2件は上書きしていない。** 2つの列は冗長なコピーではなく、
  **別々の機能が読んでいる**ことが判明した:

  | 列 | 読んでいる機能 |
  |---|---|
  | `staff_master.hired_at` | **試用期間**（`db_probation.py` の新入社員判定） |
  | `manila_staff_profiles.official_hire_date` | **給与**（日割り計算） |

  一括同期すると試用期間側の判定が動く。どちらが正しいか分からないまま上書きするのは、
  この仕様書が禁じている「推測して埋める」ことそのもの。**契約書での確認が要る:**

  | 氏名 | `staff_master` | 給与プロファイル | 差 |
  |---|---|---|---:|
  | Alex Delgado | 2026-01-26 | 2026-01-06 | 20日 |
  | Gerald Solomon | 2026-06-15 | 2026-06-18 | 3日 |

  **COE は `official_hire_date` を読む**（不正値ゼロ・カバー率が高い）ため、
  この2件が未解決でも COE の実装は進められる。

- ⚠️ **`Anthony Plaza` が名簿に無い。** `manila_staff_profiles` と勤怠には居るが
  `staff_master` に無く、**8/11〜8/25 に稼働している現役スタッフ**。
  名簿への追加は HR の判断なので実施していない。
  他の8名（`Alyza Arabela Lagrimas` ほか）は4月のみの稼働で、初期の離職者と思われる。

  → **一括入力画面は `manila_staff_profiles` ではなく `staff_master` を軸にすること。**
  そうしないと Camilla の作業リストに退職済み8名が並ぶ。

**担当者確定:** 一括入力は **Camilla Gadingan**。管理者が承認時に値を検証する二段構えにする。
BO（本部）から着手する —— 入社日欠損8/11 が集中しており、契約書が同じ office にある。

---

### Phase 0 の当初計画（参考）

COE は法的文書で、**間違った日付の証明書は無いより悪い**というのがこの仕様書自身の主張である。
その主張に従うなら、値を印字する機能より先に値を直す。新規実装を伴わない。

- `Ricardo Lamis III` の `staff_master.hired_at` を修正（2025-02-24 → 2025-12-28）
- 入社日の正を `official_hire_date` に決め、`staff_master.hired_at` を同期または表示専用にする
- `hr_separation` → `staff_master`（`status` / 最終出社日）の反映を実装。
  **`last_working_date <= 今日` で発火**。既存2名のうち Tricia のみが対象
- ~~SEPARATED 4名の最終出社日を登録~~ → **この4名はスキップする**（HRマネージャーが別途対応）。
  COE 側は「最終出社日が無い退職者は発行を拒否し、名指しする」だけでよい

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

1. ~~承認者の範囲~~ → **上記 D-2** で5名に確定。曜日ルールは実装しない。Francis Ibana で確定済み。
2. **一括入力を誰にやらせるか**（役職55名・入社日31名。契約書・201ファイルが要る）。
   Camilla（COE の運用者）か Marithel（BIR 記録の保管担当）が候補。**唯一の未決事項。**
3. ~~署名者名~~ → **上記 E**。発行ごとに選択（既定値あり）で確定。
4. ~~SEPARATED 4名の最終出社日~~ → **スキップ確定**（HRマネージャーが別途対応）。
