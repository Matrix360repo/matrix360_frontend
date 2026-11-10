'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {bootstrap,showcaseClient}=require('../lib/m360-showcase');
function browser(){
 const data=new Map(),events={};let calls=0;
 const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
 const context={window:{fetch:()=>{calls++;throw Error('Unexpected network');}},location:{href:'http://localhost/client-dashboard.html',origin:'http://localhost'},sessionStorage:storage,document:{addEventListener:(n,f)=>events[n]=f},Response,URL,DOMException};
 vm.runInNewContext('('+showcaseClient.toString()+')()',context);
 return {fetch:context.window.fetch,context,storage,get calls(){return calls;}};
}
test('showcase is opt-in; disabled bootstrap clears only its synthetic session',()=>{
 const old=process.env.M360_SHOWCASE_ENABLED;
 try{
  delete process.env.M360_SHOWCASE_ENABLED;assert.doesNotMatch(bootstrap(),/window.fetch=/);
  const b=browser();vm.runInNewContext(bootstrap().replace(/^<script>|<\/script>$/g,''),b.context);assert.equal(b.storage.getItem('matrix360_pilot_token'),null);
  b.storage.setItem('matrix360_pilot_token','real-session');vm.runInNewContext(bootstrap().replace(/^<script>|<\/script>$/g,''),b.context);assert.equal(b.storage.getItem('matrix360_pilot_token'),'real-session');
  process.env.M360_SHOWCASE_ENABLED='true';assert.match(bootstrap(),/Fictional data/);
 }finally{if(old===undefined)delete process.env.M360_SHOWCASE_ENABLED;else process.env.M360_SHOWCASE_ENABLED=old;}
});
test('demo profile and CRM edits remain browser-local and reject invalid versions',async()=>{
 const b=browser();const request=(url,body)=>b.fetch(url,body?{method:'POST',body:JSON.stringify(body)}:{});
 assert.equal((await(await request('/api/crm/me/workspaces')).json())[0].id,'showcase');
 const profile=await(await request('/api/brand')).json();assert.equal(profile.assets.length,0);
 const body={action:'save',expected_version:profile.version,profile:{business_name:'Fictional updated company'}};
 assert.equal((await request('/api/brand',body)).status,200);assert.equal((await request('/api/brand',body)).status,409);
 await request('/api/crm/workspaces/showcase/leads',{name:'Sample added lead',stage:'enquiry'});
 assert.equal((await(await request('/api/crm/workspaces/showcase/leads')).json()).length,4);
 assert.equal((await(await request('/api/control-center',{message:'Find one lead'})).json()).engine_handover.required,false);
 assert.equal(b.calls,0);
});
test('showcase cannot call a real workspace, provider, upload or publishing endpoint',async()=>{
 const b=browser();
 for(const url of ['/api/crm/workspaces/lakhotia/leads','/api/ai-post','/api/unified-leads-agent','/api/marketing/send','https://example.com/private']){
  const response=await b.fetch(url,{method:'POST',body:'{}'});assert.equal(response.status,403);assert.match((await response.json()).message,/Showcase mode/);
 }
 assert.equal(b.calls,0);
 const cancel=new AbortController();cancel.abort();await assert.rejects(b.fetch('/api/control-center',{signal:cancel.signal}),{name:'AbortError'});
});
test('login redirect can be disabled without deleting the real sign-in form',async()=>{
 const handler=require('../api/creative-integrated'),old=process.env.M360_SHOWCASE_ENABLED;
 async function page(mode,file){const headers={};let output='';const res={statusCode:200,setHeader:(k,v)=>headers[k]=v,getHeader:k=>headers[k],removeHeader:k=>delete headers[k],end:chunk=>output=String(chunk||'')};await handler({method:'GET',query:{mode,file}},res);return {status:res.statusCode,headers,output};}
 try{
  process.env.M360_SHOWCASE_ENABLED='true';const redirect=await page('page','login.html');assert.equal(redirect.status,302);assert.equal(redirect.headers.Location,'/client-dashboard.html');
  assert.match((await page('dashboard')).output,/window.fetch=/);
  process.env.M360_SHOWCASE_ENABLED='false';const login=await page('page','login.html');assert.equal(login.status,200);assert.match(login.output,/<form id="signin"/);
  assert.doesNotMatch((await page('dashboard')).output,/window.fetch=/);
 }finally{if(old===undefined)delete process.env.M360_SHOWCASE_ENABLED;else process.env.M360_SHOWCASE_ENABLED=old;}
});
