#!/usr/bin/env node
/**
 * Grab PH — per-order history extractor.
 *
 * Why this exists
 * ---------------
 * Prep Time was measured by asking staff to photograph delivery receipts into
 * Discord and reading the times back with OCR. Measured against this endpoint
 * for one store over three days: Grab had 207 orders, the OS held 116 of them
 * (56%), and of those the OCR order time was right 64% of the time. The daily
 * review of 15-20 rows was certifying a half-complete set with a third of the
 * times wrong, and no amount of reviewing the same photo fixes either number.
 *
 * This endpoint is what the portal's Orders -> History tab calls. It returns
 * every order, with Grab's own preparation-task verdict attached.
 *
 * Fields that matter
 *   displayID                    "GF-286" -- the same number the OCR reads
 *   createdAt                    UTC; Manila local is +8
 *   deliveryStatus               COMPLETED / cancelled
 *   preparationTaskID            present on every order seen so far
 *   isPreparationTaskDelayed     Grab's verdict, not ours
 *   preparationTaskDelayedByMin  3-19 min across the sample
 *
 * There is no absolute "ready at" timestamp here. Clicking an order row fires
 * no detail request, so the delay minutes are as close to prep time as the
 * portal goes. That is still better than a number nobody can check.
 *
 * Auth: one login sees one store, the same as get-payouts.js. Run
 * setup-session.js for each of paranaque | taft | qc. Sessions die within days.
 *
 * Usage:
 *   node scripts/grab/get-orders.js taft 2026-09-01 2026-09-03
 *   node scripts/grab/get-orders.js taft            # yesterday only
 *
 * Output: JSON on stdout, one array of orders. Nothing is posted anywhere yet
 * -- wiring it into the OS is the next step, deliberately separate so the
 * extract can be eyeballed first.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const STORE = process.argv[2] || 'taft';
const SESSION = path.join(__dirname, `${STORE}-session.json`);

function ymd(d) { return d.toISOString().slice(0, 10); }
const yesterday = ymd(new Date(Date.now() - 86400000));
const FROM = process.argv[3] || yesterday;
const TO = process.argv[4] || FROM;

// The portal sends +04:00 on a Philippine store. It is not a mistake to copy:
// the window is generous enough that the offset only affects which side of
// midnight an order lands on, and createdAt is returned in UTC regardless.
const OFFSET = '+04:00';

if (!fs.existsSync(SESSION)) {
  console.error(`No session at ${SESSION}`);
  console.error(`Run: node scripts/grab/setup-session.js ${STORE}`);
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: JSON.parse(fs.readFileSync(SESSION, 'utf8')),
  });
  const page = await ctx.newPage();

  await page.goto('https://merchant.grab.com/portal', {
    waitUntil: 'networkidle', timeout: 60000,
  }).catch(() => {});

  const all = [];
  const days = [];
  for (let d = new Date(FROM); ymd(d) <= TO; d.setDate(d.getDate() + 1)) days.push(ymd(d));

  for (const day of days) {
    for (let pageIndex = 0; pageIndex < 40; pageIndex++) {
      const url =
        'https://api.grab.com/delvplatformapi/merchant/v1/reports/daily-pagination'
        + `?states=&startTime=${day}T00:00:00${encodeURIComponent(OFFSET)}`
        + `&endTime=${day}T23:59:59${encodeURIComponent(OFFSET)}`
        + `&pageIndex=${pageIndex}&pageSize=50`;

      const res = await page.evaluate(async (u) => {
        const r = await fetch(u, { credentials: 'include' });
        return { status: r.status, text: await r.text() };
      }, url);

      // An expired session answers 401/403 here. Exiting non-zero matters:
      // a green run that imported nothing is what hid the Grab payout outage
      // for six days.
      if (res.status === 401 || res.status === 403) {
        console.error(`SESSION_EXPIRED — run: node scripts/grab/setup-session.js ${STORE}`);
        await browser.close();
        process.exit(1);
      }
      if (res.status !== 200) {
        console.error(`HTTP ${res.status} on ${day} page ${pageIndex}`);
        break;
      }

      let body;
      try { body = JSON.parse(res.text); } catch { break; }
      const rows = body.statements || [];
      all.push(...rows.map((r) => ({
        store: STORE,
        work_date: day,
        order_no: r.displayID,
        long_order_id: r.ID,
        created_at_utc: r.createdAt,
        updated_at_utc: r.updatedAt,
        status: r.deliveryStatus,
        amount: r.priceDisplay,
        prep_task_id: r.preparationTaskID || '',
        prep_delayed: !!r.isPreparationTaskDelayed,
        prep_delayed_min: r.preparationTaskDelayedByMin || 0,
        scheduled: !!r.isScheduledOrder,
        takeaway: !!r.isTakeawayOrder,
      })));
      if (!body.hasMore || rows.length === 0) break;
    }
  }

  await browser.close();

  const delayed = all.filter((o) => o.prep_delayed_min > 0);
  console.error(`${STORE} ${FROM}..${TO}: ${all.length} orders, `
    + `${delayed.length} with a prep delay`);
  process.stdout.write(JSON.stringify(all, null, 2));
})();
