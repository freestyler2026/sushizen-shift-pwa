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
  { name: 'Sushi ZEN',        brandCode: 'R5346332756132073257580964A', brand: 'sushi_zen'  },
  { name: 'Ramen ZEN',        brandCode: 'R7226482692501293869409357A', brand: 'ramen_zen'  },
  { name: 'All Veggie Sushi', brandCode: 'R8464682692638344527090517A', brand: 'all_veggie' },
];

// outlet_name as it appears in the statement CSV → our store code.
// Sushi ZEN keeps the bare Dubai codes already in ar_payouts so existing rows
// stay addressable; the other brands are prefixed, as on Careem and Keeta.
const OUTLET_STORE_MAP = {
  'sushi_zen__al_hudaiba_branch':        { code: 'AM',            name: 'Sushi ZEN Al Mina'            },
  'sushi_zen__arjan':                    { code: 'ARJ',           name: 'Sushi ZEN Arjan'              },
  'sushi_zen__business_bay':             { code: 'BB',            name: 'Sushi ZEN Business Bay'       },
  'sushi_zen__jlt':                      { code: 'JLT',           name: 'Sushi ZEN JLT'                },
  'sushi_zen__al_barsha':                { code: 'AB',            name: 'Sushi ZEN Al Barsha'          },
  'ramen_zen__al_hudaiba_branch':        { code: 'NOON_RZ_AM',    name: 'Ramen ZEN Al Mina'            },
  'ramen_zen__business_bay':             { code: 'NOON_RZ_BB',    name: 'Ramen ZEN Business Bay'       },
  'ramen_zen__jlt':                      { code: 'NOON_RZ_JLT',   name: 'Ramen ZEN JLT'                },
  'ramen_zen__motor_city':               { code: 'NOON_RZ_MC',    name: 'Ramen ZEN Motor City'         },
  'all_veggie_sushi__al_barsha_branch':  { code: 'NOON_AVS_AB',   name: 'All Veggie Sushi Al Barsha'   },
};

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

async function callFinanceWallet(brandCode, cookieHeader, entryType = 'payment') {
  // Route through Heroku proxy when running in CI (GitHub Actions IPs are blocked by Noon's WAF).
  // Falls back to direct call when no WEBHOOK_URL (local dev).
  if (WEBHOOK_URL) {
    const proxyResp = await fetch(`${WEBHOOK_URL}/api/noon/proxy-wallet`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ cookie_header: cookieHeader, brand_code: brandCode, entry_type: entryType }),
    });
    if (proxyResp.status === 401) {
      throw new Error('401 Unauthorized (via proxy) — session expired. Run: node scripts/noon/setup-session.js --upload');
    }
    if (!proxyResp.ok) {
      const text = await proxyResp.text();
      throw new Error(`Proxy wallet ${proxyResp.status}: ${text.substring(0, 200)}`);
    }
    const data = await proxyResp.json();
    if (data.status !== 'success') throw new Error(`API error (via proxy): ${JSON.stringify(data).substring(0, 200)}`);
    return data.data?.lines || [];
  }

  // Direct call (local)
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
    body: JSON.stringify({ entryType }),
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

// ─── Order-level statement → per-outlet totals ───────────────────────────────

/** Split one CSV line, honouring the double-quoted fields Noon emits. */
function splitCsvLine(line) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

async function fetchStatementOrders(brandCode, cookieHeader, statementNrs) {
  if (WEBHOOK_URL) {
    const resp = await fetch(`${WEBHOOK_URL}/api/noon/proxy-statement-orders`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ cookie_header: cookieHeader, brand_code: brandCode,
                                statement_nrs: statementNrs }),
    });
    if (resp.status === 401) throw new Error('401 (via proxy) — session expired. Run: node scripts/noon/setup-session.js --upload');
    if (!resp.ok) throw new Error(`Proxy statement/orders ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    return resp.text();
  }
  const resp = await fetch(`${BASE}/finance/statement/orders`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-project':    'PRJ108431',
      'x-locale':     'en-ae',
      'Cookie':       cookieHeader,
      'Referer':      `https://restaurant.noon.partners/restaurant/${brandCode}/payment/?project=PRJ108431`,
      'Origin':       'https://restaurant.noon.partners',
      'User-Agent':   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    body: JSON.stringify({ statementNrList: statementNrs }),
  });
  if (!resp.ok) throw new Error(`statement/orders ${resp.status}`);
  return resp.text();
}

