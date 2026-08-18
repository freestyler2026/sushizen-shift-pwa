// Extract Bearer token from discovery and decode JWT expiry
const data = JSON.parse(require('fs').readFileSync('scripts/talabat/talabat-api-discovery.json', 'utf8'));
const call = data.find(function(c) { return c.headers && c.headers.authorization; });
if (!call) { console.log('No auth header found'); process.exit(1); }

const token = call.headers.authorization.replace('Bearer ', '');
console.log('Full token length:', token.length);
console.log('Token (first 60):', token.slice(0, 60) + '...');

// Decode JWT payload (base64url)
const parts = token.split('.');
if (parts.length !== 3) { console.log('Not a valid JWT'); process.exit(1); }
const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
console.log('\nJWT payload:');
console.log('  iss:', payload.iss);
console.log('  sub:', payload.sub);
console.log('  iat:', new Date(payload.iat * 1000).toISOString());
console.log('  exp:', new Date(payload.exp * 1000).toISOString());
const hoursLeft = (payload.exp - Date.now() / 1000) / 3600;
console.log('  expires in:', hoursLeft.toFixed(1), 'hours');
