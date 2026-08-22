#!/usr/bin/env node
/**
 * Noon Food Dubai — Biweekly Payout Extractor
 *
 * Flow:
 *   1. Firefox (required — Chromium fails Noon's HTTP/2 checks) logs in via the
 *      embedded iframe at restaurant.noon.partners/public/login/
 *   2. For each restaurant brand, navigates to /restaurant/<brandCode>/payment/
 *      and fetches POST /_food-restaurant/finance/wallet {"entryType":"payment"}
 *   3. Each "payment" wallet line = one biweekly settlement payout to the restaurant
 *   4. New payouts are POSTed to /api/noon/portal-payout-record (backend deduplicates
 *      by payout_id = Noon's referenceNr)
 *
 * Restaurant brands tracked (all under partner 108431 / PRJ108431):
 *   Sushi ZEN   R5346332756132073257580964A   NOON_SZ
 *   Ramen ZEN   R7226482692501293869409357A   NOON_RZ
 *
 * Settlement cycle: biweekly (~14 days)
 *
 * Usage (local):
 *   node scripts/noon/get-payouts.js
 *   NOON_BACKFILL=1 node scripts/noon/get-payouts.js
 *   NOON_SINCE=2026-01-01 node scripts/noon/get-payouts.js
 *
 * Usage (CI):
 *   NOON_USERNAME=... NOON_PASSWORD=... WEBHOOK_URL=... node scripts/noon/get-payouts.js
 */

'use strict';
const { firefox } = require('playwright');

const USERNAME    = process.env.NOON_USERNAME || 'sushi@p108431';
const PASSWORD    = process.env.NOON_PASSWORD || 'noonfood123';
const WEBHOOK_URL = (process.env.WEBHOOK_URL || '').replace(/\/$/, '');
const BACKFILL    = process.env.NOON_BACKFILL === '1';
const SINCE       = process.env.NOON_SINCE || null; // ISO date string, e.g. "2026-01-01"

// Restaurant brands to track under partner 108431
const RESTAURANTS = [
  {
    name:      'Sushi ZEN',
    brandCode: 'R5346332756132073257580964A',
    storeCode: 'NOON_SZ',
    storeName: 'Sushi ZEN Dubai (Noon)',
    brand:     'sushi_zen',
  },
  {
    name:      'Ramen ZEN',
    brandCode: 'R7226482692501293869409357A',
    storeCode: 'NOON_RZ',
    storeName: 'Ramen ZEN Dubai (Noon)',
    brand:     'ramen_zen',
  },
];

// ─── Date helpers ─────────────────────────────────────────────────────────────

function cutoffDate() {
  if (BACKFILL) return '2020-01-01';
  if (SINCE) return SINCE;
  // Default: look back 60 days to catch any biweekly settlement since last run
  const d = new Date();
  d.setDate(d.getDate() - 60);
  return d.toISOString().slice(0, 10);
}

function periodMonth(dateStr) { // "2026-08-19" → "2026-08"
  return dateStr.slice(0, 7);
}

// ─── Login ────────────────────────────────────────────────────────────────────

async function login(browser) {
  const ctx  = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
  });
  const page = await ctx.newPage();

  await page.goto('https://restaurant.noon.partners/public/login/', {
    waitUntil: 'load',
    timeout: 30_000,
  });
  await page.waitForTimeout(3000);

  const loginFrame = page.frames().find(f => f.url().includes('login-webview-embed'));
  if (!loginFrame) throw new Error('Login iframe not found — page structure may have changed');

  await loginFrame.waitForSelector('input[name="channelIdentifier"]', { timeout: 10_000 });
  await loginFrame.fill('input[name="channelIdentifier"]', USERNAME);
  await loginFrame.click('button[type="submit"]');
  await page.waitForTimeout(6000); // wait for password step

  const pwdInput = await loginFrame.$('input[type="password"]');
  if (!pwdInput) {
    const body = await loginFrame.evaluate(() => document.body?.innerText?.substring(0, 300));
    throw new Error(`Password step not reached. Frame: ${body}`);
  }

  await loginFrame.fill('input[type="password"]', PASSWORD);
  await loginFrame.click('button[type="submit"]');

  // Wait for redirect to the restaurant dashboard
  await page.waitForURL(/\/restaurant\//, { timeout: 30_000 });
  console.log('✓ Logged in to restaurant.noon.partners');

  await page.waitForTimeout(3000);
  return { ctx, page };
}

