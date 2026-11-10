'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=name=>fs.readFileSync(path.join(__dirname,'../frontend-source',name),'utf8');
test('sign-in retains POST credentials and gives direct FAQ, main heading and independent appearance controls',()=>{
 const html=source('login.html');assert.match(html,/<form id="signin" method="post" autocomplete="on">/);assert.match(html,/<h1 id="form-title" tabindex="-1">/);assert.match(html,/href="index.html#faq"/);assert.doesNotMatch(html,/try the demo dashboard/);assert.match(html,/name="darkreader-lock"/);assert.match(html,/matrix360-auth-theme\.css/);
 const handoff=source('matrix360-login-handoff.js');assert.match(handoff,/must be activated before you can sign in/);
});
test('both sign-in palettes have readable body, helper, action and error colors',()=>{
 const css=source('matrix360-auth-theme.css');const lum=hex=>{const c=hex.match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
 for(const block of css.matchAll(/\{color-scheme:[^}]+\}/g)){const colors=Object.fromEntries([...block[0].matchAll(/--auth-([a-z-]+):#([\da-f]{6})/g)].map(m=>[m[1],m[2]]));for(const bg of ['bg','panel','soft'])for(const fg of ['text','muted','accent'])assert.ok(contrast(colors[bg],colors[fg])>=4.5,fg+' on '+bg);assert.ok(contrast(colors.error,colors['error-bg'])>=4.5);}
 assert.ok(contrast('ffffff','076f65')>=4.5);
});
