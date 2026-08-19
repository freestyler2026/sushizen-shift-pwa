/**
 * FoodPanda PH price checker
 *
 * Strategy (in order of priority):
 *   1. Public FoodPanda customer API  — no auth, no Cloudflare block
 *   2. Playwright + JWT localStorage  — inject JWT from auth API (no 2FA), skip login form
 *   3. SESSION_REQUIRED fallback      — notify via Discord DM
 *
 * Why skip browser form login: GitHub Actions IPs are flagged as "new devices"
 * and FoodPanda redirects to /2fa. The direct auth API returns a JWT without 2FA.
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
    email:          process.env.FP_EMAIL_PARANAQUE    || 'contact@ramensushizen.com',
    password:       process.env.FP_PASSWORD_PARANAQUE || 'Sushizen@2025',
    storeName:      'Sushi Zen - Paranaque',
    vendorId:       't0z4',
    globalVendorId: 'HP6SJW',
  },
  {
    email:          process.env.FP_EMAIL_TAFT    || 'taft2025zen@gmail.com',
    password:       process.env.FP_PASSWORD_TAFT || 'Sushizentaft@2025',
    storeName:      'Sushi Zen - Taft',
    vendorId:       'ryqc',
    globalVendorId: 'HPMI1R',
  },
  {
    email:          process.env.FP_EMAIL_QC    || 'qc2025zen@gmail.com',
    password:       process.env.FP_PASSWORD_QC || 'Sushizenqc@2025',
    storeName:      'Sushi Zen - Cubao',
    vendorId:       'a97i',
    globalVendorId: 'HP7R23',
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

  const accounts     = data.profile?.accounts || [];
  const vendorIds    = accounts.map(a => a.vendor_id).filter(Boolean);
  const refreshToken = data.refresh_token || '';
  return { token, refreshToken, vendorIds, accounts };
}

// ── Strategy 1: Public FoodPanda customer API ─────────────────────────────────

async function tryPublicAPI(globalVendorId, vendorId) {
  // FoodPanda PH public menu API patterns (no auth required)
  const candidates = [
    `https://www.foodpanda.ph/api/v3/vendors/${globalVendorId}/menus`,
    `https://www.foodpanda.ph/api/v3/vendors/${vendorId}/menus`,
    `https://www.foodpanda.ph/api/v1/vendors/${globalVendorId}/menus`,
    `https://www.foodpanda.ph/api/v1/vendors/${vendorId}/menus`,
    `https://www.foodpanda.ph/gw/api/v3/vendors/${globalVendorId}/menus`,
    `https://www.foodpanda.ph/gw/api/v3/vendors/${vendorId}/menus`,
    // Vendor info (may embed menu)
    `https://www.foodpanda.ph/api/v3/vendors/${globalVendorId}`,
    `https://www.foodpanda.ph/api/v3/vendors/${vendorId}`,
  ];

  for (const url of candidates) {
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept':          'application/json, text/plain, */*',
          'Accept-Language': 'en-PH,en-US;q=0.9,en;q=0.8',
          'Referer':         'https://www.foodpanda.ph/',
          'Origin':          'https://www.foodpanda.ph',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!resp.ok) {
        console.log(`    Public API ${resp.status}: ${url.slice(0, 70)}`);
        continue;
      }
      const ct = resp.headers.get('content-type') || '';
      if (!ct.includes('application/json')) continue;

      const json  = await resp.json();
      const items = extractItemsFromResponse(json);
      if (items.length > 0) {
        console.log(`  ✓ Public API: ${items.length} items from ${url.slice(0, 70)}`);
        return items;
      }
      console.log(`    Public API 200 but 0 items: ${url.slice(0, 70)}`);
    } catch (err) {
      console.log(`    Public API error (${url.slice(0, 50)}): ${err.message.slice(0, 60)}`);
    }
  }
  return [];
}

// ── Strategy 2: Playwright + JWT localStorage injection (bypass login / 2FA) ──

