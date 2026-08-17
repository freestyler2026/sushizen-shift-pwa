/**
 * One-time setup: opens a Noon Food RMS browser window, waits for you to log in,
 * then saves the session state as base64 for use as a GitHub Actions secret.
 *
 * Usage:
 *   npm install playwright
 *   npx playwright install chromium
 *   node scripts/noon/setup-session.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT_FILE = path.join(__dirname, 'noon-session.json');

async function main() {
  console.log('\n=== Noon Food Partner Session Setup ===\n');
  console.log('A browser window will open. Please log in to the Noon Food RMS portal.');
  console.log('URL: https://restaurant.noon.partners');
  console.log('Username: sushi@p108431');
  console.log('Once you see the Dashboard/Menu Maker, come back here and press Enter.\n');

  const browser = await chromium.launch({ headless: false, slowMo: 0 });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://restaurant.noon.partners', { waitUntil: 'domcontentloaded' });

  // Wait for user to log in
  await new Promise((resolve) => {
    process.stdout.write('Press Enter after you see the Noon Food RMS Dashboard... ');
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', resolve);
  });

  // Save session (cookies + localStorage)
  await context.storageState({ path: OUT_FILE });
  await browser.close();

  // Encode as base64
  const raw = fs.readFileSync(OUT_FILE, 'utf8');
  const b64 = Buffer.from(raw).toString('base64');

  const b64File = OUT_FILE.replace('.json', '.b64.txt');
  fs.writeFileSync(b64File, b64);

  console.log('\n✓ Session saved to:', OUT_FILE);
  console.log('✓ Base64 version:  ', b64File);
  console.log('\n--- Next steps ---');
  console.log('1. Go to your GitHub repo → Settings → Secrets → Actions');
  console.log('2. Add a new secret named: NOON_SESSION_STATE');
  console.log('3. Paste the contents of', b64File);
  console.log('\nThe GitHub Actions workflow will now run every 4 hours automatically.');
  console.log('When the session expires, re-run this script.\n');

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
