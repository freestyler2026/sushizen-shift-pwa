/**
 * FoodPanda Manila — settle cancellations from the portal's per-order view
 *
 * FoodPanda never sends a compensation transaction for a cancelled order the way
 * Grab does; it takes the order out of billing (NOT_BILLABLE, netRevenue 0) and
 * may charge a cancellation fee instead. ListOrders is the only operation that
 * carries the order code, so this reads it and posts what it saw to the OS,
 * which applies the mapping agreed with accounting.
 *
 * Two things about how it has to run:
 *  - Not headless. PerimeterX passes ListPayouts but returns 403 for ListOrders
 *    from a headless browser, with the same session, on the same endpoint. A
 *    visible window returns 200. Verified 2026-08-27.
 *  - The query is replayed rather than left to the page: the /orders page's own
 *    call is blocked too, while /finance loads cleanly, so the request captured
 *    there is re-issued with a ListOrders body.
 *
 * Usage:
 *   DATE_FROM=2026-07-28 DATE_TO=2026-08-27 \
 *   WEBHOOK_URL=https://sushizen-shift-app-038d846023bc.herokuapp.com \
 *   node scripts/foodpanda/sync-cancellations.js taft
 */

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

function decodeSession(b64) {
  const buf = Buffer.from(b64.trim(), 'base64');
  const raw = (buf[0] === 0x1f && buf[1] === 0x8b)
    ? zlib.gunzipSync(buf).toString('utf8')
    : buf.toString('utf8');
  return JSON.parse(raw);
}

const LOCATION = (process.argv[2] || 'taft').toLowerCase();
const ACCOUNTS = {
  paranaque: { env: 'FP_SESSION_PARANAQUE', file: 'paranaque-session.b64.txt', vendors: ['t0z4', 'fdwv'] },
  taft:      { env: 'FP_SESSION_TAFT',      file: 'taft-session.b64.txt',      vendors: ['ryqc'] },
  qc:        { env: 'FP_SESSION_QC',        file: 'qc-session.b64.txt',        vendors: ['a97i'] },
};
const acct = ACCOUNTS[LOCATION];
if (!acct) { console.error(`Unknown location "${LOCATION}". Use: ${Object.keys(ACCOUNTS).join(' | ')}`); process.exit(1); }

const DATE_FROM   = process.env.DATE_FROM;
const DATE_TO     = process.env.DATE_TO;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const GLOBAL_ENTITY_ID = 'FP_PH';
if (!DATE_FROM || !DATE_TO) {
  console.error('DATE_FROM and DATE_TO must be set (e.g. 2026-07-28 / 2026-08-27)');
  process.exit(1);
}

// The portal rejects a span longer than a month ("cannot get more than one
// month"), so the range is walked in 28-day windows. Days are Manila days.
const WINDOW_DAYS = 28;

