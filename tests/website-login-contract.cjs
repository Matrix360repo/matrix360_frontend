const fs = require('node:fs');
const assert = require('node:assert/strict');
const pages = ['index.html','platform.html','solutions.html','pricing.html','app.html'];
for (const file of pages) {
 const html=fs.readFileSync(file,'utf8');
 assert.match(html,/href="login\.html" aria-label="Sign in to your private Matrix 360 client workspace"/,file+' needs a visible sign-in link');
 assert.doesNotMatch(html,/href="app\.html">Enter workspace/,file+' must not direct client login to guest demo');
 assert.match(html,/href="app\.html"/,file+' must preserve demo navigation');
}
const login=fs.readFileSync('login.html','utf8');
const vercel=JSON.parse(fs.readFileSync('vercel.json','utf8'));
assert.ok(vercel.rewrites.some(r=>r.source==='/'&&r.destination==='/login.html'),'site root must be login-first');
assert.match(login,/href="index\.html">Continue as a guest/,'guest must be able to explore public site');
assert.match(login,/id="clientPanel"/,'authorized dashboard must remain separate');
console.log('Website client-login entry regression checks passed');
