#!/bin/bash
# Re-read every foodpanda ledger day that still has no order time (filled from
# invoice lines), 3-day windows, one store after another, pausing between runs.
#   MGMT_CRON_SECRET=... scripts/foodpanda/fill-untimed.sh
cd "$(dirname "$0")/../.."
API="${WEBHOOK_URL:-https://sushizen-shift-pwa.vercel.app}"
UNTIMED=$(curl -s -m 30 -H "X-Cron-Secret: $MGMT_CRON_SECRET" "$API/api/aggregator/orders/untimed?platform=foodpanda")
for PAIR in "TAFT taft" "CUB qc" "PAR paranaque"; do
  CODE=${PAIR% *}; LOCATION=${PAIR#* }
  STARTS=$(echo "$UNTIMED" | python3 -c "
import json, sys, datetime as dt
days = (json.load(sys.stdin).get('days') or {}).get('$CODE') or []
out, covered = [], None
for d in days:
    if covered and d < covered: continue
    out.append(d); covered = (dt.date.fromisoformat(d) + dt.timedelta(days=3)).isoformat()
print(' '.join(out))")
  for A in $STARTS; do
    B=$(python3 -c "import datetime as d; print((d.date.fromisoformat('$A') + d.timedelta(days=3)).isoformat())")
    OUT=$(WEBHOOK_URL="$API" node scripts/foodpanda/get-orders.js "$LOCATION" "$A" "$B" 2>&1)
    echo "$LOCATION $A..$B $(echo "$OUT" | grep -E 'written:|No orders|gave up' | tr '\n' ' ')"
    sleep 120
  done
done
echo ALL_DONE
