/**
 * GrabFood Manila — Insights → Operations: peak hours and store offline hours
 * (direct HTTP with the store's saved session; never a browser — hydra-shield
 * logs a headless browser out and the session dies).
 *
 * Replaces the two CSVs staff downloaded from the portal and dropped in Drive,
 * "Peak hour data" and "Store Offline Hours" (owner, 2026-10-28). The backend
 * writes the same tables under the same names, so every page reads them as
 * before. Checked on Taft: peak hours 10/1-10/20, 258 of 258 hour cells equal
 * to the CSV; offline 7/1-10/27, 20 of 20 offline days, minutes and rate.
 *
 * The request is the one the Insights page sends:
 *   POST https://merchant.grab.com/troy/insights/v1/list
 *     { storeGrabIDs:[gpid], storeZeusIDs:[gfid], businessLines:["GF"],
 *       startDate, endDate (UTC midnight of each local date), queryNames:[...] }
 *   operation-peak-hour-list           → local_date, local_hour, total_transaction
 *   operation-store-offline-hours-metric → offline_hours_date, _in_minutes, _rate
 * with the portal's own headers (x-mts-ssid, x-mex-resource, X-CSRF-Token).
 * Without them it answers 403; with the store missing, 400; with paging
 * fields in the body, 500. The store's ids come from user-profile/v1/store-list.
 *
 * Usage:
 *   GRAB_SESSION_STATE=<b64> WEBHOOK_URL=... MGMT_CRON_SECRET=... \
 *   node scripts/grab/get-insights.js taft [DATE_FROM] [DATE_TO]
 * Default range: the last 7 days up to yesterday (Manila).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const STORES = {
  taft:      { code: 'TAFT', name: 'Taft', match: /taft/i },
  qc:        { code: 'CUB',  name: 'Cubao / Quezon City', match: /quezon|cubao/i },
  paranaque: { code: 'PAR',  name: 'Paranaque', match: /para[nñ]aque/i },
};
const which = (process.argv[2] || '').toLowerCase();
if (!STORES[which]) {
  console.error('Usage: node scripts/grab/get-insights.js taft|qc|paranaque [from] [to]');
  process.exit(1);
}
const manilaDay = (offsetDays) => new Date(Date.now() + 8 * 3600e3 - offsetDays * 86400e3).toISOString().slice(0, 10);
const DATE_FROM = process.argv[3] || manilaDay(7);
const DATE_TO = process.argv[4] || manilaDay(1);
const WEBHOOK_URL = process.env.WEBHOOK_URL;

function loadSession() {
  const b64 = process.env.GRAB_SESSION_STATE;
  if (b64) {
    const buf = Buffer.from(b64.trim(), 'base64');
    return JSON.parse((buf[0] === 0x1f && buf[1] === 0x8b) ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8'));
  }
  const p = process.env.SESSION_PATH || path.join(__dirname, `${which}-session.json`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function headersFor(session) {
  const ls = Object.fromEntries((session.origins || [])
    .filter((o) => o.origin === 'https://merchant.grab.com')
    .flatMap((o) => (o.localStorage || []).map((x) => [x.name, x.value])));
  const ck = Object.fromEntries((session.cookies || []).map((c) => [c.name, c.value]));
  let resource = '';
  try { resource = JSON.parse(ls.selectedResource || '""'); } catch { /* none */ }
  return {
    Cookie: (session.cookies || []).filter((c) => c.domain === '.grab.com' || c.domain === 'merchant.grab.com')
      .map((c) => `${c.name}=${c.value}`).join('; '),
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    Referer: 'https://merchant.grab.com/insights/operations',
    Origin: 'https://merchant.grab.com',
    'x-mts-ssid': ls.JWT || '',
    'x-mex-resource': resource,
    'x-mex-version': 'v2',
    'x-agent': 'mexapp',
    'x-app-platform': 'web',
    'X-User-Type': 'user-profile',
    'X-Client-ID': 'GrabMerchant-Portal',
    'x-grabkit-clientid': 'GrabMerchant-Portal',
    requestSource: 'troyPortal',
    'X-CSRF-Token': ck.mexusers_authn_token_jti || '',
    'X-Currency': 'PHP',
  };
}

async function call(H, url, body) {
  const resp = await fetch(url, { method: body ? 'POST' : 'GET', headers: H, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000) });
  const text = await resp.text();
  if (resp.status !== 200) throw new Error(`${url.split('?')[0]} HTTP ${resp.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

(async () => {
  const H = headersFor(loadSession());
  const list = await call(H, 'https://merchant.grab.com/user-profile/v1/store-list?pageSize=100&page=1');
  const stores = (list.data && list.data.stores) || [];
  // One session sees one store; make sure it is the one this run is for.
  const store = stores.find((s) => STORES[which].match.test(s.name));
  if (!store || stores.length !== 1) {
    throw new Error(`session holds ${stores.map((s) => s.name).join(', ') || 'no store'}, expected ${STORES[which].name}`);
  }
  const q = (queryNames) => call(H, 'https://merchant.grab.com/troy/insights/v1/list', {
    parentEntityIds: [], storeGrabIDs: [store.gpid], storeZeusIDs: [store.gfid], businessLines: ['GF'],
    startDate: `${DATE_FROM}T00:00:00.000Z`, endDate: `${DATE_TO}T00:00:00.000Z`, queryNames,
  });
  const peak = ((await q(['operation-peak-hour-list'])).data || []).map((r) => ({
    date: r.columns.local_date, hour: Number(r.columns.local_hour), orders: Number(r.columns.total_transaction) }));
  const offline = ((await q(['operation-store-offline-hours-metric'])).data || []).map((r) => ({
    date: r.columns.offline_hours_date, minutes: Number(r.columns.offline_hours_in_minutes), rate_pct: Number(r.columns.offline_hours_rate) }));
  const days = new Set(peak.map((p) => p.date));
  console.log(`✓ ${store.name} ${DATE_FROM}..${DATE_TO}: peak hours for ${days.size} day(s), `
            + `${peak.reduce((t, p) => t + p.orders, 0)} orders; offline on ${offline.filter((o) => o.minutes > 0).length} day(s)`);
  if (!WEBHOOK_URL) {
    const perDay = {};
    for (const p of peak) perDay[p.date] = (perDay[p.date] || 0) + p.orders;
    console.log(JSON.stringify(perDay));
    console.log('(no WEBHOOK_URL — nothing posted)');
    return;
  }
  const resp = await fetch(`${WEBHOOK_URL}/api/aggregator/grab/insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Cron-Secret': process.env.MGMT_CRON_SECRET || '' },
    body: JSON.stringify({ store_code: STORES[which].code, peak_hours: peak, offline }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`backend HTTP ${resp.status}: ${text.slice(0, 300)}`);
  console.log(`✓ posted: ${text.slice(0, 200)}`);
})().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
