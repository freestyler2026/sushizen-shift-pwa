/**
 * FoodPanda PH Partner Portal price checker — Playwright-based
 *
 * Logs in fresh each run (no session state needed), navigates to Menu Management,
 * intercepts the API calls the portal makes, and POSTs each store's snapshot to
 * the Heroku webhook.
 *
 * Auth: POST partner-auth.ap.prd.portal.restaurant/auth/v5/login-two-step
 * Menu: intercepted from the portal's internal BFF/API requests
 *
 * Env vars (set as GitHub Actions secrets):
 *   FP_EMAIL_PARANAQUE   contact@ramensushizen.com
 *   FP_PASSWORD_PARANAQUE Sushizen@2025
 *   FP_EMAIL_TAFT        taft2025zen@gmail.com
 *   FP_PASSWORD_TAFT     Sushizentaft@2025
 *   FP_EMAIL_QC          qc2025zen@gmail.com
 *   FP_PASSWORD_QC       Sushizenqc@2025
 *   WEBHOOK_URL          https://…/api/foodpanda/portal-price-snapshot
 */

const { chromium } = require('playwright');

const WEBHOOK_URL = process.env.WEBHOOK_URL;
if (!WEBHOOK_URL) throw new Error('WEBHOOK_URL not set');

const ACCOUNTS = [
  {
    email:     process.env.FP_EMAIL_PARANAQUE    || 'contact@ramensushizen.com',
    password:  process.env.FP_PASSWORD_PARANAQUE || 'Sushizen@2025',
    storeName: 'Sushi Zen - Paranaque',
    vendorId:  't0z4',
  },
  {
    email:     process.env.FP_EMAIL_TAFT    || 'taft2025zen@gmail.com',
    password:  process.env.FP_PASSWORD_TAFT || 'Sushizentaft@2025',
    storeName: 'Sushi Zen - Taft',
    vendorId:  'ryqc',
  },
  {
    email:     process.env.FP_EMAIL_QC    || 'qc2025zen@gmail.com',
    password:  process.env.FP_PASSWORD_QC || 'Sushizenqc@2025',
    storeName: 'Sushi Zen - Cubao',
    vendorId:  'a97i',
  },
];

// ── Auth (direct API — works without browser) ────────────────────────────────

const AUTH_URL = 'https://partner-auth.ap.prd.portal.restaurant/auth/v5/login-two-step';

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
  const token = data.access_token;
  if (!token) throw new Error(`No access_token in login response`);

  // Extract vendor IDs from the accounts array
  const accounts = (data.profile?.accounts || []);
  const vendorIds = accounts.map(a => a.vendor_id).filter(Boolean);

  return { token, vendorIds, accounts };
}

// ── Menu extraction helpers ───────────────────────────────────────────────────

function extractItemsFromResponse(json, storeName, vendorId) {
  const items = [];

  // Pattern 1: DH/FoodPanda menu-management API response
  // { data: { categories: [{ name, products: [{ name, price, ... }] }] } }
  const categories =
    json?.data?.categories ||
    json?.categories ||
    json?.data?.menus?.[0]?.categories ||
    json?.menus?.[0]?.categories ||
    [];

  for (const cat of categories) {
    const catName = cat.name || cat.title || cat.category_name || '';
    const products = cat.products || cat.items || cat.dishes || [];
    for (const p of products) {
      const price = extractPrice(p);
      if (price == null || price <= 0) continue;
      items.push({
        item_id:      String(p.id || p.product_id || p.item_id || ''),
        name:         p.name || p.title || p.product_name || '',
        price_php:    price,
        is_available: parseAvailability(p),
        category:     catName,
      });
    }
  }

  // Pattern 2: flat products list
  if (!items.length) {
    const products = json?.data?.products || json?.products || json?.items || [];
    for (const p of products) {
      const price = extractPrice(p);
      if (price == null || price <= 0) continue;
      items.push({
        item_id:      String(p.id || p.product_id || ''),
        name:         p.name || p.title || '',
        price_php:    price,
        is_available: parseAvailability(p),
        category:     p.category_name || p.category || '',
      });
    }
  }

  return items;
}

function extractPrice(p) {
  // Check common price fields
  for (const field of [
    'price', 'selling_price', 'list_price', 'discounted_price',
    'original_price', 'base_price', 'platform_price',
  ]) {
    const v = p[field];
    if (v != null && !isNaN(parseFloat(v)) && parseFloat(v) > 0) {
      return parseFloat(v);
    }
  }

  // Nested: p.prices.price or p.price_metadata.price
  for (const nested of [p.prices, p.price_metadata, p.pricing]) {
    if (nested && typeof nested === 'object') {
      for (const field of ['price', 'selling_price', 'list_price']) {
        const v = nested[field];
        if (v != null && !isNaN(parseFloat(v)) && parseFloat(v) > 0) {
          return parseFloat(v);
        }
      }
    }
  }

  return null;
}

function parseAvailability(p) {
  for (const field of ['is_available', 'available', 'is_active', 'active', 'status']) {
    const v = p[field];
    if (v === false || v === 'unavailable' || v === 'inactive' || v === 0) return false;
    if (v === true || v === 'available' || v === 'active' || v === 1) return true;
  }
  return true; // default to available
}

