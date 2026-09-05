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

// The five Dubai outlets, as the portal itself sends them.
const SHOP_IDS = ['1644178222', '1644171212', '1644198211', '1644191210', '1644184196'];

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
    const total = (j.data || {}).totalCount || 0;
    if (arr.length >= total || list.length === 0) break;
  }
  await browser.close();

  if (arr.length === 0) {
    console.error('No orders returned for the window');
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
  if (webhook && rows.length) {
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

  process.stdout.write(JSON.stringify(rows, null, 2));
})();
