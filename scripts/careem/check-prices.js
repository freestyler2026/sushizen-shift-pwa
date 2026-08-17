/**
 * Careem catalog price checker — runs in GitHub Actions via Playwright
 * Loads saved session state, navigates to catalog pages, extracts AED prices from DOM
 */
const { chromium } = require('playwright');

const SESSION_PATH = process.env.CAREEM_SESSION_PATH;
const WEBHOOK_URL  = process.env.WEBHOOK_URL;

const CATALOGS = [
  { outletId: '1054426', categoryId: '1076323393', categoryName: 'NEW Ramen' },
  { outletId: '1074763', categoryId: '1076323393', categoryName: 'NEW Ramen' },
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

async function main() {
  if (!SESSION_PATH) throw new Error('CAREEM_SESSION_PATH not set');
  if (!WEBHOOK_URL)  throw new Error('WEBHOOK_URL not set');

  const browser = await chromium.launch({ headless: true });
  let sessionExpired = false;

  try {
    const context = await browser.newContext({ storageState: SESSION_PATH });

    for (const catalog of CATALOGS) {
      const url = `https://partners.careem.com/saturn-ext/merchant/catalog/${catalog.outletId}/${catalog.categoryId}`;
      console.log(`Checking: ${url}`);

      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      // Check if redirected to login (session expired)
      if (page.url().includes('/login') || page.url().includes('/auth')) {
        console.log('Session expired — login redirect detected');
        sessionExpired = true;
        await page.close();
        break;
      }

      const items = await getPrices(page);
      await page.close();

      if (items.length === 0) {
        console.log(`Outlet ${catalog.outletId}: no prices found (page may have errored)`);
        continue;
      }

      const result = await postWebhook({
        outlet_id:   catalog.outletId,
        category:    catalog.categoryName,
        items,
        checked_at:  new Date().toISOString(),
      });

      console.log(`Outlet ${catalog.outletId}: ${items.length} prices → webhook ${JSON.stringify(result)}`);
    }
  } finally {
    await browser.close();
  }

  if (sessionExpired) {
    // Notify via webhook with a special flag so Heroku can send Discord DM
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
