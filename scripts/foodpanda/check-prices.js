/**
 * FoodPanda PH price checker
 *
 * API discovered from partner portal DevTools:
 *   https://vendor-api-gdp-ph.as.restaurant-partners.com/api/5/platforms/FP_PH/vendors/{vendorId}/...
 *
 * Flow:
 *   1. Auth  → POST partner-auth.ap.prd.portal.restaurant/auth/v5/login-two-step  (JWT, no 2FA)
 *   2. Catalogs → GET .../vendors/{vendorId}/catalogs
 *   3. Categories → GET .../catalogs/{catalogId}/categories
 *   4. Products  → GET .../categories/{categoryId}/products  (per category)
 *   All with Authorization: Bearer {jwt}
 *
 * Env vars (GitHub Actions secrets):
 *   FP_EMAIL_PARANAQUE, FP_PASSWORD_PARANAQUE
 *   FP_EMAIL_TAFT,      FP_PASSWORD_TAFT
 *   FP_EMAIL_QC,        FP_PASSWORD_QC
 *   WEBHOOK_URL
 */

const WEBHOOK_URL = process.env.WEBHOOK_URL;
if (!WEBHOOK_URL) throw new Error('WEBHOOK_URL not set');

const AUTH_URL  = 'https://partner-auth.ap.prd.portal.restaurant/auth/v5/login-two-step';
const VENDOR_API = 'https://vendor-api-gdp-ph.as.restaurant-partners.com';
const PLATFORM  = 'FP_PH';

const ACCOUNTS = [
  {
    email:     process.env.FP_EMAIL_PARANAQUE,
    password:  process.env.FP_PASSWORD_PARANAQUE,
    storeName: 'Sushi Zen - Paranaque',
    vendorId:  't0z4',
  },
  {
    email:     process.env.FP_EMAIL_TAFT,
    password:  process.env.FP_PASSWORD_TAFT,
    storeName: 'Sushi Zen - Taft',
    vendorId:  'ryqc',
  },
  {
    email:     process.env.FP_EMAIL_QC,
    password:  process.env.FP_PASSWORD_QC,
    storeName: 'Sushi Zen - Cubao',
    vendorId:  'a97i',
  },
];

// ── Auth ─────────────────────────────────────────────────────────────────────

