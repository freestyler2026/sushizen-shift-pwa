/**
 * Keeta Merchant Portal price checker — runs in GitHub Actions via direct HTTP fetch.
 *
 * Key discovery: Keeta uses iframe micro-frontend at /web/product.
 * The menu API is at /api/sailorProduct/spu/r/listSpu (POST).
 * Authentication is via session cookies — no browser required.
 */
const fs = require('fs');

const SESSION_PATH = process.env.KEETA_SESSION_PATH;
const WEBHOOK_URL  = process.env.WEBHOOK_URL;

const PORTAL = 'https://merchant.mykeeta.com';

const SHOPS = [
  { name: 'Arjan',         id: '1644178222' },
  { name: 'Al Barsha 3',   id: '1644171212' },
  { name: 'Business Bay',  id: '1644198211' },
  { name: 'Jumeirah Lake', id: '1644191210' },
  { name: 'Al Mina',       id: '1644184196' },
];

// ── cookie helpers ──────────────────────────────────────────────────────────

function loadCookies(sessionPath) {
  const state = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  return state.cookies
    .filter(c => c.domain && c.domain.includes('mykeeta.com'))
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
}

// ── Keeta API ───────────────────────────────────────────────────────────────

async function keetaPost(cookieStr, path, body) {
  const resp = await fetch(`${PORTAL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Referer': `${PORTAL}/m/web/product`,
      'Origin': PORTAL,
      'Cookie': cookieStr,
    },
    body: JSON.stringify(body),
  });

  const text = await resp.text();

  if (resp.status === 401 || resp.status === 403) {
    throw new Error(`AUTH_EXPIRED: ${resp.status}`);
  }
  if (!resp.ok) {
    throw new Error(`${resp.status}: ${text.slice(0, 300)}`);
  }

  const data = JSON.parse(text);

  // Keeta uses code 0 for success; auth-related error codes
  if (data.code === 401 || data.code === 403 || data.message?.toLowerCase().includes('login')) {
    throw new Error(`AUTH_EXPIRED: ${data.code} ${data.message}`);
  }

  return data;
}

function parsePrice(aedStr) {
  if (!aedStr) return null;
  const num = parseFloat(String(aedStr).replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}

// ── webhook ─────────────────────────────────────────────────────────────────

async function postWebhook(payload) {
  const resp = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return resp.json();
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!SESSION_PATH) throw new Error('KEETA_SESSION_PATH not set');
  if (!WEBHOOK_URL)  throw new Error('WEBHOOK_URL not set');

  const cookieStr = loadCookies(SESSION_PATH);
  console.log(`Loaded ${cookieStr.split(';').length} cookies`);

  const checkedAt = new Date().toISOString();

  for (const shop of SHOPS) {
    console.log(`\nChecking: ${shop.name} (${shop.id})`);

    try {
      // Paginate — typically all items fit in one page (200 is safe)
      let allSpus = [];
      let pageNum = 1;
      while (true) {
        const data = await keetaPost(cookieStr, '/api/sailorProduct/spu/r/listSpu', {
          shopId: shop.id,
          pageNum,
          pageSize: 200,
        });
        const spuList = data.data?.spuList || [];
        allSpus = allSpus.concat(spuList);
        if (spuList.length < 200) break;
        pageNum++;
      }

      const items = allSpus
        .map(s => ({
          name:          s.name,
          price_aed:     parsePrice(s.minPrice),
          price_max_aed: s.minPrice !== s.maxPrice ? parsePrice(s.maxPrice) : null,
          is_available:  s.status === 1,
          category_ids:  s.shopCategoryIdList || [],
        }))
        .filter(s => s.price_aed !== null && s.price_aed > 0);

      console.log(`  ${items.length} priced items (${allSpus.length} total SPUs)`);

      if (!items.length) {
        console.log('  No priced items — skipping');
        continue;
      }

      const result = await postWebhook({
        shop_id:    shop.id,
        shop_name:  shop.name,
        items,
        checked_at: checkedAt,
      });
      console.log(`  → ${JSON.stringify(result)}`);

    } catch (err) {
      if (err.message.startsWith('AUTH_EXPIRED')) {
        console.log('Session expired — notifying webhook and exiting');
        await postWebhook({
          shop_id:    'SESSION_EXPIRED',
          shop_name:  'SYSTEM',
          items:      [],
          checked_at: checkedAt,
        });
        process.exit(1);
      }
      console.error(`  Error for ${shop.name}:`, err.message);
    }
  }

  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
