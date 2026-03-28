# Procurement Notification Runbook

本書は仕入れ統制の通知運用を `Workforce OS Push` 一本化で実施するための手順です。

## 1. 対象

- 通知チャネル: `WORKFORCE_PUSH` のみ
- 起点イベント:
  - 新規承認ケース作成
  - ケースエスカレーション
  - 手動再送API実行

## 2. 必須環境変数

- `WORKFORCE_OS_PUSH_WEBHOOK_URL`
  - Push配信先Webhook URL
- `WORKFORCE_OS_PUSH_API_KEY`
  - Bearer token（未使用環境は空でも可）
- `WORKFORCE_OS_APP_BASE_URL`
  - 通知本文のCase詳細画面リンク生成に使用

任意（設定時はDB fallbackより優先）:

- `PROC_NOTIFICATION_RECIPIENTS_JSON`
  - staff/role ごとの通知先マップ（`workforce_push_user_key`）

不要（設定不要）:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `TWILIO_SMS_FROM`

## 3. Recipient解決

`PROC_NOTIFICATION_RECIPIENTS_JSON` が優先されます。未設定時は `staff_master.workforce_push_user_key` を利用します。

例:

```json
{
  "staff": {
    "jay nishimura": {
      "staff_name": "Jay Nishimura",
      "role": "HQ",
      "workforce_push_user_key": "jay-hq-device"
    }
  },
  "roles": {
    "FINANCE": [
      {
        "staff_name": "Finance Shared",
        "role": "FINANCE",
        "workforce_push_user_key": "finance-device"
      }
    ]
  }
}
```

## 4. 記録仕様

`proc_approval_notifications` には新規通知を1行ずつ保存します。今後の新規通知は `channel=WORKFORCE_PUSH` のみです。

既存の `WHATSAPP` 履歴は削除せず参照可能です。

`proc_audit_logs` の通知関連 action:

- `procurement.notification.workforce_push.sent`
- `procurement.notification.workforce_push.failed`
- `procurement.notification.workforce_push.resent`

## 5. 失敗時の見え方

- Push失敗時でもケースworkflowは継続
- `proc_approval_cases.blocked_reason` に通知失敗要約を追記
- `Approval Inbox` で失敗案件を赤系強調表示
- `Case Detail` の `Notification Timeline` で `error_text` を確認

## 6. 手動再送手順

1. `Case Detail` を開く
2. `Resend Push Notification` を押下
3. PIN付きで `/api/admin/procurement/cases/{case_id}/notifications/resend` が実行される
4. `Notification Timeline` に再送結果（成功/失敗）が追加される
5. `Audit` で `procurement.notification.workforce_push.resent` を確認する

## 7. 動作確認手順

1. 必須環境変数を設定し、通知先マップを投入する
2. request submit で case を作成し、通知行が `WORKFORCE_PUSH` のみで記録されることを確認
3. 故意に通知失敗条件を作って `Approval Inbox` の強調表示を確認
4. `Case Detail` から再送し、通知履歴が追加されることを確認
5. `Audit` で sent/failed/resent が記録されることを確認
