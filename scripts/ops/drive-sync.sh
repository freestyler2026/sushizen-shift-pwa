#!/usr/bin/env bash
set -euo pipefail

SOURCE_ID="${1:-}"

cd "$(dirname "$0")/../.."
source .ops.env

if [ -z "$SOURCE_ID" ]; then
  SOURCE_ID="$ZEN_DRIVE_SOURCE_ID"
fi

curl -X POST "$ZEN_API_BASE/api/admin/attendance/drive/sync" \
  -H "Content-Type: application/json" \
  -d "{
    \"source_id\": ${SOURCE_ID},
    \"approver_name\": \"$ZEN_APPROVER\",
    \"pin\": \"$ZEN_PIN\"
  }"