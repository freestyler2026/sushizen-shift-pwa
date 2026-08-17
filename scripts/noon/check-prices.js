/**
 * Noon Food RMS price checker — runs in GitHub Actions via Playwright
 * Loads saved session state, navigates to the portal (to pass Akamai bot check),
 * then calls Noon's internal REST API via page.evaluate() to extract prices.
 */
const { chromium } = require('playwright');

const SESSION_PATH = process.env.NOON_SESSION_PATH;
const WEBHOOK_URL  = process.env.WEBHOOK_URL;

const PORTAL_URL = 'https://restaurant.noon.partners';

async function postWebhook(payload) {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function callNoonApi(page, method, path, body) {
  return page.evaluate(async ({ method, path, body }) => {
    const opts = {
      method,
      headers: { 'content-type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const resp = await fetch(path, opts);
    if (!resp.ok) throw new Error(`${path} returned ${resp.status}`);
    return resp.json();
  }, { method, path, body });
}

async function main() {
  if (!SESSION_PATH) throw new Error('NOON_SESSION_PATH not set');
  if (!WEBHOOK_URL)  throw new Error('WEBHOOK_URL not set');

  const browser = await chromium.launch({ headless: true });
  let sessionExpired = false;

  try {
    const context = await browser.newContext({
      storageState: SESSION_PATH,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    // Navigate to the portal to establish session and pass bot checks
    console.log('Navigating to Noon Food RMS portal...');
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle', timeout: 60_000 });

    // Check if redirected to login (session expired)
    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);
    if (currentUrl.includes('/login') || currentUrl.includes('/auth') || currentUrl.includes('login.noon')) {
      console.log('Session expired — redirected to login page');
      sessionExpired = true;
    } else {
      // Call menu/list via in-page fetch (cookies sent automatically, passes bot detection)
      console.log('Fetching menu list...');
      const menuListData = await callNoonApi(page, 'GET', '/_food-restaurant/menu/list', null);
      const allMenus = menuListData.data || [];

      // Monitor all active published menus that have items
      const publishedMenus = allMenus.filter(m =>
        m.isActive &&
        m.itemCount > 0 &&
        m.qcInfo?.status === 'published'
      );

      console.log(`Found ${publishedMenus.length} published menus to check`);
      const checkedAt = new Date().toISOString();

      for (const menu of publishedMenus) {
        console.log(`Checking: ${menu.menuName} (${menu.menuCode}, ${menu.itemCount} items)`);

        try {
          const detailsData = await callNoonApi(page, 'POST', '/_food-restaurant/menu/details', { menuCode: menu.menuCode });
          const items = (detailsData.data?.items || [])
            .map(item => ({
              name:           item.nameEn || item.nameAr || item.itemCode,
              price_aed:      item.price,
              discount_price: item.discountPrice,
              is_oos:         item.isOos,
            }))
            .filter(item => item.price_aed != null);

          if (items.length === 0) {
            console.log('  No priced items — skipping');
            continue;
          }

          const result = await postWebhook({
            menu_code:  menu.menuCode,
            menu_name:  menu.menuName,
            items,
            checked_at: checkedAt,
          });

          console.log(`  ${items.length} items → webhook ${JSON.stringify(result)}`);
        } catch (err) {
          console.error(`  Error for ${menu.menuCode}:`, err.message);
        }
      }
    }
  } finally {
    await browser.close();
  }

  if (sessionExpired) {
    await postWebhook({
      menu_code:  'SESSION_EXPIRED',
      menu_name:  'SYSTEM',
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
