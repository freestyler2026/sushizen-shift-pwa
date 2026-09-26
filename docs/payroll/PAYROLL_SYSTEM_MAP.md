# 給与システム全体像 — 読む前に触らない

**2026-09-26 作成。** 1日で給与に関する誤報を5回出した直後に書いた。
原因はどれも能力ではなく、**「どの表が何の正であるかを確かめずに答えた」**こと。

> **この文書の使い方**
> 給与・勤怠・控除に関わる作業をする前に、**この1本だけ**読む。
> 全コードを読む必要はない。読むべきは「§1 最初に間違える7つ」と、触る都市の節。
> **数字を報告する前に §7 の検算手順を通す。**

---

## §0 いちばん大事なこと

**2つの都市は別のシステムである。** 共有しているのは `absences` テーブルと
`app/attendance_facts.py` の分類定義だけ。エンジン・勤怠表・締め期間・列名・
法定控除のすべてが別物。**片方で確かめたことを、もう片方の根拠にしてはいけない。**

| | マニラ | ドバイ |
|---|---|---|
| エンジン | `app/manila_payroll_engine.py` (2,580行) | `app/dubai_payroll_engine.py` (671行) |
| 勤怠表 | `manila_attendance_daily` | `dubai_attendance_daily` |
| 締め | **半月×2**（1H/2H） | **月1回・26日〜翌25日** |
| 休暇フラグの列名 | `paid_leave_flag` | **`annual_leave_flag`** |
| 給与の出どころ | `manila_staff_profiles.monthly_rate` | `payroll_salary_configs.basic_salary` |
| エンジンの役割 | **明細を全部作る** | **調整だけ作る**（基本給は別） |
| 法定控除 | SSS/PhilHealth/Pag-IBIG/BIR | 無し |
| 退職金 | 無し | **あり**（UAE労働法 33/2021） |

---

## §1 最初に間違える7つ

私が実際に間違えた順。**報告の前にこの7つを自問する。**

### ① `monthly_rate` と `basic_salary` は違う

ドバイには2つの金額がある。**控除の計算に使うのは `basic_salary` だけ。**

```
payroll_salary_configs.basic_salary   ← 控除・時給・日給の基礎。手当を含まない
dubai_staff_profiles.monthly_rate     ← 基本給＋住宅＋交通の合計（支給総額）
```

**67名全員で両者は一致しない。** 平均して `monthly_rate` は約40%高い。
`monthly_rate` で控除を計算すると、全部の金額が4割増しになる。
（2026-09-25 実際にやった。欠勤控除を AED 1,174 と報告し、正解は AED 858。）

日給 = `basic_salary ÷ 26`、時給 = `basic_salary ÷ 26 ÷ 8`。

### ② 時給制の人には罰則が一切かからない

`payroll_salary_configs.hourly_rate > 0` の人は `paid_by_the_hour`。
**遅刻・欠勤・早退・打刻漏れの控除も、遅刻累積の5%罰則も、すべて適用されない。**
働いた時間に対して払うので、いない時間を引くと二重に取ることになる（オーナー規則 2026-09-23）。

例外は `break_excess` だけ。休憩は打刻の内側にあり、既に支払われているため。

> **控除の件数や金額を出すときは、必ず `hourly_rate` で除外する。**
> しなかった結果：「5%遅刻ペナルティ3名・AED 369」と報告 → 実際は**1名・AED 90**。
> 2名は時給制で対象外だった。

ドバイの時給制8名（2026-09-26 時点）:
Bijien Mijar / Dipesh Thapa / Kelvin Gurung / Mahima Pansilu Dadallage /
Padam Bahadur K C / Pukar K C / Raman Miya / Rubash Khadka

### ③ ドバイのエンジンは基本給を作らない

`compute_dubai_attendance_adjustments()` が作るのは `payroll_adjustments` の
**加算・減算だけ**。基本給は別経路で支払われる。

つまり **勤怠が1行も無い人は満額支給される。** 控除する根拠が無いだけで、
支給は止まらない。退職者・長期休職者を「勤怠が無いから0円」と考えてはいけない。

（2026-09-25：出勤0〜5日の4名が満額支給される状態だった。3名は退職済み、
1名は入社2日目で日割り調整が漏れていた。**合計 約 AED 6,800。**）

### ④ お金を生む処理は9本しかない（ドバイ）

`app/dubai_payroll_engine.py` の `_push()` を数えれば閉じた集合になる。

