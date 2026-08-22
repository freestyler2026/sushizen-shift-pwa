/**
 * FoodPanda finance API discovery — Phase 3 refined
 *
 * Strategy:
 *   1. Get JWT via REST (no 2FA)
 *   2. Visit portal homepage in headless Playwright to get PX anti-bot cookies
 *      (PX sets cookies on ANY page visit, no login needed)
 *   3. Use JWT + PX cookies to call vagw-api.ap.prd.portal.restaurant/query
 *   4. If vagw-api works: report the GraphQL operation + headers
 *   5. If not: report what we found so user can run setup-session.js manually
 */

const { chromium } = require('playwright');

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
if (!account?.email) { console.error('Credentials not set'); process.exit(1); }

const AUTH_URL  = 'https://partner-auth.ap.prd.portal.restaurant/auth/v5/login-two-step';
const PORTAL    = 'https://partner.foodpanda.com';
const PLATFORM  = 'FP_PH';
const DATE      = '2026-08-21';

const VAGW_URL  = 'https://vagw-api.ap.prd.portal.restaurant/query';

const QUERIES = {
  introspect: '{ __typename }',
  sales: `query SalesOverviewByTime($params: DateRangeWithPrecisionVendorsReportRequest!) {
    salesOverview { salesByTime(input: $params) { order_count revenue __typename } __typename }
  }`,
  revenueReport: `query RevenueReport($input: RevenueReportInput!) {
    revenueReport(input: $input) { total_revenue order_count __typename }
  }`,
  ordersReport: `query OrdersReport($input: OrdersReportInput!) {
    ordersReport(input: $input) { orders { id total_value status __typename } __typename }
  }`,
};

