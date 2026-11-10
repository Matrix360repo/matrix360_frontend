'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {loadEmailCreative}=require('../lib/m360-content-assets-client');
const {buildSmtpMessage}=require('../lib/m360-smtp-client');
const engine=require('../lib/m360-marketing-orchestrator');
const {applySurgicalRevision}=require('../lib/m360-channel-versioner');
const poster='12345678-1234-4234-8234-123456789abc';
const jpeg=Buffer.alloc(6000,3);jpeg[0]=255;jpeg[1]=216;jpeg[2]=255;
const creative={poster_id:poster,version:1,sha256:createHash('sha256').update(jpeg).digest('hex'),caption:'Approved creative copy for review.',headline:'Approved campaign'};

test('Email uses the exact private branded file and refuses another tenant or missing final image',async()=>{
 const before=process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY;process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY='synthetic-private-storage-key-long-enough';
 const tenant='m360-'+createHash('sha256').update('matrix360-crm-tenant-v1:workspace-a').digest('hex').slice(0,28);
 let foreign=false,missing=false;
 const fetch=async url=>{
  assert.ok(url.includes(tenant),'Every lookup is tenant bound');
  if(url.includes('/rest/'))return {ok:true,json:async()=>[{image_path:(foreign?'another-tenant':tenant)+'/'+poster+'/1.jpg',plan:{caption:'Approved creative copy'}}]};
  assert.ok(url.endsWith('/1-final.jpg'));return {ok:!missing,headers:{get:()=>String(jpeg.length)},arrayBuffer:async()=>jpeg};
 };
 try{
  const result=await loadEmailCreative('workspace-a',poster,1,fetch);assert.equal(result.creative.sha256,creative.sha256);assert.deepEqual(result.image,jpeg);
  foreign=true;await assert.rejects(loadEmailCreative('workspace-a',poster,1,fetch),/unavailable for this workspace/);
  foreign=false;missing=true;await assert.rejects(loadEmailCreative('workspace-a',poster,1,fetch),/not saved yet/);
 }finally{if(before===undefined)delete process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY;else process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY=before;}
});

