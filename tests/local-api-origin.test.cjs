'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../frontend-source/matrix360-api-config.js'), 'utf8');
function base(origin, candidate) {
  const window = {location: new URL(origin)};
  if (candidate) window.MATRIX360_CRM_CONFIG = {apiBase: candidate};
  vm.runInNewContext(source, {window, URL});
  return window.Matrix360ApiBase;
}
test('local and hosted pages use their same-origin CRM gateway', () => {
  for (const origin of ['http://127.0.0.1:8050', 'http://localhost:8050', 'https://example.vercel.app']) {
    assert.equal(base(origin), origin + '/api/crm');
  }
  assert.equal(base('https://example.vercel.app', 'http://remote.example/api/crm'), null);
  assert.equal(base('http://127.0.0.1:8050', 'https://remote.example/api/crm'), null);
});
