#!/usr/bin/env node
/**
 * Keeta (Dubai) — per-order history extractor for Prep Time.
 *
 * Why this exists
 * ---------------
 * Dubai's Prep Time was measured from photographed receipts, and its largest
 * bucket by far was 2,270 records read as "grabfood" -- a platform that does not
 * operate in the UAE. None of it was real.
 *
 * Keeta is the one Dubai platform whose portal exposes the timings today:
 * Careem has the metric but answers 403 on this account, Talabat puts its order
 * list behind a press-and-hold human check, and Noon returns orders with only
 * placedAt.
 *
 * The endpoint is what Orders -> Order history calls:
 *   POST merchant.mykeeta.com/api/order/history/getOrders
 *     confirmedStatusTime   accepted
 *     readiedStatusTime     ready
 *   prep = readiedStatusTime - confirmedStatusTime
 *
 * Same definition as Grab's readyAt - acceptedAt, and unlike Grab it is already
 * in the list, so no second request per order. Measured 30/30 orders, median 14
 * minutes.
 *
 * A browser is required here, unlike the Grab extractor: the portal renders in
 * an iframe and the request carries anti-bot headers the page computes, so a
 * plain fetch with the cookies is refused. Navigation has to be done by clicking.
 *
 * Usage:
 *   node scripts/keeta/get-orders.js 2026-09-01 2026-09-05
 *   node scripts/keeta/get-orders.js                 # yesterday to today
 *   WEBHOOK_URL=https://... node scripts/keeta/get-orders.js
 *
 * Without WEBHOOK_URL nothing is written anywhere.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SESSION = path.join(__dirname, 'keeta-session.json');

// Keeta gives each brand its own login, so the session decides the brand.
// KEETA_BRAND=ramen_zen runs with the Ramen ZEN session (KEETA_RZ_SESSION).
const KEETA_BRAND = (process.env.KEETA_BRAND || 'sushi_zen').trim().toLowerCase();
const BRANDS = {
  // The five Dubai outlets, as the portal itself sends them.
  sushi_zen: {
    name: 'Sushi Zen',
    shops: ['1644178222', '1644171212', '1644198211', '1644191210', '1644184196'],
    branches: ['AB', 'AM', 'ARJ', 'BB', 'JLT'],
    // Only Sushi ZEN feeds the Prep Time ledger: that table has no brand column.
    ledger: true,
  },
  // Ids from get-payouts.js. Order Entry has no Ramen ZEN Al Barsha column;
  // an order there is still counted, just not pre-filled as a zero.
  ramen_zen: {
    name: 'Ramen Zen',
    shops: ['1644200182', '1644320430', '1644173192', '1644193201', '1644179577'],
    branches: ['AM', 'ARJ', 'BB', 'JLT'],
    ledger: false,
  },
};
const BRAND = BRANDS[KEETA_BRAND];
if (!BRAND) {
  console.error(`KEETA_BRAND must be one of ${Object.keys(BRANDS).join(', ')}`);
  process.exit(1);
}
const SHOP_IDS = BRAND.shops;
// Branch code → the branch name Order Entry uses.
const BRANCH_NAME = { AB: 'Al Barsha', AM: 'Al Hudaiba', ARJ: 'Arjan', BB: 'Business Bay', JLT: 'JLT' };

function ymd(d) { return d.toISOString().slice(0, 10); }
const yesterday = ymd(new Date(Date.now() - 86400000));
const FROM = process.argv[2] || yesterday;
const TO = process.argv[3] || ymd(new Date());

// 店舗は merchantOrder.shopCode に入る（"Arjan" など）。shopName はブランド名
// （"Sushi ZEN"）で全店共通なので使えない。
// 知らない店舗名は落とさず名前のまま入れる。黙って捨てると、新店舗が開いたときに
// 件数だけ減って原因が分からない。
const STORE_BY_NAME = [
  [/business\s*bay/i, 'BB'],
  [/jlt|jumeirah\s*lake/i, 'JLT'],
  [/barsha/i, 'AB'],
  [/mina|al\s*mina/i, 'AM'],
  [/arjan/i, 'ARJ'],
  [/jaffiliya|jafiliya/i, 'ALJ'],
  [/quoz|central\s*kitchen/i, 'CK'],
];

function addDays(s, n) { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return ymd(d); }

/**
 * Daily order counts per outlet for Order Entry, every order the portal lists
 * (staff count cancelled ones too; identical to their October figures).
 * Only finished Dubai days; today's count is still growing.
 */
