'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const gateway = require('../api/document-qualification.js')._internals;

function request(method, query) {
  return { method, query, headers: {} };
}

test('document gateway accepts only safe HTTPS service origins', () => {
  assert.equal(gateway.safeOrigin('https://matrix360-engine-v4-and-exports.onrender.com', ''), 'https://matrix360-engine-v4-and-exports.onrender.com');
  assert.equal(gateway.safeOrigin('http://matrix360-engine-v4-and-exports.onrender.com', ''), null);
  assert.equal(gateway.safeOrigin('https://example.test/extra', ''), null);
  assert.equal(gateway.safeOrigin('https://user:pass@example.test', ''), null);
});

test('document gateway allowlists methods and engine paths', () => {
  assert.deepEqual(gateway.resolveOperation(request('GET', { op: 'datasets' })), { method: 'GET', path: '/api/v1/datasets' });
  assert.deepEqual(gateway.resolveOperation(request('POST', { op: 'upload' })), { method: 'POST', path: '/api/v1/datasets', upload: true });
  assert.equal(gateway.resolveOperation(request('GET', { op: 'upload' })), null);
  assert.equal(gateway.resolveOperation(request('GET', { op: 'job', id: '../other-workspace' })), null);
  assert.equal(gateway.resolveOperation(request('POST', { op: 'execute-job', id: 'job_123' })).path, '/api/v1/jobs/job_123/execute');
});

test('engine service request signature binds the actual engine path and workspace', () => {
  const previous = process.env.MATRIX360_ENGINE_SERVICE_AUTH_SECRET;
  process.env.MATRIX360_ENGINE_SERVICE_AUTH_SECRET = 'test-shared-secret';
  try {
    const operation = { method: 'POST', path: '/api/v1/datasets/a1/filter-plans/suggest' };
    const headers = gateway.engineHeaders(operation, 'workspace_alpha', 'application/json');
    assert.equal(headers['X-Matrix-Workspace'], 'workspace_alpha');
    assert.match(headers['X-Matrix-Timestamp'], /^\d+$/);
    assert.match(headers['X-Matrix-Nonce'], /^[A-Za-z0-9_-]{16,128}$/);
    assert.match(headers['X-Matrix-Signature'], /^[a-f0-9]{64}$/);
    assert.equal(Object.hasOwn(headers, 'Authorization'), false);
  } finally {
    if (previous === undefined) delete process.env.MATRIX360_ENGINE_SERVICE_AUTH_SECRET;
    else process.env.MATRIX360_ENGINE_SERVICE_AUTH_SECRET = previous;
  }
});

test('browser module uses only the same-origin gateway and never the bootstrap shortcut', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'matrix360-document-qualification.js'), 'utf8');
  assert.match(source, /api\/document-qualification/);
  assert.match(source, /Document Upload &amp; Qualification/);
  assert.match(source, /deterministic schema-only/);
  assert.doesNotMatch(source, /auth\/bootstrap/);
  assert.doesNotMatch(source, /matrix360-engine-v4-and-exports\.onrender\.com/);
});

test('local preview honors explicit API remaps before preserved legacy handlers', {skip: !fs.existsSync(path.join(__dirname, '..', '..', '..', '..', 'tools', 'local-preview.cjs'))}, () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'tools', 'local-preview.cjs'), 'utf8');
  assert.match(source, /explicitRemap=routes\.some/);
  assert.match(source, /if\(!explicitRemap&&/);
});
