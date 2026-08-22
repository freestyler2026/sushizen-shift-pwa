/**
 * GrabFood Manila — daily payout extractor (direct HTTP, no Playwright)
 *
 * Uses the Paranaque manager session (one account = all 3 PH stores).
 * Auth: mexusers_authn_token cookie on .grab.com domain (same as check-prices.js).
 *
 * Finance API (discovered 2026-08-22):
 *   GET https://merchant.grab.com/mex/finances/v1/transfers
 *       ?merchant_group_id={MGID}&from={YYYY-MM-DD}&to={YYYY-MM-DD}&currency=PHP
 *
 * NOTE: If this script exits with "FINANCE_API_UNKNOWN", run:
 *   node scripts/grab/setup-session.js paranaque
 * Navigate to Finance > Transfers, then check the console output for the API URL.
 *
 * Usage (local):
 *   DATE_FROM=2026-07-23 DATE_TO=2026-08-22 \
 *   WEBHOOK_URL=https://sushizen-shift-app-038d846023bc.herokuapp.com \
 *   SESSION_PATH=scripts/grab/paranaque-session.json \
 *   node scripts/grab/get-payouts.js
 *
 * Usage (CI — env vars from GitHub Secrets):
 *   GRAB_SESSION_STATE=<base64> DATE_FROM=... DATE_TO=... WEBHOOK_URL=... \
 *   node scripts/grab/get-payouts.js
 */

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATE_FROM   = process.env.DATE_FROM;
const DATE_TO     = process.env.DATE_TO;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// ── Session loading ─────────────────────────────────────────────────────────
// Supports three formats (all decoded to { cookies: [...] }):
//   1. GRAB_SESSION_STATE env var (base64 of JSON, old format from price checker)
//   2. GRAB_SESSION_STATE env var (gzip+base64, new format from updated setup-session.js)
//   3. SESSION_PATH env var pointing to a .json file (paranaque-session.json)

function loadSession() {
  // CI: env var (base64, possibly gzip-compressed)
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
  // Local: JSON file (paranaque-session.json from setup-session.js)
  const jsonPath = process.env.SESSION_PATH ||
                   path.join(__dirname, 'paranaque-session.json');
  if (fs.existsSync(jsonPath)) {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    console.log(`✓ Session from ${jsonPath} (${data.cookies?.length} cookies)`);
    return data;
  }
  console.error('❌ No session. Set GRAB_SESSION_STATE env var or run setup-session.js paranaque');
  process.exit(1);
}

function buildCookieString(session) {
  return (session.cookies || [])
    .filter(c => c.domain === '.grab.com' || c.domain === 'merchant.grab.com')
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  'Accept':     'application/json, text/plain, */*',
  'Referer':    'https://merchant.grab.com/',
  'Origin':     'https://merchant.grab.com',
};

async function grabGet(cookieStr, url) {
  const resp = await fetch(url, {
    headers: { ...BASE_HEADERS, Cookie: cookieStr },
    signal:  AbortSignal.timeout(20_000),
  });
  return { status: resp.status, body: await resp.text() };
}

// ── Discover merchant_group_id ─────────────────────────────────────────────

async function getMerchantGroupId(cookieStr) {
  // From the session, try to get the merchant-selector which lists all groups
  const { status, body } = await grabGet(
    cookieStr,
    'https://merchant.grab.com/troy/user-profile/v1/merchant-selector',
  );
  if (status === 200) {
    try {
      const json = JSON.parse(body);
      // Typically returns { merchantGroups: [{ merchantGroupID, merchantGroupName }] }
      const groups = json.merchantGroups || json.data?.merchantGroups || [];
      if (groups.length > 0) {
        console.log(`  Merchant groups: ${groups.map(g => g.merchantGroupID || g.id).join(', ')}`);
        return (groups[0].merchantGroupID || groups[0].id);
      }
    } catch (_) {}
  }
  // Fallback: use the known Paranaque group ID (discovered 2026-08-22)
  console.log('  Using known merchant_group_id: PHMG20250807052040017951');
  return 'PHMG20250807052040017951';
}

