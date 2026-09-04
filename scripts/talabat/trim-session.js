/**
 * Trim Talabat session to fit GitHub's 65,536-byte secret limit.
 * Drops Redux state, navigation cache, and analytics — keeps auth cookies + tokens.
 *
 * Usage:
 *   node scripts/talabat/trim-session.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const IN_JSON       = path.join(__dirname, 'talabat-session.json');
const DISCOVERY_JSON = path.join(__dirname, 'talabat-api-discovery.json');
const OUT_JSON      = path.join(__dirname, 'talabat-session-trimmed.json');
const OUT_B64       = path.join(__dirname, 'talabat-session.b64.txt');  // overwrite in-place

const data = JSON.parse(fs.readFileSync(IN_JSON, 'utf8'));

// ── 1. Keep all cookies (auth cookies are small; drop only Google analytics ones) ─
const cookies = data.cookies.filter(c =>
  !c.domain.includes('.google.com') &&
  !c.domain.includes('doubleclick') &&
  !c.domain.includes('youtube')
);

// ── 2. Strip bulk localStorage — keep only auth / anti-bot entries ────────────────
const KEEP_PREFIXES = [
  'apc_',          // Talabat auth session (apc_session, apc_user_id, apc_local_id)
  'PX24c5Soup',    // PerimeterX anti-bot tokens (needed to avoid 403)
  'oidc.user:',    // OIDC Bearer token if present
  'authSession',   // authSessionFlag
  'lastLogin',     // lastLoginEmail
  'ONE_WEB_WRAPPER_APP',
];
const KEEP_EXACT = new Set(['authSessionFlag', 'lastLoginEmail', 'ONE_WEB_WRAPPER_APP']);

function shouldKeep(name) {
  if (KEEP_EXACT.has(name)) return true;
  return KEEP_PREFIXES.some(p => name.startsWith(p));
}

const origins = (data.origins || []).map(origin => ({
  ...origin,
  localStorage: (origin.localStorage || []).filter(e => shouldKeep(e.name)),
}));

// ── 3. Extract Bearer token from captured API discovery ───────────────────────────
let bearerToken = null;
if (fs.existsSync(DISCOVERY_JSON)) {
  const discovery = JSON.parse(fs.readFileSync(DISCOVERY_JSON, 'utf8'));
  const hit = discovery.find(function(c) { return c.headers && c.headers.authorization; });
  if (hit) bearerToken = hit.headers.authorization.replace('Bearer ', '');
}

const trimmed = { cookies, origins, bearerToken };

// ── 3. Encode and report ──────────────────────────────────────────────────────────
const json = JSON.stringify(trimmed);
const b64  = zlib.gzipSync(Buffer.from(json), { level: 9 }).toString('base64');  // workflow が gunzip する

fs.writeFileSync(OUT_JSON, json);
fs.writeFileSync(OUT_B64, b64);

const kept   = origins.flatMap(o => o.localStorage.map(e => e.name));
const orig_b64_len = fs.statSync(IN_JSON).size * 4 / 3;  // rough estimate

console.log('\n=== Session trim result ===');
console.log(`  Cookies:      ${cookies.length} (dropped ${data.cookies.length - cookies.length} Google cookies)`);
console.log(`  localStorage: ${kept.length} entries kept`);
kept.forEach(k => console.log(`    ✓ ${k}`));
console.log(`  Bearer token: ${bearerToken ? '✅ extracted (' + bearerToken.length + ' chars)' : '❌ NOT FOUND — run setup-session.js first'}`);
if (bearerToken) {
  const parts = bearerToken.split('.');
  try {
    const pl = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (pl.exp) console.log(`  Token expiry: ${new Date(pl.exp * 1000).toISOString()} (${((pl.exp - Date.now()/1000)/3600).toFixed(1)}h left)`);
    else         console.log('  Token expiry: none (no exp claim — long-lived)');
  } catch (_) {}
}
console.log(`\n  Trimmed b64:  ${b64.length} chars`);
console.log(`  GitHub limit: 65,536 chars`);
console.log(b64.length <= 65536 ? '  ✅ Fits!' : `  ❌ Still too large by ${b64.length - 65536} chars`);
console.log(`\n  Saved: ${OUT_B64}`);
console.log('\nNext:');
console.log('  cat scripts/talabat/talabat-session.b64.txt | gh secret set TALABAT_SESSION_STATE\n');
