'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const gateway = require('../api/gateway');

test('hosted client passes grant only the approved role in Lakhotia', async t => {
  const pass = 'a'.repeat(43);
  const keys = {
    VERCEL_ENV: 'preview',
    M360_ROMIT_ORIGINAL_SCRAPER_PREVIEW_KEY: 'synthetic-preview-key'.repeat(2),
    M360_CLIENT_PREVIEW_PASS_SHA256: createHash('sha256').update(pass).digest('hex'),
    M360_CLIENT_PREVIEW_EXPIRES_AT: new Date(Date.now() + 600000).toISOString(),
    M360_CLIENT_PREVIEW_ROLE: 'viewer',
    M360_CLIENT_PREVIEW_USERNAME: 'test-viewer@example.test',
    M360_CLIENT_PREVIEW_PASSWORD: 'synthetic-preview-account-password'
  };
  const previous = Object.fromEntries(Object.keys(keys).map(key => [key, process.env[key]]));
  Object.assign(process.env, keys);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const token = 'synthetic-crm-viewer-session-token';
  let workspaces = [{ id: 'lakhotia', role: 'viewer' }];
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/auth/login')) {
      assert.deepEqual(JSON.parse(options.body), {
        username: keys.M360_CLIENT_PREVIEW_USERNAME,
        password: keys.M360_CLIENT_PREVIEW_PASSWORD
      });
      return Response.json({ access_token: token, expires_in: 3600, refresh_token: 'unreturned' });
    }
    assert.ok(url.endsWith('/me/workspaces'));
    assert.equal(options.headers.Authorization, 'Bearer ' + token);
    return Response.json(workspaces);
  });

  const host = 'preview.example.test';
  async function redeem({ submitted = pass, origin = 'https://' + host, method = 'POST' } = {}) {
    const res = { statusCode: 200, headers:{}, setHeader(name,value){this.headers[name]=value;}, end(body) { this.data = JSON.parse(body); } };
    await gateway({ method, headers: { host, origin }, query: { kind: 'crm', path: 'auth/client-preview' }, body: { pass: submitted } }, res);
    return res;
  }

  process.env.VERCEL_ENV = 'production';
  assert.equal((await redeem()).statusCode, 404);
  process.env.VERCEL_ENV = 'preview';
  assert.equal((await redeem({ method: 'GET' })).statusCode, 405);
  assert.equal((await redeem({ origin: 'https://elsewhere.example.test' })).statusCode, 403);
  assert.equal((await redeem({ submitted: 'b'.repeat(43) })).statusCode, 403);
  process.env.M360_CLIENT_PREVIEW_EXPIRES_AT = new Date(Date.now() - 1000).toISOString();
  assert.equal((await redeem()).statusCode, 410);
  assert.equal(fetch.mock.callCount(), 0);
  process.env.M360_CLIENT_PREVIEW_EXPIRES_AT = keys.M360_CLIENT_PREVIEW_EXPIRES_AT;

  workspaces[0].role = 'sales_operator';
  assert.equal((await redeem()).statusCode, 403);
  workspaces[0].role = 'viewer';
  workspaces.push({ id: 'unrelated', role: 'viewer' });
  assert.equal((await redeem()).statusCode, 403);
  workspaces.pop();

  const result = await redeem();
  assert.equal(result.statusCode, 200);
  assert.deepEqual(Object.keys(result.data).sort(), ['access_token', 'expires_in']);
  assert.equal(result.data.access_token, token);
  assert.ok(result.data.expires_in > 30 && result.data.expires_in <= 600);
  const bearer='Bearer '+token;
  const cookie=result.headers['Set-Cookie'][0].split(';')[0];
  assert.equal(gateway.hasPrivatePreviewEmailSession({headers:{cookie}},bearer),false);
  const login={statusCode:200,headers:{},setHeader(name,value){this.headers[name]=value;},end(){}};
  await gateway({method:'POST',headers:{host},query:{kind:'crm',path:'auth/login'},body:{username:keys.M360_CLIENT_PREVIEW_USERNAME,password:keys.M360_CLIENT_PREVIEW_PASSWORD}},login);
  const privateCookie=login.headers['Set-Cookie'][0].split(';')[0];
  assert.equal(gateway.hasPrivatePreviewEmailSession({headers:{cookie:privateCookie}},bearer),true);
  assert.equal(gateway.hasPrivatePreviewEmailSession({headers:{cookie:privateCookie}},'Bearer other-session'),false);

  process.env.M360_CLIENT_PREVIEW_ROLE = 'sales_operator';
  assert.equal((await redeem()).statusCode, 403);
  workspaces[0].role = 'sales_operator';
  assert.equal((await redeem()).statusCode, 200);
  workspaces[0].role = 'client_admin';
  assert.equal((await redeem()).statusCode, 403);
});