async function getFreshToken(email, password) {
  const resp = await fetch(AUTH_URL, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Origin':       'https://partner.foodpanda.com',
      'Referer':      'https://partner.foodpanda.com/login',
    },
    body: JSON.stringify({ username: email, password, type: 'password' }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Login failed ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = await resp.json();
  if (!data.access_token) throw new Error('No access_token in login response');

  const vendorIds = (data.profile?.accounts || []).map(a => a.vendor_id).filter(Boolean);
  return { token: data.access_token, vendorIds };
}

// ── Vendor API helpers ────────────────────────────────────────────────────────

function vendorApiHeaders(token) {
  return {
    'Authorization':  `Bearer ${token}`,
    'Accept':         'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin':         'https://partner.foodpanda.com',
    'Referer':        'https://partner.foodpanda.com/',
    'User-Agent':     'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  };
}

async function apiFetch(url, token) {
  const resp = await fetch(url, {
    headers: vendorApiHeaders(token),
    signal:  AbortSignal.timeout(15_000),
  });
  if (!resp.ok) {
    throw new Error(`${resp.status} ${resp.statusText} — ${url.slice(0, 80)}`);
  }
  return resp.json();
}

// ── Menu price fetch ──────────────────────────────────────────────────────────

async function fetchAllProducts(vendorId, token) {
  const base = `${VENDOR_API}/api/5/platforms/${PLATFORM}/vendors/${vendorId}`;

  // Step 1: Get catalogs — response shape: { catalogs: [{id, name, categories: [{id, name}]}] }
  const catalogsData = await apiFetch(`${base}/catalogs?locale=en`, token);
  const catalogs = catalogsData?.catalogs ?? catalogsData?.data ?? catalogsData ?? [];
  if (!Array.isArray(catalogs) || catalogs.length === 0) {
    console.log(`    Raw catalogs response: ${JSON.stringify(catalogsData).slice(0, 300)}`);
    return [];
  }
  console.log(`    Catalogs: ${catalogs.length} found`);

  const allItems = [];

  for (const catalog of catalogs) {
    const catalogId   = catalog.id || catalog.catalog_id;
    const catalogName = catalog.name || catalog.title || catalogId;
    if (!catalogId) continue;

    // Categories are embedded in the catalog object — no extra API call needed
    const categories = catalog.categories ?? [];
    console.log(`    Catalog "${catalogName}" (${catalogId}) → ${categories.length} categories`);

    // Step 2: Get products per category
    for (const cat of categories) {
      const categoryId   = cat.id || cat.category_id;
      const categoryName = cat.name || cat.title || categoryId;
      if (!categoryId) continue;

      try {
        const prodData = await apiFetch(
          `${base}/catalogs/${catalogId}/categories/${categoryId}/products?locale=en&sizeSupport=true`,
          token
        );
        const products = prodData?.data ?? prodData?.products ?? prodData ?? [];

        if (!Array.isArray(products)) {
          console.log(`      [${categoryName}] Non-array products: ${JSON.stringify(prodData).slice(0, 200)}`);
          continue;
        }
        if (products.length === 0) continue;

        // Log first product of first non-empty category for debugging
        if (allItems.length === 0) {
          console.log(`      [${categoryName}] ${products.length} products. First: ${JSON.stringify(products[0]).slice(0, 250)}`);
        }

        for (const p of products) {
          const price = extractPrice(p);
          if (price == null || price <= 0) continue;
          allItems.push({
            item_id:      String(p.id || p.product_id || ''),
            name:         p.name || p.title || '',
            price_php:    price,
            is_available: parseAvailability(p),
            category:     categoryName,
          });
        }
      } catch (err) {
        console.log(`      Products error for ${categoryName}: ${err.message}`);
      }
    }
  }

  return allItems;
}

// ── Price / availability extractors ──────────────────────────────────────────

function extractPrice(p) {
  // FoodPanda API typically uses 'price' field directly (in PHP)
  for (const field of [
    'price', 'selling_price', 'list_price', 'discounted_price',
    'original_price', 'base_price', 'platform_price',
  ]) {
    const v = p[field];
    if (v != null && !isNaN(parseFloat(v)) && parseFloat(v) > 0) return parseFloat(v);
  }
  for (const nested of [p.prices, p.price_metadata, p.pricing]) {
    if (nested && typeof nested === 'object') {
      for (const field of ['price', 'selling_price', 'list_price']) {
        const v = nested[field];
        if (v != null && !isNaN(parseFloat(v)) && parseFloat(v) > 0) return parseFloat(v);
      }
    }
  }
  return null;
}

function parseAvailability(p) {
  for (const field of ['is_available', 'available', 'is_active', 'active', 'status']) {
    const v = p[field];
    if (v === false || v === 'unavailable' || v === 'inactive' || v === 0) return false;
    if (v === true  || v === 'available'   || v === 'active'   || v === 1) return true;
  }
  return true;
}

// ── Webhook ───────────────────────────────────────────────────────────────────

async function postWebhook(payload) {
  const resp = await fetch(WEBHOOK_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  return resp.json().catch(() => resp.text());
}

// ── Per-account orchestration ─────────────────────────────────────────────────

async function checkAccount(account) {
  const { email, password, storeName, vendorId } = account;
  console.log(`\n──── ${storeName} (${vendorId}) ────`);
  const checkedAt = new Date().toISOString();

  // Step 1: Get JWT (no browser, no 2FA)
  let token;
  try {
    const result = await getFreshToken(email, password);
    token = result.token;
    console.log(`  ✓ JWT acquired (vendor IDs: ${result.vendorIds.join(', ')})`);
  } catch (err) {
    console.error(`  ✗ Auth failed: ${err.message}`);
    await postWebhook({ vendor_id: 'AUTH_FAILED', vendor_name: storeName, items: [], checked_at: checkedAt });
    return;
  }

  // Step 2: Fetch all products via vendor API
  let items = [];
  try {
    items = await fetchAllProducts(vendorId, token);
    console.log(`  ✓ Fetched ${items.length} products`);
  } catch (err) {
    console.error(`  ✗ Vendor API error: ${err.message}`);
  }

  // Deduplicate by item_id + name
  const seen = new Set();
  const uniqueItems = items.filter(item => {
    const key = `${item.item_id}|${item.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (uniqueItems.length > 0) {
    console.log(`  Sending ${uniqueItems.length} items to webhook...`);
    const result = await postWebhook({
      vendor_id:   vendorId,
      vendor_name: storeName,
      items:       uniqueItems,
      checked_at:  checkedAt,
    });
    console.log(`  ✓ Webhook: ${JSON.stringify(result).slice(0, 100)}`);
  } else {
    console.log(`  ⚠ No items — sending SESSION_REQUIRED`);
    await postWebhook({
      vendor_id:   'SESSION_REQUIRED',
      vendor_name: storeName,
      items:       [],
      checked_at:  checkedAt,
    });
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`FoodPanda PH Price Check — ${new Date().toISOString()}`);
  for (const account of ACCOUNTS) {
    await checkAccount(account);
  }
  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
