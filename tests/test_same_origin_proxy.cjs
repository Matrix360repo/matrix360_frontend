'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'matrix360-api-config.js'), 'utf8');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const render = 'https://matrix360-crm-backend-p9os.onrender.com';
const frontend = 'https://matrix360frontend-jiz5ebu2x-matrix360s-projects.vercel.app';
function runAt(origin, candidate) {
  const location = new URL(origin);
  const window = { location };
  if (candidate !== undefined) window.MATRIX360_CRM_CONFIG = { apiBase: candidate };
  vm.runInNewContext(source, {window, URL}, {timeout: 1000});
  return {base: window.Matrix360ApiBase, error: window.Matrix360ApiConfigError};
}
assert.equal(runAt(frontend + '/login.html').base, frontend + '/api/crm');
assert.equal(runAt(frontend + '/client-dashboard.html').base, frontend + '/api/crm');
assert.equal(runAt('http://localhost:8080/login.html').base, render);
assert.equal(runAt(frontend, render).base, render);
assert.equal(runAt(frontend, frontend + '/api/crm').base, frontend + '/api/crm');
assert.equal(runAt(frontend, 'http://127.0.0.1:8000').base, 'http://127.0.0.1:8000');
for (const unsafe of ['http://example.org', 'https://example.org/admin', 'https://user:pw@example.org',
                      'https://example.org/?t=secret', 'javascript:alert(1)', '//example.org', '', 'https://example.org/#frag']) {
  const result = runAt(frontend, unsafe);
  assert.equal(result.base, null, unsafe);
  assert.ok(result.error, unsafe);
}
const proxy = vercel.rewrites.find(r => r.source === '/api/crm/:path*');
assert.equal(proxy.destination, render + '/:path*');
const apiHeaders = vercel.headers.find(h => h.source === '/api/crm/:path*').headers;
assert.equal(apiHeaders.find(h => h.key.toLowerCase() === 'cache-control').value, 'private, no-store');
console.log('PASS: 16 HTTPS API origin, rewrite, and no-cache assertions');
