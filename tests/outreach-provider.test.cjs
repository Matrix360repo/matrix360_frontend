'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

test('workspace writers can verify SMTP without acquiring approval or sending permissions',async()=>{
 const orchestratorPath=require.resolve('../lib/m360-marketing-orchestrator'),apiPath=require.resolve('../api/marketing');
 const original=require(orchestratorPath),previousApi=require.cache[apiPath],oldFetch=global.fetch;
 let role='sales_operator',calls=0,result={verified:true,status:'verified_connected'};
 require.cache[orchestratorPath].exports={...original,verifyMarketingProvider:async()=>{calls++;return result;},executeMarketingChannel:async()=>assert.fail('Verification must never execute a channel')};
 delete require.cache[apiPath];
 global.fetch=async()=>({status:200,ok:true,json:async()=>[{id:'workspace-a',role,name:'Example'}]});
 const handler=require('../api/marketing');
 async function call(action,body={},authorization='Bearer synthetic-session-token-long-enough'){
  const res={statusCode:200,setHeader(){},end(data){this.data=JSON.parse(data);}};
  await handler({method:'POST',url:'/api/marketing/'+action,headers:{authorization},body:{workspace_id:'workspace-a',provider:'email',...body},query:{}},res);
  return res;
 }
 try{
  const verified=await call('providers/verify');assert.equal(verified.statusCode,200);assert.equal(verified.data.verified,true);assert.equal(calls,1);
  for(const action of ['approve','execute'])assert.equal((await call(action)).statusCode,403);
  role='viewer';assert.equal((await call('providers/verify')).statusCode,403);
  role='sales_operator';assert.equal((await call('providers/verify',{workspace_id:'another-workspace'})).statusCode,403);
  assert.equal((await call('providers/verify',{},'')).statusCode,401);assert.equal(calls,1);
  result={verified:false,status:'configured_unverified',error:'SMTP_AUTHENTICATION_REJECTED'};
  const rejected=await call('providers/verify');assert.equal(rejected.statusCode,412);assert.equal(rejected.data.code,'SMTP_AUTHENTICATION_REJECTED');assert.equal(calls,2);
 }finally{
  require.cache[orchestratorPath].exports=original;global.fetch=oldFetch;
  if(previousApi)require.cache[apiPath]=previousApi;else delete require.cache[apiPath];
 }
});

test('an approved Email can request an allowlisted test without a manual connection check',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../lib/m360-marketing-client.browser.js'),'utf8');
 const start=source.indexOf('  function testBlocker()');
 const end=source.indexOf('  function renderTestReadiness()',start);
 const draft={status:'approved',version:1};
 const context={liveSendingEnabled:true,activeTask:{channel_draft_versions:{Email:{versions:[draft]}}},$:()=>({value:'test@example.com'})};
 vm.runInNewContext(source.slice(start,end),context);
 assert.equal(context.testBlocker(),'');
 context.liveSendingEnabled=false;
 assert.match(context.testBlocker(),/Sending is disabled/);
 context.liveSendingEnabled=true;
 draft.status='draft_for_review';
 assert.match(context.testBlocker(),/Approve Email/);
 assert.doesNotMatch(source,/Check Brevo connection/);
});

test('disabled sending blocks execution before task lookup or provider access',async()=>{
 const handler=require('../api/marketing'),oldFetch=global.fetch,oldFlag=process.env.MARKETING_LIVE_SEND_ENABLED;
 process.env.MARKETING_LIVE_SEND_ENABLED='false';let calls=0;
 global.fetch=async()=>{calls++;return {ok:true,status:200,json:async()=>[{id:'workspace-a',role:'client_admin'}]};};
 try{
  const res={statusCode:200,setHeader(){},end(body){this.data=JSON.parse(body);}};
  await handler({method:'POST',url:'/api/marketing/execute',query:{},headers:{authorization:'Bearer synthetic-disabled-send-session'},body:{workspace_id:'workspace-a',correlation_id:'fixture-task',channel:'Email',mode:'live'}},res);
  assert.equal(res.statusCode,412);assert.equal(res.data.code,'LIVE_SEND_BLOCKED');assert.equal(calls,1);
 }finally{global.fetch=oldFetch;if(oldFlag===undefined)delete process.env.MARKETING_LIVE_SEND_ENABLED;else process.env.MARKETING_LIVE_SEND_ENABLED=oldFlag;}
});

test('Outreach labels preserve existing campaign routes and navigation keys',()=>{
 const router=fs.readFileSync(path.join(__dirname,'../lib/m360-multipage-router.js'),'utf8');
 assert.match(router,/title: 'Outreach'/);assert.match(router,/data-m360-goto="marketing">Outreach</);
 assert.match(router,/hashes: \['#marketing'/);
 new vm.Script(require('../lib/m360-control-client'));
 new vm.Script(require('../lib/m360-marketing-client'));
});

test('Outreach initializes after the asynchronous CRM workspace load',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../lib/m360-marketing-client.browser.js'),'utf8');
 const start=source.indexOf("    document.addEventListener('m360:crm-loaded'");
 const end=source.indexOf("    $('workspace')?.addEventListener",start);
 let loaded;const requests=[],label={textContent:''};
 vm.runInNewContext(source.slice(start,end),{document:{addEventListener(event,fn){loaded=fn;}},ws:()=> 'workspace-a',$:()=>label,getActiveClientInfo:()=>({clientName:'Example Workspace'}),activeTask:null,loadSavedTaskForWorkspace:id=>requests.push(id)});
 loaded({detail:{workspace:'another-workspace'}});assert.equal(requests.length,0);
 loaded({detail:{workspace:'workspace-a'}});assert.deepEqual(requests,['workspace-a']);assert.equal(label.textContent,'Example Workspace');
});

