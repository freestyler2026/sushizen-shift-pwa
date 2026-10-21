/**
 * GrabFood Manila — finance transactions, one per order (VAT plan Phase 0-4).
 *
 * get-payouts.js keeps each store's daily summary. The VAT ledger needs every
 * transaction: who funded the discount, the commission and its VAT, the
 * withholding tax, and the rows that are not orders (Compensation - Orders,
 * Deduction - Eater Compensation, Compensation - Commission (taxable),
 * Withholding Tax Remittance, advertisement). Stored by the backend in
 * grab_finance_txns (app/grab_finance.py).
 *
 *   GET merchant.grab.com/mex/finances/v2/transactions?from=&to=&limit=50&offset=
 *       -> list (id, category, net_total, created_at/updated_at; no breakdown)
 *   GET merchant.grab.com/mex/finances/v2/stores/{store_id}/transactions/{id}
 *       -> the breakdown (memory grab-finance-vat-api)
 *
 * No status filter on the list: canceled rows and adjustments matter too. Rows
 * Grab lists without a transaction id are kept under their order
 * (canceled:/incomplete:<long_order_id>) and have no detail to fetch.
 *
 * Only transactions new to the backend, or whose Grab updated_at moved, get a
 * detail call (POST /api/grab/finance-txns/known). They are fetched and posted
 * in chunks, so a run cut short by its timeout keeps what it finished and the
 * next run carries on (review 2026-10-21).
 *
 * One Grab session sees one store (lessons 86/89): GRAB_STORE_CODE must match the
 * session; every row's store name is checked here and again by the backend.
 *
 * Env:
 *   GRAB_STORE_CODE            PAR | TAFT | CUB
 *   GRAB_SESSION_STATE         base64 session (CI) — or SESSION_PATH (local)
 *   DATE_FROM / DATE_TO        YYYY-MM-DD; default the last 3 days (PHT). The daily
 *                              workflow passes its 30-day window, which also
 *                              catches Grab's late changes
 *   WEBHOOK_URL                backend; unset = read and count only
 *   GRAB_FINANCE_INGEST_TOKEN  required when WEBHOOK_URL is set (lesson 199)
 *
 * Exits non-zero whenever something was read but not stored: dead session, a
 * detail that could not be read, a row the backend refused or found stale, a
 * row with no key, a list that hit the paging cap, or a window that returned
 * nothing at all (lesson 47).
 */

const fs = require('fs');
const zlib = require('zlib');

const MERCHANT_GROUP = 'PHMG20250807052040017951';
const Q = `merchant_group_id=${MERCHANT_GROUP}&currency=PHP`;
const STORE_CODE = (process.env.GRAB_STORE_CODE || '').toUpperCase();
const MARKERS = { PAR: ['paranaque', 'parañaque'], TAFT: ['taft'], CUB: ['quezon', 'cubao'] };
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';
const TOKEN = process.env.GRAB_FINANCE_INGEST_TOKEN || '';
const CHUNK = 100;           // details fetched, then posted, per chunk
const WORKERS = 4;
const PAGE = 50;
const MAX_PAGES_PER_DAY = 100;

