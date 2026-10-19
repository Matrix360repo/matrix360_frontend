const assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('login.html','utf8'),js=fs.readFileSync('client-access.js','utf8');
for(const id of ['approvalPanel','approvalRows','approvalStatus','refreshApprovals'])
 assert.match(html,new RegExp('id="'+id+'"'));
assert.match(js,/request\('\/admin\/registration-requests'\)/);
assert.match(js,/request\('\/admin\/registration-requests\/review','POST'/);
assert.match(js,/\['platform_owner','agency_admin'\]/);
assert.match(js,/approvalPanel'\)\.hidden=!isAdmin/);
assert.match(js,/\+\+approvalVersion/);
assert.match(js,/registration\?\.status==='pending'/);
assert.match(js,/window\.confirm/);
assert.doesNotMatch(js,/innerHTML\s*=/);
console.log('PASS: UI reviewer gate, pending state and DOM safety');
