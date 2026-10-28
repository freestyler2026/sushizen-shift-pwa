/**
 * foodpanda Manila — Performance → Operations, day by day, per store.
 *
 * Replaces the per-metric CSVs staff downloaded from the portal and dropped in
 * Drive ("<Store>_offlineDurationPerDay_…", "_preparationTimePerDay_", …;
 * manila_sales_import_jobs kind foodpanda_ops_taft_daily). Same table
 * (manila_foodpanda_ops_daily), same store names and restaurant ids, so the
 * Foodpanda Analytics tab and the AI consult read it as before (owner, 2026-10-28).
 *
 * The portal's Operations tab reads these (found 2026-10-28):
 *   POST https://vos-api.ap.prd.portal.restaurant/v1/vendors/reports/<report>
 *     {"global_vendor_codes":["FP_PH;<vendor>"],"from":"YYYY-MM-DD","to":"YYYY-MM-DD","precision":"DAY"}
 *   offline_duration → dates[].offlineDuration (seconds)      → unavailable_time
 *   prep_time        → dates[].avgPreparationTime (seconds)   → average_preparation_time
 *                      dates[].avoidableWaitTimeOrdersCount   → orders_with_avoidable_wait_time
 *   order_rejection  → dates[].totals.rate (%)                → order_rejection_rate
 *   contact-rate     → dates[].totals.rate (%)                → orders_with_customer_complaints
 * The CSVs gave whole minutes (941 s offline was "15 min" = 900); these are
 * the seconds the portal itself counts.
 *
 * The bearer token is minted by the portal, so the page is opened with the
 * saved session and its own vos-api call supplies the headers (as
 * get-store-status.js does for vendors/status).
 *
 * Usage:
 *   FP_SESSION_TAFT=<b64> WEBHOOK_URL=... MGMT_CRON_SECRET=... \
 *   node scripts/foodpanda/get-ops-metrics.js taft [from] [to]
 * Default: the last 14 days up to yesterday (Manila).
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ACCOUNTS = {
  paranaque: { env: 'FP_SESSION_PARANAQUE', file: 'paranaque-session.b64.txt', store: 'Paranaque',
               vendors: { t0z4: 'Sushi Zen - Parañaque', fdwv: 'Ramen Zen - Paranaque' } },
  taft:      { env: 'FP_SESSION_TAFT', file: 'taft-session.b64.txt', store: 'Taft',
               vendors: { ryqc: 'Sushi Zen - Taft' } },
  qc:        { env: 'FP_SESSION_QC', file: 'qc-session.b64.txt', store: 'QC',
               vendors: { a97i: 'Sushi Zen - Cubao' } },
};
const LOC = (process.argv[2] || '').toLowerCase();
const acct = ACCOUNTS[LOC];
if (!acct) { console.error('Usage: node scripts/foodpanda/get-ops-metrics.js paranaque|taft|qc [from] [to]'); process.exit(1); }
const manilaDay = (back) => new Date(Date.now() + 8 * 3600e3 - back * 86400e3).toISOString().slice(0, 10);
const FROM = process.argv[3] || manilaDay(14);
const TO = process.argv[4] || manilaDay(1);
const WEBHOOK = (process.env.WEBHOOK_URL || '').trim();
const VOS = 'https://vos-api.ap.prd.portal.restaurant/v1/vendors/reports/';

function decodeSession(b64) {
  const b = Buffer.from(b64.trim(), 'base64');
  return JSON.parse(b[0] === 0x1f && b[1] === 0x8b ? zlib.gunzipSync(b).toString('utf8') : b.toString('utf8'));
}

(async () => {
  const b64 = process.env[acct.env] || (fs.existsSync(path.join(__dirname, acct.file))
    ? fs.readFileSync(path.join(__dirname, acct.file), 'utf8') : '');
  if (!b64) { console.error(`No session: set ${acct.env} or run setup-session.js ${LOC}`); process.exit(1); }
  const tmp = path.join(__dirname, `${LOC}-ops-tmp.json`);
  fs.writeFileSync(tmp, JSON.stringify(decodeSession(b64)));
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      storageState: tmp,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    });
    let headers = null;
    context.on('request', (r) => { if (!headers && r.url().startsWith('https://vos-api.') && r.method() === 'POST') headers = r.headers(); });
    const page = await context.newPage();
    await page.goto('https://partner.foodpanda.com/reports?tab=ops&mode=page', { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
    if (/\/login|\/signin/.test(page.url())) throw new Error(`SESSION_EXPIRED — node scripts/foodpanda/setup-session.js ${LOC}`);
    for (let i = 0; i < 20 && !headers; i++) await page.waitForTimeout(500);
    if (!headers) throw new Error('the portal never called vos-api — no token to read with');

    const post = async (report, vendor) => {
      const resp = await context.request.post(VOS + report, {
        headers, data: { global_vendor_codes: [`FP_PH;${vendor}`], from: FROM, to: TO, precision: 'DAY' } });
      if (!resp.ok()) throw new Error(`${report} ${vendor} HTTP ${resp.status()}`);
      return (await resp.json()).data || {};
    };
    const rows = [];
    for (const [vendor, name] of Object.entries(acct.vendors)) {
      const [offline, prep, reject, contact] = await Promise.all(
        ['offline_duration', 'prep_time', 'order_rejection', 'contact-rate'].map((r) => post(r, vendor)));
      const byDay = {};
      const day = (d) => (byDay[d] = byDay[d] || { sale_date: d, store_name: acct.store, restaurant_id: vendor, restaurant_name: name });
      for (const d of offline.dates || []) day(d.date).unavailable_time = Number(d.offlineDuration);
      for (const d of prep.dates || []) {
        // A day with no prepared orders carries no average; leave it empty, not 0.
        if (Number(d.preparationTimeDenominator || 0) > 0) day(d.date).average_preparation_time = Number(d.avgPreparationTime);
        day(d.date).orders_with_avoidable_wait_time = Number(d.avoidableWaitTimeOrdersCount || 0);
      }
      for (const d of reject.dates || []) day(d.date).order_rejection_rate = Number(d.totals && d.totals.rate);
      for (const d of contact.dates || []) day(d.date).orders_with_customer_complaints = Number(d.totals && d.totals.rate);
      rows.push(...Object.values(byDay));
      console.log(`✓ ${name} (${vendor}) ${FROM}..${TO}: ${Object.keys(byDay).length} day(s)`);
    }
    if (!WEBHOOK) { console.log(JSON.stringify(rows)); console.log('(no WEBHOOK_URL — nothing posted)'); return; }
    const resp = await fetch(`${WEBHOOK}/api/aggregator/foodpanda/ops-daily`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cron-Secret': process.env.MGMT_CRON_SECRET || '' },
      body: JSON.stringify({ rows }), signal: AbortSignal.timeout(60_000) });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`backend HTTP ${resp.status}: ${text.slice(0, 300)}`);
    console.log(`✓ posted: ${text.slice(0, 200)}`);
  } finally {
    await browser.close().catch(() => {});
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
})().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
