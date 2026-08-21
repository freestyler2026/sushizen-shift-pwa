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
  const captured = [];

  // Intercept JSON API responses that might contain catalog/item data
  const responseHandler = async (response) => {
    const url = response.url();
    if (!url.includes('careem.com')) return;
    if (!url.includes('catalog') && !url.includes('item') && !url.includes('menu') && !url.includes('product')) return;
    const ct = response.headers()['content-type'] || '';
    if (!ct.includes('json')) return;
    try {
      const json = await response.json();
      captured.push({ url, json });
    } catch {}
  };

  page.on('response', responseHandler);

  try {
    const url = `https://partners.careem.com/saturn-ext/merchant/catalog/${outletId}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(3000); // let any lazy-loaded API calls finish

    const title = await page.title();
    console.log(`  Title: ${title}`);

    if (title.includes('Something went wrong') || title === 'Partners Portal' || title === 'Overview - Careem') {
      return null; // skip
    }

    // Check captured API responses for price data
    const allItems = [];
    for (const { url: u, json } of captured) {
      const items = extractItemsFromResponse(json);
      if (items.length > 0) {
        console.log(`  API ${u.slice(0, 80)}: ${items.length} priced items`);
        items.forEach(i => allItems.push(i));
      }
    }

    if (allItems.length > 0) {
      console.log(`  Total from APIs: ${allItems.length} items`);
      return [...new Map(allItems.map(i => [i.name, i])).values()];
    }

    // Log all captured API URLs + response snippets for diagnosis
    if (captured.length === 0) {
      console.log(`  No catalog API calls captured`);
    } else {
      console.log(`  Captured ${captured.length} API calls but 0 items with prices:`);
      captured.forEach(c => {
        const snippet = JSON.stringify(c.json).slice(0, 300);
        console.log(`    URL: ${c.url.slice(0, 100)}`);
        console.log(`    Body: ${snippet}`);
      });
    }

    // Try to find catalogId from captured calls and then call active-products API directly
    const catalogsCall = captured.find(c => c.url.includes('/catalogs?active=true'));
    const catalogId = catalogsCall?.json?.data?.[0]?.id
      ?? catalogsCall?.json?.[0]?.id
      ?? catalogsCall?.json?.result?.[0]?.id
      ?? null;
    console.log(`  Extracted catalogId: ${catalogId}`);

    if (catalogId) {
      // Try different product API variants
      const productUrls = [
        `/api/saturn-ext/v1/catalog-staging/catalogs/${catalogId}/products`,
        `/api/saturn-ext/v1/catalog-staging/catalogs/${catalogId}/products?status=ACTIVE`,
        `/api/saturn-ext/v1/catalog-staging/catalogs/${catalogId}/items`,
        `/api/saturn-ext/v1/catalog-staging/items?catalogId=${catalogId}`,
      ];
      for (const path of productUrls) {
        const fullUrl = `https://partners.careem.com${path}`;
        const resp = await page.evaluate(async (url) => {
          try {
            const r = await fetch(url, { credentials: 'include' });
            if (!r.ok) return { error: r.status };
            const text = await r.text();
            return { snippet: text.slice(0, 500) };
          } catch (e) { return { error: e.message }; }
        }, fullUrl).catch(() => null);
        console.log(`  Direct API ${path}: ${JSON.stringify(resp)?.slice(0, 200)}`);
      }
    }

    // Fallback: AED text walk in DOM (in case prices ARE rendered)
    const aedItems = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const result = [];
      let node;
      while ((node = walker.nextNode())) {
        if (/^AED \d+/.test(node.textContent.trim())) {
          let el = node.parentElement;
          for (let i = 0; i < 5; i++) el = el?.parentElement || el;
          const raw   = (el?.textContent || '').trim();
          const price = node.textContent.trim();
          const name  = raw.replace(price, '').trim().slice(0, 80);
          result.push({ name, price });
        }
      }
      return result;
    });
    if (aedItems.length > 0) {
      console.log(`  DOM AED scan: ${aedItems.length} items`);
      return aedItems;
    }

    return [];
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