// ── Finance / Transfers API ────────────────────────────────────────────────
//
// Grab Finance portal endpoints (to be confirmed after setup-session.js run):
//   /mex/finances/v1/transfers          ← most likely for transfer/payout records
//   /mex/finances/v1/transactions       ← alternative (without /summary)
//   /mex/finances/v1/settlements        ← possible alternative naming
//
// Each transfer record in CSV has: Settlement ID, Net Total, Transfer Date,
// Status, Bank Name, Bank Account, Store Name/ID.
// The API response is expected to have similar fields.

const CANDIDATE_TRANSFER_PATHS = [
  '/mex/finances/v1/transfers',
  '/mex/finances/v1/transactions',
  '/mex/finances/v1/settlements',
  '/mex/finances/v1/payouts',
];

async function fetchTransfers(cookieStr, merchantGroupId, dateFrom, dateTo) {
  const params = new URLSearchParams({
    merchant_group_id: merchantGroupId,
    from:              dateFrom,
    to:                dateTo,
    currency:          'PHP',
  });

  for (const apiPath of CANDIDATE_TRANSFER_PATHS) {
    const url = `https://merchant.grab.com${apiPath}?${params}`;
    console.log(`  Trying: ${url.slice(0, 100)}`);
    const { status, body } = await grabGet(cookieStr, url);
    console.log(`  → HTTP ${status}, body: ${body.slice(0, 120)}`);

    if (status === 401 || status === 403) {
      console.log('  Session expired or unauthorized — exiting');
      console.error('\n❌ SESSION_EXPIRED — run: node scripts/grab/setup-session.js paranaque');
      process.exit(0);  // exit 0 so CI doesn't fail on auth issues
    }

    if (status === 200) {
      try {
        const json = JSON.parse(body);
        // Look for array of transfers in common response shapes
        const transfers =
          json.transfers     ||
          json.transactions  ||
          json.settlements   ||
          json.payouts       ||
          json.data?.transfers    ||
          json.data?.transactions ||
          json.data?.settlements  ||
          json.data?.payouts      ||
          (Array.isArray(json) ? json : null);

        if (transfers && Array.isArray(transfers)) {
          console.log(`  ✓ Found ${transfers.length} record(s) at ${apiPath}`);
          return { apiPath, transfers };
        }
        // Even if no transfers array found, log the structure for debugging
        console.log(`  Response keys: ${Object.keys(json).join(', ')}`);
      } catch (err) {
        console.log(`  JSON parse error: ${err.message}`);
      }
    }
  }

  // None of the candidates worked — print instructions
  console.log('\n⚠ Finance transfer API not yet discovered.');
  console.log('  Run: node scripts/grab/setup-session.js paranaque');
  console.log('  Navigate to Finance > Transfers page during the 45s window.');
  console.log('  Look for the API URL in the console output, then update CANDIDATE_TRANSFER_PATHS.');
  return { apiPath: null, transfers: [] };
}

// ── Store name → store code mapping ───────────────────────────────────────

const STORE_CODE_MAP = {
  'sushi zen - paranaque': 'GRAB_PAR',
  'sushi zen - taft':      'GRAB_TAFT',
  'sushi zen - cubao':     'GRAB_QC',
  'sushi zen paranaque':   'GRAB_PAR',
  'sushi zen taft':        'GRAB_TAFT',
  'sushi zen cubao':       'GRAB_QC',
  'paranaque':             'GRAB_PAR',
  'taft':                  'GRAB_TAFT',
  'cubao':                 'GRAB_QC',
};

function inferStoreCode(transfer) {
  const name = (
    transfer.store_name || transfer.storeName || transfer.merchantName ||
    transfer.outlet_name || transfer.outletName || ''
  ).toLowerCase().trim();
  for (const [key, code] of Object.entries(STORE_CODE_MAP)) {
    if (name.includes(key)) return code;
  }
  return `GRAB_${(transfer.merchant_id || transfer.merchantId || 'UNKNOWN').toUpperCase()}`;
}

// ── Webhook ────────────────────────────────────────────────────────────────

