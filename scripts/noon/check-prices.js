/**
 * Noon Food RMS price checker — runs in GitHub Actions via Playwright
 * Loads saved session state, navigates to the portal to execute JS (needed for
 * CSRF validation key), then calls Noon's internal REST API via page.evaluate().
 *
 * Key: Noon requires a dynamic "validation key" generated at page load.
 * Direct HTTP fetch fails with {"error":"validation key not found"}.
 * page.evaluate() runs inside the browser context where the key is already set.
 */
const { chromium } = require('playwright');

const SESSION_PATH = process.env.NOON_SESSION_PATH;
const WEBHOOK_URL  = process.env.WEBHOOK_URL;

const PORTAL_URL = 'https://restaurant.noon.partners';
const RESTAURANT_URL = `${PORTAL_URL}/restaurant/R5346332756132073257580964A/menu-maker/?project=PRJ108431`;

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
    const text = await resp.text();
    if (!resp.ok) throw new Error(`${resp.status}:${text.slice(0, 300)}`);
    return JSON.parse(text);
  }, { method, path, body });
}

async function main() {
  if (!SESSION_PATH) throw new Error('NOON_SESSION_PATH not set');
  if (!WEBHOOK_URL)  throw new Error('WEBHOOK_URL not set');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-http2',                           // avoids ERR_HTTP2_PROTOCOL_ERROR
      '--disable-blink-features=AutomationControlled',
    ],
  });

  let sessionExpired = false;

  try {
    const context = await browser.newContext({
      storageState: SESSION_PATH,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    // Navigate to menu-maker page (loads JS, sets validation key, passes Akamai)
    console.log('Navigating to Noon Food RMS menu-maker...');
    await page.goto(RESTAURANT_URL, {
      waitUntil: 'domcontentloaded',   // don't wait for networkidle — avoids timeout
      timeout: 60_000,
    });

    // Brief wait for app JS to initialize (sets the validation key)
    await page.waitForTimeout(4000);

    // Check for login redirect (session expired)
    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);
    if (
      currentUrl.includes('/login') ||
      currentUrl.includes('/auth') ||
      currentUrl.includes('login.noon')
    ) {
      console.log('Session expired — redirected to login');
      sessionExpired = true;
    } else {
      // Use page.evaluate() so the validation key is automatically included
      console.log('Fetching menu list...');
      const menuListData = await callNoonApi(page, 'GET', '/_food-restaurant/menu/list', null);
      const allMenus = menuListData.data || [];

      const publishedMenus = allMenus.filter(m =>
        m.isActive &&
        m.itemCount > 0 &&
        m.qcInfo?.status === 'published'
      );

      console.log(`Found ${publishedMenus.length} published menus`);
      const checkedAt = new Date().toISOString();

      for (const menu of publishedMenus) {
        console.log(`Checking: ${menu.menuName} (${menu.menuCode}, ${menu.itemCount} items)`);
        try {
          const detailsData = await callNoonApi(
            page, 'POST', '/_food-restaurant/menu/details', { menuCode: menu.menuCode }
          );
          const items = (detailsData.data?.items || [])
            .map(item => ({
              name:           item.nameEn || item.nameAr || item.itemCode,
              price_aed:      item.price,
              discount_price: item.discountPrice,
              is_oos:         item.isOos,
            }))
            .filter(item => item.price_aed != null);

          if (!items.length) { console.log('  No priced items — skipping'); continue; }

          const result = await postWebhook({
            menu_code:  menu.menuCode,
            menu_name:  menu.menuName,
            items,
            checked_at: checkedAt,
          });
          console.log(`  ${items.length} items → ${JSON.stringify(result)}`);
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
