'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const handler=require('../api/creative-media.js');
const BASE='https://matrix360-socialmanager-recovery-staging.onrender.com';
const CRM='https://matrix360-crm-backend-p9os.onrender.com';
const job='a8a7d2e1-8d26-46fe-a6dd-9d4cd058b661';
const token='Bearer '+'t'.repeat(50);
const name=['M360_SOCIAL_OPERATOR_KEY','M360_SOCIAL_DIRECTOR_KEY','M360_SOCIAL_AUTO_PROVISION',
 'M360_SOCIAL_PLAN_APPROVED','M360_SOCIAL_IMAGE_APPROVED','M360_SOCIAL_WORKSPACE_MAP'];
const original=Object.fromEntries(name.map(x=>[x,process.env[x]])),previous=global.fetch;
const derived='m360-'+crypto.createHash('sha256').update('matrix360-crm-tenant-v1:demo_business').digest('hex').slice(0,28);
let calls,registered;
function mock(status,data){return {status,headers:{get:k=>k==='content-type'?'application/json':null},text:async()=>JSON.stringify(data)}}
function network(opts){
 calls=[];registered=opts.registered?[{id:derived,name:'Demo Business'}]:[];
 global.fetch=async(url,init={})=>{
  calls.push({url,headers:init.headers||{},method:init.method||'GET',body:init.body});
  if(url===CRM+'/me/workspaces')
    return mock(opts.authStatus||200,opts.memberships||[{id:'demo_business',name:'Demo Business'}]);
  if(url===BASE+'/api/v2/clients'&&(init.method||'GET')==='GET')
    return mock(200,registered);
  if(url===BASE+'/api/v2/clients'&&init.method==='POST'){
    registered.push(JSON.parse(init.body));return mock(201,registered.at(-1));
  }
  if(url===BASE+'/api/v2/images/readiness')
    return mock(200,{ready_to_request:opts.imageReady===true});
  if(url===BASE+'/api/v2/reels'&&init.method==='POST')
    return mock(202,{id:job,status:'queued'});
  if(url===BASE+'/api/v2/images'&&init.method==='POST')
    return mock(202,{id:job,status:'queued'});
  if(url.startsWith(BASE+'/api/v2/reels/'+job+'?'))
    return mock(200,{status:opts.status||'completed',review_state:'not_reviewed',failure:'Renderer offline',result:opts.noQualityProof?{}:{professional_audio_verified:true,narration_provider:'fixture',music_license:'fixture',staging_storage:{status:'archived_in_separate_staging_only'}}});
  if(url.startsWith(BASE+'/api/v2/images/'+job+'?'))
    return mock(200,{status:opts.status||'completed',review_state:'not_reviewed'});
  if(url.startsWith(BASE+'/api/v2/reels/'+job+'/player?'))
    return mock(200,{player_url:'/api/v2/video/'+derived+'/'+job+'?token='+('1'.repeat(40))});
  if(url.startsWith(BASE+'/api/v2/images/'+job+'/player?'))
    return mock(200,{image_url:'/api/v2/image-file/'+derived+'/'+job+'?token='+('2'.repeat(40))});
  throw Error('Unexpected request '+url);
 };
}
async function invoke(method,kind='reel',opts={}){
 network(opts);
 const out={statusCode:null,headers:{},body:null};
 const res={setHeader:(k,v)=>out.headers[k]=v,end:s=>out.body=JSON.parse(s),
  get statusCode(){return out.statusCode;},set statusCode(x){out.statusCode=x;}};
 const ws=opts.ws||'demo_business';
 const req={method,headers:opts.noAuth?{}:{authorization:token},
  query:{workspace_id:ws,kind,job_id:job},
  body:{workspace_id:ws,kind,platform:'LinkedIn',
   prompt:'Show practical warehousing solutions for nearby manufacturers',confirm:true,...opts.body}};
 await handler(req,res);return {out,calls};
}
async function main(){
 for(const n of name)delete process.env[n];
 process.env.M360_SOCIAL_OPERATOR_KEY='TEST_ONLY_STAGING_OPERATOR_KEY';
 process.env.M360_SOCIAL_DIRECTOR_KEY='TEST_ONLY_SEPARATE_DIRECTOR_KEY';
 process.env.M360_SOCIAL_AUTO_PROVISION='yes';
 process.env.M360_SOCIAL_PLAN_APPROVED='yes';
 let r=await invoke('POST','reel',{noAuth:true});assert.equal(r.out.statusCode,401);assert.equal(r.calls.length,0);
 r=await invoke('POST','reel',{ws:'not_a_member'});assert.equal(r.out.statusCode,403);
 assert.equal(r.calls.length,1);
 r=await invoke('POST','reel',{authStatus:401});assert.equal(r.out.statusCode,401);
 r=await invoke('POST','reel');
 assert.equal(r.out.statusCode,202);
 assert.equal(r.out.body.job_id,job);
 assert.equal(registered.length,1);
 assert.equal(registered[0].id,derived);
 assert.deepEqual(registered[0].approved_facts,[]);
 assert.ok(r.calls.some(x=>x.url===BASE+'/api/v2/reels'&&JSON.parse(x.body).mode==='motion_graphics'));
 assert.ok(r.calls.every(x=>!x.url.includes('/campaigns')));
 assert.ok(!JSON.stringify(r.out.body).includes('DIRECTOR_KEY'));
 r=await invoke('GET','reel',{registered:true});assert.equal(r.out.statusCode,200);
 assert.equal(r.out.body.status,'completed');
 assert.equal(r.out.body.asset_url,BASE+'/api/v2/video/'+derived+'/'+job+'?token='+('1'.repeat(40)));
 r=await invoke('GET','reel',{registered:true,noQualityProof:true});
 assert.equal(r.out.statusCode,503);
 assert.equal(r.out.body.status,'reel_quality_gate_failed');
 assert.ok(!r.calls.some(call=>call.url.includes('/player?')));
 r=await invoke('GET','reel',{registered:true,status:'processing'});
 assert.equal(r.out.body.status,'processing');
 assert.equal(r.out.body.asset_url,null);
 r=await invoke('GET','reel',{registered:true,status:'failed'});
 assert.equal(r.out.body.status,'failed');assert.equal(r.out.body.asset_url,null);
 r=await invoke('POST','image',{registered:true});
 assert.equal(r.out.statusCode,503);assert.equal(r.out.body.status,'approval_required');
 assert.equal(r.calls.length,1);
 process.env.M360_SOCIAL_IMAGE_APPROVED='yes';
 r=await invoke('POST','image',{registered:true,imageReady:false});
 assert.equal(r.out.statusCode,503);assert.equal(r.out.body.status,'provider_unavailable');
 r=await invoke('POST','image',{registered:true,imageReady:true});
 assert.equal(r.out.statusCode,202);
 assert.ok(r.calls.some(x=>x.url===BASE+'/api/v2/images'&&x.method==='POST'));
 r=await invoke('GET','image',{registered:true});
 assert.equal(r.out.statusCode,200);
 assert.ok(r.out.body.asset_url.includes('/api/v2/image-file/'+derived+'/'+job));
 r=await invoke('POST','reel',{body:{confirm:false}});
 assert.equal(r.out.statusCode,422);assert.equal(r.calls.length,1);
 r=await invoke('POST','reel',{body:{prompt:'Call me at 9888888888'}});
 assert.equal(r.out.statusCode,422);assert.equal(r.calls.length,1);
 process.env.M360_SOCIAL_PLAN_APPROVED='no';
 r=await invoke('POST','reel');assert.equal(r.out.statusCode,503);assert.equal(r.calls.length,1);
 console.log('PASS: real media job gateway tenant auth, explicit requests, provider approval and signed playback contracts');
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1}).finally(()=>{
 global.fetch=previous;
 for(const n of name){if(original[n]===undefined)delete process.env[n];else process.env[n]=original[n];}
});
