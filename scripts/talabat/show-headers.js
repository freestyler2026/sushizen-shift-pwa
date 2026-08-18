const data = JSON.parse(require('fs').readFileSync('scripts/talabat/talabat-api-discovery.json', 'utf8'));
const vendorCalls = data.filter(c => c.url.includes('restaurant-partners.com') && c.headers);
const SKIP = ['accept-encoding', 'accept-language', 'user-agent', 'sec-fetch', 'sec-ch', 'cache-control', 'pragma'];
vendorCalls.slice(0, 3).forEach(c => {
  console.log('\nURL:', c.url);
  Object.entries(c.headers).forEach(function(pair) {
    var k = pair[0], v = pair[1];
    if (!SKIP.some(function(s) { return k.startsWith(s); }))
      console.log(' ', k + ':', String(v).slice(0, 160));
  });
  console.log('---');
});
