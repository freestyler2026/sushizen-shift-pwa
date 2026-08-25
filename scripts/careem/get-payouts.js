/**
 * Careem Dubai — daily balance snapshot extractor (Playwright + page.evaluate)
 *
 * Careem Dubai does NOT expose per-day settlement records via API.
 * The Finance > Finances page calls /billing/billingAccounts/earnings which
 * returns the current accumulated balance per merchant (what Careem owes us
 * since the last bank transfer).
 *
 * This script uses Playwright to warm up the session (Cloudflare + session cookie),
 * then calls the API from within the page context via page.evaluate().
 * Balance drops of >500 AED vs previous day (tracked in backend) indicate a bank transfer.
 *
 * APIs used (discovered 2026-08-22):
 *   GET /api/saturn-ext/v1/billing/billingAccounts/earnings
 *   → accountBalances[]: { billableId, billableType, balance: { amount, currency } }
 *
 * Usage (local):
 *   WEBHOOK_URL=https://sushizen-shift-app-038d846023bc.herokuapp.com \
 *   SESSION_PATH=scripts/careem/careem-session.b64.txt \
 *   node scripts/careem/get-payouts.js
 *
 * Usage (CI):
 *   CAREEM_SESSION=<base64> WEBHOOK_URL=... node scripts/careem/get-payouts.js
 */

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const WEBHOOK_URL = process.env.WEBHOOK_URL;

// Merchant ID → store info (discovered 2026-08-22 via /admin/merchants + billingAccounts/earnings)
const MERCHANT_MAP = {
  // Sushi ZEN (brand 1024854)
  1054427: { code: 'CAREEM_SZ_BB',  name: 'Sushi ZEN Business Bay',    brand: 'sushi_zen' },
  1054428: { code: 'CAREEM_SZ_JLT', name: 'Sushi ZEN JLT',             brand: 'sushi_zen' },
  1058443: { code: 'CAREEM_SZ_ABS', name: 'Sushi ZEN Al Barsha South', brand: 'sushi_zen' },
  1061197: { code: 'CAREEM_SZ_ALJ', name: 'Sushi ZEN Al Jaffiliya',    brand: 'sushi_zen' },
  1067896: { code: 'CAREEM_SZ_AB3', name: 'Sushi ZEN Al Barsha 3',     brand: 'sushi_zen' },
  // Ramen Zen (brand 1031901)
  1073590: { code: 'CAREEM_RZ_BB',  name: 'Ramen Zen Business Bay',    brand: 'ramen_zen' },
  1073594: { code: 'CAREEM_RZ_ABS', name: 'Ramen Zen Al Barsha South', brand: 'ramen_zen' },
  1073596: { code: 'CAREEM_RZ_JLT', name: 'Ramen Zen JLT',             brand: 'ramen_zen' },
  1074763: { code: 'CAREEM_RZ_ALJ', name: 'Ramen Zen Al Jaffiliya',    brand: 'ramen_zen' },
  // J Deli (brand 1031902)
  1073595: { code: 'CAREEM_JD_JLT', name: 'J Deli JLT',               brand: 'j_deli' },
  1074759: { code: 'CAREEM_JD_ALJ', name: 'J Deli Al Jaffiliya',       brand: 'j_deli' },
  // All Veggie Sushi (brand 1033012)
  1076301: { code: 'CAREEM_AVS_AB3', name: 'All Veggie Sushi Al Barsha 3', brand: 'all_veggie_sushi' },
};

// ── Session loading ─────────────────────────────────────────────────────────

function loadSession() {
  const b64Env = process.env.CAREEM_SESSION;
  if (b64Env) {
    const buf = Buffer.from(b64Env.trim(), 'base64');
    const raw = (buf[0] === 0x1f && buf[1] === 0x8b)
      ? zlib.gunzipSync(buf).toString('utf8')
      : buf.toString('utf8');
    const data = JSON.parse(raw);
    console.log(`✓ Session from CAREEM_SESSION (${data.cookies?.length} cookies)`);
    return data;
  }
  const filePath = process.env.SESSION_PATH ||
                   path.join(__dirname, 'careem-session.b64.txt');
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    const buf = Buffer.from(raw, 'base64');
    const json = (buf[0] === 0x1f && buf[1] === 0x8b)
      ? zlib.gunzipSync(buf).toString('utf8')
      : buf.toString('utf8');
    const data = JSON.parse(json);
    console.log(`✓ Session from ${filePath} (${data.cookies?.length} cookies)`);
    return data;
  }
  console.error('❌ No session. Set CAREEM_SESSION or run: node scripts/careem/setup-session.js');
  process.exit(1);
}

