/**
 * GrabFood Manila — daily payout extractor (direct HTTP, no Playwright)
 *
 * GrabFood Philippines does NOT expose a dedicated bank-settlement API.
 * The Finance > Transfers page uses /mex/finances/v2/transactions (per-order).
 * This script aggregates completed order transactions per store per day and
 * posts one summary record per (store × date) to ar_payouts via the webhook.
 *
 * Auth: one Paranaque manager session covers all 3 PH stores via the
 *   merchant group PHMG20250807052040017951 (confirmed from check-prices.js).
 *
 * APIs discovered 2026-08-22:
 *   GET https://merchant.grab.com/mex/finances/v2/transactions
 *       ?merchant_group_id=PHMG20250807052040017951
 *       &from=YYYY-MM-DD&to=YYYY-MM-DD
 *       &transaction_status=completed
 *       &currency=PHP&limit=100&offset=0
 *   → data.results[]: transaction_id, store_name, net_total, transaction_status,
 *                      transaction_category, created_at, updated_at
 *
 *   GET https://portal.grab.com/foodtroy/v1/PH/merchant-groups/catalog-stores
 *   → merchants[]: merchantID (gfid), merchantName
 *
 * Usage (local):
 *   DATE_FROM=2026-07-23 DATE_TO=2026-08-22 \
 *   WEBHOOK_URL=https://sushizen-shift-app-038d846023bc.herokuapp.com \
 *   SESSION_PATH=scripts/grab/paranaque-session.json \
 *   node scripts/grab/get-payouts.js
 *
 * Usage (CI):
 *   GRAB_SESSION_STATE=<base64> DATE_FROM=... DATE_TO=... WEBHOOK_URL=... \
 *   node scripts/grab/get-payouts.js
 */

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATE_FROM        = process.env.DATE_FROM;
const DATE_TO          = process.env.DATE_TO;
const WEBHOOK_URL      = process.env.WEBHOOK_URL;
const MERCHANT_GROUP   = 'PHMG20250807052040017951';

// Grab PH keeps each branch behind its own login, so one session sees one
// store: a Paranaque manager session returned 1,320 of 1,320 transactions for
// Paranaque and nothing for the others. Run this once per store with that
// store's session, the way the FoodPanda extractor already does.
const STORE_CODE = process.env.GRAB_STORE_CODE || 'PAR';
const STORE_NAME = process.env.GRAB_STORE_NAME || {
  PAR:  'Sushi Zen - Paranaque',
  TAFT: 'Sushi Zen - Taft',
  CUB:  'Sushi Zen - Cubao',
}[STORE_CODE] || STORE_CODE;

// ── Session loading ─────────────────────────────────────────────────────────

function loadSession() {
  const b64Env = process.env.GRAB_SESSION_STATE;
  if (b64Env) {
    const buf = Buffer.from(b64Env.trim(), 'base64');
    const raw = (buf[0] === 0x1f && buf[1] === 0x8b)
      ? zlib.gunzipSync(buf).toString('utf8')
      : buf.toString('utf8');
    const data = JSON.parse(raw);
    console.log(`✓ Session from GRAB_SESSION_STATE (${data.cookies?.length} cookies)`);
    return data;
  }
  const jsonPath = process.env.SESSION_PATH ||
                   path.join(__dirname, 'paranaque-session.json');
  if (fs.existsSync(jsonPath)) {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    console.log(`✓ Session from ${jsonPath} (${data.cookies?.length} cookies)`);
    return data;
  }
  console.error('❌ No session. Set GRAB_SESSION_STATE or run setup-session.js paranaque');
  process.exit(1);
}

