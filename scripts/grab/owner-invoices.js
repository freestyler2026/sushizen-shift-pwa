/**
 * Grab owner account: capture the monthly VAT invoices (VAT plan 2-4).
 *
 * The store sessions get 403 UP216 on mex/finances/v2/merchants/invoices
 * ("Reports & invoices are only available for the business owner and
 * managers"). This opens a visible browser; the owner logs in themselves and
 * opens Reports & invoices. Every finance/invoice response is written to OUT.
 * Nothing about the login is stored: no session file, no cookies saved.
 *
 *   OUT=/path/to/grab-owner-invoices.json node scripts/grab/owner-invoices.js
 *
 * Close the browser window when done.
 */
const fs = require('fs');
const { chromium } = require('playwright');

// The owner's invoice data: kept out of the repository unless OUT says otherwise.
const OUT = process.env.OUT || require('path').join(require('os').tmpdir(), 'grab-owner-invoices.json');

(async () => {
  // Headed on purpose: the portal logs a headless browser out (hydra-shield).
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  const captured = [];
  context.on('response', async (resp) => {
    const url = resp.url();
    if (!/merchant\.grab\.com\/mex\/(finances|reports)|invoice/i.test(url)) return;
    let body = null;
    try {
      const ct = resp.headers()['content-type'] || '';
      body = ct.includes('json') ? await resp.json() : `[${ct}, ${(await resp.body()).length} bytes]`;
    } catch (_) { /* body not readable */ }
    captured.push({ url, status: resp.status(), at: new Date().toISOString(), body });
    fs.writeFileSync(OUT, JSON.stringify(captured, null, 1));
    console.log(`  ${resp.status()} ${url.slice(0, 140)}`);
  });
  await page.goto('https://merchant.grab.com/portal');
  console.log('\nLog in with the OWNER account, then open Reports & invoices (and an invoice).');
  console.log(`Responses are saved to ${OUT}. Close the browser window when done.\n`);
  await new Promise((resolve) => browser.on('disconnected', resolve));
  console.log(`\nDone: ${captured.length} response(s) in ${OUT}`);
})();
