/**
 * FoodPanda PH Partner Portal — per-store daily revenue extractor (REST, no Playwright)
 *
 * Flow:
 *   1. For each store, POST to partner-auth → fresh JWT (no 2FA, no session file needed)
 *   2. GET vendor orders for the target date range
 *   3. Sum completed order totals → gross sales per store
 *   4. POST per-store record to WEBHOOK_URL
 *
 * Auth:    POST https://partner-auth.ap.prd.portal.restaurant/auth/v5/login-two-step
 * Orders:  GET  https://vendor-api-gdp-ph.as.restaurant-partners.com/api/5/platforms/FP_PH/vendors/{vendorId}/orders
 *
 * Usage (local test):
 *   DATE_FROM=2026-08-21 DATE_TO=2026-08-21 \
 *   FP_EMAIL_PARANAQUE=xxx FP_PASSWORD_PARANAQUE=xxx \
 *   FP_EMAIL_TAFT=xxx      FP_PASSWORD_TAFT=xxx \
 *   FP_EMAIL_QC=xxx        FP_PASSWORD_QC=xxx \
 *   node scripts/foodpanda/get-payouts.js
 *
 * Usage (CI): all env vars set from GitHub Secrets + workflow env.
 */

const DATE_FROM   = process.env.DATE_FROM;   // YYYY-MM-DD required
const DATE_TO     = process.env.DATE_TO;     // YYYY-MM-DD required
const WEBHOOK_URL = process.env.WEBHOOK_URL;

if (!DATE_FROM || !DATE_TO) {
  console.error('DATE_FROM and DATE_TO must be set (e.g. 2026-08-21)');
  process.exit(1);
}

const AUTH_URL   = 'https://partner-auth.ap.prd.portal.restaurant/auth/v5/login-two-step';
const VENDOR_API = 'https://vendor-api-gdp-ph.as.restaurant-partners.com';
const PLATFORM   = 'FP_PH';

const ACCOUNTS = [
  {
    email:     process.env.FP_EMAIL_PARANAQUE,
    password:  process.env.FP_PASSWORD_PARANAQUE,
    storeName: 'Sushi Zen - Paranaque',
    storeCode: 'FP_PARANAQUE',
    vendorId:  't0z4',
  },
  {
    email:     process.env.FP_EMAIL_TAFT,
    password:  process.env.FP_PASSWORD_TAFT,
    storeName: 'Sushi Zen - Taft',
    storeCode: 'FP_TAFT',
    vendorId:  'ryqc',
  },
  {
    email:     process.env.FP_EMAIL_QC,
    password:  process.env.FP_PASSWORD_QC,
    storeName: 'Sushi Zen - Cubao',
    storeCode: 'FP_QC',
    vendorId:  'a97i',
  },
];

// ── Headers ───────────────────────────────────────────────────────────────────

function authHeaders() {
  return {
    'Content-Type':    'application/json',
    'Accept':          'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    'Origin':          'https://partner.foodpanda.com',
    'Referer':         'https://partner.foodpanda.com/login',
  };
}

