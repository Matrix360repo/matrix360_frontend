'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const selection=require('../lib/m360-campaign-workspace');
const row=(id,extra={})=>({id:String(id),name:'Manufacturer '+id,industry:'manufacturers',location:'Pune',email:id+'@example.test',stage:'enquiry',...extra});
const answers={audience:'manufacturers',geography:'Pune',count:10,channels:['Email','LinkedIn']};

test('campaign brief keeps count, audience, geography, channel and explicit qualification',()=>{
 const result=selection.requirements('Find 10 manufacturers in Pune',{}, {qualification:'ISO 9001'});
 assert.equal(result.requested_count,10);assert.equal(result.audience,'manufacturers');assert.equal(result.geography,'Pune');assert.equal(result.qualification,'ISO 9001');
 assert.deepEqual(selection.requirements('Plan an email and LinkedIn product launch',{},answers).channels,['Email','LinkedIn']);
 assert.throws(()=>selection.requirements('Find 0 leads'),/between 1/);
});
test('CRM, reserved stages and verified candidates deduplicate and expose the shortfall',()=>{
 const brief=selection.requirements('Product launch',{},answers);
 const inventory=selection.audienceInventory([row(1),row(2),row(3),row(4,{stage:'reserved'}),row(5,{location:'Delhi'}),row(6,{email_opt_in_status:'unsubscribed'})],
   [row('duplicate',{email:'1@example.test'}),row(7),row(8)],brief);
 assert.equal(inventory.existing_count,3);assert.equal(inventory.saved_candidate_count,3);assert.equal(inventory.excluded_count,3);
 const selected=selection.selectAudience(inventory,inventory.candidates.map(item=>item.selection_id),10);
 assert.equal(selected.selected_count,6);assert.equal(selected.missing_count,4);
 assert.throws(()=>selection.selectAudience(inventory,['crm:foreign'],10),/changed, expired/);
 assert.throws(()=>selection.selectAudience(inventory,['crm:1','crm:1'],10),/distinct/);
 assert.equal(inventory.candidates.find(item=>item.pool==='verified_discovery').email_opt_in_status,'unknown');
});

