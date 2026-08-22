/**
 * Careem payout API discovery
 *
 * Navigates to Finance / Earnings / Payout pages in the Careem partner portal
 * and captures all API response bodies to identify the payout endpoint.
 *
 * Usage:
 *   node scripts/careem/explore-payouts.js
 *
 * Output:
 *   careem-payout-api-responses.json — all captured non-HTML API responses
 *   (also printed to stdout for quick scanning)
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const SESSION_B64  = path.join(__dirname, 'careem-session.b64.txt');
const SESSION_JSON = path.join(__dirname, 'careem-session.json');
const OUT_RESP     = path.join(__dirname, 'careem-payout-api-responses.json');

function loadSession() {
  // Prefer b64 file (supports gzip+b64 and plain b64)
  if (fs.existsSync(SESSION_B64)) {
    const raw = fs.readFileSync(SESSION_B64, 'utf8').trim();
    const buf = Buffer.from(raw, 'base64');
    const json = (buf[0] === 0x1f && buf[1] === 0x8b)
      ? zlib.gunzipSync(buf).toString('utf8')
      : buf.toString('utf8');
    const data = JSON.parse(json);
    // Write to temp JSON for Playwright storageState
    const tmp = path.join(__dirname, 'careem-session-tmp.json');
    fs.writeFileSync(tmp, JSON.stringify(data));
    console.log(`✓ Session: ${data.cookies?.length} cookies, ${data.origins?.length || 0} origins`);
    return tmp;
  }
  if (fs.existsSync(SESSION_JSON)) {
    console.log('✓ Using careem-session.json directly');
    return SESSION_JSON;
  }
  console.error('❌ No session found. Run setup-session.js first.');
  process.exit(1);
}

async function main() {
  console.log('\n=== Careem Payout API Discovery ===\n');

  const sessionPath = loadSession();

  const browser = await chromium.launch({ headless: false });  // visible so you can interact
  const context  = await browser.newContext({ storageState: sessionPath });
  const page     = await context.newPage();

  const responses = [];

  // Capture all non-trivial API responses
  context.on('response', async resp => {
    const url = resp.url();
    if (!url.includes('careem.com')) return;
    if (url.match(/\.(js|css|png|jpg|gif|svg|ico|woff2?|ttf)(\?|$)/)) return;
    const ct = resp.headers()['content-type'] || '';
    if (!ct.includes('json') && !ct.includes('text/plain')) return;
    try {
      const body = await resp.text();
      if (body.length < 5 || body.startsWith('<!')) return;
      const status = resp.status();
      const short = url.replace('https://partners.careem.com', '').slice(0, 100);
      responses.push({ url, status, body });
      if (status === 200) {
        process.stdout.write(`  [${status}] ${short}\n`);
        process.stdout.write(`    ${body.slice(0, 200).replace(/\n/g, ' ')}\n`);
      } else if (status !== 204) {
        process.stdout.write(`  [${status}] ${short}\n`);
      }
    } catch (_) {}
  });

  // ── 1. Bootstrap: load dashboard ─────────────────────────────────────────
  console.log('Loading dashboard...');
  await page.goto('https://partners.careem.com/saturn-ext/merchant/home', {
    waitUntil: 'networkidle', timeout: 60_000,
  }).catch(() => {});
  await page.waitForTimeout(3000);

  const homeUrl   = page.url();
  const homeTitle = await page.title();
  console.log(`\nHome → ${homeUrl} | "${homeTitle}"`);

  if (homeUrl.includes('/login') || homeUrl.includes('/auth') || homeTitle.toLowerCase().includes('sign in')) {
    console.log('\n❌ Session expired — run: node scripts/careem/setup-session.js');
    await browser.close();
    process.exit(1);
  }

  // ── 2. Auto-navigate candidate finance pages ──────────────────────────────
  const FINANCE_URLS = [
    // Most likely paths for Careem partner portal finance section
    'https://partners.careem.com/saturn-ext/merchant/payments',
    'https://partners.careem.com/saturn-ext/merchant/payouts',
    'https://partners.careem.com/saturn-ext/merchant/earnings',
    'https://partners.careem.com/saturn-ext/merchant/finance',
    'https://partners.careem.com/saturn-ext/merchant/reports',
    'https://partners.careem.com/saturn-ext/merchant/statements',
    'https://partners.careem.com/saturn-ext/merchant/invoices',
    'https://partners.careem.com/saturn-ext/merchant/settlements',
    'https://partners.careem.com/saturn-ext/merchant/wallet',
    // Without saturn-ext prefix
    'https://partners.careem.com/merchant/payments',
    'https://partners.careem.com/merchant/payouts',
    'https://partners.careem.com/merchant/finance',
    // Outlet-specific earnings
    'https://partners.careem.com/saturn-ext/merchant/earnings/1054426',
    'https://partners.careem.com/saturn-ext/merchant/payouts/1054426',
  ];

  for (const url of FINANCE_URLS) {
    const short = url.replace('https://partners.careem.com', '');
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15_000 });
      await page.waitForTimeout(3000);
      const landed  = page.url().replace('https://partners.careem.com', '');
      const ptitle  = await page.title();
      // Only log if landed somewhere interesting (didn't redirect to home/login)
      if (!landed.includes('home') && !landed.includes('catalog')) {
        console.log(`\n→ ${short}`);
        console.log(`  Landed: ${landed} | "${ptitle}"`);
        const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '');
        console.log(`  Body: ${bodyText.replace(/\n/g, ' ').slice(0, 200)}`);
      }
    } catch (err) {
      // Navigation timeout or error — not a useful page
    }
  }

  // ── 3. Navigate by clicking Finance/Payments in nav ──────────────────────
  console.log('\n\nLooking for Finance/Payments nav links...');
  await page.goto('https://partners.careem.com/saturn-ext/merchant/home', {
    waitUntil: 'networkidle', timeout: 30_000,
  }).catch(() => {});
  await page.waitForTimeout(2000);

  // Try clicking nav items that sound like finance
  const navKeywords = ['payment', 'payout', 'earning', 'finance', 'report', 'statement', 'invoice', 'settlement', 'wallet'];
  const navLinks = await page.evaluate((keywords) => {
    return [...document.querySelectorAll('a, button, [role="menuitem"], [role="button"]')]
      .filter(el => {
        const t = (el.textContent || '').toLowerCase().trim();
        return keywords.some(k => t.includes(k));
      })
      .map(el => ({
        tag: el.tagName,
        text: el.textContent.trim().slice(0, 60),
        href: el.href || el.getAttribute('href') || null,
      }));
  }, navKeywords);

  console.log(`Found ${navLinks.length} finance-like nav items:`);
  navLinks.forEach(l => console.log(`  <${l.tag}> "${l.text}" → ${l.href || '(no href)'}`));

  // Click the first promising link
  for (const link of navLinks) {
    if (link.href && link.href.includes('careem.com')) {
      console.log(`\nClicking: ${link.text} → ${link.href}`);
      await page.goto(link.href, { waitUntil: 'networkidle', timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(4000);
      console.log(`  Landed: ${page.url().replace('https://partners.careem.com', '')}`);
      break;
    }
  }

  // ── 4. 45s manual window for exploration ─────────────────────────────────
  console.log('\n(45 seconds — please navigate to Finance/Payments/Payouts in the browser)\n');
  for (let i = 45; i > 0; i -= 5) {
    await page.waitForTimeout(5000);
    process.stdout.write(`  ${i}s remaining — ${page.url().replace('https://partners.careem.com', '').slice(0, 80)}\n`);
  }

  // ── 5. Also try Careem EAT portal (separate domain) ──────────────────────
  console.log('\nTrying careem eats partner portals...');
  const altPortals = [
    'https://restaurant.careem.com/earnings',
    'https://restaurant.careem.com/payouts',
    'https://restaurant.careem.com/finance',
    'https://restaurant.careem.com/payments',
  ];
  for (const u of altPortals) {
    try {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 10_000 });
      await page.waitForTimeout(2000);
      console.log(`  ${u.replace('https://', '')} → ${page.url().slice(0, 80)} | "${await page.title()}"`);
    } catch (_) {}
  }

  // ── 6. Save + print results ───────────────────────────────────────────────
  fs.writeFileSync(OUT_RESP, JSON.stringify(responses, null, 2));
  console.log(`\n✓ ${responses.length} API responses saved → ${OUT_RESP}`);

  const financeResps = responses.filter(r =>
    r.url.match(/payout|earning|finance|payment|settlement|invoice|report|wallet|statement/i)
  );

  if (financeResps.length > 0) {
    console.log(`\n=== Finance-related responses (${financeResps.length}) ===`);
    financeResps.forEach(r => {
      console.log(`  [${r.status}] ${r.url.replace('https://partners.careem.com', '')}`);
      console.log(`    ${r.body.slice(0, 500).replace(/\n/g, ' ')}`);
    });
  } else {
    console.log('\n(No finance-specific API responses captured)');
    console.log('All unique domains / paths captured:');
    [...new Set(responses.map(r => {
      try { return new URL(r.url).pathname.split('/').slice(0, 4).join('/'); } catch { return r.url.slice(0, 60); }
    }))].forEach(p => console.log(`  ${p}`));
  }

  await browser.close();

  // Clean up temp session
  try { fs.unlinkSync(path.join(__dirname, 'careem-session-tmp.json')); } catch (_) {}

  console.log('\nDone. Review careem-payout-api-responses.json for full details.');
}

main().catch(err => { console.error(err); process.exit(1); });
