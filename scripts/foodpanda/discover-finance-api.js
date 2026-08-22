/**
 * FoodPanda finance API discovery via Playwright
 *
 * Gets JWT via REST, injects into browser, navigates to Orders/Revenue pages,
 * captures all non-static API calls to find the financial endpoint.
 *
 * Usage:
 *   node scripts/foodpanda/discover-finance-api.js paranaque
 *   node scripts/foodpanda/discover-finance-api.js taft
 *   node scripts/foodpanda/discover-finance-api.js qc
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const LOCATION = process.argv[2] || 'paranaque';

const ACCOUNTS = {
  paranaque: {
    email:    process.env.FP_EMAIL_PARANAQUE,
    password: process.env.FP_PASSWORD_PARANAQUE,
    vendorId: 't0z4',
  },
  taft: {
    email:    process.env.FP_EMAIL_TAFT,
    password: process.env.FP_PASSWORD_TAFT,
    vendorId: 'ryqc',
  },
  qc: {
    email:    process.env.FP_EMAIL_QC,
    password: process.env.FP_PASSWORD_QC,
    vendorId: 'a97i',
  },
};

const account = ACCOUNTS[LOCATION];
if (!account) { console.error('Use: paranaque | taft | qc'); process.exit(1); }
if (!account.email || !account.password) {
  console.error(`FP_EMAIL_${LOCATION.toUpperCase()} / FP_PASSWORD_${LOCATION.toUpperCase()} not set`);
  process.exit(1);
}

const AUTH_URL  = 'https://partner-auth.ap.prd.portal.restaurant/auth/v5/login-two-step';
const PORTAL    = 'https://partner.foodpanda.com';
const OUT_FILE  = path.join(__dirname, `${LOCATION}-finance-api-discovery.json`);

async function getJwt() {
  const resp = await fetch(AUTH_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': PORTAL },
    body:    JSON.stringify({ username: account.email, password: account.password, type: 'password' }),
    signal:  AbortSignal.timeout(20_000),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error(`No token: ${JSON.stringify(data).slice(0, 200)}`);
  console.log('✓ JWT obtained');
  return data;
}

async function main() {
  console.log(`\n=== FoodPanda Finance API Discovery — ${LOCATION.toUpperCase()} ===\n`);

  const authData  = await getJwt();
  const jwt       = authData.access_token;
  const refreshToken = authData.refresh_token;

  const captured = [];
  const interesting = [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  });

  // Capture all non-static requests
  context.on('request', req => {
    const url = req.url();
    if (url.match(/\.(js|css|png|jpg|gif|svg|ico|woff2?)(\?|$)/)) return;
    if (url.includes('google-analytics') || url.includes('doubleclick') || url.includes('hotjar') ||
        url.includes('sentry') || url.includes('segment') || url.includes('amplitude') ||
        url.includes('datadog') || url.includes('facebook') || url.includes('px-cloud') ||
        url.includes('hotjar') || url.includes('gtm')) return;

    const entry = {
      method: req.method(),
      url,
      headers: {
        authorization: req.headers()['authorization'] ? '[Bearer]' : undefined,
        'content-type': req.headers()['content-type'],
      },
      postData: req.postData()?.slice(0, 400),
    };
    captured.push(entry);

    // Flag interesting (API) requests
    if (url.includes('/api/') || url.includes('/query') || url.includes('/graphql') ||
        url.includes('portal.restaurant') || url.includes('foodpanda') ||
        url.includes('restaurant-partners')) {
      interesting.push(entry);
      console.log(`  [API] ${req.method()} ${url.slice(0, 120)}`);
    }
  });

  const page = await context.newPage();

  // Inject JWT into localStorage before navigating
  await page.addInitScript(([token, refresh]) => {
    try {
      // Common storage keys FoodPanda partner portal might use
      localStorage.setItem('access_token', token);
      localStorage.setItem('fp_access_token', token);
      localStorage.setItem('token', token);
      if (refresh) localStorage.setItem('refresh_token', refresh);
      // Also set auth data as JSON
      localStorage.setItem('auth', JSON.stringify({ access_token: token, refresh_token: refresh }));
      localStorage.setItem('partnerAuth', JSON.stringify({ token, refreshToken: refresh }));
    } catch (_) {}
  }, [jwt, refreshToken]);

  // Step 1: Load portal homepage (might redirect to login or dashboard)
  console.log('\nNavigating to portal...');
  await page.goto(PORTAL, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  console.log(`  Current URL: ${page.url()}`);

  // Step 2: If on login page, do UI login
  if (page.url().includes('/login') || page.url().includes('/signin')) {
    console.log('  On login page — attempting UI login...');
    try {
      await page.fill('input[type="email"], input[name="username"], input[name="email"]', account.email);
      await page.fill('input[type="password"], input[name="password"]', account.password);
      await page.click('button[type="submit"]');
      await page.waitForNavigation({ timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(3000);
      console.log(`  After login URL: ${page.url()}`);
    } catch (err) {
      console.log(`  Login UI error: ${err.message}`);
    }
  }

  // Step 3: Navigate to Orders section
  const orderUrls = [
    `${PORTAL}/orders`,
    `${PORTAL}/revenue`,
    `${PORTAL}/dashboard`,
    `${PORTAL}/finance`,
    `${PORTAL}/report-builder`,
    `${PORTAL}/analytics`,
  ];

  for (const url of orderUrls) {
    console.log(`\nNavigating to: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(3000);
      console.log(`  Landed at: ${page.url()}`);
    } catch (err) {
      console.log(`  Error: ${err.message.slice(0, 100)}`);
    }
  }

  await browser.close();

  // Save and summarize results
  fs.writeFileSync(OUT_FILE, JSON.stringify({ captured, interesting }, null, 2));
  console.log(`\n✓ Saved to ${OUT_FILE}`);
  console.log(`\n=== Interesting API calls (${interesting.length}) ===`);
  interesting.forEach(c => {
    console.log(`  ${c.method} ${c.url}`);
    if (c.postData) console.log(`    body: ${c.postData.slice(0, 200)}`);
  });

  // Summarize unique domains
  const domains = [...new Set(interesting.map(c => {
    try { return new URL(c.url).hostname; } catch (_) { return '?'; }
  }))];
  console.log('\n=== Unique API domains ===');
  domains.forEach(d => console.log(`  ${d}`));
}

main().catch(e => { console.error(e); process.exit(1); });
