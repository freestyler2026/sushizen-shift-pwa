/**
 * FoodPanda PH — per-order ledger into aggregator_orders.
 *
 * Why this exists: the Daily Check asks a person to confirm that each
 * aggregator is switched on, and a person got it wrong on 2026-09-03 (PAR
 * reported GrabFood off at Lunch Open while 58 orders came through that day,
 * 12 of them between 11:00 and 13:00). Orders answer the same question without
 * asking anybody. Grab was already imported; Manila's other platform was not,
 * so two thirds of the question could not be answered from data.
 *
 * ⚠️ PerimeterX blocks the first ListOrders every time -- the page's own call
 * is refused with a 403 whose body is a PX challenge, not a permissions error.
 * It passes on the second attempt, once the page has taken a PX cookie. So the
 * portal's own request is captured and re-issued with its own headers (the
 * pattern get-payouts.js already uses), and the first 403 is expected rather
 * than an error to report.
 *
 * ⚠️ One login can cover more than one vendor id. Paranaque's covers `fdwv`
 * and `t0z4`, and only `t0z4` has orders. The store is therefore taken from
 * the vendor id ON EACH ROW and never from the login name -- Grab's session
 * mix-up of 2026-09-05 (Paranaque's account saved as QC) came from trusting
 * the argument instead of the data. An unknown vendor id stops the run.
 *
 * Usage:
 *   node scripts/foodpanda/get-orders.js paranaque 2026-09-01 2026-09-10
 *   WEBHOOK_URL=https://… node scripts/foodpanda/get-orders.js taft
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const ACCOUNTS = {
  paranaque: { env: 'FP_SESSION_PARANAQUE', file: 'paranaque-session.b64.txt' },
  taft:      { env: 'FP_SESSION_TAFT',      file: 'taft-session.b64.txt' },
  qc:        { env: 'FP_SESSION_QC',        file: 'qc-session.b64.txt' },
};

// Read off the data 2026-09-11, with the portal's own vendorName beside each.
// `null` means "we know what this is and it is not ours": fdwv is
// "Ramen Zen - Paranaque", a different brand on the same login. Skipping it by
// name rather than letting it fall through to the unknown-vendor stop, which
// would break the import the first day Ramen Zen takes an order.
const FP_VENDOR = {
  t0z4: 'PAR',    // Sushi Zen - Parañaque
  ryqc: 'TAFT',   // Sushi Zen - Taft
  a97i: 'CUB',    // Sushi Zen - Cubao
  fdwv: null,     // Ramen Zen - Paranaque — different brand, not this ledger
};

const LOC = process.argv[2] || 'paranaque';
const acct = ACCOUNTS[LOC];
if (!acct) { console.error(`Unknown location "${LOC}"`); process.exit(1); }

function ymd(d) { return d.toISOString().slice(0, 10); }
const TO   = process.argv[4] || ymd(new Date());
const FROM = process.argv[3] || ymd(new Date(Date.now() - 2 * 86400000));
const WEBHOOK = (process.env.WEBHOOK_URL || '').trim();

function decodeSession(b64) {
  const b = Buffer.from(b64.trim(), 'base64');
  return JSON.parse(b[0] === 0x1f && b[1] === 0x8b ? zlib.gunzipSync(b).toString('utf8') : b.toString('utf8'));
}
function loadSession() {
  const tmp = path.join(__dirname, `${LOC}-orders-tmp.json`);
  const b64 = process.env[acct.env] || (fs.existsSync(path.join(__dirname, acct.file))
    ? fs.readFileSync(path.join(__dirname, acct.file), 'utf8') : '');
  if (!b64) { console.error(`No session: set ${acct.env} or run setup-session.js ${LOC}`); process.exit(1); }
  fs.writeFileSync(tmp, JSON.stringify(decodeSession(b64)));
  return tmp;
}

/** Manila local date of a UTC instant. The store's day is what the report is
 *  keyed on; using the UTC date moves every evening order to the next day. */
