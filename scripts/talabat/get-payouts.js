/**
 * Talabat Partner Portal — per-outlet revenue extractor (HTTP hybrid)
 *
 * Flow:
 *   1. Playwright loads the portal dashboard (headless) to refresh:
 *      - Bearer JWT (auto-renewed by the SPA)
 *      - PerimeterX anti-bot cookies (x-px-cookies)
 *      - Misc required headers (x-user-id, x-rps-device)
 *   2. For each of the 14 Dubai vendors, calls vagw-api GraphQL directly
 *      (much faster than navigating per-outlet in the browser).
 *   3. Posts per-outlet records to WEBHOOK_URL.
 *
 * GraphQL: vagw-api.eu.prd.portal.restaurant/query  (SalesOverviewByTime)
 * Note:    "revenue" is GROSS SALES (what customers paid). To get net payout,
 *          multiply by (1 - commission_rate). Exact rates are on the Talabat
 *          brand-level xlsx (parse_talabat_earnings in ar_parser.py).
 *
 * Usage (local):
 *   SESSION_PATH=scripts/talabat/talabat-session.json \
 *   DATE_FROM=2026-07-01 DATE_TO=2026-07-31 \
 *   node scripts/talabat/get-payouts.js
 *
 * Usage (CI — after refresh-token.js step):
 *   TALABAT_SESSION_PATH=/tmp/talabat-state.json \
 *   DATE_FROM=2026-07-01 DATE_TO=2026-07-31 \
 *   WEBHOOK_URL=https://sushizen-shift-app-038d846023bc.herokuapp.com/api/talabat/portal-payout-record \
 *   node scripts/talabat/get-payouts.js
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const SESSION_PATH = process.env.TALABAT_SESSION_PATH || process.env.SESSION_PATH
  || path.join(__dirname, 'talabat-session.json');
const WEBHOOK_URL  = process.env.WEBHOOK_URL;
const DATE_FROM    = process.env.DATE_FROM;   // YYYY-MM-DD required
const DATE_TO      = process.env.DATE_TO;     // YYYY-MM-DD required

if (!DATE_FROM || !DATE_TO) {
  console.error('DATE_FROM and DATE_TO must be set (e.g. 2026-07-01 / 2026-07-31)');
  process.exit(1);
}

const PORTAL     = 'https://partner-app.talabat.com';
const VAGW_URL   = 'https://vagw-api.eu.prd.portal.restaurant/query';
const VENDOR_API = 'https://vendor-api-ae-lb.me.restaurant-partners.com';
const TIMEOUT    = 30_000;

// All 14 Dubai vendor IDs — Sushi ZEN + Ramen ZEN + virtual brands
const VENDOR_IDS = [
  723150, 765535, 763564, 761205, 759210, 761204,
  762721, 723685, 723684, 723686, 729481, 744680, 719717, 719720,
];

// Known vendor name → store_code mapping (expanded from live data 2026-08)
const NAME_TO_CODE = {
  'sushi zen, al hudaiba':                        'AM',
  'sushi zen,  al hudaiba':                       'AM',
  'sushi zen, al barsha 3':                       'AB',
  'sushi zen, al barsha south':                   'ARJ',
  'sushi zen, business bay':                      'BB',
  'sushi zen, jumeirah lakes towers - jlt':       'JLT',
  // Ramen Zen exists at Arjan and Business Bay only (confirmed 2026-08-21 via vendor API)
  'ramen zen, arjan':                             'RZ_ARJ',
  'ramen zen, business bay':                      'RZ_BB',
  'all veggie sushi, al barsha, al barsha 3':     'VEGGIE_AB',
  // JJAD: AM and JLT in chain 673913 (old); ARJ and BB in chain 694540 (new billing)
  'j - japanese authentic deli, al hudaiba':      'JJAD_AM',
  'j - japanese authentic deli, arjan':           'JJAD_ARJ',
  'j - japanese authentic deli, business bay':    'JJAD_BB',
  'j - japanese authentic deli, jlt, jumeirah lakes towers - jlt': 'JJAD_JLT',
};
function storeCode(name) {
  return NAME_TO_CODE[(name || '').toLowerCase().trim()]
    || (name || `unknown`).replace(/[^a-z0-9]/gi, '_').toUpperCase().slice(0, 10);
}

// ── GraphQL query ─────────────────────────────────────────────────────────────

const SALES_OVERVIEW_QUERY = `query SalesOverviewByTime($params: DateRangeWithPrecisionVendorsReportRequest!) {
  salesOverview {
    salesByTime(input: $params) {
      order_count
      revenue
      details {
        order_count
        revenue
        milestone
        __typename
      }
      __typename
    }
    __typename
  }
}`;

// ── session loader ────────────────────────────────────────────────────────────

function loadSession() {
  const state = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
  if (state.sessionExpired) {
    console.log('Session expired — re-run setup-session.js');
    process.exit(0);
  }
  return state;
}

// ── Playwright: refresh token + capture required analytics headers ─────────────

async function refreshAndCaptureHeaders(state) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: { cookies: state.cookies || [], origins: state.origins || [] },
  });

  let bearerToken = state.bearerToken || null;
  const analyticsHeaders = {};  // headers needed for vagw-api calls

  // Capture bearer token from vendor API (same as refresh-token.js)
  context.on('request', req => {
    const url = req.url();
    const h   = req.headers();

    // Bearer token refresh (from any authenticated API call)
    if ((url.includes('restaurant-partners.com') || url.includes('vagw-api')) && h.authorization) {
      const tok = h.authorization.replace('Bearer ', '');
      if (tok && tok !== bearerToken) {
        bearerToken = tok;
        console.log('✓ Bearer token refreshed');
      }
    }

    // PerimeterX cookies + analytics headers (from vagw-api calls)
    if (url.includes('vagw-api') || url.includes('portal.restaurant/query')) {
      if (h['x-px-cookies'])   analyticsHeaders['x-px-cookies']   = h['x-px-cookies'];
      if (h['x-user-id'])      analyticsHeaders['x-user-id']      = h['x-user-id'];
      if (h['x-rps-device'])   analyticsHeaders['x-rps-device']   = h['x-rps-device'];
      if (h['x-app-name'])     analyticsHeaders['x-app-name']     = h['x-app-name'];
      if (h['apollographql-client-name']) {
        analyticsHeaders['apollographql-client-name'] = h['apollographql-client-name'];
      }
    }
  });

  const page = await context.newPage();

  try {
    await page.goto(`${PORTAL}/report-builder/create/FINANCE`, {
      waitUntil: 'networkidle', timeout: TIMEOUT,
    });
  } catch (_) {}

  await page.waitForTimeout(4000);

  const currentUrl = page.url();
  if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
    await browser.close();
    console.error('❌ Session expired — re-run setup-session.js');
    if (WEBHOOK_URL) {
      try {
        await fetch(WEBHOOK_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendor_id: 'SESSION_EXPIRED', vendor_name: 'SYSTEM',
            period_start: DATE_FROM, period_end: DATE_TO,
            extracted_at: new Date().toISOString(),
          }),
        });
      } catch (_) {}
    }
    process.exit(0);
  }


  if (!analyticsHeaders['x-px-cookies']) {
    console.log('⚠ PX cookies not captured — analytics calls may be rejected');
  }

  // Keep the browser: the GraphQL calls have to go through the page.
  return { bearerToken, analyticsHeaders, browser, page };
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function getVendorName(vendorId, bearerToken) {
  try {
    const resp = await fetch(
      `${VENDOR_API}/api/2/platforms/TB_AE/vendors/${vendorId}`,
      {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          Accept:        'application/json',
          Origin:        PORTAL,
          'client-name': 'OneWeb',
          'client-version': 'menuManagementV2_1.14.25',
        },
      }
    );
    if (!resp.ok) return `V${vendorId}`;
    const d = await resp.json();
    return d.name || d.displayName || `V${vendorId}`;
  } catch (_) {
    return `V${vendorId}`;
  }
}

async function getSalesOverview(vendorId, page, token, analyticsHeaders) {
  const vendorIdB64 = Buffer.from(`TB_AE-${vendorId}`).toString('base64');
  const body = JSON.stringify({
    operationName: 'SalesOverviewByTime',
    variables: {
      params: {
        global_vendor_codes: [`TB_AE;${vendorId}`],
        from:      DATE_FROM,
        to:        DATE_TO,
        precision: 'Day',
      },
    },
    query: SALES_OVERVIEW_QUERY,
  });

  // Talabat is currently refusing this operation outright: loading the portal in
  // a real browser and letting its own SPA ask produces 403 for
  // SalesOverviewByTime, TodayIssues and OpsHealth alike, while ListPayouts on
  // the same host and session still answers. So the 403 is not about how the
  // request is made — Node fetch, page.evaluate and this all fail the same way —
  // and gross sales per outlet cannot be read with this account until that
  // changes. Sent through the browser context regardless, as the closest thing
  // to what the portal does.  Verified 2026-08-25.
  const resp = await page.context().request.post(VAGW_URL, {
    headers: {
      Authorization:        `Bearer ${token}`,
      'x-global-entity-id': 'TB_AE',
      'x-vendor-id':        vendorIdB64,
      'x-country':          'AE',
      'Content-Type':       'application/json',
      Origin:               PORTAL,
      Referer:              `${PORTAL}/`,
      Accept:               '*/*',
      ...analyticsHeaders,
    },
    data:    body,
    timeout: 30_000,
  });

  if (!resp.ok()) {
    const text = await resp.text().catch(() => '');
    const hint = /perimeterx|PX\d/i.test(text) ? ' (PerimeterX challenge)' : '';
    throw new Error(`HTTP ${resp.status()}${hint} ${text.slice(0, 160)}`);
  }
  const d = await resp.json();
  const sb = d?.data?.salesOverview?.salesByTime;
  if (!sb) throw new Error('Unexpected response shape');

  return {
    orders:        parseInt(sb.order_count || 0, 10),
    gross_revenue: parseFloat(sb.revenue || 0),
    daily_details: sb.details || [],
  };
}

