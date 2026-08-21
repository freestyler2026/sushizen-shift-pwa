/**
 * Discover the outletIds and categoryIds accessible from the saved Careem session.
 * Run locally after setup-session.js:
 *   node scripts/careem/discover-outlets.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SESSION_PATH = path.join(__dirname, 'careem-session.json');

async function main() {
  if (!fs.existsSync(SESSION_PATH)) {
    console.error('Session file not found — run setup-session.js first');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: SESSION_PATH });
  const page = await context.newPage();

  console.log('Loading Careem partner portal dashboard...');
  await page.goto('https://partners.careem.com', { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {});

  const url = page.url();
  const title = await page.title();
  console.log(`URL:   ${url}`);
  console.log(`Title: ${title}`);

  if (url.includes('/login') || url.includes('/auth')) {
    console.log('Session expired — re-run setup-session.js');
    await browser.close();
    process.exit(1);
  }

  // Scan for catalog links
  const allLinks = await page.evaluate(() => {
    const links = [];
    document.querySelectorAll('a').forEach(a => {
      if (a.href) links.push({ href: a.href, text: a.textContent.trim() });
    });
    return links;
  });

  const catalogLinks = allLinks.filter(l => l.href.includes('/catalog/'));
  console.log('\n--- Catalog links found on dashboard ---');
  if (catalogLinks.length > 0) {
    catalogLinks.forEach(l => console.log(`  ${l.text || '(no text)'}  →  ${l.href}`));
  } else {
    console.log('  None found on dashboard page');
  }

  // Try to find outlet selector or outlet list links
  const outletLinks = allLinks.filter(l =>
    l.href.includes('/outlet') || l.href.includes('/brand') || l.href.includes('/restaurant')
  );
  console.log('\n--- Other outlet-related links ---');
  outletLinks.slice(0, 20).forEach(l => console.log(`  ${l.text || '(no text)'}  →  ${l.href}`));

  // Dump inner text for manual inspection
  const bodySnippet = await page.evaluate(() => document.body?.innerText?.slice(0, 1000) || '');
  console.log('\n--- Page text (first 1000 chars) ---');
  console.log(bodySnippet);

  // Intercept ALL API calls to discover outletIds and catalog structure
  const apiCalls = [];
  page.on('request', req => {
    const u = req.url();
    if (u.includes('careem.com/')) apiCalls.push(u);
  });

  // Click Store Manager link
  console.log('\nLooking for Store Manager portal link...');
  const storeManagerLink = await page.$('a:has-text("Store Manager"), button:has-text("Store Manager"), [href*="saturn-ext"]');
  if (storeManagerLink) {
    const href = await storeManagerLink.getAttribute('href');
    console.log(`  Found Store Manager link: ${href}`);
    await storeManagerLink.click();
    await page.waitForTimeout(3000);
    console.log(`  After click URL: ${page.url()}`);
    console.log(`  After click Title: ${await page.title()}`);
  } else {
    console.log('  Store Manager link not found — navigating to saturn-ext directly');
    await page.goto('https://partners.careem.com/saturn-ext/merchant', {
      waitUntil: 'networkidle', timeout: 20_000
    }).catch(() => {});
  }

  // Navigate to catalog section
  console.log('\nNavigating to catalog...');
  await page.goto('https://partners.careem.com/saturn-ext/merchant/catalog', {
    waitUntil: 'networkidle', timeout: 20_000
  }).catch(() => {});
  await page.waitForTimeout(3000);
  console.log(`  URL:   ${page.url()}`);
  console.log(`  Title: ${await page.title()}`);

  const catalogLinks2 = await page.evaluate(() => {
    const links = [];
    document.querySelectorAll('a').forEach(a => {
      if (a.href.includes('/catalog/')) links.push({ href: a.href, text: a.textContent.trim() });
    });
    return links;
  });
  console.log(`  Catalog links on overview: ${catalogLinks2.length}`);
  catalogLinks2.slice(0, 10).forEach(l => console.log(`    "${l.text}"  →  ${l.href}`));

  const overviewBody = await page.evaluate(() => document.body?.innerText?.slice(0, 800) || '');
  console.log(`\n  Overview body:\n${overviewBody.replace(/^/gm, '    ')}`);

  // Look for outlet switcher / outlet selector
  const outletSwitcher = await page.evaluate(() => {
    const texts = [];
    document.querySelectorAll('select, [class*="outlet"], [class*="Outlet"], [class*="brand"], [class*="Brand"]').forEach(el => {
      texts.push(el.outerHTML.slice(0, 200));
    });
    return texts;
  });
  console.log(`\n  Outlet-related elements: ${outletSwitcher.length}`);
  outletSwitcher.forEach(h => console.log(`    ${h}`));

  // Try known outlet IDs to find which ones work
  const testOutletIds = ['1054426', '1067896', '1074763'];
  const testCatIds = ['1076323393'];

  console.log('\n--- Testing outlet catalog URLs ---');
  for (const oid of testOutletIds) {
    const testUrl = `https://partners.careem.com/saturn-ext/merchant/catalog/${oid}`;
    await page.goto(testUrl, { waitUntil: 'networkidle', timeout: 20_000 }).catch(() => {});
    const t = await page.title();
    console.log(`  /catalog/${oid}  → "${t}"  (${page.url()})`);
  }

  // Try with a category seed
  for (const oid of testOutletIds) {
    for (const cid of testCatIds) {
      const testUrl = `https://partners.careem.com/saturn-ext/merchant/catalog/${oid}/${cid}`;
      await page.goto(testUrl, { waitUntil: 'networkidle', timeout: 20_000 }).catch(() => {});
      const t = await page.title();
      const body = await page.evaluate(() => document.body?.innerText?.slice(0, 200) || '');
      console.log(`  /catalog/${oid}/${cid}  → "${t}"  body: ${body.replace(/\n/g, ' | ').slice(0, 100)}`);
    }
  }

  // Navigate to menu management section
  console.log('\n--- Navigating to menu/catalog management ---');
  const menuUrls = [
    'https://partners.careem.com/saturn-ext/merchant/menu',
    'https://partners.careem.com/saturn-ext/merchant/menu-management',
  ];
  for (const mu of menuUrls) {
    await page.goto(mu, { waitUntil: 'networkidle', timeout: 15_000 }).catch(() => {});
    const t = await page.title();
    console.log(`  ${mu}  → "${t}"`);
  }

  console.log('\n--- All API calls (first 30) ---');
  [...new Set(apiCalls)].slice(0, 30).forEach(u => console.log(`  ${u}`));

  await browser.close();
  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
