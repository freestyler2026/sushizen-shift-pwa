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

# Use node from nvm if available, otherwise system node
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  source "$NVM_DIR/nvm.sh" --no-use
  NODE="$NVM_DIR/versions/node/$(ls "$NVM_DIR/versions/node" | sort -V | tail -1)/bin/node"
else
  NODE="$(which node)"
fi

WEBHOOK_URL="$WEBHOOK_URL" "$NODE" "$SCRIPT_DIR/get-payouts.js" >> "$LOG_FILE" 2>&1

echo "$(date '+%Y-%m-%d %H:%M:%S') — Done" >> "$LOG_FILE"
