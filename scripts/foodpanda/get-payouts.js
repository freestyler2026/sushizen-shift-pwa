/**
 * FoodPanda Manila — actual payout extractor (Playwright + response interception)
 *
 * Uses saved Playwright session to load the Finance page and capture
 * ListPayouts GraphQL response bodies via network-level interception
 * (bypasses PerimeterX in-page fetch wrapper).
 *
 * Flow:
 *   1. Load saved session (b64 from env var or local file)
 *   2. Launch Playwright headless, navigate to /finance
 *   3. Portal auto-refreshes auth and calls ListPayouts
 *   4. Capture ListPayouts response via context.on('response', ...)
 *   5. POST each payout record to WEBHOOK_URL
 *
 * Session management:
 *   - Local dev:  scripts/foodpanda/{LOCATION}-session.b64.txt
 *   - GitHub CI:  FP_SESSION_PARANAQUE / FP_SESSION_TAFT / FP_SESSION_QC env var (base64)
 *   - If portal redirects to /login → session expired → script exits 1
 *   - Re-run setup-session.js to refresh
 *
 * Usage (local):
 *   DATE_FROM=2026-07-23 DATE_TO=2026-08-22 \
 *   WEBHOOK_URL=https://sushizen-shift-app-038d846023bc.herokuapp.com \
 *   node scripts/foodpanda/get-payouts.js paranaque
 *
 * Usage (CI — all env vars from GitHub Secrets):
 *   FP_SESSION_PARANAQUE=<base64> DATE_FROM=2026-07-23 DATE_TO=2026-08-22 \
 *   WEBHOOK_URL=https://... node scripts/foodpanda/get-payouts.js paranaque
 */

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// Decode a session b64 — handles both plain JSON and gzip-compressed JSON.
function decodeSession(b64) {
  const buf = Buffer.from(b64.trim(), 'base64');
  const raw = (buf[0] === 0x1f && buf[1] === 0x8b)
    ? zlib.gunzipSync(buf).toString('utf8')
    : buf.toString('utf8');
  return JSON.parse(raw);
}

/**
 * One page of ListPayouts, run inside the browser so the session cookies apply.
 * pageSize is the portal's own 20; nextPageToken walks the rest.
 */
async function fetchPayoutsPage(page, { accounts, startDate, endDate, globalEntityId, pageToken }) {
  return page.evaluate(async ({ accounts, startDate, endDate, globalEntityId, pageToken }) => {
    const pagination = pageToken ? { pageSize: 20, pageToken } : { pageSize: 20 };
    try {
      const resp = await fetch('https://vagw-api.ap.prd.portal.restaurant/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          operationName: 'ListPayouts',
          variables: { params: { startDate, endDate, filter: {}, pagination, globalEntityId, accounts } },
          query: `query ListPayouts($params: ListPayoutsRequest!) {
  finances {
    listPayouts(input: $params) {
      nextPageToken
      payouts {
        payoutId payoutAmount payoutCurrency payoutOrders at status
        payoutAccount { grid billingParentId chainId __typename }
        invoices {
          invoiceId invoiceAmount invoiceCurrency invoiceOrders processedDate
          period { from to __typename }
          __typename
        }
        __typename
      }
      __typename
    }
  }
}`,
        }),
      });
      return { status: resp.status, text: await resp.text() };
    } catch (e) {
      return { status: 0, text: e.message };
    }
  }, { accounts, startDate, endDate, globalEntityId, pageToken });
}

const LOCATION = process.argv[2] || 'paranaque';

