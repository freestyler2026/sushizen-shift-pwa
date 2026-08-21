/**
 * Careem catalog price checker — runs in GitHub Actions via Playwright
 * Loads saved session state, navigates to catalog pages, extracts AED prices from DOM
 */
const { chromium } = require('playwright');

const SESSION_PATH = process.env.CAREEM_SESSION_PATH;
const WEBHOOK_URL  = process.env.WEBHOOK_URL;

// All outlets accessible from this account (no category ID needed)
const OUTLETS = [
  { outletId: '1054426', name: 'Ramen ZEN, Jumeirah' },
  { outletId: '1067896', name: 'Sushi ZEN, Al Barsha 3' },
  { outletId: '1074763', name: 'Ramen Zen, Al Jaffiliya' },
];

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

// After loading the outlet catalog page, click each sidebar category and collect prices
async function getPricesAllCategories(page, outletId) {
  // Sidebar category links are /catalog/{outletId}/{categoryId}
  const categoryLinks = await page.evaluate((oid) => {
    const links = [];
    document.querySelectorAll(`a[href*="/catalog/${oid}/"]`).forEach(a => {
      const text = a.textContent.trim();
      if (text && !text.toLowerCase().includes('unavailable')) {
        links.push({ href: a.href, text });
      }
    });
    return [...new Map(links.map(l => [l.href, l])).values()];
  }, outletId);

  console.log(`  Found ${categoryLinks.length} sidebar categories`);
  const allItems = [];

  for (const cat of categoryLinks) {
    // Click the sidebar link to keep SPA context (triggers React router instead of full reload)
    const clicked = await page.click(`a[href="${new URL(cat.href).pathname}"]`).then(() => true).catch(() => false);
    if (!clicked) {
      // Fallback: navigate directly
      await page.goto(cat.href, { waitUntil: 'networkidle', timeout: 20_000 }).catch(() => {});
    }
    await page.waitForTimeout(2000);
    const items = await getPricesFast(page);
    if (items.length > 0) {
      console.log(`  Category "${cat.text}": ${items.length} items`);
      items.forEach(i => allItems.push({ ...i, category: cat.text }));
    } else {
      console.log(`  Category "${cat.text}": 0 items`);
    }
  }
  return allItems;
}

// Lightweight single-pass price scan (no retry loop) — used when walking categories
async function getPricesFast(page) {
  return page.evaluate((regex) => {
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
}

async function main() {
  if (!SESSION_PATH) throw new Error('CAREEM_SESSION_PATH not set');
  if (!WEBHOOK_URL)  throw new Error('WEBHOOK_URL not set');

  const browser = await chromium.launch({ headless: true });
  let sessionExpired = false;

  try {
    const context = await browser.newContext({ storageState: SESSION_PATH });
    const checkedAt = new Date().toISOString();

    // Establish SPA context by loading the merchant home page first
    {
      const seedPage = await context.newPage();
      await seedPage.goto('https://partners.careem.com/saturn-ext/merchant/home', {
        waitUntil: 'domcontentloaded', timeout: 30_000,
      }).catch(() => {});
      await seedPage.waitForTimeout(2000);
      await seedPage.close();
    }

    for (const outlet of OUTLETS) {
      const { outletId, name } = outlet;
      const url = `https://partners.careem.com/saturn-ext/merchant/catalog/${outletId}`;
      console.log(`Checking outlet ${outletId} (${name}): ${url}`);

      const page = await context.newPage();
      // Use domcontentloaded then explicitly wait for sidebar — networkidle often times out on GitHub Actions
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});

      if (page.url().includes('/login') || page.url().includes('/auth')) {
        console.log('Session expired — login redirect detected');
        sessionExpired = true;
        await page.close();
        break;
      }

      const title = await page.title();
      console.log(`  Title: ${title}`);

      if (title.includes('Something went wrong') || title.includes('Not Found') || title === 'Partners Portal' || title === 'Overview - Careem') {
        const body = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
        console.log(`  Body snippet: ${body.replace(/\n/g, ' | ')}`);
        console.log(`  Outlet ${outletId}: page error/not found — skipping`);
        await page.close();
        continue;
      }

      // Wait for category sidebar to render (up to 60s)
      console.log(`  Waiting for sidebar...`);
      const sidebarSelector = `a[href*="/catalog/${outletId}/"]`;
      const sidebarAppeared = await page.waitForSelector(sidebarSelector, { timeout: 60_000 })
        .then(() => true).catch(() => false);
      console.log(`  Sidebar appeared: ${sidebarAppeared}`);

      if (!sidebarAppeared) {
        const body = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '');
        console.log(`  Body: ${body.replace(/\n/g, ' | ')}`);
      }

      // Walk sidebar categories (right panel needs a category click to show prices)
      const items = await getPricesAllCategories(page, outletId);

      await page.close();

      if (items.length === 0) {
        console.log(`  Outlet ${outletId}: no prices found in any category`);
        continue;
      }

      const result = await postWebhook({
        outlet_id:  outletId,
        outlet_name: name,
        category:   'All',
        items,
        checked_at: checkedAt,
      });
      console.log(`Outlet ${outletId} (${name}): ${items.length} prices → ${JSON.stringify(result)}`);
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
