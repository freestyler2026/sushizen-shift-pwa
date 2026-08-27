/**
 * FoodPanda — does the portal expose per-order refund detail?
 *
 * The cancellation workflow can only be settled automatically if FoodPanda gives
 * us the order code (e.g. "a97i-2630-rxv8") alongside the money. ListPayouts —
 * the only operation we call today — returns payout and invoice totals, so this
 * walks the Finance UI and records every GraphQL call the portal itself makes,
 * flagging any response that carries an order code.
 *
 * Read-only: it navigates and reports, and never posts anything anywhere.
 *
 * Usage:
 *   FP_SESSION_QC=<base64> node scripts/foodpanda/discover-order-transactions.js qc
 */

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

function decodeSession(b64) {
  const buf = Buffer.from(b64.trim(), 'base64');
  const raw = (buf[0] === 0x1f && buf[1] === 0x8b)
    ? zlib.gunzipSync(buf).toString('utf8')
    : buf.toString('utf8');
  return JSON.parse(raw);
}

const LOCATION = process.argv[2] || 'qc';
const ACCOUNTS = {
  paranaque: { env: 'FP_SESSION_PARANAQUE', file: 'paranaque-session.b64.txt' },
  taft:      { env: 'FP_SESSION_TAFT',      file: 'taft-session.b64.txt' },
  qc:        { env: 'FP_SESSION_QC',        file: 'qc-session.b64.txt' },
};
const acct = ACCOUNTS[LOCATION];
if (!acct) { console.error(`Unknown location "${LOCATION}"`); process.exit(1); }

const TMP = path.join(__dirname, `${LOCATION}-discovery-tmp.json`);

function loadSession() {
  const b64 = process.env[acct.env] || (
    fs.existsSync(path.join(__dirname, acct.file))
      ? fs.readFileSync(path.join(__dirname, acct.file), 'utf8').trim()
      : ''
  );
  if (!b64) { console.error(`No session: set ${acct.env} or run setup-session.js ${LOCATION}`); process.exit(1); }
  fs.writeFileSync(TMP, JSON.stringify(decodeSession(b64)));
  return TMP;
}

// FoodPanda order codes look like "a97i-2630-rxv8": vendor id, batch, suffix.
const ORDER_CODE_RE = /\b[a-z0-9]{4}-\d{4}-[a-z0-9]{4}\b/i;
// Words that would mark a line item as a cancellation or a compensation.
const MONEY_WORDS = ['cancel', 'compensat', 'refund', 'adjustment', 'deduction', 'chargeback'];

const seen = new Map();   // operationName -> { calls, orderCodes, sampleCode, words, bytes }

function record(op, body) {
  const rec = seen.get(op) || { calls: 0, orderCodes: false, sampleCode: '', words: new Set(), bytes: 0 };
  rec.calls += 1;
  rec.bytes = Math.max(rec.bytes, body.length);
  const m = body.match(ORDER_CODE_RE);
  if (m) { rec.orderCodes = true; rec.sampleCode = rec.sampleCode || m[0]; }
  const lower = body.toLowerCase();
  for (const w of MONEY_WORDS) if (lower.includes(w)) rec.words.add(w);
  seen.set(op, rec);
}

async function main() {
  console.log(`\nFoodPanda per-order detail discovery — ${LOCATION.toUpperCase()}`);
  console.log('='.repeat(64));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: loadSession(),
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  });

  const downloadLinks = [];

  context.on('response', async resp => {
    const url = resp.url();
    if (!url.includes('vagw-api')) return;
    let op = '(unnamed)';
    try {
      const post = resp.request().postData() || '';
      op = (JSON.parse(post).operationName) || '(unnamed)';
    } catch (_) {}
    try {
      const body = await resp.text();
      record(op, body);
      // Invoice/report downloads are the usual home of per-order lines.
      for (const m of body.matchAll(/https?:\/\/[^"\\ ]+\.(?:csv|xlsx|pdf)[^"\\ ]*/gi)) {
        if (downloadLinks.length < 10) downloadLinks.push({ op, url: m[0] });
      }
    } catch (_) {}
  });

  const page = await context.newPage();

  const routes = [
    'https://partner.foodpanda.com/finance',
    'https://partner.foodpanda.com/finance/transactions',
    'https://partner.foodpanda.com/finance/payouts',
    'https://partner.foodpanda.com/orders',
  ];

  for (const route of routes) {
    try {
      await page.goto(route, { waitUntil: 'networkidle', timeout: 30_000 });
    } catch (_) {}
    const landed = page.url();
    if (landed.includes('/login') || landed.includes('/signin')) {
      console.error(`\n❌ Session expired — re-run setup-session.js ${LOCATION}`);
      await browser.close();
      process.exit(1);
    }
    console.log(`  visited ${route}  →  ${landed.slice(0, 78)}`);
    await page.waitForTimeout(4000);
  }

  // Open the first payout row: the per-order lines, if they exist anywhere, are
  // behind a payout rather than on the list itself.
  try {
    await page.goto('https://partner.foodpanda.com/finance', { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(3000);
    const row = page.locator('table tbody tr').first();
    if (await row.count()) {
      await row.click({ timeout: 5000 });
      await page.waitForTimeout(5000);
      console.log(`  opened first payout row  →  ${page.url().slice(0, 78)}`);
    } else {
      console.log('  no payout rows rendered (portal may have blocked headless JS)');
    }
  } catch (err) {
    console.log(`  could not open a payout row: ${err.message.slice(0, 80)}`);
  }

  console.log('\n--- GraphQL operations the portal called ---');
  if (!seen.size) console.log('  (none captured)');
  for (const [op, rec] of [...seen.entries()].sort((a, b) => b[1].calls - a[1].calls)) {
    console.log(
      `  ${op.padEnd(34)} calls=${String(rec.calls).padEnd(3)} ` +
      `order_codes=${rec.orderCodes ? 'YES ' + rec.sampleCode : 'no'}  ` +
      `words=[${[...rec.words].join(',')}]  max_bytes=${rec.bytes}`
    );
  }

  console.log('\n--- downloadable report links seen ---');
  console.log(downloadLinks.length ? downloadLinks.map(d => `  ${d.op}: ${d.url.slice(0, 110)}`).join('\n') : '  (none)');

  await browser.close();
  try { fs.unlinkSync(TMP); } catch (_) {}
  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