// ── webhook ───────────────────────────────────────────────────────────────────

async function postWebhook(payload) {
  if (!WEBHOOK_URL) {
    process.stdout.write(JSON.stringify(payload) + '\n');
    return;
  }
  const resp = await fetch(WEBHOOK_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`Webhook ${resp.status}: ${await resp.text()}`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const state = loadSession();
  console.log(`Talabat per-outlet extractor: ${DATE_FROM} → ${DATE_TO}`);

  // Step 1: refresh token + capture PX cookies via Playwright (single browser session)
  console.log('Refreshing session via portal dashboard...');
  const { bearerToken, analyticsHeaders, browser, page } = await refreshAndCaptureHeaders(state);
  if (!bearerToken) {
    console.error('❌ Could not obtain a Bearer token — session expired');
    process.exit(0);
  }
  console.log(`PX cookies: ${analyticsHeaders['x-px-cookies'] ? '✓' : '✗ (missing)'}`);

  // Save refreshed token back to session file
  const updatedState = { ...state, bearerToken };
  fs.writeFileSync(SESSION_PATH, JSON.stringify(updatedState));

  const extractedAt = new Date().toISOString();
  let totalOrders   = 0;
  let totalRevenue  = 0;

  console.log('\n' + 'Vendor ID'.padEnd(10) + ' ' + 'Name'.padEnd(40) + ' ' + 'Orders'.padStart(8) + ' ' + 'Revenue AED'.padStart(12));
  console.log('-'.repeat(74));

  // Step 2: HTTP calls for all vendors
  for (const vendorId of VENDOR_IDS) {
    let vendorName = `V${vendorId}`;
    let orders = 0, grossRevenue = 0;

    try {
      vendorName  = await getVendorName(vendorId, bearerToken);
      const sales = await getSalesOverview(vendorId, page, bearerToken, analyticsHeaders);
      orders       = sales.orders;
      grossRevenue = sales.gross_revenue;
    } catch (err) {
      console.error(`  Vendor ${vendorId} error: ${err.message}`);
    }

    totalOrders  += orders;
    totalRevenue += grossRevenue;

    const code = storeCode(vendorName);
    const label = vendorName.slice(0, 38);
    console.log(String(vendorId).padEnd(10) + ' ' + label.padEnd(40) + ' ' + String(orders).padStart(8) + ' ' + grossRevenue.toFixed(2).padStart(12));

    // Post to webhook (use gross_revenue as total_payout_aed for now;
    // actual net payout = gross × (1 - commission_rate))
    try {
      await postWebhook({
        vendor_id:        String(vendorId),
        vendor_name:      vendorName,
        store_code:       code,
        period_start:     DATE_FROM,
        period_end:       DATE_TO,
        total_payout_aed: grossRevenue,   // gross — see note above
        orders_count:     orders,
        raw: {
          data_type: 'gross_sales',       // label so backend knows this is gross
          vendor_id: vendorId,
        },
        extracted_at: extractedAt,
      });
    } catch (err) {
      console.error(`  Webhook error: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 300));  // polite delay
  }

  console.log('-'.repeat(74));
  console.log('TOTAL'.padEnd(10) + ' ' + ''.padEnd(40) + ' ' + String(totalOrders).padStart(8) + ' ' + totalRevenue.toFixed(2).padStart(12));
  console.log('\n⚠️  "Revenue AED" = GROSS sales (before Talabat commission deduction).');
  console.log('   Net payout ≈ gross × (1 − commission_rate). Exact rate per outlet');
  console.log('   is in the brand-level xlsx (Gross Sales vs Total Payout columns).');
  await browser.close();
  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
