/**
 * Talabat Partner Portal — per-outlet NET PAYOUT extractor
 *
 * Uses the ListPayouts GraphQL operation to get actual bank transfer amounts
 * (net of commission) per BRAND/CHAIN per payout period.
 *
 * Note on granularity:
 *   Talabat pays per billing chain (contract entity), NOT per outlet.
 *   There are 4 billing chains covering all 14 Dubai vendors:
 *     - 671526: Sushi ZEN (5 outlets: AM, AB, ARJ, BB, JLT)
 *     - 694540: Ramen ZEN (4 outlets)
 *     - 673913: J-Japanese / mixed (4 outlets)
 *     - 698589: All Veggie Sushi (1 outlet)
 *   To get per-outlet allocation, use gross sales share from get-payouts.js.
 *
 * How it works:
 *   1. Playwright loads the portal to refresh Bearer JWT + PX cookies.
 *   2. Calls ListPayouts once per chain (4 API calls total), paginating.
 *   3. Posts each chain-level payout record to WEBHOOK_URL.
 *
 * GraphQL: vagw-api.eu.prd.portal.restaurant/query  (ListPayouts)
 * "payoutAmount" = netPayout = gross × (1 - commission_rate)
 *
 * Usage (local test):
 *   SESSION_PATH=scripts/talabat/talabat-session.json \
 *   DATE_FROM=2026-07-01 DATE_TO=2026-07-31 \
 *   node scripts/talabat/get-net-payouts.js
 *
 * Usage (CI — after refresh-token.js):
 *   TALABAT_SESSION_PATH=/tmp/talabat-state.json \
 *   DATE_FROM=2026-07-01 DATE_TO=2026-07-31 \
 *   WEBHOOK_URL=https://sushizen-shift-app-038d846023bc.herokuapp.com/api/talabat/portal-payout-record \
 *   node scripts/talabat/get-net-payouts.js
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

const PORTAL          = 'https://partner-app.talabat.com';
const VAGW_URL        = 'https://vagw-api.eu.prd.portal.restaurant/query';
const ONBOARDING_URL  = 'https://so-backend.deliveryhero.io/api/v1/entity/TB_AE/onboarding/vendors';
const TIMEOUT         = 30_000;
const PAGE_SIZE       = 50;

// Known vendor_id → store_code mapping (from get-payouts.js live data 2026-08)
const NAME_TO_CODE = {
  'sushi zen, al hudaiba':                        'AM',
  'sushi zen,  al hudaiba':                       'AM',
  'sushi zen, al barsha 3':                       'AB',
  'sushi zen, al barsha south':                   'ARJ',
  'sushi zen, business bay':                      'BB',
  'sushi zen, jumeirah lakes towers - jlt':       'JLT',
  'ramen zen, al hudaiba':                        'RZ_AM',
  'ramen zen, arjan':                             'RZ_ARJ',
  'ramen zen, business bay':                      'RZ_BB',
  'ramen zen, jumeirah lakes towers - jlt':       'RZ_JLT',
  'all veggie sushi, al barsha, al barsha 3':     'VEGGIE_AB',
  'j - japanese authentic deli, al hudaiba':      'JJAD_AM',
  'j - japanese authentic deli, arjan':           'JJAD_ARJ',
  'j - japanese authentic deli, business bay':    'JJAD_BB',
  'j - japanese authentic deli, jlt, jumeirah lakes towers - jlt': 'JJAD_JLT',
};
function storeCode(name) {
  return NAME_TO_CODE[(name || '').toLowerCase().trim()]
    || (name || 'unknown').replace(/[^a-z0-9]/gi, '_').toUpperCase().slice(0, 10);
}

// Hardcoded grid → chainId map (captured from portal 2026-08-21)
// These are static billing account identifiers per outlet.
const GRID_TO_CHAIN = {
  '4CO4Y1': '671526',  // Sushi ZEN AM
  '4C19Z9': '671526',  // Sushi ZEN AB
  '4CM5GD': '671526',  // Sushi ZEN JLT
  'HARLKZ': '671526',  // Sushi ZEN BB
  '4CYUPB': '671526',  // Sushi ZEN ARJ
  '4ML3TQ': '698589',  // All Veggie Sushi AB
  '4M8HWV': '694540',  // Ramen ZEN
  '4M3CV9': '694540',  // Ramen ZEN
  '4M3CV1': '694540',  // Ramen ZEN
  '4M3CXB': '694540',  // Ramen ZEN
  '4M869V': '673913',  // JJAD
  '4CYUPL': '673913',  // JJAD / Ramen ZEN
  '4CYUPE': '673913',  // JJAD / Ramen ZEN
  '4CYUP6': '673913',  // JJAD
};

// ── GraphQL query ─────────────────────────────────────────────────────────────

const LIST_PAYOUTS_QUERY = `query ListPayouts($params: ListPayoutsRequest!) {
  finances {
    listPayouts(input: $params) {
      nextPageToken
      prevPageToken
      payouts {
        payoutId: id
        payoutAmount: netPayout
        payoutCurrency: currency
        payoutOrders: ordersCount
        at: paymentDateLocal
        status: payoutStatus
        payoutAccount: account {
          grid
          billingParentId
          chainId
          __typename
        }
        invoices {
          invoiceId: id
          invoiceAmount: totalPayout
          invoiceCurrency: currency
          invoiceOrders: ordersCount
          processedDate
          period: earningsPeriod {
            from: invoiceStartDate
            to: invoiceEndDate
            __typename
          }
          invoiceAccount: account {
            grid
            billingParentId
            chainId
            __typename
          }
          __typename
        }
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

// ── Playwright: refresh Bearer JWT + capture PX cookies ───────────────────────

async function refreshAndCaptureHeaders(state) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: { cookies: state.cookies || [], origins: state.origins || [] },
  });

  let bearerToken = state.bearerToken || null;
  const analyticsHeaders = {};

  context.on('request', req => {
    const url = req.url();
    const h   = req.headers();
    if ((url.includes('restaurant-partners.com') || url.includes('vagw-api') ||
         url.includes('so-backend')) && h.authorization) {
      const tok = h.authorization.replace('Bearer ', '');
      if (tok && tok !== bearerToken) {
        bearerToken = tok;
        console.log('✓ Bearer token refreshed');
      }
    }
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
    await page.goto(`${PORTAL}/finance`, { waitUntil: 'networkidle', timeout: TIMEOUT });
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

  await browser.close();

  if (!analyticsHeaders['x-px-cookies']) {
    console.log('⚠ PX cookies not captured — may get 403');
  }

  return { bearerToken, analyticsHeaders };
}

// ── API helpers ───────────────────────────────────────────────────────────────

// Fetch vendor → grid mapping from the onboarding API.
async function getVendorGridMap(bearerToken) {
  const resp = await fetch(ONBOARDING_URL, {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      Accept:        'application/json',
      Referer:       `${PORTAL}/`,
      'User-Agent':  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });
  if (!resp.ok) throw new Error(`Onboarding API HTTP ${resp.status}`);
  const vendors = await resp.json();
  const map = {};  // vendor_id → { grid, chainId }
  vendors.forEach(v => {
    const chainId = GRID_TO_CHAIN[v.grid] || '';
    map[String(v.vendor_id)] = { grid: v.grid, chainId };
  });
  return map;
}

// Fetch vendor display name from vendor API.
async function getVendorName(vendorId, bearerToken) {
  try {
    const resp = await fetch(
      `https://vendor-api-ae-lb.me.restaurant-partners.com/api/2/platforms/TB_AE/vendors/${vendorId}`,
      {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          Accept: 'application/json',
          Origin: PORTAL,
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

// Call ListPayouts for a chain (all accounts for that chain).
// vendorId is used for the x-vendor-id header; accounts is the full chain account list.
// Paginates through all results.
async function listPayoutsForVendor(vendorId, _grid, _chainId, token, analyticsHeaders, accounts) {
  const vendorIdB64 = Buffer.from(`TB_AE-${vendorId}`).toString('base64');
  const payouts  = [];
  let pageToken  = null;

  // If called with old signature (single grid/chainId), build single-entry accounts
  if (!accounts) {
    accounts = [{ grid: _grid, billingParentId: '', chainId: _chainId }];
  }

  while (true) {
    const variables = {
      params: {
        globalEntityId: 'TB_AE',
        accounts,
        startDate: DATE_FROM,
        endDate:   DATE_TO,
        filter:    {},
        pagination: { pageSize: PAGE_SIZE, ...(pageToken ? { pageToken } : {}) },
      },
    };

    const resp = await fetch(VAGW_URL, {
      method:  'POST',
      headers: {
        Authorization:              `Bearer ${token}`,
        'x-global-entity-id':       'TB_AE',
        'x-vendor-id':              vendorIdB64,
        'x-country':                'AE',
        'Content-Type':             'application/json',
        Origin:                     PORTAL,
        Referer:                    `${PORTAL}/`,
        'User-Agent':               'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
        Accept:                     '*/*',
        ...analyticsHeaders,
      },
      body: JSON.stringify({ operationName: 'ListPayouts', variables, query: LIST_PAYOUTS_QUERY }),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const d = await resp.json();
    const lp = d?.data?.finances?.listPayouts;
    if (!lp) throw new Error('Unexpected response shape');

    payouts.push(...(lp.payouts || []));

    if (!lp.nextPageToken) break;
    pageToken = lp.nextPageToken;
    await new Promise(r => setTimeout(r, 200));
  }

  return payouts;
}

