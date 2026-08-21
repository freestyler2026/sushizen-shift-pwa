/**
 * Careem catalog price checker — runs in GitHub Actions via Playwright
 *
 * Strategy: intercept the portal's own API responses to get price data directly.
 * The SPA makes API calls when loading the catalog; we capture those JSON payloads
 * rather than trying to click DOM elements.
 */
const { chromium } = require('playwright');

const SESSION_PATH = process.env.CAREEM_SESSION_PATH;
const WEBHOOK_URL  = process.env.WEBHOOK_URL;

// All outlets accessible from this account
const OUTLETS = [
  { outletId: '1054426', name: 'Ramen ZEN, Jumeirah' },
  { outletId: '1067896', name: 'Sushi ZEN, Al Barsha 3' },
  { outletId: '1074763', name: 'Ramen Zen, Al Jaffiliya' },
];

async function postWebhook(payload) {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

// Collect catalog items from intercepted API responses
function extractItemsFromResponse(json) {
  const items = [];
  if (!json || typeof json !== 'object') return items;

  function resolvePrice(obj) {
    // Careem uses "defaultPrice" as the top-level price field
    const raw = obj.defaultPrice ?? obj.price ?? obj.aed_price ?? obj.item_price
      ?? obj.basePrice ?? obj.sellingPrice ?? obj.unitPrice
      ?? obj.priceAed ?? obj.pricing?.price ?? obj.priceInfo?.price ?? null;
    if (raw !== null && raw !== undefined) {
      const n = parseFloat(raw);
      return isNaN(n) ? null : n;
    }
    return null;
  }

  function walk(obj, depth = 0) {
    if (depth > 8 || !obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach(el => walk(el, depth + 1));
    } else {
      const name = obj.name || obj.name_en || obj.item_name || obj.nameEn
        || obj.itemName || obj.title || obj.titleEn || '';
      const priceVal = resolvePrice(obj);
      if (name && typeof name === 'string' && priceVal !== null && priceVal > 0) {
        items.push({
          name:  String(name).trim().slice(0, 80),
          price: `AED ${priceVal.toFixed(0)}`,
        });
      }
      Object.values(obj).forEach(v => walk(v, depth + 1));
    }
  }

  walk(json);
  return [...new Map(items.map(i => [i.name, i])).values()];
}

// Wait for a specific API response to be captured (polling approach)
async function waitForApiResponse(captured, urlSubstring, maxMs = 10_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const found = captured.find(c => c.url.includes(urlSubstring));
    if (found) return found;
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

async function getOutletPricesViaNetwork(page, outletId) {
  const allCaptured = [];
  let spaHeaders = {};  // auth headers sniffed from an actual SPA request

  const responseHandler = async (response) => {
    const url = response.url();
    if (!url.includes('careem.com')) return;
    const ct = response.headers()['content-type'] || '';
    if (!ct.includes('json')) return;
    try {
      const json = await response.json();
      allCaptured.push({ url, json });
    } catch {}
  };

  // Capture auth headers from the first catalog-staging request the SPA makes
  const requestHandler = (request) => {
    const url = request.url();
    if (url.includes('catalog-staging') && Object.keys(spaHeaders).length === 0) {
      const h = { ...request.headers() };
      delete h['cookie'];  // cookies sent automatically via credentials:'include'
      spaHeaders = h;
    }
  };

  page.on('response', responseHandler);
  page.on('request', requestHandler);

  try {
    allCaptured.length = 0;
    await page.goto(
      `https://partners.careem.com/saturn-ext/merchant/catalog/${outletId}`,
      { waitUntil: 'domcontentloaded', timeout: 30_000 }
    ).catch(() => {});

    // Wait for categories API — this gives us catalogId + auth headers
    const categoriesCall = await waitForApiResponse(allCaptured, '/categories?catalogId=', 30_000);
    await page.waitForTimeout(500);  // let spaHeaders settle

    const title = await page.title();
    console.log(`  Title: ${title}`);

    if (!categoriesCall || title.includes('Something went wrong') || title === 'Partners Portal') {
      // Log all captured URLs for diagnosis
      console.log(`  Captured APIs: ${allCaptured.map(c => c.url.slice(0, 80)).join(' | ').slice(0, 300) || 'none'}`);
      return null;
    }

    const catalogIdMatch = categoriesCall.url.match(/catalogId=(\d+)/);
    if (!catalogIdMatch) {
      console.log(`  No catalogId in: ${categoriesCall.url}`);
      return [];
    }
    const catalogId = catalogIdMatch[1];

    const categories = Array.isArray(categoriesCall.json)
      ? categoriesCall.json.filter(c => c.status === 'ACTIVE').slice(0, 15)
      : [];
    console.log(`  catalogId: ${catalogId}, categories: ${categories.map(c => c.name).join(', ').slice(0, 120)}`);
    console.log(`  SPA headers: ${Object.keys(spaHeaders).join(', ')}`);

    if (categories.length === 0) return [];

    // status=ACTIVE is required — omitting status returns 400, INACTIVE returns empty
    const ts = Math.floor(Date.now() / 1000);
    const BASE = `https://partners.careem.com/api/saturn-ext/v1/catalog-staging/catalogs/${catalogId}/products`;
    const ATTEMPTS = [
      `${BASE}?status=ACTIVE&page=1&limit=200&snooze=${ts}`,
    ];

    let productJson = null;
    for (const url of ATTEMPTS) {
      console.log(`  Fetching: ...${url.slice(-100)}`);
      const result = await page.evaluate(async ({ url, hdrs }) => {
        try {
          const res = await fetch(url, { credentials: 'include', headers: hdrs });
          const text = await res.text();
          let json = null;
          try { json = JSON.parse(text); } catch {}
          return { status: res.status, snippet: text.slice(0, 2000), json };
        } catch (e) {
          return { error: e.message };
        }
      }, { url, hdrs: spaHeaders });

      console.log(`  HTTP ${result.status || 'err'}`);
      if (result.error || result.status >= 400) {
        console.log(`  Error: ${result.snippet || result.error}`);
        continue;
      }

      const count = result.json?.products?.length ?? result.json?.items?.length ?? 0;
      console.log(`  Products count: ${count}`);
      if (count > 0) {
        productJson = result.json;
        break;
      } else {
        console.log(`  Response: ${result.snippet.slice(0, 200)}`);
      }
    }

    if (!productJson) return [];

    const items = extractItemsFromResponse(productJson);
    console.log(`  Extracted: ${items.length} priced items`);

    return [...new Map(items.map(i => [i.name, i])).values()];

  } finally {
    page.off('response', responseHandler);
    page.off('request', requestHandler);
  }
}

async function main() {
  if (!SESSION_PATH) throw new Error('CAREEM_SESSION_PATH not set');
  if (!WEBHOOK_URL)  throw new Error('WEBHOOK_URL not set');

  const browser = await chromium.launch({ headless: true });
  let sessionExpired = false;

  try {
    const context = await browser.newContext({ storageState: SESSION_PATH });
    const checkedAt = new Date().toISOString();

    // Single persistent page — keeps SPA state alive between navigations
    const page = await context.newPage();

    // Bootstrap: load merchant portal first
    console.log('Establishing merchant SPA context...');
    await page.goto('https://partners.careem.com/saturn-ext/merchant/home', {
      waitUntil: 'networkidle', timeout: 60_000,
    }).catch(() => {});
    await page.waitForTimeout(2000);
    console.log(`  Context URL: ${page.url()} — "${await page.title()}"`);

    if (page.url().includes('/login') || page.url().includes('/auth')) {
      console.log('Session expired');
      sessionExpired = true;
    } else {
      for (const outlet of OUTLETS) {
        const { outletId, name } = outlet;
        console.log(`\nChecking outlet ${outletId} (${name})`);

        const items = await getOutletPricesViaNetwork(page, outletId);
        if (items === null) {
          console.log(`  Skipped (page error)`);
          continue;
        }
        if (items.length === 0) {
          console.log(`  No prices found`);
          continue;
        }

        const result = await postWebhook({
          outlet_id:   outletId,
          outlet_name: name,
          category:    'All',
          items,
          checked_at:  checkedAt,
        });
        console.log(`  ${items.length} prices → ${JSON.stringify(result)}`);
      }
    }

    await page.close();
  } finally {
    await browser.close();
  }

  if (sessionExpired) {
    await postWebhook({
      outlet_id:  'SESSION_EXPIRED',
      category:   'SYSTEM',
      items:      [],
      checked_at: new Date().toISOString(),
    });
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
