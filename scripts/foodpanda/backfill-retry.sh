#!/bin/bash
# Re-run only the chunks a backfill log marks FAILED, at the same gentle pace.
#   scripts/foodpanda/backfill-retry.sh <backfill log>
cd "$(dirname "$0")/../.."
grep -E " FAILED$" "$1" | while read s range rest; do
  a=${range%..*}; b=${range#*..}
  ok=""
  for try in 1 2 3; do
    out=$(WEBHOOK_URL=https://sushizen-shift-app-038d846023bc.herokuapp.com node scripts/foodpanda/get-orders.js $s $a $b 2>&1)
    w=$(echo "$out" | grep -E "written:" | tail -1 | tr -s ' ')
    if [ -n "$w" ] && ! echo "$out" | grep -q "gave up"; then ok="$w"; break; fi
    sleep 240
  done
  echo "$s $a..$b ${ok:-FAILED}"
  sleep 240
done
echo ALL_DONE
