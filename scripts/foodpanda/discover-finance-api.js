/**
 * FoodPanda finance API discovery
 *
 * Phase 1: Try vagw-api GraphQL (same Delivery Hero architecture as Talabat)
 * Phase 2: Use existing paranaque-session.json cookies to navigate portal
 * Phase 3: Full Playwright login with session storage + PX cookie intercept
 *
 * Usage:
 *   node scripts/foodpanda/discover-finance-api.js paranaque
 */

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const LOCATION = process.argv[2] || 'paranaque';

const ACCOUNTS = {
  paranaque: {
    email:    process.env.FP_EMAIL_PARANAQUE,
    password: process.env.FP_PASSWORD_PARANAQUE,
    vendorId: 't0z4',
    sessionFile: path.join(__dirname, 'paranaque-session.json'),
  },
  taft: {
    email:    process.env.FP_EMAIL_TAFT,
    password: process.env.FP_PASSWORD_TAFT,
    vendorId: 'ryqc',
    sessionFile: path.join(__dirname, 'taft-session.json'),
  },
  qc: {
    email:    process.env.FP_EMAIL_QC,
    password: process.env.FP_PASSWORD_QC,
    vendorId: 'a97i',
    sessionFile: null,
  },
};

const account = ACCOUNTS[LOCATION];
if (!account) { console.error('Use: paranaque | taft | qc'); process.exit(1); }

const AUTH_URL  = 'https://partner-auth.ap.prd.portal.restaurant/auth/v5/login-two-step';
const PORTAL    = 'https://partner.foodpanda.com';
const PLATFORM  = 'FP_PH';
const DATE      = '2026-08-21';

// Delivery Hero vagw-api candidates (same architecture as Talabat EU)
const VAGW_CANDIDATES = [
  'https://vagw-api.as.prd.portal.restaurant/query',
  'https://vagw-api.ap.prd.portal.restaurant/query',
  'https://vagw-api.sg.prd.portal.restaurant/query',
  'https://vagw-api.ph.prd.portal.restaurant/query',
  'https://vagw-api.gdp-ph.prd.portal.restaurant/query',
];

const SALES_QUERY = `query SalesOverviewByTime($params: DateRangeWithPrecisionVendorsReportRequest!) {
  salesOverview {
    salesByTime(input: $params) {
      order_count
      revenue
      __typename
    }
    __typename
  }
}`;

function vendorHeaders(token, extraHeaders = {}) {
  return {
    'Authorization':   `Bearer ${token}`,
    'Accept':          'application/json',
    'Content-Type':    'application/json',
    'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Origin':          PORTAL,
    'Referer':         `${PORTAL}/`,
    ...extraHeaders,
  };
}