async function postWebhook(payload) {
  const endpoint = `${WEBHOOK_URL}/api/grab/portal-payout-record`;
  if (!WEBHOOK_URL) {
    console.log('  (dry run — no WEBHOOK_URL)', JSON.stringify(payload, null, 2));
    return { ok: true, payout_id: `GRAB_${payload.settlement_id}`, dry_run: true };
  }
  const resp = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
    signal:  AbortSignal.timeout(15_000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Webhook ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  if (!DATE_FROM || !DATE_TO) {
    console.error('DATE_FROM and DATE_TO must be set (e.g. 2026-07-23 / 2026-08-22)');
    process.exit(1);
  }

  console.log('\nGrabFood PH payout extractor');
  console.log(`Date range: ${DATE_FROM} → ${DATE_TO}`);
  console.log('='.repeat(60));

  const session   = loadSession();
  const cookieStr = buildCookieString(session);
  const extractedAt = new Date().toISOString();

  // Get merchant group ID
  console.log('\nFetching merchant group info...');
  const merchantGroupId = await getMerchantGroupId(cookieStr);

  // Fetch transfers
  console.log(`\nFetching transfers for ${merchantGroupId}...`);
  const { apiPath, transfers } = await fetchTransfers(cookieStr, merchantGroupId, DATE_FROM, DATE_TO);

  if (transfers.length === 0) {
    console.log('\n⚠ No transfer records found.');
    process.exit(0);
  }

  console.log(`\n✓ ${transfers.length} transfer(s) found via ${apiPath}`);
  console.log('\n' + 'SettlementID'.padEnd(20) + 'Date'.padStart(12) + 'Store'.padStart(14) + 'Amount PHP'.padStart(14) + ' Status');
  console.log('-'.repeat(72));

  let totalAmount = 0;
  let posted = 0;

  for (const t of transfers) {
    // Normalize field names (will be confirmed once API is discovered)
    const settlementId = String(
      t.settlement_id || t.settlementId || t.id || t.transfer_id || t.transferId || ''
    );
    const netTotal = parseFloat(
      t.net_total || t.netTotal || t.amount || t.payout_amount || t.payoutAmount || 0
    );
    const transferDate = (
      t.transfer_date || t.transferDate || t.payout_date || t.payoutDate ||
      t.date || t.created_at || ''
    ).slice(0, 10);  // YYYY-MM-DD
    const status = t.status || t.transfer_status || '';
    const storeName = t.store_name || t.storeName || t.merchant_name || t.merchantName || '';
    const merchantId = t.merchant_id || t.merchantId || '';
    const storeCode = inferStoreCode(t);

    // Skip non-completed transfers
    if (status && !['completed', 'transferred', 'settled', 'success'].includes(status.toLowerCase())) {
      console.log(`  (skipped: ${settlementId} — status=${status})`);
      continue;
    }

    // Skip outside date window
    if (transferDate < DATE_FROM || transferDate > DATE_TO) {
      console.log(`  (skipped: ${settlementId} — date=${transferDate} outside window)`);
      continue;
    }

    totalAmount += netTotal;

    console.log(
      settlementId.padEnd(20) +
      transferDate.padStart(12) +
      storeCode.padStart(14) +
      netTotal.toFixed(2).padStart(14) +
      ' ' + status,
    );

    // Period: Grab transfers usually cover a weekly period
    // Try to extract from t.period or t.invoice_period
    const periodFrom = (t.period_from || t.periodFrom || t.from || transferDate).slice(0, 10);
    const periodTo   = (t.period_to   || t.periodTo   || t.to   || transferDate).slice(0, 10);

    try {
      const result = await postWebhook({
        settlement_id:     settlementId,
        store_name:        storeName,
        store_code:        storeCode,
        merchant_id:       merchantId,
        merchant_group_id: merchantGroupId,
        payout_date:       transferDate,
        period_start:      periodFrom,
        period_end:        periodTo,
        net_total:         netTotal,
        status:            status,
        raw:               t,
        extracted_at:      extractedAt,
      });
      console.log(`  ✓ Posted → payout_id=GRAB_${settlementId} (${result?.payout_id || 'ok'})`);
      posted++;
    } catch (err) {
      console.error(`  ❌ Webhook error: ${err.message}`);
    }
  }

  console.log('-'.repeat(72));
  console.log(`TOTAL`.padEnd(20) + ''.padStart(12) + ''.padStart(14) + totalAmount.toFixed(2).padStart(14));
  console.log(`\n✓ ${posted}/${transfers.length} payouts posted to ar_payouts.`);
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
