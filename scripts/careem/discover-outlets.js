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

  // Inspect category element structure on a real outlet page
  const testOutletIds = ['1054426'];
  const testCatIds = ['1076323393']; // kept for reference but not used below

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

  // Inspect actual catalog page DOM structure
  console.log('\n--- Inspecting catalog page DOM for category 1054426 ---');
  await page.goto('https://partners.careem.com/saturn-ext/merchant/catalog/1054426', {
    waitUntil: 'networkidle', timeout: 60_000
  }).catch(() => {});
  await page.waitForTimeout(3000);
  console.log(`  Title: ${await page.title()}`);

  const domInspect = await page.evaluate(() => {
    // Find all links that might be category links
    const allLinks = [...document.querySelectorAll('a')].map(a => ({
      tag: 'a',
      href: a.href,
      text: a.textContent.trim().slice(0, 60),
    })).filter(l => l.href.includes('catalog') || l.text.match(/Soup|Ramen|Salad|Bowl|Hoso|Roll|Sashimi|Nigiri|Drink|Side/i));

    // Find all nav items
    const navItems = [...document.querySelectorAll('nav *')].slice(0, 30).map(el => ({
      tag: el.tagName,
      text: el.textContent.trim().slice(0, 40),
      class: el.className.slice(0, 80),
      href: el.href || el.getAttribute('href') || null,
    }));

    // Find elements matching common sidebar patterns
    const sidebarEls = [...document.querySelectorAll('[class*="sidebar"] *, [class*="category"] *, [class*="Category"] *, [class*="nav-item"] *')].slice(0, 20).map(el => ({
      tag: el.tagName,
      text: el.textContent.trim().slice(0, 40),
      class: el.className.slice(0, 80),
      href: el.href || null,
    }));

    // Find all elements that contain category-sounding text
    const catTextEls = [];
    const catNames = ['Soup', 'Ramen', 'Salads', 'Hosomaki', 'Bowls', 'Drinks'];
    catNames.forEach(cat => {
      const el = [...document.querySelectorAll('*')].find(e => e.childNodes.length === 1 && e.textContent.trim() === cat);
      if (el) catTextEls.push({ tag: el.tagName, class: el.className.slice(0, 80), href: el.href || null, outerHTML: el.outerHTML.slice(0, 200) });
    });

    return { allLinks, navItems: navItems.slice(0, 10), sidebarEls: sidebarEls.slice(0, 10), catTextEls };
  });

  console.log('\nAll catalog links:');
  domInspect.allLinks.forEach(l => console.log(`  <a href="${l.href}"> ${l.text}`));
  console.log('\nNav items:');
  domInspect.navItems.forEach(l => console.log(`  <${l.tag} class="${l.class}"> "${l.text}" href=${l.href}`));
  console.log('\nSidebar elements:');
  domInspect.sidebarEls.forEach(l => console.log(`  <${l.tag} class="${l.class}"> "${l.text}" href=${l.href}`));
  console.log('\nCategory text elements:');
  domInspect.catTextEls.forEach(l => console.log(`  ${l.outerHTML}`));

  console.log('\n--- All API calls (last 30 unique) ---');
  [...new Set(apiCalls)].slice(-30).forEach(u => console.log(`  ${u}`));

  await browser.close();
  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