// ── Webhook POST ──────────────────────────────────────────────────────────────

async function postWebhook(payload) {
  const resp = await fetch(WEBHOOK_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  return resp.json().catch(() => resp.text());
}

// ── Per-account price check via Playwright ────────────────────────────────────

async function checkAccount(account, browser) {
  const { email, password, storeName, vendorId } = account;
  console.log(`\n──── ${storeName} (${vendorId}) ────`);
  const checkedAt = new Date().toISOString();

  // 1. Get fresh JWT via direct API
  console.log(`  Authenticating as ${email}...`);
  let token, authAccounts;
  try {
    const result = await getFreshToken(email, password);
    token = result.token;
    authAccounts = result.accounts;
    console.log(`  ✓ Token received. Vendors: ${result.vendorIds.join(', ')}`);
  } catch (err) {
    console.error(`  ✗ Auth failed: ${err.message}`);
    await postWebhook({ vendor_id: 'AUTH_FAILED', vendor_name: storeName, items: [], checked_at: checkedAt });
    return;
  }

  // 2. Use Playwright to navigate the portal with the JWT injected
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport:  { width: 1280, height: 900 },
  });

  // Inject JWT into localStorage BEFORE navigation so the app picks it up
  await context.addInitScript((jwt) => {
    // The portal stores auth in localStorage under various keys
    const authState = {
      access_token: jwt,
      token_type:   'Bearer',
      isAuthenticated: true,
    };
    // Try common localStorage key patterns used by DH portals
    localStorage.setItem('access_token', jwt);
    localStorage.setItem('auth_token', jwt);
    // persist:root key used by Redux Persist
    try {
      const root = JSON.parse(localStorage.getItem('persist:root') || '{}');
      root.authentication = JSON.stringify({
        ...JSON.parse(root.authentication || '{}'),
        isAuthenticated: true,
      });
      localStorage.setItem('persist:root', JSON.stringify(root));
    } catch (_) {}
  }, token);

  const page = await context.newPage();

  // 3. Intercept responses that look like menu/catalog APIs
  const capturedItems = [];
  let capturedFrom = '';

  page.on('response', async (response) => {
    const url = response.url();
    const status = response.status();
    if (status !== 200) return;

    // Skip static/tracking/analytics
    if (/\.(js|css|png|jpg|svg|ico|woff2?|ttf)(\?|$)/.test(url)) return;
    if (/google-analytics|hotjar|sentry|amplitude|px-cloud|datadog|segment|facebook/.test(url)) return;

    // Only intercept JSON API responses
    const ct = response.headers()['content-type'] || '';
    if (!ct.includes('application/json')) return;

    // Match menu-related URLs
    const isMenuUrl = /(menu|catalog|product|item|categor|dish)/i.test(url);
    if (!isMenuUrl) return;

    try {
      const json = await response.json();
      const items = extractItemsFromResponse(json, storeName, vendorId);
      if (items.length > 0) {
        console.log(`  Captured ${items.length} items from: ${url.slice(0, 80)}`);
        capturedItems.push(...items);
        capturedFrom = url;
      }
    } catch (_) {}
  });

  try {
    // Navigate to the portal (will use the JWT we injected)
    console.log(`  Navigating to portal...`);
    await page.goto('https://partner.foodpanda.com/', {
      waitUntil: 'domcontentloaded',
      timeout:   30_000,
    });

    // Give the portal time to auth and load
    await page.waitForTimeout(3000);

    // Navigate directly to menu management
    console.log(`  Loading menu management...`);
    await page.goto(`https://partner.foodpanda.com/menu/items`, {
      waitUntil: 'networkidle',
      timeout:   30_000,
    });

    // Wait for API calls to complete
    await page.waitForTimeout(5000);

    // If nothing captured yet, try navigating to menu/menus which triggers the categories API
    if (capturedItems.length === 0) {
      await page.goto(`https://partner.foodpanda.com/menu/menus`, {
        waitUntil: 'networkidle',
        timeout:   20_000,
      });
      await page.waitForTimeout(3000);
    }

  } catch (err) {
    console.error(`  Navigation error: ${err.message}`);
  }

  await context.close();

  // 4. Send results
  if (capturedItems.length > 0) {
    console.log(`  Sending ${capturedItems.length} items to webhook...`);
    // Deduplicate by item_id
    const seen = new Set();
    const uniqueItems = capturedItems.filter(item => {
      const key = `${item.item_id}|${item.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const result = await postWebhook({
      vendor_id:   vendorId,
      vendor_name: storeName,
      items:       uniqueItems,
      checked_at:  checkedAt,
    });
    console.log(`  ✓ Webhook result: ${JSON.stringify(result).slice(0, 100)}`);
  } else {
    console.log(`  ⚠ No items captured — portal may require manual session setup`);
    // Notify about session issue
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

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  try {
    for (const account of ACCOUNTS) {
      await checkAccount(account, browser);
    }
  } finally {
    await browser.close();
  }

  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