/** Aggregate the order rows into one total per (statement, outlet). */
function aggregateByOutlet(csv) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const head = splitCsvLine(lines[0]).map(h => h.trim());
  const iStmt = head.indexOf('statement_nr');
  const iCode = head.indexOf('outlet_code');
  const iName = head.indexOf('outlet_name');
  const iNet  = head.indexOf('net_payable');
  if (iStmt < 0 || iCode < 0 || iNet < 0) {
    throw new Error(`unexpected statement CSV columns: ${head.slice(0, 6).join(',')}`);
  }

  const groups = new Map();
  let unmapped = new Set();
  for (let i = 1; i < lines.length; i++) {
    const f = splitCsvLine(lines[i]);
    const stmt = (f[iStmt] || '').trim();
    const name = (f[iName] || '').trim();
    if (!stmt || !name) continue;
    // Closed and renamed branches (DSO, Mirdif, Motor City, the old
    // "Sushi & Noodle Zen" names) appear in older statements. Dropping them
    // would quietly understate history, so fall back to the outlet code —
    // the same thing the CSV importer does — and report what fell back.
    const info = OUTLET_STORE_MAP[name]
      || { code: `NOON_X_${(f[iCode] || 'UNKNOWN').trim().toUpperCase()}`, name };
    if (!OUTLET_STORE_MAP[name]) unmapped.add(`${name}→${info.code}`);
    // Amounts arrive without separators here, but strip them anyway — Keeta's
    // export formats the same kind of column with commas and parseFloat then
    // silently truncates the value instead of failing.
    const net = parseFloat(String(f[iNet] ?? '').replace(/,/g, '')) || 0;
    const key = `${stmt}||${info.code}`;
    const g = groups.get(key) || { stmt, code: info.code, name: info.name, total: 0, orders: 0 };
    g.total += net; g.orders += 1;
    groups.set(key, g);
  }
  if (unmapped.size) console.log(`    (outlets not in OUTLET_STORE_MAP, kept under a fallback code: ${[...unmapped].join(', ')})`);
  return [...groups.values()].map(g => ({ ...g, total: Math.round(g.total * 100) / 100 }));
}

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

    // The statement list is what the portal's Statement tab shows; the wallet's
    // "payment" entries are the same money aggregated to brand level, which is
    // why they cannot be attributed to a store.
    let lines;
    try {
      lines = await callFinanceWallet(rest.brandCode, cookieHdr, 'statement');
    } catch (err) {
      console.error(`  ✗ Statement list failed: ${err.message}`);
      totalErrors++;
      continue;
    }

    const wanted = lines.filter(l => (l.periodEnd || l.date) >= since);
    console.log(`  ${lines.length} statements, ${wanted.length} since ${since}`);
    if (!wanted.length) continue;

    // Ask for the order rows in batches — one request per statement would be
    // dozens of round trips on a backfill.
    const BATCH = 10;
    for (let b = 0; b < wanted.length; b += BATCH) {
      const chunk = wanted.slice(b, b + BATCH);
      const byNr  = new Map(chunk.map(l => [l.referenceNr, l]));

      let rows;
      try {
        rows = aggregateByOutlet(await fetchStatementOrders(rest.brandCode, cookieHdr,
                                                            chunk.map(l => l.referenceNr)));
      } catch (err) {
        console.error(`  ✗ statements ${b + 1}-${b + chunk.length}: ${err.message}`);
        totalErrors++;
        continue;
      }

      for (const r of rows) {
        if (r.total === 0) { totalSkipped++; continue; }
        const stmt = byNr.get(r.stmt);
        const periodStart = stmt?.periodStart || stmt?.date || '';
        const periodEnd   = stmt?.periodEnd   || stmt?.date || '';

        const payload = {
          payout_id:    `${r.stmt}_${r.code}`,
          store_code:   r.code,
          store_name:   r.name,
          brand:        rest.brand,
          period_month: periodMonth(periodEnd || periodStart),
          period_start: periodStart,
          period_end:   periodEnd,
          payout_aed:   r.total,
          orders_count: r.orders,
          extracted_at: new Date().toISOString(),
        };

        try {
          const resp = await postPayout(payload);
          if (resp.dry || resp.inserted) {
            if (!resp.dry) console.log(`  ✓ ${r.code.padEnd(12)} ${periodStart}→${periodEnd}  ${r.total.toFixed(2)} AED (${r.orders} orders)`);
            totalPosted++;
          } else {
            totalSkipped++;
          }
        } catch (err) {
          console.error(`  ✗ ${payload.payout_id}: ${err.message}`);
          totalErrors++;
        }
      }
    }
  }

  console.log(`\n─── Done: ${totalPosted} posted/dry, ${totalSkipped} skipped, ${totalErrors} errors ───`);
  if (totalErrors > 0) process.exit(1);
})();