function manilaDate(iso) {
  return new Date(new Date(iso).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

async function postSessionExpired() {
  if (!WEBHOOK) return;
  await fetch(`${WEBHOOK}/api/aggregator/orders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store: 'SESSION_EXPIRED', platform: 'foodpanda', orders: [] }),
  }).catch(() => {});
}

(async () => {
  const sessionPath = loadSession();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: sessionPath,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  });

  let req = null;
  context.on('response', r => {
    const post = r.request().postData() || '';
    if (post.includes('ListOrders')) req = { url: r.url(), headers: r.request().headers(), postData: post };
  });

  const page = await context.newPage();
  await page.goto(`https://partner.foodpanda.com/orders?from=${FROM}&to=${TO}`,
    { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
  if (/\/login|\/signin/.test(page.url())) {
    console.error(`\n❌ SESSION_EXPIRED — node scripts/foodpanda/setup-session.js ${LOC}`);
    await postSessionExpired(); await browser.close(); process.exit(1);
  }
  await page.waitForTimeout(6000);
  if (!req) {
    console.error('\n❌ The portal never called ListOrders. Layout change, or the page did not load.');
    await browser.close(); process.exit(1);
  }

  // The window is asked for in UTC but the day we want is Manila's, so it is
  // widened by a day on each side and the rows are filtered by Manila date.
  const body = JSON.parse(req.postData);
  const wide = (d, days) => ymd(new Date(new Date(d + 'T00:00:00Z').getTime() + days * 86400000));
  body.variables.params.timeFrom = `${wide(FROM, -1)}T00:00:00.000Z`;
  body.variables.params.timeTo   = `${wide(TO, 1)}T23:59:59.999Z`;
  body.variables.params.pagination = { pageSize: 100 };

  const rows = [];
  // ⚠️ Waiting does not clear the PerimeterX refusal -- RELOADING does. The
  // first capture run got a 200 only on the second page load, so the retry is
  // a fresh navigation, not a sleep. Once one call passes, the rest of the
  // pagination goes through on the same headers.
  async function call(payload) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const resp = await context.request.post(req.url, { headers: req.headers, data: payload }).catch(() => null);
      if (resp && resp.ok()) return resp;
      const code = resp ? resp.status() : 'no response';
      if (attempt === 3) { console.error(`  gave up after 3 attempts (last: HTTP ${code})`); return null; }
      console.log(`  HTTP ${code} — reloading the page and retrying (${attempt}/2)`);
      await page.goto(`https://partner.foodpanda.com/orders?from=${FROM}&to=${TO}`,
        { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(5000);
    }
    return null;
  }

  for (let page_i = 0; page_i < 60; page_i++) {
    const resp = await call(body);
    if (!resp) break;
    let j; try { j = await resp.json(); } catch { break; }
    const lo = j?.data?.orders?.listOrders;
    const got = lo?.orders || [];
    rows.push(...got);
    console.log(`  page ${page_i + 1}: +${got.length} → ${rows.length}`);
    const next = lo?.nextPageToken || '';
    if (!next || got.length === 0) break;
    body.variables.params.pagination = { pageSize: 100, pageToken: next };
  }
  await browser.close();
  try { fs.unlinkSync(sessionPath); } catch (_) {}

  if (!rows.length) {
    // Exiting 0 on an empty capture is how a stopped import reports success
    // for days (lesson 47). An empty result is a failed run.
    console.error('\n❌ No orders captured.');
    process.exit(1);
  }

  const unknown = new Map();
  let skippedOther = 0;
  const out = [];
  for (const o of rows) {
    if (FP_VENDOR[o.vendorId] === null) { skippedOther++; continue; }
    const store = FP_VENDOR[o.vendorId];
    if (!store) { unknown.set(o.vendorId, o.vendorName || ''); continue; }
    const placed = o.placedTimestamp;
    if (!placed) continue;
    const wd = manilaDate(placed);
    if (wd < FROM || wd > TO) continue;
    out.push({
      store, work_date: wd,
      order_no: String(o.orderId || ''),
      long_order_id: String(o.orderId || ''),
      created_at_utc: placed,
      status: String(o.orderStatus || ''),
      amount: o.subtotal ?? null,
      platform: 'foodpanda',
    });
  }
  if (unknown.size) {
    // Never guessed: a wrong vendor id puts one store's orders under another,
    // and nothing downstream can tell (lesson 86).
    console.error(`\n❌ Unknown vendor id(s): ${[...unknown].map(([k, v]) => `${k} (${v})`).join(', ')}`);
    console.error('   Add them to FP_VENDOR after checking the name, then re-run.');
    process.exit(1);
  }

  if (skippedOther) console.log(`  (skipped ${skippedOther} order(s) belonging to another brand on this login)`);
  const byStore = out.reduce((a, r) => (a[r.store] = (a[r.store] || 0) + 1, a), {});
  console.log(`\n${LOC}: ${out.length} orders in ${FROM}..${TO} —`,
    Object.entries(byStore).map(([s, n]) => `${s} ${n}`).join(', '));

  if (!WEBHOOK) { process.stdout.write(JSON.stringify(out.slice(0, 3), null, 2) + '\n'); return; }
  let written = 0;
  for (let i = 0; i < out.length; i += 200) {
    const chunk = out.slice(i, i + 200);
    const r = await fetch(`${WEBHOOK}/api/aggregator/orders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store: chunk[0].store, platform: 'foodpanda', orders: chunk }),
    });
    if (!r.ok) { console.error(`  webhook ${r.status}: ${(await r.text()).slice(0, 200)}`); process.exit(1); }
    written += (await r.json()).written || 0;
  }
  console.log(`✓ written: ${written}`);
})();
