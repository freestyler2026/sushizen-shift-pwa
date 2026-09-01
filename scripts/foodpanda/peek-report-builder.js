/**
 * Look at the Report Builder page — the place ordersSummary_*.csv came from.
 *
 * The API route is closed: PerimeterX answers SalesOverviewByTime with 403 for
 * any programmatic call, headless or headed, replayed or rewritten. So the
 * question becomes what the export screen itself offers, and in particular
 * whether one export can cover a date range rather than a single day.
 *
 * Read-only: it opens the page and photographs it.
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const LOCATION = process.argv[2] || 'paranaque';
const SESSION = path.join(__dirname, `${LOCATION}-session.b64.txt`);
const TMP = path.join(__dirname, `.peek-${LOCATION}.json`);
const buf = Buffer.from(fs.readFileSync(SESSION, 'utf8').trim(), 'base64');
fs.writeFileSync(TMP, buf[0] === 0x1f ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8'));

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: TMP });
  const page = await context.newPage();
  await page.goto('https://partner.foodpanda.com/report-builder', { waitUntil: 'networkidle', timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(6000);
  console.log('URL:', page.url());
  const shot = path.join(__dirname, `report-builder-${LOCATION}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  console.log('screenshot:', shot);
  const text = await page.evaluate(() => document.body.innerText.slice(0, 2500));
  console.log('\n--- page text ---\n' + text);
  await browser.close();
  try { fs.unlinkSync(TMP); } catch {}
})();