function buildCookieString(session) {
  return (session.cookies || [])
    .filter(c => c.domain === '.grab.com' || c.domain === 'merchant.grab.com')
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

async function grabGet(cookieStr, url) {
  const resp = await fetch(url, {
    headers: {
      Cookie:       cookieStr,
      Accept:       'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
      Referer:      'https://merchant.grab.com/',
      Origin:       'https://merchant.grab.com',
    },
    signal: AbortSignal.timeout(20_000),
  });
  return { status: resp.status, text: await resp.text() };
}

// ── Fetch paginated transactions ────────────────────────────────────────────
// GET /mex/finances/v2/transactions — returns completed order-level transactions.
// Finance/Transfers page calls this exact endpoint (discovered 2026-08-22).
// store_name in each result identifies which of the 3 stores earned the order.

/**
 * Daily settlement figures.
 *
 * The per-order transactions endpoint gives net_total, which sums to net_sales
 * — the value of the orders, before Grab takes its cut. The summary endpoint
 * also returns net_earning, and that is what actually reaches the bank:
 * checked against the Transfers CSV, net_earning for 18 Aug is 25,234.09 and
 * the transfer dated 19 Aug is 25,234.09 to the cent, likewise 19 Aug against
 * the 20th. Grab PH settles daily, one day behind.
 */
async function fetchDailySummary(cookieStr, day) {
  const params = new URLSearchParams({
    merchant_group_id: MERCHANT_GROUP,
    from:              day,
    to:                day,
    business_line:     'ALL',
    currency:          'PHP',
  });
  const url = `https://merchant.grab.com/mex/finances/v1/transactions/summary?${params}`;
  const { status, text } = await grabGet(cookieStr, url);

  if (status === 401 || status === 403) {
    console.error('\n❌ SESSION_EXPIRED — run: node scripts/grab/setup-session.js <store>');
    // Exiting 0 here kept the daily workflow green while it imported nothing.
    // Grab's ran and reported success every morning for six days after the
    // session died, so the one signal anybody was watching said the opposite
    // of the truth. An expired session is not a code bug, but it is a failed
    // run, and the check should say so.
    process.exit(1);
  }
  if (status === 400 && /Min from/.test(text)) {
    // Grab only serves roughly the last six months; asking for anything older
    // returns this rather than an empty result.
    const e = new Error('BEFORE_RETENTION');
    e.beforeRetention = true;
    throw e;
  }
  if (status !== 200) throw new Error(`HTTP ${status}: ${text.slice(0, 160)}`);

  const d = (JSON.parse(text).data) || {};
  return {
    day,
    netSales:   Number(d.net_sales    || 0),
    netEarning: Number(d.net_earning  || 0),
    orders:     Number(d.total_orders || 0),
    inaccurate: Boolean(d.is_inaccurate_data),
  };
}

/** Every date from `from` to `to` inclusive, as YYYY-MM-DD. */
function eachDay(from, to) {
  const out = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Settlement lands the day after the business date. */
function nextDay(day) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);
}


async function postWebhook(payload) {
  const endpoint = `${WEBHOOK_URL}/api/grab/portal-payout-record`;
  if (!WEBHOOK_URL) {
    console.log('  (dry run — no WEBHOOK_URL)', JSON.stringify(payload, null, 2));
    return { ok: true, dry_run: true };
  }
  const resp = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
    signal:  AbortSignal.timeout(15_000),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`Webhook ${resp.status}: ${t.slice(0, 200)}`);
  }
  return resp.json();
}

// ── Main ─────────────────────────────────────────────────────────────────────

/**
 * Refuse to run when the session and GRAB_STORE_CODE disagree.
 *
 * fetchDailySummary asks for a merchant group, not a store: the session decides
 * whose money comes back, and GRAB_STORE_CODE only decides what it gets called.
 * Nothing connected the two. Running the Paranaque session with
 * GRAB_STORE_CODE=TAFT returns Paranaque's figures and files them under Taft --
 * verified, both TAFT and CUB came back with Paranaque's exact totals -- and
 * nothing downstream could ever tell, because the numbers are real, just
 * attributed to the wrong branch.
 *
 * The per-order endpoint does name the store, so one page of it is enough to
 * check before writing anything.
 */
async function assertSessionMatchesStore(cookieStr) {
  const params = new URLSearchParams({
    merchant_group_id: MERCHANT_GROUP,
    from: DATE_FROM, to: DATE_TO,
    transaction_status: 'completed',
    currency: 'PHP', limit: '20', offset: '0',
  });
  let names = [];
  try {
    // grabGet returns { status, text } -- not parsed JSON.
    const resp = await grabGet(cookieStr, `https://merchant.grab.com/mex/finances/v2/transactions?${params}`);
    const j = JSON.parse(resp.text);
    const rows = j?.data?.results || j?.data || j?.results || [];
    names = [...new Set((Array.isArray(rows) ? rows : [])
      .map(r => r.store_name).filter(Boolean))];
  } catch (_) { /* fall through to the "cannot tell" branch below */ }

  if (!names.length) {
    console.log('⚠ Could not read a store name from this session — skipping the');
    console.log('  session/store check. Confirm the figures land under the right branch.');
    return;
  }
  // Match on the words that actually distinguish the branches, not on the
  // whole display name. Grab calls Cubao "Sushizen Japanese Restaurant -
  // Quezon City", which shares no substring with "Sushi Zen - Cubao", so a
  // whole-name comparison rejected a perfectly good Cubao session.
  const MARKERS = { PAR: ['paranaque'], TAFT: ['taft'], CUB: ['quezon', 'cubao'] };
  const markers = MARKERS[STORE_CODE];
  if (!markers) {
    console.log(`⚠ No branch marker known for ${STORE_CODE} — skipping the session/store check.`);
    return;
  }
  const ok = names.some(n => markers.some(m => n.toLowerCase().includes(m)));
  if (!ok) {
    console.error(`\n❌ This session belongs to: ${names.join(', ')}`);
    console.error(`   but GRAB_STORE_CODE is ${STORE_CODE} (${STORE_NAME}).`);
    console.error('   Refusing to run — it would file one branch\'s money under another.');
    console.error(`   Use scripts/grab/${STORE_CODE.toLowerCase()}-session.json, or set GRAB_STORE_CODE to match.`);
    process.exit(1);
  }
  console.log(`✓ Session belongs to ${names.join(', ')} — matches ${STORE_CODE}`);
}

