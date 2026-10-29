#!/bin/bash
# foodpanda order ledger backfill, gently: 3-day chunks (the size the
# daily run uses), a run counts only when no page was given up on, 4 min between
# runs, up to 3 tries per chunk.
cd "$(dirname "$0")/../.."
for s in taft qc paranaque; do
  a=${FROM:-2026-09-10}
  while [ "$a" \< "${TO:-2026-10-29}" ]; do
    b=$(date -j -v+3d -f %Y-%m-%d $a +%Y-%m-%d)
    ok=""
    for try in 1 2 3; do
      out=$(WEBHOOK_URL=https://sushizen-shift-app-038d846023bc.herokuapp.com node scripts/foodpanda/get-orders.js $s $a $b 2>&1)
      w=$(echo "$out" | grep -E "written:" | tail -1 | tr -s ' ')
      if [ -n "$w" ] && ! echo "$out" | grep -q "gave up"; then ok="$w"; break; fi
      sleep 240
    done
    echo "$s $a..$b ${ok:-FAILED}"
    sleep 240
    a=$b
  done
done
echo ALL_DONE
