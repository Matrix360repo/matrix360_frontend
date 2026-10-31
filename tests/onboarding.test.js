'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const handler = require('../lib/m360-onboarding');

function response() {
  return { setHeader() {}, end(value) { this.data = JSON.parse(value); } };
}

test('onboarding validates input and fails closed without mail configuration', async () => {
  const previous = { key: process.env.RESEND_API_KEY, from: process.env.M360_ONBOARDING_FROM_EMAIL, team: process.env.M360_ONBOARDING_TEAM_EMAIL };
  delete process.env.RESEND_API_KEY; delete process.env.M360_ONBOARDING_FROM_EMAIL; delete process.env.M360_ONBOARDING_TEAM_EMAIL;
  try {
    const invalid = response();
    await handler({ method: 'POST', headers: { host: '127.0.0.1:8020' }, body: { name: '', email: 'bad', company: '' } }, invalid);
    assert.equal(invalid.statusCode, 422);
    const blocked = response();
    await handler({ method: 'POST', headers: { host: '127.0.0.1:8020' }, body: { name: 'New Client', email: 'client@example.com', company: 'Client Co' } }, blocked);
    assert.equal(blocked.statusCode, 503);
    assert.equal(blocked.data.status, 'blocked');
  } finally {
    for (const [name, value] of Object.entries({ RESEND_API_KEY: previous.key, M360_ONBOARDING_FROM_EMAIL: previous.from, M360_ONBOARDING_TEAM_EMAIL: previous.team })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('onboarding sends client and team emails without exposing secrets', async () => {
  const originalFetch = global.fetch;
  const sent = [];
  process.env.RESEND_API_KEY = 're_test_only_123456789';
  process.env.M360_ONBOARDING_FROM_EMAIL = 'Matrix 360 <onboarding@example.com>';
  process.env.M360_ONBOARDING_TEAM_EMAIL = 'team@example.com';
  process.env.M360_PUBLIC_APP_ORIGIN = 'https://matrix360.example';
  global.fetch = async (url, options) => { sent.push({ url, body: JSON.parse(options.body), authorization: options.headers.Authorization }); return { ok: true }; };
  try {
    const res = response();
    await handler({ method: 'POST', headers: {}, body: { name: 'A Client', email: 'fresh@example.com', company: 'Fresh Company', objective: 'Grow qualified enquiries' } }, res);
    assert.equal(res.statusCode, 202);
    assert.equal(sent.length, 2);
    assert.equal(sent[0].body.to[0], 'fresh@example.com');
    assert.match(sent[0].body.html, /https:\/\/matrix360\.example\/login\.html\?mode=login/);
    assert.equal(sent[1].body.to[0], 'team@example.com');
    assert.doesNotMatch(JSON.stringify(res.data), /re_test_only/);
  } finally {
    global.fetch = originalFetch;
    delete process.env.RESEND_API_KEY; delete process.env.M360_ONBOARDING_FROM_EMAIL; delete process.env.M360_ONBOARDING_TEAM_EMAIL; delete process.env.M360_PUBLIC_APP_ORIGIN;
  }
});

test('login UI removes client-facing notices and enables onboarding', () => {
  const source = fs.readFileSync(path.join(__dirname, '../frontend-source/matrix360-login-handoff.js'), 'utf8');
  assert.match(source, /querySelectorAll\('\.notice'\)/);
  assert.match(source, /\/api\/onboarding/);
  assert.match(source, /Request client access/);
});