function phtDay(offsetDays) {
  return new Date(Date.now() + 8 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);
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
  const ok = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
  if (!ok(from) || !ok(to) || from > to) {
    console.error(`❌ Bad window ${from} → ${to} (YYYY-MM-DD, from ≤ to).`);
    process.exit(1);
  }
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Same rule as app/grab_finance.key_of.
function keyOf(t) {
  const tid = String(t.transaction_id || '').trim();
  if (tid) return tid;
  const oid = String(t.long_order_id || '').trim();
  if (!oid) return null;
  if (String(t.transaction_status || '').trim().toLowerCase() === 'canceled') return `canceled:${oid}`;
  return `incomplete:${oid}`;
}

function makeGet(cookie) {
  const headers = {
    Cookie: cookie, Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    Referer: 'https://merchant.grab.com/', Origin: 'https://merchant.grab.com',
  };
  // `authFatal`: only the list call proves a session dead. A 401/403 on one
  // detail is that row's problem (the manager role is refused some finance
  // endpoints — memory grab-finance-vat-api).
  return async function get(url, { authFatal }) {
    let last = '';
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
        if (r.status === 401 || r.status === 403) {
          const e = new Error(authFatal ? `SESSION_EXPIRED (HTTP ${r.status})` : `HTTP ${r.status}`);
          e.fatal = authFatal; e.noRetry = true; throw e;
        }
        const t = await r.text();
        if (r.status === 200) {
          try { return JSON.parse(t); } catch (_) { last = `not JSON: ${t.slice(0, 80)}`; }
        } else {
          last = `HTTP ${r.status}`;
        }
      } catch (e) {
        if (e.noRetry) throw e;
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
  const window = days(DATE_FROM, DATE_TO);
  console.log(`\nGrab finance transactions — ${STORE_CODE}  ${DATE_FROM} → ${DATE_TO}`);
  const session = loadSession();
  const cookie = (session.cookies || [])
    .filter(c => String(c.domain || '').includes('grab.com'))
    .map(c => `${c.name}=${c.value}`).join('; ');
  const get = makeGet(cookie);
  let problems = 0;

  // 1. List every transaction of every day. Stop on an empty page (not on a
  //    short one — Grab could cap below the limit we ask for).
  const listed = [];
  for (const day of window) {
    let n = 0, pages = 0, total = null;
    const dayKeys = new Set();
    try {
      for (; pages < MAX_PAGES_PER_DAY; pages++) {
        const offset = pages * PAGE;
        const j = await get(`https://merchant.grab.com/mex/finances/v2/transactions?${Q}&from=${day}&to=${day}&limit=${PAGE}&offset=${offset}`,
                            { authFatal: true });
        if (Number.isFinite(j?.data?.total_count) && j.data.total_count > 0) total = j.data.total_count;
        let rows = Array.isArray(j?.data?.results) ? j.data.results : null;
        // Past the last page Grab answers [] or `results: null, total_count: 0`
        // (both seen 2026-10-21). null is the end only when the count agrees;
        // a null with rows still owed is a failed page, not an empty day.
        if (rows === null && j?.data && j.data.results == null
            && (j.data.total_count === 0 || (total !== null && offset >= total))) rows = [];
        if (rows === null) {
          problems++;
          console.error(`  ❌ ${day}: unexpected list response at offset ${offset}: ${JSON.stringify(j).slice(0, 120)}`);
          break;
        }
        listed.push(...rows);
        n += rows.length;
        for (const t of rows) { const k = keyOf(t); if (k) dayKeys.add(k); }
        if (rows.length === 0) break;
      }
    } catch (e) {
      if (e.fatal) throw e;                 // a dead session ends the run
      problems++;                           // one bad day does not stop the others (lesson 17)
      console.error(`  ❌ ${day}: list failed — ${e.message}`);
    }
    if (pages >= MAX_PAGES_PER_DAY) {
      problems++;
      console.error(`  ❌ ${day}: stopped at ${MAX_PAGES_PER_DAY} pages — the day may be cut short`);
    }
    // Distinct keys, not raw rows: offset paging over a list that re-sorts can
    // return one row twice and skip another, which a raw count would not see.
    const distinctN = dayKeys.size + listed.slice(listed.length - n).filter(t => !keyOf(t)).length;
    if (total !== null && distinctN !== total) {
      problems++;
      console.error(`  ❌ ${day}: read ${distinctN} distinct of the ${total} Grab says it has (${n} rows)`);
    }
    console.log(`  ${day}: ${n} transaction(s)`);
  }

  const unkeyed = listed.filter(t => !keyOf(t));
  if (unkeyed.length) {
    problems += unkeyed.length;
    console.error(`  ❌ ${unkeyed.length} row(s) with no transaction id and no order id — not stored:`);
    for (const t of unkeyed.slice(0, 5)) console.error(`    ${JSON.stringify(t).slice(0, 300)}`);
  }
  const byKey = new Map(listed.filter(keyOf).map(t => [keyOf(t), t]));
  const all = [...byKey.values()];
  if (all.length === 0) {
    console.error(`❌ Nothing listed for ${DATE_FROM} → ${DATE_TO}. A store's sales window is never empty.`);
    process.exit(1);
  }

  // 2. Every row must be this store's (one session = one store).
  const isOurs = t => MARKERS[STORE_CODE].some(m => String(t.store_name || '').toLowerCase().includes(m));
  const wrong = all.filter(t => !isOurs(t));
  if (wrong.length && wrong.length === all.length) {
    // Every row is another branch's: the session is the wrong store (lesson 86).
    console.error(`❌ This session sees ${[...new Set(wrong.map(t => t.store_name))].join(', ')}, not ${STORE_CODE}.`);
    console.error('   Refusing to run — it would file one branch\'s money under another.');
    process.exit(1);
  }
  if (wrong.length) {
    // A few odd names (an account-level adjustment, say) must not stop the
    // store for a month: they are left out and named, the rest goes in.
    problems += wrong.length;
    console.error(`  ❌ ${wrong.length} row(s) not named ${STORE_CODE} left out: `
      + wrong.slice(0, 5).map(t => `${keyOf(t)} (${t.store_name || 'no name'})`).join(', '));
    for (const t of wrong) byKey.delete(keyOf(t));
    all.length = 0; all.push(...byKey.values());
  }
  const cats = {};
  for (const t of all) {
    const k = [t.transaction_category, t.transaction_sub_category].filter(Boolean).join(' / ') || '(none)';
    cats[k] = (cats[k] || 0) + 1;
  }
  console.log(`  ${all.length} distinct:`, cats);

  if (!WEBHOOK_URL) {
    console.log('  (WEBHOOK_URL not set — listed only, nothing fetched or stored)');
    process.exitCode = problems ? 1 : 0;
    return;
  }

  // 3. Which ones are new or changed. "Unchanged" needs a stored version that
  //    equals the listed one — two blanks are not a match (lesson 156).
  // The first call is also this store's heartbeat (VAT plan 0-6).
  const known = {};
  for (let i = 0; i < all.length; i += 2000) {
    const j = await post('/api/grab/finance-txns/known', { store_code: STORE_CODE, ids: all.slice(i, i + 2000).map(keyOf) });
    Object.assign(known, j.known || {});
  }
  // Both sides are local wall-clock times; compare them as instants, not text
  // (the backend's isoformat and Grab's string differ in "Z" and fractions).
  const ms = s => { const v = Date.parse(`${String(s || '').trim().replace(/Z$/, '')}Z`); return Number.isNaN(v) ? null : v; };
  // Unchanged = same updated_at AND same status. Grab may settle a
  // transaction without moving updated_at (unmeasured), so status counts too.
  const todo = all.filter(t => {
    const k = known[keyOf(t)];
    const stored = ms(k?.updated_at);
    const listedAt = ms(t.updated_at);
    return !(stored !== null && listedAt !== null && stored === listedAt
             && String(k?.status || '') === String(t.transaction_status || ''));
  });
  console.log(`  ${todo.length} new or changed, ${all.length - todo.length} unchanged since last run`);

  // 4. Fetch detail and post, a chunk at a time.
  const tot = { inserted: 0, updated: 0, unchanged: 0, stale: 0, undated: 0, without_detail: 0, id_less: 0, refused: [] };
  let detailFailed = 0;
  for (let c = 0; c < todo.length; c += CHUNK) {
    const chunk = todo.slice(c, c + CHUNK);
    const details = new Map();
    let cursor = 0;
    async function worker() {
      while (cursor < chunk.length) {
        const t = chunk[cursor++];
        const key = keyOf(t);
        if (key !== String(t.transaction_id || '').trim()) continue;   // id-less: nothing to fetch
        try {
          const j = await get(`https://merchant.grab.com/mex/finances/v2/stores/${t.store_id}/transactions/${key}?${Q}`,
                              { authFatal: false });
          // Only a detail about this transaction counts; {} or an error object
          // would otherwise be stored as complete and never fetched again.
          if (j?.data && String(j.data.transaction_id || '').trim() === key) details.set(key, j.data);
          else throw new Error(`detail is not about ${key}: ${JSON.stringify(j).slice(0, 100)}`);
        } catch (e) {
          if (e.fatal) throw e;
          detailFailed++;
          console.error(`  ⚠ detail ${t.short_order_number || key}: ${e.message}`);
        }
        await sleep(150);
      }
    }
    await Promise.all(Array.from({ length: WORKERS }, worker));
    const j = await post('/api/grab/finance-txns', {
      store_code: STORE_CODE,
      rows: chunk.map(t => ({ listed: t, detail: details.get(keyOf(t)) || null })),
    });
    for (const k of ['inserted', 'updated', 'unchanged', 'stale', 'undated', 'without_detail', 'id_less']) tot[k] += j[k] || 0;
    const outcomes = (j.inserted || 0) + (j.updated || 0) + (j.unchanged || 0) + (j.stale || 0)
      + (j.undated || 0) + (j.refused || []).length;
    if (outcomes !== chunk.length) {
      problems++;
      console.error(`  ❌ sent ${chunk.length}, the backend accounted for ${outcomes}`);
    }
    tot.refused.push(...(j.refused || []));
  }

  console.log(`✓ stored: ${tot.inserted} new, ${tot.updated} updated, ${tot.unchanged} unchanged, `
    + `${tot.stale} stale, ${tot.undated} undated, ${tot.id_less} without an id (canceled/incomplete), `
    + `${tot.without_detail} without detail, ${tot.refused.length} refused`);
  for (const r of tot.refused.slice(0, 10)) console.error(`  ❌ refused ${r.transaction_id}: ${r.problem}`);
  if (tot.undated) console.log(`  ⚠ ${tot.undated} row(s) Grab lists without any updated_at — stored, but changes to them cannot be tracked`);
  if (tot.stale) console.error(`  ❌ ${tot.stale} row(s) not applied: either the stored version is newer, or this one `
    + 'came without its detail (see the ⚠ detail lines above) and would have replaced one that has it');
  if (problems || detailFailed || tot.refused.length || tot.without_detail || tot.stale) process.exitCode = 1;
}

main().catch(err => { console.error(`❌ ${err.message}`); process.exit(1); });
