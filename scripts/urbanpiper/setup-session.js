#!/usr/bin/env node
/**
 * UrbanPiper Atlas — session refresh (once a week; the token lives 7 days)
 *
 * Opens a browser on atlas.urbanpiper.com. Sign in yourself; when Atlas has
 * stored its token this reads it, checks which business it belongs to, and sets
 * it on Heroku, where the daily Dubai sync reads it. Nothing holds a password.
 *
 * Two logins, one per business. Whichever you sign in with is recognised from
 * the token and set on its own variable:
 *   Sushi ZEN          → URBANPIPER_TOKEN
 *   Ramen ZEN & AVS    → URBANPIPER_RAMEN_TOKEN
 *   node scripts/urbanpiper/setup-session.js            # either account
 *   node scripts/urbanpiper/setup-session.js sushi      # insist on Sushi ZEN
 *
 * The same tokens drive the price monitor (app/services/aggregator_price_monitor.py),
 * which has been down since its token expired on 2026-08-24.
 *
 * Add --dry-run to check the login without changing Heroku.
 *
 * --auto (for the morning session check): no window. The login is kept in a
 * browser profile per account (~/.sushizen/urbanpiper-<account>), so while the
 * UrbanPiper sign-in itself is still valid, Atlas hands out a fresh token with
 * nobody at the keyboard. If it asks for a login, this exits 2 and changes
 * nothing; run it once without --auto and sign in.
 *   node scripts/urbanpiper/setup-session.js sushi --auto
 */
'use strict';
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const os = require('os');
const path = require('path');

const ACCOUNTS = {
  sushi: { env: 'URBANPIPER_TOKEN', biz: '55892580', label: 'Sushi ZEN' },
  ramen: { env: 'URBANPIPER_RAMEN_TOKEN', biz: '98750751', label: 'Ramen ZEN & All Veggie Sushi' },
};
const which = process.argv.slice(2).find((a) => !a.startsWith('--'));
const DRY = process.argv.includes('--dry-run');
const AUTO = process.argv.includes('--auto');
if (AUTO && !which) {
  console.error('--auto needs the account: sushi or ramen');
  process.exit(1);
}
if (which && !ACCOUNTS[which]) {
  console.error('Usage: node scripts/urbanpiper/setup-session.js [sushi|ramen] [--dry-run]');
  process.exit(1);
}

function payload(token) {
  try {
    const p = token.split('.')[1];
    return JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch { return {}; }
}

(async () => {
  console.log(`\nSign in to UrbanPiper${which ? ` as ${ACCOUNTS[which].label}` : ''}. This waits up to 5 minutes.\n`);
  // One profile per account, so the next run (and --auto) can reuse the sign-in.
  const profile = path.join(os.homedir(), '.sushizen', `urbanpiper-${which || 'any'}`);
  const ctx = await chromium.launchPersistentContext(profile, { headless: AUTO });
  const browser = { isConnected: () => !closed, close: () => ctx.close() };
  let closed = false;
  ctx.on('close', () => { closed = true; });
  const first = ctx.pages()[0] || await ctx.newPage();
  await first.goto('https://atlas.urbanpiper.com', { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
  if (AUTO) {
    // A token Atlas still holds may be days old. Drop it so Atlas fetches a
    // new one from the UrbanPiper sign-in, if that is still valid.
    await first.evaluate(() => { try { localStorage.removeItem('AT'); } catch {} }).catch(() => {});
    await first.goto('https://atlas.urbanpiper.com', { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
  }

  // The sign-in can finish in another tab, and a tab can close on the way
  // (the login page hands over to Atlas). Look at every open Atlas tab each
  // second instead of holding on to the first one.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let token = null;
  const limit = AUTO ? 60 : 300;
  for (let i = 0; i < limit && !token && browser.isConnected(); i++) {
    await sleep(1000);
    for (const page of ctx.pages()) {
      if (!/atlas\.urbanpiper\.com/.test(page.url())) continue;
      token = await page.evaluate(() => {
        const v = (() => { try { return localStorage.getItem('AT') || ''; } catch { return ''; } })();
        const m = v.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
        return m ? m[0] : null;
      }).catch(() => null);
      if (token) break;
    }
    if (AUTO && ctx.pages().some((pg) => /login\.urbanpiper\.com/.test(pg.url())) && i > 15) {
      console.error('UrbanPiper asks for a login — run without --auto and sign in. Nothing changed.');
      await browser.close().catch(() => {});
      process.exit(2);
    }
    if (!ctx.pages().length && !token) {
      // Every tab closed before Atlas stored a token: open it again.
      await ctx.newPage().then((p) => p.goto('https://atlas.urbanpiper.com').catch(() => {})).catch(() => {});
    }
  }
  await browser.close().catch(() => {});
  if (!token) {
    console.error(AUTO ? 'No token within a minute — run without --auto and sign in. Nothing changed.'
                       : 'No token after 5 minutes — sign-in not finished.');
    process.exit(AUTO ? 2 : 1);
  }

  const p = payload(token);
  const acct = Object.values(ACCOUNTS).find((a) => a.biz === String(p.biz_id));
  if (!acct || (which && acct !== ACCOUNTS[which])) {
    const want = which ? ACCOUNTS[which].label : 'Sushi ZEN or Ramen ZEN & AVS';
    console.error(`This login is business ${p.biz_id}, not ${want}. Nothing changed.`);
    process.exit(1);
  }
  console.log(`✓ ${acct.label}: token valid until ${p.expires_on}`);
  if (DRY) { console.log('(dry run — Heroku not changed)'); return; }
  // execFile, not a shell string: the token never passes through a shell.
  execFileSync('heroku', ['config:set', `${acct.env}=${token}`, '-a', 'sushizen-shift-app'], { stdio: ['ignore', 'ignore', 'inherit'] });
  console.log(`✓ ${acct.env} set on Heroku`);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
