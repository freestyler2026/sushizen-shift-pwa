/**
 * Keeta Merchant Portal — payout API discovery
 *
 * Keeta supports direct HTTP (no Cloudflare), so Phase 1 probes
 * candidate finance endpoints directly. Phase 2 uses Playwright
 * to navigate finance pages and capture whatever the SPA calls.
 *
 * Usage:
 *   node scripts/keeta/explore-payouts.js
 *
 * Output:
 *   keeta-payout-api-responses.json — all captured API responses
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const SESSION_B64  = path.join(__dirname, 'keeta-session.b64.txt');
const SESSION_JSON = path.join(__dirname, 'keeta-session.json');
const OUT_FILE     = path.join(__dirname, 'keeta-payout-api-responses.json');

const PORTAL = 'https://merchant.mykeeta.com';

// Known shop IDs (from check-prices.js, discovered earlier)
const SHOPS = [
  { name: 'Arjan',           id: '1644178222' },
  { name: 'Al Barsha 3',     id: '1644171212' },
  { name: 'Business Bay',    id: '1644198211' },
  { name: 'Jumeirah Lake',   id: '1644191210' },
  { name: 'Al Mina',         id: '1644184196' },
];
const FIRST_SHOP = SHOPS[0];

// ── Session ──────────────────────────────────────────────────────────────────

function loadSession() {
  if (fs.existsSync(SESSION_B64)) {
    const raw = fs.readFileSync(SESSION_B64, 'utf8').trim();
    const buf = Buffer.from(raw, 'base64');
    const json = (buf[0] === 0x1f && buf[1] === 0x8b)
      ? zlib.gunzipSync(buf).toString('utf8')
      : buf.toString('utf8');
    const data = JSON.parse(json);
    console.log(`✓ Session from b64 file (${data.cookies?.length} cookies)`);
    return data;
  }
  if (fs.existsSync(SESSION_JSON)) {
    const data = JSON.parse(fs.readFileSync(SESSION_JSON, 'utf8'));
    console.log(`✓ Session from JSON file (${data.cookies?.length} cookies)`);
    return data;
  }
  console.error('❌ No session found. Run: node scripts/keeta/setup-session.js');
  process.exit(1);
}

function buildCookieStr(sessionData) {
  const cookies = sessionData.cookies?.filter(c => c.domain?.includes('mykeeta.com')) || [];
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

// ── Direct HTTP probe ────────────────────────────────────────────────────────

async function probe(cookieStr, method, urlPath, body) {
  const opts = {
    method,
    headers: {
      'Content-Type':  'application/json',
      'Accept':        'application/json, text/plain, */*',
      'User-Agent':    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Referer':       `${PORTAL}/m/web/finance`,
      'Origin':        PORTAL,
      'Cookie':        cookieStr,
    },
    signal: AbortSignal.timeout(10_000),
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`${PORTAL}${urlPath}`, opts);
  const text = await resp.text();
  return { status: resp.status, text };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Keeta Payout API Discovery ===\n');

  const session   = loadSession();
  const cookieStr = buildCookieStr(session);

  // Check token expiry
  const tokenCookie = session.cookies?.find(c => c.name === 'token');
  if (tokenCookie?.expires > 0) {
    const expDate = new Date(tokenCookie.expires * 1000);
    console.log(`Token expires: ${expDate.toISOString().slice(0, 10)}`);
  }

  // ── Phase 1: Direct HTTP probes ───────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('Phase 1: Direct HTTP probes');
  console.log('='.repeat(60) + '\n');

  const SHOP_ID = FIRST_SHOP.id;
  const TODAY   = new Date().toISOString().slice(0, 10);
  const MONTH   = TODAY.slice(0, 7);          // YYYY-MM
  const MONTH_START = MONTH + '-01';
  const MONTH_END   = TODAY;

  // Common request bodies — adjust shopId as needed
  const commonBody     = { shopId: SHOP_ID, pageNum: 1, pageSize: 20 };
  const dateBody       = { shopId: SHOP_ID, pageNum: 1, pageSize: 20, startDate: MONTH_START, endDate: MONTH_END };
  const dateBodyAlt    = { shopId: SHOP_ID, pageNum: 1, pageSize: 20, beginDate: MONTH_START, endDate: MONTH_END };
  const monthBody      = { shopId: SHOP_ID, pageNum: 1, pageSize: 20, month: MONTH };

  const CANDIDATES = [
    // Finance module patterns
    { method: 'POST', path: '/api/sailorFinance/settlement/r/listSettlement',    body: commonBody },
    { method: 'POST', path: '/api/sailorFinance/settlement/r/list',              body: commonBody },
    { method: 'POST', path: '/api/sailorFinance/statement/r/listStatement',      body: dateBody   },
    { method: 'POST', path: '/api/sailorFinance/statement/r/list',               body: dateBody   },
    { method: 'POST', path: '/api/sailorFinance/payout/r/listPayout',            body: commonBody },
    { method: 'POST', path: '/api/sailorFinance/payout/r/list',                  body: commonBody },
    { method: 'POST', path: '/api/sailorFinance/income/r/listIncome',            body: dateBody   },
    { method: 'POST', path: '/api/sailorFinance/income/r/list',                  body: dateBody   },
    { method: 'POST', path: '/api/sailorFinance/order/r/list',                   body: dateBody   },
    { method: 'POST', path: '/api/sailorFinance/report/r/list',                  body: monthBody  },
    { method: 'POST', path: '/api/sailorFinance/balance/r/getBalance',           body: { shopId: SHOP_ID } },
    { method: 'POST', path: '/api/sailorFinance/wallet/r/getWallet',             body: { shopId: SHOP_ID } },
    // Revenue/Order module
    { method: 'POST', path: '/api/sailorOrder/order/r/listOrder',                body: dateBody   },
    { method: 'POST', path: '/api/sailorOrder/order/r/list',                     body: dateBody   },
    { method: 'POST', path: '/api/sailorOrder/settlement/r/list',                body: commonBody },
    // Report module
    { method: 'POST', path: '/api/sailorReport/finance/r/list',                  body: dateBody   },
    { method: 'POST', path: '/api/sailorReport/settlement/r/list',               body: commonBody },
    { method: 'POST', path: '/api/sailorReport/revenue/r/list',                  body: dateBody   },
    { method: 'POST', path: '/api/sailorReport/daily/r/list',                    body: dateBody   },
    // Alternative date formats
    { method: 'POST', path: '/api/sailorFinance/settlement/r/listSettlement',    body: dateBodyAlt },
    { method: 'POST', path: '/api/sailorFinance/statement/r/listStatement',      body: dateBodyAlt },
    // GET endpoints
    { method: 'GET',  path: `/api/sailorFinance/settlement/r/list?shopId=${SHOP_ID}&pageNum=1&pageSize=20` },
    { method: 'GET',  path: `/api/sailorFinance/statement/r/list?shopId=${SHOP_ID}` },
    { method: 'GET',  path: `/api/sailorFinance/balance/r/getBalance?shopId=${SHOP_ID}` },
    // Generic finance paths
    { method: 'POST', path: '/api/finance/settlement/list',                      body: commonBody },
    { method: 'POST', path: '/api/finance/statement/list',                       body: dateBody   },
    { method: 'POST', path: '/api/finance/payout/list',                          body: commonBody },
    { method: 'GET',  path: `/api/finance/balance?shopId=${SHOP_ID}` },
    // Sailor accounting patterns
    { method: 'POST', path: '/api/sailorAccounting/settlement/r/list',           body: commonBody },
    { method: 'POST', path: '/api/sailorBilling/settlement/r/list',              body: commonBody },
    { method: 'POST', path: '/api/sailorBilling/invoice/r/list',                 body: commonBody },
  ];

  const httpResults = [];

  for (const ep of CANDIDATES) {
    try {
      const { status, text } = await probe(cookieStr, ep.method, ep.path, ep.body);
      const preview = text.slice(0, 250).replace(/\n/g, ' ');
      const label = `[${status}] ${ep.method} ${ep.path}`;

      if (status === 200) {
        let parsed;
        try { parsed = JSON.parse(text); } catch (_) { parsed = null; }
        // Only log/save non-trivially-empty responses
        const isEmpty = parsed && (parsed.data === null || (Array.isArray(parsed.data) && parsed.data.length === 0)
                        || (parsed.data?.list && parsed.data.list.length === 0));
        if (isEmpty) {
          console.log(`  ${label}  → (empty list)`);
        } else {
          console.log(`✓ ${label}`);
          console.log(`  ${preview}`);
        }
        httpResults.push({ ...ep, status, response: text });
      } else if (status === 404) {
        // silently skip 404
      } else if (status === 401 || status === 403) {
        console.log(`  ${label}  → AUTH`);
      } else {
        console.log(`  ${label}  → ${preview}`);
      }
    } catch (err) {
      console.log(`  ❌ ${ep.path}: ${err.message}`);
    }
  }

  // ── Phase 2: Playwright page navigation ──────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('Phase 2: Playwright navigation (visible browser)');
  console.log('='.repeat(60) + '\n');

  const tmpSession = path.join(__dirname, 'keeta-session-tmp.json');
  fs.writeFileSync(tmpSession, JSON.stringify(session));

  const browser = await chromium.launch({ headless: false });
  const context  = await browser.newContext({ storageState: tmpSession });
  const page     = await context.newPage();

  const pageResponses = [];

  context.on('response', async resp => {
    const url = resp.url();
    if (!url.includes('mykeeta.com')) return;
    if (url.match(/\.(js|css|png|jpg|gif|svg|ico|woff2?|ttf|map)(\?|$)/)) return;
    const ct = resp.headers()['content-type'] || '';
    if (!ct.includes('json') && !ct.includes('text/plain')) return;
    try {
      const body = await resp.text();
      if (body.length < 5 || body.startsWith('<!')) return;
      const status = resp.status();
      const short  = url.replace(PORTAL, '').slice(0, 110);
      pageResponses.push({ url, status, body });
      if (status === 200) {
        process.stdout.write(`  [${status}] ${short}\n`);
        process.stdout.write(`    ${body.slice(0, 200).replace(/\n/g, ' ')}\n`);
      } else if (status !== 204 && status !== 404) {
        process.stdout.write(`  [${status}] ${short}\n`);
      }
    } catch (_) {}
  });

  // Start at product page (known good)
  console.log('Loading merchant portal...');
  await page.goto(`${PORTAL}/m/web/product`, {
    waitUntil: 'networkidle', timeout: 30_000,
  }).catch(() => {});
  await page.waitForTimeout(2000);

  const homeUrl = page.url();
  if (homeUrl.includes('/login') || homeUrl.includes('/auth')) {
    console.error('\n❌ Session expired. Run: node scripts/keeta/setup-session.js');
    await browser.close();
    fs.unlinkSync(tmpSession);
    process.exit(1);
  }
  console.log(`✓ Logged in. URL: ${homeUrl.replace(PORTAL, '')}`);

  // Navigate candidate finance pages
  const FINANCE_PAGES = [
    '/m/web/finance',
    '/m/web/settlement',
    '/m/web/payout',
    '/m/web/statement',
    '/m/web/revenue',
    '/m/web/report',
    '/m/web/earnings',
    '/m/web/order',
    '/m/web/orders',
    '/m/web/income',
    '/m/web/wallet',
  ];

  for (const pg of FINANCE_PAGES) {
    try {
      await page.goto(`${PORTAL}${pg}`, { waitUntil: 'networkidle', timeout: 12_000 });
      await page.waitForTimeout(2500);
      const landed = page.url().replace(PORTAL, '');
      const title  = await page.title();
      if (!landed.includes('/product') && !landed.includes('/login')) {
        console.log(`\n→ ${pg} | Landed: ${landed} | "${title}"`);
      }
    } catch (_) {}
  }

  // Look for finance nav links and click them
  console.log('\nLooking for finance nav items...');
  await page.goto(`${PORTAL}/m/web/product`, { waitUntil: 'networkidle', timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const navLinks = await page.evaluate(() => {
    const keywords = ['finance', 'payment', 'payout', 'earning', 'settlement', 'statement', 'revenue', 'report', 'wallet', 'income', 'order'];
    return [...document.querySelectorAll('a, [role="menuitem"], [role="button"], li')]
      .filter(el => {
        const t = (el.textContent || '').toLowerCase().trim();
        return keywords.some(k => t.includes(k)) && t.length < 60;
      })
      .map(el => ({
        tag:  el.tagName,
        text: el.textContent.trim().slice(0, 60),
        href: el.getAttribute('href') || null,
      }))
      .slice(0, 20);
  });

  console.log(`Found ${navLinks.length} finance-like nav items:`);
  navLinks.forEach(l => console.log(`  <${l.tag}> "${l.text}" → ${l.href || '(no href)'}`));

  // Click the first promising link
  for (const link of navLinks) {
    if (link.href && (link.href.startsWith('/') || link.href.includes('mykeeta.com'))) {
      const url = link.href.startsWith('http') ? link.href : `${PORTAL}${link.href}`;
      console.log(`\nClicking: "${link.text}" → ${url}`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(3000);
      console.log(`  Landed: ${page.url().replace(PORTAL, '')}`);
      break;
    }
  }

  // Manual exploration window
  console.log('\n(45 seconds — please click through Finance / Settlement / Payout pages)\n');
  for (let i = 45; i > 0; i -= 5) {
    await page.waitForTimeout(5000);
    process.stdout.write(`  ${i}s — ${page.url().replace(PORTAL, '').slice(0, 80)}\n`);
  }

  await browser.close();
  try { fs.unlinkSync(tmpSession); } catch (_) {}

  // ── Results ───────────────────────────────────────────────────────────────
  const all = [...httpResults, ...pageResponses];
  fs.writeFileSync(OUT_FILE, JSON.stringify(all, null, 2));
  console.log(`\n✓ ${all.length} total responses saved → ${OUT_FILE}`);

  const financeKeyword = /finance|settlement|payout|payment|earning|revenue|statement|report|income|wallet|invoice|order/i;
  const financeResps   = pageResponses.filter(r => financeKeyword.test(r.url));
  const financeHttp    = httpResults.filter(r => r.status === 200);

  if (financeHttp.length > 0) {
    console.log(`\n=== Direct HTTP hits (${financeHttp.length}) ===`);
    financeHttp.forEach(r => {
      console.log(`  [${r.status}] ${r.method} ${r.path}`);
      console.log(`    ${r.response.slice(0, 400).replace(/\n/g, ' ')}`);
    });
  }

  if (financeResps.length > 0) {
    console.log(`\n=== Finance-related page responses (${financeResps.length}) ===`);
    financeResps.forEach(r => {
      console.log(`  [${r.status}] ${r.url.replace(PORTAL, '')}`);
      console.log(`    ${r.body.slice(0, 400).replace(/\n/g, ' ')}`);
    });
  }

  if (financeHttp.length === 0 && financeResps.length === 0) {
    console.log('\n⚠ No finance endpoints found.');
    console.log('All unique API paths captured:');
    [...new Set(pageResponses.map(r => {
      try { return new URL(r.url).pathname.split('/').slice(0, 5).join('/'); }
      catch { return r.url.slice(0, 70); }
    }))].forEach(p => console.log(`  ${p}`));
  }

  console.log('\nDone. Review keeta-payout-api-responses.json for full details.');
}

main().catch(err => { console.error(err); process.exit(1); });
