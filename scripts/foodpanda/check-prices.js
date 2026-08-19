/**
 * FoodPanda PH price checker
 *
 * Strategy:
 *   1. Playwright + JWT localStorage (inject JWT from auth API, skip login/2FA)
 *      - Intercepts ALL JSON responses to discover menu API URL patterns
 *      - Falls back to in-browser fetch() probes if response interception misses them
 *      - Saves debug screenshot as file (upload via workflow artifact)
 *   2. SESSION_REQUIRED fallback
 *
 * Env vars (GitHub Actions secrets):
 *   FP_EMAIL_PARANAQUE, FP_PASSWORD_PARANAQUE
 *   FP_EMAIL_TAFT,      FP_PASSWORD_TAFT
 *   FP_EMAIL_QC,        FP_PASSWORD_QC
 *   WEBHOOK_URL
 */

const { chromium } = require('playwright');
const fs = require('fs');

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

  const accounts  = data.profile?.accounts || [];
  const vendorIds = accounts.map(a => a.vendor_id).filter(Boolean);
  return { token, refreshToken: data.refresh_token || '', vendorIds, rawProfile: data.profile };
}

// ── Playwright with full debug logging ───────────────────────────────────────

async function checkViaPlaywright(account, browser, token, rawProfile) {
  const { storeName, vendorId, globalVendorId } = account;

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport:  { width: 1280, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  });

  // Inject JWT + profile data into localStorage before any page load
  await context.addInitScript(({ jwt, profile }) => {
    // All known key patterns for DH/FoodPanda partner portals
    const keys = [
      'access_token', 'auth_token', 'token', 'fp-access-token',
      'partner-portal-token', 'authToken',
    ];
    keys.forEach(k => { try { localStorage.setItem(k, jwt); } catch (_) {} });

    // Redux Persist (most common in DH React apps)
    try {
      const root = JSON.parse(localStorage.getItem('persist:root') || '{}');
      const auth = JSON.parse(root.authentication || '{}');
      auth.isAuthenticated  = true;
      auth.accessToken      = jwt;
      auth.access_token     = jwt;
      auth.token            = jwt;
      if (profile) {
        auth.profile = profile;
        auth.user    = profile;
      }
      root.authentication = JSON.stringify(auth);
      localStorage.setItem('persist:root', JSON.stringify(root));
    } catch (_) {}

    // Also sessionStorage
    try { sessionStorage.setItem('access_token', jwt); } catch (_) {}
    try { sessionStorage.setItem('auth_token',   jwt); } catch (_) {}
  }, { jwt: token, profile: rawProfile });

  const capturedItems  = [];
  const pendingPromises = [];
  const allApiCalls    = [];  // log ALL api calls for debugging

  // ── Intercept ALL JSON responses (no URL filter) to discover API patterns ──
  context.on('response', (response) => {
    const url    = response.url();
    const status = response.status();

    // Skip static assets and known tracking
    if (/\.(js|css|png|jpg|svg|ico|woff2?|ttf|map)(\?|$)/.test(url)) return;
    if (/analytics|hotjar|sentry|amplitude|segment|facebook|px-cloud|datadog|cloudfront|recaptcha|newrelic/.test(url)) return;

    const ct = response.headers()['content-type'] || '';
    if (!ct.includes('application/json')) return;

    const p = response.json()
      .then(json => {
        const topKeys = Object.keys(json || {}).slice(0, 6).join(',');
        allApiCalls.push(`${status} ${url.slice(0, 100)} → {${topKeys}}`);

        const items = extractItemsFromResponse(json);
        if (items.length > 0) {
          console.log(`  ✓ Intercepted ${items.length} items from: ${url.slice(0, 80)}`);
          capturedItems.push(...items);
        }
      })
      .catch(() => {});
    pendingPromises.push(p);
  });

  const page = await context.newPage();

  try {
    // ── Navigate to portal root ───────────────────────────────────────────────
    console.log(`  [Playwright] Navigating to portal root with JWT injected...`);
    await page.goto('https://partner.foodpanda.com/', {
      waitUntil: 'domcontentloaded',
      timeout:   30_000,
    });
    await page.waitForTimeout(4000);

    const rootUrl = page.url();
    console.log(`  URL after root: ${rootUrl}`);

    if (rootUrl.includes('/login') || rootUrl.includes('/auth')) {
      console.log(`  ✗ Redirected to login — JWT injection insufficient`);
    }

    // ── Navigate to menu items ────────────────────────────────────────────────
    console.log(`  [Playwright] Navigating to /menu/items...`);
    await page.goto('https://partner.foodpanda.com/menu/items', {
      waitUntil: 'domcontentloaded',
      timeout:   30_000,
    });
    await page.waitForTimeout(12_000);
    console.log(`  URL after menu/items: ${page.url()}`);

    // ── Debug: inspect page state ─────────────────────────────────────────────
    const pageState = await page.evaluate(() => {
      return {
        url:          window.location.href,
        title:        document.title,
        lsKeys:       Object.keys(localStorage),
        hasToken:     !!localStorage.getItem('access_token'),
        persistRoot:  Object.keys(JSON.parse(localStorage.getItem('persist:root') || '{}')),
        bodyText:     document.body.innerText.slice(0, 400).replace(/\s+/g, ' '),
      };
    });
    console.log(`  Page title: "${pageState.title}"`);
    console.log(`  localStorage keys: [${pageState.lsKeys.join(', ')}]`);
    console.log(`  access_token in LS: ${pageState.hasToken}`);
    console.log(`  persist:root keys: [${pageState.persistRoot.join(', ')}]`);
    console.log(`  Body text (first 300): ${pageState.bodyText.slice(0, 300)}`);

    // ── Save screenshot for debugging ─────────────────────────────────────────
    const screenshotPath = `/tmp/fp-debug-${vendorId}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`  Screenshot saved: ${screenshotPath}`);

    // ── In-browser fetch probe (has browser cookies + correct base URL) ───────
    if (capturedItems.length === 0) {
      console.log(`  Trying in-browser fetch probes...`);
      const browserFetchResult = await page.evaluate(async ({ vendorId, globalVendorId, jwt }) => {
        const auth = `Bearer ${jwt}`;
        const endpoints = [
          // Relative paths (use portal's own base + cookies)
          `/api/v1/vendor/${vendorId}/menus`,
          `/api/v1/vendor/${vendorId}/menu/categories`,
          `/api/v3/vendors/${vendorId}/menus`,
          `/api/v5/vendors/${vendorId}/menus`,
          `/api/v1/vendor/${vendorId}/products`,
          `/api/v1/vendor/${vendorId}/assortment`,
          // Absolute paths on portal.restaurant backend
          `https://partner-backend.ap.prd.portal.restaurant/api/v1/vendor/${vendorId}/menus`,
          `https://partner-backend.ap.prd.portal.restaurant/api/v3/vendors/${vendorId}/menus`,
        ];
        const results = [];
        for (const ep of endpoints) {
          try {
            const r = await fetch(ep, {
              headers: { 'Authorization': auth, 'Accept': 'application/json' },
              signal: AbortSignal.timeout(8000),
            });
            const ct = r.headers.get('content-type') || '';
            let preview = `${r.status}`;
            if (r.ok && ct.includes('json')) {
              const json = await r.json();
              preview += ` → keys: ${Object.keys(json).slice(0, 6).join(',')}`;
            } else if (!r.ok) {
              preview += ` ${r.statusText}`;
            }
            results.push(`${ep.slice(0, 70)}: ${preview}`);
          } catch (e) {
            results.push(`${ep.slice(0, 70)}: ${e.message.slice(0, 40)}`);
          }
        }
        return results;
      }, { vendorId, globalVendorId, jwt: token });

      console.log(`  In-browser fetch results:`);
      browserFetchResult.forEach(r => console.log(`    ${r}`));
    }

    // ── Fallback: try /menu/menus ─────────────────────────────────────────────
    if (capturedItems.length === 0) {
      await page.goto('https://partner.foodpanda.com/menu/menus', {
        waitUntil: 'domcontentloaded',
        timeout:   20_000,
      });
      await page.waitForTimeout(7_000);
    }

    await Promise.allSettled(pendingPromises);

    // Log all API calls observed
    console.log(`  All API calls intercepted (${allApiCalls.length}):`);
    allApiCalls.slice(0, 30).forEach(c => console.log(`    ${c}`));

  } catch (err) {
    console.error(`  [Playwright] error: ${err.message.slice(0, 150)}`);
  } finally {
    await context.close();
  }

  return capturedItems;
}

// ── Item extraction helpers ───────────────────────────────────────────────────

function extractItemsFromResponse(json) {
  const items = [];

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

async function checkAccount(account, browser) {
  const { email, password, storeName, vendorId } = account;
  console.log(`\n──── ${storeName} (${vendorId}) ────`);
  const checkedAt = new Date().toISOString();

  // Get JWT (no 2FA via direct API)
  let token, rawProfile;
  try {
    const result = await getFreshToken(email, password);
    token      = result.token;
    rawProfile = result.rawProfile;
    console.log(`  ✓ JWT acquired (vendor IDs: ${result.vendorIds.join(', ')})`);
  } catch (err) {
    console.error(`  ✗ Auth failed: ${err.message}`);
    await postWebhook({ vendor_id: 'AUTH_FAILED', vendor_name: storeName, items: [], checked_at: checkedAt });
    return;
  }

  const items = await checkViaPlaywright(account, browser, token, rawProfile);

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
    console.log(`  ⚠ No items captured — sending SESSION_REQUIRED`);
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
