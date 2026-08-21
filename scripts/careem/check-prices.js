/**
 * Careem catalog price checker — runs in GitHub Actions via Playwright
 * Loads saved session state, navigates to catalog pages, extracts AED prices from DOM
 */
const { chromium } = require('playwright');

const SESSION_PATH = process.env.CAREEM_SESSION_PATH;
const WEBHOOK_URL  = process.env.WEBHOOK_URL;

const OUTLETS = ['1054426', '1074763'];

const PRICE_REGEX = /^AED \d+(\.\d+)?$/;
const PRICE_WAIT_MS = 30_000;

async function getPrices(page) {
  const deadline = Date.now() + PRICE_WAIT_MS;
  while (Date.now() < deadline) {
    const items = await page.evaluate((regex) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const result = [];
      let node;
      while ((node = walker.nextNode())) {
        if (new RegExp(regex).test(node.textContent.trim())) {
          let el = node.parentElement;
          for (let i = 0; i < 5; i++) el = el?.parentElement || el;
          const raw   = (el?.textContent || '').trim();
          const price = node.textContent.trim();
          const name  = raw.replace(price, '').trim().substring(0, 80);
          result.push({ name, price });
        }
      }
      return result;
    }, '^AED \\d+(\\.\\d+)?$');

    if (items.length > 0) return items;
    await page.waitForTimeout(2000);
  }
  return [];
}

async function postWebhook(payload) {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

// Click each sidebar category and collect prices
async function getPricesAllCategories(page) {
  // Wait for sidebar categories to appear
  await page.waitForSelector('nav a, [class*="category"] a, [class*="Category"] a', { timeout: 15_000 }).catch(() => {});

  // Collect category links from sidebar
  const categoryLinks = await page.evaluate(() => {
    const links = [];
    document.querySelectorAll('a[href*="/catalog/"]').forEach(a => {
      const href = a.href;
      const text = a.textContent.trim();
      if (href && text && !text.includes('Unavailable')) links.push({ href, text });
    });
    return [...new Map(links.map(l => [l.href, l])).values()]; // deduplicate
  });

  console.log(`  Found ${categoryLinks.length} categories`);
  const allItems = [];

  for (const cat of categoryLinks) {
    await page.goto(cat.href, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForTimeout(2000);
    const items = await getPrices(page);
    if (items.length > 0) {
      console.log(`  Category "${cat.text}": ${items.length} items`);
      items.forEach(i => allItems.push({ ...i, category: cat.text }));
    }
  }
  return allItems;
}

async function main() {
  if (!SESSION_PATH) throw new Error('CAREEM_SESSION_PATH not set');
  if (!WEBHOOK_URL)  throw new Error('WEBHOOK_URL not set');

  const browser = await chromium.launch({ headless: true });
  let sessionExpired = false;

  try {
    const context = await browser.newContext({ storageState: SESSION_PATH });
    const checkedAt = new Date().toISOString();

    for (const outletId of OUTLETS) {
      const url = `https://partners.careem.com/saturn-ext/merchant/catalog/${outletId}`;
      console.log(`Checking outlet ${outletId}: ${url}`);

      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      if (page.url().includes('/login') || page.url().includes('/auth')) {
        console.log('Session expired — login redirect detected');
        sessionExpired = true;
        await page.close();
        break;
      }

      const title = await page.title();
      console.log(`  Title: ${title}`);

      if (title.includes('Something went wrong') || title.includes('Not Found')) {
        console.log(`  Outlet ${outletId}: page error — skipping`);
        await page.close();
        continue;
      }

      // Try direct price scan first
      let items = await getPrices(page);

      // If no prices, walk through sidebar categories
      if (items.length === 0) {
        console.log(`  No prices on landing page — walking categories...`);
        items = await getPricesAllCategories(page);
      }

      await page.close();

      if (items.length === 0) {
        console.log(`  Outlet ${outletId}: no prices found in any category`);
        continue;
      }

      const result = await postWebhook({
        outlet_id:  outletId,
        category:   'All',
        items,
        checked_at: checkedAt,
      });
      console.log(`Outlet ${outletId}: ${items.length} prices → ${JSON.stringify(result)}`);
    }
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
