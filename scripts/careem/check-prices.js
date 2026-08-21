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
    // Direct numeric price fields (Careem uses various field names)
    const raw = obj.price ?? obj.aed_price ?? obj.item_price
      ?? obj.basePrice ?? obj.sellingPrice ?? obj.unitPrice
      ?? obj.priceAed ?? obj.pricing?.price ?? obj.priceInfo?.price ?? null;
    if (raw !== null && raw !== undefined) {
      const n = parseFloat(raw);
      return isNaN(n) ? null : n;
    }
    // Nested price object: { amount, currency }
    if (obj.price && typeof obj.price === 'object' && 'amount' in obj.price) {
      const n = parseFloat(obj.price.amount);
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

  page.on('response', responseHandler);

  try {
    // Step 1: Load catalog overview (don't wait for networkidle — it times out)
    allCaptured.length = 0;
    const overviewUrl = `https://partners.careem.com/saturn-ext/merchant/catalog/${outletId}`;
    await page.goto(overviewUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});

    // Wait for the categories API response (up to 30s)
    const categoriesCall = await waitForApiResponse(allCaptured, '/categories?catalogId=', 30_000);

    const titleAfterCats = await page.title();
    console.log(`  Title: ${titleAfterCats}`);

    if (titleAfterCats.includes('Something went wrong') || titleAfterCats === 'Partners Portal' || titleAfterCats === 'Overview - Careem') {
      return null;
    }

    const categories = Array.isArray(categoriesCall?.json)
      ? categoriesCall.json.filter(c => c.status === 'ACTIVE').slice(0, 12)
      : [];
    console.log(`  Categories: ${categories.map(c => c.name).join(', ').slice(0, 120)}`);

    if (categories.length === 0) {
      console.log(`  No categories found in API response`);
      return [];
    }

    // Collect items already loaded during the overview page load
    // (the SPA often pre-loads the first/selected category on arrival)
    const allItems = [];
    const preloaded = allCaptured.filter(c => c.url.includes('product') || c.url.includes('item'));
    for (const p of preloaded) {
      const items = extractItemsFromResponse(p.json);
      if (items.length > 0) {
        console.log(`  Pre-loaded ${items.length} items from overview (${p.url.slice(p.url.lastIndexOf('/') - 20)})`);
        items.forEach(i => allItems.push(i));
      }
    }

    // Step 2: Click each category sidebar item, capture product API response
    for (const cat of categories) {
      const catName = cat.name.trim();
      const snapshotLen = allCaptured.length;

      // Click the category element by text content
      const clicked = await page.getByText(catName, { exact: true }).first().click({ timeout: 5_000 })
        .then(() => true).catch(() => false);

      if (!clicked) {
        // Try partial match
        const clicked2 = await page.locator(`text="${catName}"`).first().click({ timeout: 3_000 })
          .then(() => true).catch(() => false);
        if (!clicked2) {
          console.log(`  "${catName}": could not click`);
          continue;
        }
      }

      // Wait for product API response after the click (up to 8s)
      const deadline = Date.now() + 8_000;
      let productCall = null;
      while (Date.now() < deadline) {
        const newCalls = allCaptured.slice(snapshotLen);
        productCall = newCalls.find(c => c.url.includes('product') || c.url.includes('item'));
        if (productCall) break;
        await new Promise(r => setTimeout(r, 300));
      }

      if (!productCall) {
        // Log new URLs for diagnosis
        const newUrls = allCaptured.slice(snapshotLen).map(c => c.url.slice(0, 80));
        console.log(`  "${catName}": no product API. New calls: ${newUrls.join(', ').slice(0, 200) || 'none'}`);
        continue;
      }

      const catItems = extractItemsFromResponse(productCall.json);
      console.log(`  "${catName}": ${catItems.length} items from ${productCall.url.slice(productCall.url.lastIndexOf('/') - 20)}`);
      if (catItems.length === 0) {
        console.log(`    Snippet: ${JSON.stringify(productCall.json).slice(0, 300)}`);
      }
      catItems.forEach(i => allItems.push({ ...i, category: catName }));
    }

    // Deduplicate by name
    return [...new Map(allItems.map(i => [i.name, i])).values()];

  } finally {
    page.off('response', responseHandler);
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
