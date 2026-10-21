/**
 * GrabFood Manila — finance transactions, one per order (VAT plan Phase 0-4).
 *
 * get-payouts.js keeps each store's daily summary. The VAT ledger needs every
 * transaction: who funded the discount, the commission and its VAT, the
 * withholding tax, and the rows that are not orders (Compensation - Orders,
 * Deduction - Eater Compensation, Compensation - Commission (taxable),
 * advertisement). Stored by the backend in grab_finance_txns.
 *
 *   GET merchant.grab.com/mex/finances/v2/transactions?from=&to=&limit=50&offset=
 *       -> list (id, category, net_total, created_at/updated_at; no breakdown)
 *   GET merchant.grab.com/mex/finances/v2/stores/{store_id}/transactions/{id}
 *       -> the breakdown (memory grab-finance-vat-api)
 *
 * No status filter on the list: canceled rows and adjustments matter too.
 * Detail is fetched only for transactions new to the backend or whose Grab
 * updated_at moved (POST /api/grab/finance-txns/known).
 *
 * One Grab session sees one store (lesson 86/89): GRAB_STORE_CODE must match the
 * session, every row's store name is checked here and again by the backend.
 *
 * Env:
 *   GRAB_STORE_CODE            PAR | TAFT | CUB
 *   GRAB_SESSION_STATE         base64 session (CI) — or SESSION_PATH (local)
 *   DATE_FROM / DATE_TO        default: the last 3 days (PHT). The daily workflow passes its
 *                              30-day window, which also catches Grab's late changes
 *   WEBHOOK_URL                backend; unset = print counts only
 *   GRAB_FINANCE_INGEST_TOKEN  required when WEBHOOK_URL is set (lesson 199)
 *
 * Exits non-zero when the session is dead, a detail could not be read, or the
 * backend refused a row — a run that stored less than it read is not a success
 * (lesson 47).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const MERCHANT_GROUP = 'PHMG20250807052040017951';
const Q = `merchant_group_id=${MERCHANT_GROUP}&currency=PHP`;
const STORE_CODE = (process.env.GRAB_STORE_CODE || '').toUpperCase();
const MARKERS = { PAR: ['paranaque', 'parañaque'], TAFT: ['taft'], CUB: ['quezon', 'cubao'] };
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';
const TOKEN = process.env.GRAB_FINANCE_INGEST_TOKEN || '';
const BATCH = 200;

function phtDay(offsetDays) {
  const d = new Date(Date.now() + 8 * 3600_000 + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);   // shifted to PHT first, so this is the PHT date
}
const DATE_FROM = process.env.DATE_FROM || phtDay(-3);
const DATE_TO = process.env.DATE_TO || phtDay(0);

function loadSession() {
  const b64 = process.env.GRAB_SESSION_STATE;
  if (b64) {
    const buf = Buffer.from(b64.trim(), 'base64');
    const raw = (buf[0] === 0x1f && buf[1] === 0x8b) ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
    return JSON.parse(raw);
  }
  const p = process.env.SESSION_PATH;
  if (p && fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  console.error('❌ No session. Set GRAB_SESSION_STATE or SESSION_PATH.');
  process.exit(1);
}

function days(from, to) {
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Canceled orders are listed with an empty transaction_id (net 0, no detail
// endpoint). Keyed by their order so they are kept, same rule as the backend's
// grab_finance.key_of.
function keyOf(t) {
  if (t.transaction_id) return String(t.transaction_id);
  if (t.long_order_id && String(t.transaction_status || '').toLowerCase() === 'canceled') return `canceled:${t.long_order_id}`;
  return null;
}

function makeGet(cookie) {
  const headers = {
    Cookie: cookie, Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    Referer: 'https://merchant.grab.com/', Origin: 'https://merchant.grab.com',
  };
  // Grab occasionally answers with a page instead of JSON; try three times.
  return async function get(url) {
    let last = '';
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
        if (r.status === 401 || r.status === 403) {
          const e = new Error(`SESSION_EXPIRED (HTTP ${r.status})`); e.fatal = true; throw e;
        }
        const t = await r.text();
        if (r.status === 200) {
          try { return JSON.parse(t); } catch (_) { last = `not JSON: ${t.slice(0, 80)}`; }
        } else {
          last = `HTTP ${r.status}`;
        }
      } catch (e) {
        if (e.fatal) throw e;
        last = e.message;
      }
      await sleep(1500 * (i + 1));
    }
    throw new Error(last || 'no response');
  };
}

async function post(pathname, body) {
  const r = await fetch(`${WEBHOOK_URL}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Ingest-Token': TOKEN },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${pathname} HTTP ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}

async function main() {
  if (!MARKERS[STORE_CODE]) {
    console.error(`GRAB_STORE_CODE must be one of ${Object.keys(MARKERS).join(', ')}`);
    process.exit(1);
  }
  if (WEBHOOK_URL && !TOKEN) {
    console.error('❌ GRAB_FINANCE_INGEST_TOKEN is not set — nothing would be accepted.');
    process.exit(1);
  }
  console.log(`\nGrab finance transactions — ${STORE_CODE}  ${DATE_FROM} → ${DATE_TO}`);
  const session = loadSession();
  const cookie = (session.cookies || [])
    .filter(c => String(c.domain || '').includes('grab.com'))
    .map(c => `${c.name}=${c.value}`).join('; ');
  const get = makeGet(cookie);

  // 1. List every transaction of every day.
  const listed = [];
  for (const day of days(DATE_FROM, DATE_TO)) {
    let n = 0;
    for (let offset = 0; offset < 5000; offset += 50) {
      const j = await get(`https://merchant.grab.com/mex/finances/v2/transactions?${Q}&from=${day}&to=${day}&limit=50&offset=${offset}`);
      const rows = j?.data?.results || [];
      listed.push(...rows);
      n += rows.length;
      if (rows.length < 50) break;
    }
    console.log(`  ${day}: ${n} transaction(s)`);
  }
  const unkeyed = listed.filter(t => !keyOf(t));
  if (unkeyed.length) {
    console.error(`  ⚠ ${unkeyed.length} row(s) with no transaction id and not a canceled order — not stored:`);
    for (const t of unkeyed.slice(0, 5)) console.error(`    ${JSON.stringify(t).slice(0, 200)}`);
  }
  const byId = new Map(listed.filter(keyOf).map(t => [keyOf(t), t]));
  const all = [...byId.values()];

  // 2. Every row must be this store's (one session = one store).
  const wrong = all.filter(t => !MARKERS[STORE_CODE].some(m => String(t.store_name || '').toLowerCase().includes(m)));
  if (wrong.length) {
    console.error(`❌ ${wrong.length} transaction(s) belong to ${[...new Set(wrong.map(t => t.store_name))].join(', ')}, not ${STORE_CODE}.`);
    console.error('   Refusing to run — it would file one branch\'s money under another (lesson 86).');
    process.exit(1);
  }
  const cats = {};
  for (const t of all) {
    const k = [t.transaction_category, t.transaction_sub_category].filter(Boolean).join(' / ') || '(none)';
    cats[k] = (cats[k] || 0) + 1;
  }
  console.log(`  ${all.length} distinct:`, cats);

  // 3. Fetch detail only where it is new or changed.
  let known = {};
  if (WEBHOOK_URL && all.length) {
    for (let i = 0; i < all.length; i += 2000) {
      const j = await post('/api/grab/finance-txns/known', { ids: all.slice(i, i + 2000).map(keyOf) });
      Object.assign(known, j.known || {});
    }
  }
  const strip = s => String(s || '').replace(/Z$/, '').replace(/\.\d+$/, '');
  const todo = all.filter(t => strip(known[keyOf(t)]) !== strip(t.updated_at));
  console.log(`  detail: ${todo.length} to fetch, ${all.length - todo.length} unchanged since last run`);

  const details = new Map();
  let failed = 0, cursor = 0;
  async function worker() {
    while (cursor < todo.length) {
      const t = todo[cursor++];
      if (!t.transaction_id) continue;        // canceled order: nothing to fetch
      try {
        const j = await get(`https://merchant.grab.com/mex/finances/v2/stores/${t.store_id}/transactions/${t.transaction_id}?${Q}`);
        if (j?.data) details.set(t.transaction_id, j.data); else throw new Error('no data');
      } catch (e) {
        if (e.fatal) throw e;
        failed++;
        console.error(`  ⚠ detail ${t.short_order_number || t.transaction_id}: ${e.message}`);
      }
      await sleep(150);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));

  // 4. Store. Rows whose detail failed are still sent (list values only) and
  //    are fetched again next run, because the backend keeps has_detail=false.
  if (!WEBHOOK_URL) {
    console.log(`  (WEBHOOK_URL not set — ${details.size} detail(s) read, nothing stored)`);
    process.exitCode = failed ? 1 : 0;
    return;
  }
  const send = todo.map(t => ({ listed: t, detail: details.get(t.transaction_id) || null }));
  const tot = { inserted: 0, updated: 0, unchanged: 0, without_detail: 0, canceled: 0, refused: [] };
  for (let i = 0; i < send.length; i += BATCH) {
    const j = await post('/api/grab/finance-txns', { store_code: STORE_CODE, rows: send.slice(i, i + BATCH) });
    for (const k of ['inserted', 'updated', 'unchanged', 'without_detail', 'canceled']) tot[k] += j[k] || 0;
    tot.refused.push(...(j.refused || []));
  }
  console.log(`✓ stored: ${tot.inserted} new, ${tot.updated} updated, ${tot.unchanged} unchanged, `
    + `${tot.canceled} canceled order(s), ${tot.without_detail} without detail, ${tot.refused.length} refused`);
  for (const r of tot.refused.slice(0, 10)) console.error(`  ❌ refused ${r.transaction_id}: ${r.problem}`);
  if (failed || tot.refused.length || tot.without_detail || unkeyed.length) process.exitCode = 1;
}

main().catch(err => { console.error(`❌ ${err.message}`); process.exit(1); });
