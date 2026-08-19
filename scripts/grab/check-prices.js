/**
 * Grab Merchant Portal price checker — runs in GitHub Actions via direct HTTP fetch.
 *
 * Uses ONE session (Paranaque manager account) which has access to all 3 PH stores.
 * API: GET https://api.grab.com/food/merchant/v2/menu?merchantID={id}
 *      GET https://portal.grab.com/foodtroy/v1/PH/merchant-groups/catalog-stores
 * Auth: mexusers_authn_token cookie on .grab.com domain
 */
const fs = require('fs');

const SESSION_PATH = process.env.GRAB_SESSION_PATH;
const WEBHOOK_URL  = process.env.WEBHOOK_URL;

// ── cookie helpers ──────────────────────────────────────────────────────────

function loadGrabCookies(sessionPath) {
  const state = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  // Only .grab.com wildcard cookies are needed for api.grab.com / portal.grab.com
  return state.cookies
    .filter(c => c.domain === '.grab.com' || c.domain === 'merchant.grab.com')
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
}

// ── API helpers ─────────────────────────────────────────────────────────────

async function grabGet(cookieStr, url) {
  const resp = await fetch(url, {
    headers: {
      'Cookie':      cookieStr,
      'Accept':      'application/json',
      'User-Agent':  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Referer':     'https://merchant.grab.com/',
      'Origin':      'https://merchant.grab.com',
    },
  });

  if (resp.status === 401 || resp.status === 403) {
    throw new Error(`AUTH_EXPIRED: ${resp.status}`);
  }
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status}: ${text.slice(0, 200)}`);
  }

  const json = await resp.json();

  // Auth expired signals inside JSON
  if (json.code === 401 || json.code === 40100 ||
      json.message?.toLowerCase().includes('unauthori') ||
      json.message?.toLowerCase().includes('token')) {
    throw new Error(`AUTH_EXPIRED: ${JSON.stringify(json).slice(0, 100)}`);
  }

  return json;
}

// ── price helpers ───────────────────────────────────────────────────────────

function parsePHP(priceInMin) {
  // priceInMin is price in PHP cents (55800 = ₱558.00)
  if (priceInMin == null) return null;
  return Math.round(priceInMin) / 100;
}

// ── webhook ─────────────────────────────────────────────────────────────────

async function postWebhook(payload) {
  const resp = await fetch(WEBHOOK_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  return resp.json();
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!SESSION_PATH) throw new Error('GRAB_SESSION_PATH not set');
  if (!WEBHOOK_URL)  throw new Error('WEBHOOK_URL not set');

  const cookieStr = loadGrabCookies(SESSION_PATH);
  const cookieCount = cookieStr.split(';').length;
  console.log(`Loaded ${cookieCount} cookies`);

  const checkedAt = new Date().toISOString();

  // 1. Fetch store list dynamically
  let stores;
  try {
    const storeData = await grabGet(
      cookieStr,
      'https://portal.grab.com/foodtroy/v1/PH/merchant-groups/catalog-stores?offset=0&limit=100&isWithItemPhotoCount=true'
    );
    stores = storeData.merchants || [];
    console.log(`Found ${stores.length} stores`);
  } catch (err) {
    if (err.message.startsWith('AUTH_EXPIRED')) {
      console.log('Session expired — notifying and exiting');
      await postWebhook({ store_id: 'SESSION_EXPIRED', store_name: 'SYSTEM', items: [], checked_at: checkedAt });
      process.exit(0);  // exit 0: session expiry is expected, not a workflow error
    }
    throw err;
  }

  if (!stores.length) {
    console.log('No stores returned — possible auth issue');
    await postWebhook({ store_id: 'SESSION_EXPIRED', store_name: 'SYSTEM', items: [], checked_at: checkedAt });
    process.exit(0);  // exit 0: session expiry is expected, not a workflow error
  }

  // 2. Check each store's menu
  for (const store of stores) {
    const { merchantID: storeId, merchantName: storeName } = store;
    console.log(`\nChecking: ${storeName} (${storeId})`);

    try {
      const menu = await grabGet(
        cookieStr,
        `https://api.grab.com/food/merchant/v2/menu?merchantID=${storeId}`
      );

      const categories = menu.categories || [];
      const items = [];
      for (const cat of categories) {
        for (const item of (cat.items || [])) {
          const price = parsePHP(item.priceInMin);
          if (price == null || price <= 0) continue;
          items.push({
            item_id:      item.itemID,
            name:         item.itemName,
            price_php:    price,
            is_available: item.availableStatus === 1,
            category:     cat.categoryName,
          });
        }
      }

      console.log(`  ${items.length} priced items across ${categories.length} categories`);

      if (!items.length) {
        console.log('  No priced items — skipping');
        continue;
      }

      const result = await postWebhook({
        store_id:   storeId,
        store_name: storeName,
        items,
        checked_at: checkedAt,
      });
      console.log(`  → ${JSON.stringify(result)}`);

    } catch (err) {
      if (err.message.startsWith('AUTH_EXPIRED')) {
        console.log('Session expired — notifying and exiting');
        await postWebhook({ store_id: 'SESSION_EXPIRED', store_name: 'SYSTEM', items: [], checked_at: checkedAt });
        process.exit(0);  // exit 0: session expiry is expected, not a workflow error
      }
      console.error(`  Error for ${storeName}:`, err.message);
    }
  }

  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
