'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {leadSearchContext,workspaceContext,profileSnapshot}=require('../lib/m360-workspace-context');
const {campaignClarifications}=require('../lib/m360-campaign-clarifications');
const engine=require('../lib/m360-leads-orchestrator-server');
const response=()=>({statusCode:200,setHeader(){},end(raw){this.body=JSON.parse(raw);}});
const json=(data,status=200)=>({status,ok:status<400,json:async()=>data,text:async()=>JSON.stringify(data),headers:{get(){return null;}}});

test('clarification context retains prospect type and requires explicit geography',()=>{
 assert.equal(leadSearchContext('Find 10 prospects for my business.').missing,'Type of prospects or industry focus');
 assert.equal(leadSearchContext('Find 10 prospects for my business.\nType of prospects or industry focus: dental').missing,'Target location for prospect search');
 assert.deepEqual(leadSearchContext('Find 10 prospects for my business.\nType of prospects or industry focus: dental\nTarget location for prospect search: Kolkata'),{query:'dental',location:'Kolkata',missing:null});
 assert.equal(leadSearchContext('Find 10 prospects in Kolkata').missing,'Type of prospects or industry focus');
});

test('shared profile snapshots stay workspace-scoped, versioned and exclude arbitrary fields',async()=>{
 const old=process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY;process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY='sb_secret_synthetic_workspace_key_for_test';
 const fetcher=async url=>{
  const tenant='m360-'+createHash('sha256').update('matrix360-crm-tenant-v1:alpha').digest('hex').slice(0,28);
  const alpha=url.includes(tenant);return json([{version:alpha?3:9,profile:{business_name:alpha?'Alpha':'Beta',industry:'Dental',website_research:'Unverified research',approved_claims:['Reviewed claim'],api_key:'must not propagate'}}]);
 };
 try{
  const alpha=await workspaceContext('alpha',{name:'Alpha'},fetcher),beta=await workspaceContext('beta',{name:'Beta'},fetcher);
  assert.equal(alpha.profile_version,3);assert.equal(beta.profile_version,9);assert.equal(alpha.business_name,'Alpha');assert.equal(beta.business_name,'Beta');assert.equal(alpha.research_is_unverified,true);assert.doesNotMatch(JSON.stringify(alpha),/must not propagate|sb_secret/);
 }finally{if(old===undefined)delete process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY;else process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY=old;}
});

test('missing storage is reported as unavailable context rather than an invented profile',async()=>{
 const old=process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY;delete process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY;
 try{const context=await workspaceContext('alpha',{name:'Alpha'},()=>{throw Error('No storage request should occur');});assert.equal(context.profile_status,'unavailable');assert.equal(context.profile,null);}finally{if(old!==undefined)process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY=old;}
});

test('campaign clarification policy reuses Company Details and never exceeds seven questions',()=>{
 const complete=profileSnapshot({business_name:'Alpha',products_services:['Service A'],target_audience:['Manufacturers'],service_areas:['Kolkata'],campaign_objectives:['Qualified enquiries'],campaign_duration:'30 days',campaign_budget:'INR 50,000'});
 assert.deepEqual(campaignClarifications('I want to launch a marketing campaign for my business.',complete),[]);
 const missing=campaignClarifications('I want to launch a paid marketing campaign for my business.',{});
 assert.ok(missing.length<=7);assert.ok(missing.length>=5);
 const first=missing[0];
 assert.ok(!campaignClarifications(`I want to launch a paid marketing campaign.\n${first}: Qualified enquiries`,{}).includes(first));
});

test('discovery rejects anonymous users, viewer mutations and unknown workspace membership',async()=>{
 const handler=engine.createUnifiedLeadsHandler(async()=>json([{id:'alpha',name:'Alpha',role:'viewer'}]));
 for(const [headers,workspace,status] of [[{},'alpha',401],[{authorization:'Bearer synthetic-token-for-auth-tests'},'beta',403],[{authorization:'Bearer synthetic-token-for-auth-tests'},'alpha',403]]){
  const res=response();await handler({method:'POST',headers,query:{},body:{workspace_id:workspace,prompt:'Find 10 dentists in Kolkata'}},res);assert.equal(res.statusCode,status);
 }
});

test('Website does not guess a client profile from a company name or browser client_id',async()=>{
 engine.resetOrchestratorStateForTests();const old=process.env.M360_WEBSITE_WORKSPACE_MAP;delete process.env.M360_WEBSITE_WORKSPACE_MAP;
 let campaigns=0;
 const handler=engine.createUnifiedLeadsHandler(async url=>{
  if(url.endsWith('/me/workspaces'))return json([{id:'alpha',name:'Lakhotia Industrial Complex',role:'client_admin'}]);
  if(url.endsWith('/api/scraper/run'))return json({job_id:'synthetic-map-job'});
  if(url.endsWith('/api/campaign/start'))campaigns++;
  throw Error('No Website action should occur without a trusted profile link');
 });
 try{const res=response();await handler({method:'POST',headers:{authorization:'Bearer synthetic-token-for-auth-tests'},query:{},body:{workspace_id:'alpha',client_id:'lakhotia',prompt:'Find 10 dentists in Kolkata'}},res);assert.equal(campaigns,0);assert.equal(res.body.engines.website.error_code,'WEBSITE_PROFILE_NOT_LINKED');assert.equal(res.body.engines.maps.status,'running');}finally{if(old!==undefined)process.env.M360_WEBSITE_WORKSPACE_MAP=old;}
});

test('verified Lakhotia workspace uses its explicit approved Website link and requested count',async()=>{
 engine.resetOrchestratorStateForTests();let started;
 const handler=engine.createUnifiedLeadsHandler(async(url,options={})=>{
  if(url.endsWith('/me/workspaces'))return json([{id:'lakhotia',name:'Lakhotia Industrial Complex',role:'client_admin'}]);
  if(url.includes('supabase.co'))return json([]);
  if(url.endsWith('/api/scraper/run'))return json({job_id:'maps_link_test'});
  if(url.endsWith('/api/v1/auth/bootstrap'))return json({token:'synthetic_website_session'});
  if(url.endsWith('/api/campaign/profile/lakhotia'))return json({id:'lakhotia'});
  if(url.endsWith('/api/campaign/start')){started=JSON.parse(options.body);return json({job_id:'website_link_test'});}
  throw Error('Unexpected URL');
 });
 const res=response();await handler({method:'POST',headers:{authorization:'Bearer synthetic-session-for-link-test'},query:{},body:{workspace_id:'lakhotia',prompt:'Find 10 manufacturers in Kolkata'}},res);
 assert.equal(started.client_id,'lakhotia');assert.equal(started.target_count,30);assert.equal(res.body.target_limit,10);assert.equal(res.body.engines.website.status,'running');
});
