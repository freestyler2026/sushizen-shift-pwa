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
 * Output: JSON on stdout. With WEBHOOK_URL set it also posts to the OS; without
 * it nothing is written anywhere, so the extract can be eyeballed first. That
 * "dry unless a URL is given" shape is deliberate -- the Noon and Keeta
 * workflows used `A && '' || B`, which always evaluates to B, so their dry_run
 * never once suppressed a write.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const STORE = process.argv[2] || 'taft';
const SESSION = path.join(__dirname, `${STORE}-session.json`);

/** CI has no session file -- the login lives in a gzip+base64 secret, the same
 *  shape get-payouts.js reads. Locally the file is used, so the two paths stay
 *  interchangeable and a local run tests what CI will do. */
function loadSession() {
  const b64 = (process.env.GRAB_SESSION_STATE || '').trim();
  if (b64) {
    const buf = Buffer.from(b64, 'base64');
    const raw = (buf[0] === 0x1f && buf[1] === 0x8b)
      ? zlib.gunzipSync(buf).toString('utf8')
      : buf.toString('utf8');
    return JSON.parse(raw);
  }
  if (!fs.existsSync(SESSION)) {
    console.error(`No session: set GRAB_SESSION_STATE or run `
      + `node scripts/grab/setup-session.js ${STORE}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(SESSION, 'utf8'));
}

function ymd(d) { return d.toISOString().slice(0, 10); }
const yesterday = ymd(new Date(Date.now() - 86400000));
const FROM = process.argv[3] || yesterday;
const TO = process.argv[4] || FROM;

// The portal sends +04:00 on a Philippine store. It is not a mistake to copy:
// the window is generous enough that the offset only affects which side of
// midnight an order lands on, and createdAt is returned in UTC regardless.
const OFFSET = '+04:00';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: loadSession() });
  const page = await ctx.newPage();

  await page.goto('https://merchant.grab.com/portal', {
    waitUntil: 'networkidle', timeout: 60000,
  }).catch(() => {});

  // A dead session is bounced to weblogin.grab.com, and every fetch after that
  // runs on the wrong origin and dies as "Failed to fetch" -- an uncaught
  // rejection with a stack trace into Grab's bundled JS, which says nothing
  // about what to do. Check where we actually landed instead.
  //
  // The cookie expiry cannot be used for this: Paranaque's token claimed 35.7
  // hours remaining on 2026-09-05 and the portal still refused it.
  if (/weblogin\.grab\.com|\/login/i.test(page.url())) {
    console.error(`SESSION_EXPIRED — run: node scripts/grab/setup-session.js ${STORE}`);
    console.error(`  (landed on ${page.url().slice(0, 70)})`);
    await browser.close();
    process.exit(1);
  }

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
        try {
          const r = await fetch(u, { credentials: 'include' });
          return { status: r.status, text: await r.text() };
        } catch (e) {
          // Cross-origin refusal after a redirect to the login page reads as
          // "Failed to fetch". Return it rather than throwing, so the caller
          // reports a session problem instead of an uncaught rejection.
          return { status: 0, text: String(e) };
        }
      }, url);

      if (res.status === 0) {
        console.error(`SESSION_EXPIRED — run: node scripts/grab/setup-session.js ${STORE}`);
        console.error(`  (${res.text.slice(0, 80)})`);
        await browser.close();
        process.exit(1);
      }

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
        // priceDisplay is formatted for humans -- "1,457.00". Sent raw it fails
        // number validation and the whole batch of 200 is refused for one row.
        amount: (() => {
          const n = parseFloat(String(r.priceDisplay ?? '').replace(/,/g, ''));
          return Number.isFinite(n) ? n : null;
        })(),
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

  const webhook = (process.env.WEBHOOK_URL || '').trim();
  if (webhook && all.length) {
    // Posted in batches: a month of three stores is a few thousand rows and one
    // request that size is refused before it reaches the handler.
    const SIZE = 200;
    let written = 0;
    for (let i = 0; i < all.length; i += SIZE) {
      const chunk = all.slice(i, i + SIZE);
      const res = await fetch(`${webhook}/api/grab/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store: STORE, orders: chunk }),
        signal: AbortSignal.timeout(60_000),
      });
      const text = await res.text();
      if (!res.ok) {
        console.error(`POST failed ${res.status}: ${text.slice(0, 200)}`);
        process.exit(1);
      }
      // Count what the server says it wrote, not what was sent. An upsert that
      // changes nothing still returns 200, and reporting the sent count would
      // print "245 imported" over a table that did not move.
      try { written += JSON.parse(text).written || 0; } catch { /* keep going */ }
    }
    console.error(`  posted: ${written} rows written of ${all.length} sent`);
  } else if (!webhook) {
    console.error('  (dry run — no WEBHOOK_URL, nothing written)');
  }

  process.stdout.write(JSON.stringify(all, null, 2));
})();
