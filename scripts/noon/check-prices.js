/**
 * Noon Food RMS price checker — runs in GitHub Actions via direct HTTP fetch.
 *
 * Key discovery: Noon's "validation key" check passes when the request includes
 * Referer: https://restaurant.noon.partners/restaurant/{code}/menu-maker/...
 * No browser / Playwright required — pure HTTP with saved session cookies.
 */
const fs = require('fs');

const SESSION_PATH = process.env.NOON_SESSION_PATH;
const WEBHOOK_URL  = process.env.WEBHOOK_URL;

const RESTAURANT_CODE = 'R5346332756132073257580964A';
const PROJECT_CODE    = 'PRJ108431';
const PORTAL          = 'https://restaurant.noon.partners';
const REFERER = `${PORTAL}/restaurant/${RESTAURANT_CODE}/menu-maker/?project=${PROJECT_CODE}`;

// ── cookie helpers ──────────────────────────────────────────────────────────

function loadCookies(sessionPath) {
  const state = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  return state.cookies
    .filter(c => c.domain && c.domain.includes('noon.partners'))
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
}

// ── Noon API ────────────────────────────────────────────────────────────────

async function noonFetch(cookieStr, method, path, body) {
  const opts = {
    method,
    headers: {
      'User-Agent':   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Content-Type': 'application/json',
      'Accept':       'application/json, text/plain, */*',
      'Cookie':       cookieStr,
      'Referer':      REFERER,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const resp = await fetch(`${PORTAL}${path}`, opts);
  const text = await resp.text();
  if (!resp.ok) throw new Error(`${resp.status}: ${text.slice(0, 300)}`);
  // Noon redirects to login page with 200 when session expires
  if (text.trimStart().startsWith('<')) throw new Error(`401: session expired (HTML response)`);
  return JSON.parse(text);
}

// ── webhook ─────────────────────────────────────────────────────────────────

async function postWebhook(payload) {
  const resp = await fetch(WEBHOOK_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  return resp.json();
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!SESSION_PATH) throw new Error('NOON_SESSION_PATH not set');
  if (!WEBHOOK_URL)  throw new Error('WEBHOOK_URL not set');

  const cookieStr = loadCookies(SESSION_PATH);
  console.log(`Loaded ${cookieStr.split(';').length} cookies`);

  // Fetch menu list
  console.log('Fetching menu list...');
  let menuListData;
  try {
    menuListData = await noonFetch(cookieStr, 'GET', '/_food-restaurant/menu/list', null);
  } catch (err) {
    // 401 → session expired
    if (err.message.startsWith('401')) {
      console.log('Session expired (401)');
      await postWebhook({
        menu_code:  'SESSION_EXPIRED',
        menu_name:  'SYSTEM',
        items:      [],
        checked_at: new Date().toISOString(),
      });
      process.exit(1);
    }
    throw err;
  }

  const allMenus = menuListData.data || [];
  const publishedMenus = allMenus.filter(m =>
    m.isActive && m.itemCount > 0 && m.qcInfo?.status === 'published'
  );

  console.log(`Found ${publishedMenus.length} published menus (of ${allMenus.length} total)`);
  const checkedAt = new Date().toISOString();

  for (const menu of publishedMenus) {
    console.log(`Checking: ${menu.menuName} (${menu.menuCode}, ${menu.itemCount} items)`);
    try {
      const detailsData = await noonFetch(
        cookieStr, 'POST', '/_food-restaurant/menu/details', { menuCode: menu.menuCode }
      );
      const items = (detailsData.data?.items || [])
        .map(item => ({
          name:           item.nameEn || item.nameAr || item.itemCode,
          price_aed:      item.price,
          discount_price: item.discountPrice ?? null,
          is_oos:         item.isOos ?? false,
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

  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
