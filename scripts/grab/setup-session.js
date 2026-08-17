/**
 * Grab Merchant Portal session capture + API discovery
 *
 * Usage:
 *   node scripts/grab/setup-session.js paranaque
 *   node scripts/grab/setup-session.js taft
 *   node scripts/grab/setup-session.js qc
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const LOCATION = process.argv[2] || 'paranaque';
const CREDS = {
  paranaque: 'sushizen.paranaque_manager',
  taft:      'taft2025zen@gmail.com',
  qc:        'qc2025zen@gmail.com',
};
if (!CREDS[LOCATION]) { console.error('Use: paranaque | taft | qc'); process.exit(1); }

const OUT_JSON = path.join(__dirname, `${LOCATION}-session.json`);
const OUT_B64  = path.join(__dirname, `${LOCATION}-session.b64.txt`);
const OUT_API  = path.join(__dirname, `${LOCATION}-api-discovery.json`);

const captured = [];
let capturing  = false;

async function main() {
  console.log(`\n=== Grab — ${LOCATION.toUpperCase()} ===`);
  console.log(`Login as: ${CREDS[LOCATION]}\n`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page    = await context.newPage();

  // Capture all XHR/fetch once logged in
  context.on('request', req => {
    if (!capturing) return;
    const url = req.url();
    if (url.match(/\.(js|css|png|jpg|gif|svg|ico|woff2?)(\?|$)/)) return;
    if (url.includes('google-analytics') || url.includes('doubleclick') ||
        url.includes('hotjar') || url.includes('scribe-proxy') ||
        url.includes('segment.io') || url.includes('amplitude')) return;
    captured.push({ method: req.method(), url, postData: req.postData()?.slice(0, 300) });
  });

  // Start at marketing page, find and click "Go to Portal"
  console.log('Opening GrabMerchant...');
  await page.goto('https://merchant.grab.com/mrc/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Click "Go to Portal" button
  try {
    const portalBtn = await page.getByText('Go to Portal', { exact: true });
    if (await portalBtn.isVisible()) {
      console.log('Clicking "Go to Portal"...');
      await portalBtn.click();
      await page.waitForTimeout(3000);
      console.log(`After click: ${page.url()}`);
    }
  } catch (_) {
    console.log('Portal button not found — current URL:', page.url());
  }

  console.log(`\nCurrent URL: ${page.url()}`);
  console.log(`\nPlease log in with: ${CREDS[LOCATION]}`);
  console.log('Then navigate to Food Items / Menu page.\n');

  // Poll for authenticated dashboard (any URL change away from login/landing)
  console.log('Waiting for login (up to 5 min)...');
  const loginUrl = page.url(); // URL before login
  const deadline = Date.now() + 5 * 60 * 1000;
  let loggedIn = false;

  while (Date.now() < deadline) {
    const url = page.url();

    // Detect successful login: URL changed away from the initial login page
    const notLogin = !url.includes('/login') && !url.includes('/signin') &&
                     !url.includes('/auth') && !url.includes('accounts.grab.com');
    const isDashboard = url !== loginUrl && url !== 'https://merchant.grab.com/mrc/' && notLogin;

    if (isDashboard) {
      console.log(`✓ Dashboard detected: ${url}`);
      loggedIn = true;
      capturing = true;
      break;
    }

    // Also check for Bearer token in localStorage
    try {
      const found = await page.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) || '';
          if (k.match(/token|auth|bearer|access/i)) {
            return k;
          }
        }
        return null;
      });
      if (found) {
        console.log(`✓ Auth token in localStorage: ${found}`);
        loggedIn = true;
        capturing = true;
        break;
      }
    } catch (_) {}

    await page.waitForTimeout(2000);
  }

  if (!loggedIn) console.log('Timed out — saving partial session');

  // 45s window to navigate to menu page and capture API calls
  console.log('\nNavigate to Food Items / Menu Management now...');
  console.log('(45 seconds to capture API calls)\n');
  for (let i = 45; i > 0; i -= 5) {
    await page.waitForTimeout(5000);
    process.stdout.write(`  ${i}s remaining... current page: ${page.url()}\n`);
  }

  // Save session
  await context.storageState({ path: OUT_JSON });
  const data     = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8'));
  const stripped = { cookies: data.cookies, origins: [] };
  const b64      = Buffer.from(JSON.stringify(stripped)).toString('base64');
  fs.writeFileSync(OUT_B64, b64);
  fs.writeFileSync(OUT_API, JSON.stringify(captured, null, 2));

  console.log(`\n✓ Session:   ${OUT_B64} (${b64.length} chars)`);
  console.log(`✓ API calls: ${captured.length} captured\n`);
  console.log('=== Non-trivial API calls ===');
  captured
    .filter(c => !c.url.includes('_next') && c.method !== 'GET' || c.url.includes('/api/'))
    .slice(0, 40)
    .forEach(c => console.log(`  ${c.method} ${c.url}`));

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
