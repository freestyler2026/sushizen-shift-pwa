#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
source .ops.env

cd "$ZEN_BACKEND_DIR"
heroku pg:psql -a "$ZEN_HEROKU_APP" -c "
SELECT
  lower(city) AS city,
  MIN(attendance_date) AS min_date,
  MAX(attendance_date) AS max_date,
  COUNT(*) AS row_count
FROM actual_attendance
GROUP BY lower(city)
ORDER BY lower(city);
"