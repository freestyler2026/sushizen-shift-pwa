/**
 * Talabat Partner Portal price checker — runs in GitHub Actions via direct HTTP.
 *
 * Fetches menu prices for all 14 Dubai vendors from the Talabat vendor API.
 * Auth: OIDC Bearer token from localStorage + cookies (captured by setup-session.js).
 * API base: https://vendor-api-ae-lb.me.restaurant-partners.com
 *
 * Required env vars:
 *   TALABAT_SESSION_PATH  Path to the decoded session JSON file
 *   WEBHOOK_URL           POST endpoint for each vendor snapshot
 */
const fs = require('fs');

const SESSION_PATH = process.env.TALABAT_SESSION_PATH;
const WEBHOOK_URL  = process.env.WEBHOOK_URL;

// All 14 Dubai vendor IDs (Sushi ZEN + Ramen ZEN)
const VENDOR_IDS = [
  723150, 765535, 763564, 761205, 759210, 761204,
  762721, 723685, 723684, 723686, 729481, 744680, 719717, 719720,
];

const API_BASE   = 'https://vendor-api-ae-lb.me.restaurant-partners.com';
const PORTAL_URL = 'https://partner-app.talabat.com';

// ── session loader ────────────────────────────────────────────────────────────

function loadTalabatSession(sessionPath) {
  const state = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

  // Cookies for the UI and vendor API domains
  const cookies = state.cookies
    .filter(c => c.domain && (
      c.domain.includes('restaurant-partners.com') ||
      c.domain.includes('talabat.com')
    ))
    .map(c => `${c.name}=${c.value}`)
    .join('; ');

  // Bearer token: stored explicitly by trim-session.js (captured from real browser headers)
  let bearerToken = state.bearerToken || null;

  // Fallback: try OIDC localStorage entries (for sessions captured before trim-session update)
  if (!bearerToken) {
    for (const origin of (state.origins || [])) {
      if (!origin.origin.includes('talabat.com')) continue;
      for (const entry of (origin.localStorage || [])) {
        if (entry.name.startsWith('oidc.user:') || entry.name.match(/access_token|auth_token/i)) {
          try {
            const val = JSON.parse(entry.value);
            if (val.access_token) { bearerToken = val.access_token; break; }
          } catch (_) {
            if (entry.value && entry.value.length > 100 && !entry.value.includes(' ')) {
              bearerToken = entry.value;
            }
          }
        }
      }
      if (bearerToken) break;
    }
  }

  return { cookies, bearerToken };
}

// ── API helper ────────────────────────────────────────────────────────────────