test('overview queue uses workspace approval access and only the latest channel version', async () => {
 const handler = require('../api/marketing');
 const { restoreMarketingTask } = require('../lib/m360-marketing-orchestrator');
 const originalFetch = global.fetch;
 const workspace = 'overview-approval-fixture';
 const task = {
  workspace_id: workspace,
  correlation_id: '11111111-1111-4111-8111-111111111111',
  status: 'draft_ready',
  channel_draft_versions: {
   Email: { versions: [{ status: 'approved' }, { status: 'draft_for_review' }] },
   WhatsApp: { versions: [{ status: 'draft_for_review' }, { status: 'approved' }] }
  }
 };
 restoreMarketingTask(task);
 restoreMarketingTask({ ...task, workspace_id: 'different-workspace', correlation_id: '22222222-2222-4222-8222-222222222222' });
 let role = 'marketing_operator';
 global.fetch = async url => {
  assert.match(url, /\/me\/workspaces$/);
  return { ok: true, json: async () => [{ id: workspace, role }] };
 };
 async function list(workspaceId) {
  const res = { statusCode: 200, setHeader() {}, end(body) { this.data = JSON.parse(body); } };
  await handler({
   method: 'GET',
   url: '/api/marketing/tasks',
   query: { workspace_id: workspaceId, overview: '1' },
   headers: { authorization: 'Bearer synthetic-overview-fixture-session' }
  }, res);
  return res;
 }
 try {
  const reviewer = await list(workspace);
  assert.equal(reviewer.statusCode, 200);
  assert.equal(reviewer.data.can_review, true);
  assert.deepEqual(reviewer.data.tasks.map(item => [item.correlation_id, item.review_channels]), [[task.correlation_id, ['Email']]]);
  role = 'viewer';
  const restricted = await list(workspace);
  assert.equal(restricted.data.can_review, false);
  assert.deepEqual(restricted.data.tasks[0].review_channels, []);
  assert.equal((await list('different-workspace')).statusCode, 403);
 } finally {
  global.fetch = originalFetch;
 }
});

test('the loopback Email grant requires the designated private login and workspace', async t => {
 const gateway = require('../api/gateway');
 const marketing = require('../api/marketing');
 const environment = {
  VERCEL_ENV: 'production',
  M360_MARKETING_CONTROLLED_TEST_ONLY: 'true',
  M360_MARKETING_TEST_WORKSPACE: 'lakhotia',
  M360_MARKETING_OWNER_DIRECT_EMAIL: 'true',
  M360_ROMIT_ORIGINAL_SCRAPER_PREVIEW_KEY: 'synthetic-test-cookie-secret-of-at-least-32-characters',
  M360_CLIENT_PREVIEW_USERNAME: 'local-reviewer@example.test'
 };
 const prior = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
 Object.assign(process.env, environment);
 t.after(() => {
  for (const [key, value] of Object.entries(prior)) {
   if (value === undefined) delete process.env[key];
   else process.env[key] = value;
  }
 });
 const token = 'synthetic-loopback-email-session';
 t.mock.method(global, 'fetch', async url => {
  if (url.endsWith('/auth/login')) return new Response(JSON.stringify({ access_token: token, expires_in: 600 }));
  assert.match(url, /\/me\/workspaces$/);
  return new Response(JSON.stringify([{ id: 'lakhotia', role: 'sales_operator' }, { id: 'other', role: 'sales_operator' }]));
 });
 const response = () => ({ statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.data = JSON.parse(body); } });
 const login = response();
 await gateway({method:'POST', headers:{}, query:{kind:'crm',path:'auth/login'}, body:{username:environment.M360_CLIENT_PREVIEW_USERNAME}}, login);
 const cookie = login.headers['Set-Cookie'][0].split(';')[0];
 async function approval({ local = true, channel = 'Email', workspace = 'lakhotia', includeCookie = true, bearer = token } = {}) {
  const res = response();
  await marketing({
   method: 'POST', url: '/api/marketing/approve', matrix360Loopback: local,
   headers: { authorization: 'Bearer ' + bearer, ...(includeCookie && { cookie }) },
   query: {}, body: { workspace_id: workspace, channel, correlation_id: 'no-such-draft', version_hash: 'fixture' }
  }, res);
  return res.statusCode;
 }
 assert.equal(await approval(), 404);
 assert.equal(await approval({ local: false }), 403);
 assert.equal(await approval({ includeCookie: false }), 403);
 assert.equal(await approval({ bearer: 'synthetic-other-bearer-session' }), 403);
 assert.equal(await approval({ workspace: 'other' }), 403);
 assert.equal(await approval({ channel: 'WhatsApp' }), 403);
 const summary = response();
 await marketing({method:'GET',url:'/api/marketing/tasks',matrix360Loopback:true,
  headers:{authorization:'Bearer '+token,cookie},query:{workspace_id:'lakhotia',overview:'1'}},summary);
 assert.equal(summary.statusCode,200);
 assert.equal(summary.data.can_review,true);
});
