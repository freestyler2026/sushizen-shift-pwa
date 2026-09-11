/**
 * FoodPanda PH — is the store actually switched on, right now.
 *
 * The Daily Check asks a person to tick "GrabFood / Foodpanda / Beep are ON".
 * FoodPanda answers it itself: `vss.as.restaurant-partners.com` returns, per
 * vendor, the live state, the category, the scheduled opening and closing for
 * the current slot, and whether the platform has put the store into high
 * demand mode with extra prep minutes.
 *
 * Why this and not order density: FoodPanda Paranaque has no orders in 58.7% of
 * its 11:00-21:00 hours and once went eight hours without one, so silence there
 * says nothing. The status endpoint says it outright.
 *
 * States seen 2026-09-11: OPEN / OUTSIDE_SCHEDULE / HIGH_DEMAND_MODE,
 * categories OPEN / OFF_HOURS / OPEN_HIGH_DEMAND. The portal's own translation
 * file also carries TEMPORARILY_CLOSED, which is the one worth catching.
 *
 * ⚠️ A login can carry a vendor that is not ours: Paranaque's also holds
 * "Ramen Zen - Paranaque" (fdwv). Vendors are resolved by id, and anything
 * unknown stops the run rather than being filed under a Sushi Zen branch.
 *
 * Usage:  node scripts/foodpanda/get-store-status.js paranaque
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const ACCOUNTS = {
  paranaque: { env: 'FP_SESSION_PARANAQUE', file: 'paranaque-session.b64.txt' },
  taft:      { env: 'FP_SESSION_TAFT',      file: 'taft-session.b64.txt' },
  qc:        { env: 'FP_SESSION_QC',        file: 'qc-session.b64.txt' },
};
const FP_VENDOR = { t0z4: 'PAR', ryqc: 'TAFT', a97i: 'CUB', fdwv: null };

const LOC = process.argv[2] || 'paranaque';
const acct = ACCOUNTS[LOC];
if (!acct) { console.error(`Unknown location "${LOC}"`); process.exit(1); }
const WEBHOOK = (process.env.WEBHOOK_URL || '').trim();

function decodeSession(b64) {
  const b = Buffer.from(b64.trim(), 'base64');
  return JSON.parse(b[0] === 0x1f && b[1] === 0x8b ? zlib.gunzipSync(b).toString('utf8') : b.toString('utf8'));
}

(async () => {
  const tmp = path.join(__dirname, `${LOC}-status-tmp.json`);
  const b64 = process.env[acct.env] || (fs.existsSync(path.join(__dirname, acct.file))
    ? fs.readFileSync(path.join(__dirname, acct.file), 'utf8') : '');
  if (!b64) { console.error(`No session: set ${acct.env} or run setup-session.js ${LOC}`); process.exit(1); }
  fs.writeFileSync(tmp, JSON.stringify(decodeSession(b64)));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: tmp,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  });

  // The portal mints the bearer token this endpoint wants, so its own call is
  // used for the headers rather than rebuilding the auth here.
  let headers = null;
  context.on('response', r => {
    if (r.url().includes('vss.as.restaurant-partners') && r.status() === 200) headers = r.request().headers();
  });
  const page = await context.newPage();
  await page.goto('https://partner.foodpanda.com/dashboard', { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
  if (/\/login|\/signin/.test(page.url())) {
    console.error(`\n❌ SESSION_EXPIRED — node scripts/foodpanda/setup-session.js ${LOC}`);
    await browser.close(); process.exit(1);
  }
  await page.waitForTimeout(5000);
  if (!headers) {
    console.error('\n❌ The portal never made an authorised store-status call — token not minted.');
    await browser.close(); process.exit(1);
  }

  const resp = await context.request.get('https://vss.as.restaurant-partners.com/api/v2/vendors/status',
    { headers }).catch(() => null);
  if (!resp || !resp.ok()) {
    console.error(`\n❌ vendors/status HTTP ${resp ? resp.status() : 'no response'}`);
    await browser.close(); process.exit(1);
  }
  const items = (await resp.json()).items || [];
  await browser.close();
  try { fs.unlinkSync(tmp); } catch (_) {}

  const observed = new Date().toISOString();
  const rows = [];
  const unknown = [];
  for (const it of items) {
    const vid = it.platformVendorId;
    if (FP_VENDOR[vid] === null) continue;          // another brand on this login
    if (!FP_VENDOR[vid]) { unknown.push(`${vid} (${it.name || ''})`); continue; }
    rows.push({
      platform: 'foodpanda',
      store: FP_VENDOR[vid],
      vendor_id: vid,
      vendor_name: it.name || '',
      state: it.state || '',
      category: it.category || '',
      opening_at: it.nextOrCurrentSlot?.openingAt || null,
      closing_at: it.nextOrCurrentSlot?.closingAt || null,
      extra_prep_minutes: it.highDemandMode?.extraPrepTimeMinutes ?? null,
      observed_at: observed,
    });
  }
  if (unknown.length) {
    console.error(`\n❌ Unknown vendor id(s): ${unknown.join(', ')} — add to FP_VENDOR before trusting this run.`);
    process.exit(1);
  }
  if (!rows.length) { console.error('\n❌ No vendors returned.'); process.exit(1); }

  for (const r of rows) {
    console.log(`  ${r.store.padEnd(5)} ${r.state.padEnd(18)} ${r.category.padEnd(18)}`
      + `${r.extra_prep_minutes != null ? `+${r.extra_prep_minutes}min ` : ''}`
      + `slot ${String(r.opening_at).slice(11, 16)}–${String(r.closing_at).slice(11, 16)}Z`);
  }
  if (!WEBHOOK) { process.stdout.write(JSON.stringify(rows, null, 2) + '\n'); return; }
  const r = await fetch(`${WEBHOOK}/api/aggregator/store-status`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  });
  if (!r.ok) { console.error(`  webhook ${r.status}: ${(await r.text()).slice(0, 200)}`); process.exit(1); }
  console.log(`✓ ${(await r.json()).written} recorded`);
})();
