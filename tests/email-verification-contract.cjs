const assert=require('node:assert/strict'),fs=require('node:fs');
const page=fs.readFileSync('login.html','utf8'),script=fs.readFileSync('client-access.js','utf8');
for (const id of ['resendForm','resendEmail','resendButton','resendStatus']) assert.match(page,new RegExp('id="'+id+'"'));
assert.match(script,/request\('\/auth\/resend-verification','POST',\{email\}\)/);
assert.match(script,/reply\?\.status!=='request_received'/);
assert.match(page,/Email delivery may be limited until Matrix 360 configures its sending domain/);
assert.match(script,/\$\('loginForm'\)\.onsubmit/);
assert.match(script,/\$\('registerForm'\)\.onsubmit/);
console.log('Email recovery form and existing login/signup contracts pass');