| 種別 | コード | 時給制に適用 |
|---|---|---|
| 加算 | `night_premium`（22:00–04:00 GST・10%） | ○ |
| 加算 | `approved_overtime`（**承認済み申請から**。打刻からではない） | ○ |
| 減算 | `late_deduction`（15分猶予超。ただし8時間働いた日は課金しない） | × |
| 減算 | `late_surcharge`（正味60分超で日給の10%） | × |
| 減算 | `absent_awp`（`absent_without_pay` かつ休暇でない日） | × |
| 減算 | `undertime_deduction` | × |
| 減算 | `missing_punch`（1時間分。**当日はまだ課金しない**） | × |
| 減算 | `break_excess`（所定＋60分超） | **○** |
| 減算 | `monthly_late_accumulation`（15分超が3回で基本給の5%） | × |

**この9本以外に自動で発生する金額は無い。** 他にあるのは
`payroll_adjustments` の `source='manual'`（日割り等）と `expense_auto`（経費精算）だけ。

### ⑤ 「欠勤」と「休暇」と「公休」は別物 — `absences` は3つとも持つ

```python
# app/attendance_facts.py — 唯一の定義。ここ以外にリストを書かない
AWP_TYPES        = {"ABSENT"}                       # 本当の欠勤。これだけ控除対象
PAID_LEAVE_TYPES = {"VACATION_LEAVE", "MEDICAL_LEAVE", "MATERNITY_LEAVE",
                    "BEREAVEMENT_LEAVE", "INJURY", "HOSPITAL"}
# DAY_OFF はどちらにも属さない。勤務を求めていない日は欠勤でも休暇でもない
```

`absences` を集計するコードは**必ず種別で絞る**。絞らないと休暇が欠勤になる。

> 2026-09-26、**4つの画面**が絞らずに数えていた。ドバイ 9/1–9/25 の表示は
> 「欠勤123」、内訳は VACATION_LEAVE 101 / DAY_OFF 1 / **実際の欠勤 15**。
> 休暇を取った4名が「要注意」に色付けされていた。
> 守るテストは `tests/test_leave_is_not_absence.py`（クラス全体を走査する）。

### ⑥ ロスターの「VL」はシフトではない

`shift_published_rows.role` に `VL` / `DAY_OFF` 等が入る。共有定数は
`db._NON_WORKING_ROLES`。勤務予定を数えるクエリは**必ず除外する**。
しないと休暇日が「シフトがあるのに来なかった」＝無断欠勤になる。

### ⑦ 打刻は休暇記録に優先する（意図的な仕様）

ドバイ同期（`main.py:50563` 付近）:

```python
# A clock-in always outranks an absence: if they punched, they worked.
already = {(r["staff_name"], r["work_date"]) for r in synced_rows if r["actual_time_in"]}
for ab in absences_list:
    if key in already: continue      # ← 打刻があれば休暇記録を捨てる
```

**バグではない。** ただし結果として、休暇記録のある日に打刻があると
`annual_leave_flag` は立たず、早退・遅刻の控除が発生しうる。

> 2026-09-26 実測：9月サイクル148休暇日のうち、DTRと食い違うのは**1日だけ**
> （Lyssa Rae 9/6、3時間30分出勤）。**残り147日は一致。**
> この1日は「休暇初日に早退した」のか「休暇記録が1日早い」のか、
> 記録からは決まらない。**人に聞く以外にない。**

---

## §2 マニラ

### 締め
半月2回。**1H = 前月26日〜当月10日、2H = 当月11日〜25日。**
暦月・暦年との対応は `docs/payroll/manila-cutoff-to-calendar-month.md`。

### エンジンが出す明細
`ITEM_LABELS`（`manila_payroll_engine.py:157`）が全コードの一覧。
支給・控除・会社負担あわせて約60種。**この辞書に無いコードは存在しない。**

主なもの: `MONTHLY_BASIC`（月額の1/2）/ 休日割増4種 / `OT_PAY` 4種 /
`NIGHT_DIFF_*` 8種 / `ABSENT_DEDUCTION` / `LATE_DEDUCTION` /
`UNDERTIME_DEDUCTION` / 法定控除 / ローン / `MANUAL_*`

### 法定控除 — 4制度は基礎が違う（教訓106）

**「法定控除」とひとくくりにして同じ基礎を当てると月中入社が壊れる。**

| 制度 | 基礎 | 根拠 |
|---|---|---|
| SSS | その月の**実報酬** | RA 11199（MSC は total actual remuneration） |
| WISP/MPF | MSC が **₱20,000超のときだけ**発生 | 同上 |
| PhilHealth | **契約上の月額基本給**（日割りしない） | Advisory 2025-0002 |
| Pag-IBIG | その月の**実報酬**（上限 ₱10,000） | HDMF Circular 460 |
| BIR | **その締め期間の実報酬**（半月表） | RR 11-2018 Annex E |

