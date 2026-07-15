# SPEC: 緊急調達・サプライヤー確認システム

> ステータス: **設計完了・実装待ち**
> 作成日: 2026-06-21 (session 94)
> 担当: 次のセッションで着手可能

---

## 概要

マニラにおけるサプライヤー短納品問題と緊急調達の可視化・管理を目的とした2層防御システム。

---

## ビジネス背景

- マニラでは週2〜3件、サプライヤーが注文数量より大幅に少ない量しか納品しないケースが発生
- 発覚が納品当日・営業直前になるため緊急調達・営業リスクにつながっている
- 現状は口頭・電話で緊急調達が進み、本部が把握できていない
- ドバイは欠品がほとんどないため対象外

---

## 第一ファイアウォール：サプライヤー事前確認（Manila Only）

### 概要
- POは前日に作成される（翌日分）
- PO作成後、**本部Admin** がサプライヤーへ電話確認を行う
- 確認結果をOSに記録する
- Manila のPOにのみ表示。Dubai のPOにはこのステップを表示しない

### 新規DBテーブル: `supplier_confirmation_calls`
```sql
CREATE TABLE supplier_confirmation_calls (
    id              SERIAL PRIMARY KEY,
    po_id           INTEGER NOT NULL,            -- 既存PO/発注のID
    supplier_id     INTEGER,                     -- 既存vendorのID
    supplier_name   TEXT NOT NULL DEFAULT '',
    city            TEXT NOT NULL DEFAULT 'manila',
    call_date       DATE NOT NULL,
    called_by       TEXT NOT NULL DEFAULT '',    -- 本部Adminの名前
    call_time       TIMESTAMPTZ,
    result          TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' / 'confirmed_full' / 'confirmed_short' / 'no_answer'
    confirmed_items JSONB DEFAULT '[]',
    -- [{item_name, ordered_qty, confirmed_qty, unit, shortage_qty}]
    notes           TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### PO ステータス拡張
既存POテーブルに以下を追加（ALTER TABLE）:
```sql
ALTER TABLE procurement_orders
    ADD COLUMN IF NOT EXISTS supplier_confirmation_status TEXT DEFAULT 'not_required';
