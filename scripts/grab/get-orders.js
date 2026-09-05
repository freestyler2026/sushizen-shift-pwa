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
 * The list has no ready timestamp, but the per-order detail does:
 *   GET api.grab.com/food/merchant/v3/orders/{ID}  ->  order.times.readyAt
 * Prep minutes = readyAt - acceptedAt. One extra request per order, ~0.3s.
 *
 * Take the measured minutes, not isPreparationTaskDelayed. Grab's own flag
 * understates lateness badly: GF-017 took 50 minutes against a 25-minute
 * estimate and was recorded as delayed by 0, as was GF-740 at 53 against 33.
 *
 * Auth: one login sees one store, the same as get-payouts.js. Run
 * setup-session.js for each of paranaque | taft | qc. Sessions die within days.
 *
 * No browser. The endpoint accepts the session cookies on a plain request, so
 * driving a headless Chrome only added a Playwright dependency the payout job
 * does not have -- which is exactly how the first CI run failed.
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

function cookieHeader(state) {
  return (state.cookies || [])
    .filter((c) => String(c.domain || '').includes('grab.com'))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

async function grabGet(cookie, url) {
  try {
    const r = await fetch(url, {
      headers: {
        Cookie: cookie,
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
          + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
        Referer: 'https://merchant.grab.com/',
        Origin: 'https://merchant.grab.com',
      },
      signal: AbortSignal.timeout(30_000),
    });
    return { status: r.status, text: await r.text() };
  } catch (e) {
    return { status: 0, text: String(e) };
  }
}

(async () => {
  const cookie = cookieHeader(loadSession());

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

      const res = await grabGet(cookie, url);

      if (res.status === 0) {
        console.error(`SESSION_EXPIRED — run: node scripts/grab/setup-session.js ${STORE}`);
        console.error(`  (${res.text.slice(0, 80)})`);
        process.exit(1);
      }

      // An expired session answers 401/403 here. Exiting non-zero matters:
      // a green run that imported nothing is what hid the Grab payout outage
      // for six days.
      if (res.status === 401 || res.status === 403) {
        console.error(`SESSION_EXPIRED — run: node scripts/grab/setup-session.js ${STORE}`);
        process.exit(1);
      }
      if (res.status !== 200) {
        // Breaking here moved on to the next day and posted whatever had been
        // collected, exiting 0 -- the window silently short by the rest of that
        // day. Fail the run instead; a three-day window means the next run
        // picks it up anyway.
        console.error(`HTTP ${res.status} on ${day} page ${pageIndex}. `
          + 'Nothing imported.');
        process.exit(1);
      }

      let body;
      try {
        body = JSON.parse(res.text);
      } catch {
        // A 200 that is not JSON means the endpoint moved or we were served a
        // page instead of data. Breaking here would end the run with zero
        // orders and exit 0 -- a green job that imported nothing, which is the
        // failure this whole pipeline exists to stop happening quietly.
        console.error(`Unparseable response on ${day} page ${pageIndex}: `
          + res.text.slice(0, 120));
        process.exit(1);
      }
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

  // Fill in the prep timestamps. Four at a time: sequential is ~0.3s each and a
  // three-day window across a busy store is several hundred orders, while more
  // concurrency risks the portal's rate limiting for no useful gain.
  const detailable = all.filter((o) => o.status === 'COMPLETED');
  let cursor = 0;
  async function worker() {
    while (cursor < detailable.length) {
      const o = detailable[cursor++];
      const d = await grabGet(cookie,
        `https://api.grab.com/food/merchant/v3/orders/${o.long_order_id}`);
      if (d.status !== 200) continue;
      let t;
      try { t = (JSON.parse(d.text).order || {}).times || {}; } catch { continue; }
      o.accepted_at_utc = t.acceptedAt || null;
      o.ready_at_utc = t.readyAt || null;
      // Null when either end is missing, never 0: a zero would read as an order
      // prepared instantly and drag the median down.
      o.prep_minutes = (t.acceptedAt && t.readyAt)
        ? Math.round((new Date(t.readyAt) - new Date(t.acceptedAt)) / 60000)
        : null;
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));

  const withPrep = detailable.filter((o) => o.prep_minutes !== null).length;
  console.error(`  prep times: ${withPrep}/${detailable.length} completed orders`);

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
