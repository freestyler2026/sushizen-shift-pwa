/**
 * FoodPanda API endpoint discovery — finds the correct financial/orders endpoint
 * Run: node fp-discover.js
 * Needs: FP_EMAIL_PARANAQUE and FP_PASSWORD_PARANAQUE env vars (or hard-code for local test)
 */

const AUTH_URL   = 'https://partner-auth.ap.prd.portal.restaurant/auth/v5/login-two-step';
const VENDOR_API = 'https://vendor-api-gdp-ph.as.restaurant-partners.com';
const PLATFORM   = 'FP_PH';
const VENDOR_ID  = 't0z4';   // Paranaque
const DATE       = '2026-08-21';

const email    = process.env.FP_EMAIL_PARANAQUE    || process.argv[2];
const password = process.env.FP_PASSWORD_PARANAQUE || process.argv[3];

if (!email || !password) {
  console.error('Usage: FP_EMAIL_PARANAQUE=x FP_PASSWORD_PARANAQUE=y node fp-discover.js');
  process.exit(1);
}

function authHeaders() {
  return {
    'Content-Type':    'application/json',
    'Accept':          'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Origin':          'https://partner.foodpanda.com',
    'Referer':         'https://partner.foodpanda.com/login',
  };
}
function vendorHeaders(token) {
  return {
    'Authorization':   `Bearer ${token}`,
    'Accept':          'application/json',
    'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Origin':          'https://partner.foodpanda.com',
    'Referer':         'https://partner.foodpanda.com/',
  };
}

async function login() {
  const resp = await fetch(AUTH_URL, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ username: email, password, type: 'password' }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error('No token: ' + JSON.stringify(data).slice(0, 200));
  console.log('✓ JWT obtained');
  // Log what vendor IDs were returned
  const vendorIds = (data.profile?.accounts || []).map(a => a.vendor_id || a.code);
  if (vendorIds.length) console.log('  vendor_ids from profile:', vendorIds);
  return data.access_token;
}

async function probe(label, url, token, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const fullUrl = qs ? `${url}?${qs}` : url;
  try {
    const resp = await fetch(fullUrl, {
      headers: vendorHeaders(token),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await resp.text();
    let preview = text.slice(0, 300);
    try { preview = JSON.stringify(JSON.parse(text), null, 0).slice(0, 300); } catch (_) {}
    const icon = resp.ok ? '✅' : (resp.status === 401 ? '🔐' : resp.status === 404 ? '❌' : `⚠️(${resp.status})`);
    console.log(`${icon} [${resp.status}] ${label}`);
    console.log(`   URL: ${fullUrl.slice(0, 100)}`);
    if (resp.ok) console.log(`   Response: ${preview}`);
    return { ok: resp.ok, status: resp.status, body: text };
  } catch (err) {
    console.log(`❌ [ERR] ${label}: ${err.message}`);
    return { ok: false, status: -1 };
  }
}

async function main() {
  console.log('=== FoodPanda API Endpoint Discovery ===\n');
  const token = await login();
  const base  = `${VENDOR_API}/api/5/platforms/${PLATFORM}/vendors/${VENDOR_ID}`;

  console.log('\n── Testing known-working endpoint ──');
  await probe('catalogs (known good)', `${base}/catalogs`, token, { locale: 'en' });

  console.log('\n── Orders/financial endpoints ──');
  // Different API versions
  for (const ver of [3, 4, 5, 6, 7]) {
    const b = `${VENDOR_API}/api/${ver}/platforms/${PLATFORM}/vendors/${VENDOR_ID}`;
    await probe(`v${ver} /orders`, `${b}/orders`, token, { from: DATE, to: DATE, limit: '10' });
  }

  console.log('\n── Alternate date param names ──');
  await probe('/orders (start_date/end_date)', `${base}/orders`, token,
    { start_date: DATE, end_date: DATE, limit: '10' });
  await probe('/orders (created_from/created_to)', `${base}/orders`, token,
    { created_from: DATE, created_to: DATE, limit: '10' });
  await probe('/orders (date_from/date_to)', `${base}/orders`, token,
    { date_from: DATE, date_to: DATE, limit: '10' });

  console.log('\n── Financial/revenue endpoints ──');
  const candidates = [
    'financials', 'invoices', 'settlements', 'payouts', 'revenue',
    'analytics', 'billing', 'transactions', 'payments',
    'revenue-summary', 'finance', 'order-summary',
    'reports', 'performance', 'insights',
  ];
  for (const ep of candidates) {
    await probe(`/${ep}`, `${base}/${ep}`, token, { from: DATE, to: DATE });
  }

  console.log('\n── Top-level (no vendor prefix) ──');
  const topLevel = [
    `${VENDOR_API}/api/5/platforms/${PLATFORM}/orders`,
    `${VENDOR_API}/v1/orders`,
    `${VENDOR_API}/orders`,
  ];
  for (const url of topLevel) {
    await probe(url.replace(VENDOR_API, ''), url, token,
      { vendor_id: VENDOR_ID, from: DATE, to: DATE, limit: '10' });
  }

  console.log('\n── Different base hosts ──');
  const altHosts = [
    'https://order-api-gdp-ph.as.restaurant-partners.com',
    'https://finance-api-gdp-ph.as.restaurant-partners.com',
    'https://api-gdp-ph.as.restaurant-partners.com',
    'https://reporting-api-gdp-ph.as.restaurant-partners.com',
  ];
  for (const host of altHosts) {
    await probe(`${host}/api/5/platforms/${PLATFORM}/vendors/${VENDOR_ID}/orders`,
      `${host}/api/5/platforms/${PLATFORM}/vendors/${VENDOR_ID}/orders`, token,
      { from: DATE, to: DATE, limit: '10' });
  }

  console.log('\n── GET vendor profile (look for useful links/IDs) ──');
  const profileResult = await probe('vendor profile', base, token);
  if (profileResult.ok) {
    try {
      const d = JSON.parse(profileResult.body);
      console.log('  Full vendor keys:', Object.keys(d));
    } catch (_) {}
  }

  console.log('\nDiscovery complete.');
}

main().catch(e => { console.error(e); process.exit(1); });
