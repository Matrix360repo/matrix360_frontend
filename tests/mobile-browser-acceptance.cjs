'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const OUTPUT = path.join(__dirname, 'evidence');
fs.mkdirSync(OUTPUT, { recursive: true });
const ORIGIN = 'http://127.0.0.1:4173';
const API = 'http://127.0.0.1:8000';
const scenarios = [
  { label: 'mobile-390', viewport: { width: 390, height: 844 }, mobile: true },
  { label: 'tablet-768', viewport: { width: 768, height: 1024 }, mobile: true },
  { label: 'desktop-1440', viewport: { width: 1440, height: 900 }, mobile: false }
];

function respond(route, payload, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': ORIGIN, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS' },
    body: JSON.stringify(payload)
  });
}
function installSyntheticApi(page, data) {
  return page.route(API + '/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const p = url.pathname;
    if (method === 'OPTIONS') return route.fulfill({
      status: 204, headers: { 'access-control-allow-origin': ORIGIN, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS' }
    });
    if (p === '/auth/login' && method === 'POST') {
      data.user = JSON.parse(request.postData() || '{}').username || 'synthetic-client-a';
      data.workspace = data.user === 'synthetic-client-b' ? 'shree' : 'lakhotia';
      return respond(route, { access_token: 'synthetic-access-token' });
    }
    if (p === '/auth/logout') return respond(route, { ok: true });
    if (p === '/me/workspaces') return respond(route, [{
      id: data.workspace, name: data.workspace === 'lakhotia' ? 'Synthetic Lakhotia Business' : 'Synthetic Shree Business',
      role: 'client_admin'
    }]);
    if (!request.headers()['authorization']) return respond(route, { detail: 'Missing authentication' }, 401);
    const ws = p.match(/^\/workspaces\/([^/]+)(?:\/|$)/)?.[1];
    if (ws && ws !== data.workspace) { data.denials++; return respond(route, { detail: 'Not authorized for this business' }, 403); }
    if (p.endsWith('/stages')) return respond(route, ['new', 'contacted', 'qualified']);
    if (p.endsWith('/leads') && method === 'GET') return respond(route, data.leads[data.workspace]);
    if (p.endsWith('/leads') && method === 'POST') {
      const lead = JSON.parse(request.postData() || '{}');
      data.leads[data.workspace].push({ id: String(++data.nextId), name: lead.name, source: lead.source || '', stage: lead.stage });
      return respond(route, { id: String(data.nextId) }, 201);
    }
    if (p.match(/\/leads\/[^/]+$/) && method === 'PATCH') {
      const lead = data.leads[data.workspace].find(x => x.id === p.split('/').at(-1));
      if (!lead) return respond(route, { detail: 'Not found' }, 404);
      lead.stage = JSON.parse(request.postData() || '{}').stage;
      return respond(route, lead);
    }
    if (p.endsWith('/audience/status')) return respond(route, { configured: false, status: 'CONFIG_REQUIRED' });
    if (p.endsWith('/assistant/capabilities')) return respond(route, {
      capabilities: [{ id: 'crm', status: 'READY' }, { id: 'audience', status: 'CONFIG_REQUIRED' }, { id: 'campaign', status: 'DEMONSTRATED_SIMULATION' }]
    });
    if (p.endsWith('/assistant/preview') && method === 'POST') {
      const body = JSON.parse(request.postData() || '{}');
      return respond(route, {
        mode: 'RULE_BASED_PREVIEW_ONLY', executed: false,
        goal: body.objective, domain_hint: 'industrial',
        steps: [
          { title: 'Review target criteria', status: 'READY', detail: 'The sample plan has not processed any prospect data.' },
          { title: 'Prepare campaign brief', status: 'DEMONSTRATED_SIMULATION', detail: 'No message will be delivered.' }
        ],
        limitations: ['Synthetic test only', 'No sending or publication']
      });
    }
    data.unhandled.push(method + ' ' + p);
    return respond(route, { detail: 'Synthetic mock: endpoint not configured' }, 404);
  });
}
async function assertNoPageOverflow(page, label) {
  const dims = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScroll: document.body.scrollWidth
  }));
  assert(dims.scrollWidth <= dims.width + 2, label + ': document horizontal overflow: ' + JSON.stringify(dims));
}
async function run(browser, scenario) {
  const page = await browser.newPage({ viewport: scenario.viewport, deviceScaleFactor: 1, isMobile: scenario.mobile, hasTouch: scenario.mobile });
  const data = { workspace: 'lakhotia', leads: { lakhotia: [{ id: '10', name: 'Existing synthetic lead', source: 'Demo', stage: 'new' }], shree: [] }, nextId: 20, denials: 0, unhandled: [], user: '' };
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await installSyntheticApi(page, data);
  await page.goto(ORIGIN + '/app.html', { waitUntil: 'domcontentloaded' });
  await assertNoPageOverflow(page, scenario.label + ' initial');

  // Mobile drawer behavior, tap access, Escape, focus and scrim.
  const drawerButton = page.locator('#m360-mobile-app-menu');
  if (scenario.viewport.width <= 780) {
    assert(await drawerButton.isVisible(), 'Mobile drawer toggle should be visible');
    await drawerButton.click();
    assert.equal(await drawerButton.getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await drawerButton.getAttribute('aria-expanded'), 'false');
    await drawerButton.click();
    const scrim = page.locator('#m360-app-menu-scrim');
    const bounds = await scrim.boundingBox();
    assert(bounds && bounds.width > 100, 'Mobile scrim must cover the app area');
    await scrim.click({ position: { x: bounds.width - 12, y: 40 } });
    assert.equal(await drawerButton.getAttribute('aria-expanded'), 'false');
  } else {
    assert(!(await drawerButton.isVisible()), 'Desktop must retain original navigation');
  }

  // A client should be directed to real authenticated CRM, not a simulated company selector.
  await page.locator('.mobile-goal-shortcut button').click();
  assert(await page.locator('#app-crm').evaluate(el => el.classList.contains('active')));
  await page.locator('#m360-username').fill('synthetic-client-a');
  await page.locator('#m360-password').fill('synthetic-password-only');
  await page.locator('#m360-login-form button[type=submit]').click();
  await page.waitForFunction(() => !document.querySelector('#m360-data-box').hidden);
  assert.equal(await page.locator('#m360-workspace').isVisible(), false, 'Ordinary client cannot choose arbitrary tenant');
  assert.match(await page.locator('#m360-assistant-business').innerText(), /Synthetic Lakhotia Business/);

  await page.locator('#m360-assistant-goal').fill('Find West Bengal manufacturers and prepare a campaign');
  await page.locator('#m360-assistant-form button[type=submit]').click();
  await page.waitForFunction(() => !document.querySelector('#m360-assistant-preview').hidden);
  const preview = await page.locator('#m360-assistant-preview').innerText();
  assert(preview.includes('NOT EXECUTED') && preview.includes('RULE') === false);
  assert(preview.includes('No message will be delivered'), 'Honest simulation status absent');
  await assertNoPageOverflow(page, scenario.label + ' plan');

  // Existing lead create + stage updates remain functional in the browser.
  await page.locator('#m360-name').fill('New synthetic prospect');
  await page.locator('#m360-source').fill('Synthetic test');
  await page.locator('#m360-lead-form button[type=submit]').click();
  await page.waitForFunction(() => document.querySelector('#m360-leads')?.textContent?.includes('New synthetic prospect'));
  const row = page.locator('#m360-leads tr').filter({ hasText: 'New synthetic prospect' });
  await row.locator('select').selectOption('contacted');
  await page.waitForFunction(() => document.querySelector('#m360-leads')?.textContent?.includes('New synthetic prospect') && document.querySelector('#m360-status')?.textContent === 'Stage updated');
  assert(data.leads.lakhotia.some(x => x.name === 'New synthetic prospect' && x.stage === 'contacted'));
  await assertNoPageOverflow(page, scenario.label + ' leads');
  await page.screenshot({ path: path.join(OUTPUT, scenario.label + '-crm.png'), fullPage: true });

  // A fresh synthetic user gets a different business after real sign-out.
  await page.locator('#m360-logout').click();
  await page.locator('#m360-username').fill('synthetic-client-b');
  await page.locator('#m360-password').fill('synthetic-password-only');
  await page.locator('#m360-login-form button[type=submit]').click();
  await page.waitForFunction(() => !document.querySelector('#m360-data-box').hidden);
  assert.match(await page.locator('#m360-assistant-business').innerText(), /Synthetic Shree Business/);
  assert(!(await page.locator('#m360-leads').innerText()).includes('New synthetic prospect'), 'Cross-client lead visible');

  // Synthetic stub rejects direct cross-tenant requests. This is NOT live server validation.
  const denial = await page.evaluate(() => fetch('http://127.0.0.1:8000/workspaces/lakhotia/leads', {
    headers: { authorization: 'Bearer synthetic-access-token' }
  }).then(r => r.status));
  assert.equal(denial, 403);
  assert.equal(data.denials, 1);
  assert.equal(pageErrors.length, 0, 'Browser JS errors: ' + pageErrors.join(' | '));
  assert.equal(data.unhandled.length, 0, 'Unexpected synthetic API requests: ' + data.unhandled.join(' | '));
  await page.close();
  console.log('PASS ' + scenario.label + ': mobile navigation, no full-page overflow, synthetic tenant A/B, rule-based preview, lead CRUD, client-only selector, logout; live backend not called');
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    for (const scenario of scenarios) await run(browser, scenario);
  } finally { await browser.close(); }
})().catch(e => { console.error(e.stack || e); process.exitCode = 1; });
