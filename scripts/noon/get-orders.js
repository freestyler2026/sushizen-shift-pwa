#!/usr/bin/env node
/**
 * Noon Food Dubai — daily order counts per outlet, from the portal's order list.
 *
 * Staff used to read these off the portal and type them into Order Entry.
 * Checked for October 2026: 270 of 270 day x outlet cells identical to what
 * they typed, cancelled orders included, so the count here includes them too.
 *
 *   POST restaurant.noon.partners/_food-restaurant/order/search
 *     {"startDate": "2026-10-01", "endDate": "2026-10-28", "page": 2}
 *   → { pages, orders: { "2026-10-27": [ {orderNr, status, outletCode, orderTotal, ...} ] } }
 *
 * - endDate is exclusive: {"startDate": d, "endDate": d} returns nothing.
 * - One call covers every brand and outlet; the brand code only sets the Referer.
 * - 1,000 orders a page, newest first, and a day can straddle two pages, so
 *   orders are de-duplicated on orderNr.
 * - The day keys are Dubai dates (an order at 23:42 sits under its own day).
 *
 * Only finished days are written: today's count is still growing.
 *
 * Usage:
 *   node scripts/noon/get-orders.js                         # last 7 days, dry run
 *   node scripts/noon/get-orders.js 2026-10-01 2026-10-27   # inclusive range
 *   WEBHOOK_URL=... CRON_SECRET=... node scripts/noon/get-orders.js
 *
 * With WEBHOOK_URL the portal is reached through the Heroku proxy (GitHub
 * Actions IPs are blocked by Noon's WAF) and the counts are posted there.
 * Without it, the portal is called directly and nothing is written.
 */
const fs = require('fs');
const path = require('path');

const WEBHOOK_URL = (process.env.WEBHOOK_URL || '').trim();
const CRON_SECRET = (process.env.CRON_SECRET || '').trim();
const BRAND_CODE = 'R5346332756132073257580964A';   // Sushi ZEN; any brand works
const BASE = 'https://restaurant.noon.partners/_food-restaurant';

// outletCode → the branch and brand Order Entry files them under. Ramen ZEN's
// Motor City outlet is Arjan's kitchen, and staff have always entered it there.
const OUTLETS = {
  SSHZNL2NOT: { branch: 'Al Barsha',    brand: 'Sushi Zen' },
  SSHZNGO0TP: { branch: 'Al Hudaiba',   brand: 'Sushi Zen' },
  SSHZNMVSRC: { branch: 'Arjan',        brand: 'Sushi Zen' },
  SSHZNGOLPW: { branch: 'Business Bay', brand: 'Sushi Zen' },
  SSHZNA6VXE: { branch: 'JLT',          brand: 'Sushi Zen' },
  RMNZNLZZWV: { branch: 'Al Hudaiba',   brand: 'Ramen Zen' },
  SSHZNJVJ3U: { branch: 'Arjan',        brand: 'Ramen Zen' },
  RMNZNBUSWC: { branch: 'Business Bay', brand: 'Ramen Zen' },
  SSHZNJ1Y8S: { branch: 'JLT',          brand: 'Ramen Zen' },
  LLVGGS3S6I: { branch: 'Al Barsha',    brand: 'All Veggie Sushi' },
};

function ymd(d) { return d.toISOString().slice(0, 10); }
function dubaiToday() { return ymd(new Date(Date.now() + 4 * 3600_000)); }
function addDays(s, n) { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return ymd(d); }

const TODAY = dubaiToday();
const YESTERDAY = addDays(TODAY, -1);
const FROM = process.argv[2] || addDays(TODAY, -7);
let TO = process.argv[3] || YESTERDAY;
if (TO > YESTERDAY) TO = YESTERDAY;   // today is not finished
if (!/^\d{4}-\d{2}-\d{2}$/.test(FROM) || !/^\d{4}-\d{2}-\d{2}$/.test(TO) || FROM > TO) {
  console.error(`Bad range ${FROM}..${TO}`);
  process.exit(1);
}