async function tryPlaywrightLocalStorage(account, browser, token) {
  const { storeName, vendorId } = account;

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport:  { width: 1280, height: 900 },
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  // Inject JWT into localStorage BEFORE any navigation — the SPA reads this on startup
  await context.addInitScript((jwt) => {
    // Try every key pattern used by Delivery Hero / FoodPanda partner portals
    const keys = [
      'access_token', 'auth_token', 'token', 'fp-access-token',
      'partner-portal-token', 'ph_fp_partner_token',
    ];
    keys.forEach(k => {
      try { localStorage.setItem(k, jwt); } catch (_) {}
    });

    // Redux Persist (most likely pattern for React SPAs)
    try {
      const raw  = localStorage.getItem('persist:root') || '{}';
      const root = JSON.parse(raw);
      const auth = JSON.parse(root.authentication || '{}');
      auth.isAuthenticated = true;
      auth.accessToken     = jwt;
      auth.access_token    = jwt;
      auth.token           = jwt;
      root.authentication  = JSON.stringify(auth);
      localStorage.setItem('persist:root', JSON.stringify(root));
    } catch (_) {}

    // Session storage as well
    try { sessionStorage.setItem('access_token', jwt); } catch (_) {}
  }, token);

  const capturedItems  = [];
  const pendingPromises = [];

  // Intercept all JSON responses that look like menu/catalog/product data
  context.on('response', (response) => {
    const url    = response.url();
    const status = response.status();
    if (status !== 200) return;
    if (/\.(js|css|png|jpg|svg|ico|woff2?|ttf)(\?|$)/.test(url)) return;
    if (/analytics|hotjar|sentry|amplitude|segment|facebook|px-cloud|datadog|cloudfront/.test(url)) return;

    const ct = response.headers()['content-type'] || '';
    if (!ct.includes('application/json')) return;
    if (!/(menu|catalog|product|item|categor|dish)/i.test(url)) return;

    const p = response.json()
      .then(json => {
        const items = extractItemsFromResponse(json);
        if (items.length > 0) {
          console.log(`  Intercepted ${items.length} items from: ${url.slice(0, 80)}`);
          capturedItems.push(...items);
        }
      })
      .catch(() => {});
    pendingPromises.push(p);
  });

  const page = await context.newPage();

  try {
    // Navigate directly to portal root (NOT /login — avoids triggering 2FA flow)
    console.log(`  [Playwright] Navigating with JWT injected (skip login)...`);
    await page.goto('https://partner.foodpanda.com/', {
      waitUntil: 'domcontentloaded',
      timeout:   30_000,
    });
    await page.waitForTimeout(3000);
    console.log(`  URL after root: ${page.url()}`);

    // If redirected to login, the localStorage injection didn't work
    if (page.url().includes('/login') || page.url().includes('/auth')) {
      console.log(`  ✗ Redirected to login — localStorage injection not sufficient`);
      return capturedItems;
    }

    // Navigate to menu management
    console.log(`  [Playwright] Loading /menu/items...`);
    await page.goto('https://partner.foodpanda.com/menu/items', {
      waitUntil: 'domcontentloaded',  // NOT networkidle (SPA never idles)
      timeout:   30_000,
    });
    console.log(`  URL after menu nav: ${page.url()}`);

    // Wait for background API calls to fire and complete
    await page.waitForTimeout(12_000);

    if (capturedItems.length === 0) {
      console.log(`  [Playwright] Trying /menu/menus...`);
      await page.goto('https://partner.foodpanda.com/menu/menus', {
        waitUntil: 'domcontentloaded',
        timeout:   20_000,
      });
      await page.waitForTimeout(7_000);
    }

    await Promise.allSettled(pendingPromises);

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
    json?.data?.categories          ||
    json?.categories                ||
    json?.data?.menus?.[0]?.categories ||
    json?.menus?.[0]?.categories    ||
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

  // Pattern 2: flat products/items list
  if (!items.length) {
    const products =
      json?.data?.products ||
      json?.products        ||
      json?.data?.items     ||
      json?.items           ||
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
  const { email, password, storeName, vendorId, globalVendorId } = account;
  console.log(`\n──── ${storeName} (${vendorId}) ────`);
  const checkedAt = new Date().toISOString();

  // Strategy 1: Public customer API (no auth, no Cloudflare issues)
  console.log(`  Strategy 1: Public FoodPanda customer API...`);
  let items = await tryPublicAPI(globalVendorId, vendorId);

  if (items.length > 0) {
    console.log(`  ✓ Strategy 1 succeeded`);
  } else {
    // Need JWT for Strategy 2
    console.log(`  Strategy 1 returned 0 items. Getting JWT...`);
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

    // Strategy 2: Playwright with localStorage JWT injection (bypass login → bypass 2FA)
    console.log(`  Strategy 2: Playwright + JWT localStorage injection...`);
    items = await tryPlaywrightLocalStorage(account, browser, token);

    if (items.length > 0) {
      console.log(`  ✓ Strategy 2 succeeded`);
    }
  }

  // Deduplicate
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
    console.log(`  ⚠ All strategies failed — sending SESSION_REQUIRED`);
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