async function talabatGet(session, url) {
  const headers = {
    'Accept':              'application/json, text/plain, */*',
    'Accept-Language':     'en-US,en;q=0.9',
    'User-Agent':          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Origin':              PORTAL_URL,
    'Referer':             `${PORTAL_URL}/`,
    // Required by the vendor API to identify the client
    'client-name':         'OneWeb',
    'client-wrapper-type': 'Web',
    'client-version':      'menuManagementV2_1.14.25',
    'x-rps-client-app-name': 'OneWeb',
  };
  if (session.cookies)     headers['Cookie']        = session.cookies;
  if (session.bearerToken) headers['Authorization'] = `Bearer ${session.bearerToken}`;

  const resp = await fetch(url, { headers });

  if (resp.status === 401 || resp.status === 403) {
    throw new Error(`AUTH_EXPIRED: ${resp.status} — ${url}`);
  }
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

// ── price parser ──────────────────────────────────────────────────────────────

function parseAed(product) {
  // Try common field paths in order of preference (selling price first)
  const candidates = [
    product.discountedPrice?.amount,
    product.price?.amount,
    product.originalPrice?.amount,
    product.pricing?.discountedPrice,
    product.pricing?.price,
    product.priceInfo?.discountedPrice,
    product.priceInfo?.price,
    product.sellingPrice,
    product.price,
  ];

  for (const val of candidates) {
    if (val == null || typeof val !== 'number' || val <= 0) continue;
    // Talabat stores prices in fils (1/100 AED). Items are typically 20–500 AED.
    // If the value exceeds 5000, it is almost certainly in fils → divide by 100.
    return val > 5000 ? Math.round(val) / 100 : val;
  }
  return null;
}

function parseAvailable(product) {
  if (product.isAvailable === false) return false;
  if (product.status === 'unavailable' || product.status === 'out_of_stock') return false;
  return true;
}

// ── webhook ───────────────────────────────────────────────────────────────────

async function postWebhook(payload) {
  const resp = await fetch(WEBHOOK_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Webhook ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

// ── vendor processing ─────────────────────────────────────────────────────────

async function processVendor(session, vendorId, checkedAt) {
  // 1. Fetch vendor name
  let vendorName = `Vendor-${vendorId}`;
  try {
    const info = await talabatGet(
      session,
      `${API_BASE}/api/1/dine-in/TB_AE/vendor/${vendorId}`
    );
    vendorName = info.name || info.vendor?.name || info.restaurantName ||
                 info.displayName || vendorName;
  } catch (e) {
    if (e.message.startsWith('AUTH_EXPIRED')) throw e;
    console.log(`  ⚠ Could not fetch vendor info: ${e.message}`);
  }
  console.log(`  Name: ${vendorName}`);

  // 2. Fetch catalog list
  const catalogData = await talabatGet(
    session,
    `${API_BASE}/api/5/platforms/TB_AE/vendors/${vendorId}/catalogs` +
    `?locale=en-AE&includeEmptyResources=true&sizeSupport=true`
  );

  const catalogs = catalogData.catalogs || catalogData.data || [];
  if (!catalogs.length) {
    console.log('  No catalogs found');
    console.log('  Response keys:', Object.keys(catalogData).join(', '));
    return { vendorName, items: [] };
  }
  // DEBUG: inspect first catalog structure
  const firstCat = catalogs[0];
  console.log(`  Catalog[0] keys: ${Object.keys(firstCat).join(', ')}`);
  const cats = firstCat.categories || firstCat.sections || firstCat.groups || [];
  console.log(`  categories/sections count: ${cats.length}`);
  if (cats.length > 0) {
    const firstSection = cats[0];
    console.log(`  Section[0] keys: ${Object.keys(firstSection).join(', ')}`);
    const prods = firstSection.products || firstSection.items || firstSection.menuItems || [];
    console.log(`  Section[0] product count: ${prods.length}`);
    if (prods.length > 0) {
      console.log(`  Product[0] keys: ${Object.keys(prods[0]).join(', ')}`);
      console.log(`  Product[0] sample: ${JSON.stringify(prods[0]).slice(0, 300)}`);
    }
  }

  const items = [];

  // 3. Iterate catalogs → categories → products
  for (const catalog of catalogs) {
    const catalogId  = catalog.id;
    const categories = catalog.categories || [];

    for (const cat of categories) {
      const categoryId   = cat.id;
      const categoryName = cat.name || cat.title || '';

      // Products may be inline or require a separate fetch
      let products = cat.products || cat.items || [];

      if (!products.length) {
        try {
          const prodData = await talabatGet(
            session,
            `${API_BASE}/api/5/platforms/TB_AE/vendors/${vendorId}` +
            `/catalogs/${catalogId}/categories/${categoryId}/products` +
            `?locale=en-AE&sizeSupport=true`
          );
          // DEBUG: log first category product fetch (only for first vendor first category)
          if (items.length === 0 && categories.indexOf(cat) === 0) {
            console.log(`    ProdFetch keys: ${Object.keys(prodData).join(', ')}`);
            console.log(`    ProdFetch sample: ${JSON.stringify(prodData).slice(0, 400)}`);
          }
          products = prodData.products || prodData.items || prodData.data || [];
        } catch (e) {
          if (e.message.startsWith('AUTH_EXPIRED')) throw e;
          console.log(`    Category ${categoryId} error: ${e.message}`);
          continue;
        }
      }

      for (const p of products) {
        const price  = parseAed(p);
        if (price == null || price <= 0) continue;
        const rawId  = String(p.id || p.itemId || p.productId || '');
        if (!rawId) continue;
        items.push({
          item_id:      `${vendorId}_${rawId}`,
          name:         p.name || p.title || p.itemName || rawId,
          price_aed:    price,
          is_available: parseAvailable(p),
          category:     categoryName,
        });
      }
    }
  }

  return { vendorName, items };
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!SESSION_PATH) throw new Error('TALABAT_SESSION_PATH not set');
  if (!WEBHOOK_URL)  throw new Error('WEBHOOK_URL not set');

  const session = loadTalabatSession(SESSION_PATH);
  const cookieCount = session.cookies ? session.cookies.split(';').length : 0;
  console.log(`Loaded session: ${cookieCount} cookies, bearer=${!!session.bearerToken}`);

  const checkedAt = new Date().toISOString();

  for (const vendorId of VENDOR_IDS) {
    console.log(`\nVendor ${vendorId}:`);
    try {
      const { vendorName, items } = await processVendor(session, vendorId, checkedAt);
      console.log(`  ${items.length} priced items`);

      if (!items.length) {
        console.log('  No priced items — skipping');
        continue;
      }

      const result = await postWebhook({
        vendor_id:   String(vendorId),
        vendor_name: vendorName,
        items,
        checked_at:  checkedAt,
      });
      console.log(`  → ${JSON.stringify(result)}`);

      // Polite delay between vendors
      await new Promise(r => setTimeout(r, 400));

    } catch (err) {
      if (err.message.startsWith('AUTH_EXPIRED')) {
        console.log('Session expired — notifying webhook and exiting');
        try {
          await postWebhook({
            vendor_id:   'SESSION_EXPIRED',
            vendor_name: 'SYSTEM',
            items:       [],
            checked_at:  checkedAt,
          });
        } catch (_) {}
        process.exit(1);
      }
      console.error(`  Error for vendor ${vendorId}:`, err.message);
    }
  }

  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