test('missing contact placeholders do not collapse distinct CRM businesses',()=>{
 const candidates=[row(1,{email:'Not available',phone:'Not found',website:'N/A'}),row(2,{email:'Not available',phone:'Not found',website:'N/A'})];
 assert.equal(selection.deduplicate(candidates).length,2);
 assert.equal(selection.deduplicate([row(1,{phone:'+91 99999 99999'}),row(2,{phone:'919999999999'})]).length,1);
});
test('staged candidates are authenticated, workspace-bound, verified and expire',()=>{
 const leads=require('../lib/m360-leads-orchestrator-server');leads.resetOrchestratorStateForTests();
 const previous=process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY;const secret='synthetic-candidate-checkpoint-secret-only';process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY=secret;
 function token(record){const iv=crypto.randomBytes(12),key=crypto.createHash('sha256').update('m360-discovery-v1:'+secret).digest(),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const encrypted=Buffer.concat([cipher.update(JSON.stringify(record)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');}
 const record={campaign_id:'fixture-discovery',client_scope:'workspace-a',created_at_ms:Date.now(),maps_leads:[row(1,{relevance:{matched:true}}),row(2)],website_leads:[]};
 try{
  assert.equal(leads.savedCandidates('workspace-b',record.campaign_id,token(record)).length,0);
  assert.equal(leads.savedCandidates('workspace-a',record.campaign_id,token(record)).length,1);
  leads.resetOrchestratorStateForTests();assert.equal(leads.savedCandidates('workspace-a',record.campaign_id,token({...record,created_at_ms:Date.now()-21*60000})).length,0);
 }finally{leads.resetOrchestratorStateForTests();if(previous===undefined)delete process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY;else process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY=previous;}
});

test('review dispatch revalidates records, preserves exact references, restricts roles and retries without duplicate work',async()=>{
 const savedEnv={...process.env},oldFetch=global.fetch;
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'m360-campaign-review-'));
 Object.assign(process.env,{M360_MARKET_RESEARCH_STORE:path.join(directory,'research.json'),M360_MARKETING_AI_ENABLED:'false',M360_AI_TRIAL_SUPABASE_SERVICE_KEY:'synthetic-content-storage-secret-at-least-30'});
 delete process.env.M360_MARKETING_LOCAL_STORE_PATH;delete process.env.M360_MARKETING_DB_URL;delete process.env.OPENAI_API_KEY;
 const orchestrator=require('../lib/m360-marketing-orchestrator');orchestrator.resetTaskStoreForTests();
 const handler=require('../api/marketing');let role='client_admin',crmCalls=0;const requests=[];
 const poster='22222222-2222-4222-8222-222222222222';
 fs.writeFileSync(process.env.M360_MARKET_RESEARCH_STORE,JSON.stringify({'workspace-a':{id:'research-fixture',profile_version:3,created_at:'2026-11-06T00:00:00Z',research:{summary:'Sourced observation',uncertainties:['Planning assumption']},sources:['https://example.test/evidence']}}));
 global.fetch=async(url,options={})=>{
  requests.push(String(url));
  if(String(url).includes('/me/workspaces'))return {ok:true,json:async()=>[{id:'workspace-a',name:'Fictional Manufacturer',role}]};
  if(String(url).includes('m360_brand_profiles'))return {ok:true,json:async()=>[{version:3,profile:{business_name:'Fictional Manufacturer',industry:'Industrial manufacturing',products_services:['Industrial equipment'],approved_claims:['Synthetic approved claim'],target_audience:['manufacturers'],service_areas:['Pune']}}]};
  if(String(url).endsWith('/workspaces/workspace-a/leads')){crmCalls++;return {ok:true,json:async()=>[row(1),row(2),row(3),row(4),row(5),row(6)]};}
  if(String(url).includes('m360_poster_versions'))return {ok:true,json:async()=>[{poster_id:poster,version:2,channel:'LinkedIn',plan:{headline:'Synthetic saved creative'}}]};
  throw Error('Unexpected external request: '+url);
 };
 const call=async(action,body={},method='POST')=>{const response={setHeader(){},end(value){this.body=JSON.parse(value);}};await handler({method,url:'/api/marketing/'+action,headers:{authorization:'Bearer synthetic-session-at-least-20'},body:{workspace_id:'workspace-a',...body},query:method==='GET'?{workspace_id:'workspace-a',...body}:{}},response);return response;};
 try{
  const resources=await call('resources',{prompt:'Plan an email and LinkedIn launch for widgets',answers});assert.equal(resources.statusCode,200);assert.equal(resources.body.candidates.length,6);assert.equal(resources.body.research.id,'research-fixture');
  assert.equal(resources.body.assets[0].approval_state,'saved');
  const correlation_id=crypto.randomUUID(),body={prompt:'Plan an email and LinkedIn launch for widgets',answers,origin_module:'overview',correlation_id,idempotency_key:'review_'+correlation_id,
   reviewed_selection:{audience_ids:resources.body.candidates.map(item=>item.selection_id),asset_ids:[poster+':v2']},creative_briefs:[{channel:'Email',format:'copy',prompt:'Editable email brief'},{channel:'LinkedIn',format:'copy',prompt:'Editable LinkedIn brief'}]};
  role='viewer';const restricted=await call('resources',body);assert.equal(restricted.statusCode,200);assert.equal(restricted.body.can_write,false);assert.equal((await call('dispatch',body)).statusCode,403);role='client_admin';
  const bad=await call('dispatch',{...body,correlation_id:crypto.randomUUID(),reviewed_selection:{audience_ids:['crm:foreign'],asset_ids:[]}});assert.equal(bad.statusCode,422);
  assert.equal((await call('resources',{workspace_id:'workspace-b'})).statusCode,403);
  const first=await call('dispatch',body);assert.equal(first.statusCode,202);
  const withoutAssets=crypto.randomUUID();
  const fresh=await call('dispatch',{...body,correlation_id:withoutAssets,idempotency_key:'review_'+withoutAssets,reviewed_selection:{audience_ids:body.reviewed_selection.audience_ids,asset_ids:[]}});
  assert.equal(fresh.statusCode,202);
  assert.equal(orchestrator.getMarketingTask('workspace-a',withoutAssets).status,'draft_ready','A hosted response must retain execution until preparation finishes.');
  for(let attempt=0;attempt<30&&orchestrator.getMarketingTask('workspace-a',correlation_id).status!=='draft_ready';attempt++)await new Promise(resolve=>setImmediate(resolve));
  const task=orchestrator.getMarketingTask('workspace-a',correlation_id);
  assert.equal(task.status,'draft_ready',JSON.stringify(task.step_history.at(-1)));assert.equal(task.origin_module,'overview');assert.equal(task.audience_snapshot.total_count,6);assert.equal(task.audience_snapshot.missing_count,4);
  assert.deepEqual(Object.keys(task.channel_draft_versions).sort(),['Email','LinkedIn']);assert.equal(task.creative_briefs.length,2);
  assert.ok(task.artifact_refs.some(ref=>ref.id==='research-fixture'));assert.ok(task.artifact_refs.some(ref=>ref.id===poster+':v2'));
  const before=crmCalls;assert.equal((await call('dispatch',body)).body.correlation_id,correlation_id);assert.equal(crmCalls,before);
  const original=task.channel_draft_versions.Email.versions[0];task.status='failed';assert.equal((await call('retry',{correlation_id})).statusCode,202);assert.equal(task.channel_draft_versions.Email.versions[0],original);
  orchestrator.approveChannelDraft('workspace-a',correlation_id,'Email',original.version_hash,{role:'client_admin',id:'fixture-admin'});
  assert.equal((await call('resources',body)).body.assets[0].approval_state,'previously_approved');
  orchestrator.attachVerifiedHandoff('workspace-a',correlation_id,{verified:true,origin_module:'content',artifact_id:'new-creative',artifact_refs:[{kind:'poster',id:'different:v1',metadata:{poster_id:'different',version:1}}]});
  assert.equal(task.channel_draft_versions.Email.versions.at(-1).status,'draft_for_review');
  assert.notEqual(task.channel_draft_versions.Email.versions.at(-1).version_hash,original.version_hash);
  orchestrator.attachVerifiedHandoff('workspace-a',correlation_id,{verified:true,origin_module:'leads',artifact_id:'new-audience',contacts:[row(1)]});
  assert.equal(task.channel_draft_versions.Email.versions.at(-1).status,'draft_for_review');assert.notEqual(task.channel_draft_versions.Email.versions.at(-1).version_hash,original.version_hash);
  assert.ok(requests.every(url=>!/openai|campaign\/start|send|publish/.test(url)));
 }finally{global.fetch=oldFetch;orchestrator.resetTaskStoreForTests();for(const name of Object.keys(process.env))if(!(name in savedEnv))delete process.env[name];Object.assign(process.env,savedEnv);fs.rmSync(directory,{recursive:true,force:true});}
});
