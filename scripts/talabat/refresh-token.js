/**
 * Talabat JWT auto-refresh — headless Playwright, no GUI needed.
 *
 * Loads partner-app.talabat.com with the saved session cookies.
 * The SPA automatically exchanges the session for a new Bearer JWT.
 * Captures the new JWT and writes it back to the session file.
 *
 * Usage (local):
 *   SESSION_PATH=/tmp/talabat-state.json node scripts/talabat/refresh-token.js
 *
 * Usage (GitHub Actions — see talabat-price-check.yml):
 *   Runs before check-prices.js; overwrites /tmp/talabat-state.json with fresh JWT.
 */
const { chromium } = require('playwright');
const fs = require('fs');

const SESSION_PATH = process.env.TALABAT_SESSION_PATH;
const WEBHOOK_URL  = process.env.WEBHOOK_URL;
if (!SESSION_PATH) throw new Error('TALABAT_SESSION_PATH not set');

const PORTAL = 'https://partner-app.talabat.com';
const TIMEOUT = 30_000;  // 30 s max

async function main() {
  const state = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));

  // Check if the current Bearer token is still valid (>10 min left)
  const currentToken = state.bearerToken;
  if (currentToken) {
    try {
      const parts  = currentToken.split('.');
      const pl     = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      const msLeft = pl.exp * 1000 - Date.now();
      if (msLeft > 10 * 60 * 1000) {
        console.log(`Token still valid for ${(msLeft / 3600000).toFixed(1)}h — skipping refresh`);
        return;
      }
      console.log(`Token expires in ${(msLeft / 60000).toFixed(0)}min — refreshing...`);
    } catch (_) {}
  } else {
    console.log('No bearer token in session — refreshing...');
  }

  let newToken = null;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: { cookies: state.cookies || [], origins: state.origins || [] },
  });

  // Intercept vendor API requests to capture fresh Bearer token
  context.on('request', req => {
    const url = req.url();
    if (!url.includes('restaurant-partners.com') && !url.includes('dh-auth.io')) return;
    const auth = req.headers().authorization;
    if (auth && auth.startsWith('Bearer ') && !newToken) {
      newToken = auth.replace('Bearer ', '');
    }
  });

  const page = await context.newPage();

  try {
    // Load the dashboard — the SPA will silently refresh the JWT on load
    await page.goto(`${PORTAL}/dashboard`, { waitUntil: 'networkidle', timeout: TIMEOUT });
    // Brief wait to allow background auth calls to complete
    await page.waitForTimeout(3000);
  } catch (err) {
    // networkidle can timeout on SPAs — that's OK; token may still have been captured
    console.log('Page load timeout (OK):', err.message.slice(0, 80));
  }

  await browser.close();

  if (!newToken) {
    console.error('❌ Could not capture a new Bearer token.');
    console.error('Session cookies may have expired — re-run setup-session.js.');
    // Write flag so check-prices.js knows to skip gracefully
    fs.writeFileSync(SESSION_PATH, JSON.stringify({ ...state, bearerToken: null, sessionExpired: true }));
    // Notify via webhook if available
    if (WEBHOOK_URL) {
      try {
        await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vendor_id: 'SESSION_EXPIRED', vendor_name: 'SYSTEM', items: [], checked_at: new Date().toISOString() }),
        });
      } catch (_) {}
    }
    process.exit(0);  // exit 0: session expiry is expected, not a workflow error
  }

  // Decode new token for logging
  try {
    const pl    = JSON.parse(Buffer.from(newToken.split('.')[1], 'base64url').toString());
    const hours = pl.exp ? ((pl.exp * 1000 - Date.now()) / 3600000).toFixed(1) : 'unknown';
    console.log(`✅ New token captured (valid for ${hours}h)`);
  } catch (_) {
    console.log('✅ New token captured');
  }

  // Write updated session back to SESSION_PATH
  const updated = { ...state, bearerToken: newToken };
  fs.writeFileSync(SESSION_PATH, JSON.stringify(updated));
  console.log(`Saved to ${SESSION_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
