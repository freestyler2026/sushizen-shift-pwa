/**
 * FoodPanda session refresher
 *
 * Reads the saved session (b64), extracts the refreshToken cookie,
 * calls the FoodPanda auth refresh endpoint to get a new accessToken,
 * and writes the updated session back to the b64 file.
 *
 * Usage (local):
 *   node scripts/foodpanda/refresh-session.js paranaque
 *
 * Usage (GitHub Actions):
 *   FP_SESSION_PARANAQUE=<base64> node scripts/foodpanda/refresh-session.js paranaque
 *   (updated b64 is written to stdout as FP_SESSION_PARANAQUE=<new_base64>)
 */

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

function decodeSession(b64) {
  const buf = Buffer.from(b64.trim(), 'base64');
  const raw = (buf[0] === 0x1f && buf[1] === 0x8b)
    ? zlib.gunzipSync(buf).toString('utf8')
    : buf.toString('utf8');
  return JSON.parse(raw);
}

function encodeSession(data) {
  return zlib.gzipSync(Buffer.from(JSON.stringify(data)), { level: 9 }).toString('base64');
}

const LOCATION = process.argv[2] || 'paranaque';

const ACCOUNTS = {
  paranaque: {
    sessionEnvVar: 'FP_SESSION_PARANAQUE',
    sessionFile:   path.join(__dirname, 'paranaque-session.b64.txt'),
  },
  taft: {
    sessionEnvVar: 'FP_SESSION_TAFT',
    sessionFile:   path.join(__dirname, 'taft-session.b64.txt'),
  },
  qc: {
    sessionEnvVar: 'FP_SESSION_QC',
    sessionFile:   path.join(__dirname, 'qc-session.b64.txt'),
  },
};

const acct = ACCOUNTS[LOCATION];
if (!acct) { console.error('Use: paranaque | taft | qc'); process.exit(1); }

const PORTAL     = 'https://partner.foodpanda.com';
const AUTH_BASE  = 'https://partner-auth.ap.prd.portal.restaurant';

// FoodPanda uses Delivery Hero shared auth infra.
// `/auth/v5/refresh` returns HTTP 500 "invalid request" → endpoint exists, wrong body format.
// `/auth/v5/login-two-step` with type:"refresh_token" is the DH standard for token refresh.

function readSession() {
  const b64Env = process.env[acct.sessionEnvVar];
  if (b64Env) return decodeSession(b64Env);
  if (fs.existsSync(acct.sessionFile)) {
    return decodeSession(fs.readFileSync(acct.sessionFile, 'utf8'));
  }
  console.error(`No session found. Run setup-session.js ${LOCATION} first.`);
  process.exit(1);
}

function writeSession(data) {
  const b64 = encodeSession(data);
  if (process.env[acct.sessionEnvVar]) {
    process.stdout.write(`NEW_SESSION_B64=${b64}\n`);
  }
  if (fs.existsSync(acct.sessionFile)) {
    fs.writeFileSync(acct.sessionFile, b64);
    console.log(`✓ Session written back to ${acct.sessionFile}`);
  }
}

function getCookie(session, name) {
  return session.cookies?.find(c => c.name === name);
}

function setCookie(session, name, value) {
  const idx = session.cookies?.findIndex(c => c.name === name);
  if (idx >= 0) {
    session.cookies[idx] = { ...session.cookies[idx], value };
  } else {
    (session.cookies = session.cookies || []).push({
      name, value,
      domain: 'partner.foodpanda.com',
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'Lax',
    });
  }
}

