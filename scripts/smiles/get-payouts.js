#!/usr/bin/env node
/**
 * Smiles (EatEasily) Dubai — Monthly Payout Extractor
 *
 * Downloads the "Agent Handled" sales report for each Smiles account,
 * sums Total Sales and Total Commission (Excl VAT), and posts the
 * monthly net payout to the backend AR Payouts table.
 *
 * Net payout = Total Sales − Total Commission(Excl VAT)
 *   - Total Sales    = customer-paid amount after Smiles promo discounts
 *   - Total Commission = Smiles platform fee (Excl VAT)
 *
 * Usage:
 *   node get-payouts.js                         # last complete month
 *   SMILES_TARGET_MONTH=2025-03 node get-payouts.js
 *   SMILES_BACKFILL=1 node get-payouts.js       # all months since Jan 2025
 *
 * Env vars:
 *   SMILES_ACCOUNTS  — base64-encoded JSON: [{username,password,label},...] (CI)
 *   SMILES_TARGET_MONTH — YYYY-MM to process (default: previous month)
 *   SMILES_BACKFILL — if "1", process all months from Jan 2025 to last month
 *   WEBHOOK_URL — backend base URL (default: http://localhost:8000)
 */

'use strict';
const { chromium } = require('playwright');
const XLSX         = require('xlsx');

// ─── Config ──────────────────────────────────────────────────────────────────

const PORTAL = 'https://manage.eateasily.com';

const WEBHOOK_URL = (process.env.WEBHOOK_URL || 'http://localhost:8000').replace(/\/$/, '');

// Store metadata only. Passwords used to sit here in plain text, in a file
// tracked by git — the one place in this repo that held credentials rather
// than a session or a secret. They come from SMILES_ACCOUNTS now, and the
// script refuses to run without it instead of silently falling back.
// One account per branch. Confirmed against the portal 2026-08-26: the JLT
// login is sushizen21013, not ramenzen21013, and 21315 is Al Mina rather than
// Al Hudaiba — under the old entries JLT would not have logged in at all and
// Al Mina's takings would have landed on a branch that does not exist.
const ACCOUNT_META = [
  { username: 'ramenzen21016', label: 'MCity', restId: '21016', storeCode: 'SMILES_SZ_ARJ', storeName: 'Sushi ZEN Arjan' },
  { username: 'ramenzen21051', label: 'BBay', restId: '21051', storeCode: 'SMILES_SZ_BB', storeName: 'Sushi ZEN Business Bay' },
  { username: 'sushizen21013', label: 'JLT', restId: '21013', storeCode: 'SMILES_SZ_JLT', storeName: 'Sushi ZEN JLT' },
  { username: 'sushizen21315', label: 'AlMina', restId: '21315', storeCode: 'SMILES_SZ_AM', storeName: 'Sushi ZEN Al Mina' },
];

function loadAccounts() {
  const raw = process.env.SMILES_ACCOUNTS;
  if (!raw) {
    console.error('❌ SMILES_ACCOUNTS is not set.');
    console.error('   It holds base64 of [{username,password,label},...] — the credentials');
    console.error('   are deliberately not in this file. Set it in the environment, or as');
    console.error('   the GitHub Actions secret of the same name, and run again.');
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch (err) {
    console.error(`❌ SMILES_ACCOUNTS is not valid base64 JSON: ${err.message}`);
    process.exit(1);
  }
  return parsed.map(p => {
    const meta = ACCOUNT_META.find(m => m.label === p.label || m.username === p.username);
    if (!meta) console.warn(`  ⚠ ${p.label || p.username} is not in ACCOUNT_META — no store mapping`);
    return { ...meta, ...p };
  });
}

// ─── Month helpers ────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function lastMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function parseMonthStr(s) {          // "2025-03" → {year:2025, month:3}
  const [y, m] = s.split('-').map(Number);
  return { year: y, month: m };
}

function monthLabel(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function buildDateRange(year, month) {
  const mon = MONTHS[month - 1];
  const end = daysInMonth(year, month);
  return {
    startDate: `01 ${mon} ${year}`,
    endDate:   `${end} ${mon} ${year}`,
  };
}

// ─── Login ────────────────────────────────────────────────────────────────────

async function login(context, username, password) {
  const page = await context.newPage();
  await page.goto(PORTAL + '/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {}),
    page.click('input[type="submit"]'),
  ]);
  const ok = page.url().includes('/merchant/');
  return { page, ok };
}

// ─── Download Excel ───────────────────────────────────────────────────────────

async function downloadMonthExcel(page, restId, year, month) {
  const { startDate, endDate } = buildDateRange(year, month);
  await page.goto(PORTAL + '/merchant/resturant/rests_sale_reports_form', { waitUntil: 'domcontentloaded', timeout: 20_000 });

  const result = await page.evaluate(async ({ restId, startDate, endDate }) => {
    return new Promise(resolve => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/merchant/resturant/rests_sale_reports_form_excel', true);
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      xhr.responseType = 'arraybuffer';
      xhr.onload = () => {
        const arr   = new Uint8Array(xhr.response);
        const blob  = new Blob([arr]);
        const reader = new FileReader();
        reader.onloadend = () => resolve({ size: arr.length, b64: reader.result.split(',')[1], status: xhr.status });
        reader.readAsDataURL(blob);
      };
      xhr.onerror = () => resolve({ size: 0, b64: null, status: 0 });
      const p = new URLSearchParams({
        'rest_id[]': restId,
        start_date: startDate,
        start_date_time: '12:00 AM',
        end_date: endDate,
        end_date_time: '11:59 PM',
        submit: 'Download Report',
      });
      xhr.send(p.toString());
    });
  }, { restId, startDate, endDate });

  return result;
}

