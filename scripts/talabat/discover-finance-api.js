/**
 * Talabat Finance API discovery — headful Playwright session.
 *
 * Run this ONCE (manually) after setup-session.js to discover which GraphQL
 * operations the Finance/Payouts section uses. Saves the full request/response
 * bodies (no truncation) to talabat-finance-api.json.
 *
 * Usage:
 *   node scripts/talabat/discover-finance-api.js
 *
 * What to do:
 *   1. The portal opens in a real browser window.
 *   2. Navigate to Finance → Payouts (or Earnings / Reports).
 *   3. Select any date range and any outlet.
 *   4. Wait for data to load, then close the browser or wait 120 s.
 *   5. Check talabat-finance-api.json for the captured queries.
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const SESSION_PATH = process.env.TALABAT_SESSION_PATH
  || path.join(__dirname, 'talabat-session.json');
const OUT_JSON = path.join(__dirname, 'talabat-finance-api.json');

async function main() {
  const state = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
  if (state.sessionExpired) {
    console.error('Session expired — run setup-session.js first');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: { cookies: state.cookies || [], origins: state.origins || [] },
  });

  const captured = [];

  // Intercept ALL requests/responses — no body truncation
  context.on('request', async req => {
    const url = req.url();
    if (!url.includes('portal.restaurant') && !url.includes('vagw-api') &&
        !url.includes('restaurant-partners.com') && !url.includes('deliveryhero')) return;
    if (url.match(/\.(js|css|png|jpg|gif|svg|ico|woff2?)(\?|$)/)) return;

    let postData = null;
    try { postData = JSON.parse(req.postData() || 'null'); } catch (_) {
      postData = req.postData();
    }

    captured.push({
      type:     'request',
      method:   req.method(),
      url,
      headers:  req.headers(),
      postData,
      ts:       new Date().toISOString(),
    });
  });

  context.on('response', async resp => {
    const url = resp.url();
    if (!url.includes('portal.restaurant') && !url.includes('vagw-api') &&
        !url.includes('restaurant-partners.com') && !url.includes('deliveryhero')) return;

    let body = null;
    try { body = await resp.json(); } catch (_) {}

    captured.push({
      type:       'response',
      url,
      statusCode: resp.status(),
      body,
      ts:         new Date().toISOString(),
    });
  });

  const page = await context.newPage();

  console.log('\n=== Talabat Finance API Discovery ===');
  console.log('Target: Past Payouts section (per-outlet net payout data)\n');
  await page.goto('https://partner-app.talabat.com/dashboard', {
    waitUntil: 'domcontentloaded', timeout: 30_000,
  });

  console.log('Portal is open.');
  console.log('Please navigate to:');
  console.log('  Finance → Past Payouts  (or Payouts / Settlements)');
  console.log('  ※ NOT the "Report Builder" — we want individual payout records');
  console.log('  ※ Select any outlet and any date range → wait for payout list to load');
  console.log('The browser will close automatically after 180 seconds.\n');

  // Wait 180 s for manual navigation
  for (let i = 180; i > 0; i -= 10) {
    await page.waitForTimeout(10_000).catch(() => {});
    console.log(`  ${i}s remaining — ${page.url()}`);
    if (browser.isConnected() === false) break;
  }

  try { await browser.close(); } catch (_) {}

  // Save ALL portal/API entries (no filter — we don't know the payout URL yet)
  const financeEntries = captured.filter(e => {
    const u = e.url.toLowerCase();
    return u.includes('vagw-api') || u.includes('portal.restaurant') ||
           u.includes('finance') || u.includes('payout') ||
           u.includes('settlement') || u.includes('earning') || u.includes('revenue') ||
           u.includes('deliveryhero') || u.includes('restaurant-partners');
  });

  fs.writeFileSync(OUT_JSON, JSON.stringify(financeEntries, null, 2));

  console.log('\n=== Discovery complete ===');
  console.log(`Total captured: ${captured.length}`);
  console.log(`Finance-related: ${financeEntries.length}`);
  console.log(`Saved to: ${OUT_JSON}`);

  // Print summary of GraphQL operations found
  const ops = financeEntries
    .filter(e => e.type === 'request' && e.postData?.operationName)
    .map(e => e.postData.operationName);
  const uniqueOps = [...new Set(ops)];
  if (uniqueOps.length) {
    console.log('\nGraphQL operations captured:');
    uniqueOps.forEach(op => console.log(`  • ${op}`));
    console.log('\nCheck talabat-finance-api.json for full request bodies and responses.');
    console.log('Then update get-payouts.js with the correct operation name and query string.');
  } else {
    console.log('\n⚠️  No GraphQL operations captured — did you navigate to Finance?');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
