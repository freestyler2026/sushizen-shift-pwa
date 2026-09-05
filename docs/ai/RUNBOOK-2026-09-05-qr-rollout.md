# 実行手順 — 2026-09-05 23:00 ドバイ時間（19:00 UTC）

---

## ✅ 実行済み — 2026-09-05（ドバイ時間・早朝）

オーナーが全10拠点でポスター掲示済みと確認 → **① を実行した。**

```
heroku config:set IN_STORE_CONFIRM_FROM=2026-09-04 -a sushizen-shift-app   # v2593
```

### ⚠️ 日付は UTC で比較される（教訓75と同型）

`_in_store_required_today` は `dt.date.today()`、つまり **UTCの日付**と比較する。
ドバイ(+4)・マニラ(+8)が既に 9/5 でも、UTCが 9/4 のうちは
`IN_STORE_CONFIRM_FROM=2026-09-05` では**ゲートが開かない**。

最初 `2026-09-05` を設定したが、実際に関数を呼ぶと全員 `免除` のままだった。
**設定しただけで確認しなければ、翌朝まで誰にも出ないことに気づけなかった。**
`2026-09-04` に変更して即時有効化。以後 `today >= 2026-09-04` は常に真なので、
この値のままでよい。

「現地の日付」で指定したいなら UTC との差（ドバイ4時間・マニラ8時間）を引いた日付を入れる。

### 有効化後の実測（本番で関数を直接呼んで確認）

| 拠点 | 判定 |
|---|---|
| dubai AB / AM / ARJ / BB / CK / JLT | ★要求される |
| manila CUB / PAR / TAFT | ★要求される |
| manila BO（Camilla Gadingan） | 免除 |
| manila CK（Peter Villafuerte） | 免除 ※マスタ上BO所属。正しい動作 |
| dubai DRIVER / 新規拠点 | ポスター無しで自動免除 |

対象は直近14日に打刻した **130名**、免除 8名。

### 戻し方
```bash
heroku config:unset IN_STORE_CONFIRM_FROM -a sushizen-shift-app
```

---

QRポスター運用開始にあわせた切り替え。**両方ともデプロイ不要・configのみ。**
戻すのは `heroku config:unset` 1回で、いずれも即時反映。

---

## 事前確認（実行前に必ず）

1. **ポスターは実際に貼られているか。** 貼られていない店舗が1つでもあれば、その店舗のスタッフは
   翌朝「読み取ってください」と言われて読むものが無い状態になる。
   資料: `docs/manuals/time-in-store-confirmation.html`（11枚・artifact `0780603b-9692-4a89-83fd-52305de0df1e`）
   - ドバイ AB / AM / ARJ / BB / CK / JLT / WH
   - マニラ TAFT / PAR / CK＋CUB（**共通1枚**）/ BO
   - ⚠️ `dubai/DRIVER` にはポスターが無い。**コード側で自動的に免除される**ので対応不要。

2. 現在の状態を確認する:
   ```bash
   heroku config:get IN_STORE_CONFIRM_FROM -a sushizen-shift-app       # 空＝未適用
   heroku config:get WFH_SELF_DECLARE_BRANCHES -a sushizen-shift-app   # 空＝誰でも宣言可
   ```

---

## ① QR確認を有効化する

```bash
heroku config:set IN_STORE_CONFIRM_FROM=2026-09-05 -a sushizen-shift-app
```

これで出勤後の画面に「もう1ステップ — ポスターを読み取ってください」が出る。

- **免除されるのは自動で**: BOスタッフ（`branch_code='BO'`）、ポスターが無い拠点（`os_branch_qr` に行が無い）
- 読めない場合は写真フォールバックが同じ画面に出る
- **これは表示だけで、打刻をブロックしない。** 未確認でも出勤自体は成立する

### 確認方法
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://sushizen-shift-pwa.vercel.app/attendance/confirm?t=x   # 200
```
ブラウザで `/attendance` を開き、出勤済みのスタッフで確認カードが出ることを見る。
BO Dashboard 上部に「30日でN件確認、全て店舗内から」の帯が出れば読み取りが届いている。

---

## ② GPS圏外の抜け道 — ✅ 2026-09-02 に実行済み（9/5には不要）

**実行済み。** オーナーの判断「BO以外のスタッフはWFHを許可していないので塞いでください」により
2026-09-02 に `WFH_SELF_DECLARE_BRANCHES=BO` を適用済み。9/5には何もしなくてよい。
打刻できない人向けに、403画面から「店舗の時計を撮って時刻を送る」経路を追加済み
（`POST /api/attendance/corrections` に写真つき → 管理側の承認キューへ）。

### 何が起きているか
`/api/attendance/wfh_declare` は本人が自分でタップするだけでWFH日を登録でき、
それが `_is_staff_gps_exempt` を True にするため **その日はジオフェンスが外れる**。
承認は無く、どの画面にも出ない。

- 直近60日の圏外打刻 **284件のうち231件がこの経路**
- BO以外の宣言者は90日で **58名**
- ただし**大半は悪用していない**。Muna Rana Magar（29回宣言）は実際には5〜45mで打刻、
  Jovenn Rio（11回）も19〜22m。宣言しても出社している
- 実際に圏外通過に使われたのは6名。最も明確なのは
  **Mahima Pansilu Dadallage（dubai CK・30回宣言・25回圏外・平均607m・最大2,542m）**
- ⚠️ **Mark Arvin Ocampo は50回宣言しているが圏外打刻は0件。** 宣言数だけを根拠に指摘しないこと

### 実行
```bash
heroku config:set WFH_SELF_DECLARE_BRANCHES=BO -a sushizen-shift-app
```
BO以外は宣言できなくなり、こう表示される:
「Working from home is set by your manager, not from this screen.
　If you are away from the branch today, message your manager.」

**既存の `os_wfh_days`（675件）は消えない。** 過去の勤怠計算は変わらない。

### 確認方法
```bash
heroku config:get WFH_SELF_DECLARE_BRANCHES -a sushizen-shift-app
```
翌日、圏外打刻（`check_in_gps_ok=FALSE`）が減っているかを見る。

---

## 戻し方（どちらも即時）

```bash
heroku config:unset IN_STORE_CONFIRM_FROM -a sushizen-shift-app       # QR確認を止める
heroku config:unset WFH_SELF_DECLARE_BRANCHES -a sushizen-shift-app   # WFH宣言を全員に戻す
```

---

## 実行後に見るところ

| 場所 | 何を見るか |
|---|---|
| BO Dashboard 上部 | 確認件数の帯。件数が伸びていれば読み取りが届いている |
| 同・遠距離スキャン | 3日以上、拠点の通常より外側で読んだ人。QRの持ち出し検知 |
| `check_in_gps_ok=FALSE` の件数 | ②実行後に減るはず。減らなければ別の経路がある |

翌朝（マニラ 07:00 / ドバイ 09:00）に一度見て、
**「読み取れない」という連絡が来ていないか**を確認する。来ていれば①を戻す判断をユーザーに仰ぐ。
