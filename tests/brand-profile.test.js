'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

function response(){
 const state={statusCode:200,body:null};
 return {state,get statusCode(){return state.statusCode},set statusCode(value){state.statusCode=value},setHeader(){},end(value){state.body=JSON.parse(value)}};
}

test('private logo signature works on the installed Node runtime without weakening URL validation',async()=>{
 const oldKey=process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY,oldFetch=global.fetch;
 process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY='sb_secret_synthetic_key_for_signature_test';
 const id='12345678-1234-1234-1234-123456789012';
 const tenant='m360-'+require('node:crypto').createHash('sha256').update('matrix360-crm-tenant-v1:19').digest('hex').slice(0,28),object=tenant+'/'+id+'.png';
 let malicious=false;
 global.fetch=async url=>{
  if(url.endsWith('/me/workspaces'))return {ok:true,json:async()=>[{id:19,name:'Synthetic Company'}]};
  return {ok:true,text:async()=>JSON.stringify(url.includes('/object/sign/')?{signedURL:(malicious?'https://evil.example':'')+'/object/sign/matrix360-brand-assets/'+object+'?token=synthetic_signature_long_enough'}:[{object_path:object}])};
 };
 try{const handler=require('../api/brand'),req={method:'GET',headers:{authorization:'Bearer synthetic-session-for-signature-test'},query:{workspace_id:'19',action:'signed',asset_id:id}};
  const valid=response();await handler(req,valid);assert.equal(valid.state.statusCode,200);assert.ok(valid.state.body.asset_url.startsWith('https://pmlacujsnnvbrimxbhpu.supabase.co/storage/v1/'));
  malicious=true;const invalid=response();await handler(req,invalid);assert.notEqual(invalid.state.statusCode,200);
 }finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY;else process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY=oldKey;}
});

test('brand profile accepts the same numeric CRM workspace ID sent by the browser as text',async()=>{
 const oldKey=process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY;
 const oldFetch=global.fetch;
 process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY='sb_secret_test_key_long_enough_for_gateway';
 let call=0;
 global.fetch=async()=>{
  call++;
  if(call===1)return {ok:true,status:200,json:async()=>[{id:19,name:'Northstar Industrial Complex'}]};
  return {ok:true,status:200,text:async()=> '[]'};
 };
 delete require.cache[require.resolve('../api/brand')];
 try{
  const handler=require('../api/brand');
  const res=response();
  await handler({method:'GET',headers:{authorization:'Bearer abcdefghijklmnopqrstuvwxyz.123456'},query:{workspace_id:'19',action:'profile'}},res);
  assert.equal(res.state.statusCode,200);
  assert.equal(res.state.body.workspace_id,'19');
  assert.equal(res.state.body.business_name,'Northstar Industrial Complex');
  assert.equal(res.state.body.version,0);
 }finally{
  global.fetch=oldFetch;
  if(oldKey===undefined)delete process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY;else process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY=oldKey;
  delete require.cache[require.resolve('../api/brand')];
 }
});

test('configured storage saves reviewed research through the versioned durable RPC; viewers cannot save',async()=>{
 const oldKey=process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY,oldFetch=global.fetch;
 process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY='sb_secret_synthetic_storage_key_for_local_test';
 let role='client_admin',writes=0;
 global.fetch=async(url,options)=>{
  if(url.endsWith('/me/workspaces'))return {ok:true,status:200,json:async()=>[{id:19,name:'Synthetic Company',role}]};
  assert.ok(url.endsWith('/rest/v1/rpc/m360_brand_save'));writes++;
  const input=JSON.parse(options.body);assert.equal(input.p_expected_version,2);assert.equal(input.p_profile.website_research,'Reviewed website notes');
  return {ok:true,status:200,text:async()=>JSON.stringify([{version:3,profile:input.p_profile,updated_at:'2026-10-31T00:00:00Z'}])};
 };
 try{
  const handler=require('../api/brand'),req={method:'POST',headers:{authorization:'Bearer synthetic.authorized.session.123456'},body:{workspace_id:'19',action:'save',expected_version:2,profile:{business_name:'Synthetic Company',website_research:'Reviewed website notes'}}};
  const saved=response();await handler(req,saved);assert.equal(saved.state.statusCode,200);assert.equal(saved.state.body.version,3);assert.equal(writes,1);
  role='viewer';const denied=response();await handler(req,denied);assert.equal(denied.state.statusCode,403);assert.equal(writes,1);
 }finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY;else process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY=oldKey;}
});