// ── webhook ───────────────────────────────────────────────────────────────────

async function postWebhook(payload) {
  if (!WEBHOOK_URL) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n---\n');
    return;
  }
  const resp = await fetch(WEBHOOK_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`Webhook ${resp.status}: ${await resp.text()}`);
}

// ── Chain-level configuration ─────────────────────────────────────────────────
// Talabat pays per billing chain. These 4 chains cover all 14 Dubai vendors.
// Each entry: { representativeVendorId, accounts[], chainName, storeCodes[] }
const CHAINS = [
  {
    chainId:   '671526',
    chainName: 'Sushi ZEN',
    vendorId:  '723150',   // representative vendor for x-vendor-id header
    accounts:  [
      { grid: '4CO4Y1', billingParentId: '', chainId: '671526' },  // AM
      { grid: '4C19Z9', billingParentId: '', chainId: '671526' },  // AB
      { grid: '4CM5GD', billingParentId: '', chainId: '671526' },  // JLT
      { grid: 'HARLKZ', billingParentId: '', chainId: '671526' },  // BB
      { grid: '4CYUPB', billingParentId: '', chainId: '671526' },  // ARJ
    ],
    storeCodes: ['AM', 'AB', 'JLT', 'BB', 'ARJ'],
  },
  {
    chainId:   '694540',
    chainName: 'Ramen ZEN',
    vendorId:  '763564',
    accounts:  [
      { grid: '4M8HWV', billingParentId: '', chainId: '694540' },
      { grid: '4M3CV9', billingParentId: '', chainId: '694540' },
      { grid: '4M3CV1', billingParentId: '', chainId: '694540' },
      { grid: '4M3CXB', billingParentId: '', chainId: '694540' },
    ],
    storeCodes: ['RZ_AM', 'RZ_ARJ', 'RZ_BB', 'RZ_JLT'],
  },
  {
    chainId:   '673913',
    chainName: 'J-Japanese / Ramen ZEN',
    vendorId:  '762721',
    accounts:  [
      { grid: '4M869V', billingParentId: '', chainId: '673913' },
      { grid: '4CYUPL', billingParentId: '', chainId: '673913' },
      { grid: '4CYUPE', billingParentId: '', chainId: '673913' },
      { grid: '4CYUP6', billingParentId: '', chainId: '673913' },
    ],
    storeCodes: ['JJAD_AM', 'RZ_JLT', 'RZ_AM', 'JJAD_JLT'],
  },
  {
    chainId:   '698589',
    chainName: 'All Veggie Sushi',
    vendorId:  '765535',
    accounts:  [
      { grid: '4ML3TQ', billingParentId: '', chainId: '698589' },
    ],
    storeCodes: ['VEGGIE_AB'],
  },
];

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const state = loadSession();
  console.log(`Talabat per-chain NET PAYOUT extractor: ${DATE_FROM} → ${DATE_TO}`);
  console.log('Note: Talabat pays per billing chain, not per outlet.');
  console.log('      4 chains cover all 14 Dubai vendors.\n');

  // Step 1: refresh token + capture PX cookies
  console.log('Refreshing session via portal finance page...');
  const { bearerToken, analyticsHeaders } = await refreshAndCaptureHeaders(state);
  if (!bearerToken) {
    console.error('❌ Could not obtain a Bearer token');
    process.exit(0);
  }
  console.log(`PX cookies: ${analyticsHeaders['x-px-cookies'] ? '✓' : '✗ (missing)'}`);

  // Save refreshed token
  fs.writeFileSync(SESSION_PATH, JSON.stringify({ ...state, bearerToken }));

  const extractedAt = new Date().toISOString();
  let totalPayouts  = 0;

  console.log('\n' + 'Chain'.padEnd(28) + ' ' + 'Payouts'.padStart(8) + ' ' + 'Net AED'.padStart(12));
  console.log('-'.repeat(52));

  // Step 2: one ListPayouts call per chain (4 calls total)
  for (const chain of CHAINS) {
    let payouts = [];
    try {
      payouts = await listPayoutsForVendor(
        chain.vendorId, null, null,
        bearerToken, analyticsHeaders, chain.accounts
      );
    } catch (err) {
      console.error(`  Chain ${chain.chainId} (${chain.chainName}) error: ${err.message}`);
    }

    const totalNet = payouts.reduce((s, p) => s + (p.payoutAmount || 0), 0);
    console.log(chain.chainName.padEnd(28) + ' ' + String(payouts.length).padStart(8) + ' ' + totalNet.toFixed(2).padStart(12));
    totalPayouts += payouts.length;

    // Post each payout record (store_code = chain name)
    for (const payout of payouts) {
      const invoices   = payout.invoices || [];
      const periodFrom = invoices.length ? invoices.map(i => i.period?.from).filter(Boolean).sort()[0] : DATE_FROM;
      const periodTo   = invoices.length ? invoices.map(i => i.period?.to).filter(Boolean).sort().pop() : DATE_TO;

      try {
        await postWebhook({
          vendor_id:        chain.chainId,          // use chainId as vendor_id for chain-level records
          vendor_name:      chain.chainName,
          store_code:       chain.chainId,          // chainId is the dedup key for chain records
          period_start:     periodFrom,
          period_end:       periodTo,
          total_payout_aed: payout.payoutAmount || 0,
          orders_count:     payout.payoutOrders  || 0,
          raw: {
            data_type:        'net_payout',
            payout_id:        payout.payoutId,
            payment_date:     payout.at,
            status:           payout.status,
            currency:         payout.payoutCurrency,
            chain_id:         chain.chainId,
            chain_name:       chain.chainName,
            store_codes:      chain.storeCodes,    // which outlets are in this chain
            invoices:         invoices.map(inv => ({
              invoice_id:     inv.invoiceId,
              invoice_amount: inv.invoiceAmount,
              orders_count:   inv.invoiceOrders,
              period_from:    inv.period?.from,
              period_to:      inv.period?.to,
            })),
          },
          extracted_at: extractedAt,
        });
      } catch (err) {
        console.error(`  Webhook error (chain ${chain.chainId}, payout ${payout.payoutId}): ${err.message}`);
      }
    }

    await new Promise(r => setTimeout(r, 300));
  }

  console.log('-'.repeat(52));
  console.log(`Total payout records posted: ${totalPayouts}`);
  console.log('\n✓ Net payout = actual bank transfer (gross sales minus Talabat commission).');
  console.log('  To allocate to individual outlets: use gross sales share from get-payouts.js.');
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
