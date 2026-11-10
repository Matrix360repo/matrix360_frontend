'use strict';
/* DOM harness for the approved public page's injected account navigation.
   No network, credentials, customer data, or synthetic authentication bypass. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function element(tag, id = '') {
  return {
    tag, id, children: [], attributes: {}, href: '', className: '', textContent: '',
    setAttribute(name, value) { this.attributes[name] = String(value); },
    append(...nodes) { this.children.push(...nodes); },
    insertBefore(node, other) {
      const at = this.children.indexOf(other);
      assert.ok(at >= 0, 'insert target must exist');
      this.children.splice(at, 0, node);
    },
    querySelector(sel) { return sel === '.nav-cta' ? this.children.find(x => x.className === 'nav-cta') : null; }
  };
}
const nav = element('nav'), brand = element('a'), links = element('div', 'nav-links');
const cta = element('a'); cta.className = 'nav-cta';
const burger = element('button', 'nav-toggle');
nav.children.push(brand, links, cta, burger);
const footer = element('div'), head = element('head');
const elements = { 'nav-links': links };
const document = {
  head,
  createElement: tag => element(tag),
  getElementById: id => elements[id] || find(nav, id) || find(footer, id),
  querySelector: sel => {
    if (sel === '.nav-wrap .nav') return nav;
    if (sel === '.footer-columns > div:last-child') return footer;
    if (sel === '#plan-result .result-actions') return null;
    return null;
  }
};
function find(root, id) {
  if (root.id === id) return root;
  for (const node of root.children) { const found = find(node, id); if (found) return found; }
  return null;
}
const src = fs.readFileSync(path.join(root, 'matrix360-engagement.js'), 'utf8');
vm.runInNewContext(src, { document }, { timeout: 1500 });
const login = find(nav, 'm360-login-link'), dashboard = find(nav, 'm360-dashboard-link');
assert.ok(login && dashboard, 'Both public account navigation controls must exist');
assert.equal(login.href, 'login.html');
assert.equal(login.textContent, 'Log in');
assert.equal(dashboard.href, 'client-dashboard.html');
assert.equal(nav.children.indexOf(login) + 1, nav.children.indexOf(cta));
assert.ok(links.children.includes(dashboard), 'Dashboard must be in collapsible mobile navigation');
assert.ok(footer.children.some(x => x.href === 'login.html'));
assert.ok(footer.children.some(x => x.href === 'client-dashboard.html'));
assert.equal(head.children.length, 1);
const css = head.children[0].textContent;
assert.match(css, /max-width:640px/, 'Small-screen login button must remain visible');
assert.match(css, /m360-login-link/, 'Account link must use consistent design tokens');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(html.includes('id="nav-toggle"') && html.includes('id="nav-links"'));
assert.ok(html.includes('navLinks.classList.toggle(\'open\',open)'), 'Mobile menu remains functional');
const signin = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
assert.ok(signin.includes('href="client-dashboard.html"'));
assert.ok(signin.includes('id="signin"'));
assert.ok(signin.includes("API_BASE+'/auth/login'"), 'Existing login endpoint must be preserved');
const crm = fs.readFileSync(path.join(root, 'client-dashboard.html'), 'utf8');
assert.ok(crm.includes('id="denied"') && crm.includes('href="login.html"'));
console.log('PASS: 15 public/login/dashboard access and mobile-menu contracts');
