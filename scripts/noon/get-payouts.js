#!/usr/bin/env node
/**
 * Noon Food Dubai — Biweekly Payout Extractor
 *
 * Flow:
 *   1. Load session cookies from NOON_SESSION env var (GitHub Actions) or
 *      noon-session.json (local). If neither exists, runs setup-session.js first.
 *   2. For each restaurant brand, POST /_food-restaurant/finance/wallet with
 *      Referer: https://restaurant.noon.partners/restaurant/<brandCode>/payment/
 *      — the Referer tells the server which brand's wallet to return.
 *      No browser needed; direct HTTP with session cookies suffices.
 *   3. Each "payment" wallet line = one biweekly settlement (amount is negative =
 *      outflow from Noon to restaurant → payout_aed = abs(amount)).
 *   4. New payouts are POSTed to /api/noon/portal-payout-record (backend deduplicates
 *      by payout_id = Noon referenceNr, e.g. "bt_2623101044515007").
 *
 * Session renewal: run locally when CI reports 401:
 *   node scripts/noon/setup-session.js --upload
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
 * Usage (CI — NOON_SESSION required):
 *   NOON_SESSION=<base64> WEBHOOK_URL=... node scripts/noon/get-payouts.js
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const WEBHOOK_URL = (process.env.WEBHOOK_URL || '').replace(/\/$/, '');
const BACKFILL    = process.env.NOON_BACKFILL === '1';
const SINCE       = process.env.NOON_SINCE || null;

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

// ─── Session ──────────────────────────────────────────────────────────────────

function loadSession() {
  // 1. GitHub Actions env var
  const b64 = process.env.NOON_SESSION;
  if (b64) {
    const session = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf8'));
    console.log(`✓ Session from NOON_SESSION (saved ${session.savedAt || 'unknown'})`);
    return session;
  }
  // 2. Local file
  const filePath = path.join(__dirname, 'noon-session.json');
  if (fs.existsSync(filePath)) {
    const session = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`✓ Session from ${filePath} (saved ${session.savedAt || 'unknown'})`);
    return session;
  }
  console.error('❌ No session found.');
  console.error('   Run: node scripts/noon/setup-session.js --upload');
  process.exit(1);
}

function buildCookieHeader(session) {
  const parts = [
    `_npsid=${session.npsid}`,
    `_nprtnetid=${session.nprtnetid}`,
    `npa.pjc.v1=PRJ108431`,
    `npa.au.v1=true`,
  ];
  if (session.npa_rt_v1) parts.push(`npa.rt.v1=${session.npa_rt_v1}`);
  return parts.join('; ');
}

// ─── API helpers ──────────────────────────────────────────────────────────────

const BASE = 'https://restaurant.noon.partners/_food-restaurant';

async function callFinanceWallet(brandCode, cookieHeader) {
  const referer = `https://restaurant.noon.partners/restaurant/${brandCode}/payment/?project=PRJ108431`;
  const resp = await fetch(`${BASE}/finance/wallet`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-project':    'PRJ108431',
      'x-locale':     'en-ae',
      'Cookie':       cookieHeader,
      'Referer':      referer,
      'Origin':       'https://restaurant.noon.partners',
      'User-Agent':   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
    },
    body: JSON.stringify({ entryType: 'payment' }),
  });

  if (resp.status === 401) {
    throw new Error('401 Unauthorized — session expired. Run: node scripts/noon/setup-session.js --upload');
  }
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Finance wallet ${resp.status}: ${text.substring(0, 200)}`);
  }
  const data = await resp.json();
  if (data.status !== 'success') throw new Error(`API error: ${JSON.stringify(data).substring(0, 200)}`);
  return data.data?.lines || [];
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function cutoffDate() {
  if (BACKFILL) return '2020-01-01';
  if (SINCE)    return SINCE;
  const d = new Date();
  d.setDate(d.getDate() - 60);
  return d.toISOString().slice(0, 10);
}

function periodMonth(dateStr) { return dateStr.slice(0, 7); }

// ─── Post to backend ──────────────────────────────────────────────────────────

async function postPayout(payload) {
  if (!WEBHOOK_URL) {
    console.log(`  DRY: ${payload.payout_id} — ${payload.payout_aed.toFixed(2)} AED (${payload.period_start}→${payload.period_end})`);
    return { inserted: true, dry: true };
  }
  const res = await fetch(`${WEBHOOK_URL}/api/noon/portal-payout-record`, {
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

  const session    = loadSession();
  const cookieHdr  = buildCookieHeader(session);

  let totalPosted  = 0;
  let totalSkipped = 0;
  let totalErrors  = 0;

  for (const rest of RESTAURANTS) {
    console.log(`\n── ${rest.name} (${rest.brandCode}) ──`);

    let lines;
    try {
      lines = await callFinanceWallet(rest.brandCode, cookieHdr);
    } catch (err) {
      console.error(`  ✗ Wallet fetch failed: ${err.message}`);
      totalErrors++;
      continue;
    }

    console.log(`  ${lines.length} total payment lines in wallet`);
    const newLines = lines.filter(l => l.date >= since);
    console.log(`  ${newLines.length} lines since ${since}`);

    for (const line of newLines) {
      const payoutAed = Math.abs(line.amount);
      if (payoutAed === 0) { totalSkipped++; continue; }

      const payload = {
        payout_id:    line.referenceNr,
        store_code:   rest.storeCode,
        store_name:   rest.storeName,
        brand:        rest.brand,
        period_month: periodMonth(line.periodEnd || line.date),
        period_start: line.periodStart || line.date,
        period_end:   line.periodEnd   || line.date,
        payout_aed:   Math.round(payoutAed * 100) / 100,
        extracted_at: new Date().toISOString(),
      };

      try {
        const resp = await postPayout(payload);
        if (resp.dry) {
          totalPosted++;
        } else if (resp.inserted) {
          console.log(`  ✓ Inserted ${payload.payout_id}: ${payoutAed.toFixed(2)} AED (${line.periodStart}→${line.periodEnd})`);
          totalPosted++;
        } else {
          console.log(`  ─ Already exists: ${payload.payout_id}`);
          totalSkipped++;
        }
      } catch (err) {
        console.error(`  ✗ ${payload.payout_id}: ${err.message}`);
        totalErrors++;
      }
    }
  }

  console.log(`\n─── Done: ${totalPosted} posted/dry, ${totalSkipped} skipped, ${totalErrors} errors ───`);
  if (totalErrors > 0) process.exit(1);
})();