async function main() {
  if (!DATE_FROM || !DATE_TO) {
    console.error('DATE_FROM and DATE_TO must be set (e.g. 2026-08-01 / 2026-08-22)');
    process.exit(1);
  }

  console.log('\nGrabFood PH payout extractor');
  console.log(`Date range: ${DATE_FROM} → ${DATE_TO}  (PHT business dates)`);
  console.log('='.repeat(60));

  const session      = loadSession();
  const cookieStr    = buildCookieString(session);
  const extractedAt  = new Date().toISOString();

  const days = eachDay(DATE_FROM, DATE_TO);
  await assertSessionMatchesStore(cookieStr);

  console.log(`\nFetching daily settlement summaries (${days.length} day(s))...`);

  const rows = [];
  let skippedOld = 0;
  for (const day of days) {
    try {
      rows.push(await fetchDailySummary(cookieStr, day));
    } catch (err) {
      if (err.beforeRetention) { skippedOld++; continue; }
      console.error(`  ✗ ${day}: ${err.message}`);
    }
  }
  if (skippedOld > 0) {
    // Say it once, and say how many — a silent gap reads as "no sales".
    console.log(`  (${skippedOld} day(s) predate Grab's retention window and cannot be fetched)`);
  }

  const withMoney = rows.filter(r => r.netEarning !== 0);
  console.log(`✓ ${withMoney.length} day(s) with a settlement`);
  if (withMoney.length === 0) {
    console.log('\n⚠ Nothing to post for this range.');
    process.exit(0);
  }

  console.log('\n' + 'SettlementID'.padEnd(26) + 'Store'.padStart(10)
              + 'Orders'.padStart(8) + 'Net sales'.padStart(13) + 'Payout PHP'.padStart(13));
  console.log('-'.repeat(70));

  let posted = 0, grandPayout = 0, grandOrders = 0, flagged = 0;

  for (const r of withMoney) {
    const settlementId = `${STORE_CODE}_${r.day}`;
    grandPayout += r.netEarning;
    grandOrders += r.orders;
    if (r.inaccurate) flagged++;

    console.log(
      settlementId.padEnd(26) + STORE_CODE.padStart(10) +
      String(r.orders).padStart(8) + r.netSales.toFixed(2).padStart(13) +
      r.netEarning.toFixed(2).padStart(13) + (r.inaccurate ? '  ⚠ flagged by Grab' : ''),
    );

    try {
      await postWebhook({
        settlement_id:     settlementId,
        store_name:        STORE_NAME,
        store_code:        STORE_CODE,
        merchant_id:       null,
        merchant_group_id: MERCHANT_GROUP,
        payout_date:       nextDay(r.day),   // settles the following day
        period_start:      r.day,
        period_end:        r.day,
        net_total:         Math.round(r.netEarning * 100) / 100,
        status:            'settled',
        raw: {
          data_type:          'net_payout',
          net_sales:          r.netSales,
          orders:             r.orders,
          business_date:      r.day,
          is_inaccurate_data: r.inaccurate,
        },
        extracted_at:      extractedAt,
      });
      posted++;
    } catch (err) {
      console.error(`  ❌ Webhook error: ${err.message}`);
    }
  }

  console.log('-'.repeat(70));
  console.log('TOTAL'.padEnd(36) + String(grandOrders).padStart(8)
              + ''.padStart(13) + grandPayout.toFixed(2).padStart(13));
  console.log(`\n✓ ${posted}/${withMoney.length} daily settlements posted to ar_payouts.`);
  console.log('  Amount = net_earning, i.e. what Grab actually transfers (verified');
  console.log('  against the Transfers CSV to the cent). Settlement lands the next day.');
  if (flagged > 0) {
    // Never let Grab's own warning vanish into a total.
    console.log(`  ⚠ ${flagged} day(s) marked is_inaccurate_data by Grab — re-run later.`);
  }
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