function loadSession() {
  const b64 = (process.env.NOON_SESSION || '').trim();
  if (b64) return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  const file = path.join(__dirname, 'noon-session.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  console.error('No session. Run: node scripts/noon/setup-session.js --upload');
  process.exit(1);
}

function cookieHeader(s) {
  const parts = [`_npsid=${s.npsid}`, `_nprtnetid=${s.nprtnetid}`, 'npa.pjc.v1=PRJ108431', 'npa.au.v1=true'];
  if (s.npa_rt_v1) parts.push(`npa.rt.v1=${s.npa_rt_v1}`);
  return parts.join('; ');
}

// The portal refuses a search longer than a month ("Search period length must
// be <= a month"), so longer ranges are read in windows of up to 28 days.
async function searchPage(cookie, page, from, to) {
  const payload = { startDate: from, endDate: addDays(to, 1), page };
  let resp;
  if (WEBHOOK_URL) {
    resp = await fetch(`${WEBHOOK_URL}/api/noon/proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie_header: cookie, brand_code: BRAND_CODE, path: '/order/search', payload }),
      signal: AbortSignal.timeout(60_000),
    });
  } else {
    resp = await fetch(`${BASE}/order/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-project': 'PRJ108431',
        'x-locale': 'en-ae',
        Cookie: cookie,
        Referer: `https://restaurant.noon.partners/restaurant/${BRAND_CODE}/orders/?project=PRJ108431`,
        Origin: 'https://restaurant.noon.partners',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });
  }
  if (resp.status === 401) {
    console.error('SESSION_EXPIRED — run: node scripts/noon/setup-session.js --upload');
    process.exit(1);
  }
  const text = await resp.text();
  if (!resp.ok) throw new Error(`order/search page ${page}: HTTP ${resp.status} ${text.slice(0, 200)}`);
  const j = JSON.parse(text);
  if (typeof j.pages !== 'number' || !j.orders || typeof j.orders !== 'object') {
    throw new Error(`order/search page ${page}: unexpected shape ${text.slice(0, 200)}`);
  }
  return j;
}

(async () => {
  const cookie = cookieHeader(loadSession());
  const orders = new Map();
  let pagesRead = 0;
  for (let wFrom = FROM; wFrom <= TO; wFrom = addDays(wFrom, 28)) {
    const wTo = addDays(wFrom, 27) < TO ? addDays(wFrom, 27) : TO;
    let pages = 1;
    for (let p = 1; p <= pages; p++) {
      const j = await searchPage(cookie, p, wFrom, wTo);
      pages = j.pages;
      pagesRead += 1;
      for (const [day, list] of Object.entries(j.orders)) {
        for (const o of list || []) orders.set(o.orderNr, { ...o, day });
      }
      if (p > 60) throw new Error('more than 60 pages in one window');
    }
  }
  const pages = pagesRead;

  // Every outlet, every day, zeros included: a day without a row would keep
  // whatever was typed before.
  const cells = new Map();
  for (let d = FROM; d <= TO; d = addDays(d, 1)) {
    for (const o of Object.values(OUTLETS)) {
      cells.set(`${d}|${o.brand}|${o.branch}`, { order_date: d, brand: o.brand, branch: o.branch, order_count: 0, revenue_aed: 0 });
    }
  }
  const unknown = {};
  for (const o of orders.values()) {
    if (o.day < FROM || o.day > TO) continue;
    const outlet = OUTLETS[o.outletCode];
    if (!outlet) { unknown[`${o.outletCode} ${o.outletName}`] = (unknown[`${o.outletCode} ${o.outletName}`] || 0) + 1; continue; }
    const c = cells.get(`${o.day}|${outlet.brand}|${outlet.branch}`);
    c.order_count += 1;
    if (o.status !== 'cancelled') c.revenue_aed += Number(o.orderTotal || 0);
  }
  const rows = [...cells.values()].map((r) => ({ ...r, revenue_aed: Math.round(r.revenue_aed * 100) / 100 }));
  const total = rows.reduce((s, r) => s + r.order_count, 0);
  console.log(`noon ${FROM}..${TO}: ${orders.size} orders fetched over ${pages} page(s), ${total} counted`);
  if (Object.keys(unknown).length) {
    // A new outlet must not vanish quietly; its orders are missing from the page
    // until it is added above.
    console.error('⚠ outlets not mapped (orders not counted):', JSON.stringify(unknown));
  }

  // Noon has had orders every day since opening. Nothing at all means the
  // read failed, and writing it would zero every outlet for the range.
  if (total === 0) { console.error('No orders in the range — nothing written'); process.exit(1); }

  if (!WEBHOOK_URL) {
    for (const r of rows.filter((x) => x.order_count)) console.log(`  ${r.order_date} ${r.brand.padEnd(17)} ${r.branch.padEnd(13)} ${r.order_count}`);
    console.log('(dry run — no WEBHOOK_URL, nothing written)');
    return;
  }
  if (!CRON_SECRET) { console.error('CRON_SECRET is required to write'); process.exit(1); }
  const res = await fetch(`${WEBHOOK_URL}/api/aggregator/order-counts/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Cron-Secret': CRON_SECRET },
    body: JSON.stringify({ aggregator: 'noon', rows }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) { console.error(`ingest failed ${res.status}: ${text.slice(0, 300)}`); process.exit(1); }
  const out = JSON.parse(text);
  console.log(`  written ${out.written}, rejected ${(out.rejected || []).length}`);
  if ((out.rejected || []).length) process.exit(1);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
