'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const handler=require('../lib/m360-market-research');
const research={summary:'Observed public competitor positioning',audience_industry:'Manufacturers',audience_location:'Howrah',audience_rationale:'Industrial customer fit',competitor_findings:['Public service offers reviewed'],content_trends:['Clear service-led visuals'],creative_brief:'Create one original Email visual for approved industrial services. Treat the site as conceptual.',recommendations:['Investigate logistics access before expansion'],uncertainties:['No transaction prices verified']};
test('strategy visuals chart comparable reported acres and expose the selected campaign action',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../lib/m360-research-client.js'),'utf8');
 function node(tag,text){return {tag,text,children:[],style:{},attributes:{},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(k,v){this.attributes[k]=v;},addEventListener(event,fn){this[event]=fn;}};}
 const context={node};vm.runInNewContext(source.slice(source.indexOf(' function strategyVisuals('),source.indexOf(' function render(')),context);
 const root=node('div');context.strategyVisuals(root,{...research,competitor_findings:['Alpha: over 100 acres of industrial land','Beta: 1,000 acres of infrastructure','Gamma: 20 bighas'],recommendations:['Build a website','Offer a virtual tour']});
 const all=element=>[element,...element.children.flatMap(all)];const elements=all(root);
 const bars=elements.filter(e=>e.style.width);assert.deepEqual(bars.map(e=>e.style.width),['10%','100%']);
 assert.ok(elements.some(e=>e.text==='over 100 acres'));assert.ok(!elements.some(e=>e.text==='20 acres'));
 const buttons=elements.filter(e=>e.tag==='button');buttons[1].click();
 assert.equal(buttons[1].attributes['aria-pressed'],'true');assert.equal(buttons[0].attributes['aria-pressed'],'false');
 assert.ok(all(root).some(e=>e.text==='Measure requests for details and site visits.'));
});
test('research brief cannot forward invented property claims or fake documentary directions to Content',()=>{
 const brief=handler._test.groundedBrief({...research,creative_brief:'Photograph the completed 800 bigha site and promise guaranteed returns.'});
 assert.doesNotMatch(brief,/800 bigha|promise guaranteed returns/);assert.match(brief,/saved approved company facts/);assert.match(brief,/never present generated imagery as actual site photography/);assert.match(brief,/Clear service-led visuals/);assert.ok(brief.length<=2300);
});
test('research citations remain outside the creative prompt accepted by the Content privacy gate',()=>{
 const brief=handler._test.groundedBrief({...research,content_trends:['Reference https://www.example.com/a and www.example.org; contact person@example.com.']});
 assert.doesNotMatch(brief,/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,})/i);assert.match(brief,/see research sources/);
});
test('projection arithmetic uses supplied assumptions and never invents missing economics',()=>{
 const forecast=handler._test.forecast;
 assert.equal(forecast({}).status,'inputs_required');
 const value=forecast({investment_budget:'100',unit_sale_value:'50',unit_delivery_cost:'10',expected_conversion_rate:'20'},10);
 assert.equal(value.rows[1].expected_clients,2);assert.equal(value.rows[1].net_profit,-20);
 assert.equal(forecast({investment_budget:'0',unit_sale_value:'0',unit_delivery_cost:'0',expected_conversion_rate:'0'}).rows[1].net_profit,0);
 assert.equal(forecast({investment_budget:'0',unit_sale_value:'1',unit_delivery_cost:'0',expected_conversion_rate:'101'}).status,'inputs_required');
});
test('research is workspace-authorized, source-backed and survives reload without trusting browser profile data',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-research-')),file=path.join(directory,'report.json');
 const names=['M360_MARKET_RESEARCH_STORE','M360_AI_TRIAL_SUPABASE_SERVICE_KEY','OPENAI_API_KEY','M360_OPENAI_SPEND_APPROVED'];const previous=Object.fromEntries(names.map(n=>[n,process.env[n]]));const oldFetch=global.fetch;
 Object.assign(process.env,{M360_MARKET_RESEARCH_STORE:file,M360_AI_TRIAL_SUPABASE_SERVICE_KEY:'synthetic-storage-key-at-least-30-characters',OPENAI_API_KEY:'synthetic-openai-key',M360_OPENAI_SPEND_APPROVED:'yes'});
 let role='client_admin',sources=true,profile={industry:'Industrial',description:'Approved services',service_areas:['Howrah']},calls=0;
 let primaryCount=5,retryFails=false,emptyBatches=0;
 const batches=[];
 const source='https://example.com/industry',replacementSource='https://example.org/alternatives';
 const candidates=(names,url)=>names.map(name=>({observation:name+': offers industrial plots for manufacturers in Howrah. '+url,evidence:[{dimension:'Industrial plots',quote:'industrial plots for manufacturers',source_url:url}]}));
 const primary=candidates(['First','Second','Third','Fourth','Fifth'],source);
 const weak={observation:'Weak: general claims without a comparable offering.',evidence:[]};
 const replacement=candidates(['Reserve A','Reserve B','Reserve C','Reserve D','Reserve E'],replacementSource);
 global.fetch=async(url,options)=>{
  if(url.includes('/me/workspaces'))return {ok:true,json:async()=>[{id:'workspace-a',role}]};
  if(url.includes('m360_brand_profiles'))return {ok:true,json:async()=>[{version:2,profile}]};
  assert.equal(url,'https://api.openai.com/v1/responses');calls++;const request=JSON.parse(options.body);assert.equal(request.tools[0].type,'web_search');assert.doesNotMatch(JSON.stringify(request),/forged-secret-profile/);
  const isRetry=request.text.format.name==='competitor_replacements';
  const batch=isRetry?JSON.parse(request.input[1].content[0].text):null;
  if(batch)batches.push(batch);
  if(isRetry&&retryFails)return {ok:false,status:503};
  const failedCandidate={observation:'Reserve without proof '+batch?.batch+': Offers not documented.',evidence:[]};
  const entries=isRetry?(batch.batch<=emptyBatches?[weak,failedCandidate]:primaryCount?[primary[0],...replacement.slice(0,3),weak]:replacement):[weak,...primary.slice(0,primaryCount)];
  const fields={competitor_findings:entries.map(item=>item.observation)};
  const dimensions=['Industrial plots'];
  const payload=isRetry?{...fields,dimensions,competitors:entries}:{...research,...fields,presentation:{geography_rationale:'Howrah is the approved market.',dimensions,competitors:entries,messages:[],actions:[],quantitative:[],synthesis:{decision:'',gaps:[]}}};
  if(batch?.batch===1)assert.deepEqual(batch.excluded_companies,['Weak']);
  return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(payload),annotations:sources?[{url:isRetry?replacementSource:source}]:[]}]}]})};
 };
 async function call(method,workspace='workspace-a',auth=true){const res={setHeader(){},end(s){this.data=JSON.parse(s);}};await handler({method,headers:{authorization:auth?'Bearer synthetic-session-long-enough':''},query:{workspace_id:workspace},body:{workspace_id:workspace,message:'Prepare an industrial campaign',profile:'forged-secret-profile'}},res);return res;}
 try{
  assert.equal((await call('POST','workspace-a',false)).statusCode,401);
  assert.equal((await call('POST','another-workspace')).statusCode,403);
  role='viewer';assert.equal((await call('POST')).statusCode,403);assert.equal(calls,0);role='client_admin';
  const saved=await call('POST');assert.equal(saved.statusCode,201);assert.equal(saved.data.report.profile_version,2);assert.equal(saved.data.report.forecast.status,'inputs_required');
  assert.equal(calls,1);
  assert.deepEqual(saved.data.report.research.competitor_findings,primary.map(item=>item.observation));
  assert.equal((await call('GET')).data.report.id,saved.data.report.id);
  primaryCount=2;
  const repaired=await call('POST');assert.equal(repaired.statusCode,201);
  assert.equal(calls,3);
  assert.deepEqual(repaired.data.report.research.competitor_findings,[primary[0],...replacement.slice(0,3),primary[1]].map(item=>item.observation));
  primaryCount=0;emptyBatches=2;
  const fresh=await call('POST');assert.equal(fresh.statusCode,201);
  assert.deepEqual(fresh.data.report.research.competitor_findings,replacement.map(item=>item.observation));
  assert.equal(fresh.data.report.comparison_search.replacement_batches,3);
  assert.deepEqual(batches.at(-1).excluded_companies,['Weak','Reserve without proof 1','Reserve without proof 2']);
  emptyBatches=0;primaryCount=2;
  retryFails=true;
  const partial=await call('POST');assert.equal(partial.statusCode,201);
  assert.deepEqual(partial.data.report.research.competitor_findings,primary.slice(0,2).map(item=>item.observation));
  primaryCount=0;
  const empty=await call('POST');assert.equal(empty.statusCode,201);
  assert.deepEqual(empty.data.report.research.competitor_findings,[]);
  assert.deepEqual(empty.data.report.comparison_fallback.research.competitor_findings,partial.data.report.research.competitor_findings);
  assert.deepEqual((await call('GET')).data.report.comparison_fallback,empty.data.report.comparison_fallback);
  sources=false;assert.equal((await call('POST')).statusCode,422);assert.equal((await call('GET')).data.report.id,empty.data.report.id);
  profile={};assert.equal((await call('POST')).statusCode,409);
 }finally{global.fetch=oldFetch;for(const name of names)if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];fs.rmSync(directory,{recursive:true,force:true});}
});
test('Email review submits the displayed version even if a newer draft exists',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../lib/m360-research-client.js'),'utf8');
 const start=source.indexOf(' async function emailReview(');
 const end=source.indexOf(" document.addEventListener('m360:company-ready'",start);
 const buttons={},requests=[];
 const node=(tag,text)=>({style:{},textContent:text,append(){},addEventListener(_,fn){buttons[text]=fn;}});
 let current='shown-draft';
 const api=async(url,body)=>{
  if(url.startsWith('/api/marketing/tasks?'))return {task:{status:'draft_ready',channel_draft_versions:{Email:{versions:[{subject:current,version_hash:current,status:'draft_for_review'}]}}}};
  requests.push([url,body.version_hash]);
  throw Error('Draft changed.');
 };
 const review=new Function('node','$','workspace','token','api',source.slice(start,end)+';return emailReview;')(
  node,()=>node('div'),()=> 'test-workspace',()=> 'test-session',api);
 await review('task','test-workspace','test-session');
 current='unseen-draft';
 await buttons['Approve this exact Email draft']();
 assert.deepEqual(requests,[['/api/marketing/approve','shown-draft']]);
});

