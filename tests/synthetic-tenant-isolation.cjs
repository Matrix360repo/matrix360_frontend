const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync('login.html','utf8'),js=fs.readFileSync('client-access.js','utf8');
function fixture(account){
 const dom=new JSDOM(html,{url:'https://example.test/login.html',runScripts:'outside-only'});
 const w=dom.window,d=w.document;
 w.HTMLElement.prototype.scrollIntoView=function(){};
 const calls=[];let visible=null;
 w.fetch=async(url,options={})=>{
  const p=new URL(url).pathname,m=options.method||'GET';
  calls.push(p);
  const respond=(s,value)=>({ok:s>=200&&s<300,status:s,async json(){return value;}});
  if(p==='/auth/login')return respond(200,{access_token:account+'-token'});
  if(p==='/me/workspaces')return respond(200,account==='unapproved'?[]:[{id:account,name:account,role:'client_admin'}]);
  if(p==='/auth/logout')return respond(200,{ok:true});
  if(p.startsWith('/workspaces/')){
    const tenant=p.split('/')[2]; if(tenant!==account)return respond(403,{detail:'Workspace access denied'});
    if(p.endsWith('/stages'))return respond(200,['enquiry']);
    if(p.endsWith('/leads'))return respond(200,[{id:1,name:account+' lead',stage:'enquiry'}]);
    if(p.endsWith('/channel-status'))return respond(200,{workspace_id:account,crm:{status:'connected'},channels:{}});
    if(p.endsWith('/assistant/ask'))return respond(200,{response_source:'authorized_crm',answer:'1 CRM lead',evidence:[{workspace_id:account}]});
  }
  return respond(404,{detail:'Unknown synthetic fixture'});
 };
 w.eval(js);return{dom,w,d,calls};
}
const pause=()=>new Promise(r=>setTimeout(r,25));
async function login(x){x.d.getElementById('userName').value='fixture@example.test';x.d.getElementById('password').value='test-fixture';x.d.getElementById('loginForm').dispatchEvent(new x.w.Event('submit',{cancelable:true}));await pause();}
(async()=>{
 const guest=fixture('lakhotia');
 assert.equal(guest.d.body.classList.contains('authed'),false);
 assert.equal(guest.d.getElementById('clientPanel').style.display,'');
 assert.deepEqual(guest.calls,[],'Guest cannot implicitly call private API');
 guest.dom.window.close();
 const denied=fixture('unapproved');await login(denied);
 assert.equal(denied.d.body.classList.contains('authed'),false,'No membership means no private dashboard');
 assert.equal(denied.calls.filter(x=>x.includes('/workspaces/')).length,1,'No private records read by unapproved user');
 denied.dom.window.close();
 const a=fixture('lakhotia');await login(a);
 assert.equal(a.d.querySelector('#leadRows').textContent.includes('lakhotia lead'),true);
 assert.equal(a.d.querySelector('#workspace option').value,'lakhotia');
 assert.ok(a.calls.every(p=>!p.includes('/workspaces/shree/')));
 a.dom.window.close();
 const b=fixture('shree');await login(b);
 assert.equal(b.d.querySelector('#leadRows').textContent.includes('shree lead'),true);
 assert.equal(b.d.querySelector('#leadRows').textContent.includes('lakhotia lead'),false);
 assert.ok(b.calls.every(p=>!p.includes('/workspaces/lakhotia/')));
 b.dom.window.close();
 console.log('PASS: guest, no-membership and isolated synthetic client sessions');
})().catch(e=>{console.error(e);process.exitCode=1;});
