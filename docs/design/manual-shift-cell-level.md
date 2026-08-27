# Manual Shift — セル単位保存への移行 実装案

作成 2026-08-27 / 対象 `src/app/admin/manual-shift/page.tsx`, `app/main.py`, `app/db.py`

## なぜ作り直すか

不具合が個別に発生しているのではなく、**書き込み単位が「週全体」であること**から派生している。

```
ブラウザが週全体を保持 → Publish で週全体を上書き
  → 手元が古いと他人の変更を消す
  → だから古さを検知してブロックする必要がある（base_state_token / base_content_hash）
  → そのブロックが誤作動する
```

これまでの修正はすべて「ブロックを賢くする」方向だった。**ブロックが要らない形にする**のが正しい。

---

## 現状の構造（調査済み）

| テーブル | 制約 | 備考 |
|---|---|---|
| `shift_published_versions` | **UNIQUE (city, branch_code, week_start)** | 週×支店で1行。公開は常にこの1版 |
| `shift_published_rows` | version_id 外部キー | `/week` · My Shift · DTR · 給与がここを読む |
| `shift_draft_versions` | 一意制約なし | `save_draft_only` が毎回新規作成 → 版が溜まる |
| `shift_draft_rows` | version_id 外部キー | セル単位の行は既にある |

現在の書き込み経路:
- `POST /api/admin/shifts/save_draft_only` — 週全体を送り、新しい draft version を作る
- `POST /api/admin/shifts/manual_publish` — 週全体 + `base_state_token` + `base_content_hash`
- `POST /api/admin/shifts/delete_published_row` — 公開行を直接消す（今回の不具合の原因）

---

## 目指す構造

### 1. 作業用ドラフトを週×支店で1つに固定

`shift_draft_versions` に `is_working BOOLEAN DEFAULT FALSE` を追加し、部分一意インデックスを張る。

```sql
ALTER TABLE shift_draft_versions ADD COLUMN IF NOT EXISTS is_working BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_draft_working
  ON shift_draft_versions (city, branch_code, week_start) WHERE is_working;
```

AI ドラフトは `is_working = FALSE` のまま残るので、「Load AI Draft」は従来どおり動く。

`shift_draft_rows` に編集者を記録する。

```sql
ALTER TABLE shift_draft_rows ADD COLUMN IF NOT EXISTS updated_by TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_draft_rows_cell
  ON shift_draft_rows (version_id, staff_name, work_date);
```

### 2. セル単位の書き込み

```
PUT /api/admin/shifts/cell
{ city, branch_code, week_start, work_date, staff_name,
  shifts: [ { start_hour, end_hour, role, note } ] }     ← 空配列 = そのセルは空
```

処理:
1. 作業用ドラフト版を取得（無ければ作成）
2. `DELETE FROM shift_draft_rows WHERE version_id=? AND staff_name=? AND work_date=?`
3. `shifts` を INSERT（`updated_by` に実行者）
4. 更新後のセルと `updated_at` を返す

**削除は「空のセル」として表現する。** 公開行を直接消さないので、今回の「自分の削除で自分が古くなる」不具合は構造的に起きない。

分割シフト（1セルに複数）は delete+insert で自然に扱える。セル単位の一意制約は不要。

ペイントモードは1ドラッグで大量に発火するため、まとめて送る版も用意する。

```
PUT /api/admin/shifts/cells      { ..., cells: [ {work_date, staff_name, shifts}, ... ] }
```

### 3. Publish はサーバー側のドラフトから行う

```
POST /api/admin/shifts/publish_from_draft
{ city, branch_code, week_start }        ← グリッドを送らない
```

処理:
1. `pg_advisory_xact_lock(hashtext(city||branch_code||week_start))` — 同時 publish の直列化
2. 作業用ドラフト行を読む
3. `shift_published_versions` の該当版の行を置き換える
4. `_record_published_week_diff()` で差分を記録（実装済み）
5. 公開時点のドラフトを版として凍結（`is_working=FALSE` の複製を残す）→ 履歴になる
6. Google Sheets 書き出しは現状のまま

