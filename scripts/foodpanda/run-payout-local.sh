#!/bin/bash
# FoodPanda Manila — Local payout runner (scheduled via launchd)
# Runs daily on Mac; uses Playwright network interception (bypasses PX).
# When a session expires, re-run: node scripts/foodpanda/setup-session.js <location>
#
# Logs: ~/Library/Logs/sushizen-foodpanda-payouts.log

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$HOME/Library/Logs/sushizen-foodpanda-payouts.log"
WEBHOOK_URL="https://sushizen-shift-app-038d846023bc.herokuapp.com"

echo "======================================" >> "$LOG_FILE"
echo "$(date '+%Y-%m-%d %H:%M:%S') — FoodPanda payout run starting" >> "$LOG_FILE"

# Compute date range in PHT (UTC+8)
DATE_TO=$(python3 -c "from datetime import datetime, timedelta, timezone; pht = timezone(timedelta(hours=8)); print((datetime.now(pht) - timedelta(days=1)).strftime('%Y-%m-%d'))")
DATE_FROM=$(python3 -c "from datetime import datetime, timedelta, timezone; pht = timezone(timedelta(hours=8)); print((datetime.now(pht) - timedelta(days=30)).strftime('%Y-%m-%d'))")

echo "Date range: $DATE_FROM to $DATE_TO" >> "$LOG_FILE"

# Find node. launchd gives the job a bare PATH, so `which node` finds nothing and
# NODE ended up empty — every step then failed with "command not found" while the
# run still looked like it had started. Check the known install locations first.
NODE=""
for CANDIDATE in \
  "$HOME/.volta/bin/node" \
  "/opt/homebrew/bin/node" \
  "/usr/local/bin/node"
do
  if [ -x "$CANDIDATE" ]; then NODE="$CANDIDATE"; break; fi
done
if [ -z "$NODE" ] && [ -d "$HOME/.nvm/versions/node" ]; then
  NVM_LATEST="$(ls "$HOME/.nvm/versions/node" | sort -V | tail -1)"
  [ -n "$NVM_LATEST" ] && NODE="$HOME/.nvm/versions/node/$NVM_LATEST/bin/node"
fi
[ -z "$NODE" ] && NODE="$(command -v node)"
if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') — node not found; nothing ran" >> "$LOG_FILE"
  exit 1
fi
echo "node: $NODE ($("$NODE" -v 2>/dev/null))" >> "$LOG_FILE"

# Token for the invoice webhook (it writes tax records). Kept outside the repo,
# readable by this user only. Without it the invoice step fails loudly and the
# payouts still go in.
TOKEN_FILE="$HOME/.config/sushizen/fp-invoice-ingest-token"
if [ -r "$TOKEN_FILE" ]; then
  export FP_INVOICE_INGEST_TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
else
  echo "  ⚠ $TOKEN_FILE not found — invoices will not be stored" >> "$LOG_FILE"
fi

# The backend's cron secret, for the operations metrics. Read from Heroku at
# run time (the CLI is signed in on this Mac) rather than kept in a file.
HEROKU=""
for CANDIDATE in /opt/homebrew/bin/heroku /usr/local/bin/heroku "$HOME/.local/bin/heroku"; do
  if [ -x "$CANDIDATE" ]; then HEROKU="$CANDIDATE"; break; fi
done
if [ -n "$HEROKU" ]; then
  export MGMT_CRON_SECRET="$("$HEROKU" config:get MGMT_CRON_SECRET -a sushizen-shift-app 2>/dev/null | tr -d '[:space:]')"
fi
[ -z "${MGMT_CRON_SECRET:-}" ] && echo "  ⚠ MGMT_CRON_SECRET not read from Heroku — operations metrics will not be stored" >> "$LOG_FILE"