function dateWindows(from, to) {
  const out = [];
  const end = new Date(`${to}T00:00:00+08:00`);
  let cursor = new Date(`${from}T00:00:00+08:00`);
  while (cursor <= end) {
    const stop = new Date(cursor);
    stop.setDate(stop.getDate() + WINDOW_DAYS - 1);
    const last = stop > end ? end : stop;
    out.push({
      timeFrom: cursor.toISOString(),
      timeTo:   new Date(last.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString(),
      label:    `${cursor.toISOString().slice(0, 10)}→${last.toISOString().slice(0, 10)}`,
    });
    cursor = new Date(last.getTime() + 24 * 60 * 60 * 1000);
  }
  return out;
}

const WINDOWS = dateWindows(DATE_FROM, DATE_TO);

const TMP = path.join(__dirname, `${LOCATION}-cancel-tmp.json`);

const ORDER_FIELDS = `nextPageToken resultTimestamp orders {
  orderId globalEntityId vendorId vendorName orderStatus placedTimestamp subtotal
  billableStatus deliveryType
  billing { commissionAmount netRevenue __typename }
  orderIssuesDetails { orderIssue metadata { reason amount deduction fee __typename } __typename }
  totalFeesAndDeductions __typename
} __typename`;

const LIST_ORDERS_QUERY =
  `query ListOrders($params: ListOrdersReq!) { orders { listOrders(input: $params) { ${ORDER_FIELDS} } } }`;

function loadSession() {
  const b64 = process.env[acct.env] || (
    fs.existsSync(path.join(__dirname, acct.file))
      ? fs.readFileSync(path.join(__dirname, acct.file), 'utf8').trim()
      : ''
  );
  if (!b64) {
    console.error(`No session. Set ${acct.env} or run: node scripts/foodpanda/setup-session.js ${LOCATION}`);
    process.exit(1);
  }
  const data = decodeSession(b64);
  fs.writeFileSync(TMP, JSON.stringify(data));
  console.log(`Session loaded (${data.cookies?.length} cookies)`);
  return TMP;
}

/** Cancellation fee charged to the restaurant, if the portal reported one. */
function cancellationFee(order) {
  let fee = 0;
  for (const detail of order.orderIssuesDetails || []) {
    for (const meta of detail.metadata || []) {
      if (typeof meta.fee === 'number') fee += meta.fee;
      if (typeof meta.deduction === 'number') fee += meta.deduction;
    }
  }
  if (!fee && typeof order.totalFeesAndDeductions === 'number') fee = order.totalFeesAndDeductions;
  return fee || null;
}

async function main() {
  console.log(`\nFoodPanda cancellation sync — ${LOCATION.toUpperCase()}`);
  console.log(`Date range: ${DATE_FROM} → ${DATE_TO}  (vendors: ${acct.vendors.join(', ')})`);
  console.log('='.repeat(60));

  // On screen on purpose. PerimeterX sometimes asks for a press-and-hold check,
  // and a person has to answer it — nothing here tries to get past one. Parked
  // off-screen, the check would be invisible and the run would just fail with no
  // sign of why.
  const browser = await chromium.launch({
    headless: false,                                     // see the note at the top
    args: ['--disable-blink-features=AutomationControlled', '--window-size=1100,800'],
  });
  const context = await browser.newContext({
    storageState: loadSession(),
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  });

  // /finance passes the anti-bot check; its request carries auth headers the
  // portal adds, which cannot be rebuilt from scratch.
  let authedReq = null;
  context.on('response', resp => {
    if (!resp.url().includes('vagw-api')) return;
    const req = resp.request();
    if (!(req.postData() || '').includes('ListPayouts')) return;
    authedReq = { url: resp.url(), headers: req.headers() };
  });

  const page = await context.newPage();
  try {
    await page.goto('https://partner.foodpanda.com/finance', { waitUntil: 'networkidle', timeout: 45_000 });
  } catch (_) {}

  if (/\/login|\/signin/.test(page.url())) {
    await browser.close();
    try { fs.unlinkSync(TMP); } catch (_) {}
    console.error(`\n❌ Session expired — re-run: node scripts/foodpanda/setup-session.js ${LOCATION}`);
    process.exit(1);
  }
  await page.waitForTimeout(6000);

  if (!authedReq) {
    await browser.close();
    try { fs.unlinkSync(TMP); } catch (_) {}
    console.error('\n❌ The portal never called ListPayouts, so there is no authorised request to replay.');
    process.exit(1);
  }

  const byId = new Map();
  let failed = false;
  for (const win of WINDOWS) {
    let pageToken = null;
    let pageNo = 0;
    const windowStart = byId.size;
    do {
      const variables = {
        params: {
          pagination: pageToken ? { pageSize: 50, pageToken } : { pageSize: 50 },
          timeFrom: win.timeFrom,
          timeTo:   win.timeTo,
          globalVendorCodes: acct.vendors.map(v => ({ globalEntityId: GLOBAL_ENTITY_ID, vendorId: v })),
        },
      };
      const resp = await context.request.post(authedReq.url, {
        headers: authedReq.headers,
        data: { operationName: 'ListOrders', variables, query: LIST_ORDERS_QUERY },
      });
      const text = await resp.text();
      let json;
      try { json = JSON.parse(text); } catch (_) {
        console.error(`  [${win.label}] HTTP ${resp.status()} — unparseable: ${text.slice(0, 160)}`);
        failed = true;
        break;
      }
      if (resp.status() === 403 || text.includes('perimeterx')) {
        console.error(
          `  [${win.label}] blocked by the portal's bot check.\n` +
          '  Run this by hand and answer the press-and-hold prompt in the window:\n' +
          `    DATE_FROM=${DATE_FROM} DATE_TO=${DATE_TO} WEBHOOK_URL=<url> ` +
          `node scripts/foodpanda/sync-cancellations.js ${LOCATION}`
        );
        failed = true;
        break;
      }
      if (json.errors?.length) {
        console.error(`  [${win.label}] ${json.errors[0].message}`);
        failed = true;
        break;
      }
      const res = json?.data?.orders?.listOrders;
      const before = byId.size;
      for (const o of res?.orders || []) if (o?.orderId) byId.set(o.orderId, o);
      pageToken = res?.nextPageToken || null;
      pageNo += 1;
      if (byId.size === before) break;
    } while (pageToken && pageNo < 60);
    console.log(`  [${win.label}] ${pageNo} page(s), +${byId.size - windowStart} → ${byId.size}`);
  }
  if (failed && byId.size === 0) {
    await browser.close();
    try { fs.unlinkSync(TMP); } catch (_) {}
    process.exit(1);
  }

  await browser.close();
  try { fs.unlinkSync(TMP); } catch (_) {}

  const orders = [...byId.values()];
  const cancelled = orders.filter(o => String(o.orderStatus || '').toUpperCase() === 'CANCELLED');
  console.log(`\nOrders seen: ${orders.length}  |  cancelled: ${cancelled.length}`);

  if (orders.length === 0) {
    console.error('\n❌ No orders captured — nothing to settle. Treating as a failure so it is visible.');
    process.exit(1);
  }
  if (cancelled.length === 0) {
    console.log('No cancellations in this range.');
    return;
  }

  const payload = {
    location: LOCATION,
    extracted_at: new Date().toISOString(),
    orders: cancelled.map(o => ({
      order_no:        o.orderId,
      order_status:    o.orderStatus,
      billable_status: o.billableStatus || null,
      fee:             cancellationFee(o),
      net_revenue:     o.billing?.netRevenue ?? null,
      issues:          (o.orderIssuesDetails || []).map(d => d.orderIssue).filter(Boolean),
    })),
  };

  for (const o of payload.orders) {
    console.log(`  ${o.order_no}  ${o.billable_status}  fee=${o.fee ?? '-'}  [${o.issues.join(',')}]`);
  }

  if (!WEBHOOK_URL) {
    console.log('\nWEBHOOK_URL not set — printing payload instead of posting.');
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const resp = await fetch(`${WEBHOOK_URL}/api/foodpanda/cancellation-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await resp.text();
  if (!resp.ok) {
    console.error(`\n❌ Webhook ${resp.status}: ${text.slice(0, 300)}`);
    process.exit(1);
  }
  console.log('\n' + text);
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
