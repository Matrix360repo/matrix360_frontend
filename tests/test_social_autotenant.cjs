'use strict';
/* Automatic tenant enrollment tests using a fully mocked network and synthetic CRM identities.
 * No real Render, Supabase, Tanmayi, emails, media or chargeable model calls.
 */
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const gateway=require('../api/creative.js');
const CRM='https://matrix360-crm-backend-p9os.onrender.com';
const SOCIAL='https://matrix360-socialmanager-recovery-staging.onrender.com';
const token='Bearer '+'t'.repeat(50);
const names=['M360_SOCIAL_WORKSPACE_MAP','M360_SOCIAL_OPERATOR_KEY','M360_SOCIAL_DIRECTOR_KEY',
  'M360_SOCIAL_AUTO_PROVISION','M360_SOCIAL_PLAN_APPROVED'];
const originals=Object.fromEntries(names.map(n=>[n,process.env[n]]));
const previousFetch=global.fetch;
function fake(status,data){return {status,headers:{get:k=>k==='content-type'?'application/json':null},
  text:async()=>JSON.stringify(data)}}
async function run(method,workspace,opts={}){
  const calls=[], clients=opts.clients||[],creations=[];
  let getCount=0;
  global.fetch=async(url,init={})=>{
    calls.push({url,method:init.method||'GET',headers:init.headers||{},body:init.body});
    if(url===CRM+'/me/workspaces')
      return fake(opts.crmStatus||200,opts.memberships||[
        {id:'crm_business_one',name:'First Synthetic Business'},
        {id:'crm_business_two',name:'Second Synthetic Business'}
      ]);
    if(url===SOCIAL+'/api/v2/clients'&&(init.method||'GET')==='GET'){
      getCount++;
      return fake(200,clients);
    }
    if(url===SOCIAL+'/api/v2/clients'&&init.method==='POST'){
      const item=JSON.parse(init.body);creations.push(item);
      assert.equal(init.headers['X-Matrix360-Key'],'FAKE_DIRECTOR_KEY_FOR_TESTS_ONLY');
      if(opts.conflict){
        clients.push(item);
        return fake(409,{detail:'Existing client'});
      }
      clients.push(item);
      return fake(201,item);
    }
    if(url===SOCIAL+'/api/capabilities')
      return fake(200,{status:'PARTIAL_RECONSTRUCTION'});
    if(url===SOCIAL+'/api/v2/creative-plan'){
      assert.equal(init.headers['X-Matrix360-Key'],'FAKE_OPERATOR_KEY_FOR_TESTS_ONLY');
      return fake(200,{subject:'Safe reviewed proposal',headlines:['One','Two','Three'],
        scenes:[{headline:'One',visual_subject:'descriptive footage'}],
        caption:'Client-specific review draft',cta:'Learn more',
        provider:'LIMITED_DETERMINISTIC_FALLBACK',semantic_ai_verified:false});
    }
    throw Error('Unexpected network destination '+url);
  };
  const output={headers:{},statusCode:0,data:null};
  const res={
    setHeader(k,v){output.headers[k]=v;},
    end(s){output.data=JSON.parse(s)},
    set statusCode(x){output.statusCode=x},get statusCode(){return output.statusCode}
  };
  const body=opts.body||{workspace_id:workspace,platform:'LinkedIn',
    prompt:'Explain practical warehouse logistics for regional distributors'};
  await gateway({method,headers:opts.noAuth?{}:{authorization:token},
    query:{workspace_id:workspace},body},res);
  return {output,calls,clients,creations,getCount};
}
async function main(){
  process.env.M360_SOCIAL_OPERATOR_KEY='FAKE_OPERATOR_KEY_FOR_TESTS_ONLY';
  process.env.M360_SOCIAL_DIRECTOR_KEY='FAKE_DIRECTOR_KEY_FOR_TESTS_ONLY';
  process.env.M360_SOCIAL_AUTO_PROVISION='yes';
  process.env.M360_SOCIAL_PLAN_APPROVED='yes';
  delete process.env.M360_SOCIAL_WORKSPACE_MAP;

  const one=await run('GET','crm_business_one');
  assert.equal(one.output.statusCode,200);
  assert.equal(one.output.data.creative_planning,true);
  assert.equal(one.output.data.client_provisioned,false);
  assert.equal(one.output.data.automatic_provisioning_available,true);
  assert.equal(one.creations.length,0,'GET never creates clients');

  const created=await run('POST','crm_business_one');
  assert.equal(created.output.statusCode,200);
  assert.equal(created.output.data.status,'review_only');
  assert.equal(created.creations.length,1);
  assert.equal(created.creations[0].name,'First Synthetic Business');
  assert.deepEqual(created.creations[0].approved_facts,[]);
  assert.equal(created.creations[0].approved_logo_path,'');
  const expected='m360-'+crypto.createHash('sha256').update(
    'matrix360-crm-tenant-v1:crm_business_one','utf8').digest('hex').slice(0,28);
  assert.equal(created.creations[0].id,expected);
  assert.match(expected,/^m360-[a-f0-9]{28}$/);
  const body=JSON.parse(created.calls.find(x=>x.url===SOCIAL+'/api/v2/creative-plan').body);
  assert.equal(body.client_id,expected);
  assert.equal(body.prompt,'Explain practical warehouse logistics for regional distributors');
  assert.ok(!JSON.stringify(created.output).includes('FAKE_DIRECTOR_KEY'));
  assert.ok(!JSON.stringify(created.output).includes('FAKE_OPERATOR_KEY'));
  assert.ok(created.calls.every(x=>x.url.startsWith(CRM)||x.url.startsWith(SOCIAL)));
  assert.ok(created.calls.every(x=>!x.url.includes('/reels')&&!x.url.includes('/campaigns')&&!x.url.includes('/images')));

  const repeated=await run('POST','crm_business_one',{clients:[...created.clients]});
  assert.equal(repeated.output.statusCode,200);
  assert.equal(repeated.creations.length,0,'existing client reused');

  const concurrent=await run('POST','crm_business_one',{conflict:true});
  assert.equal(concurrent.output.statusCode,200);
  assert.equal(concurrent.creations.length,1);
  assert.ok(concurrent.getCount>=2,'409 verified by subsequent client list');

  const other=await run('POST','crm_business_two');
  assert.equal(other.output.statusCode,200);
  assert.equal(other.creations.length,1);
  assert.notEqual(other.creations[0].id,expected);
  assert.equal(other.creations[0].name,'Second Synthetic Business');

  const nonmember=await run('POST','crm_business_three');
  assert.equal(nonmember.output.statusCode,403);
  assert.equal(nonmember.creations.length,0);
  assert.equal(nonmember.calls.length,1);
  const anonymous=await run('POST','crm_business_one',{noAuth:true});
  assert.equal(anonymous.output.statusCode,401);
  assert.equal(anonymous.calls.length,0);

  delete process.env.M360_SOCIAL_DIRECTOR_KEY;
  const pending=await run('GET','crm_business_one');
  assert.equal(pending.output.statusCode,503);
  assert.equal(pending.output.data.status,'not_configured');
  const none=await run('POST','crm_business_one');
  assert.equal(none.output.statusCode,503);
  assert.equal(none.creations.length,0);
  process.env.M360_SOCIAL_DIRECTOR_KEY='FAKE_DIRECTOR_KEY_FOR_TESTS_ONLY';

  process.env.M360_SOCIAL_PLAN_APPROVED='no';
  const unapproved=await run('POST','crm_business_one');
  assert.equal(unapproved.output.statusCode,503);
  assert.equal(unapproved.output.data.status,'approval_required');
  assert.equal(unapproved.creations.length,0);
  process.env.M360_SOCIAL_PLAN_APPROVED='yes';

  const pii=await run('POST','crm_business_one',{body:{
    workspace_id:'crm_business_one',platform:'LinkedIn',prompt:'Contact alice@example.com right now please'}});
  assert.equal(pii.output.statusCode,422);assert.equal(pii.creations.length,0);
  const badPlatform=await run('POST','crm_business_one',{body:{
    workspace_id:'crm_business_one',platform:'unsupported',prompt:'Show a safe business narrative for review'}});
  assert.equal(badPlatform.output.statusCode,422);assert.equal(badPlatform.creations.length,0);

  process.env.M360_SOCIAL_WORKSPACE_MAP=JSON.stringify({crm_business_one:'client-from-prior-approval'});
  const migrated=await run('POST','crm_business_one',{clients:[{id:'client-from-prior-approval',name:'First Synthetic Business'}]});
  assert.equal(migrated.output.statusCode,200);
  assert.equal(migrated.creations.length,0);
  assert.equal(JSON.parse(migrated.calls.find(x=>x.url===SOCIAL+'/api/v2/creative-plan').body).client_id,'client-from-prior-approval');
  process.env.M360_SOCIAL_WORKSPACE_MAP=JSON.stringify({crm_business_one:'matrix360-demo'});
  const rejectDemo=await run('POST','crm_business_one');
  assert.equal(rejectDemo.output.statusCode,503);
  assert.equal(rejectDemo.creations.length,0);

  console.log('PASS: automatic tenant derivation, first-use provisioning, idempotence, cross-tenant denial, approvals, migration and no-media safeguards');
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1}).finally(()=>{
 global.fetch=previousFetch;
 for(const key of names) {
   if(originals[key]===undefined)delete process.env[key];
   else process.env[key]=originals[key];
 }
});