// ── Webhook ─────────────────────────────────────────────────────────────────

async function postWebhook(payload, route = '/api/careem/portal-balance-snapshot') {
  const endpoint = `${WEBHOOK_URL}${route}`;
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

// ── GST date (UTC+4) ────────────────────────────────────────────────────────

function gstDateToday() {
  const d = new Date();
  d.setTime(d.getTime() + 4 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

// ── Save refreshed session ──────────────────────────────────────────────────

async function saveRefreshedSession(context) {
  try {
    const state = await context.storageState();
    const outB64 = path.join(__dirname, 'careem-session.b64.txt');
    const json   = JSON.stringify(state);
    const gzipB64 = zlib.gzipSync(Buffer.from(json), { level: 9 }).toString('base64');
    fs.writeFileSync(outB64, gzipB64);
    console.log(`✓ Refreshed session saved → ${outB64} (${state.cookies?.length} cookies)`);
  } catch (err) {
    console.warn(`  ⚠ Could not save refreshed session: ${err.message}`);
  }
}

// ── Cycle summaries (Payment Summary data) ──────────────────────────────────

function mergeCycles(into, rows) {
  const seen = new Set(into.map(c => c.id));
  for (const r of rows) if (!seen.has(r.id)) { into.push(r); seen.add(r.id); }
}

/**
 * Re-issue the portal's own cycleSummaries request over the period we want.
 *
 * We cannot build this request from scratch: it needs the bearer token and the
 * full billingAccounts list, and a bare POST is rejected with 403.  So we take
 * the request the page just made — which defaults to the last 7 days and is
 * therefore usually empty — and swap in our own dates and page size.
 */
function dateWindows(fromDate, toDate, maxDays) {
  const out = [];
  let cur = Date.parse(`${fromDate}T00:00:00Z`);
  const end = Date.parse(`${toDate}T00:00:00Z`);
  while (cur <= end) {
    const stop = Math.min(cur + (maxDays - 1) * 86400_000, end);
    out.push([new Date(cur).toISOString().slice(0, 10),
              new Date(stop).toISOString().slice(0, 10)]);
    cur = stop + 86400_000;
  }
  return out;
}

async function fetchCycles(context, req, fromDate, toDate) {
  // Two limits, both found by trying: a page size over ~100 is rejected with
  // HTTP 400, and paginationInfo.totalRecords disagrees with itself between
  // page sizes (20 reports 21 records where 100 returns 60), so it cannot be
  // trusted to say when to stop. Read pages until one comes back short.
  const WINDOW_DAYS = 31;
  const PAGE_SIZE   = 100;

  let template;
  try {
    template = JSON.parse(req.postData || '{}');
  } catch (_) {
    console.warn('  ⚠ Could not read the captured request body — skipping cycles');
    return [];
  }

  const all = [];
  for (const [winFrom, winTo] of dateWindows(fromDate, toDate, WINDOW_DAYS)) {
    const body = { ...template, pageSize: PAGE_SIZE,
                   startDate: `${winFrom}T00:00:00`, endDate: `${winTo}T23:59:59` };
    const before = all.length;

    for (let pageNumber = 0; pageNumber < 20; pageNumber++) {
      body.pageNumber = pageNumber;
      let data;
      try {
        const resp = await context.request.fetch(req.url, {
          method: req.method, headers: req.headers,
          data: JSON.stringify(body), timeout: 30_000,
        });
        if (!resp.ok()) {
          const detail = await resp.text().catch(() => '');
          console.warn(`  ⚠ ${winFrom}~${winTo} page ${pageNumber}: HTTP ${resp.status()} ${detail.slice(0, 200)}`);
          break;
        }
        data = await resp.json();
      } catch (err) {
        console.warn(`  ⚠ ${winFrom}~${winTo} page ${pageNumber}: ${err.message}`);
        break;
      }

      const rows = data?.cycleSummaries || [];
      mergeCycles(all, rows);
      if (rows.length < PAGE_SIZE) break;   // short page — nothing left
    }
    console.log(`  ${winFrom} ~ ${winTo}: ${all.length - before} cycles`);
  }
  return all;
}

async function postCycles(cycles, extractedAt) {
  const payload = { extracted_at: extractedAt, cycles: [] };
  let unmapped = 0;

  for (const c of cycles) {
    const info = MERCHANT_MAP[c.billableId];
    if (!info) { unmapped++; continue; }
    payload.cycles.push({
      outlet_id:   String(c.billableId),
      store_code:  info.code,
      brand:       info.brand,
      cycle_start: String(c.startDate).slice(0, 10),
      cycle_end:   String(c.endDate).slice(0, 10),
      net_payout:  Math.round((c.cycleBalance || 0) * 100) / 100,
      currency:    c.currency || 'AED',
      status:      c.status,
      cycle_id:    c.id,
      settled_at:  c.updatedAt || null,
    });
  }

  if (payload.cycles.length === 0) {
    console.log('  (no mapped cycles to post)');
    return;
  }

  console.log('\n' + 'Store'.padEnd(20) + 'Period'.padEnd(26) + 'Net Payout'.padStart(12));
  console.log('-'.repeat(60));
  for (const c of payload.cycles) {
    console.log(c.store_code.padEnd(20) +
                `${c.cycle_start}~${c.cycle_end}`.padEnd(26) +
                c.net_payout.toFixed(2).padStart(12));
  }
  console.log('-'.repeat(60));

  try {
    const res = await postWebhook(payload, '/api/careem/portal-cycle-payouts');
    console.log(`✓ ${res.written ?? payload.cycles.length} cycle payouts posted` +
                (res.skipped ? `, ${res.skipped} skipped` : ''));
  } catch (err) {
    console.error(`  ❌ Cycle webhook error: ${err.message}`);
  }
  if (unmapped > 0) console.log(`  ${unmapped} cycles for merchants not in MERCHANT_MAP (skipped)`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\nCareem Dubai payout extractor (cycle payouts + balance snapshots)');
  console.log('='.repeat(60));

  const sessionData  = loadSession();
  const snapshotDate = process.env.SNAPSHOT_DATE || gstDateToday();
  const extractedAt  = new Date().toISOString();

  // Cycles close weekly, so a run only has to look back far enough to cover any
  // it has not seen yet; the upsert makes re-reading old ones harmless.
  const cycleTo   = process.env.CYCLE_TO   || snapshotDate;
  const cycleFrom = process.env.CYCLE_FROM ||
    new Date(Date.parse(`${cycleTo}T00:00:00Z`) - 60 * 86400_000).toISOString().slice(0, 10);

  // Write session to temp file for Playwright storageState
  const tmpSession = path.join(__dirname, 'careem-session-tmp.json');
  fs.writeFileSync(tmpSession, JSON.stringify(sessionData));

  console.log(`\nSnapshot date (GST): ${snapshotDate}`);

  const browser = await chromium.launch({ headless: true });
  const context  = await browser.newContext({ storageState: tmpSession });
  const page     = await context.newPage();

  // Intercept the billingAccounts/earnings response that the page makes on load
  let earningsData = null;

  // The Finances page also loads /billing/cycleSummaries/list on its own — the
  // same data it renders as the "Payment Summary" PDF.  We keep the request
  // itself so we can replay it for the remaining pages rather than guessing
  // what its pagination parameters are called.
  let cycleReq = null;

  context.on('response', async resp => {
    const url = resp.url();

    if (url.includes('/billing/billingAccounts/earnings')) {
      try {
        const body = await resp.text();
        if (resp.status() === 200 && body) {
          earningsData = JSON.parse(body);
          console.log(`  ✓ Intercepted billingAccounts/earnings (HTTP ${resp.status()})`);
        } else {
          console.log(`  ⚠ billingAccounts/earnings returned HTTP ${resp.status()}`);
        }
      } catch (_) {}
      return;
    }

    if (url.includes('/billing/cycleSummaries/list')) {
      // Keep the request even when it returns nothing: the portal defaults to
      // the last 7 days, which is usually empty, but the request carries the
      // bearer token and the full billingAccounts list we need to ask again
      // over the period we actually want.
      try {
        if (resp.status() !== 200) return;
        const req = resp.request();
        cycleReq = { url, method: req.method(), postData: req.postData(), headers: req.headers() };
        const rows = (JSON.parse(await resp.text())?.cycleSummaries) || [];
        console.log(`  ✓ Captured cycleSummaries request (page returned ${rows.length} rows)`);
      } catch (_) {}
    }
  });

  try {
    // ── 1. Load the finances page — this auto-triggers billingAccounts/earnings ──
    console.log('\nLoading Careem Finances page (intercept mode)...');
    await page.goto('https://partners.careem.com/saturn-ext/merchant/finances', {
      waitUntil: 'networkidle',
      timeout:   45_000,
    }).catch(() => {});
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    console.log(`  Landed: ${currentUrl}`);

    if (currentUrl.includes('/login') || currentUrl.includes('/auth') || currentUrl.includes('identity.careem.com')) {
      console.error('\n❌ SESSION_EXPIRED — run: node scripts/careem/setup-session.js');
      await browser.close();
      process.exit(0);  // exit 0 so CI doesn't mark as failure
    }

    if (!earningsData) {
      // Fallback: try navigating to home first, then back to finances
      console.log('  (earnings not captured yet, trying home→finances...)');
      await page.goto('https://partners.careem.com/saturn-ext/merchant/home', {
        waitUntil: 'networkidle', timeout: 30_000,
      }).catch(() => {});
      await page.waitForTimeout(2000);
      await page.goto('https://partners.careem.com/saturn-ext/merchant/finances', {
        waitUntil: 'networkidle', timeout: 30_000,
      }).catch(() => {});
      await page.waitForTimeout(3000);
    }

    if (!earningsData) {
      console.error('\n❌ Failed to capture billingAccounts/earnings response. Session may be expired.');
      await browser.close();
      process.exit(1);
    }

    const balances = earningsData?.accountBalances || [];
    console.log(`✓ ${balances.length} account balance entries`);

    // ── 3. Filter MERCHANT entries with non-trivial balance ─────────────────
    const merchantBalances = balances.filter(b =>
      b.billableType === 'MERCHANT' &&
      Math.abs(b.balance?.amount || 0) > 0.01
    );
    console.log(`  ${merchantBalances.length} merchants with non-zero balance`);

    // ── 4. Save refreshed session before posting (in case post fails) ────────
    await saveRefreshedSession(context);

    // ── 4b. Cycle payouts — the Payment Summary figures ──────────────────────
    // Done before the balance early-exit below: a zero balance just means
    // Careem has already paid out, which is exactly when cycles matter most.
    console.log('\n' + '='.repeat(60));
    console.log(`Payment Summary cycles  ${cycleFrom} → ${cycleTo}`);

    if (!cycleReq) {
      // The request only fires once the Payment Summary tab is selected.
      try {
        await page.locator('text=Payment Summary').first().click({ timeout: 10_000 });
        await page.waitForTimeout(8000);
      } catch (_) {
        console.log('  (could not open the Payment Summary tab)');
      }
    }

    if (!cycleReq) {
      console.log('  ⚠ cycleSummaries request never fired — Payment Summary data unavailable this run');
    } else {
      const cycles = await fetchCycles(context, cycleReq, cycleFrom, cycleTo);
      console.log(`  ${cycles.length} cycles retrieved`);
      await postCycles(cycles, extractedAt);
    }
    console.log('='.repeat(60));

    if (merchantBalances.length === 0) {
      console.log('\n⚠ No non-zero merchant balances — nothing further to post.');
      await browser.close();
      try { fs.unlinkSync(tmpSession); } catch (_) {}
      process.exit(0);
    }

    // ── 5. Post each balance snapshot to backend ────────────────────────────
    console.log('\n' + 'MerchantID'.padEnd(12) + 'Store'.padEnd(35) + 'Balance AED'.padStart(12));
    console.log('-'.repeat(60));

    let posted  = 0;
    let unknown = 0;

    for (const { billableId, balance } of merchantBalances) {
      const info   = MERCHANT_MAP[billableId];
      const amtAed = Math.round((balance?.amount || 0) * 100) / 100;

      if (!info) {
        console.log(`  (${billableId})`.padEnd(12) + '(unmapped)'.padEnd(35) + amtAed.toFixed(2).padStart(12));
        unknown++;
        continue;
      }

      console.log(
        String(billableId).padEnd(12) +
        info.name.padEnd(35) +
        amtAed.toFixed(2).padStart(12)
      );

      try {
        const res = await postWebhook({
          merchant_id:   billableId,
          store_code:    info.code,
          store_name:    info.name,
          brand:         info.brand,
          balance_aed:   amtAed,
          currency:      'AED',
          snapshot_date: snapshotDate,
          extracted_at:  extractedAt,
        });

        if (res.payout_detected) {
          console.log(`  ✓ → ${info.code} | ⚡ PAYOUT DETECTED: ${res.payout_amount} AED`);
        } else {
          console.log(`  ✓ → ${info.code} | payout_id=${res.payout_id}`);
        }
        posted++;
      } catch (err) {
        console.error(`  ❌ Webhook error: ${err.message}`);
      }
    }

    console.log('-'.repeat(60));
    console.log(`✓ ${posted} balance snapshots posted.`);
    if (unknown > 0) console.log(`  ${unknown} unmapped merchant IDs (not in MERCHANT_MAP)`);
    console.log('Done.');

  } finally {
    await browser.close();
    try { fs.unlinkSync(tmpSession); } catch (_) {}
  }
}

main().catch(err => { console.error(err); process.exit(1); });