test('attaching a creative creates an unapproved Email version, binds its hash, and survives copy refinement',async()=>{
 engine.resetTaskStoreForTests();
 const task=await engine.dispatchMarketingTask(engine.createHandoverEnvelope({workspace_id:'workspace-a',payload:{prompt:'Prepare a campaign review',business_name:'Synthetic business',profile_type:'b2b_industrial',workspace_context:{profile:{website:'https://example.invalid/product',approved_claims:['Site visits by appointment.']}}}}),{keylessTestMode:true,audienceFixture:[],creativePlan:{test_data:true,caption:'Review this approved service'},skip_ai:true});
 for(let i=0;i<30&&task.status!=='draft_ready';i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(task.status,'draft_ready');
 const original=task.channel_draft_versions.Email.versions.at(-1);original.status='approved';
 assert.equal(original.website_url,'https://example.invalid/product');
 assert.match(original.body,/Site visits by appointment/);
 assert.ok(original.body.split('\n\n').length>=5);
 const other=JSON.stringify(task.channel_draft_versions.WhatsApp);
 engine.attachEmailCreative('workspace-a',task.correlation_id,creative);
 const attached=task.channel_draft_versions.Email.versions.at(-1);
 assert.equal(attached.status,'draft_for_review');assert.notEqual(attached.version_hash,original.version_hash);assert.deepEqual(attached.email_creative,creative);assert.ok(attached.body.includes(creative.caption));
 engine.attachEmailCreative('workspace-a',task.correlation_id,creative);assert.equal(task.channel_draft_versions.Email.versions.length,2);
 applySurgicalRevision(task.channel_draft_versions,'Shorten Email');
 const revised=task.channel_draft_versions.Email.versions.at(-1);assert.deepEqual(revised.email_creative,creative);assert.equal(revised.website_url,original.website_url);assert.equal(JSON.stringify(task.channel_draft_versions.WhatsApp),other);assert.equal(revised.status,'draft_for_review');
});

test('saved Content creative prepares the Email synchronously without another AI generation',async()=>{
 engine.resetTaskStoreForTests();
 const task=await engine.dispatchMarketingTask(engine.createHandoverEnvelope({workspace_id:'workspace-a',payload:{prompt:'Prepare this saved creative for review',business_name:'Synthetic business',profile_type:'b2b_industrial'}}),{keylessTestMode:true,audienceFixture:[],creativePlan:{verified_content_task_id:poster,subject:creative.headline,caption:creative.caption,headlines:[creative.headline]},emailCreative:creative,waitForDraft:true,skip_ai:true});
 assert.equal(task.status,'draft_ready');const draft=task.channel_draft_versions.Email.versions.at(-1);
 assert.equal(draft.email_creative.sha256,creative.sha256);assert.ok(draft.body.includes(creative.caption));assert.equal(draft.status,'draft_for_review');
 assert.equal(task.execution_history?.length||0,0);
});

test('email MIME embeds JPEG bytes inline without a public or expiring image URL',()=>{
 const message={from:'sender@example.invalid',to:'recipient@example.invalid',subject:'Review',text:'Review copy',html:'Review copy<img src="cid:m360-campaign-creative">',inlineImage:{cid:'m360-campaign-creative',content:jpeg}};
 const {data}=buildSmtpMessage({},message);
 assert.match(data,/multipart\/related/);assert.match(data,/multipart\/alternative/);assert.match(data,/Content-ID: <m360-campaign-creative>/);
 const encoded=data.split('Content-Disposition: inline; filename="campaign-creative.jpg"\r\n\r\n')[1].split(/\r\n--[^\r\n]+--/)[0];
 assert.deepEqual(Buffer.from(encoded.replace(/\r\n/g,''),'base64'),jpeg);
 assert.doesNotMatch(data,/supabase|source_url|blob:/);assert.doesNotMatch(buildSmtpMessage({}, {...message,inlineImage:undefined}).data,/multipart\/related/);
 assert.throws(()=>buildSmtpMessage({}, {...message,inlineImage:{cid:'bad\r\nheader',content:jpeg}}),/Invalid inline/);
});

test('private branded save reconciles lost acknowledgement and rejects a different immutable image',async()=>{
 const handler=require('../lib/m360-poster-history'),before=process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY,oldFetch=global.fetch;
 process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY='synthetic-private-storage-key-long-enough';
 const tenant='m360-'+createHash('sha256').update('matrix360-crm-tenant-v1:workspace-a').digest('hex').slice(0,28);let foreign=false;
 global.fetch=async(url,options)=>{
  if(url.endsWith('/me/workspaces'))return {ok:true,json:async()=>[{id:'workspace-a'}]};
  if(url.includes('/rest/'))return {ok:true,text:async()=>JSON.stringify([{image_path:tenant+'/'+poster+'/1.jpg'}])};
  assert.ok(url.includes(tenant+'/'+poster+'/1-final.jpg'));
  if(options.method==='POST')return {ok:false,status:503,text:async()=>''};
  return {ok:true,arrayBuffer:async()=>foreign?Buffer.alloc(6000):jpeg};
 };
 async function save(){const res={setHeader(){},end(value){this.body=JSON.parse(value);}};await handler({method:'POST',headers:{authorization:'Bearer synthetic-long-test-session-token'},body:{workspace_id:'workspace-a',action:'save-final',poster_id:poster,version:1,image_base64:jpeg.toString('base64')}},res);return res;}
 try{assert.equal((await save()).body.status,'final_saved');foreign=true;assert.match((await save()).body.message,/different branded image/);}
 finally{global.fetch=oldFetch;if(before===undefined)delete process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY;else process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY=before;}
});
