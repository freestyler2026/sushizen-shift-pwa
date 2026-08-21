/**
 * Talabat Partner Portal — per-outlet payout extractor
 *
 * Uses Playwright to navigate the Finance section and intercept GraphQL
 * responses, extracting per-outlet (per-vendor) payout records.
 *
 * The portal sends all vendor codes in one GraphQL request to:
 *   https://vagw-api.eu.prd.portal.restaurant/query
 * We intercept the response and pull vendor-level breakdown.
 *
 * Usage (local — requires fresh session):
 *   SESSION_PATH=scripts/talabat/talabat-session.json \
 *   DATE_FROM=2026-07-01 DATE_TO=2026-07-31 \
 *   node scripts/talabat/get-payouts.js
 *
 * Usage (CI — after refresh-token.js):
 *   TALABAT_SESSION_PATH=/tmp/talabat-state.json \
 *   DATE_FROM=... DATE_TO=... WEBHOOK_URL=... \
 *   node scripts/talabat/get-payouts.js
 *
 * Output: one JSON object per outlet posted to WEBHOOK_URL, or printed to stdout.
 * Webhook payload: { vendor_id, vendor_name, store_code, period_start, period_end,
 *                    total_payout_aed, orders_count, extracted_at }
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SESSION_PATH = process.env.TALABAT_SESSION_PATH || process.env.SESSION_PATH;
const WEBHOOK_URL  = process.env.WEBHOOK_URL;
const DATE_FROM    = process.env.DATE_FROM;  // YYYY-MM-DD, required
const DATE_TO      = process.env.DATE_TO;    // YYYY-MM-DD, required

if (!SESSION_PATH) throw new Error('TALABAT_SESSION_PATH not set');
if (!DATE_FROM || !DATE_TO) {
  console.error('DATE_FROM and DATE_TO must be set (e.g. 2026-07-01 / 2026-07-31)');
  process.exit(1);
}

const PORTAL = 'https://partner-app.talabat.com';
const VAGW   = 'vagw-api.eu.prd.portal.restaurant';

// All 14 Dubai vendor IDs (Sushi ZEN + Ramen ZEN)
const VENDOR_IDS = [
  723150, 765535, 763564, 761205, 759210, 761204,
  762721, 723685, 723684, 723686, 729481, 744680, 719717, 719720,
];
const GLOBAL_VENDOR_CODES = VENDOR_IDS.map(id => `TB_AE;${id}`);

// Vendor ID → store code (populated from vendor name once fetched)
// Filled in at runtime; static fallback used when name is ambiguous.
const VENDOR_NAME_TO_CODE = {
  // Sushi ZEN outlets
  'sushi zen al barsha':         'AB',
  'sushi zen arjan':             'ARJ',
  'sushi zen al mina':           'AM',
  'sushi zen jumeirah lake towers': 'JLT',
  'sushi zen business bay':      'BB',
  // Ramen ZEN outlets
  'ramen zen business bay':      'RZ_BB',
  'ramen zen jumeirah lake towers': 'RZ_JLT',
  'ramen zen al barsha':         'RZ_AB',
  'ramen zen arjan':             'RZ_ARJ',
};

function vendorNameToCode(name) {
  const key = (name || '').toLowerCase().trim();
  return VENDOR_NAME_TO_CODE[key] || key.replace(/\s+/g, '_').toUpperCase().slice(0, 8);
}

// ── session loader (matches check-prices.js logic) ────────────────────────────

function loadSession(sessionPath) {
  const state = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  if (state.sessionExpired) {
    console.log('Session flagged as expired — re-run setup-session.js first');
    process.exit(0);
  }
  return state;
}

// ── post to webhook ───────────────────────────────────────────────────────────

async function postWebhook(payload) {
  if (!WEBHOOK_URL) {
    console.log('WEBHOOK_URL not set — printing instead:');
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  const resp = await fetch(WEBHOOK_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Webhook ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

// ── parse GraphQL response for per-vendor sales data ─────────────────────────
//
// The SalesOverviewByTime response structure (discovered from network inspection):
// { data: { salesOverviewByTime: { vendorsData: [{ vendorCode, netRevenue, orders, ... }] } } }
// or similar. We try multiple known paths.

function extractVendorRows(responseBody) {
  try {
    const d = responseBody.data;
    if (!d) return null;

    // Try known response paths
    const candidates = [
      d.salesOverviewByTime?.vendorsData,
      d.salesOverviewByTime?.vendors,
      d.salesOverview?.vendorsData,
      d.vendorSalesOverview?.vendorsData,
      d.payoutsOverview?.vendors,
      d.financeSummary?.vendors,
    ];

    for (const arr of candidates) {
      if (Array.isArray(arr) && arr.length > 0) return arr;
    }

    // Fallback: walk top-level data keys looking for any array with vendorCode
    for (const key of Object.keys(d)) {
      const val = d[key];
      if (Array.isArray(val) && val.length > 0 && val[0].vendorCode) return val;
      if (val && typeof val === 'object') {
        for (const key2 of Object.keys(val)) {
          const val2 = val[key2];
          if (Array.isArray(val2) && val2.length > 0 && val2[0].vendorCode) return val2;
        }
      }
    }
  } catch (_) {}
  return null;
}

function parseAmount(val) {
  if (val == null) return null;
  if (typeof val === 'number') return Math.round(val * 100) / 100;
  if (typeof val === 'object') {
    // { amount, currency } pattern
    if (val.amount != null) return parseAmount(val.amount);
  }
  return null;
}

function rowToRecord(row, extractedAt) {
  // vendorCode is "TB_AE;723150"
  const rawCode = String(row.vendorCode || row.globalEntityVendorCode || '');
  const vendorId = rawCode.split(';')[1] || rawCode;
  const vendorName = row.vendorName || row.name || '';

  // Revenue / payout fields — try multiple names
  const totalPayout = parseAmount(
    row.netRevenue ?? row.totalPayout ?? row.payout ?? row.payoutAmount ??
    row.earnings?.total ?? row.revenue?.net
  );
  const ordersCount = row.orders ?? row.ordersCount ?? row.totalOrders ?? null;

  return {
    vendor_id:        vendorId,
    vendor_name:      vendorName,
    store_code:       vendorNameToCode(vendorName) || `V${vendorId}`,
    period_start:     DATE_FROM,
    period_end:       DATE_TO,
    total_payout_aed: totalPayout,
    orders_count:     typeof ordersCount === 'number' ? ordersCount : null,
    raw:              row,
    extracted_at:     extractedAt,
  };
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const state   = loadSession(SESSION_PATH);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: { cookies: state.cookies || [], origins: state.origins || [] },
  });

  const extractedAt   = new Date().toISOString();
  const payoutRecords = [];        // per-vendor payout records
  const discoveredQueries = [];    // all finance-related GQL operations seen

  // Intercept ALL responses from the analytics/finance GraphQL endpoint
  context.on('response', async resp => {
    const url = resp.url();
    if (!url.includes(VAGW) && !url.includes('portal.restaurant')) return;

    let body;
    try { body = await resp.json(); } catch (_) { return; }

    // Log every operation for debugging
    const req = resp.request();
    let opName = 'unknown';
    try {
      const pd = JSON.parse(req.postData() || '{}');
      opName = pd.operationName || 'unknown';
      discoveredQueries.push({ url, opName, statusCode: resp.status() });
    } catch (_) {}

    // Try to extract per-vendor rows
    const rows = extractVendorRows(body);
    if (rows) {
      console.log(`✅ Found vendor data in operation "${opName}": ${rows.length} rows`);
      for (const row of rows) {
        payoutRecords.push(rowToRecord(row, extractedAt));
      }
    }
  });

  // Also capture any new bearer token (similar to refresh-token.js)
  let newBearerToken = state.bearerToken || null;
  context.on('request', req => {
    const url = req.url();
    if (!url.includes('restaurant-partners.com') && !url.includes(VAGW)) return;
    const auth = req.headers().authorization;
    if (auth?.startsWith('Bearer ') && !newBearerToken) {
      newBearerToken = auth.replace('Bearer ', '');
      console.log('Bearer token captured');
    }
  });

  const page = await context.newPage();

  // 1. Load dashboard to establish session and refresh bearer token
  console.log(`Navigating to portal dashboard (${DATE_FROM} → ${DATE_TO})...`);
  try {
    await page.goto(`${PORTAL}/dashboard`, { waitUntil: 'networkidle', timeout: 30_000 });
  } catch (_) {
    // networkidle timeout is common on SPAs — continue
  }
  await page.waitForTimeout(3000);

  console.log(`URL after dashboard load: ${page.url()}`);

  if (page.url().includes('/login') || page.url().includes('/auth')) {
    console.error('❌ Session expired — cookies are invalid. Re-run setup-session.js.');
    await browser.close();
    if (WEBHOOK_URL) {
      try {
        await fetch(WEBHOOK_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            vendor_id: 'SESSION_EXPIRED', vendor_name: 'SYSTEM',
            period_start: DATE_FROM, period_end: DATE_TO,
            extracted_at: new Date().toISOString(),
          }),
        });
      } catch (_) {}
    }
    process.exit(0);
  }

  // 2. Try finance-related URLs (the SPA may fetch data on navigation)
  const financeUrls = [
    `${PORTAL}/finance`,
    `${PORTAL}/finance/payouts`,
    `${PORTAL}/finance/earnings`,
    `${PORTAL}/finance/overview`,
    `${PORTAL}/accounting`,
    `${PORTAL}/reports/finance`,
    `${PORTAL}/reports`,
  ];

  for (const url of financeUrls) {
    console.log(`  Trying: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15_000 });
      await page.waitForTimeout(2000);

      // If this page triggers vendor data — stop navigating
      if (payoutRecords.length > 0) {
        console.log(`Found vendor data at ${url}`);
        break;
      }
    } catch (_) {}
  }

  // 3. If still no data, try clicking Finance nav items
  if (payoutRecords.length === 0) {
    console.log('No data from URL navigation — scanning nav menu...');
    try {
      // Look for Finance link in the nav
      const financeLink = page.locator('a[href*="finance"], a[href*="earnings"], a[href*="payouts"], nav a').filter({ hasText: /finance|earnings|payout|payment/i }).first();
      if (await financeLink.count() > 0) {
        await financeLink.click();
        await page.waitForTimeout(3000);
      }
    } catch (_) {}
  }

  // 4. Wait for any in-flight requests to complete
  await page.waitForTimeout(5000);

  await browser.close();

  // ── Results ──
  console.log(`\n=== Results ===`);
  console.log(`GraphQL operations intercepted: ${discoveredQueries.length}`);
  discoveredQueries.forEach(q => console.log(`  ${q.opName} → HTTP ${q.statusCode}`));
  console.log(`Per-vendor payout records: ${payoutRecords.length}`);

  if (payoutRecords.length === 0) {
    console.log('\n⚠️  No per-vendor data found.');
    console.log('The portal may require interacting with a date picker or store selector.');
    console.log('Run discover-finance-api.js (headful) to inspect the Finance UI manually.');

    // Save discovery output for debugging
    const debugPath = path.join(__dirname, 'talabat-finance-debug.json');
    fs.writeFileSync(debugPath, JSON.stringify({ discoveredQueries, date: new Date().toISOString() }, null, 2));
    console.log(`Debug info saved to ${debugPath}`);
    process.exit(0);
  }

  // Output / post records
  console.log('\nPayout records:');
  for (const rec of payoutRecords) {
    console.log(`  ${rec.vendor_name} (${rec.store_code}): ${rec.total_payout_aed} AED, ${rec.orders_count} orders`);
    try {
      await postWebhook(rec);
    } catch (err) {
      console.error(`  Webhook error for ${rec.vendor_id}:`, err.message);
    }
  }

  // Save updated session (with possibly refreshed bearer token)
  if (newBearerToken && newBearerToken !== state.bearerToken) {
    const updated = { ...state, bearerToken: newBearerToken };
    fs.writeFileSync(SESSION_PATH, JSON.stringify(updated));
    console.log('Session updated with fresh bearer token.');
  }

  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