// ─── Fetch wallet for one restaurant brand ────────────────────────────────────

async function fetchWallet(page, brandCode) {
  // Navigate to the payment page for this brand (the URL context is how the server
  // knows which restaurant's wallet to return — the brand code is in the URL path)
  await page.goto(
    `https://restaurant.noon.partners/restaurant/${brandCode}/payment/?project=PRJ108431`,
    { waitUntil: 'domcontentloaded', timeout: 20_000 },
  );
  await page.waitForTimeout(4000);

  const result = await page.evaluate(async () => {
    const r = await fetch('/_food-restaurant/finance/wallet', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ entryType: 'payment' }),
    });
    try { return await r.json(); } catch(e) { return { _fetchError: await r.text() }; }
  });

  if (result?._fetchError) throw new Error(`Wallet fetch error: ${result._fetchError}`);
  if (result?.status !== 'success') throw new Error(`Wallet API: ${JSON.stringify(result).substring(0, 200)}`);
  return result.data?.lines || [];
}

// ─── Post to backend ──────────────────────────────────────────────────────────

async function postPayout(payload) {
  if (!WEBHOOK_URL) {
    console.log(`  DRY: ${payload.payout_id} — ${payload.payout_aed.toFixed(2)} AED (${payload.period_start}→${payload.period_end})`);
    return { inserted: true, dry: true };
  }
  const url = `${WEBHOOK_URL}/api/noon/portal-payout-record`;
  const res  = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Backend ${res.status}: ${text.substring(0, 200)}`);
  }
  return res.json();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const since = cutoffDate();
  console.log(`Noon payout extractor — since: ${since} | backfill: ${BACKFILL}`);

  const browser = await firefox.launch({ headless: true });

  let totalPosted  = 0;
  let totalSkipped = 0;
  let totalErrors  = 0;

  try {
    const { ctx, page } = await login(browser);

    for (const rest of RESTAURANTS) {
      console.log(`\n── ${rest.name} (${rest.brandCode}) ──`);

      let lines;
      try {
        lines = await fetchWallet(page, rest.brandCode);
      } catch (err) {
        console.error(`  ✗ Wallet fetch failed: ${err.message}`);
        totalErrors++;
        continue;
      }

      console.log(`  ${lines.length} total payment lines in wallet`);

      // Filter to the requested date window
      const newLines = lines.filter(l => l.date >= since);
      console.log(`  ${newLines.length} lines since ${since}`);

      for (const line of newLines) {
        // amount is negative (outflow from Noon to restaurant) → payout_aed = abs(amount)
        const payoutAed = Math.abs(line.amount);
        if (payoutAed === 0) { totalSkipped++; continue; }

        const payoutId = line.referenceNr; // e.g. "bt_2623101044515007"

        const payload = {
          payout_id:     payoutId,
          store_code:    rest.storeCode,
          store_name:    rest.storeName,
          brand:         rest.brand,
          period_month:  periodMonth(line.periodEnd || line.date),
          period_start:  line.periodStart || line.date,
          period_end:    line.periodEnd   || line.date,
          payout_aed:    Math.round(payoutAed * 100) / 100,
          extracted_at:  new Date().toISOString(),
        };

        try {
          const resp = await postPayout(payload);
          if (resp.dry) {
            totalPosted++;
          } else if (resp.inserted) {
            console.log(`  ✓ Inserted ${payoutId}: ${payoutAed.toFixed(2)} AED (${line.periodStart}→${line.periodEnd})`);
            totalPosted++;
          } else {
            console.log(`  ─ Already exists: ${payoutId}`);
            totalSkipped++;
          }
        } catch (err) {
          console.error(`  ✗ ${payoutId}: ${err.message}`);
          totalErrors++;
        }
      }
    }

    await ctx.close();
  } finally {
    await browser.close();
  }

  console.log(`\n─── Done: ${totalPosted} posted/dry, ${totalSkipped} skipped, ${totalErrors} errors ───`);
  if (totalErrors > 0) process.exit(1);
})();
