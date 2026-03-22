#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
source .ops.env

cd "$ZEN_BACKEND_DIR"
heroku pg:psql -a "$ZEN_HEROKU_APP" -c "
SELECT
  id,
  file_name,
  source,
  city_hint,
  status,
  total_rows,
  imported_rows,
  skipped_rows,
  created_by,
  created_at,
  imported_at,
  source_system,
  source_name,
  source_file_name,
  imported_row_count,
  skipped_row_count
FROM attendance_import_jobs
ORDER BY created_at DESC
LIMIT 20;
"