const ACCOUNTS = {
  paranaque: {
    sessionEnvVar: 'FP_SESSION_PARANAQUE',
    sessionFile:   path.join(__dirname, 'paranaque-session.b64.txt'),
    storeName:     'Sushi Zen - Paranaque',
    storeCode:     'FP_PARANAQUE',
    globalEntityId: 'FP_PH',
    // Grids known for this account (from setup-session.js discovery 2026-08-22)
    grids: ['HPSBLI', 'HP6SJW'],
    gridToStore: {
      'HP6SJW': 'FP_PARANAQUE',
      'HPSBLI': 'FP_PARANAQUE_SBLI',
    },
  },
  taft: {
    sessionEnvVar: 'FP_SESSION_TAFT',
    sessionFile:   path.join(__dirname, 'taft-session.b64.txt'),
    storeName:     'Sushi Zen - Taft',
    storeCode:     'FP_TAFT',
    globalEntityId: 'FP_PH',
    grids: ['HPMI1R'],
    gridToStore: {
      'HPMI1R': 'FP_TAFT',
    },
  },
  qc: {
    sessionEnvVar: 'FP_SESSION_QC',
    sessionFile:   path.join(__dirname, 'qc-session.b64.txt'),
    storeName:     'Sushi Zen - Cubao',
    storeCode:     'FP_QC',
    globalEntityId: 'FP_PH',
    grids: ['HP7R23'],
    gridToStore: {
      'HP7R23': 'FP_QC',
    },
  },
};

if (!ACCOUNTS[LOCATION]) {
  console.error('Usage: node get-payouts.js paranaque|taft|qc');
  process.exit(1);
}

const DATE_FROM   = process.env.DATE_FROM;
const DATE_TO     = process.env.DATE_TO;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

if (!DATE_FROM || !DATE_TO) {
  console.error('DATE_FROM and DATE_TO must be set (e.g. 2026-07-23 / 2026-08-22)');
  process.exit(1);
}

const acct = ACCOUNTS[LOCATION];

// ── Session loader ─────────────────────────────────────────────────────────

const TMP_SESSION = path.join(__dirname, `${LOCATION}-session-tmp.json`);

function loadSession() {
  // GitHub CI: env var takes priority
  const b64Env = process.env[acct.sessionEnvVar];
  if (b64Env) {
    const data = decodeSession(b64Env);
    fs.writeFileSync(TMP_SESSION, JSON.stringify(data));
    const lsCount = (data.origins?.[0]?.localStorage || []).length;
    console.log(`✓ Session loaded from env var ${acct.sessionEnvVar} (${data.cookies?.length} cookies, ${lsCount} localStorage keys)`);
    return TMP_SESSION;
  }
  // Local dev: read from file
  if (fs.existsSync(acct.sessionFile)) {
    const b64  = fs.readFileSync(acct.sessionFile, 'utf8').trim();
    const data = decodeSession(b64);
    fs.writeFileSync(TMP_SESSION, JSON.stringify(data));
    const lsCount = (data.origins?.[0]?.localStorage || []).length;
    console.log(`✓ Session loaded from ${acct.sessionFile} (${data.cookies?.length} cookies, ${lsCount} localStorage keys)`);
    return TMP_SESSION;
  }
  console.error(`❌ No session found. Set ${acct.sessionEnvVar} env var or run setup-session.js ${LOCATION}`);
  process.exit(1);
}

// ── Webhook ────────────────────────────────────────────────────────────────

