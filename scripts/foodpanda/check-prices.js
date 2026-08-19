/**
 * FoodPanda PH Partner Portal price checker
 *
 * Strategy:
 *   1. Get JWT via direct auth API (already confirmed working)
 *   2. Try direct HTTP calls to DH partner backend API with the JWT
 *   3. If that fails, use Playwright to log in via browser form + intercept menu API
 *
 * Env vars (GitHub Actions secrets):
 *   FP_EMAIL_PARANAQUE, FP_PASSWORD_PARANAQUE
 *   FP_EMAIL_TAFT,      FP_PASSWORD_TAFT
 *   FP_EMAIL_QC,        FP_PASSWORD_QC
 *   WEBHOOK_URL
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

const AUTH_URL =
  'https://partner-auth.ap.prd.portal.restaurant/auth/v5/login-two-step';

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
  const token = data.access_token;
  if (!token) throw new Error('No access_token in login response');

  const accounts = data.profile?.accounts || [];
  const vendorIds = accounts.map(a => a.vendor_id).filter(Boolean);
  return { token, refreshToken: data.refresh_token || '', vendorIds, rawResponse: data };
}

// ── Direct API attempt (no browser needed) ───────────────────────────────────

const PARTNER_API_CANDIDATES = [
  (v) => `https://partner-backend.ap.prd.portal.restaurant/api/v1/vendor/${v}/menus`,
  (v) => `https://partner-backend.ap.prd.portal.restaurant/api/v3/vendors/${v}/products`,
  (v) => `https://partner-backend.ap.prd.portal.restaurant/api/v1/vendor/${v}/menu/categories`,
  (v) => `https://ap.prd.portal.restaurant/api/v1/vendor/${v}/menus`,
];

async function tryDirectAPI(token, vendorId) {
  for (const buildUrl of PARTNER_API_CANDIDATES) {
    const url = buildUrl(vendorId);
    try {
      const resp = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
          'User-Agent':    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Origin':        'https://partner.foodpanda.com',
          'Referer':       'https://partner.foodpanda.com/',
          'Accept':        'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!resp.ok) {
        console.log(`    Direct API ${resp.status}: ${url.slice(0, 60)}`);
        continue;
      }

      const ct = resp.headers.get('content-type') || '';
      if (!ct.includes('application/json')) continue;

      const json = await resp.json();
      const items = extractItemsFromResponse(json);
      if (items.length > 0) {
        console.log(`  ✓ Direct API captured ${items.length} items from: ${url.slice(0, 60)}`);
        return items;
      }
    } catch (err) {
      console.log(`    Direct API error (${url.slice(0, 50)}): ${err.message.slice(0, 60)}`);
    }
  }
  return [];
}

// ── Playwright browser login ──────────────────────────────────────────────────

async function checkViaPlaywright(account, browser, token) {
  const { email, password, storeName, vendorId } = account;

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport:  { width: 1280, height: 900 },
  });

  const capturedItems = [];
  const pendingJsonPromises = [];

  // Intercept ALL JSON responses mentioning menu/product/catalog/item/category
  context.on('response', (response) => {
    const url     = response.url();
    const status  = response.status();
    if (status !== 200) return;
    if (/\.(js|css|png|jpg|svg|ico|woff2?|ttf)(\?|$)/.test(url)) return;
    if (/analytics|hotjar|sentry|amplitude|segment|facebook|px-cloud|datadog/.test(url)) return;

    const ct = response.headers()['content-type'] || '';
    if (!ct.includes('application/json')) return;
    if (!/(menu|catalog|product|item|categor|dish)/i.test(url)) return;

    // Collect the promise; resolve safely to avoid crashing if context closes
    const p = response.json()
      .then(json => {
        const items = extractItemsFromResponse(json);
        if (items.length > 0) {
          console.log(`  Intercepted ${items.length} items from: ${url.slice(0, 80)}`);
          capturedItems.push(...items);
        }
      })
      .catch(() => {});
    pendingJsonPromises.push(p);
  });

  const page = await context.newPage();

  try {
    // ── Navigate to login page ────────────────────────────────────────────────
    console.log(`  [Playwright] Navigating to login...`);
    await page.goto('https://partner.foodpanda.com/login', {
      waitUntil: 'domcontentloaded',
      timeout:   30_000,
    });
    await page.waitForTimeout(2000);
    console.log(`  Login page URL: ${page.url()}`);

    // ── Fill email ─────────────────────────────────────────────────────────────
    const emailSel = 'input[type="email"], input[name="email"], input[name="username"], input[autocomplete="username"]';
    try {
      await page.waitForSelector(emailSel, { timeout: 10_000 });
      await page.fill(emailSel, email);
      console.log(`  ✓ Email filled`);
    } catch {
      console.log(`  ✗ Email input not found — page title: ${await page.title()}`);
      return capturedItems;
    }

    // Click Next / Continue (two-step portals have a separate password page)
    const submitSel = 'button[type="submit"]';
    await page.click(submitSel).catch(() => {});
    await page.waitForTimeout(2000);

    // ── Fill password ──────────────────────────────────────────────────────────
    const pwSel = 'input[type="password"]';
    try {
      await page.waitForSelector(pwSel, { timeout: 10_000 });
      await page.fill(pwSel, password);
      console.log(`  ✓ Password filled`);
    } catch {
      console.log(`  ✗ Password input not found after email submit`);
      return capturedItems;
    }

    await page.click(submitSel);
    console.log(`  Logging in...`);

    // ── Wait for post-login navigation ─────────────────────────────────────────
    await page.waitForURL(
      url => !url.toString().includes('/login') && !url.toString().includes('/auth'),
      { timeout: 30_000 }
    ).catch(() => {});
    await page.waitForTimeout(3000);
    console.log(`  Post-login URL: ${page.url()}`);

    // ── Navigate to menu management ────────────────────────────────────────────
    console.log(`  Loading /menu/items...`);
    await page.goto('https://partner.foodpanda.com/menu/items', {
      waitUntil: 'domcontentloaded',   // ← NOT networkidle (SPA never idles)
      timeout:   30_000,
    });
    // Wait for background API calls to fire and complete
    await page.waitForTimeout(10_000);

    // Fallback: try /menu/menus
    if (capturedItems.length === 0) {
      console.log(`  Trying /menu/menus...`);
      await page.goto('https://partner.foodpanda.com/menu/menus', {
        waitUntil: 'domcontentloaded',
        timeout:   20_000,
      });
      await page.waitForTimeout(6000);
    }

    // Wait for any still-pending JSON parsing
    await Promise.allSettled(pendingJsonPromises);

  } catch (err) {
    console.error(`  [Playwright] error: ${err.message.slice(0, 120)}`);
  } finally {
    await context.close();
  }

  return capturedItems;
}

// ── Item extraction helpers ───────────────────────────────────────────────────

function extractItemsFromResponse(json) {
  const items = [];

  // Pattern 1: categories with nested products
  const categories =
    json?.data?.categories ||
    json?.categories ||
    json?.data?.menus?.[0]?.categories ||
    json?.menus?.[0]?.categories ||
    [];

  for (const cat of categories) {
    const catName  = cat.name || cat.title || cat.category_name || '';
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
    const products =
      json?.data?.products ||
      json?.products        ||
      json?.items           ||
      json?.data?.items     ||
      [];
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
  for (const field of [
    'price', 'selling_price', 'list_price', 'discounted_price',
    'original_price', 'base_price', 'platform_price',
  ]) {
    const v = p[field];
    if (v != null && !isNaN(parseFloat(v)) && parseFloat(v) > 0) {
      return parseFloat(v);
    }
  }
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

async function checkAccount(account, browser) {
  const { email, password, storeName, vendorId } = account;
  console.log(`\n──── ${storeName} (${vendorId}) ────`);
  const checkedAt = new Date().toISOString();

  // Step 1: Get JWT
  let token;
  try {
    const result = await getFreshToken(email, password);
    token = result.token;
    console.log(`  ✓ JWT acquired. Vendor IDs: ${result.vendorIds.join(', ')}`);
  } catch (err) {
    console.error(`  ✗ Auth failed: ${err.message}`);
    await postWebhook({ vendor_id: 'AUTH_FAILED', vendor_name: storeName, items: [], checked_at: checkedAt });
    return;
  }

  // Step 2: Try direct HTTP API first (fast, no browser)
  console.log(`  Trying direct API calls...`);
  let items = await tryDirectAPI(token, vendorId);

  // Step 3: Fall back to Playwright browser login
  if (items.length === 0) {
    console.log(`  Direct API returned 0 items — switching to Playwright browser login...`);
    items = await checkViaPlaywright(account, browser, token);
  }

  // Step 4: Deduplicate and send
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
    console.log(`  ⚠ No items captured`);
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
