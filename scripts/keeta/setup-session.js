/**
 * One-time setup: opens the Keeta Merchant Portal in a browser window,
 * waits for you to log in, then saves session cookies as base64 for
 * use as a GitHub Actions secret.
 *
 * Usage:
 *   npx playwright install chromium   (first time only)
 *   node scripts/keeta/setup-session.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Keeta issues a separate login per brand, so this has to be run once per account.
// Writing to one fixed filename would overwrite the previous brand's session — and
// the workflow reads each brand from its own secret, so they must not collide.
const ACCOUNT   = (process.env.KEETA_ACCOUNT || 'sushi_zen').trim().toLowerCase();
const SECRET_BY_ACCOUNT = {
  sushi_zen:  'KEETA_SESSION',
  ramen_zen:  'KEETA_RZ_SESSION',
  all_veggie: 'KEETA_AVS_SESSION',
};
const SECRET_NAME = SECRET_BY_ACCOUNT[ACCOUNT];
if (!SECRET_NAME) {
  console.error(`Unknown KEETA_ACCOUNT="${ACCOUNT}". Use one of: ${Object.keys(SECRET_BY_ACCOUNT).join(', ')}`);
  process.exit(1);
}
const OUT_FILE = path.join(__dirname, `keeta-session-${ACCOUNT}.json`);

async function main() {
  console.log('\n=== Keeta Merchant Portal Session Setup ===\n');
  console.log(`Account: ${ACCOUNT}  →  GitHub secret: ${SECRET_NAME}`);
  console.log('A browser window will open. Please log in:');
  console.log('  URL: https://merchant.mykeeta.com');
  console.log(`\n  Log in with the ${ACCOUNT} account — not any other brand's.`);
  console.log('\nOnce logged in and the dashboard is visible, press Enter here.\n');

  const browser = await chromium.launch({ headless: false, slowMo: 0 });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://merchant.mykeeta.com', { waitUntil: 'domcontentloaded' });

  // Auto-detect login: poll every 2 seconds for accountId cookie to be set
  console.log('\nWaiting for login (up to 3 minutes)...');
  console.log('After logging in, navigate to the product page if not auto-redirected.\n');
  const deadline = Date.now() + 3 * 60 * 1000;
  let loggedIn = false;
  while (Date.now() < deadline) {
    const cookies = await context.cookies('https://merchant.mykeeta.com');
    const accountId = cookies.find(c => c.name === 'accountId');
    if (accountId && accountId.value) {
      console.log(`Login detected! accountId = ${accountId.value}`);
      loggedIn = true;
      break;
    }
    await page.waitForTimeout(2000);
  }
  if (!loggedIn) {
    console.log('Timeout — saving whatever state we have (session may be incomplete)');
  }

  // Navigate to product page so shopId gets stored in localStorage
  await page.goto('https://merchant.mykeeta.com/m/web/product', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Save full session state (cookies + localStorage)
  await context.storageState({ path: OUT_FILE });
  await browser.close();

  // Encode as base64 for GitHub Secret
  const raw = fs.readFileSync(OUT_FILE, 'utf8');
  const b64 = Buffer.from(raw).toString('base64');
  const b64File = OUT_FILE.replace('.json', '.b64.txt');
  fs.writeFileSync(b64File, b64);

  console.log('\n✓ Session saved to:', OUT_FILE);
  console.log('✓ Base64 version:  ', b64File);
  console.log('\n--- Next steps ---');
  console.log('1. Go to your GitHub repo → Settings → Secrets and variables → Actions');
  console.log(`2. Add (or update) the secret named: ${SECRET_NAME}`);
  console.log('3. Paste the contents of', b64File);
  console.log('\nThe GitHub Actions workflow will now run automatically.');
  console.log('When the session expires (~30 days), re-run this script.\n');

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
