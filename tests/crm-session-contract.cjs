const assert = require('node:assert/strict');
const fs = require('node:fs');
const text = fs.readFileSync('matrix360-crm.js', 'utf8');
assert.match(text, /response\.status === 401 && token/);
assert.match(text, /response\.status === 401 && token\) \{\s*reset\(\)/);
assert.match(text, /Session expired or access was revoked/);
assert.match(text, /let token = null/);
assert.match(text, /function reset\(\)/);
console.log('CRM session expiry source-contract checks passed (not a browser E2E test)');
