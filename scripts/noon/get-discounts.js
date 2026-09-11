/**
 * noon Dubai — what discounts are live on our three brands, and what moved.
 *
 * Same question as Careem's: the rate can change without anybody telling us,
 * and the portal only says so on a screen nobody opens daily. `discount/
 * restaurant/list` answers it: nine discounts on Sushi ZEN alone on
 * 2026-09-11, from 40% to 50%, some capped, some limited to named items.
 *
 * ⚠️ Unlike Careem, noon does NOT say who created a discount. Careem's payload
 * carries `creation_user_type` and every one of its campaigns said "careem";
 * noon has no such field, so nothing here claims noon changed anything. It
 * reports that a rate moved, and who moved it is a question for the people who
 * use the portal.
 *
 * ⚠️ noon's WAF blocks GitHub Actions and lets Heroku through, so in CI the
 * call goes through /api/noon/proxy (read-only allowlist). Locally it goes
 * direct. That is the same split get-payouts.js already uses.
 *
 * ⚠️ The session file is not a Playwright storageState: it holds npsid /
 * nprtnetid / npa_rt_v1 and the cookie header is built from them. Reading it
 * as a cookie jar yields nothing and looks like an expired session.
 *
 * Usage:  node scripts/noon/get-discounts.js
 */
const fs = require('fs'), path = require('path');

const BASE = 'https://restaurant.noon.partners/_food-restaurant';
const WEBHOOK = (process.env.WEBHOOK_URL || '').trim();

// Same three brands get-payouts.js walks.
const BRANDS = [
  { name: 'Sushi ZEN',        code: 'R5346332756132073257580964A' },
  { name: 'Ramen ZEN',        code: 'R7226482692501293869409357A' },
  { name: 'All Veggie Sushi', code: 'R8464682692638344527090517A' },
];

function loadSession() {
  const b64 = (process.env.NOON_SESSION || '').trim();
  if (b64) return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  const f = path.join(__dirname, 'noon-session.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  console.error('❌ No session. Run: node scripts/noon/setup-session.js --upload');
  process.exit(1);
}

/** The shape get-payouts.js builds. Kept identical on purpose. */
function cookieHeader(s) {
  const parts = [`_npsid=${s.npsid}`, `_nprtnetid=${s.nprtnetid}`,
                 'npa.pjc.v1=PRJ108431', 'npa.au.v1=true'];
  if (s.npa_rt_v1) parts.push(`npa.rt.v1=${s.npa_rt_v1}`);
  return parts.join('; ');
}

async function call(cookie, brandCode, p, payload) {
  if (WEBHOOK) {
    const r = await fetch(`${WEBHOOK}/api/noon/proxy`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie_header: cookie, brand_code: brandCode, path: p, payload }),
    });
    if (r.status === 401) throw new Error('SESSION_EXPIRED');
    if (!r.ok) throw new Error(`proxy ${r.status}: ${(await r.text()).slice(0, 160)}`);
    return r.json();
  }
  const r = await fetch(BASE + p, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'x-project': 'PRJ108431', 'x-locale': 'en-ae',
      Cookie: cookie, Origin: 'https://restaurant.noon.partners',
      Referer: `https://restaurant.noon.partners/restaurant/${brandCode}/payment/?project=PRJ108431`,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
    },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000),
  });
  if (r.status === 401) throw new Error('SESSION_EXPIRED');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

(async () => {
  const session = loadSession();
  const cookie = cookieHeader(session);
  const observed = new Date().toISOString();
  const rows = [];

  for (const b of BRANDS) {
    let data;
    try {
      data = await call(cookie, b.code, '/discount/restaurant/list', { brandCode: b.code });
    } catch (e) {
      if (String(e.message).includes('SESSION_EXPIRED')) {
        console.error('\n❌ SESSION_EXPIRED — node scripts/noon/setup-session.js --upload');
        process.exit(1);
      }
      console.error(`  ${b.name}: ${e.message}`);
      continue;
    }
    const list = (data && data.data) || [];
    console.log(`  ${b.name}: ${list.length} discounts`);
    for (const d of list) {
      const cfg = d.configs || {};
      rows.push({
        platform: 'noon',
        promo_id: String(d.discountCode || ''),
        name: `${b.name} — ${d.name || ''}`.trim(),
        status: d.isActive ? 'active' : 'inactive',
        offer_type: String(d.discountType || ''),
        // percentage discounts carry `percent`; the flat ones carry `flat`.
        // Keeping them in one column would compare 50 (%) with 35 (AED) as if
        // they were the same number, so the type travels with the value.
        offer_value: cfg.percent ?? cfg.flat ?? null,
        partner_contribution: null,        // noon does not say
        max_discount: cfg.priceLimit ?? null,
        start_at: d.schedule?.startDate || null,
        ends_at: d.schedule?.endDate || null,
        outlets: Array.isArray(d.outlets) ? d.outlets.length : null,
        is_auto_applied: !!d.isAutoapplied,
        created_by_type: '',               // noon does not say — never guessed
        updated_by: '',
        promo_updated_at: null,
        observed_at: observed,
      });
    }
  }

  if (!rows.length) {
    console.error('\n❌ No discounts captured.');
    process.exit(1);
  }
  for (const r of rows) {
    console.log(`    ${String(r.offer_value).padStart(4)} ${r.offer_type.padEnd(12)} ${r.status.padEnd(8)}`
      + `${r.max_discount != null ? ' cap ' + r.max_discount : ''}  ${r.name}`);
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
