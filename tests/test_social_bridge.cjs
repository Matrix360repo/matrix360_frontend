'use strict';
/* Fake-network security contract for the server-side Creative Studio adapter.
 * Tests never contact CRM, social staging, Supabase or external APIs.
 */
const assert=require('node:assert/strict');
const handler=require('../api/creative.js');
const CRM='https://matrix360-crm-backend-p9os.onrender.com',SOCIAL='https://matrix360-socialmanager-recovery-staging.onrender.com';
const bearer='Bearer '+'a'.repeat(40);
const origFetch=global.fetch, origMap=process.env.M360_SOCIAL_WORKSPACE_MAP, origSecret=process.env.M360_SOCIAL_OPERATOR_KEY, origApproval=process.env.M360_SOCIAL_PLAN_APPROVED;
function mockResponse(status,data,contentType='application/json'){
 return {status,headers:{get:k=>k.toLowerCase()==='content-type'?contentType:null},
   text:async()=>JSON.stringify(data)};
}
async function invoke(method,ws,opts={}){
 const calls=[];
 global.fetch=async(url,options={})=>{
   calls.push({url,method:options.method||'GET',headers:options.headers||{},body:options.body});
   if(url===CRM+'/me/workspaces')
     return mockResponse(opts.crmStatus||200,opts.memberships??[{id:'biz_alpha',name:'Alpha',role:'client_admin'}]);
   if(url===SOCIAL+'/api/v2/clients')
     return mockResponse(opts.clientsStatus||200,opts.clients??[{id:'client-alpha',name:'Client A'}]);
   if(url===SOCIAL+'/api/capabilities')
     return mockResponse(200,{status:'PARTIAL_RECONSTRUCTION'});
   if(url===SOCIAL+'/api/v2/creative-plan')
     return mockResponse(opts.planStatus||200,opts.plan??{subject:'Industrial content',caption:'Review this',
       headlines:['a','b','c'],scenes:[{headline:'a',visual_subject:'warehouse'}],
       provider:'LIMITED_DETERMINISTIC_FALLBACK',semantic_ai_verified:false,cta:'Learn more'});
   throw Error('Unexpected endpoint '+url);
 };
 let result={headers:{},statusCode:0,payload:null};
 const res={
  setHeader(k,v){result.headers[k]=v;},
  end(s){result.payload=JSON.parse(s);},
  get statusCode(){return result.statusCode;},
  set statusCode(v){result.statusCode=v;}
 };
 const source=opts.body??{workspace_id:ws,prompt:'Explain warehouse logistics benefits for a distributor',platform:'LinkedIn'};
 const req={method,headers:opts.noAuth?{}:{authorization:bearer},
   query:{workspace_id:ws},body:source};
 await handler(req,res);
 return {result,calls};
}
async function main(){
 let x=await invoke('GET','biz_alpha',{noAuth:true});
 assert.equal(x.result.statusCode,401);assert.equal(x.calls.length,0);
 x=await invoke('GET','bad/path');assert.equal(x.result.statusCode,400);assert.equal(x.calls.length,0);
 x=await invoke('GET','biz_not_mine');assert.equal(x.result.statusCode,403);
 assert.equal(x.calls.length,1);assert.ok(x.calls[0].url.startsWith(CRM));
 x=await invoke('GET','biz_alpha',{crmStatus:401});assert.equal(x.result.statusCode,401);
 delete process.env.M360_SOCIAL_OPERATOR_KEY;
 x=await invoke('GET','biz_alpha');assert.equal(x.result.statusCode,503);assert.equal(x.result.payload.status,'not_configured');
 process.env.M360_SOCIAL_OPERATOR_KEY='CI_FAKE_SERVER_ONLY_CREATIVE_KEY';
 process.env.M360_SOCIAL_PLAN_APPROVED='yes';
 process.env.M360_SOCIAL_WORKSPACE_MAP=JSON.stringify({biz_alpha:'client-alpha'});
 x=await invoke('GET','biz_alpha',{clients:[]});
 assert.equal(x.result.statusCode,503);assert.equal(x.result.payload.status,'not_configured');
 x=await invoke('GET','biz_alpha');assert.equal(x.result.statusCode,200);
 assert.equal(x.result.payload.status,'connected_review_only');
 assert.equal(x.result.payload.motion_reel_available,true);assert.equal(x.result.payload.media_generation,true);assert.equal(x.result.payload.publishing,false);
 assert.equal(x.result.payload.creative_planning,true);
 assert.ok(x.calls.some(c=>c.url===SOCIAL+'/api/capabilities'));
 assert.ok(x.calls.filter(c=>c.url.startsWith(SOCIAL)).every(c=>c.headers['X-Matrix360-Key']==='CI_FAKE_SERVER_ONLY_CREATIVE_KEY'));
 assert.ok(x.calls.filter(c=>c.url.startsWith(SOCIAL)).every(c=>!JSON.stringify(c.headers).includes(bearer)));
 process.env.M360_SOCIAL_PLAN_APPROVED='no';
 x=await invoke('POST','biz_alpha');assert.equal(x.result.statusCode,503);assert.equal(x.result.payload.status,'approval_required');
 assert.equal(x.calls.length,1);
 process.env.M360_SOCIAL_PLAN_APPROVED='yes';
 x=await invoke('POST','biz_alpha');assert.equal(x.result.statusCode,200);
 assert.equal(x.result.payload.status,'review_only');
 assert.equal(x.result.payload.generation,'limited_prompt_derived');
 const echoedContext='Saved context research is unverified';
 const leakedPlan={provider:'LIMITED_DETERMINISTIC_FALLBACK',subject:echoedContext,caption:echoedContext,headlines:[echoedContext],scenes:[{headline:echoedContext}],cta:echoedContext};
 const email={workspace_id:'biz_alpha',platform:'Email',prompt:'Introduce our warehouse services to distributors.'};
 const fallback=await invoke('POST','biz_alpha',{body:email,plan:leakedPlan});
 assert.equal(fallback.result.statusCode,200);
 assert.equal(fallback.result.payload.channel_draft.channel,'Email');
 assert.equal(fallback.result.payload.channel_draft.source,'Matrix360 starter template');
 assert.ok(fallback.result.payload.channel_draft.body.includes('Regards,\nAlpha'));
 assert.ok(!JSON.stringify(fallback.result.payload).includes(echoedContext));
 const verified=await invoke('POST','biz_alpha',{body:email,plan:{
   provider:'CONFIGURED_SEMANTIC_MODEL',semantic_ai_verified:true,
   subject:'Warehouse services for distributors',headlines:['Warehouse services for distributors'],
   caption:'Discuss your warehouse requirements with our team.',cta:'Request a consultation'
 }});
 assert.equal(verified.result.payload.generation,'configured_model');
 assert.equal(verified.result.payload.channel_draft.subject,'Warehouse services for distributors');
 assert.ok(x.calls.some(c=>c.url===SOCIAL+'/api/v2/creative-plan'&&c.method==='POST'));
 assert.ok(x.calls.every(c=>!c.url.includes('reels')&&!c.url.includes('campaigns')&&!c.url.includes('image')));
 for(const prompt of ['Contact me at user@example.org','Call 9876543210','Visit https://example.com','x'.repeat(901)]){
   x=await invoke('POST','biz_alpha',{body:{workspace_id:'biz_alpha',platform:'LinkedIn',prompt}});
   assert.equal(x.result.statusCode,422);assert.equal(x.calls.length,1);
 }
 x=await invoke('POST','biz_alpha',{body:{workspace_id:'biz_alpha',platform:'Other',prompt:'A safe objective for review'}});
 assert.equal(x.result.statusCode,422);assert.equal(x.calls.length,1);
 x=await invoke('POST','biz_not_mine',{body:{workspace_id:'biz_not_mine',platform:'LinkedIn',prompt:'A safe objective for review'}});
 assert.equal(x.result.statusCode,403);assert.equal(x.calls.length,1);
 x=await invoke('POST','biz_alpha',{planStatus:503});assert.equal(x.result.statusCode,503);
 x=await invoke('GET','biz_alpha',{crmStatus:500});assert.equal(x.result.statusCode,503);
 assert.equal(x.result.headers['Cache-Control'],'private, no-store');
 console.log('PASS: 23 tenant auth, server-secret, client-mapping, no-media, non-sensitive plan assertions');
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>{
 global.fetch=origFetch;
 if(origMap===undefined)delete process.env.M360_SOCIAL_WORKSPACE_MAP;else process.env.M360_SOCIAL_WORKSPACE_MAP=origMap;
 if(origSecret===undefined)delete process.env.M360_SOCIAL_OPERATOR_KEY;else process.env.M360_SOCIAL_OPERATOR_KEY=origSecret;
 if(origApproval===undefined)delete process.env.M360_SOCIAL_PLAN_APPROVED;else process.env.M360_SOCIAL_PLAN_APPROVED=origApproval;
});