- **2回目の締めが精算する。** 月額から1回目が取った額を引く。
  取りすぎていれば**制度ごとに**返金（`REFUND_SSS_EE` 等）。
  まとめて1本で返すと、その制度の月合計が料率表のどの行とも一致しなくなる（教訓108）。
- **入社日を含む締めで勤務日数が期間の半分未満なら、その締めでは徴収しない**
  （`STATUTORY_DEFERRED`）。免除ではなく次の締めで全額。
- **手取りがマイナスになる場合は給与の範囲で按分**し、取れなかった額を
  `STATUTORY_UNCOLLECTED` として明細に出す。会社の納付義務は変わらない。

### 未実装（重要）
- **年末調整（NIRC §79(H)）が無い。** 12月に差額を精算していない。
  過大徴収を返金しないと **NIRC §252** の罰則対象で、substituted filing も壊れる（教訓107）。
- 年初来データ `manila_ytd_opening` が**空**。システムは 2026-06-25 以降しか持たない。
  このまま年額を出すと全員を過小徴収する。**12月の計算より前に埋める。**

### 過去期間を再計算してはいけない（教訓37）
エンジンは実行時に `manila_staff_profiles` を読む。7月を再計算すると
**7月以降の昇給が7月に遡って適用される。**
2026-08-28 に実際に起きた：42名中37名の月額が書き換わり、合計 +₱84,235。

再計算するなら**先にバックアップ**:
```sql
CREATE TABLE _payroll_items_backup_YYYYMMDD AS
  SELECT * FROM manila_payroll_items WHERE period_id IN (...);
```
検証は `manila_payroll_runs.monthly_rate` をバックアップと比較。1件でも動いていたら遡及汚染。

---

## §3 ドバイ

### 締め
**26日〜翌25日。** `payroll_cycles` に `period_start` / `period_end`。
時給制だけ別窓（`hourly_period_start` / `hourly_period_end`）を持つことがある。

> UAE法は1日を支払期日とするので、1日〜月末の締めだと処理日がゼロになる。
> 新しいサイクルを作るときは必ず期間を設定する。

### 調整の生成
`POST /api/admin/dubai-payroll/auto-adjustments` が
**既存の `attendance_auto` を削除してから再作成する。** dry-run は無い。
**検証目的で叩かない。**（教訓54）

閉じたサイクルは409で拒否される。

### 退職金・未消化有給
`app/dubai_eos.py`（Federal Decree-Law 33/2021 第51条・第29条）。
**読む前に知っておくべき2つの欠陥:**

1. **勤続年数が過少。** `dubai_staff_profiles.hire_date` が全員NULLのため
   「給与データに最初に現れた月」で代用している（67名中65名が推定）。
   一方 `staff_master.hire_date` には**79名中72名に実際の入社日**がある。
2. **未消化有給が過大。** 休暇記録が 2026-06-01 以降しか無いため、
   全員「取得0日」として計算されている。

会社債務として出る **退職金 AED 112,290 / 有給 AED 166,595** は、
この2つの理由でどちらも信用できない。

---

## §4 表と表の関係 — どれが正か

```
承認リスト（HRの文書・人が作る）        ← 休暇の一次資料。システムの外
      ↓ 人が入力
absences (city, staff_name, work_date, absence_type)
      ↓ 同期が読む                     ↓ 分析画面が読む
manila_attendance_daily               Absence分析 / OS Attendance Summary
dubai_attendance_daily
      ↓ エンジンが読む
payroll_adjustments / manila_payroll_items
```

**食い違いが起きる点は3つ。**

| 食い違い | 何が正か | 確認方法 |
|---|---|---|
| 承認リスト ↔ `absences` | **承認リストが正**（一次資料） | 日付の端を突き合わせる |
| `absences` ↔ 勤怠表 | 打刻があれば勤務が優先（§1⑦） | 下の検算クエリ |
| ロスター ↔ 勤怠表 | 実打刻が事実、ロスターは予定 | 教訓18 |
| `hr_separation` ↔ 給与プロフィール | **給与プロフィールに入力された退職日が優先**（人が意図して打った値。NULLのときだけHR記録で埋める） | `main.py:41350` 付近 |

> **2026-09-26 の実例。** Lyssa Rae の休暇は
> 承認リスト **9/7〜9/25** ／ `absences` **9/6〜9/25**（1日早い）。
> 9/6 はロスターに 13:00–22:00 の勤務があり、本人は 12:49–16:19 に打刻。
> 9/7 以降は打刻なし。**5つの情報源のうち4つが「9/6は勤務日」**と言っており、
> `absences` だけが違う。
> 私は `absences` 1つだけを見て「休暇初日だから控除は誤り」と助言し、**間違えた。**

---

## §5 触る前に確認する権限とマスク