async function getJwt() {
  const resp = await fetch(AUTH_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': PORTAL, 'Accept': 'application/json' },
    body:    JSON.stringify({ username: account.email, password: account.password, type: 'password' }),
    signal:  AbortSignal.timeout(20_000),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error(`No token: ${JSON.stringify(data).slice(0, 300)}`);
  console.log('✓ JWT obtained');
  return { token: data.access_token, refreshToken: data.refresh_token };
}

// ── Phase 1: Try vagw-api GraphQL endpoints ────────────────────────────────

async function tryVagwApi(token) {
  console.log('\n── Phase 1: Delivery Hero vagw-api GraphQL candidates ──');

  const vendorIdB64 = Buffer.from(`${PLATFORM}-${account.vendorId}`).toString('base64');
  const body = JSON.stringify({
    operationName: 'SalesOverviewByTime',
    variables: {
      params: {
        global_vendor_codes: [`${PLATFORM};${account.vendorId}`],
        from:      DATE,
        to:        DATE,
        precision: 'Day',
      },
    },
    query: SALES_QUERY,
  });

  for (const url of VAGW_CANDIDATES) {
    try {
      const resp = await fetch(url, {
        method:  'POST',
        headers: vendorHeaders(token, {
          'x-global-entity-id':  PLATFORM,
          'x-vendor-id':         vendorIdB64,
          'x-country':           'PH',
          'apollographql-client-name': 'SalesOverviewWebApp',
        }),
        body,
        signal: AbortSignal.timeout(10_000),
      });
      const text = await resp.text();
      if (resp.ok || resp.status === 200) {
        console.log(`  ✅ [${resp.status}] ${url}`);
        console.log(`     Response: ${text.slice(0, 400)}`);
        return { found: true, url, response: text };
      } else {
        console.log(`  ❌ [${resp.status}] ${url}: ${text.slice(0, 100)}`);
      }
    } catch (err) {
      console.log(`  ❌ [ERR] ${url}: ${err.message}`);
    }
  }
  return { found: false };
}

// ── Phase 2: Use existing session cookies to navigate portal ──────────────

async function tryWithSessionCookies(token) {
  console.log('\n── Phase 2: Try with existing session cookies ──');

  if (!account.sessionFile || !fs.existsSync(account.sessionFile)) {
    console.log('  No session file found — skip');
    return { found: false };
  }

  let sessionData;
  try {
    sessionData = JSON.parse(fs.readFileSync(account.sessionFile, 'utf8'));
    console.log(`  Loaded session from ${account.sessionFile}`);
    console.log(`  Cookies: ${(sessionData.cookies || []).length}`);
  } catch (err) {
    console.log(`  Failed to load session: ${err.message}`);
    return { found: false };
  }

  const capturedFinancial = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: {
      cookies: sessionData.cookies || [],
      origins: sessionData.origins || [],
    },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  });

  let capturedJwt    = token;
  const capturedPxHeaders = {};

  context.on('request', req => {
    const url = req.url();
    const h   = req.headers();

    if (url.match(/\.(js|css|png|jpg|gif|svg|ico|woff2?)(\?|$)/)) return;
    if (url.includes('google-analytics') || url.includes('px-cloud') || url.includes('gtm')) return;

    if ((url.includes('portal.restaurant') || url.includes('restaurant-partners')) && h.authorization) {
      const tok = h.authorization.replace('Bearer ', '');
      if (tok && tok !== capturedJwt) { capturedJwt = tok; console.log('  ✓ Fresh JWT captured'); }
    }
    if (url.includes('vagw-api') || url.includes('portal.restaurant')) {
      if (h['x-px-cookies']) { capturedPxHeaders['x-px-cookies'] = h['x-px-cookies']; }
      if (h['x-user-id'])    { capturedPxHeaders['x-user-id']    = h['x-user-id']; }
    }

    if (!url.includes('partner.foodpanda.com') &&
        (url.includes('/api/') || url.includes('/query') || url.includes('/graphql') ||
         url.includes('portal.restaurant') || url.includes('restaurant-partners'))) {
      capturedFinancial.push({ method: req.method(), url, postData: req.postData()?.slice(0, 400) });
      console.log(`  [API] ${req.method()} ${url.slice(0, 120)}`);
    }
  });

  const page = await context.newPage();

  const pages = [
    '/orders', '/revenue', '/dashboard', '/finance',
    '/report-builder', '/analytics', '/report-builder/create/FINANCE',
  ];

  for (const p of pages) {
    try {
      await page.goto(`${PORTAL}${p}`, { waitUntil: 'networkidle', timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(3000);
      const url = page.url();
      console.log(`  ${p} → ${url.replace(PORTAL, '')}`);
      if (!url.includes('/login')) {
        console.log('  *** Authenticated! Waiting for API calls...');
        await page.waitForTimeout(5000);
      }
    } catch (err) {
      console.log(`  Error navigating ${p}: ${err.message.slice(0, 100)}`);
    }
  }

  await browser.close();

  console.log(`\n  Captured ${capturedFinancial.length} financial API calls`);
  capturedFinancial.forEach(c => {
    console.log(`  ${c.method} ${c.url}`);
    if (c.postData) console.log(`    body: ${c.postData.slice(0, 200)}`);
  });

  if (capturedPxHeaders['x-px-cookies']) {
    console.log('  ✓ PX cookies captured — session was valid!');
  }

  return {
    found: capturedFinancial.length > 0,
    calls: capturedFinancial,
    jwt: capturedJwt,
    pxHeaders: capturedPxHeaders,
  };
}

// ── Phase 3: Full Playwright login + capture ──────────────────────────────

async function tryFullLogin(token) {
  console.log('\n── Phase 3: Full Playwright login (intercept all portal API calls) ──');

  const captured = [];
  let capturedJwt = token;
  const pxHeaders = {};
  let loginSuccess = false;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  });

  context.on('request', req => {
    const url = req.url();
    const h   = req.headers();

    if (url.match(/\.(js|css|png|jpg|gif|svg|ico|woff2?)(\?|$)/)) return;
    if (url.includes('google') || url.includes('px-cloud') || url.includes('gtm')) return;

    if (h.authorization?.startsWith('Bearer ')) {
      const tok = h.authorization.slice(7);
      if (tok !== capturedJwt) { capturedJwt = tok; console.log('  ✓ JWT captured from browser'); }
    }
    if (url.includes('vagw-api') || (url.includes('portal.restaurant') && !url.includes('partner.foodpanda.com'))) {
      if (h['x-px-cookies']) pxHeaders['x-px-cookies'] = h['x-px-cookies'];
      if (h['x-user-id'])    pxHeaders['x-user-id']    = h['x-user-id'];
      captured.push({ method: req.method(), url, postData: req.postData()?.slice(0, 400) });
      console.log(`  [API] ${req.method()} ${url.slice(0, 120)}`);
    }
  });

  const page = await context.newPage();
  await page.goto(`${PORTAL}/login`, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // UI login
  try {
    await page.fill('input[type="email"], input[name="username"], input[placeholder*="mail"]', account.email);
    await page.fill('input[type="password"]', account.password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(5000);
    const url = page.url();
    console.log(`  After login: ${url.replace(PORTAL, '')}`);
    loginSuccess = !url.includes('/login') && !url.includes('/2fa');
  } catch (err) {
    console.log(`  Login error: ${err.message.slice(0, 100)}`);
  }

  if (!loginSuccess) {
    console.log('  Login did not succeed (2FA or redirect) — session-based approach needed');
    await browser.close();
    return { found: false };
  }

  // Navigate to financial pages
  for (const p of ['/revenue', '/orders', '/report-builder/create/FINANCE']) {
    try {
      await page.goto(`${PORTAL}${p}`, { waitUntil: 'networkidle', timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(5000);
      console.log(`  ${p} → ${page.url().replace(PORTAL, '')}`);
    } catch (_) {}
  }

  await browser.close();

  console.log(`\n  Captured ${captured.length} API calls`);
  captured.forEach(c => console.log(`  ${c.method} ${c.url}`));

  return { found: captured.length > 0, calls: captured };
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== FoodPanda Finance API Discovery — ${LOCATION.toUpperCase()} ===\n`);
  if (!account.email || !account.password) {
    console.error('Credentials not set — check FP_EMAIL/PASSWORD env vars');
    process.exit(1);
  }

  const { token } = await getJwt();

  // Phase 1: vagw-api GraphQL
  const r1 = await tryVagwApi(token);
  if (r1.found) { console.log('\n🎉 vagw-api works! Update get-payouts.js to use GraphQL.'); process.exit(0); }

  // Phase 2: existing session cookies
  const r2 = await tryWithSessionCookies(token);
  if (r2.found) { console.log('\n🎉 Session cookies valid! Finance API found.'); process.exit(0); }

  // Phase 3: full login
  const r3 = await tryFullLogin(token);
  if (r3.found) { console.log('\n🎉 Full login succeeded! Finance API found.'); process.exit(0); }

  console.log('\n⚠️  No financial API endpoint found automatically.');
  console.log('Next step: run setup-session.js locally and navigate to Revenue/Orders pages to capture API calls.');
}

main().catch(e => { console.error(e); process.exit(1); });
