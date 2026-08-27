#!/bin/bash
# Noon Food Dubai — Local payout runner (scheduled via launchd)
# Runs weekly on Mac; uses noon-session.json for auth.
# When session expires (CI-equivalent 401), re-run setup-session.js --upload.
#
# Logs: ~/Library/Logs/sushizen-noon-payouts.log

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$HOME/Library/Logs/sushizen-noon-payouts.log"
WEBHOOK_URL="https://sushizen-shift-app-038d846023bc.herokuapp.com"

echo "======================================" >> "$LOG_FILE"
echo "$(date '+%Y-%m-%d %H:%M:%S') — Noon payout run starting" >> "$LOG_FILE"

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

WEBHOOK_URL="$WEBHOOK_URL" "$NODE" "$SCRIPT_DIR/get-payouts.js" >> "$LOG_FILE" 2>&1

echo "$(date '+%Y-%m-%d %H:%M:%S') — Done" >> "$LOG_FILE"