for(const failed of [false,true])test('Control Center chains research filters, unchanged lead agent, research creative and Outreach without sending; failed='+failed,async()=>{
 const elements=new Map(),events={},steps=[];
 function element(tag){return {children:[],style:{},dataset:{},classList:{add(){}},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},focus(){},setAttribute(){},addEventListener(name,fn){if(tag==='button'&&name==='click'&&this.textContent?.startsWith('Send to '))queueMicrotask(fn);},closest(){return null;},set id(v){this._id=v;elements.set(v,this);},get id(){return this._id;}};}
 for(const id of ['verified','m360-control-output','workspace']){const e=element();e.id=id;if(id==='workspace')e.value='workspace-a';}
 const document={readyState:'complete',createElement:element,getElementById:id=>elements.get(id)||null,querySelector:()=>null,addEventListener:(name,fn)=>events[name]=fn,dispatchEvent(){},head:element('head')};
 const window={M360LeadsSubAgent:{executeFromMasterAgent:async prompt=>{steps.push('leads');await events['m360:crm-loaded']({detail:{workspace:'workspace-a'}});assert.match(prompt,/Manufacturers/);assert.match(prompt,/Howrah/);return {leads:[{id:'genuine-provider-result'}]};}},M360ContentAgent:{create:async input=>{steps.push('content');assert.equal(input.prompt,research.creative_brief);return {poster_id:'saved-poster',url:'blob:generated',caption:'Review copy'};}}};
 const fetch=async(url,options)=>{if(url==='/api/market-research'){steps.push('research');return {ok:true,json:async()=>({report:{id:'report',created_at:new Date().toISOString(),research,sources:['https://example.com'],forecast:{rows:[],missing:['investment_budget'],disclaimer:'Hypothetical'}}})};}if(url.startsWith('/api/poster-history')){steps.push('history');return {ok:true,json:async()=>({versions:[{poster_id:'saved-poster'}]})};}assert.equal(url,'/api/marketing/dispatch');steps.push('outreach');return {ok:true,json:async()=>({correlation_id:'task'})};};
 const taskFetch=async(url,options)=>url.startsWith('/api/market-research?')?{ok:true,json:async()=>({report:null})}:url==='/api/marketing/coordination'?{ok:true,json:async()=>({task:{artifact_refs:[{metadata:{poster_id:'saved-poster'}}]}})}:url.startsWith('/api/marketing/tasks?')?{ok:true,json:async()=>({task:{status:failed?'failed':'draft_ready',step_history:[{detail:'Synthetic draft preparation failure'}],channel_draft_versions:{Email:{versions:[{subject:'Approved service',body:'Review copy',status:'draft_for_review'}]}},audience_snapshot:{contacts:[]}}})}:fetch(url,options);
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../lib/m360-research-client.js'),'utf8'),{window,document,fetch:taskFetch,CustomEvent:class{},sessionStorage:{getItem:name=>name.includes('expires')?String(Date.now()+100000):'synthetic-token'},URLSearchParams,Date});
 for(const mode of ['research','campaign_plan']){
  await window.M360CampaignAgent.run('Plan a launch campaign.',{mode});
  assert.deepEqual(steps.splice(0),['research']);
 }
 if(failed)await assert.rejects(window.M360CampaignAgent.run('Run a campaign for our services',{mode:'email_workflow'}),/Synthetic draft preparation failure/);
 else await window.M360CampaignAgent.run('Run a campaign for our services',{mode:'email_workflow'});
 assert.deepEqual(steps,['research','leads','content','history','outreach']);
});