async function postCounts(webhook, rows) {
  const today = ymd(new Date(Date.now() + 4 * 3600_000));
  const last = TO < today ? TO : addDays(today, -1);
  if (FROM > last) return;
  const cells = new Map();
  for (let d = FROM; d <= last; d = addDays(d, 1)) {
    for (const b of BRAND.branches) {
      cells.set(`${d}|${b}`, { order_date: d, brand: BRAND.name, branch: BRANCH_NAME[b], order_count: 0, revenue_aed: 0 });
    }
  }
  const skipped = {};
  // The session decides the brand. An order from a shop that is not this
  // brand's means the wrong session was given; writing it would book one
  // brand's orders under the other.
  const foreign = rows.filter((r) => r.shop_id && !SHOP_IDS.includes(r.shop_id));
  if (foreign.length) {
    console.error(`  counts not written: ${foreign.length} orders from shops outside ${BRAND.name} `
      + `(${[...new Set(foreign.map((r) => r.shop_id))].join(', ')})`);
    process.exit(1);
  }
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.long_order_id)) continue;
    seen.add(r.long_order_id);
    if (r.work_date < FROM || r.work_date > last) continue;
    if (!BRANCH_NAME[r.store]) { skipped[r.store] = (skipped[r.store] || 0) + 1; continue; }
    const k = `${r.work_date}|${r.store}`;
    if (!cells.has(k)) cells.set(k, { order_date: r.work_date, brand: BRAND.name, branch: BRANCH_NAME[r.store], order_count: 0, revenue_aed: 0 });
    cells.get(k).order_count += 1;
  }
  const out = [...cells.values()];
  console.error(`  counts ${BRAND.name} ${FROM}..${last}: ${out.reduce((s, c) => s + c.order_count, 0)} orders`);
  if (Object.keys(skipped).length) console.error('  ⚠ outlets not counted:', JSON.stringify(skipped));
  const secret = (process.env.CRON_SECRET || '').trim();
  if (!webhook || !secret) {
    console.error('  (counts not written — needs WEBHOOK_URL and CRON_SECRET)');
    return;
  }
  const res = await fetch(`${webhook}/api/aggregator/order-counts/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Cron-Secret': secret },
    body: JSON.stringify({ aggregator: 'keeta', rows: out }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) { console.error(`  counts ingest failed ${res.status}: ${text.slice(0, 200)}`); process.exit(1); }
  const j = JSON.parse(text);
  console.error(`  counts written ${j.written}, rejected ${(j.rejected || []).length}`);
  if ((j.rejected || []).length) process.exit(1);
}

function storeCode(name) {
  for (const [re, code] of STORE_BY_NAME) if (re.test(name || '')) return code;
  return (name || 'UNKNOWN').slice(0, 20);
}

function loadSession() {
  const b64 = (process.env.KEETA_SESSION_STATE || '').trim();
  if (b64) {
    const buf = Buffer.from(b64, 'base64');
    const raw = (buf[0] === 0x1f && buf[1] === 0x8b)
      ? zlib.gunzipSync(buf).toString('utf8')
      : buf.toString('utf8');
    return JSON.parse(raw);
  }
  if (!fs.existsSync(SESSION)) {
    console.error('No session: set KEETA_SESSION_STATE or run '
      + 'node scripts/keeta/setup-session.js');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(SESSION, 'utf8'));
}

/** Timestamps come back in seconds on some fields and milliseconds on others. */
function toIso(v) {
  if (!v || v <= 0) return null;
  const ms = String(v).length <= 10 ? v * 1000 : v;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** The order objects are nested; pull a field by name from anywhere inside. */
function pick(obj, name) {
  let hit = null;
  (function walk(o) {
    if (hit !== null || !o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (k === name && v !== null && v !== undefined && v !== '') { hit = v; return; }
      if (v && typeof v === 'object') walk(v);
    }
  })(obj);
  return hit;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: loadSession() });
  const page = await ctx.newPage();

  // The portal computes an anti-bot signature per request, so the parameters
  // cannot be chosen from outside. Let the page make its own call, keep the
  // headers it used, then replay them from inside the page with the date range
  // and page size we actually want.
  let hdrs = null;
  page.on('request', (r) => {
    if (/order\/history\/getOrders/.test(r.url())) hdrs = r.headers();
  });

  await page.goto('https://merchant.mykeeta.com', {
    waitUntil: 'domcontentloaded', timeout: 60000,
  }).catch(() => {});
  await page.waitForTimeout(11000);

  // Navigate by clicking: the portal is an iframe and a direct URL renders an
  // empty shell.
  for (const label of ['Orders', 'Order history']) {
    for (const f of page.frames()) {
      const el = await f.$(`text="${label}"`).catch(() => null);
      if (el) { await el.click().catch(() => {}); break; }
    }
    await page.waitForTimeout(6000);
  }
  await page.waitForTimeout(9000);

  if (!hdrs) {
    // Landing on the login page, or the nav not appearing, both end here. Exit
    // non-zero: a run that imports nothing must not report success.
    console.error('SESSION_EXPIRED or portal changed — run: '
      + 'node scripts/keeta/setup-session.js');
    await browser.close();
    process.exit(1);
  }

  const frame = page.frames().find((f) => /mach/.test(f.url())) || page.mainFrame();
  // content-length belongs to the page's own body, not ours -- carrying it over
  // makes the server read a truncated request and answer with nothing.
  const headers = Object.fromEntries(Object.entries(hdrs)
    .filter(([k]) => !k.startsWith(':') && k.toLowerCase() !== 'content-length'));

  const from = Date.parse(`${FROM}T00:00:00+04:00`);
  const to = Date.parse(`${TO}T23:59:59.999+04:00`);
  const arr = [];
  let expected = null;   // totalCount as the portal reports it
  let complete = false;
  for (let pageNum = 1; pageNum <= 200; pageNum++) {
    const out = await frame.evaluate(async ([h, body]) => {
      const r = await fetch(
        '/api/order/history/getOrders?yodaReady=h5&csecplatform=4&csecversion=3.5.1',
        { method: 'POST', credentials: 'include', headers: h, body });
      return { status: r.status, text: await r.text() };
    }, [headers, JSON.stringify({
      startTime: String(from), endTime: String(to),
            // 30 is what the portal itself sends. 100 is rejected outright with
      // 请求参数错误 (invalid parameter), so paginate rather than widen.
      orderType: 0, pageNum, pageSize: 30, seqNoStr: '', shopIds: SHOP_IDS,
    })]).catch((e) => ({ status: 0, text: String(e) }));

    if (out.status !== 200) {
      console.error(`getOrders failed on page ${pageNum}: ${out.text.slice(0, 150)}`);
      break;
    }
    let j;
    try { j = JSON.parse(out.text); } catch {
      console.error('Unparseable response from getOrders');
      await browser.close();
      process.exit(1);
    }
    // A 200 carrying a non-zero top-level code is the portal refusing, not an
    // empty day. Check the parsed value: order payloads contain nested "code"
    // fields of their own, so a regex over the raw text reports success as a
    // failure.
    if (j.code !== 0) {
      console.error(`getOrders refused: ${String(j.message || '').slice(0, 120)} `
        + `(code ${j.code})`);
      await browser.close();
      process.exit(1);
    }
    const list = ((j.data || {}).list) || [];
    arr.push(...list);
    if (expected === null) expected = (j.data || {}).totalCount || 0;
    if (arr.length >= expected || list.length === 0) { complete = true; break; }
  }
  // The ledger upserts per order and tolerates an early empty page; the counts
  // overwrite whole days and are then locked, so they need every order the
  // portal said it had.
  const fullRead = expected !== null && arr.length >= expected;
  await browser.close();

  if (arr.length === 0) {
    console.error('No orders returned for the window');
    process.exit(1);
  }

  // A run that fetched only part of the window must not look like a good one.
  // Breaking out of the loop on a failed page and importing what was collected
  // would leave the table short by however many pages were missed, with a green
  // tick over it -- the failure this pipeline was built to stop.
  if (!complete) {
    console.error(`Incomplete: fetched ${arr.length} of ${expected} orders. `
      + 'Nothing imported.');
    process.exit(1);
  }

  const rows = arr.map((o) => {
    const m = o.merchantOrder || {};
    const bo = o.baseOrder || {};
    const accepted = toIso(m.confirmedStatusTime);
    const ready = toIso(m.readiedStatusTime);
    const created = toIso(m.ctime || bo.ctime) || accepted;
    return {
      platform: 'keeta',
      // shopCode is the branch ("Arjan"); shopName is the brand and is the same
      // for every outlet.
      store: storeCode(m.shopCode || ''),
      // Local (Dubai) date. Cutting on UTC drops late-evening orders into the
      // previous day.
      work_date: created
        ? new Date(new Date(created).getTime() + 4 * 3600_000).toISOString().slice(0, 10)
        : null,
      order_no: String(m.seqNoStr || m.seqNo || ''),
      shop_id: String(m.shopId || m.poiId || pick(o, 'shopId') || ''),
      long_order_id: String(m.orderViewIdStr || m.orderViewId || ''),
      created_at_utc: created,
      updated_at_utc: toIso(m.utime),
      // 40 is the finished state; anything else is still moving. The summary
      // counts DELIVERED, so only settled orders reach the median.
      status: Number(m.status) === 40 ? 'DELIVERED' : `KEETA_${m.status}`,
      amount: null,
      accepted_at_utc: accepted,
      ready_at_utc: ready,
      // Null, never 0, when either end is missing: a zero reads as an order
      // prepared instantly and drags the median down.
      prep_minutes: (accepted && ready)
        ? Math.round((new Date(ready) - new Date(accepted)) / 60000)
        : null,
    };
  }).filter((r) => r.long_order_id && r.work_date);

  const measured = rows.filter((r) => r.prep_minutes !== null).length;
  console.error(`keeta ${FROM}..${TO}: ${rows.length} orders, ${measured} with a measured prep time`);

  const webhook = (process.env.WEBHOOK_URL || '').trim();
  // Ledger first: a failed count write must not cost the night's Prep Time.
  // KEETA_LEDGER=0 writes the counts only, for a backfill that should not
  // also add months of orders to the Prep Time ledger.
  const ledgerOn = BRAND.ledger && process.env.KEETA_LEDGER !== '0';
  if (webhook && rows.length && ledgerOn) {
    let written = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const res = await fetch(`${webhook}/api/aggregator/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store: 'keeta', platform: 'keeta', orders: chunk }),
        signal: AbortSignal.timeout(60_000),
      });
      const text = await res.text();
      if (!res.ok) {
        console.error(`POST failed ${res.status}: ${text.slice(0, 200)}`);
        process.exit(1);
      }
      try { written += JSON.parse(text).written || 0; } catch { /* keep going */ }
    }
    console.error(`  posted: ${written} rows written of ${rows.length} sent`);
  } else if (!webhook) {
    console.error('  (dry run — no WEBHOOK_URL, nothing written)');
  }
  if (!fullRead) {
    console.error(`  counts not written: read ${arr.length} of ${expected} orders`);
    process.exit(1);
  }
  await postCounts(webhook, rows);

  process.stdout.write(JSON.stringify(rows, null, 2));
})();
