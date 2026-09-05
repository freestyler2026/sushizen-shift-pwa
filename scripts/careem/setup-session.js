/**
 * Careem partner portal — save a login session for the payout extractor.
 *
 * Three things were wrong here and each one on its own was enough to make a
 * refresh silently fail (found 2026-09-05, after a refresh that appeared to
 * work left the session file untouched at 25 Aug and Careem payouts unimported
 * for ten days):
 *
 *   1. The session was base64'd but not compressed: 96 KB, where a GitHub
 *      Actions secret caps at 64 KB (65,536 characters). `gh secret set` could not accept it.
 *      Gzipping takes the same session to 13.6 KB. get-payouts.js has always
 *      sniffed for the gzip magic bytes, so nothing downstream changes.
 *      (partners.careem.com alone keeps 52 KB of localStorage.)
 *   2. It told you to create a secret named CAREEM_SESSION_STATE. The workflow
 *      reads CAREEM_SESSION. Following the instructions exactly produced a
 *      secret nothing reads.
 *   3. It ended with "the workflow will now run every 4 hours automatically".
 *      That cron was removed on 2026-08-24 when Dubai moved to manual upload,
 *      so the closing line promised an automation that no longer exists.
 *
 * It also used to save only when you pressed Enter, so closing the browser
 * window -- the natural thing to do once you can see the dashboard -- threw the
 * login away. It now saves as soon as the dashboard is reached, and Enter is
 * only a fallback.
 *
 * Usage:
 *   node scripts/careem/setup-session.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_FILE = path.join(__dirname, 'careem-session.json');
const B64_FILE = OUT_FILE.replace('.json', '.b64.txt');
const PORTAL = 'https://partners.careem.com';
const WAIT_MS = 5 * 60 * 1000;

async function main() {
  console.log('\n=== Careem セッション取得 ===\n');
  console.log('ブラウザが開きます。Careem partner portal にログインしてください。');
  console.log('ダッシュボードが表示されたら自動で保存します。\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(PORTAL, { waitUntil: 'domcontentloaded' });

  // ダッシュボードに着いたら保存する。Enter を待つだけだと、ログインを見て
  // ブラウザを閉じた時点で何も残らない。
  const reachedDashboard = (async () => {
    const deadline = Date.now() + WAIT_MS;
    while (Date.now() < deadline) {
      const url = context.pages().map((p) => p.url()).join(' ');
      if (/partners\.careem\.com/.test(url) && !/login|signin|auth/i.test(url)) {
        await new Promise((r) => setTimeout(r, 4000));  // 読み込みを落ち着かせる
        return 'dashboard';
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return 'timeout';
  })();

  const pressedEnter = new Promise((resolve) => {
    process.stdout.write('（自動で進まないときは、ログイン後に Enter）');
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', () => resolve('enter'));
  });

  const how = await Promise.race([reachedDashboard, pressedEnter]);
  if (how === 'timeout') {
    console.error('\n5分待ちましたがログインが確認できませんでした。保存していません。');
    await browser.close();
    process.exit(1);
  }

  let state;
  try {
    state = await context.storageState();
  } catch (e) {
    console.error('\nセッションを読み出せませんでした（ブラウザが閉じられた可能性）:', e.message);
    process.exit(1);
  }
  await browser.close();

  fs.writeFileSync(OUT_FILE, JSON.stringify(state, null, 2));
  const b64 = zlib.gzipSync(Buffer.from(JSON.stringify(state)), { level: 9 })
    .toString('base64');
  fs.writeFileSync(B64_FILE, b64);

  const cookies = (state.cookies || []).length;
  console.log(`\n✓ 保存しました（${how === 'enter' ? 'Enter' : 'ダッシュボード検出'}）`);
  console.log(`  ${OUT_FILE}`);
  console.log(`  ${B64_FILE}  ${b64.length.toLocaleString()} 文字 / gzip / cookie ${cookies}個`);

  if (b64.length > 65536) {
    console.log('\n⚠ 65,536文字を超えています。GitHub のシークレット上限のため登録できません。');
  }

  console.log('\n--- 次にやること ---');
  console.log('  gh secret set CAREEM_SESSION < ' + path.relative(process.cwd(), B64_FILE));
  console.log('\n※ Careem の日次 cron は 2026-08-24 に外されています（ドバイは手動アップロードへ移行）。');
  console.log('  取込を走らせるには GitHub Actions の');
  console.log('  "Careem Dubai — Payout Extract" を Run workflow で手動実行してください。');

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
