#!/usr/bin/env node
/**
 * Foodpanda / Talabat のセッションが「まだ使えるか」を実際に試す。
 *
 * なぜ期限監視ではいけないか
 * --------------------------
 * この2つ（どちらも Delivery Hero 系）の accessToken は **寿命4時間** の JWT で、
 * 保存直後から数時間で必ず期限切れになる。だから「期限が切れている」ことは
 * 何の異常も意味しない。deviceToken に至っては100年で、これも判定に使えない。
 *
 * 実際の仕組みは、ポータルをブラウザで開くと SPA が保存済みセッションを
 * 新しい JWT に交換する、というもの（talabat/refresh-token.js と
 * foodpanda/get-payouts.js が依存しているのがこれ）。
 * したがって健全性の定義は一つしかない:
 *
 *     保存済みセッションから、新しい Bearer トークンをまだ発行できるか。
 *
 * 発行できれば取込は動く。できなければ人がログインし直すしかない。
 * 予測ではなく事実が出るので、Grab のような寿命の当て推量が要らない。
 *
 * 副作用は無い。ページを1枚読むだけで、何も書き戻さない。
 * refreshToken を消費して CI 側のシークレットを無効化する心配もない
 * （消費するのは JWT の発行であって、リフレッシュトークンの回転ではない）。
 *
 * 使い方:
 *   node scripts/ops/probe-session.js talabat
 *   node scripts/ops/probe-session.js foodpanda taft
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);

const PORTAL = {
  talabat: 'https://partner-app.talabat.com',
  foodpanda: 'https://partner.foodpanda.com',
};

const platform = process.argv[2];
const store = process.argv[3] || '';
if (!PORTAL[platform]) {
  console.error('Use: talabat | foodpanda [store]');
  process.exit(2);
}

const file = platform === 'talabat'
  ? path.join(ROOT, 'talabat', 'talabat-session.json')
  : path.join(ROOT, 'foodpanda', `${store || 'paranaque'}-session.json`);

if (!fs.existsSync(file)) {
  console.log(`${platform}${store ? ` (${store})` : ''}: セッションファイルが無い`);
  process.exit(1);
}

function jwtExp(tok) {
  try {
    const p = tok.split('.');
    if (p.length !== 3) return null;
    const d = JSON.parse(Buffer.from(p[1], 'base64url').toString('utf8'));
    return d.exp || null;
  } catch { return null; }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: JSON.parse(fs.readFileSync(file, 'utf8')),
  });
  const page = await ctx.newPage();

  let fresh = null;
  page.on('request', (req) => {
    const auth = req.headers()['authorization'] || '';
    if (!auth.startsWith('Bearer ')) return;
    const exp = jwtExp(auth.slice(7));
    // 「新しい」の判定は発行済みかどうかではなく、いま有効かどうか。
    // 保存ファイルの古いトークンをそのまま送っている場合と区別できる。
    if (exp && exp * 1000 > Date.now()) fresh = exp;
  });

  await page.goto(PORTAL[platform], { waitUntil: 'networkidle', timeout: 60000 })
    .catch(() => {});
  await page.waitForTimeout(6000);

  const url = page.url();
  const onLogin = /login|signin|auth/i.test(url);
  const label = `${platform}${store ? ` (${store})` : ''}`;

  await browser.close();

  if (fresh) {
    const h = ((fresh * 1000 - Date.now()) / 3600000).toFixed(1);
    console.log(`${label}: 生存 — 新しいトークンを発行できた（あと ${h} 時間有効）`);
    process.exit(0);
  }
  if (onLogin) {
    console.log(`${label}: 失効 — ログイン画面に飛ばされた（${url.slice(0, 60)}）`);
    process.exit(1);
  }
  console.log(`${label}: 判定不能 — トークンもログイン画面も観測できなかった（${url.slice(0, 60)}）`);
  process.exit(3);
})();
