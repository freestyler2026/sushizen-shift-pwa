const { chromium } = require('playwright');
const fs = require('fs');
const raw = fs.readFileSync(__dirname + '/keeta-session.b64.txt', 'utf8').trim();
const session = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
const tmpFile = __dirname + '/keeta-session-probe.json';
fs.writeFileSync(tmpFile, JSON.stringify(session));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: tmpFile });
  const page = await context.newPage();

  await page.goto('https://merchant.mykeeta.com/web/app/finance', {
    waitUntil: 'networkidle', timeout: 30000
  }).catch(() => {});
  await page.waitForTimeout(4000);

  // Get ALL tasks (pageSize=100)
  const result = await page.evaluate(async () => {
    const resp = await fetch('/api/settlement/statement/v2/r/download/task/list?yodaReady=h5&csecplatform=4&csecversion=3.5.1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageNo: 1, pageSize: 100, taskTypeList: [3] })
    });
    return resp.json();
  });

  // Try creating a new settlement report for August 2026
  const result4 = await page.evaluate(async () => {
    // Try write endpoints for generating reports
    const resp = await fetch('/api/settlement/statement/v2/w/download/task/create?yodaReady=h5&csecplatform=4&csecversion=3.5.1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: '2026-08-01', endDate: '2026-08-22', taskTypeList: [3] })
    });
    return resp.json();
  });

  await browser.close();
  try { fs.unlinkSync(tmpFile); } catch(_) {}

  fs.writeFileSync(__dirname + '/keeta-tasks.json', JSON.stringify({ result, result4 }, null, 2));

  console.log('=== All settlement download tasks ===');
  const tasks = result && result.data && result.data.pageContent ? result.data.pageContent : [];
  tasks.forEach(t => {
    console.log('  ' + t.taskName);
    console.log('    status=' + t.taskStatus + ' created=' + new Date(t.createTime).toISOString().slice(0,10));
    console.log('    url=' + (t.downloadUrl || '').slice(0, 120));
  });
  console.log('  Total tasks:', result && result.data ? (result.data.totalCount || tasks.length) : 0);

  console.log('\n=== Create new task attempt ===');
  console.log(JSON.stringify(result4));
})().catch(console.error);
