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

  // Walk the JSON tree looking for price-bearing item structures
  function walk(obj, depth = 0) {
    if (depth > 6 || !obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach(el => walk(el, depth + 1));
    } else {
      // Look for objects that have a name + price field
      const hasPrice = 'price' in obj || 'aed_price' in obj || 'item_price' in obj;
      const hasName  = 'name' in obj || 'name_en' in obj || 'item_name' in obj || 'nameEn' in obj;
      if (hasPrice && hasName) {
        const name  = obj.name || obj.name_en || obj.item_name || obj.nameEn || '';
        const price = obj.price ?? obj.aed_price ?? obj.item_price ?? null;
        if (name && price !== null && price !== undefined) {
          items.push({
            name:  String(name).trim().slice(0, 80),
            price: `AED ${parseFloat(price).toFixed(0)}`,
          });
        }
      }
      Object.values(obj).forEach(v => walk(v, depth + 1));
    }
  }

  walk(json);
  return [...new Map(items.map(i => [i.name, i])).values()];
}

async function getOutletPricesViaNetwork(page, outletId) {
  const allCaptured = [];

  // Intercept ALL JSON API responses from Careem
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
    // Step 1: Load catalog overview to get categoryIds from the categories API
    const overviewUrl = `https://partners.careem.com/saturn-ext/merchant/catalog/${outletId}`;
    allCaptured.length = 0; // reset
    await page.goto(overviewUrl, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const title = await page.title();
    console.log(`  Title: ${title}`);

    if (title.includes('Something went wrong') || title === 'Partners Portal' || title === 'Overview - Careem') {
      return null;
    }

    // Extract category IDs from the categories API response
    const categoriesCall = allCaptured.find(c => c.url.includes('/categories?catalogId='));
    const categories = Array.isArray(categoriesCall?.json)
      ? categoriesCall.json.filter(c => c.status === 'ACTIVE').slice(0, 15)
      : [];
    console.log(`  Categories found: ${categories.map(c => `${c.id}(${c.name})`).join(', ').slice(0, 120)}`);

    if (categories.length === 0) {
      console.log(`  No categories — cannot navigate to specific category pages`);
      return [];
    }

    // Step 2: For each category, navigate to /catalog/{outletId}/{categoryId}
    // This triggers the SPA to load products with prices for that category
    const allItems = [];
    for (const cat of categories) {
      const catUrl = `https://partners.careem.com/saturn-ext/merchant/catalog/${outletId}/${cat.id}`;
      allCaptured.length = 0; // reset for this navigation

      await page.goto(catUrl, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(2000);

      const catTitle = await page.title();
      if (catTitle.includes('Something went wrong') || catTitle === 'Partners Portal') {
        console.log(`  Category ${cat.name}: page error`);
        continue;
      }

      // Look for product API responses
      let catItems = [];
      for (const { url: u, json } of allCaptured) {
        if (!u.includes('product') && !u.includes('item')) continue;
        const items = extractItemsFromResponse(json);
        if (items.length > 0) {
          catItems = items;
          console.log(`  Category "${cat.name}": ${items.length} items from ${u.slice(u.lastIndexOf('/'))}`);
          break;
        }
      }

      if (catItems.length === 0) {
        // Debug: show all captured URLs for this category
        const capturedUrls = allCaptured.map(c => c.url.slice(0, 80));
        console.log(`  Category "${cat.name}": 0 items. APIs: ${capturedUrls.join(' | ').slice(0, 200)}`);
        // Show snippet of any product-related response
        const prodCall = allCaptured.find(c => c.url.includes('product') || c.url.includes('item'));
        if (prodCall) console.log(`    Snippet: ${JSON.stringify(prodCall.json).slice(0, 300)}`);
      }

      catItems.forEach(i => allItems.push({ ...i, category: cat.name }));
    }

    // Deduplicate by item name
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