async function getJwt() {
  const resp = await fetch(AUTH_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': PORTAL, 'Accept': 'application/json' },
    body:    JSON.stringify({ username: account.email, password: account.password, type: 'password' }),
    signal:  AbortSignal.timeout(20_000),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error(`No token: ${JSON.stringify(data).slice(0, 300)}`);
  console.log('✓ JWT obtained via REST');
  // Show vendor IDs from profile
  const ids = (data.profile?.accounts || []).map(a => a.vendor_id || a.code).filter(Boolean);
  if (ids.length) console.log(`  Profile vendor IDs: [${ids.join(', ')}]`);
  return data.access_token;
}

// ── Step 1: Get PX cookies from portal homepage (no login needed) ──────────

async function getPxCookies() {
  console.log('\n── Getting PX anti-bot cookies from portal homepage ──');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  });

  const pxCookies  = {};
  const portalCookies = [];
  let pxCookieStr  = '';
  let capturedJwt  = null;

  context.on('request', req => {
    const url = req.url();
    const h   = req.headers();
    if (url.includes('portal.restaurant') && !url.includes('partner.foodpanda.com')) {
      if (h['x-px-cookies']) { pxCookies['x-px-cookies'] = h['x-px-cookies']; console.log('  ✓ x-px-cookies captured!'); }
      if (h['x-user-id'])    { pxCookies['x-user-id']    = h['x-user-id']; }
      if (h['x-rps-device']) { pxCookies['x-rps-device'] = h['x-rps-device']; }
      if (h['authorization']) {
        capturedJwt = h['authorization'].replace('Bearer ', '');
        console.log(`  ✓ JWT captured from browser request: ${url.slice(0, 80)}`);
      }
      console.log(`  [portal.restaurant] ${req.method()} ${url.slice(0, 100)}`);
    }
  });

  const page = await browser.newPage();

  // Visit public portal page (no login needed — PX runs on any page load)
  console.log('  Visiting portal homepage to trigger PX...');
  await page.goto(PORTAL, { waitUntil: 'load', timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log(`  URL after load: ${page.url().slice(0, 60)}`);

  // Also try /login page for PX
  console.log('  Visiting /login for additional PX cookies...');
  await page.goto(`${PORTAL}/login`, { waitUntil: 'load', timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(4000);

  // Collect browser cookies (PX sets cookies on the document)
  const cookies = await context.cookies();
  const pxBrowserCookies = cookies.filter(c => c.name.startsWith('_px') || c.name.startsWith('_pxhd') || c.name.includes('perimeterx'));
  pxBrowserCookies.forEach(c => {
    portalCookies.push(`${c.name}=${c.value}`);
    console.log(`  Browser PX cookie: ${c.name}=${c.value.slice(0, 30)}...`);
  });

  if (portalCookies.length > 0) {
    pxCookieStr = portalCookies.join('; ');
  }

  await browser.close();

  console.log(`\n  Captured PX header cookies: ${Object.keys(pxCookies).join(', ') || 'none'}`);
  console.log(`  Captured browser PX cookies: ${pxBrowserCookies.length}`);

  return { pxCookies, pxCookieStr, capturedJwt };
}

// ── Step 2: Call vagw-api with JWT + PX cookies ────────────────────────────

async function tryVagwWithPx(token, pxCookies, pxCookieStr) {
  console.log('\n── Testing vagw-api.ap with JWT + PX cookies ──');

  const vendorIdB64 = Buffer.from(`${PLATFORM}-${account.vendorId}`).toString('base64');

  const baseHeaders = {
    'Authorization':             `Bearer ${token}`,
    'Content-Type':              'application/json',
    'Accept':                    'application/json',
    'User-Agent':                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    'Origin':                    PORTAL,
    'Referer':                   `${PORTAL}/`,
    'x-global-entity-id':        PLATFORM,
    'x-vendor-id':               vendorIdB64,
    'x-country':                 'PH',
    'apollographql-client-name': 'VendorPortalWebApp',
    ...pxCookies,  // x-px-cookies, x-user-id, x-rps-device if captured
  };

  if (pxCookieStr) {
    baseHeaders['Cookie'] = pxCookieStr;
  }

  // Test 1: Minimal introspection
  console.log('\n  Test 1: introspection { __typename }');
  try {
    const resp = await fetch(VAGW_URL, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({ query: QUERIES.introspect }),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await resp.text();
    console.log(`  → ${resp.status}: ${text.slice(0, 200)}`);
    if (resp.ok) {
      console.log('  ✅ vagw-api responds to introspection!');
    }
  } catch (err) { console.log(`  → ERR: ${err.message}`); }

  // Test 2: SalesOverview (Talabat's exact operation)
  console.log('\n  Test 2: SalesOverviewByTime');
  try {
    const resp = await fetch(VAGW_URL, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({
        operationName: 'SalesOverviewByTime',
        variables: {
          params: { global_vendor_codes: [`${PLATFORM};${account.vendorId}`], from: DATE, to: DATE, precision: 'Day' },
        },
        query: QUERIES.sales,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await resp.text();
    console.log(`  → ${resp.status}: ${text.slice(0, 400)}`);
    if (resp.ok) console.log('  ✅ SalesOverviewByTime works!');
  } catch (err) { console.log(`  → ERR: ${err.message}`); }

  // Test 3: Try without x-vendor-id
  console.log('\n  Test 3: introspection without x-vendor-id header');
  const headersNoVendor = { ...baseHeaders };
  delete headersNoVendor['x-vendor-id'];
  try {
    const resp = await fetch(VAGW_URL, {
      method: 'POST',
      headers: headersNoVendor,
      body: JSON.stringify({ query: QUERIES.introspect }),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await resp.text();
    console.log(`  → ${resp.status}: ${text.slice(0, 200)}`);
  } catch (err) { console.log(`  → ERR: ${err.message}`); }

  // Test 4: Try with x-app-name header
  console.log('\n  Test 4: with x-app-name header variants');
  for (const appName of ['vendorPortal', 'SalesOverviewWebApp', 'fp-vendor-portal']) {
    try {
      const resp = await fetch(VAGW_URL, {
        method: 'POST',
        headers: { ...baseHeaders, 'x-app-name': appName },
        body: JSON.stringify({ query: QUERIES.introspect }),
        signal: AbortSignal.timeout(8_000),
      });
      const text = await resp.text();
      console.log(`  → [${resp.status}] x-app-name=${appName}: ${text.slice(0, 150)}`);
      if (resp.ok) console.log('  ✅ Works with this app name!');
    } catch (err) { console.log(`  → ERR: ${err.message}`); }
  }
}

// ── Step 3: Try known working portal APIs to understand JWT scope ──────────

async function probeJwtScope(token) {
  console.log('\n── JWT scope probe ──');

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept':        'application/json',
    'Origin':        PORTAL,
    'Referer':       `${PORTAL}/`,
    'User-Agent':    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  };

  // Known-working endpoints from previous discovery run — get FULL response
  const winners = [
    `https://partner.foodpanda.com/api/v1/vendors/${account.vendorId}/orders?from=${DATE}&to=${DATE}&limit=5`,
    `https://partner.foodpanda.com/api/v1/revenue?vendor_id=${account.vendorId}&from=${DATE}&to=${DATE}`,
    `https://partner.foodpanda.com/api/vendors/${account.vendorId}/revenue`,
    `https://partner.foodpanda.com/api/vendors/${account.vendorId}/revenue?from=${DATE}&to=${DATE}`,
    // Variants: status filter, pagination
    `https://partner.foodpanda.com/api/v1/vendors/${account.vendorId}/orders?from=${DATE}&to=${DATE}&status=ACCEPTED&limit=5`,
    `https://partner.foodpanda.com/api/v1/vendors/${account.vendorId}/orders?from=${DATE}&to=${DATE}&status=DELIVERED&limit=5`,
    `https://partner.foodpanda.com/api/v1/revenue?vendor_id=${account.vendorId}&from=${DATE}&to=${DATE}&period=daily`,
    // More path variants
    `https://partner.foodpanda.com/api/v1/vendors/${account.vendorId}/revenue?from=${DATE}&to=${DATE}`,
    `https://partner.foodpanda.com/api/v2/vendors/${account.vendorId}/orders?from=${DATE}&to=${DATE}&limit=5`,
    `https://partner.foodpanda.com/api/v2/revenue?vendor_id=${account.vendorId}&from=${DATE}&to=${DATE}`,
  ];

  console.log('\n  [Winners from previous run — full response bodies]');
  for (const url of winners) {
    try {
      const resp = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
      const text = await resp.text();
      const icon = resp.ok ? '✅' : resp.status === 404 ? '❌' : `⚠️(${resp.status})`;
      console.log(`\n  ${icon} [${resp.status}] ${url.replace('https://partner.foodpanda.com', '')}`);
      if (resp.ok) {
        // Print FULL response (up to 1500 chars)
        console.log(`  RESPONSE (${text.length} bytes):`);
        console.log(text.slice(0, 1500));
      } else {
        console.log(`  ${text.slice(0, 200)}`);
      }
    } catch (err) {
      console.log(`  ❌ [ERR] ${url.slice(0, 80)}: ${err.message}`);
    }
  }
}

async function main() {
  console.log(`\n=== FoodPanda Finance API Discovery v3 — ${LOCATION.toUpperCase()} ===\n`);

  const token = await getJwt();

  const { pxCookies, pxCookieStr, capturedJwt } = await getPxCookies();
  const effectiveToken = capturedJwt || token;
  if (capturedJwt) console.log('  Using browser-captured JWT for vagw-api tests');

  await tryVagwWithPx(effectiveToken, pxCookies, pxCookieStr);
  await probeJwtScope(token);

  console.log('\n=== Summary ===');
  console.log('PX header cookies captured:', Object.keys(pxCookies).length > 0 ? JSON.stringify(pxCookies).slice(0, 100) : 'none');
  console.log('Browser JWT captured from portal:', capturedJwt ? 'yes' : 'no');
  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
