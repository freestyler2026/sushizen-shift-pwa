#!/usr/bin/env node
/**
 * Careem Dubai — daily order counts per outlet, from the portal's Past Orders list.
 *
 * Staff used to read these off the portal and type them into Order Entry.
 * Checked for October 2026: 260 of 270 day x outlet cells identical to what
 * they typed and the rest within 1-3. They count cancelled orders too, so the
 * count here does as well (the analytics/v4 "orders" figure leaves them out
 * and differs from theirs on 43 cells).
 *
 *   GET /api/saturn-ext/v1/careem/1/company/<c>/brand/<b>/outlet/<o>/partner-orders-minimal
 *       ?limit=100&filter=past&sort=new&page=N
 *   → { orders: [{ id, status, created_at, merchant: { id }, price: { total } }], meta: { pagination } }
 *
 * - The list covers every outlet of the company whatever outlet is in the path.
 * - It needs the bearer token the page sends, so the page's own request is
 *   captured and replayed from inside the page with our paging.
 * - Newest first; paging stops once a page reaches back past the range.
 * - created_at is UTC; the day is the Dubai date (UTC+4).
 *
 * Only finished days are written: today's count is still growing.
 *
 * Usage:
 *   node scripts/careem/get-orders.js                         # last 7 days, dry run
 *   node scripts/careem/get-orders.js 2026-10-01 2026-10-27   # inclusive range
 *   WEBHOOK_URL=... CRON_SECRET=... CAREEM_SESSION=... node scripts/careem/get-orders.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const WEBHOOK_URL = (process.env.WEBHOOK_URL || '').trim();
const CRON_SECRET = (process.env.CRON_SECRET || '').trim();

// Careem merchant id → the branch and brand Order Entry files them under.
// Al Barsha South is Arjan and Al Jaffiliya is Al Hudaiba, as in get-payouts.js.
const MERCHANTS = {
  1067896: { branch: 'Al Barsha',    brand: 'Sushi Zen' },
  1061197: { branch: 'Al Hudaiba',   brand: 'Sushi Zen' },
  1058443: { branch: 'Arjan',        brand: 'Sushi Zen' },
  1054427: { branch: 'Business Bay', brand: 'Sushi Zen' },
  1054428: { branch: 'JLT',          brand: 'Sushi Zen' },
  1074763: { branch: 'Al Hudaiba',   brand: 'Ramen Zen' },
  1073594: { branch: 'Arjan',        brand: 'Ramen Zen' },
  1073590: { branch: 'Business Bay', brand: 'Ramen Zen' },
  1073596: { branch: 'JLT',          brand: 'Ramen Zen' },
  1076301: { branch: 'Al Barsha',    brand: 'All Veggie Sushi' },
};
// J Deli JLT / Al Jaffiliya: no orders since September and no column for them
// in Order Entry. Not counted; reported if they ever take one.
const NOT_COUNTED = { 1073595: 'J Deli JLT', 1074759: 'J Deli Al Jaffiliya' };

function ymd(d) { return d.toISOString().slice(0, 10); }
function addDays(s, n) { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return ymd(d); }
const TODAY = ymd(new Date(Date.now() + 4 * 3600_000));
const YESTERDAY = addDays(TODAY, -1);
const FROM = process.argv[2] || addDays(TODAY, -7);
let TO = process.argv[3] || YESTERDAY;
if (TO > YESTERDAY) TO = YESTERDAY;
if (!/^\d{4}-\d{2}-\d{2}$/.test(FROM) || !/^\d{4}-\d{2}-\d{2}$/.test(TO) || FROM > TO) {
  console.error(`Bad range ${FROM}..${TO}`);
  process.exit(1);
}
// Dubai midnight at the start of FROM, in UTC.
const FROM_UTC = `${addDays(FROM, -1)}T20:00:00Z`;

function dubaiDay(createdAt) {
  const t = Date.parse(createdAt);
  return Number.isNaN(t) ? null : ymd(new Date(t + 4 * 3600_000));
}

function loadSession() {
  const raw = (process.env.CAREEM_SESSION || '').trim()
    || (() => {
      const f = process.env.SESSION_PATH || path.join(__dirname, 'careem-session.b64.txt');
      return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '';
    })();
  if (!raw) {
    console.error('No session. Set CAREEM_SESSION or run: node scripts/careem/setup-session.js');
    process.exit(1);
  }
  const buf = Buffer.from(raw, 'base64');
  const json = (buf[0] === 0x1f && buf[1] === 0x8b) ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
  return JSON.parse(json);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: loadSession() });
  const page = await context.newPage();
  let captured = null;
  context.on('request', (r) => {
    if (!captured && r.url().includes('/partner-orders-minimal')) captured = { url: r.url(), headers: r.headers() };
  });

  // Past Orders only asks for its list when reached from inside the app.
  await page.goto('https://partners.careem.com/saturn-ext/merchant/home', { waitUntil: 'networkidle', timeout: 45_000 }).catch(() => {});
  if (/login|auth|identity\.careem\.com/.test(page.url())) {
    console.error('SESSION_EXPIRED — run: node scripts/careem/setup-session.js');
    await browser.close();
    process.exit(1);
  }
  await page.waitForTimeout(3000);
  await page.goto('https://partners.careem.com/saturn-ext/merchant/past-orders', { waitUntil: 'networkidle', timeout: 45_000 }).catch(() => {});
  for (let i = 0; i < 40 && !captured; i++) await page.waitForTimeout(500);
  if (!captured) {
    console.error('Past Orders did not request its list — session expired or the portal changed');
    await browser.close();
    process.exit(1);
  }
  const headers = Object.fromEntries(Object.entries(captured.headers)
    .filter(([k]) => /^(authorization|accept|time-zone|uuid|application|meta|lat|lng)$/i.test(k)));
  const base = new URL(captured.url);

  const orders = new Map();
  let complete = false;
  let oldest = null;
  for (let p = 1; p <= 400; p++) {
    base.searchParams.set('limit', '100');
    base.searchParams.set('filter', 'past');
    base.searchParams.set('sort', 'new');
    base.searchParams.set('page', String(p));
    const out = await page.evaluate(async ([u, h]) => {
      const r = await fetch(u, { headers: h, credentials: 'include' });
      return { status: r.status, text: await r.text() };
    }, [base.pathname + base.search, headers]);
    if (out.status !== 200) {
      console.error(`partner-orders-minimal page ${p}: HTTP ${out.status} ${out.text.slice(0, 160)}`);
      break;
    }
    const list = (JSON.parse(out.text).orders) || [];
    for (const o of list) {
      orders.set(o.id, o);
      if (o.created_at && (!oldest || o.created_at < oldest)) oldest = o.created_at;
    }
    // Done only once the list reaches back past the range. An empty page before
    // that is the list running out (or answering nothing), not the range
    // being covered, and writing then would zero the days it never reached.
    if (oldest && oldest < FROM_UTC) { complete = true; break; }
    if (!list.length) break;
    await page.waitForTimeout(250);
  }
  await browser.close();
  // A run that stopped half way must not write: the missing pages would read
  // as days with fewer orders.
  if (!complete) {
    console.error(`Past Orders did not reach back to ${FROM} (oldest read: ${oldest || 'none'}). Nothing written.`);
    process.exit(1);
  }

  const cells = new Map();
  for (let d = FROM; d <= TO; d = addDays(d, 1)) {
    for (const m of Object.values(MERCHANTS)) {
      cells.set(`${d}|${m.brand}|${m.branch}`, { order_date: d, brand: m.brand, branch: m.branch, order_count: 0, revenue_aed: 0 });
    }
  }
  const unknown = {};
  for (const o of orders.values()) {
    const d = dubaiDay(o.created_at);
    if (!d || d < FROM || d > TO) continue;
    const mid = o.merchant && o.merchant.id;
    const m = MERCHANTS[mid];
    if (!m) { const k = NOT_COUNTED[mid] || `merchant ${mid}`; unknown[k] = (unknown[k] || 0) + 1; continue; }
    const c = cells.get(`${d}|${m.brand}|${m.branch}`);
    c.order_count += 1;
    if (o.status !== 'cancelled') c.revenue_aed += Number((o.price && o.price.total) || 0);
  }
  const rows = [...cells.values()].map((r) => ({ ...r, revenue_aed: Math.round(r.revenue_aed * 100) / 100 }));
  const total = rows.reduce((s, r) => s + r.order_count, 0);
  console.log(`careem ${FROM}..${TO}: ${orders.size} orders read, ${total} counted`);
  if (Object.keys(unknown).length) console.error('⚠ orders not counted:', JSON.stringify(unknown));

  if (!WEBHOOK_URL) {
    for (const r of rows.filter((x) => x.order_count)) console.log(`  ${r.order_date} ${r.brand.padEnd(17)} ${r.branch.padEnd(13)} ${r.order_count}`);
    console.log('(dry run — no WEBHOOK_URL, nothing written)');
    return;
  }
  if (!CRON_SECRET) { console.error('CRON_SECRET is required to write'); process.exit(1); }
  const res = await fetch(`${WEBHOOK_URL}/api/aggregator/order-counts/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Cron-Secret': CRON_SECRET },
    body: JSON.stringify({ aggregator: 'careem', rows }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) { console.error(`ingest failed ${res.status}: ${text.slice(0, 300)}`); process.exit(1); }
  const outJ = JSON.parse(text);
  console.log(`  written ${outJ.written}, rejected ${(outJ.rejected || []).length}`);
  if ((outJ.rejected || []).length) process.exit(1);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
