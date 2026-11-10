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
 * Default: the last 14 days up to yesterday (Manila). Runs each morning from
 * run-payout-local.sh (launchd on the office Mac), like the payouts: the CI
 * workflow for foodpanda is disabled.
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

    // One report at a time. Four at once drew a 403 on one of them for every
    // store on 2026-10-30 (PerimeterX); a 403 is answered by reopening the page,
    // which mints fresh headers, and asking again.
    const post = async (report, vendor) => {
      for (let attempt = 1; ; attempt++) {
        const resp = await context.request.post(VOS + report, {
          headers, data: { global_vendor_codes: [`FP_PH;${vendor}`], from: FROM, to: TO, precision: 'DAY' } });
        if (resp.ok()) return (await resp.json()).data || {};
        if (resp.status() !== 403 || attempt === 3) throw new Error(`${report} ${vendor} HTTP ${resp.status()}`);
        console.log(`  ${report} ${vendor} HTTP 403 — reopening the page (${attempt}/2)`);
        headers = null;
        await page.waitForTimeout(5000 * attempt);
        await page.reload({ waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
        for (let i = 0; i < 30 && !headers; i++) await page.waitForTimeout(500);
        if (!headers) throw new Error(`${report} ${vendor}: no fresh headers after reopening the page`);
      }
    };
    const rows = [];
    for (const [vendor, name] of Object.entries(acct.vendors)) {
      const offline = await post('offline_duration', vendor);
      const prep = await post('prep_time', vendor);
      const reject = await post('order_rejection', vendor);
      const contact = await post('contact-rate', vendor);
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

    // Offline time by month and reason (the Foodpanda tab's "Monthly Offline
    // Duration"), in place of the offlineDurationPerMonth CSVs that stopped at
    // 2026-03 (owner, 2026-11-10). The same report with precision MONTH: seconds,
    // with the scheduled time and the per-reason split. Last month and this one
    // each morning; OFFLINE_MONTHLY_FROM=YYYY-MM-01 reads further back (the
    // portal has 2025-10 onward). Ramen Zen Paranaque (fdwv) is left out.
    const firstOf = (d) => d.slice(0, 8) + '01';
    const prevMonth = (() => { const d = new Date(TO + 'T00:00:00Z'); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
    const mFrom = process.env.OFFLINE_MONTHLY_FROM || firstOf(prevMonth);
    const monthly = [];
    for (const [vendor, name] of Object.entries(acct.vendors)) {
      if (vendor === 'fdwv') continue;
      const resp = await context.request.post(VOS + 'offline_duration', {
        headers, data: { global_vendor_codes: [`FP_PH;${vendor}`], from: mFrom, to: TO, precision: 'MONTH' } });
      if (!resp.ok()) throw new Error(`offline_duration MONTH ${vendor} HTTP ${resp.status()}`);
      for (const m of ((await resp.json()).data || {}).dates || []) {
        monthly.push({ restaurant_id: vendor, restaurant_name: name, month: m.date,
          scheduled_seconds: Number(m.scheduledDuration || 0),
          reasons: (m.reasons || []).map((r) => ({ reason: r.reason, offline_seconds: Number(r.offlineDuration || 0) })) });
      }
    }
    const mresp = await fetch(`${WEBHOOK}/api/aggregator/foodpanda/offline-monthly`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cron-Secret': process.env.MGMT_CRON_SECRET || '' },
      body: JSON.stringify({ rows: monthly }), signal: AbortSignal.timeout(60_000) });
    const mtext = await mresp.text();
    if (!mresp.ok) throw new Error(`backend HTTP ${mresp.status} (monthly offline): ${mtext.slice(0, 300)}`);
    console.log(`✓ monthly offline ${mFrom.slice(0, 7)}..${TO.slice(0, 7)}: ${mtext.slice(0, 200)}`);
  } finally {
    await browser.close().catch(() => {});
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
})().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