-- 'not_required' (Dubai) / 'pending' / 'confirmed_full' / 'confirmed_short' / 'no_answer'
ADD COLUMN IF NOT EXISTS supplier_confirmation_id INTEGER REFERENCES supplier_confirmation_calls(id);
```

Manilaで新規PO作成時: `supplier_confirmation_status = 'pending'` を自動セット

### APIエンドポイント（新規）
```
POST /api/admin/supplier-confirmation          # 確認結果を記録
GET  /api/admin/supplier-confirmation/pending  # 未確認POの一覧
GET  /api/admin/supplier-confirmation/{po_id}  # 特定PO の確認状況
```

### フロントエンド
- **Admin側**（既存調達画面に組み込み）:
  - Manila PO一覧に「Confirmation Status」列を追加
  - 「Pending」POに対して「Log Confirmation Call」ボタン
  - モーダル: result選択 / 欠品がある場合は品目ごとに確認数量入力 / notes
  - 欠品あり(confirmed_short)の場合 → 赤バッジ + マネージャーへ通知

---

## 第二ファイアウォール：緊急調達リクエスト（EPR）

### 概要
- 店舗スタッフが食材不足を発見したらOSから申請
- 承認なしに調達・配送を進めてはいけない（ハードルール）
- 金額に応じた承認者へ自動通知

### 新規DBテーブル: `emergency_procurement_requests`
```sql
CREATE TABLE emergency_procurement_requests (
    id              SERIAL PRIMARY KEY,
    city            TEXT NOT NULL,
    store           TEXT NOT NULL,
    requested_by    TEXT NOT NULL,
    request_date    DATE NOT NULL,
    urgency         TEXT NOT NULL,
    -- 'urgent_24h' / 'emergency_immediate'
    items           JSONB NOT NULL DEFAULT '[]',
    -- [{item_name, qty, unit, estimated_unit_price, estimated_total, notes}]
    total_estimated_amount NUMERIC(12,2) DEFAULT 0,
    root_cause      TEXT NOT NULL,
    -- 'supplier_short_delivered' / 'unexpected_high_demand' / 'damage_spoilage'
    -- / 'inventory_error' / 'other'
    root_cause_notes    TEXT NOT NULL DEFAULT '',
    linked_po_id        INTEGER,                -- 起因となったPOがある場合
    linked_confirmation_id INTEGER REFERENCES supplier_confirmation_calls(id),
    supplier_name       TEXT NOT NULL DEFAULT '',
    status              TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' / 'approved' / 'rejected' / 'completed'
    approval_level      TEXT NOT NULL DEFAULT '',
    -- 'ops_manager' (<=5000) / 'hq' (>5000)
    approved_by         TEXT NOT NULL DEFAULT '',
    approved_at         TIMESTAMPTZ,
    rejection_reason    TEXT NOT NULL DEFAULT '',
    final_amount        NUMERIC(12,2),
    completed_by        TEXT NOT NULL DEFAULT '',
    completed_at        TIMESTAMPTZ,
    completion_notes    TEXT NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

### 承認ロジック
```
total_estimated_amount <= 5,000 PHP  → approval_level = 'ops_manager'
total_estimated_amount >  5,000 PHP  → approval_level = 'hq'
```

### APIエンドポイント（新規）
```
POST   /api/store/emergency-request                      # 申請提出
GET    /api/store/emergency-request/my                   # 自分の申請一覧
GET    /api/admin/emergency-requests                     # 全件一覧（管理者）
GET    /api/admin/emergency-requests/{id}                # 詳細
POST   /api/admin/emergency-requests/{id}/approve        # 承認
POST   /api/admin/emergency-requests/{id}/reject         # 却下
POST   /api/admin/emergency-requests/{id}/complete       # 完了記録
GET    /api/admin/emergency-requests/stats               # 集計（根本原因別/店舗別/サプライヤー別）
```

### フロントエンド

#### 店舗側: `/store/emergency-request`
- アクセス権限: 全ストアスタッフ
- 申請フォーム:
  - 申請者名・店舗・都市（auth から自動入力）
  - 緊急度選択（Urgent 24h / Emergency 即日）
  - アイテム追加（品目名・数量・単位・単価・小計）
  - 合計金額の自動計算・承認レベル表示
  - 根本原因選択 + 補足テキスト
  - サプライヤー名（任意）
- 申請一覧（自分の過去の申請とステータス）

#### 管理者側: `/admin/emergency-requests`
- アクセス権限: ADMIN / HQ / MANILA_MANAGEMENT
- タブ:
  - **Pending（承認待ち）**: 承認/却下ボタン、緊急度バッジ
  - **All Requests**: 全件一覧、ステータスフィルター
  - **Analytics**: 根本原因別棒グラフ / 店舗別件数 / サプライヤー別件数 / 月次推移

---

## UI設計メモ

### 根本原因の表示ラベル
```
'supplier_short_delivered'  → "Supplier Short-Delivered"
'unexpected_high_demand'    → "Unexpected High Demand"
'damage_spoilage'           → "Damage / Spoilage"
'inventory_error'           → "Inventory Count Error"
'other'                     → "Other"
```

### 緊急度バッジカラー
```
urgent_24h          → amber (黄)
emergency_immediate → red   (赤)
```

### ステータスバッジカラー
```
pending   → zinc (グレー)
approved  → green
rejected  → red
completed → blue
```

---

## 実装順序（推奨）

### Phase A: EPR（緊急調達リクエスト）から先に実装
1. バックエンド: `emergency_procurement_requests` テーブル作成 + 全API
2. フロントエンド: `/store/emergency-request` （申請フォーム + 申請一覧）
3. フロントエンド: `/admin/emergency-requests` （承認ページ + Analytics）
4. デプロイ・動作確認

### Phase B: サプライヤー確認コール
1. バックエンド: `supplier_confirmation_calls` テーブル + PO拡張 + API
2. フロントエンド: 既存調達画面への組み込み（Pending POリスト + 確認入力モーダル）
3. デプロイ・動作確認

---

## 既存システムとの接続確認ポイント

- Manila POの発注テーブル名と主キー → `docs/ai/DATABASE_SCHEMA.md` 参照
- 既存vendorテーブル名 → `vendors` テーブル（city, name カラム確認）
- 通知機能 → 現状OSに push通知なし。承認待ちはダッシュボードのバッジで対応
- 都市判定 → auth の `city` フィールドまたはPO の `city` カラムで Manila / Dubai を判定
