/**
 * Can SalesOverviewByTime give us the daily Foodpanda order counts, and how far
 * back does it go?
 *
 * The ordersSummary CSV export stopped on 2026-04-01 and Paranaque's Foodpanda
 * orders have had no source in the OS since — 116 to 195 a month, entered by
 * hand. The portal answers SalesOverviewByTime with order_count and revenue for
 * any date range, which would replace the export entirely if it reaches back.
 *
 * Read-only. It asks the portal for figures and prints them; nothing is written
 * anywhere.
 *
 *   node scripts/foodpanda/probe-sales-overview.js paranaque
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const LOCATION = process.argv[2] || 'paranaque';
const VENDORS = {
  paranaque: ['fdwv', 't0z4'],   // Paranaque has two storefronts
  taft:      ['ryqc'],
  qc:        ['a97i'],
};
if (!VENDORS[LOCATION]) { console.error('Use: paranaque | taft | qc'); process.exit(1); }

const SESSION_FILE = path.join(__dirname, `${LOCATION}-session.b64.txt`);
const TMP = path.join(__dirname, `.probe-${LOCATION}.json`);

function loadSession() {
  if (!fs.existsSync(SESSION_FILE)) {
    console.error(`No session. Run: node scripts/foodpanda/setup-session.js ${LOCATION}`);
    process.exit(1);
  }
  const buf = Buffer.from(fs.readFileSync(SESSION_FILE, 'utf8').trim(), 'base64');
  const raw = buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf).toString('utf8')
                                                 : buf.toString('utf8');
  fs.writeFileSync(TMP, raw);
  const d = JSON.parse(raw);
  console.log(`Session loaded (${d.cookies?.length} cookies)`);
  return TMP;
}

// Replaying the captured request is refused with 403 even from a real window --
// PerimeterX will not accept it a second time from outside the page. So instead
// the page issues its own request and the dates are rewritten on the way out.
// The portal's own headers and PX token go with it untouched.
function makeRewriter(state) {
  return async (route) => {
    const req = route.request();
    const pd = req.postData() || '';
    if (!pd.includes('SalesOverviewByTime') || !state.want) {
      return route.continue();
    }
    let body;
    try { body = JSON.parse(pd); } catch { return route.continue(); }
    const p = body?.variables?.params;
    if (!p) return route.continue();
    p.from = state.want.from;
    p.to = state.want.to;
    p.precision = state.want.precision;
    if (state.want.vendors) p.global_vendor_codes = state.want.vendors;
    return route.continue({ postData: JSON.stringify(body) });
  };
}

async function askFor(page, state, want) {
  state.want = want;
  state.result = null;
  // Reloading makes the dashboard fire the query again; the route handler
  // swaps the dates in as it leaves.
  try {
    await page.goto('https://partner.foodpanda.com/dashboard?_=' + Date.now(),
                    { waitUntil: 'networkidle', timeout: 30000 });
  } catch {}
  for (let i = 0; i < 20 && !state.result; i++) await page.waitForTimeout(500);
  return state.result || { status: 0, text: 'no response captured' };
}

function readCount(r) {
  if (r.status !== 200) return { error: `HTTP ${r.status}` };
  let j;
  try { j = JSON.parse(r.text); } catch { return { error: 'unparseable' }; }
  if (j.errors) return { error: j.errors.map(e => e.message).join('; ') };
  const s = j?.data?.salesOverview?.salesByTime;
  if (!s) return { error: 'no salesByTime in response' };
  return { orders: s.order_count, revenue: s.revenue, details: s.details || [] };
}

(async () => {
  const codes = VENDORS[LOCATION].map(v => `FP_PH;${v}`);
  console.log(`\n=== ${LOCATION.toUpperCase()} — vendors ${codes.join(', ')} ===\n`);

  // Headed on purpose. PerimeterX answers this endpoint with 403 from a
  // headless browser on the same session -- the same behaviour already recorded
  // for ListOrders. A real window gets 200. Do not move it off-screen: a
  // press-and-hold check can appear and has to be visible to be passed.
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: loadSession(),
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
             + '(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  });

  const state = { want: null, result: null };
  const page = await context.newPage();
  await page.route('**/vagw-api.ap.prd.portal.restaurant/query', makeRewriter(state));
  page.on('response', async resp => {
    const pd = resp.request().postData() || '';
    if (!pd.includes('SalesOverviewByTime')) return;
    try {
      state.result = { status: resp.status(), text: await resp.text(), sent: pd };
    } catch {}
  });
  console.log('Loading the dashboard so it issues the query itself...');
  try {
    await page.goto('https://partner.foodpanda.com/dashboard',
                    { waitUntil: 'networkidle', timeout: 30000 });
  } catch {}
  if (page.url().includes('/login')) {
    console.error(`\nSession expired — re-run: node scripts/foodpanda/setup-session.js ${LOCATION}`);
    await browser.close(); process.exit(1);
  }
  await page.waitForTimeout(4000);
  console.log('Dashboard up. Asking it for each period.\n');

  // 1. Does it answer at all, for a day we can check against the OS?
  console.log('--- how far back does it reach? ---');
  for (const [label, from, to] of [
    ['yesterday   ', '2026-08-31', '2026-08-31'],
    ['August      ', '2026-08-01', '2026-08-31'],
    ['July        ', '2026-07-01', '2026-07-31'],
    ['June        ', '2026-06-01', '2026-06-30'],
    ['May         ', '2026-05-01', '2026-05-31'],
    ['April       ', '2026-04-01', '2026-04-30'],
    ['March       ', '2026-03-01', '2026-03-31'],
    ['January     ', '2026-01-01', '2026-01-31'],
  ]) {
    const r = readCount(await askFor(page, state, { vendors: codes, from, to, precision: 'Day' }));
    if (r.error) console.log(`  ${label} ERROR: ${r.error}`);
    else console.log(`  ${label} orders=${String(r.orders).padEnd(6)} revenue=${String(r.revenue).padEnd(12)} daily rows=${r.details.length}`);
    await page.waitForTimeout(700);
  }

  // 2. Does Day precision actually break it down per day?
  console.log('\n--- June, day by day (first 8) ---');
  const jun = readCount(await askFor(page, state, { vendors: codes, from: '2026-06-01', to: '2026-06-30', precision: 'Day' }));
  if (jun.error) console.log('  ERROR:', jun.error);
  else {
    jun.details.slice(0, 8).forEach(d =>
      console.log(`  ${d.milestone}  orders=${String(d.order_count).padEnd(4)} revenue=${d.revenue}`));
    console.log(`  ... ${jun.details.length} days total, ${jun.orders} orders`);
    console.log(`\n  The OS has Paranaque Foodpanda = 155 for June (entered by hand).`);
  }

  // 3. Per vendor, so a two-storefront store can be split
  console.log('\n--- June per vendor code ---');
  for (const v of codes) {
    const r = readCount(await askFor(page, state, { vendors: [v], from: '2026-06-01', to: '2026-06-30', precision: 'Day' }));
    console.log(`  ${v}  ${r.error ? 'ERROR: ' + r.error : `orders=${r.orders} revenue=${r.revenue}`}`);
    await page.waitForTimeout(700);
  }

  await browser.close();
  try { fs.unlinkSync(TMP); } catch {}
})();