async function tryRefresh(label, url, body, extraHeaders = {}) {
  const baseHeaders = {
    'Content-Type': 'application/json',
    'Accept':       'application/json',
    'Origin':       PORTAL,
    'Referer':      `${PORTAL}/`,
    'User-Agent':   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    ...extraHeaders,
  };
  try {
    const resp = await fetch(url, {
      method:  'POST',
      headers: baseHeaders,
      body:    typeof body === 'string' ? body : JSON.stringify(body),
      signal:  AbortSignal.timeout(12_000),
    });
    const text = await resp.text();
    if (resp.ok) {
      try {
        const json = JSON.parse(text);
        const newAccessToken = json.access_token || json.accessToken || json.token;
        if (newAccessToken) {
          return { newAccessToken, newRefreshToken: json.refresh_token || json.refreshToken || null };
        }
      } catch (_) {}
    }
    process.stdout.write(`  [${resp.status}] ${label}: ${text.slice(0, 150)}\n`);
  } catch (err) {
    process.stdout.write(`  [ERR] ${label}: ${err.message.slice(0, 80)}\n`);
  }
  return null;
}

async function main() {
  console.log(`\nFoodPanda session refresh — ${LOCATION.toUpperCase()}`);
  const session = readSession();

  const refreshCookie = getCookie(session, 'refreshToken');
  const deviceCookie  = getCookie(session, 'deviceToken');

  if (!refreshCookie?.value) {
    console.error('❌ No refreshToken found in session. Re-run setup-session.js.');
    process.exit(1);
  }

  // Build cookie header
  const cookieHeader = [
    `refreshToken=${refreshCookie.value}`,
    deviceCookie ? `deviceToken=${deviceCookie.value}` : '',
  ].filter(Boolean).join('; ');

  const rt = refreshCookie.value;   // refreshToken value (not logged)
  const dt = deviceCookie?.value;    // deviceToken value (not logged)

  console.log('\nTrying DH auth refresh patterns...');

  const REFRESH = `${AUTH_BASE}/auth/v5/refresh`;
  const LOGIN   = `${AUTH_BASE}/auth/v5/login-two-step`;

  const attempts = [
    // DH standard: refresh_token in body (snake_case)
    [ 'refresh (snake)',   REFRESH, { refresh_token: rt } ],
    // DH standard: refreshToken in body (camelCase)
    [ 'refresh (camel)',   REFRESH, { refreshToken: rt } ],
    // DH standard: type + token in body
    [ 'refresh (type+tok)',REFRESH, { type: 'refresh_token', token: rt } ],
    // DH login-two-step with refresh_token type (common DH pattern)
    [ 'login-two-step (snake)', LOGIN, { type: 'refresh_token', refresh_token: rt } ],
    [ 'login-two-step (camel)', LOGIN, { type: 'refresh_token', refreshToken: rt } ],
    // With device token included
    ...(dt ? [
      [ 'refresh (rt+dt)', REFRESH, { refresh_token: rt, device_token: dt } ],
      [ 'login-two-step (rt+dt)', LOGIN, { type: 'refresh_token', refresh_token: rt, device_token: dt } ],
    ] : []),
    // With cookie header
    [ 'refresh (cookie)', REFRESH,
      { type: 'refresh_token' },
      { Cookie: cookieHeader } ],
    [ 'login-two-step (cookie)', LOGIN,
      { type: 'refresh_token' },
      { Cookie: cookieHeader } ],
  ];

  for (const [label, url, body, extra = {}] of attempts) {
    process.stdout.write(`  → ${label}... `);
    const result = await tryRefresh(label, url, body, extra);
    if (result) {
      console.log(`\n✓ Refresh succeeded via: ${label}`);
      setCookie(session, 'accessToken', result.newAccessToken);
      if (result.newRefreshToken) {
        setCookie(session, 'refreshToken', result.newRefreshToken);
        console.log('  (refreshToken also updated)');
      }
      writeSession(session);
      console.log('Done.');
      return;
    }
  }

  console.error('\n❌ All refresh patterns failed.');
  console.error('   The refreshToken may have expired (FoodPanda requires periodic 2FA re-auth).');
  console.error(`   Re-run: node scripts/foodpanda/setup-session.js ${LOCATION}`);
  process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
