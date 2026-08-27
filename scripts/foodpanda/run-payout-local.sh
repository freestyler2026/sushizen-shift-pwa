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

  # Cancellations settle from the same session. The portal blocks headless CI,
  # so this runs here rather than in GitHub Actions.
  if DATE_FROM="$DATE_FROM" DATE_TO="$DATE_TO" WEBHOOK_URL="$WEBHOOK_URL" \
       "$NODE" "$SCRIPT_DIR/sync-cancellations.js" "$LOCATION" >> "$LOG_FILE" 2>&1; then
    echo "  ✓ $LOCATION cancellations done" >> "$LOG_FILE"
  else
    echo "  ✗ $LOCATION cancellations failed (exit $?)" >> "$LOG_FILE"
    EXIT_CODE=1
  fi
done

echo "" >> "$LOG_FILE"
echo "$(date '+%Y-%m-%d %H:%M:%S') — Done (exit $EXIT_CODE)" >> "$LOG_FILE"
exit $EXIT_CODE
