'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const frontend=path.join(__dirname,'..');

test('legacy pricing preserves the browser-only FAQ fragment and canonical plans',async()=>{
 const handler=require('../api/creative-integrated');const headers={};const res={statusCode:0,setHeader(k,v){headers[k]=v;},end(body){this.body=body;}};
 await handler({method:'GET',query:{mode:'page',file:'pricing.html'}},res);
 assert.equal(res.statusCode,200);
 const script=res.body.match(/<script>(.*?)<\/script>/)[1];
 for(const [hash,expected] of [['#faq','/index.html#faq'],['','/index.html#m360-new-plans']]){let destination;vm.runInNewContext(script,{location:{hash,replace(value){destination=value;}}});assert.equal(destination,expected);}
});

test('theme switch follows the system, toggles, and restores the saved choice',()=>{
 const code=fs.readFileSync(path.join(frontend,'frontend-source/matrix360-workspace-theme.js'),'utf8');
 let saved;let button;
 const run=()=>{
  const root={dataset:{}};
  const document={documentElement:root,readyState:'complete',querySelector:()=>({append:b=>{button=b;}}),getElementById:()=>null,createElement:()=>({attributes:{},setAttribute(k,v){this.attributes[k]=v;},addEventListener(event,fn){this.click=fn;}})};
  vm.runInNewContext(code,{document,localStorage:{getItem:()=>saved,setItem:(k,v)=>{saved=v;}},matchMedia:()=>({matches:true})});return root;
 };
 const root=run();assert.equal(root.dataset.m360Theme,'dark');assert.equal(button.attributes.role,'switch');assert.equal(button.attributes['aria-checked'],'true');button.click();assert.equal(button.attributes['aria-checked'],'false');assert.equal(root.dataset.m360Theme,'light');assert.equal(saved,'light');assert.equal(run().dataset.m360Theme,'light');
});

test('both palettes meet normal-text contrast for body, secondary text and primary buttons',()=>{
 const css=fs.readFileSync(path.join(frontend,'frontend-source/matrix360-workspace-theme.css'),'utf8');
 const lum=hex=>{const rgb=hex.match(/\w\w/g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
 const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
 for(const block of css.matchAll(/\{(--ws-bg:[^}]+)\}/g)){
  const values=Object.fromEntries([...block[1].matchAll(/--ws-([a-z]+):#([a-f0-9]{6})/g)].map(x=>[x[1],x[2]]));
  for(const bg of ['bg','panel','soft'])for(const fg of ['text','muted'])assert.ok(ratio(values[bg],values[fg])>=4.5,fg+' on '+bg);
  assert.ok(ratio('ffffff',values.button)>=4.5);
 }
});

test('relocated Market Research tools retain theme surfaces and responsive forms',()=>{
 const css=fs.readFileSync(path.join(frontend,'frontend-source/matrix360-workspace-theme.css'),'utf8');
 const client=fs.readFileSync(path.join(frontend,'lib/m360-research-client.js'),'utf8');
 assert.match(client,/classList\.add\('m360-research-planning-tool'\)/);
 assert.match(client,/movePlanningTool\(\$\('m360-calendar-grid'\)\?\.closest\('\.m360-card'\)\)/);
 assert.match(css,/#m360-market-research \.m360-research-planning-tool \*\{box-sizing:border-box;min-width:0\}/);
 assert.match(css,/#m360-market-research \.m360-research-planning-tool #m360-calendar-grid strong\{background:var\(--ws-button\)!important;color:#fff!important\}/);
 assert.match(css,/#m360-market-research \.m360-research-planning-tool :is\(input:not\(\[type=range\]\),select,textarea\)\{[^}]*width:100%!important;[^}]*background:var\(--ws-panel\)!important;[^}]*color:var\(--ws-text\)!important/);
 assert.match(css,/#m360-market-research :is\(#m360-calendar-form,#m360-journey-form\)\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\);[^}]*gap:12px 16px/);
 assert.match(css,/@media\(max-width:640px\)[\s\S]*#m360-market-research :is\(#m360-calendar-form,#m360-journey-form\)\{grid-template-columns:minmax\(0,1fr\)\}/);
});

test('research works independently of storage and retains an evidence-based website audit',async()=>{
 const oldFetch=global.fetch,oldKey=process.env.OPENAI_API_KEY,oldStore=process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY;
 process.env.OPENAI_API_KEY='synthetic-key-for-local-test-only-123456';delete process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY;
 let providerCalls=0;
 global.fetch=async(url,options)=>{
  if(url.includes('/me/workspaces'))return {ok:true,json:async()=>[{id:'19',name:'Example Company',role:'client_admin'}]};
  assert.equal(url,'https://api.openai.com/v1/responses');providerCalls++;
  const body=JSON.parse(options.body);assert.match(body.input[0].content[0].text,/do not claim a complete crawl/);assert.ok(body.text.format.schema.required.includes('website_research'));
  return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({industry:'Manufacturing',website_research:'Reviewed homepage. Add clearer service descriptions.',products_services:['Widgets']}),annotations:[{url:'https://example.com/about'}]}]}]})};
 };
 const handler=require('../api/brand');
 const req=(method,body)=>({method,headers:{authorization:'Bearer synthetic.session.token.1234567890'},body,query:body});
 const response=()=>({statusCode:0,setHeader(){},end(text){this.body=JSON.parse(text);}});
 try{
  const profile=response();await handler(req('GET',{workspace_id:'19',action:'profile'}),profile);assert.equal(profile.body.storage_ready,false);assert.equal(profile.body.research_ready,true);
  const bad=response();await handler(req('POST',{workspace_id:'19',action:'research',website:'http://127.0.0.1'}),bad);assert.equal(bad.statusCode,422);assert.equal(providerCalls,0);
  const result=response();await handler(req('POST',{workspace_id:'19',action:'research',website:'https://example.com'}),result);assert.equal(result.statusCode,200);assert.match(result.body.suggestions.website_research,/homepage/);assert.deepEqual(result.body.sources,['https://example.com/about']);
  const save=response();await handler(req('POST',{workspace_id:'19',action:'save',expected_version:0,profile:{}}),save);assert.equal(save.statusCode,503);
 }finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;if(oldStore===undefined)delete process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY;else process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY=oldStore;}
});
