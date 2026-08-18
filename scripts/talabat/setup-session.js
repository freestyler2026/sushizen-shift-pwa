/**
 * Talabat Partner Portal session capture
 *
 * Usage:
 *   node scripts/talabat/setup-session.js
 *
 * Saves cookies + localStorage (OIDC Bearer token) to:
 *   scripts/talabat/talabat-session.json   (full state)
 *   scripts/talabat/talabat-session.b64.txt (base64 — paste into GitHub Secret TALABAT_SESSION_STATE)
 *   scripts/talabat/talabat-api-discovery.json (captured API calls)
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const OUT_JSON = path.join(__dirname, 'talabat-session.json');
const OUT_B64  = path.join(__dirname, 'talabat-session.b64.txt');
const OUT_API  = path.join(__dirname, 'talabat-api-discovery.json');

const captured = [];
let capturing  = false;

async function main() {
  console.log('\n=== Talabat Partner Portal — Session Capture ===');
  console.log('Target: https://partner-app.talabat.com\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page    = await context.newPage();

  // Capture XHR/fetch after login for API discovery
  context.on('request', req => {
    if (!capturing) return;
    const url = req.url();
    if (url.match(/\.(js|css|png|jpg|gif|svg|ico|woff2?)(\?|$)/)) return;
    if (url.includes('google-analytics') || url.includes('doubleclick') ||
        url.includes('hotjar') || url.includes('segment.io') ||
        url.includes('amplitude') || url.includes('sentry')) return;
    captured.push({ method: req.method(), url, postData: req.postData()?.slice(0, 300) });
  });

  console.log('Opening Talabat Partner Portal...');
  await page.goto('https://partner-app.talabat.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  console.log(`Current URL: ${page.url()}`);
  console.log('\nPlease log in to the Talabat Partner Portal.');
  console.log('After logging in, navigate to any store → Menu Management.\n');

  // Poll for authenticated state (up to 5 min)
  console.log('Waiting for login (up to 5 min)...');
  const deadline = Date.now() + 5 * 60 * 1000;
  let loggedIn   = false;

  while (Date.now() < deadline) {
    const url = page.url();
    const isDashboard =
      url.includes('partner-app.talabat.com') &&
      !url.includes('/login') &&
      !url.includes('/signin') &&
      !url.includes('/auth') &&
      !url.includes('/2fa') &&
      !url.includes('/verify') &&
      url !== 'https://partner-app.talabat.com/' &&
      url !== 'https://partner-app.talabat.com';

    if (isDashboard) {
      console.log(`✓ Dashboard detected: ${url}`);
      loggedIn  = true;
      capturing = true;
      break;
    }

    // Also check localStorage for OIDC token
    try {
      const found = await page.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) || '';
          if (k.startsWith('oidc.user:') || k.match(/access_token|auth_token/i)) return k;
        }
        return null;
      });
      if (found) {
        console.log(`✓ Auth token found in localStorage: ${found}`);
        loggedIn  = true;
        capturing = true;
        break;
      }
    } catch (_) {}

    await page.waitForTimeout(2000);
  }

  if (!loggedIn) console.log('⚠ Timed out — saving partial session');

  // 60-second window to navigate to Menu and capture vendor API calls
  console.log('\nNavigate to Menu Management now to capture vendor API calls...');
  console.log('(60 seconds)\n');
  for (let i = 60; i > 0; i -= 5) {
    await page.waitForTimeout(5000);
    process.stdout.write(`  ${i}s remaining... ${page.url()}\n`);
  }

  // Save full session state (cookies + localStorage with OIDC token)
  await context.storageState({ path: OUT_JSON });
  const data = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8'));
  const b64  = Buffer.from(JSON.stringify(data)).toString('base64');
  fs.writeFileSync(OUT_B64, b64);
  fs.writeFileSync(OUT_API, JSON.stringify(captured, null, 2));

  const domains = [...new Set(data.cookies.map(c => c.domain))];
  const lsOrigins = (data.origins || []).map(o => o.origin);

  console.log(`\n✓ Session saved:`);
  console.log(`  JSON:       ${OUT_JSON}`);
  console.log(`  Base64:     ${OUT_B64} (${b64.length} chars)`);
  console.log(`  Cookies:    ${data.cookies.length} (domains: ${domains.join(', ')})`);
  console.log(`  Origins:    ${lsOrigins.join(', ')}`);
  console.log(`  API calls:  ${captured.length} captured`);

  console.log('\n=== Vendor API calls captured ===');
  captured
    .filter(c => c.url.includes('restaurant-partners.com') || c.url.includes('talabat.com/api'))
    .slice(0, 30)
    .forEach(c => console.log(`  ${c.method} ${c.url}`));

  console.log('\n=== Next steps ===');
  console.log('1. Verify vendor API calls were captured above.');
  console.log('2. Set GitHub Secret TALABAT_SESSION_STATE to the contents of:');
  console.log(`     ${OUT_B64}`);
  console.log('3. The workflow runs automatically every 4 hours.\n');

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