// ─── Parse XLS ───────────────────────────────────────────────────────────────
// Col indices (0-based):
//   0  Order Date
//   1  Order Number        ← use to detect data rows (non-empty = order row)
//  13  Total Sales         ← sum
//  15  Total Commission(Excl VAT)  ← sum

function parseExcel(b64, label, monthLabel) {
  const buf      = Buffer.from(b64, 'base64');
  const workbook = XLSX.read(buf, { type: 'buffer' });
  const wsName   = workbook.SheetNames.find(n => n.toLowerCase().includes('sales')) || workbook.SheetNames[0];
  const ws       = workbook.Sheets[wsName];
  const rows     = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let totalSales      = 0;
  let totalCommission = 0;
  let orderCount      = 0;
  let totalUndiscounted = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const orderNum = String(row[1] || '').trim();
    if (!orderNum) continue;                     // skip totals / empty rows
    totalUndiscounted += Number(row[7])  || 0;
    totalSales        += Number(row[13]) || 0;
    totalCommission   += Number(row[15]) || 0;
    orderCount++;
  }

  console.log(`  [${label}] ${monthLabel}: ${orderCount} orders | Sales=${totalSales.toFixed(2)} Comm=${totalCommission.toFixed(2)} Net=${(totalSales - totalCommission).toFixed(2)}`);
  return { orderCount, totalSales, totalCommission, totalUndiscounted };
}

// ─── Post to backend ──────────────────────────────────────────────────────────

async function postPayout(payload) {
  const url = `${WEBHOOK_URL}/api/smiles/portal-payout-record`;
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
  const accounts = loadAccounts();

  // Determine target months
  let targetMonths;
  if (process.env.SMILES_BACKFILL === '1') {
    targetMonths = [];
    const last = lastMonth();
    for (let yr = 2025; yr <= last.year; yr++) {
      const startMo = 1;
      const endMo   = (yr === last.year) ? last.month : 12;
      for (let mo = startMo; mo <= endMo; mo++) {
        targetMonths.push({ year: yr, month: mo });
      }
    }
    console.log(`Backfill mode: ${targetMonths.length} months (${monthLabel(targetMonths[0].year, targetMonths[0].month)} → ${monthLabel(targetMonths[targetMonths.length-1].year, targetMonths[targetMonths.length-1].month)})`);
  } else if (process.env.SMILES_TARGET_MONTH) {
    targetMonths = [parseMonthStr(process.env.SMILES_TARGET_MONTH)];
  } else {
    targetMonths = [lastMonth()];
  }

  let totalPosted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const account of accounts) {
    console.log(`\n── Account: ${account.label} (${account.username}) ──`);

    const browser = await chromium.launch({ headless: true });
    const ctx     = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const { page, ok } = await login(ctx, account.username, account.password);

    if (!ok) {
      console.log(`  ⚠ Login failed for ${account.label} — skipping (check credentials)`);
      await browser.close();
      continue;
    }

    console.log(`  ✓ Logged in as ${account.username}`);

    for (const { year, month } of targetMonths) {
      const ml = monthLabel(year, month);
      try {
        const dl = await downloadMonthExcel(page, account.restId, year, month);
        if (!dl.b64 || dl.size < 500) {
          console.log(`  [${account.label}] ${ml}: no data (${dl.size} bytes)`);
          totalSkipped++;
          continue;
        }

        const { orderCount, totalSales, totalCommission, totalUndiscounted } = parseExcel(dl.b64, account.label, ml);

        if (orderCount === 0) {
          console.log(`  [${account.label}] ${ml}: 0 orders — skipping`);
          totalSkipped++;
          continue;
        }

        const netPayout = totalSales - totalCommission;
        const payoutId  = `smiles_${account.restId}_${ml.replace('-', '_')}`;

        const payload = {
          payout_id:           payoutId,
          shop_id:             account.restId,
          store_code:          account.storeCode,
          store_name:          account.storeName,
          brand:               'sushi_zen',
          period_month:        ml,
          period_start:        `${year}-${String(month).padStart(2,'0')}-01`,
          period_end:          `${year}-${String(month).padStart(2,'0')}-${String(daysInMonth(year, month)).padStart(2,'0')}`,
          order_count:         orderCount,
          total_sales_aed:     Math.round(totalSales * 100) / 100,
          total_undiscounted_aed: Math.round(totalUndiscounted * 100) / 100,
          commission_aed:      Math.round(totalCommission * 100) / 100,
          payout_aed:          Math.round(netPayout * 100) / 100,
          extracted_at:        new Date().toISOString(),
        };

        if (!WEBHOOK_URL || WEBHOOK_URL === 'http://localhost:8000') {
          console.log(`  DRY: ${payoutId} — net=${netPayout.toFixed(2)} AED`);
          totalPosted++;
        } else {
          const resp = await postPayout(payload);
          console.log(`  ✓ Posted ${payoutId}: net=${netPayout.toFixed(2)} AED | inserted=${resp.inserted}`);
          totalPosted++;
        }

      } catch (err) {
        console.error(`  ✗ ${account.label} ${ml}: ${err.message}`);
        totalErrors++;
      }
    }

    await browser.close();
  }

  console.log(`\n─── Done: ${totalPosted} posted, ${totalSkipped} skipped, ${totalErrors} errors ───`);
  if (totalErrors > 0) process.exit(1);
})();