- 給与APIは `_salary_view_mode(actor)` でマスクされる。HQ か `*` 権限のみ "all"。
- **マスクはAPI層。one-off dyno や psycopg2 の直読みには一切かからない。**
  ファイルを作った瞬間に保護は消える（教訓67・68）。
- **人別の金額を含むファイルは、作る前に宛先を決める。**
  渡す直前に `python3 scripts/check-export-audience.py <file> --for "<誰>"` を通す。
- 控除額は `basic ÷ 26` なので、**控除額を書けば基本給が逆算できる。**
  金額を載せるかは宛先で決める。

---

## §6 やってはいけないこと

| | なぜ |
|---|---|
| 過去期間の再計算 | 現在のレートで上書きされる（教訓37） |
| `auto-adjustments` を検証目的で叩く | 既存の調整を削除して作り直す |
| `monthly_rate` で控除を計算 | 4割増しになる |
| 時給制を除外せずに罰則を数える | 対象外の人を数える |
| `absences` を種別で絞らずに数える | 休暇が欠勤になる |
| 自前の休暇種別リストを書く | 新しい種別で必ずずれる。`attendance_facts` を使う |
| 勤怠が無い＝支給0 と考える | ドバイは基本給が別経路 |
| 1つの表だけ見て事実を断定 | §4 の食い違いを見落とす |

---

## §7 数字を報告する前の検算

### 7-1 控除の全体像（ドバイ）
```
1. payroll_salary_configs から basic_salary と hourly_rate を取る
2. hourly_rate > 0 の人を罰則の対象から外す
3. dubai_attendance_daily の全行に §1④ の9本を当てる
4. 3つに分類する：人に聞く / 記録が矛盾 / そのまま請求
5. 3つの合計が全控除額と一致することを確認する ← ここが検算
```
一致しなければ、分類から漏れた行がある。

### 7-2 休暇が欠勤になっていないか
```sql
-- 0件でなければならない
SELECT staff_name, work_date FROM dubai_attendance_daily
 WHERE annual_leave_flag AND absent_without_pay;
```
```
GET /api/admin/analytics/absence/by_staff?city=&date_from=&date_to=
  → absent_days と leave_days が分かれて返る。混ざっていたら退行
```

### 7-3 休暇記録と勤怠表の食い違い
`absences` の休暇日を取り、勤怠表の同じ日に休暇フラグが立っているか比べる。
**食い違う日は人に聞く。** 2026-09-26 時点では 148日中1日。

### 7-4 支給されるが勤怠が無い人
```
月給制 かつ (出勤日+休暇日+欠勤日) が期間日数に満たない かつ
partial_month の調整が無い  → 満額支給される。退職・入社・記録漏れのいずれか
```

### 7-5 デプロイ後
```bash
curl -s -o /dev/null -w "%{http_code}" https://sushizen-shift-pwa.vercel.app/api/admin/overview
# 401 = 起動している / 503 = 落ちている
```
`sushizen-shift-app.herokuapp.com` を直接叩くと全パス404。落ちていると誤読しない。

---

## §8 この文書を書くきっかけになった誤報（2026-09-25〜26）

**同じ日に5回。全部「1つの情報源だけ見て断定した」。**

| 報告した内容 | 実際 | 見ていなかったもの |
|---|---|---|
| 遅刻ペナルティ3名 AED 369 | **1名 AED 90** | `hourly_rate` |
| 欠勤控除13日 AED 1,174 | **10日 AED 858** | 同上 |
| 質問14名で完全 | 23名（4回増えた） | 網羅の方法が無かった |
| 「10時間シフトが一律おかしい」 | 完走しないのは1名だけ | 人別の実績 |
| 「Lyssa 9/6 は休暇初日」 | 承認リストは9/7から | 承認リスト・ロスター・打刻 |

**網羅を主張できるようになったのは、コードから `_push` を9本全列挙して
全61件を分類し、3つのバケットの合計が総額と一致することを示してから。**
それ以前の「調べました」は、調べた範囲を述べていなかった。

---

## §9 関連ファイル

| 用途 | 場所 |
|---|---|
| 休暇/欠勤の分類（唯一の定義） | `app/attendance_facts.py` |
| ロスターの非勤務役割 | `app/db.py` `_NON_WORKING_ROLES` |
| マニラ エンジン | `app/manila_payroll_engine.py` |
| ドバイ エンジン | `app/dubai_payroll_engine.py` |
| ドバイ 退職金 | `app/dubai_eos.py` |
| 締めと暦月の対応（マニラ） | `docs/payroll/manila-cutoff-to-calendar-month.md` |
| 休暇≠欠勤を守るテスト | `tests/test_leave_is_not_absence.py` |
| DTR修正→給与再計算 | `app/manila_dtr_recompute.py` |
