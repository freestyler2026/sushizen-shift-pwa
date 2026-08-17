/**
 * Noon Food RMS price checker — runs in GitHub Actions
 * Reads cookies from Playwright storageState JSON (no browser needed),
 * calls Noon's internal REST API directly with those cookies.
 * Much faster and avoids Akamai headless-browser detection.
 */
const fs = require('fs');

const SESSION_PATH = process.env.NOON_SESSION_PATH;
const WEBHOOK_URL  = process.env.WEBHOOK_URL;

const BASE_URL = 'https://restaurant.noon.partners';

function buildCookieHeader(sessionPath) {
  const state = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  const now = Date.now() / 1000;
  return (state.cookies || [])
    .filter(c => {
      // Skip expired cookies
      if (c.expires && c.expires > 0 && c.expires < now) return false;
      // Only include cookies for the Noon domain
      return c.domain && (c.domain.includes('noon.partners') || c.domain.includes('noon.com'));
    })
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
}

async function noonGet(path, cookieHeader) {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      'cookie':       cookieHeader,
      'content-type': 'application/json',
      'referer':      BASE_URL + '/',
      'origin':       BASE_URL,
      'user-agent':   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    },
  });
  if (resp.status === 401 || resp.status === 403) throw new Error(`SESSION_EXPIRED:${resp.status}`);
  if (!resp.ok) throw new Error(`GET ${path} → ${resp.status}`);
  return resp.json();
}

async function noonPost(path, body, cookieHeader) {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'cookie':       cookieHeader,
      'content-type': 'application/json',
      'referer':      BASE_URL + '/',
      'origin':       BASE_URL,
      'user-agent':   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    },
    body: JSON.stringify(body),
  });
  if (resp.status === 401 || resp.status === 403) throw new Error(`SESSION_EXPIRED:${resp.status}`);
  if (!resp.ok) throw new Error(`POST ${path} → ${resp.status}`);
  return resp.json();
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

  const cookieHeader = buildCookieHeader(SESSION_PATH);
  if (!cookieHeader) throw new Error('No valid cookies found in session file');

  console.log(`Loaded ${cookieHeader.split(';').length} cookies from session`);

  let sessionExpired = false;

  try {
    // Get menu list
    const menuListData = await noonGet('/_food-restaurant/menu/list', cookieHeader);
    const allMenus = menuListData.data || [];

    // Monitor all active published menus that have items
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
        const detailsData = await noonPost(
          '/_food-restaurant/menu/details',
          { menuCode: menu.menuCode },
          cookieHeader
        );

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

        console.log(`  ${items.length} items → ${JSON.stringify(result)}`);
      } catch (err) {
        if (err.message.startsWith('SESSION_EXPIRED')) {
          sessionExpired = true;
          break;
        }
        console.error(`  Error for ${menu.menuCode}:`, err.message);
      }
    }
  } catch (err) {
    if (err.message.startsWith('SESSION_EXPIRED')) {
      sessionExpired = true;
    } else {
      throw err;
    }
  }

  if (sessionExpired) {
    console.log('Session expired — sending alert');
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
