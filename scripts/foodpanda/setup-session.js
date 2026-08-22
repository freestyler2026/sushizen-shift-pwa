/**
 * Food Panda partner portal session capture + API discovery
 *
 * Usage:
 *   node scripts/foodpanda/setup-session.js paranaque
 *   node scripts/foodpanda/setup-session.js taft
 *   node scripts/foodpanda/setup-session.js qc
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const LOCATION = process.argv[2] || 'paranaque';
const ACCOUNTS = {
  paranaque: 'contact@ramensushizen.com',
  taft:      'taft2025zen@gmail.com',
  qc:        'qc2025zen@gmail.com',
};
if (!ACCOUNTS[LOCATION]) { console.error('Use: paranaque | taft | qc'); process.exit(1); }

const OUT_JSON = path.join(__dirname, `${LOCATION}-session.json`);
const OUT_B64  = path.join(__dirname, `${LOCATION}-session.b64.txt`);
const OUT_API  = path.join(__dirname, `${LOCATION}-api-discovery.json`);

const captured = [];
let capturing  = false;

async function main() {
  console.log(`\n=== Food Panda — ${LOCATION.toUpperCase()} ===`);
  console.log(`Login as: ${ACCOUNTS[LOCATION]}\n`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page    = await context.newPage();

  // Capture all XHR/fetch after login
  context.on('request', req => {
    if (!capturing) return;
    const url = req.url();
    if (url.match(/\.(js|css|png|jpg|gif|svg|ico|woff2?)(\?|$)/)) return;
    if (url.includes('google-analytics') || url.includes('doubleclick') ||
        url.includes('hotjar') || url.includes('sentry') ||
        url.includes('segment.io') || url.includes('amplitude') ||
        url.includes('datadog') || url.includes('facebook')) return;
    captured.push({ method: req.method(), url, postData: req.postData()?.slice(0, 400) });
  });

  console.log('Opening Food Panda Partner Portal...');
  await page.goto('https://partner.foodpanda.com/login', { waitUntil: 'domcontentloaded' });
  console.log(`Current URL: ${page.url()}`);
  console.log(`\nPlease log in with: ${ACCOUNTS[LOCATION]}`);
  console.log('(Enter the password yourself in the browser)\n');

  // Poll for login: detect URL change away from /login
  console.log('Waiting for login (up to 5 min)...');
  const deadline = Date.now() + 5 * 60 * 1000;
  let loggedIn = false;
  const loginPageUrl = page.url();

  while (Date.now() < deadline) {
    const url = page.url();

    // URL changed away from login AND past 2FA step
    const stillAuthFlow = url.includes('/login') || url.includes('/signin') ||
                          url.includes('/2fa') || url.includes('/two-factor') ||
                          url.includes('/otp') || url.includes('/verify') ||
                          url === loginPageUrl;
    if (!stillAuthFlow) {
      console.log(`Login + 2FA complete! URL: ${url}`);
      loggedIn = true;
      capturing = true;
      break;
    }

    // Check for auth token in cookies (exclude analytics/tracking cookies)
    const cookies = await context.cookies();
    const authCookie = cookies.find(c => {
      const n = c.name;
      // Skip known analytics/tracking prefixes
      if (n.startsWith('_hj') || n.startsWith('_ga') || n.startsWith('_gid') ||
          n.startsWith('_gat') || n.startsWith('_fbp') || n.startsWith('_hjS')) return false;
      // Match real auth cookies
      return n === 'access_token' || n === 'partner_id' || n === 'auth_token' ||
             n === 'JWT' || n === 'token' || n === 'fp_session' ||
             (n.toLowerCase().includes('auth') && !n.startsWith('_')) ||
             (n.toLowerCase().includes('access') && n.toLowerCase().includes('token'));
    });
    if (authCookie) {
      console.log(`Auth cookie detected: ${authCookie.name} = ${String(authCookie.value).slice(0, 30)}...`);
      loggedIn = true;
      capturing = true;
      break;
    }

    // Check localStorage for tokens
    try {
      const token = await page.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) || '';
          if (k.match(/token|auth|bearer|access|jwt/i)) return `${k}=${localStorage.getItem(k)?.slice(0, 20)}`;
        }
        return null;
      });
      if (token) {
        console.log(`Auth in localStorage: ${token}`);
        loggedIn = true;
        capturing = true;
        break;
      }
    } catch (_) {}

    await page.waitForTimeout(2000);
  }

  if (!loggedIn) {
    console.log('Timed out waiting for login — saving partial session');
  }

  // ── Auto-navigate to financial pages to capture API calls ──────────────
  console.log('\n=== Auto-navigating to financial pages (capturing API calls) ===');
  const FINANCIAL_PAGES = [
    { url: 'https://partner.foodpanda.com/revenue',            label: 'Revenue' },
    { url: 'https://partner.foodpanda.com/orders',             label: 'Orders' },
    { url: 'https://partner.foodpanda.com/report-builder',     label: 'Report Builder' },
    { url: 'https://partner.foodpanda.com/analytics',          label: 'Analytics' },
    { url: 'https://partner.foodpanda.com/dashboard',          label: 'Dashboard' },
  ];

  for (const { url, label } of FINANCIAL_PAGES) {
    console.log(`  → Navigating to ${label} (${url})...`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
      await page.waitForTimeout(4000);
      console.log(`    Landed: ${page.url().slice(0, 80)}`);
    } catch (err) {
      console.log(`    Error: ${err.message.slice(0, 80)}`);
    }
  }

  // Extra 30s for manual navigation if desired
  console.log('\n(30 seconds — you can manually click additional pages)\n');
  for (let i = 30; i > 0; i -= 5) {
    await page.waitForTimeout(5000);
    process.stdout.write(`  ${i}s remaining — page: ${page.url().slice(0, 60)}\n`);
  }

  // Save session
  await context.storageState({ path: OUT_JSON });
  const data     = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8'));
  const stripped = { cookies: data.cookies, origins: [] };
  const b64      = Buffer.from(JSON.stringify(stripped)).toString('base64');
  fs.writeFileSync(OUT_B64, b64);
  fs.writeFileSync(OUT_API, JSON.stringify(captured, null, 2));

  console.log(`\n✓ Session: ${OUT_B64} (${b64.length} chars)`);
  console.log(`✓ API calls captured: ${captured.length}`);

  // Show financial API calls specifically
  const financialCalls = captured.filter(c => {
    const u = c.url;
    return !u.includes('partner.foodpanda.com') && (
      u.includes('portal.restaurant') || u.includes('restaurant-partners') ||
      u.includes('/api/') || u.includes('/query') || u.includes('/graphql')
    );
  });

  console.log(`\n=== Financial / XHR API calls (${financialCalls.length}) ===`);
  financialCalls.slice(0, 60).forEach(c => {
    console.log(`  ${c.method} ${c.url}`);
    if (c.postData) console.log(`    body: ${c.postData.slice(0, 200)}`);
  });

  if (financialCalls.length === 0) {
    console.log('  (none captured — portal may have redirected to login)');
    console.log('  All captured URLs:');
    captured.slice(0, 30).forEach(c => console.log(`    ${c.method} ${c.url.slice(0, 100)}`));
  }

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
