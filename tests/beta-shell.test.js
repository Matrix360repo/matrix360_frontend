const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.join(__dirname, '..');
const source = path.join(frontend, 'frontend-source');

test('public beta shell has one pricing source and mobile-safe hero', () => {
  const index = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
  const client = fs.readFileSync(path.join(frontend, 'lib', 'm360-product-client.js'), 'utf8');
  assert.match(index, /@media\(max-width:640px\)[\s\S]*?\.hero-art\{display:none\}/);
  const script=require('../lib/m360-product-client');
  const pricing=script.slice(script.indexOf('function pricing()'),script.indexOf('function brand()'));
  let created=0;
  new Function('location','$','n',pricing+'pricing();')({pathname:'/client-dashboard.html'},()=>null,()=>{created++;});
  assert.equal(created,0,'pricing must never mount in the workspace');
  assert.match(pricing,/index/);
});

test('login forms cannot fall back to credential-bearing GET submissions', () => {
  const login = fs.readFileSync(path.join(source, 'login.html'), 'utf8');
  assert.match(login, /<form id="signin" method="post" autocomplete="on">/);
  assert.match(login, /<button id="tab-login" type="button" role="tab"/);
  assert.match(login, /<button id="tab-signup" type="button" role="tab"/);
});

test('deployment declares baseline browser security headers', () => {
  const config = JSON.parse(fs.readFileSync(path.join(frontend, 'vercel.json'), 'utf8'));
  const headers = Object.fromEntries(config.headers.find(rule => rule.source === '/(.*)').headers.map(item => [item.key, item.value]));
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.match(headers['Strict-Transport-Security'], /max-age=31536000/);
  assert.match(headers['Permissions-Policy'], /camera=\(\)/);
});
