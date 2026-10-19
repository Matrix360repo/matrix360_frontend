'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const html = fs.readFileSync('app.html', 'utf8');
const crm = fs.readFileSync('matrix360-crm.js', 'utf8');

// Parse every inline browser script as well as the unchanged CRM integration.
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x => x[1]);
assert(inlineScripts.length >= 2, 'Expected Command Center and environment bootstrap scripts');
inlineScripts.forEach((source, index) => new vm.Script(source, { filename: 'app-inline-' + index + '.js' }));
new vm.Script(crm, { filename: 'matrix360-crm.js' });

// Existing authenticated operations and honest execution boundaries must survive.
for (const id of ['m360-login-form', 'm360-lead-form', 'm360-stage', 'm360-workspace',
  'm360-logout', 'm360-audience-upload-form', 'm360-audience-plan-preview']) {
  assert(html.includes('id="' + id + '"'), 'Lost existing CRM control: ' + id);
}
assert(html.includes('https://matrix360-crm-backend-p9os.onrender.com'));
assert(crm.includes("'/assistant/preview'"), 'Intent-first backend plan preview was removed');
assert(crm.includes('RULE_BASED_PREVIEW_ONLY'), 'Rule-based plan disclosure removed');
assert(crm.includes('Multiple client memberships require administrator resolution'),
  'Client tenant-selector fail-closed guard removed');
assert(crm.includes("if (!isPortfolioAdmin && memberships.length > 1)"),
  'Client tenant-selection guard changed');
assert(!crm.includes('localStorage'), 'Access token must remain in memory');
assert(html.includes('Other modules are illustrative'), 'Missing demo/live disclosure');

// Mobile and touch support are explicit, not a frontend/backend rewrite.
assert(html.includes('id="m360-mobile-app-menu" aria-controls="appNav" aria-expanded="false"'));
assert(html.includes('id="m360-app-menu-scrim"'));
assert(html.includes("onclick=\"openApp('crm')\""));
assert(html.includes('@media(max-width:780px)') && html.includes('@media(max-width:530px)'));
assert(html.includes('.appframe.menu-open .app-menu-scrim'));
assert(html.includes('min-height:44px'), 'Mobile touch targets are missing');
assert(html.includes('overflow-x:auto'), 'Mobile table access is missing');
assert(html.includes('const drawerWasOpen='), 'Module-switch focus regression');

// Unit-exercise the live mobile navigation functions without modifying browser data.
const begin = html.indexOf('function closeAppMenu(');
const end = html.indexOf("document.addEventListener('keydown'", begin);
assert(begin !== -1 && end > begin, 'Navigation functions not found');
const listenerEnd = html.indexOf('\n});', end) + 4;
assert(listenerEnd > end + 3, 'Keyboard handler not found');
const callbacks = {};
const state = new Set();
const attrs = {};
let focusTarget = null;
const first = { focus() { focusTarget = 'first module'; } };
const button = {
  setAttribute(key, value) { attrs[key] = value; },
  focus() { focusTarget = 'toggle'; }
};
const frame = {
  classList: {
    contains(name) { return state.has(name); },
    add(name) { state.add(name); },
    remove(name) { state.delete(name); }
  }
};
const elements = {
  appFrame: frame,
  'm360-mobile-app-menu': button,
  appNav: { querySelector(name) { return name === 'button' ? first : null; } }
};
const sandbox = {
  $: id => elements[id] || null,
  document: { addEventListener(name, handler) { callbacks[name] = handler; } }
};
vm.runInNewContext(html.slice(begin, end) + '\n' + html.slice(end, listenerEnd), sandbox);
sandbox.toggleAppMenu(button);
assert(state.has('menu-open'), 'Mobile navigation did not open');
assert.equal(attrs['aria-expanded'], 'true');
assert.equal(focusTarget, 'first module');
const esc = { key: 'Escape', prevented: false, preventDefault() { this.prevented = true; } };
callbacks.keydown(esc);
assert.equal(esc.prevented, true);
assert(!state.has('menu-open'), 'Escape did not close mobile navigation');
assert.equal(attrs['aria-expanded'], 'false');
assert.equal(focusTarget, 'toggle');
sandbox.toggleAppMenu(button);
sandbox.closeAppMenu();
assert(!state.has('menu-open'), 'Module navigation did not close');
console.log('PASS: browser script syntax, CRM control preservation, tenant guard, rule-based preview, mobile layout, navigation and keyboard handling');