EXIT_CODE=0
for LOCATION in paranaque taft qc; do
  echo "" >> "$LOG_FILE"
  echo "--- $LOCATION ---" >> "$LOG_FILE"
  if DATE_FROM="$DATE_FROM" DATE_TO="$DATE_TO" WEBHOOK_URL="$WEBHOOK_URL" \
       "$NODE" "$SCRIPT_DIR/get-payouts.js" "$LOCATION" >> "$LOG_FILE" 2>&1; then
    echo "  ✓ $LOCATION payouts done" >> "$LOG_FILE"
  else
    echo "  ✗ $LOCATION payouts failed (exit $?)" >> "$LOG_FILE"
    EXIT_CODE=1
  fi

  # Operations metrics (unavailable time, prep time, avoidable wait, rejection
  # and contact rate per day) -- what staff downloaded as per-metric CSVs.
  # 14 days each run: foodpanda revises a day's prep time after it closes.
  if WEBHOOK_URL="$WEBHOOK_URL" "$NODE" "$SCRIPT_DIR/get-ops-metrics.js" "$LOCATION" >> "$LOG_FILE" 2>&1; then
    echo "  ✓ $LOCATION operations metrics done" >> "$LOG_FILE"
  else
    echo "  ✗ $LOCATION operations metrics failed (exit $?)" >> "$LOG_FILE"
    EXIT_CODE=1
  fi

  # Order ledger (aggregator_orders): what the Daily Check and the shift
  # planner read for foodpanda. 3 days each run, upserted on the order id, so
  # a morning the Mac slept through is filled the next day. It ran in CI until
  # that workflow was disabled; nothing came in from 2026-09-11 to 10-28.
  ORD_FROM=$(python3 -c "from datetime import datetime, timedelta, timezone; print((datetime.now(timezone.utc) - timedelta(days=3)).strftime('%Y-%m-%d'))")
  ORD_TO=$(python3 -c "from datetime import datetime, timezone; print(datetime.now(timezone.utc).strftime('%Y-%m-%d'))")
  # PerimeterX refuses some runs outright (2026-10-28: about half of the
  # backfill weeks on the first try, all of them by the third), so try three
  # times with a pause before calling it failed.
  ORD_OK=0
  for TRY in 1 2 3; do
    if WEBHOOK_URL="$WEBHOOK_URL" "$NODE" "$SCRIPT_DIR/get-orders.js" "$LOCATION" "$ORD_FROM" "$ORD_TO" > /dev/null 2>> "$LOG_FILE"; then
      ORD_OK=1; break
    fi
    sleep 45
  done
  if [ "$ORD_OK" = 1 ]; then
    echo "  ✓ $LOCATION order ledger done ($ORD_FROM..$ORD_TO, try $TRY)" >> "$LOG_FILE"
  else
    echo "  ✗ $LOCATION order ledger failed after 3 tries" >> "$LOG_FILE"
    EXIT_CODE=1
  fi

  # Cancellations are NOT synced on a schedule. Reading them needs a live portal
  # session and can trip a press-and-hold check, so whoever runs it has to keep a
  # session alive — and a session nobody notices expiring produces days with no
  # data, silently. The back-office staff are in the portal every day anyway and
  # enter FoodPanda cancellations by hand, which is the reliable path.
  # RUN_CANCELLATIONS=1 still runs it on demand.
  if [ "${RUN_CANCELLATIONS:-0}" = "1" ]; then
    if DATE_FROM="$DATE_FROM" DATE_TO="$DATE_TO" WEBHOOK_URL="$WEBHOOK_URL" \
         "$NODE" "$SCRIPT_DIR/sync-cancellations.js" "$LOCATION" >> "$LOG_FILE" 2>&1; then
      echo "  ✓ $LOCATION cancellations done" >> "$LOG_FILE"
    else
      echo "  ✗ $LOCATION cancellations failed (exit $?)" >> "$LOG_FILE"
      EXIT_CODE=1
    fi
  else
    echo "  – $LOCATION cancellations skipped (staff enter these by hand)" >> "$LOG_FILE"
  fi
done

echo "" >> "$LOG_FILE"
echo "$(date '+%Y-%m-%d %H:%M:%S') — Done (exit $EXIT_CODE)" >> "$LOG_FILE"
exit $EXIT_CODE