async function postWebhook(payload) {
  const endpoint = `${WEBHOOK_URL}/api/foodpanda/portal-payout-record`;
  if (!WEBHOOK_URL) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    return;
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

// ── Daily invoices (VAT plan Phase 0-3) ────────────────────────────────────
//
// Each payout lists its invoices' attachments (s3 paths of a pdf Sales Invoice
// and an xls order sheet per daily statement). The Payments page's download
// button sends them to RequestPayouts, which answers with a zip URL. The zip
// goes to the backend as is; it reads and stores the numbers
// (app/fp_invoices.py). Payouts already stored are skipped.

const REQUEST_PAYOUTS_QUERY = `query RequestPayouts($params: DownloadPayoutsRequest!) {
  finances {
    downloadPayouts(input: $params) {
      downloadUrl
      __typename
    }
    __typename
  }
}`;

async function knownInvoicePayouts(ids) {
  if (!WEBHOOK_URL || ids.length === 0) return new Set();
  try {
    const r = await fetch(`${WEBHOOK_URL}/api/foodpanda/invoice-archive/known`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payout_ids: ids }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return new Set();
    return new Set((await r.json()).known || []);
  } catch (_) {
    return new Set();          // unknown -> download again; storing is idempotent
  }
}

async function fetchInvoiceArchives(context, listReq, payouts, acct) {
  const inWindow = payouts.filter(p => (p.at || '') >= DATE_FROM && (p.at || '') <= DATE_TO);
  const withFiles = inWindow.filter(p =>
    (p.invoices || []).some(inv => (inv.invoiceAttachments || []).length > 0));
  const known = await knownInvoicePayouts(withFiles.map(p => String(p.payoutId)));
  const todo = withFiles.filter(p => !known.has(String(p.payoutId)));
  console.log(`\nInvoices: ${withFiles.length} payout(s) with files, ${known.size} already stored, ${todo.length} to fetch`);
  if (!WEBHOOK_URL) {
    console.log('  (WEBHOOK_URL not set — not downloading)');
    return { ok: 0, failed: 0 };
  }
  let ok = 0, failed = 0;
  for (const p of todo) {
    const payoutId = String(p.payoutId);
    const attachments = (p.invoices || []).flatMap(inv => inv.invoiceAttachments || []);
    const a = p.payoutAccount || {};
    const storeCode = acct.gridToStore[a.grid] || acct.storeCode;
    try {
      const resp = await context.request.post(listReq.url, {
        headers: listReq.headers,
        data: JSON.stringify({
          operationName: 'RequestPayouts',
          query: REQUEST_PAYOUTS_QUERY,
          variables: { params: {
            payoutId,
            paymentDateLocal: p.at,
            attachments,
            globalEntityId: acct.globalEntityId,
            accounts: [{ grid: a.grid || '', billingParentId: a.billingParentId || '', chainId: a.chainId || '' }],
          } },
        }),
        timeout: 30_000,
      });
      const url = (await resp.json())?.data?.finances?.downloadPayouts?.downloadUrl;
      if (!url) throw new Error(`no download URL (HTTP ${resp.status()})`);
      // The zip host wants the portal's auth headers, not just its cookies
      // (cookies alone -> 401). Body headers are dropped: this is a GET.
      const authHeaders = Object.fromEntries(Object.entries(listReq.headers)
        .filter(([k]) => !/^(content-type|content-length|accept-encoding|host)$/i.test(k)));
      const zip = await context.request.get(url, { headers: authHeaders, timeout: 60_000 });
      if (!zip.ok()) throw new Error(`zip HTTP ${zip.status()}`);
      const buf = await zip.body();
      const post = await fetch(`${WEBHOOK_URL}/api/foodpanda/invoice-archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_code: storeCode, payout_id: payoutId, payment_date: p.at,
                               zip_b64: buf.toString('base64') }),
        signal: AbortSignal.timeout(60_000),
      });
      const j = await post.json().catch(() => ({}));
      if (!post.ok) throw new Error(`store HTTP ${post.status}: ${JSON.stringify(j).slice(0, 200)}`);
      const sts = j.statements || [];
      const bad = sts.filter(x => x.error || x.issued_to_us === false || (x.vat_diff_vs_orders && x.vat_diff_vs_orders !== '0.00'));
      console.log(`  ✓ ${payoutId} ${p.at} ${storeCode}: ${sts.length} statement(s), `
        + sts.map(x => `${x.kind || '?'} VAT ${x.vat_amount ?? '-'}`).join(', '));
      for (const x of bad) console.log(`    ⚠ ${x.file}: ${JSON.stringify(x)}`);
      if (bad.length) failed++; else ok++;
    } catch (err) {
      failed++;
      console.error(`  ❌ invoices for ${payoutId}: ${err.message}`);
    }
  }
  return { ok, failed };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nFoodPanda PH payout extractor — ${LOCATION.toUpperCase()}`);
  console.log(`Date range: ${DATE_FROM} → ${DATE_TO}`);
  console.log('='.repeat(60));

  const sessionPath = loadSession();
  const extractedAt = new Date().toISOString();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: sessionPath,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  });

  const allPayouts = [];
  // The page's own ListPayouts request, kept so we can re-issue it over the
  // period we want. It cannot be rebuilt from scratch — it carries auth headers
  // the portal adds — and calling the endpoint from page.evaluate is refused as
  // cross-origin. Playwright's request API is not subject to that.
  let listReq = null;

  // Capture ListPayouts response via network-level interception (bypasses PX)
  context.on('response', async resp => {
    const url = resp.url();
    if (!url.includes('vagw-api')) return;
    const req = resp.request();
    const postData = req.postData() || '';
    if (!postData.includes('ListPayouts')) return;
    listReq = { url, headers: req.headers(), postData };
    try {
      const body = await resp.text();
      const json = JSON.parse(body);
      const payouts = json?.data?.finances?.listPayouts?.payouts || [];
      const httpStatus = typeof resp.status === 'function' ? resp.status() : resp.status;
      console.log(`  [ListPayouts] HTTP ${httpStatus} — ${payouts.length} payout(s)`);
      allPayouts.push(...payouts);
    } catch (err) {
      console.error(`  [ListPayouts] parse error: ${err.message}`);
    }
  });

  const page = await context.newPage();

  // Navigate to /finance — portal triggers ListPayouts automatically
  console.log('\nLoading Finance page (headless)...');
  try {
    await page.goto('https://partner.foodpanda.com/finance', {
      waitUntil: 'networkidle',
      timeout:   30_000,
    });
  } catch (_) {}

  const finalUrl = page.url();
  console.log(`Landed: ${finalUrl.slice(0, 80)}`);

  // Session expired check
  if (finalUrl.includes('/login') || finalUrl.includes('/signin')) {
    await browser.close();
    try { fs.unlinkSync(TMP_SESSION); } catch (_) {}
    console.error(`\n❌ Session expired — re-run: node scripts/foodpanda/setup-session.js ${LOCATION}`);
    process.exit(1);
  }

  // Allow extra time for deferred API calls
  await page.waitForTimeout(5000);

  // Fallback: if portal didn't auto-trigger ListPayouts (e.g. PerimeterX blocked JS on CI),
  // call the GraphQL API directly from within the browser context (cookies are already set).
  // The portal asks for its own default window, so what it fetches ignores
  // DATE_FROM/DATE_TO — five payouts per store whatever range is requested.
  // Re-issue its request over the period we want. Playwright's request API
  // sends it outside the page, so the cross-origin refusal that blocks
  // page.evaluate does not apply, and nextPageToken walks the rest.
  if (listReq) {
    console.log(`  Re-requesting payouts for ${DATE_FROM} → ${DATE_TO}...`);
    let body;
    try {
      body = JSON.parse(listReq.postData);
    } catch (err) {
      console.warn(`  ⚠ Could not read the captured request: ${err.message}`);
      body = null;
    }

    if (body?.variables?.params) {
      const fetched = [];
      let pageToken = '';

      for (let pageNo = 0; pageNo < 60; pageNo++) {
        body.variables.params.startDate = DATE_FROM;
        body.variables.params.endDate   = DATE_TO;
        body.variables.params.pagination = pageToken
          ? { pageSize: 50, pageToken }
          : { pageSize: 50 };

        let json;
        try {
          const resp = await context.request.post(listReq.url, {
            headers: listReq.headers,
            data:    JSON.stringify(body),
            timeout: 30_000,
          });
          if (!resp.ok()) {
            console.warn(`  ⚠ page ${pageNo + 1}: HTTP ${resp.status()}`);
            break;
          }
          json = await resp.json();
        } catch (err) {
          console.warn(`  ⚠ page ${pageNo + 1}: ${err.message}`);
          break;
        }

        const lp = json?.data?.finances?.listPayouts;
        const payouts = lp?.payouts || [];
        fetched.push(...payouts);
        pageToken = lp?.nextPageToken || '';
        console.log(`  [API] page ${pageNo + 1}: +${payouts.length} → ${fetched.length}`);
        if (!pageToken || payouts.length === 0) break;
      }

      if (fetched.length > 0) {
        allPayouts.length = 0;
        allPayouts.push(...fetched);
      }
    }
  }

  // Invoices need the browser context (its cookies) — fetch before closing.
  let invoiceResult = { ok: 0, failed: 0 };
  if (listReq && allPayouts.length > 0) {
    invoiceResult = await fetchInvoiceArchives(context, listReq, allPayouts, acct);
  }

  await browser.close();
  try { fs.unlinkSync(TMP_SESSION); } catch (_) {}

  if (allPayouts.length === 0) {
    // Exiting 0 here made the daily job report success while importing nothing,
    // which is how the scheduled run went unnoticed. An empty capture is a
    // failure: say so and let the run go red.
    console.error('\n\u274c No payouts captured. Portal may not have called ListPayouts and fallback also failed.');
    console.error('  Possible causes: session expired, anti-bot block on CI, portal layout change.');
    process.exit(1);
  }

  console.log(`\n✓ Total payouts captured: ${allPayouts.length}`);
  console.log('\n' + 'PayoutID'.padEnd(18) + 'Date'.padStart(12) + 'Grid'.padStart(10) + 'Amount PHP'.padStart(14) + 'Orders'.padStart(8) + ' Status');
  console.log('-'.repeat(70));

  let totalAmount = 0;
  let totalOrders = 0;
  let posted = 0;

  for (const p of allPayouts) {
    const payoutId    = String(p.payoutId || '');
    const payoutDate  = p.at || '';
    const amount      = parseFloat(p.payoutAmount || 0);
    const orders      = parseInt(p.payoutOrders || 0, 10);
    const status      = p.status || '';
    const grid        = p.payoutAccount?.grid || 'UNKNOWN';
    const storeCode   = acct.gridToStore[grid] || acct.storeCode;

    totalAmount += amount;
    totalOrders += orders;

    console.log(
      payoutId.padEnd(18) +
      payoutDate.padStart(12) +
      grid.padStart(10) +
      amount.toFixed(2).padStart(14) +
      String(orders).padStart(8) +
      ' ' + status,
    );

    // Skip payouts outside our date window (portal returns rolling 30 days)
    if (payoutDate < DATE_FROM || payoutDate > DATE_TO) {
      console.log(`  (skipped — ${payoutDate} outside ${DATE_FROM}→${DATE_TO})`);
      continue;
    }

    // Compute period covered by invoices in this payout
    let periodStart = payoutDate;
    let periodEnd   = payoutDate;
    for (const inv of (p.invoices || [])) {
      if (inv?.period?.from && inv.period.from < periodStart) periodStart = inv.period.from;
      if (inv?.period?.to   && inv.period.to   > periodEnd)   periodEnd   = inv.period.to;
    }

    try {
      const result = await postWebhook({
        payout_id:        `FP_${payoutId}`,       // explicit ID — actual FP payout ID
        vendor_id:        grid,
        vendor_name:      acct.storeName,
        store_code:       storeCode,
        period_start:     periodStart,
        period_end:       periodEnd,
        total_payout_php: amount,
        orders_count:     orders,
        raw: {
          payoutId,
          status,
          payoutCurrency: p.payoutCurrency,
          payoutDate,
          grid,
          globalEntityId: acct.globalEntityId,
          invoiceCount:   (p.invoices || []).length,
        },
        extracted_at: extractedAt,
      });
      console.log(`  ✓ Posted → payout_id=FP_${payoutId} (${result?.payout_id || 'ok'})`);
      posted++;
    } catch (err) {
      console.error(`  ❌ Webhook error: ${err.message}`);
    }
  }

  console.log('-'.repeat(70));
  console.log(
    'TOTAL'.padEnd(18) +
    ''.padStart(12) +
    ''.padStart(10) +
    totalAmount.toFixed(2).padStart(14) +
    String(totalOrders).padStart(8),
  );
  console.log(`\n✓ ${posted}/${allPayouts.length} payouts posted to ar_payouts.`);
  console.log(`✓ invoices: ${invoiceResult.ok} payout(s) stored, ${invoiceResult.failed} with a problem.`);
  // A failed or unbalanced invoice must not look like a green run (lesson 47).
  if (invoiceResult.failed > 0) process.exitCode = 1;
  console.log('  Amount = net payout deposited to bank (post-commission).');
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
