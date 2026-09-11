/**
 * Talabat Dubai — is each outlet actually switched on, right now.
 *
 * The same question the Daily Check asks a person in Manila, asked of the
 * platform instead. Talabat runs on the same Delivery Hero stack as FoodPanda,
 * so the same vendor-status service answers -- on the Middle East host.
 *
 * ⚠️ Orders are NOT available here. `ListOrders` exists and the portal itself
 * calls it, but PerimeterX refuses it every time (`appId: PX24c5Soup`,
 * blockScript, captcha), through bundled Chromium and real Chrome, headless,
 * and on four reload-and-retry rounds. The same refusal hits
 * SalesOverviewByTime and TodayIssues, which is why per-outlet gross sales has
 * been unreadable since 2026-08-25. The note in get-payouts.js said that 403
 * was "not about how the request is made"; the body says it is PerimeterX, so
 * it is about how the request is made -- we just have not found the way.
 * Store status goes through because it is a plain REST GET on another host.
 *
 * Usage:  node scripts/talabat/get-store-status.js
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { storeCode, unmapped } = require('./stores');

const PORTAL = 'https://partner-app.talabat.com';
const SESSION = path.join(__dirname, 'talabat-session.b64.txt');
const WEBHOOK = (process.env.WEBHOOK_URL || '').trim();

function decodeSession(b64) {
  const b = Buffer.from(b64.trim(), 'base64');
  return JSON.parse(b[0] === 0x1f && b[1] === 0x8b ? zlib.gunzipSync(b).toString('utf8') : b.toString('utf8'));
}

(async () => {
  const raw = process.env.TALABAT_SESSION_STATE || (fs.existsSync(SESSION) ? fs.readFileSync(SESSION, 'utf8') : '');
  if (!raw) { console.error('No session: set TALABAT_SESSION_STATE or run setup-session.js'); process.exit(1); }
  const st = decodeSession(raw);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: { cookies: st.cookies || [], origins: st.origins || [] } });

  // The portal mints the bearer this service wants; its own call supplies the
  // headers rather than rebuilding the auth here.
  let statusReq = null;
  ctx.on('response', r => {
    if (/vss\.[a-z]+\.restaurant-partners\.com/.test(r.url()) && r.status() === 200) {
      statusReq = { url: r.url(), headers: r.request().headers() };
    }
  });

  const page = await ctx.newPage();
  await page.goto(PORTAL, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
  if (/\/login|\/auth/.test(page.url())) {
    console.error('\n❌ SESSION_EXPIRED — node scripts/talabat/setup-session.js');
    await browser.close(); process.exit(1);
  }
  await page.waitForTimeout(8000);
  if (!statusReq) {
    console.error('\n❌ The portal never made an authorised store-status call — token not minted.');
    await browser.close(); process.exit(1);
  }

  const base = statusReq.url.split('/api/')[0] + '/api/v2/vendors/status';
  const resp = await ctx.request.get(base, { headers: statusReq.headers }).catch(() => null);
  if (!resp || !resp.ok()) {
    console.error(`\n❌ vendors/status HTTP ${resp ? resp.status() : 'no response'}`);
    await browser.close(); process.exit(1);
  }
  const items = (await resp.json()).items || [];
  await browser.close();

  if (!items.length) { console.error('\n❌ No vendors returned.'); process.exit(1); }

  const observed = new Date().toISOString();
  const rows = items.map(it => ({
    platform: 'talabat',
    store: storeCode(it.name),
    vendor_id: String(it.platformVendorId || ''),
    vendor_name: it.name || '',
    state: it.state || '',
    category: it.category || '',
    opening_at: it.nextOrCurrentSlot?.openingAt || null,
    closing_at: it.nextOrCurrentSlot?.closingAt || null,
    extra_prep_minutes: it.highDemandMode?.extraPrepTimeMinutes ?? null,
    observed_at: observed,
  }));

  // Reported, not fatal: a new brand must not stop the reading, but it must not
  // pass unnoticed under an invented code either.
  const strays = unmapped(items.map(i => i.name));
  if (strays.length) console.log(`  ⚠ not in the store map: ${strays.join(' | ')}`);

  for (const r of rows) {
    console.log(`  ${r.store.padEnd(11)} ${r.state.padEnd(18)} ${r.category.padEnd(11)}`
      + `${r.extra_prep_minutes != null ? ` +${r.extra_prep_minutes}min` : ''}  ${r.vendor_name}`);
  }
  if (!WEBHOOK) { process.stdout.write(JSON.stringify(rows.slice(0, 2), null, 2) + '\n'); return; }
  const w = await fetch(`${WEBHOOK}/api/aggregator/store-status`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  });
  if (!w.ok) { console.error(`  webhook ${w.status}: ${(await w.text()).slice(0, 200)}`); process.exit(1); }
  console.log(`✓ ${(await w.json()).written} recorded`);
})();