function vendorHeaders(token) {
  return {
    'Authorization':   `Bearer ${token}`,
    'Accept':          'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    'Origin':          'https://partner.foodpanda.com',
    'Referer':         'https://partner.foodpanda.com/',
  };
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function login(email, password) {
  const resp = await fetch(AUTH_URL, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify({ username: email, password, type: 'password' }),
    signal:  AbortSignal.timeout(20_000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Auth failed ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  const token = data.access_token;
  if (!token) throw new Error(`No access_token in response: ${JSON.stringify(data).slice(0, 300)}`);
  return token;
}

// ── Orders ────────────────────────────────────────────────────────────────────

// Build date range for FoodPanda PH (PHT = UTC+8)
// Try ISO datetime format with timezone first; fallback handled in fetch
function makeTimeRange(dateStr) {
  return {
    from: `${dateStr}T00:00:00+08:00`,
    to:   `${dateStr}T23:59:59+08:00`,
  };
}

async function fetchOrdersPage(vendorId, token, paramStyle, offset, limit) {
  const base   = `${VENDOR_API}/api/5/platforms/${PLATFORM}/vendors/${vendorId}`;
  const range  = makeTimeRange(DATE_FROM === DATE_TO ? DATE_FROM : DATE_FROM);

  let params;
  if (paramStyle === 'datetime') {
    // First attempt: ISO datetime with timezone
    params = new URLSearchParams({
      from:   range.from,
      to:     range.to,
      limit:  String(limit),
      offset: String(offset),
    });
  } else if (paramStyle === 'date') {
    // Second attempt: plain date strings
    params = new URLSearchParams({
      from:   DATE_FROM,
      to:     DATE_TO,
      limit:  String(limit),
      offset: String(offset),
    });
  } else {
    // Third attempt: start_date / end_date naming
    params = new URLSearchParams({
      start_date: DATE_FROM,
      end_date:   DATE_TO,
      limit:      String(limit),
      offset:     String(offset),
    });
  }

  const url  = `${base}/orders?${params}`;
  const resp = await fetch(url, {
    headers: vendorHeaders(token),
    signal:  AbortSignal.timeout(25_000),
  });
  return { resp, url };
}

function extractItems(data) {
  if (Array.isArray(data))                          return data;
  if (Array.isArray(data.orders))                   return data.orders;
  if (Array.isArray(data.items))                    return data.items;
  if (data.data && Array.isArray(data.data))        return data.data;
  if (data.data && Array.isArray(data.data.items))  return data.data.items;
  if (data.data && Array.isArray(data.data.orders)) return data.data.orders;
  return null;   // unknown shape
}

async function fetchOrders(vendorId, token) {
  const LIMIT   = 200;
  const all     = [];
  let paramStyle = 'datetime';

  for (let offset = 0; offset < 10_000; offset += LIMIT) {
    const { resp, url } = await fetchOrdersPage(vendorId, token, paramStyle, offset, LIMIT);

    if (!resp.ok) {
      if (offset === 0 && paramStyle !== 'start_date') {
        // Retry with next param style
        const next = { datetime: 'date', date: 'start_date' }[paramStyle];
        console.log(`    [RETRY] ${resp.status} — switching to paramStyle=${next}`);
        paramStyle = next;
        const { resp: r2, url: u2 } = await fetchOrdersPage(vendorId, token, paramStyle, 0, LIMIT);
        if (!r2.ok) {
          const text = await r2.text().catch(() => '');
          throw new Error(`Orders API ${r2.status} (all param styles tried): ${text.slice(0, 200)}`);
        }
        const data2 = await r2.json();
        const items2 = extractItems(data2);
        if (!items2) {
          console.log(`    [DEBUG] Unknown response shape: ${JSON.stringify(data2).slice(0, 400)}`);
          break;
        }
        all.push(...items2);
        if (items2.length < LIMIT) break;
        offset = 0;
        continue;
      }
      const text = await resp.text().catch(() => '');
      throw new Error(`Orders API ${resp.status}: ${text.slice(0, 200)}`);
    }

    const data  = await resp.json();
    const items = extractItems(data);

    if (!items) {
      console.log(`    [DEBUG] Unknown response shape: ${JSON.stringify(data).slice(0, 400)}`);
      break;
    }
    all.push(...items);
    if (items.length < LIMIT) break;
    await new Promise(r => setTimeout(r, 200));
  }

  return all;
}

// ── Aggregation ───────────────────────────────────────────────────────────────

const CANCELLED_STATUSES = new Set(['CANCELLED', 'REJECTED', 'FAILED', 'FRAUD', 'DECLINED']);

function sumOrders(orders) {
  let grossSales  = 0;
  let ordersCount = 0;

  for (const o of orders) {
    const status = String(o.status || o.order_status || '').toUpperCase();
    if (CANCELLED_STATUSES.has(status)) continue;

    // FoodPanda uses several field names across API versions
    const value = parseFloat(
      o.total_value  ?? o.order_value ?? o.grand_total ??
      o.total_amount ?? o.sub_total   ?? o.amount      ?? 0
    );

    grossSales += value;
    ordersCount++;
  }

  return { grossSales: Math.round(grossSales * 100) / 100, ordersCount };
}

// ── Webhook ───────────────────────────────────────────────────────────────────

async function postWebhook(payload) {
  if (!WEBHOOK_URL) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    return;
  }
  const resp = await fetch(WEBHOOK_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
    signal:  AbortSignal.timeout(15_000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Webhook ${resp.status}: ${text.slice(0, 200)}`);
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`FoodPanda PH daily extractor: ${DATE_FROM} → ${DATE_TO}`);
  console.log('='.repeat(60));

  const extractedAt  = new Date().toISOString();
  let totalOrders    = 0;
  let totalRevenue   = 0;

  console.log('\n' + 'Store'.padEnd(28) + 'Orders'.padStart(8) + 'Gross PHP'.padStart(14));
  console.log('-'.repeat(52));

  for (const { email, password, storeName, storeCode, vendorId } of ACCOUNTS) {
    console.log(`\n──── ${storeName} (${vendorId}) ────`);

    if (!email || !password) {
      console.error(`  ⚠ Credentials not configured for ${storeName} — skipping`);
      continue;
    }

    let token, rawOrders, grossSales, ordersCount;

    try {
      console.log('  Authenticating...');
      token = await login(email, password);
      console.log('  ✓ JWT obtained');

      console.log('  Fetching orders...');
      rawOrders = await fetchOrders(vendorId, token);
      console.log(`  ✓ ${rawOrders.length} raw orders fetched`);

      ({ grossSales, ordersCount } = sumOrders(rawOrders));
    } catch (err) {
      console.error(`  ❌ Error: ${err.message}`);
      continue;
    }

    totalOrders  += ordersCount;
    totalRevenue += grossSales;

    console.log(
      '  ' + storeName.padEnd(26) +
      String(ordersCount).padStart(8) +
      grossSales.toFixed(2).padStart(14),
    );

    try {
      await postWebhook({
        vendor_id:        vendorId,
        vendor_name:      storeName,
        store_code:       storeCode,
        period_start:     DATE_FROM,
        period_end:       DATE_TO,
        total_payout_php: grossSales,
        orders_count:     ordersCount,
        raw: {
          data_type:            'gross_sales',
          vendor_id:            vendorId,
          total_orders_fetched: rawOrders.length,
        },
        extracted_at: extractedAt,
      });
      console.log('  ✓ Webhook posted');
    } catch (err) {
      console.error(`  ❌ Webhook error: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log('-'.repeat(52));
  console.log(
    'TOTAL'.padEnd(28) +
    String(totalOrders).padStart(8) +
    totalRevenue.toFixed(2).padStart(14),
  );
  console.log('\nNote: "Gross PHP" = total order value before FoodPanda commission deduction.');
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
