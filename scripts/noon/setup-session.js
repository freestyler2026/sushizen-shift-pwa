#!/usr/bin/env node
/**
 * Noon Food — One-time session setup
 *
 * Logs in via Firefox Playwright, saves session cookies to a local file
 * and optionally uploads to GitHub Actions secret NOON_SESSION.
 *
 * Run locally when:
 *   - First time setup
 *   - GitHub Actions reports 401 (session expired)
 *
 * Usage:
 *   node scripts/noon/setup-session.js
 *   node scripts/noon/setup-session.js --upload   # also sets GitHub secret
 */

'use strict';
const { firefox } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const USERNAME = process.env.NOON_USERNAME;
const PASSWORD = process.env.NOON_PASSWORD;
if (!USERNAME || !PASSWORD) {
  console.error('❌ Set NOON_USERNAME and NOON_PASSWORD env vars before running.');
  process.exit(1);
}
const OUT_PATH = path.join(__dirname, 'noon-session.json');
const UPLOAD = process.argv.includes('--upload');

(async () => {
  console.log('Logging in to restaurant.noon.partners...');
  const browser = await firefox.launch({ headless: true });
  const ctx  = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
  });
  const page = await ctx.newPage();

  await page.goto('https://restaurant.noon.partners/public/login/', { waitUntil: 'load', timeout: 30_000 });
  await page.waitForTimeout(3000);

  const loginFrame = page.frames().find(f => f.url().includes('login-webview-embed'));
  if (!loginFrame) throw new Error('Login iframe not found');

  await loginFrame.waitForSelector('input[name="channelIdentifier"]', { timeout: 10_000 });
  await loginFrame.fill('input[name="channelIdentifier"]', USERNAME);
  await loginFrame.click('button[type="submit"]');
  await page.waitForTimeout(6000);

  const pwdInput = await loginFrame.$('input[type="password"]');
  if (!pwdInput) throw new Error('Password step not reached');

  await loginFrame.fill('input[type="password"]', PASSWORD);
  await loginFrame.click('button[type="submit"]');
  await page.waitForURL(/\/restaurant\//, { timeout: 30_000 });
  await page.waitForTimeout(3000);

  const cookies = await ctx.cookies();
  const npsid     = cookies.find(c => c.name === '_npsid')?.value;
  const nprtnetid = cookies.find(c => c.name === '_nprtnetid')?.value;
  const npaRt     = cookies.find(c => c.name === 'npa.rt.v1')?.value;

  if (!npsid || !nprtnetid) throw new Error('Session cookies not found after login');

  const session = { npsid, nprtnetid, npa_rt_v1: npaRt || '', savedAt: new Date().toISOString() };
  fs.writeFileSync(OUT_PATH, JSON.stringify(session, null, 2));
  console.log(`✓ Session saved to ${OUT_PATH}`);
  console.log(`  _npsid: ${npsid}`);
  console.log(`  _nprtnetid: ${nprtnetid.substring(0, 40)}...`);

  const b64 = Buffer.from(JSON.stringify(session)).toString('base64');

  if (UPLOAD) {
    console.log('\nUploading to GitHub Actions secret NOON_SESSION...');
    execSync(`gh secret set NOON_SESSION --body "${b64}"`, { stdio: 'inherit' });
    console.log('✓ NOON_SESSION secret updated');
  } else {
    console.log('\nTo upload to GitHub secrets, run:');
    console.log(`  node scripts/noon/setup-session.js --upload`);
    console.log('  — or manually:');
    console.log(`  echo '${b64}' | gh secret set NOON_SESSION`);
  }

  await browser.close();
})();
