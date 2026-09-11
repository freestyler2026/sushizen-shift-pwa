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
 * 新しい JWT に交換する、というもの。
 *
 * ⚠️ 2026-09-11 に、この判定が2か所で嘘をついていたことが分かった。
 *
 * **1. CIが使うファイルを見ていなかった。** 読んでいたのは
 * `talabat-session.json` で、GitHub のシークレットの元は
 * `talabat-session.b64.txt`。実測すると **json は通り、b64 はログイン画面に
 * 飛ばされた**（中身も違う: cookie 18 対 17、bearer も別物）。
 * 取込が使う方が死んでいても、この画面は 🟢 と表示していた。
 * **読む側が実際に使う成果物で確かめる**（教訓87）。
 *
 * **2. トークンが取れれば、ログイン画面でも「生存」と言っていた。**
 * `if (fresh)` が `onLogin` より先にあった。ログインSPA自身も認証を持つので、
 * 追い出された状態でトークンが観測されうる。**追い出されていれば失効。**
 *
 * **3. トークンは取れるのに、取込が使うAPIは 401 を返すことがある。**
 * 同日、foodpanda は「生存（あと4.0時間）」と出ている状態で
 * `vagw-api/query` が 401、ポータル自身の ListOrders も PerimeterX に弾かれた。
 * **発行できることと、使えることは別。**発行のあとに、取込が実際に叩く
 * エンドポイントを1回叩いて、その結果まで出す。
 *
 * 副作用は無い。ページを1枚読んで GET を1本投げるだけ。
 *
 * 使い方:
 *   node scripts/ops/probe-session.js talabat
 *   node scripts/ops/probe-session.js foodpanda taft
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.dirname(__dirname);

const PORTAL = {
  talabat: 'https://partner-app.talabat.com',
  foodpanda: 'https://partner.foodpanda.com',
  careem: 'https://partners.careem.com/saturn-ext/merchant/home',
};

// Careem does not hand the page a Bearer -- it is cookie-authenticated -- so
// "a fresh token was minted" cannot be the test there. Its liveness is: the
// portal did not bounce us to login, and an authenticated GET answers.
// Until 2026-09-11 Careem was judged by "saved at + a 72-hour lifetime from
// memory", which is a guess, and the daily check would have said healthy for
// up to three days after it actually died.
const COOKIE_AUTH = new Set(['careem']);

// 取込が実際に叩くもの。発行できたあとに1回だけ確かめる。
// foodpanda: 店舗状態の取込（get-store-status.js）が使う本物。
// talabat: 認証つきの読み取りAPIがまだ無いので、ポータルに留まれたかだけを見る。
const VERIFY = {
  foodpanda: 'https://vss.as.restaurant-partners.com/api/v2/vendors/status',
  // Small, read-only, and behind the same auth the promotions snapshot needs.
  careem: 'https://partners.careem.com/api/saturn-ext/v1/partners/me',
};

const platform = process.argv[2];
const store = process.argv[3] || '';
if (!PORTAL[platform]) {
  console.error('Use: talabat | foodpanda [store] | careem');
  process.exit(2);
}

// CI が使うのは b64（シークレットの中身）。それを第一に読む。
// .json はローカルにしか無く、片方だけ新しいことが実際にあった。
const FILES = {
  talabat: ['talabat/talabat-session.b64.txt', 'talabat/talabat-session.json'],
  careem: ['careem/careem-session.b64.txt', 'careem/careem-session.json'],
  foodpanda: [`foodpanda/${store || 'paranaque'}-session.b64.txt`,
              `foodpanda/${store || 'paranaque'}-session.json`],
};
const b64File = path.join(ROOT, FILES[platform][0]);
const jsonFile = path.join(ROOT, FILES[platform][1]);

const label = `${platform}${store ? ` (${store})` : ''}`;

function readState() {
  if (fs.existsSync(b64File)) {
    const b = Buffer.from(fs.readFileSync(b64File, 'utf8').trim(), 'base64');
    const raw = (b[0] === 0x1f && b[1] === 0x8b) ? zlib.gunzipSync(b).toString('utf8') : b.toString('utf8');
    const s = JSON.parse(raw);
    return { state: { cookies: s.cookies || [], origins: s.origins || [] }, from: path.basename(b64File) };
  }
  if (fs.existsSync(jsonFile)) {
    const s = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    return { state: { cookies: s.cookies || [], origins: s.origins || [] }, from: path.basename(jsonFile) };
  }
  return null;
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
  const loaded = readState();
  if (!loaded) {
    console.log(`${label}: セッションファイルが無い`);
    process.exit(1);
  }
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: loaded.state });
  const page = await ctx.newPage();

  let fresh = null;
  let authHeaders = null;
  page.on('request', (req) => {
    const auth = req.headers()['authorization'] || '';
    if (!auth.startsWith('Bearer ')) return;
    const exp = jwtExp(auth.slice(7));
    if (exp && exp * 1000 > Date.now()) { fresh = exp; authHeaders = req.headers(); }
  });

  await page.goto(PORTAL[platform], { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(6000);

  const url = page.url();
  const onLogin = /login|signin|auth/i.test(url);

  // ⚠️ ログイン画面に居るなら失効。トークンが観測できていても同じ。
  if (onLogin) {
    await browser.close();
    console.log(`${label}: 失効 — ログイン画面に飛ばされた（${loaded.from}／${url.slice(0, 50)}）`);
    process.exit(1);
  }
  if (!fresh && !COOKIE_AUTH.has(platform)) {
    await browser.close();
    console.log(`${label}: 判定不能 — トークンもログイン画面も観測できなかった（${loaded.from}）`);
    process.exit(3);
  }

  const h = fresh ? ((fresh * 1000 - Date.now()) / 3600000).toFixed(1) : null;

  // 発行できた。では取込が使う口は答えるか。
  let verdict = '';
  if (VERIFY[platform]) {
    // Cookie-authenticated platforms carry their auth in the context, so an
    // empty header set is correct there and must not skip the check.
    const r = await ctx.request.get(VERIFY[platform], { headers: authHeaders || {} }).catch(() => null);
    if (!r) {
      verdict = '・取込APIは確認できず';           // 確認できないことを死亡に倒さない（教訓58）
    } else if (r.ok()) {
      verdict = '・取込APIも通る';
    } else {
      await browser.close();
      console.log(`${label}: 半死 — トークンは出るが取込APIが ${r.status()} を返す（${loaded.from}）`);
      process.exit(1);
    }
  }

  if (COOKIE_AUTH.has(platform) && !verdict) {
    await browser.close();
    console.log(`${label}: 判定不能 — ポータルは開けたが、確認用のAPIに届かなかった（${loaded.from}）`);
    process.exit(3);
  }

  await browser.close();
  console.log(h
    ? `${label}: 生存 — 新しいトークンを発行できた（あと ${h} 時間有効${verdict}／${loaded.from}）`
    : `${label}: 生存 — ポータルに留まれた${verdict}／${loaded.from}）`);
  process.exit(0);
})();
