#!/usr/bin/env node
/**
 * UrbanPiper Atlas — session refresh (once a week; the token lives 7 days)
 *
 * Opens a browser on atlas.urbanpiper.com. Sign in yourself; when Atlas has
 * stored its token this reads it, checks which business it belongs to, and sets
 * it on Heroku, where the daily Dubai sync reads it. Nothing holds a password.
 *
 * Two logins, one per business:
 *   node scripts/urbanpiper/setup-session.js sushi    # Sushi ZEN          → URBANPIPER_TOKEN
 *   node scripts/urbanpiper/setup-session.js ramen    # Ramen ZEN & AVS    → URBANPIPER_RAMEN_TOKEN
 *
 * The same tokens drive the price monitor (app/services/aggregator_price_monitor.py),
 * which has been down since its token expired on 2026-08-24.
 *
 * Add --dry-run to check the login without changing Heroku.
 */
'use strict';
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');

const ACCOUNTS = {
  sushi: { env: 'URBANPIPER_TOKEN', biz: '55892580', label: 'Sushi ZEN' },
  ramen: { env: 'URBANPIPER_RAMEN_TOKEN', biz: '98750751', label: 'Ramen ZEN & All Veggie Sushi' },
};
const which = process.argv[2];
const acct = ACCOUNTS[which];
const DRY = process.argv.includes('--dry-run');
if (!acct) {
  console.error('Usage: node scripts/urbanpiper/setup-session.js sushi|ramen [--dry-run]');
  process.exit(1);
}

function payload(token) {
  try {
    const p = token.split('.')[1];
    return JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch { return {}; }
}

(async () => {
  console.log(`\nSign in to UrbanPiper as ${acct.label}. This waits up to 5 minutes.\n`);
  const browser = await chromium.launch({ headless: false });
  const page = await (await browser.newContext()).newPage();
  await page.goto('https://atlas.urbanpiper.com', { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});

  let token = null;
  for (let i = 0; i < 300 && !token; i++) {
    await page.waitForTimeout(1000);
    token = await page.evaluate(() => {
      const v = (() => { try { return localStorage.getItem('AT') || ''; } catch { return ''; } })();
      const m = v.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
      return m ? m[0] : null;
    }).catch(() => null);
  }
  await browser.close();
  if (!token) { console.error('No token after 5 minutes — sign-in not finished.'); process.exit(1); }

  const p = payload(token);
  if (String(p.biz_id) !== acct.biz) {
    console.error(`This login is business ${p.biz_id}, not ${acct.label} (${acct.biz}). Nothing changed.`);
    process.exit(1);
  }
  console.log(`✓ ${acct.label}: token valid until ${p.expires_on}`);
  if (DRY) { console.log('(dry run — Heroku not changed)'); return; }
  // execFile, not a shell string: the token never passes through a shell.
  execFileSync('heroku', ['config:set', `${acct.env}=${token}`, '-a', 'sushizen-shift-app'], { stdio: ['ignore', 'ignore', 'inherit'] });
  console.log(`✓ ${acct.env} set on Heroku`);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
