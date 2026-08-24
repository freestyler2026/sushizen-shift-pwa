/**
 * FoodPanda Payout API response tester
 * Uses saved Playwright session (paranaque-session.b64.txt) to call
 * vagw-api.ap.prd.portal.restaurant/query and print the response shape.
 *
 * Run: node scripts/foodpanda/test-payout-api.js
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const SESSION_B64 = path.join(__dirname, 'paranaque-session.b64.txt');
const SESSION_JSON = path.join(__dirname, 'paranaque-session.json');

if (!fs.existsSync(SESSION_B64)) {
  console.error('No session file found. Run setup-session.js first.');
  process.exit(1);
}

// Decode saved session
const b64  = fs.readFileSync(SESSION_B64, 'utf8').trim();
const data = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
fs.writeFileSync(SESSION_JSON, JSON.stringify(data));

const TODAY = new Date().toISOString().slice(0, 10);
const WEEK_AGO = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

// Paranaque account grids (discovered from session capture)
const ACCOUNTS = [
  { grid: 'HPSBLI', billingParentId: '', chainId: '' },
  { grid: 'HP6SJW', billingParentId: '', chainId: 'cq2lc' },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: SESSION_JSON,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  console.log('Loading portal with saved session...');
  await page.goto('https://partner.foodpanda.com/finance', {
    waitUntil: 'domcontentloaded', timeout: 20_000,
  }).catch(() => {});
  await page.waitForTimeout(3000);
  console.log('Current URL:', page.url().slice(0, 80));

  // ── Test 1: ListPayouts ────────────────────────────────────────────────────
  console.log('\n=== Test 1: ListPayouts (last 7 days) ===');
  const payoutsResult = await page.evaluate(async ({ accounts, startDate, endDate }) => {
    const resp = await fetch('https://vagw-api.ap.prd.portal.restaurant/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        operationName: 'ListPayouts',
        variables: {
          params: {
            startDate,
            endDate,
            filter: {},
            pagination: { pageSize: 20 },
            globalEntityId: 'FP_PH',
            accounts,
          },
        },
        query: `query ListPayouts($params: ListPayoutsRequest!) {
          finances {
            listPayouts(input: $params) {
              payouts {
                payoutId
                payoutDate
                status
                totalPayout
                totalEarnings
                orderCount
                grid
                accountName
                currency
                __typename
              }
              pagination { totalCount __typename }
              __typename
            }
          }
        }`,
      }),
    });
    return { status: resp.status, body: await resp.text() };
  }, { accounts: ACCOUNTS, startDate: WEEK_AGO, endDate: TODAY });

  console.log('Status:', payoutsResult.status);
  try {
    const parsed = JSON.parse(payoutsResult.body);
    console.log(JSON.stringify(parsed, null, 2).slice(0, 3000));
  } catch (_) {
    console.log(payoutsResult.body.slice(0, 1000));
  }

  // ── Test 2: getPayoutEarningsSummary ──────────────────────────────────────
  console.log('\n=== Test 2: getPayoutEarningsSummary ===');
  const summaryResult = await page.evaluate(async ({ accounts, startDate, endDate }) => {
    const resp = await fetch('https://vagw-api.ap.prd.portal.restaurant/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        operationName: 'getPayoutEarningsSummary',
        variables: {
          withBreakdown: false,
          params: {
            globalEntityId: 'FP_PH',
            accounts,
            startDate,
            endDate,
          },
        },
        query: `query getPayoutEarningsSummary($params: GetPayoutEarningsSummaryRequest!, $withBreakdown: Boolean = false) {
          finances {
            getPayoutEarningsSummary(input: $params) {
              totalEarnings
              totalPayout
              totalDeduction
              totalOutstanding
              currency
              __typename
            }
          }
        }`,
      }),
    });
    return { status: resp.status, body: await resp.text() };
  }, { accounts: ACCOUNTS, startDate: WEEK_AGO, endDate: TODAY });

  console.log('Status:', summaryResult.status);
  try {
    const parsed = JSON.parse(summaryResult.body);
    console.log(JSON.stringify(parsed, null, 2).slice(0, 2000));
  } catch (_) {
    console.log(summaryResult.body.slice(0, 500));
  }

  await browser.close();
  // Clean up temp json
  try { fs.unlinkSync(SESSION_JSON); } catch (_) {}
  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