**`base_state_token` / `base_content_hash` は不要になるので削除する。** ブラウザは週の状態を主張しないので、古い/新しいという概念が消える。

### 4. 他の人の編集を見せる

```
GET /api/admin/shifts/draft_week?...&since=<ISO8601>
→ since 以降に更新されたセルだけ返す
```

- 5〜10秒間隔でポーリング
- **自分が編集中のセルには上書きしない**（フォーカス中のセルは除外）
- 「Ruby が 3 セル更新しました」程度の控えめな表示
- WebSocket は不要

### 5. UI の変更

| 現在 | 変更後 |
|---|---|
| Save Draft（週全体を保存） | **廃止**。編集は都度保存される |
| Publish（週全体を送信） | サーバードラフトを公開するだけ |
| localStorage ドラフト | **廃止**。破棄バナーもなくなる |
| 🗑 remove from grid | **「この人の1週間を空にする」**に変更。行は消さない |
| 「他の人が変更した」警告 | **廃止** |
| — | 追加: セルに最終更新者・時刻を表示 |
| — | 追加: **「ドラフトを破棄して公開版に戻す」** |

「下書きは非公開、Publish で公開」の区別は維持する。週をかけて組む運用が壊れるため。

---

## 削除するコード

フロント（`manual-shift/page.tsx`）:
- `saveDraft` / `loadDraft` / `draftIsCurrent` / `StoredDraft` / `DRAFT_MAX_AGE_MS`
- `baseStateTokenRef` / `baseContentHashRef` / `discardedDraftCells` / 破棄バナー
- `removedStaff` / `removedStaffRef` / `restampBasisAfterOwnEdit`
- 409 (`outdated_client` / `stale_grid`) のハンドリング

バックエンド:
- `manual_publish` の `base_state_token` / `base_content_hash` 検証
- `get_published_week_content_hash` / `_hash_published_rows`（他に利用が無ければ）
- `delete_published_row` は base shift 画面が使うため**残す**

---

## 段階

| 段階 | 内容 | 単独でリリース可能か |
|---|---|---|
| A | セル単位の書き込み（バックエンド + フロント配線）、localStorage ドラフト廃止 | 可。ただし Publish は旧経路のまま |
| B | `publish_from_draft` + ガード削除 | **A と同時が望ましい** |
| C | ポーリングと編集者表示 | 後日で可 |

A だけでは旧 publish 経路が残り、週全体を送り続けるため効果が半減する。**A と B は同時にリリースする。**

---

## 見積もり

| | 目安 |
|---|---|
| バックエンド（エンドポイント・マイグレーション・ロック） | 半日 |
| フロント（2,500行のページから旧機構を外して再配線） | 1日 |
| 検証（`/week` · My Shift · DTR · 給与 · Sheets 書き出し） | 半日 |

**合計 約2日。** ホットフィックスの範囲外。

---

## 注意点

1. **公開データの形式を変えない。** `/week`・My Shift・DTR 同期・給与エンジンが `shift_published_rows` に依存している。
2. **承認済み Day Off はドラフトにのみ適用**される現仕様を維持する。
3. **`shift_change_events` の差分記録**を publish 経路の変更後も動かす（今日、記録が無言で失敗していた前例あり）。
4. **「Load AI Draft」は作業用ドラフトを上書きする**ため、確認ダイアログを必須にする。
5. **公開時にドラフトの版を凍結**しておくこと。スプレッドシートの版履歴に相当し、誤った一括編集を戻せる唯一の手段になる。
6. `publish_week_from_base_shift` の6時間ガードは別経路。触らない。

---

## 暫定対応（2026-08-27 実施済み・根本解決ではない）

- 自分の削除で自分のグリッドが古くなる不具合を修正（`restampBasisAfterOwnEdit`）
- デプロイ時の強制リロードで入力が消える件を修正（`useUnsavedGuard` に登録）
- 削除した行がリロードで復活する件を修正（ローカルドラフトに記録）

いずれも週全体モデルの上での対処であり、本移行時にすべて削除される。
