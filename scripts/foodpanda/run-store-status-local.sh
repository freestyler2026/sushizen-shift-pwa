#!/bin/bash
# FoodPanda Manila — store status, three times a day (launchd:
# com.sushizen.foodpanda-status at 07:05, 10:05 and 16:05 Dubai = 11:05, 14:05
# and 20:05 Manila, the times the CI workflow used before it was disabled).
# Whether each store is actually online, so the Daily Check need not ask.
#
# Logs: ~/Library/Logs/sushizen-foodpanda-status.log

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$HOME/Library/Logs/sushizen-foodpanda-status.log"
WEBHOOK_URL="https://sushizen-shift-app-038d846023bc.herokuapp.com"

echo "$(date '+%Y-%m-%d %H:%M:%S') — store status run" >> "$LOG_FILE"

# This Mac's network has refused TLS to *.herokuapp.com at times (2026-10-29
# evening: every HTTPS connection reset, plain HTTP and other hosts fine). The
# frontend proxies /api/* to the same backend, so fall back to it.
if ! curl -s -m 15 -o /dev/null "$WEBHOOK_URL/api/auth/session-check"; then
  echo "  ⚠ $WEBHOOK_URL unreachable from this Mac — sending through the frontend proxy" >> "$LOG_FILE"
  WEBHOOK_URL="https://sushizen-shift-pwa.vercel.app"
fi
NODE=""
for CANDIDATE in "$HOME/.volta/bin/node" "/opt/homebrew/bin/node" "/usr/local/bin/node"; do
  if [ -x "$CANDIDATE" ]; then NODE="$CANDIDATE"; break; fi
done
if [ -z "$NODE" ] && [ -d "$HOME/.nvm/versions/node" ]; then
  NVM_LATEST="$(ls "$HOME/.nvm/versions/node" | sort -V | tail -1)"
  [ -n "$NVM_LATEST" ] && NODE="$HOME/.nvm/versions/node/$NVM_LATEST/bin/node"
fi
if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then
  echo "  node not found; nothing ran" >> "$LOG_FILE"; exit 1
fi

EXIT_CODE=0
for LOCATION in paranaque taft qc; do
  if WEBHOOK_URL="$WEBHOOK_URL" "$NODE" "$SCRIPT_DIR/get-store-status.js" "$LOCATION" > /tmp/sushizen-fp-status-$LOCATION.out 2>&1; then
    echo "  ✓ $LOCATION $(grep -E '^  [A-Z]+ ' /tmp/sushizen-fp-status-$LOCATION.out | head -1 | tr -s ' ')" >> "$LOG_FILE"
  else
    echo "  ✗ $LOCATION: $(tail -2 /tmp/sushizen-fp-status-$LOCATION.out | tr '\n' ' ')" >> "$LOG_FILE"
    EXIT_CODE=1
  fi
  rm -f /tmp/sushizen-fp-status-$LOCATION.out
done
exit $EXIT_CODE
