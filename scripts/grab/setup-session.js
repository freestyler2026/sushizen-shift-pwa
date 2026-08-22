/**
 * Grab Merchant Portal — session capture + payout API discovery
 *
 * Usage:
 *   node scripts/grab/setup-session.js paranaque
 *   node scripts/grab/setup-session.js taft
 *   node scripts/grab/setup-session.js qc
 *
 * After running:
 *   - {LOCATION}-session.b64.txt  — gzip+base64 session (cookies + localStorage)
 *   - {LOCATION}-session.json     — full Playwright storageState
 *   - {LOCATION}-api-responses.json — captured finance API response bodies
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

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
const OUT_RESP = path.join(__dirname, `${LOCATION}-api-responses.json`);

const captured  = [];
const responses = [];
let capturing   = false;

async function main() {
  console.log(`\n=== Grab — ${LOCATION.toUpperCase()} ===`);
  console.log(`Login as: ${CREDS[LOCATION]}\n`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page    = await context.newPage();

  // Capture request bodies
  context.on('request', req => {
    if (!capturing) return;
    const url = req.url();
    if (url.match(/\.(js|css|png|jpg|gif|svg|ico|woff2?)(\?|$)/)) return;
    if (url.includes('google-analytics') || url.includes('doubleclick') ||
        url.includes('hotjar') || url.includes('scribe-proxy') ||
        url.includes('segment.io') || url.includes('amplitude') ||
        url.includes('datadog') || url.includes('sentry')) return;
    captured.push({ method: req.method(), url, postData: req.postData()?.slice(0, 300) });
  });

  // Capture API response bodies (finance / merchant APIs)
  context.on('response', async resp => {
    if (!capturing) return;
    const url = resp.url();
    if (!url.includes('merchant.grab.com') && !url.includes('portal.grab.com') &&
        !url.includes('api.grab.com')) return;
    if (url.match(/\.(js|css|png|jpg|gif|svg|ico|woff2?)(\?|$)/)) return;
    try {
      const body = await resp.text();
      if (body.length < 10 || body.startsWith('<!DOCTYPE')) return;
      // Extract operation name from URL or request body
      const reqPostData = resp.request().postData() || '';
      const opMatch = reqPostData.match(/"operationName"\s*:\s*"([^"]+)"/) ||
                      url.match(/\/([^/?]+)\??/);
      const opName = opMatch ? opMatch[1] : url.split('/').slice(-1)[0].split('?')[0];
      responses.push({ url, status: resp.status(), opName, body });
      if (resp.status() === 200) {
        process.stdout.write(`  [API OK ${resp.status()}] ${opName.slice(0, 60)}\n`);
      } else if (resp.status() !== 204 && resp.status() < 300) {
        process.stdout.write(`  [API ${resp.status()}] ${opName.slice(0, 60)}\n`);
      }
    } catch (_) {}
  });

  // Start at marketing page
  console.log('Opening GrabMerchant...');
  await page.goto('https://merchant.grab.com/mrc/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Click "Go to Portal" if present
  try {
    const portalBtn = await page.getByText('Go to Portal', { exact: true });
    if (await portalBtn.isVisible()) {
      console.log('Clicking "Go to Portal"...');
      await portalBtn.click();
      await page.waitForTimeout(3000);
    }
  } catch (_) {}

  console.log(`\nCurrent URL: ${page.url()}`);
  console.log(`\nPlease log in with: ${CREDS[LOCATION]}`);
  console.log('(Complete 2FA if prompted)\n');

  // Wait for login (up to 5 min)
  console.log('Waiting for login (up to 5 min)...');
  const loginUrl = page.url();
  const deadline = Date.now() + 5 * 60 * 1000;
  let loggedIn = false;

  while (Date.now() < deadline) {
    const url = page.url();
    const notAuth = !url.includes('/login') && !url.includes('/signin') &&
                    !url.includes('/auth') && !url.includes('accounts.grab.com') &&
                    !url.includes('weblogin.grab.com');
    if (notAuth && url !== loginUrl && url.includes('merchant.grab.com')) {
      console.log(`✓ Logged in! URL: ${url}`);
      loggedIn = true;
      capturing = true;
      break;
    }
    // Cookie check
    const cookies = await context.cookies();
    const auth = cookies.find(c => c.name === 'mexusers_authn_token' && c.value.length > 20);
    if (auth) {
      console.log(`✓ Auth cookie detected: mexusers_authn_token`);
      loggedIn = true;
      capturing = true;
      break;
    }
    await page.waitForTimeout(2000);
  }

  if (!loggedIn) {
    console.log('Timed out — saving partial session');
    capturing = true;
  }

  // ── Auto-navigate to Finance pages to discover payout API ──────────────────
  console.log('\n=== Auto-navigating to Finance / Transfers pages ===');
  const FINANCE_PAGES = [
    { url: 'https://merchant.grab.com/finance',           label: 'Finance' },
    { url: 'https://merchant.grab.com/finance/transfers', label: 'Finance/Transfers' },
    { url: 'https://merchant.grab.com/finance/reports',   label: 'Finance/Reports' },
    { url: 'https://merchant.grab.com/finance/invoices',  label: 'Finance/Invoices' },
    { url: 'https://merchant.grab.com/finances',          label: 'Finances (alt)' },
    { url: 'https://merchant.grab.com/dashboard',         label: 'Dashboard' },
  ];

  for (const { url, label } of FINANCE_PAGES) {
    console.log(`  → ${label} (${url})...`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
      await page.waitForTimeout(4000);
      console.log(`    Landed: ${page.url().slice(0, 80)}`);
    } catch (err) {
      console.log(`    Error/timeout: ${err.message.slice(0, 60)}`);
    }
  }

  // Extra 45s for manual Finance navigation
  console.log('\n(45 seconds — please navigate to Finance > Transfers if visible)\n');
  for (let i = 45; i > 0; i -= 5) {
    await page.waitForTimeout(5000);
    process.stdout.write(`  ${i}s remaining — page: ${page.url().slice(0, 70)}\n`);
  }

  // Save session
  await context.storageState({ path: OUT_JSON });
  const data = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8'));
  // Include full localStorage (grab portal uses localStorage for auth state)
  const fullState = { cookies: data.cookies, origins: data.origins || [] };
  const b64 = zlib.gzipSync(Buffer.from(JSON.stringify(fullState)), { level: 9 }).toString('base64');
  fs.writeFileSync(OUT_B64, b64);
  fs.writeFileSync(OUT_API, JSON.stringify(captured, null, 2));
  if (responses.length > 0) {
    fs.writeFileSync(OUT_RESP, JSON.stringify(responses, null, 2));
    console.log(`\n✓ API responses: ${OUT_RESP} (${responses.length} calls)`);
  }

  const lsCount = (data.origins?.[0]?.localStorage || []).length;
  console.log(`✓ Session: ${OUT_B64} (${b64.length} chars, gzip, ${data.cookies.length} cookies, ${lsCount} localStorage keys)`);
  console.log(`✓ API calls captured: ${captured.length}`);

  // Print finance-related API responses
  const financeResps = responses.filter(r =>
    r.url.includes('finance') || r.url.includes('transfer') || r.url.includes('payout') ||
    r.url.includes('settlement') || r.url.includes('transaction') || r.url.includes('payment')
  );

  if (financeResps.length > 0) {
    console.log(`\n=== Finance API Responses (${financeResps.length}) ===`);
    financeResps.forEach(r => {
      console.log(`  [${r.status}] ${r.url}`);
      console.log(`    ${r.body.slice(0, 400).replace(/\n/g, ' ')}`);
    });
  } else {
    console.log('\n(No finance API responses captured — try navigating to Finance > Transfers manually)');
    console.log('All captured URLs with responses:');
    responses.slice(0, 30).forEach(r => console.log(`  [${r.status}] ${r.url.slice(0, 100)}`));
  }

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
