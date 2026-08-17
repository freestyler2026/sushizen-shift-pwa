/**
 * Noon Food RMS price checker — runs in GitHub Actions via Playwright
 * Loads saved session state, calls Noon's internal REST API to extract prices,
 * and posts snapshots to the Heroku webhook.
 */
const { chromium } = require('playwright');

const SESSION_PATH = process.env.NOON_SESSION_PATH;
const WEBHOOK_URL  = process.env.WEBHOOK_URL;

const BASE_URL = 'https://restaurant.noon.partners';

async function getNoonMenuList(context) {
  const resp = await context.request.get(`${BASE_URL}/_food-restaurant/menu/list`);
  if (!resp.ok()) throw new Error(`menu/list returned ${resp.status()}`);
  const data = await resp.json();
  return data.data; // array of { menuCode, menuName, isActive, itemCount, qcInfo, ... }
}

async function getNoonMenuDetails(context, menuCode) {
  const resp = await context.request.post(`${BASE_URL}/_food-restaurant/menu/details`, {
    data: { menuCode },
    headers: { 'content-type': 'application/json' },
  });
  if (!resp.ok()) throw new Error(`menu/details returned ${resp.status()} for ${menuCode}`);
  const data = await resp.json();
  return data.data; // { menuCode, menuName, items: [...] }
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
  if (!SESSION_PATH) throw new Error('NOON_SESSION_PATH not set');
  if (!WEBHOOK_URL)  throw new Error('WEBHOOK_URL not set');

  const browser = await chromium.launch({ headless: true });
  let sessionExpired = false;

  try {
    const context = await browser.newContext({ storageState: SESSION_PATH });

    // Verify session is still valid
    const testResp = await context.request.get(`${BASE_URL}/_food-restaurant/menu/list`);
    if (testResp.status() === 401 || testResp.url().includes('/login') || testResp.url().includes('/auth')) {
      console.log('Session expired — 401 or login redirect detected');
      sessionExpired = true;
    } else {
      const menuListData = await testResp.json();
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
        console.log(`Checking menu: ${menu.menuName} (${menu.menuCode}, ${menu.itemCount} items)`);

        try {
          const details = await getNoonMenuDetails(context, menu.menuCode);
          const items = (details.items || []).map(item => ({
            name: item.nameEn || item.nameAr || item.itemCode,
            price_aed: item.price,
            discount_price: item.discountPrice,
            is_oos: item.isOos,
          })).filter(item => item.price_aed != null);

          if (items.length === 0) {
            console.log(`  No priced items found — skipping`);
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
          console.error(`  Error checking ${menu.menuCode}:`, err.message);
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
