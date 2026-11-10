'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../frontend-source/matrix360-public.js'), 'utf8');

test('access hash, signup query and tab clicks use the same heading initializer',()=>{
 const login=fs.readFileSync(path.join(__dirname,'../frontend-source/matrix360-login-handoff.js'),'utf8');
 for(const location of [{hash:'#request-access',search:''},{hash:'',search:'?mode=signup'},{hash:'',search:''}]){
  const fields={'form-title':{},'form-desc':{}},events={};
  const window={switchTab(which){window.selected=which;fields['form-title'].textContent=which==='login'?'Sign in':'Legacy access title';},addEventListener(name,handler){events[name]=handler;}};
  vm.runInNewContext(login,{window,location,document:{getElementById:id=>fields[id]},URLSearchParams,sessionStorage:{getItem:()=>null}});
  if(location.hash||location.search){assert.equal(window.selected,'signup');assert.equal(fields['form-title'].textContent,'Request a client workspace');assert.doesNotMatch(fields['form-desc'].textContent,/paused/);}
  window.switchTab('login');assert.equal(fields['form-title'].textContent,'Sign in');
  window.switchTab('signup');assert.equal(fields['form-title'].textContent,'Request a client workspace');
  location.hash='#request-access';events.hashchange();assert.equal(window.selected,'signup');
 }
});

function fixture({ saved = null, dark = false, blocked = false } = {}) {
  const media = {}, events = {}, documentEvents = {}, frames = [], stored = new Map();
  if (saved) stored.set('m360-public-theme', saved);
  function element() {
    return { attributes: {}, children: [], events: {}, properties: {},
      dataset: {}, classList: { add() {} },
      style: { setProperty(key, value) { this.owner.properties[key] = value; } },
      setAttribute(key, value) { this.attributes[key] = value; },
      getAttribute(key) { return this.attributes[key]; },
      append(child) { this.children.push(child); },
      addEventListener(key, fn) { this.events[key] = fn; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 1200, height: 720 }; }
    };
  }
  const root = element(), host = element(), nav = element(), meta = element();
  host.style.owner = host;
  const document = {
    documentElement: root, readyState: 'loading', hidden: false,
    querySelector(selector) { return selector === '.nav' ? nav : selector === '.hero-art' ? host : selector.startsWith('meta') ? meta : null; },
    querySelectorAll() { return [host]; },
    getElementById() { return { before(button) { nav.append(button); } }; },
    createElement: element,
    addEventListener(key, fn) { documentEvents[key] = fn; }
  };
  const environment = { document, innerWidth: 1280, innerHeight: 720,
    localStorage: {
      getItem(key) { if (blocked) throw Error('Storage unavailable'); return stored.get(key) || null; },
      setItem(key, value) { if (blocked) throw Error('Storage unavailable'); stored.set(key, value); }
    },
    matchMedia(query) {
      return media[query] = { matches: query.includes('color-scheme') ? dark : query.includes('pointer: fine'), addEventListener(key, fn) { this.change = fn; } };
    },
    addEventListener(key, fn) { events[key] = fn; },
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; }
  };
  vm.runInNewContext(source, environment);
  documentEvents.DOMContentLoaded();
  const flush = () => { while (frames.length) frames.shift()(); };
  flush();
  return { root, host, nav, meta, document, environment, media, events, documentEvents, stored, flush };
}

test('public theme follows the system and shares the saved workspace appearance preference', () => {
  const f = fixture({ dark: true });
  assert.equal(f.root.dataset.m360PublicTheme, 'dark');
  const button = f.nav.children[0];
  assert.equal(button.attributes.role, 'switch');
  assert.equal(button.attributes['aria-checked'], 'true');
  button.events.click();
  assert.equal(f.root.dataset.m360PublicTheme, 'light');
  assert.equal(f.stored.get('m360-public-theme'), 'light');
  assert.equal(f.stored.get('m360-theme'), 'light');
  f.media['(prefers-color-scheme: dark)'].change();
  assert.equal(f.root.dataset.m360PublicTheme, 'light');
  assert.equal(fixture({ saved: 'light', dark: true }).root.dataset.m360PublicTheme, 'light');
  f.events.storage({ key: 'm360-theme', newValue: 'dark' });
  assert.equal(button.attributes['aria-checked'], 'true');
  assert.equal(f.meta.attributes.content, '#08171f');
  f.events.storage({ key: 'm360-theme', newValue: 'light' });
  assert.equal(f.root.dataset.m360PublicTheme, 'light');
  const noStorage = fixture({ blocked: true });
  noStorage.nav.children[0].events.click();
  assert.equal(noStorage.root.dataset.m360PublicTheme, 'dark');
  assert.equal(fixture({ saved: 'invalid' }).root.dataset.m360PublicTheme, 'light');
});

test('pointer scenery clamps its travel, recenters on leave and stops for reduced motion, pause, touch and small screens', () => {
  const f = fixture();
  const move = (x, y, pointerType = 'mouse') => { f.host.events.pointermove({ clientX: x, clientY: y, pointerType }); f.flush(); };
  move(5000, -5000);
  assert.equal(f.host.properties['--pub-pointer-x'], '48px');
  assert.equal(f.host.properties['--pub-pointer-y'], '-36px');
  f.host.events.pointerleave(); f.flush();
  assert.equal(f.host.properties['--pub-pointer-x'], '0px');
  move(1200, 720, 'touch');
  assert.equal(f.host.properties['--pub-pointer-x'], '0px');
  move(1200, 720);
  f.media['(prefers-reduced-motion: reduce)'].matches = true;
  f.media['(prefers-reduced-motion: reduce)'].change(); f.flush();
  assert.equal(f.host.properties['--pub-pointer-x'], '0px');
  assert.equal(f.host.properties['--pub-scroll-y'], '0px');
  move(1200, 720);
  assert.equal(f.host.properties['--pub-pointer-x'], '0px');
  f.media['(prefers-reduced-motion: reduce)'].matches = false;
  f.media['(prefers-reduced-motion: reduce)'].change();
  f.documentEvents.click({ target: { closest() { return { getAttribute() { return 'true'; } }; } } }); f.flush();
  move(1200, 720);
  assert.equal(f.root.dataset.m360PublicMotionPaused, 'true');
  assert.equal(f.host.properties['--pub-pointer-x'], '0px');
  f.documentEvents.click({ target: { closest() { return { getAttribute() { return 'false'; } }; } } });
  f.environment.innerWidth = 390; f.events.resize(); f.flush();
  move(1200, 720);
  assert.equal(f.host.properties['--pub-scroll-y'], '0px');
  assert.equal(f.host.properties['--pub-pointer-x'], '0px');
});

test('public palette meets normal-text contrast in both themes', () => {
  const css = fs.readFileSync(path.join(__dirname, '../frontend-source/matrix360-public.css'), 'utf8');
  function luminance(hex) {
    const values = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
  }
  const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  for (const theme of ['light', 'dark']) {
    const block = css.match(new RegExp('html\\[data-m360-public-theme="' + theme + '"\\] \\{([^}]+)'))[1];
    const colors = Object.fromEntries([...block.matchAll(/--pub-([a-z-]+):#([a-f\d]{6})/g)].map(match => [match[1], match[2]]));
    for (const background of ['bg', 'surface', 'soft']) for (const text of ['text', 'muted', 'accent']) assert.ok(contrast(colors[text], colors[background]) >= 4.5, `${theme}: ${text} on ${background}`);
    assert.ok(contrast(colors['on-accent'], colors.accent) >= 4.5, `${theme}: button contrast`);
  }
});
