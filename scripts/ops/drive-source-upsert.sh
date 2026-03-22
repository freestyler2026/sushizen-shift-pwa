#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
source .ops.env

curl -X POST "$ZEN_API_BASE/api/admin/attendance/drive/sources" \
  -H "Content-Type: application/json" \
  -d "{
    \"source_name\": \"Bayzat Personal Drive Folder\",
    \"folder_id\": \"$ZEN_DRIVE_FOLDER_ID\",
    \"city_hint\": \"\",
    \"is_enabled\": true,
    \"approver_name\": \"$ZEN_APPROVER\",
    \"pin\": \"$ZEN_PIN\"
  }"