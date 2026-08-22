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

async function fetchAllTransactions(cookieStr, dateFrom, dateTo) {
  const BASE = 'https://merchant.grab.com/mex/finances/v2/transactions';
  const LIMIT = 50;  // API max
  let offset = 0;
  const all = [];

  while (true) {
    const params = new URLSearchParams({
      merchant_group_id:        MERCHANT_GROUP,
      from:                     dateFrom,
      to:                       dateTo,
      transaction_status:       '',  // empty = all; filter client-side for 'completed'
      transaction_type:         '',
      transaction_category:     '',
      transaction_subcategory:  '',
      transaction_paymethod:    '',
      currency:                 'PHP',
      limit:                    String(LIMIT),
      offset:                   String(offset),
    });
    const url = `${BASE}?${params}`;
    const { status, text } = await grabGet(cookieStr, url);

    if (status === 401 || status === 403) {
      console.error('\n❌ SESSION_EXPIRED — run: node scripts/grab/setup-session.js paranaque');
      process.exit(0);  // exit 0 so CI doesn't mark as workflow failure
    }

    if (status !== 200) {
      console.error(`  HTTP ${status} from transactions API: ${text.slice(0, 200)}`);
      break;
    }

    let json;
    try { json = JSON.parse(text); }
    catch { console.error('  JSON parse error'); break; }

    const results = json?.data?.results;
    if (!Array.isArray(results) || results.length === 0) break;

    all.push(...results);
    console.log(`  page offset=${offset}: +${results.length} → total ${all.length}`);

    if (results.length < LIMIT) break;
    offset += LIMIT;
  }

  return all;
}

// ── Store code mapping ──────────────────────────────────────────────────────

function storeNameToCode(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('paranaque') || n.includes('parañaque')) return 'GRAB_PAR';
  if (n.includes('taft'))                                  return 'GRAB_TAFT';
  if (n.includes('cubao') || n.includes('q.c') || n.includes('qc')) return 'GRAB_QC';
  return `GRAB_${name.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8)}`;
}

// ── Date conversion (UTC → PHT) ─────────────────────────────────────────────
// GrabFood timestamps are UTC. Convert to PHT (UTC+8) for "business date" bucketing.

function utcToPhtDate(iso) {
  const d = new Date(iso);
  d.setTime(d.getTime() + 8 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

// ── Webhook ─────────────────────────────────────────────────────────────────

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

  // Fetch all transactions (paginated)
  console.log('\nFetching completed transactions...');
  const txns = await fetchAllTransactions(cookieStr, DATE_FROM, DATE_TO);
  console.log(`✓ ${txns.length} completed transaction(s) fetched`);

  if (txns.length === 0) {
    console.log('\n⚠ No completed transactions in range.');
    process.exit(0);
  }

  // Aggregate by (PHT date × store), completed transactions only
  // key = "YYYY-MM-DD|STORE_CODE"
  const agg = new Map();
  for (const t of txns) {
    if (t.transaction_status && t.transaction_status !== 'completed') continue;
    const phtDate  = utcToPhtDate(t.created_at || t.updated_at || '');
    if (!phtDate || phtDate < DATE_FROM || phtDate > DATE_TO) continue;

    const storeName = t.store_name || '';
    const storeCode = storeNameToCode(storeName);
    const key = `${phtDate}|${storeCode}`;

    if (!agg.has(key)) {
      agg.set(key, { phtDate, storeCode, storeName, netTotal: 0, orderCount: 0, txnIds: [] });
    }
    const entry = agg.get(key);
    entry.netTotal   += parseFloat(t.net_total || 0);
    entry.orderCount += 1;
    entry.txnIds.push(t.transaction_id || t.short_order_number || '');
  }

  console.log(`\n✓ ${agg.size} store×date aggregate(s)`);
  console.log('\n' + 'SettlementID'.padEnd(28) + 'Store'.padStart(10) + 'Orders'.padStart(8) + 'Net PHP'.padStart(12));
  console.log('-'.repeat(62));

  let posted      = 0;
  let grandTotal  = 0;
  let grandOrders = 0;

  // Sort by date then store for readable output
  const entries = [...agg.values()].sort((a, b) =>
    a.phtDate.localeCompare(b.phtDate) || a.storeCode.localeCompare(b.storeCode)
  );

  for (const { phtDate, storeCode, storeName, netTotal, orderCount, txnIds } of entries) {
    // settlement_id: backend prepends "GRAB_", so payout_id = "GRAB_{storeCode}_{date}"
    // e.g. "PAR_2026-08-22" → payout_id = "GRAB_PAR_2026-08-22"
    const settlementId = `${storeCode.replace(/^GRAB_/, '')}_${phtDate}`;

    grandTotal  += netTotal;
    grandOrders += orderCount;

    console.log(
      settlementId.padEnd(28) +
      storeCode.padStart(10) +
      String(orderCount).padStart(8) +
      netTotal.toFixed(2).padStart(12),
    );

    try {
      const result = await postWebhook({
        settlement_id:     settlementId,
        store_name:        storeName,
        store_code:        storeCode,
        merchant_id:       null,
        merchant_group_id: MERCHANT_GROUP,
        payout_date:       phtDate,
        period_start:      phtDate,
        period_end:        phtDate,
        net_total:         Math.round(netTotal * 100) / 100,
        status:            'completed',
        raw:               { orderCount, txnIds: txnIds.slice(0, 20), date: phtDate },
        extracted_at:      extractedAt,
      });
      console.log(`  ✓ Posted → payout_id=GRAB_${settlementId}`);
      posted++;
    } catch (err) {
      console.error(`  ❌ Webhook error: ${err.message}`);
    }
  }

  console.log('-'.repeat(62));
  console.log(
    'TOTAL'.padEnd(28) +
    ''.padStart(10) +
    String(grandOrders).padStart(8) +
    grandTotal.toFixed(2).padStart(12),
  );
  console.log(`\n✓ ${posted}/${entries.length} daily aggregates posted to ar_payouts.`);
  console.log('  Note: these are order-level totals (GrabFood PH has no settlement batch API).');
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
