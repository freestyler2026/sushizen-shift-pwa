/**
 * Careem Dubai — what discounts are running on our outlets, and who set them.
 *
 * The owner's problem: Careem changes the discount rate without telling us.
 * The portal does say, it just says it in a screen nobody opens daily. Every
 * one of the 22 campaigns live on 2026-09-11 carried
 * `creation_user_type: "careem"` — none were ours — at 20% to 50% off,
 * running to the end of September.
 *
 * So this takes a daily snapshot and the backend reports the DIFFERENCE. A
 * list of 22 promotions every morning is a list nobody reads (lesson 39); a
 * line saying "GOTYOU went from 30% to 50% overnight" is the thing that was
 * missing.
 *
 * Fields kept because they change what a discount costs us:
 *   offer.value           — the headline rate
 *   partner_contribution  — how much of it WE fund
 *   max_discount          — the cap, if any
 *   merchants[]           — how many outlets it applies to
 *   status / start_at / ends_at / is_auto_applied
 *   creation_user_type    — careem, or us
 *
 * ⚠️ The portal does not always issue the call on the first page load: it took
 * two rounds on 2026-09-11 and three on the run before. Reloading is the
 * retry, and an empty capture exits non-zero rather than reporting success on
 * nothing (lesson 47).
 *
 * Usage:  node scripts/careem/get-promotions.js
 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const SESSION = path.join(__dirname, 'careem-session.b64.txt');
const WEBHOOK = (process.env.WEBHOOK_URL || '').trim();

function decodeSession(b64) {
  const b = Buffer.from(b64.trim(), 'base64');
  return JSON.parse(b[0] === 0x1f && b[1] === 0x8b ? zlib.gunzipSync(b).toString('utf8') : b.toString('utf8'));
}

(async () => {
  // CAREEM_SESSION is the name the payout script and the secret already use.
  // A second name for the same thing is how a workflow ends up passing one and
  // the script reading the other.
  const raw = process.env.CAREEM_SESSION || process.env.CAREEM_SESSION_STATE
    || (fs.existsSync(SESSION) ? fs.readFileSync(SESSION, 'utf8') : '');
  if (!raw) { console.error('No session: set CAREEM_SESSION or run setup-session.js'); process.exit(1); }
  const st = decodeSession(raw);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: { cookies: st.cookies || [], origins: st.origins || [] } });

  let payload = null;
  ctx.on('response', async r => {
    if (!/promotion/i.test(r.url()) || r.status() !== 200) return;
    try { const j = await r.json(); if ((j.promotions || []).length) payload = j; } catch (_) {}
  });

  const page = await ctx.newPage();
  for (let round = 1; round <= 4 && !payload; round++) {
    await page.goto('https://partners.careem.com/saturn-ext/merchant/promotions',
      { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
    if (/\/login|\/signin/.test(page.url())) {
      console.error('\n❌ SESSION_EXPIRED — node scripts/careem/setup-session.js');
      await browser.close(); process.exit(1);
    }
    await page.waitForTimeout(10_000);
    if (!payload) console.log(`  round ${round}: the portal has not asked for promotions yet, reloading`);
  }
  await browser.close();

  if (!payload) { console.error('\n❌ No promotions captured.'); process.exit(1); }

  const observed = new Date().toISOString();
  const rows = (payload.promotions || []).map(p => {
    const off = (p.offers && p.offers[0]) || p.offer || {};
    return {
      platform: 'careem',
      promo_id: String(p.id),
      name: p.name || '',
      status: p.status || '',
      offer_type: off.offer_type || '',
      offer_value: off.value ?? null,
      partner_contribution: p.partner_contribution ?? null,
      max_discount: p.max_discount ?? null,
      start_at: p.start_at || null,
      ends_at: p.ends_at || null,
      outlets: (p.merchants || []).length,
      is_auto_applied: !!p.is_auto_applied,
      created_by_type: p.creation_user_type || '',
      updated_by: p.updated_by || '',
      promo_updated_at: p.updated_at || null,
      observed_at: observed,
    };
  });

  const careemMade = rows.filter(r => r.created_by_type === 'careem').length;
  console.log(`  ${rows.length} promotions (${careemMade} created by Careem)`);
  for (const r of rows.slice(0, 30)) {
    console.log(`    ${r.promo_id.padEnd(9)} ${r.status.padEnd(9)} ${String(r.offer_value).padStart(3)}%`
      + ` outlets=${String(r.outlets).padStart(5)}  ${r.name.padEnd(15)} ${String(r.start_at).slice(0, 10)}..${String(r.ends_at).slice(0, 10)}`);
  }
  if (!WEBHOOK) { process.stdout.write(JSON.stringify(rows.slice(0, 2), null, 2) + '\n'); return; }
  const w = await fetch(`${WEBHOOK}/api/aggregator/promotions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  });
  if (!w.ok) { console.error(`  webhook ${w.status}: ${(await w.text()).slice(0, 200)}`); process.exit(1); }
  const res = await w.json();
  console.log(`✓ ${res.written} recorded`);
  if (res.changes?.length) {
    console.log('\n  ⚠ changed since the last snapshot:');
    res.changes.forEach(c => console.log(`    ${c}`));
  }
})();
