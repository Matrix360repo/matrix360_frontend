'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const code=require('../lib/m360-post-client');
test('reel end card uses a public company domain without publishing URL parameters',()=>{
 const {publicDestination}=require('../lib/m360-reel-storyboard');
 assert.deepEqual(publicDestination('https://www.example.com/visit?token=private#contact'),{label:'www.example.com',href:'https://www.example.com/'});
 assert.equal(publicDestination('https://user:password@example.com'),null);
 assert.equal(publicDestination('https://127.0.0.1/'),null);
 assert.equal(publicDestination(''),null);
});

test('reel storyboard fixes the timing, accepts a private clip ID, and requires real AI artwork',()=>{
 const {validateScenes}=require('../lib/m360-reel-storyboard');
 const art={caption:'Book a site visit',visual:'Wide editorial view of an industrial property'};
 const clip={caption:'See the offer',footage:'a8a7d2e1-8d26-46fe-a6dd-9d4cd058b661'};
 const end={caption:'Book a site visit',footage:clip.footage};
 const scenes=validateScenes([art,clip,art,end]);
 assert.deepEqual(scenes.map(scene=>scene.seconds),[3,4,4,4]);
 assert.equal(scenes[3].footage,'end_card');
 assert.equal(scenes[1].footage,clip.footage);
 assert.throws(()=>validateScenes([clip,clip,clip,end]),/Keep AI artwork/);
 assert.throws(()=>validateScenes([art,{...clip,footage:'https://example.com/clip.mp4'},art,end]),/saved video/);
});
test('reel detail cards preserve saved qualifiers and reject invented or stale choices',()=>{
 const {calloutChoices,validateScenes}=require('../lib/m360-reel-storyboard');
 const choices=calloutChoices({location:'Howrah',approved_claims:['Planned drainage and utilities','Call +91 99999 99999']});
 assert.deepEqual(choices.map(({id,text})=>[id,text]),[['location','Howrah'],['claim-0','Planned drainage and utilities']]);
 const art={caption:'Compare industrial plots',visual:'A wide editorial industrial plot image'};
 const beats=validateScenes([{...art,callout:'location'},art,{...art,callout:'claim-0'},{caption:'Book a visit'}],choices);
 assert.deepEqual(beats[0].callout,{id:'location',label:'Location',text:'Howrah',side:'right',start:0.6});
 assert.equal(beats[2].callout.side,'left');
 assert.equal(beats[2].callout.text,'Planned drainage and utilities');
 assert.throws(()=>validateScenes([{...art,callout:'invented'},art,art,{caption:'Book a visit'}],choices),/Company Details/);
});
test('storyboard suggestions recover individual fields without exposing contact details or cutting qualifiers',()=>{
 const {normalizeSuggestion,validateScenes,checkText}=require('../lib/m360-reel-storyboard');
 const scene={caption:'Compare industrial plots',visual:'Wide view of an industrial property concept'};
 const suggestion=normalizeSuggestion({scenes:[
  scene,{...scene,visual:'short'},{...scene,caption:'Planned drainage and utilities. '+ 'Details '.repeat(15)},
  {caption:'Call +91 99999 99999'}
 ],narration:'Words '.repeat(46)},{business_name:'Example Industrial Park'},[]);
 assert.equal(suggestion.scenes.length,4);
 assert.equal(suggestion.scenes[0].caption,scene.caption);
 assert.equal(suggestion.scenes[2].caption,'Planned drainage and utilities.');
 assert.equal(suggestion.scenes[3].caption,'Get in touch');
 assert.ok(suggestion.adjusted.includes('Narration script'));
 assert.ok(!JSON.stringify(suggestion).includes('99999'));
 assert.equal(checkText('Explore plots from 1-100 bighas',12,900,'Campaign direction'),'Explore plots from 1-100 bighas');
 assert.throws(()=>validateScenes([scene,scene,scene,{caption:'x'.repeat(50)}]),/End card call to action must be 3–42 characters/);
});
test('generation errors remain visible beside output until the next attempt',()=>{
 const fields={'m360-ai-post-output':{prepend(){}},'m360-ai-post-status':{}};let scrolled=false;
 const document={createElement:()=>({style:{},setAttribute(){},scrollIntoView(){scrolled=true;}})};
 const start=code.indexOf(' const failure='),end=code.indexOf(" let workspace=",start);
 const result=new Function('document','$',code.slice(start,end)+';return {status,failure};')(document,id=>fields[id]);
 result.status('Creative generation not completed: Two approved logos are required.');assert.equal(result.failure.hidden,false);assert.match(result.failure.textContent,/Two approved logos/);assert.equal(scrolled,true);
 result.status('Checking generation availability');assert.equal(result.failure.hidden,true);
});
function compositor(logos=2){
 const painted=[],draws=[],rects=[];
 const ctx={drawImage(...args){draws.push(args);},createLinearGradient(){return {addColorStop(){}};},fillRect(...args){rects.push({style:this.fillStyle,args});},fillText(text){painted.push(text);},measureText(text){return {width:String(text).length*10};},save(){},restore(){},getImageData(x,y,w,h){const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++)data.set([255,255,255,255],i*4);data.set([10,70,55,255],(Math.floor(h/2)*w+Math.floor(w/2))*4);return {data};},putImageData(){}};
 const document={createElement(){return {getContext:()=>ctx,toBlob:fn=>fn(new Blob([new Uint8Array(13000)]))};}};
 class Image{get naturalWidth(){return this.src.startsWith('blob:')?1000:5;}get naturalHeight(){return this.naturalWidth;}async decode(){}}
 const fetch=async url=>({ok:true,json:async()=>url.includes('action=profile')?{assets:Array.from({length:logos},(_,i)=>({id:String(i),role:i?'alternate_logo':'primary_logo',selected:true,filename:'brand-'+i})),profile:{approved_claims:['Approved site access'],phone:'Approved contact'}}:{asset_url:'https://example.com/logo'}});
 const start=code.indexOf(' function wrap('),end=code.indexOf(' function captureDraft()',start);
 const assemble=new Function('document','Image','fetch','workspace','session','URL','window',code.slice(start,end)+'; return assemble;')(document,Image,fetch,'synthetic-workspace',()=> 'synthetic-session',{createObjectURL:()=> 'blob:synthetic',revokeObjectURL(){}},{M360LogoTools:{prepare:img=>require('../frontend-source/matrix360-logo-tools').prepare(img,document)}});
 const bytes=Buffer.alloc(6000);bytes[0]=255;bytes[1]=216;
 return {painted,draws,rects,run:()=>assemble(bytes.toString('base64'),'image/jpeg',{hook:'Build your next chapter',headline:'A stronger business location',subheadline:'Clear supporting details',cta:'Arrange a visit',layout:'bottom'},'Instagram')};
}
test('creative pixels contain the hook, headline, approved detail and two logo draws',async()=>{
 const c=compositor();const output=await c.run();assert.equal(output.width,1080);assert.ok(c.painted.includes('Build your next chapter'));assert.ok(c.painted.includes('A stronger business location'));assert.ok(c.painted.includes('Approved site access'));assert.equal(c.draws.filter(a=>a.length===5&&a[0].width).length,2);assert.ok(c.rects.every(r=>typeof r.style==='object'&&r.args[1]>1350*.4),'Only a bottom gradient may cover the photo');
});
test('creative export refuses one logo instead of duplicating or inventing a second logo',async()=>{await assert.rejects(compositor(1).run(),/Two approved logos/);});
test('CRM refresh cannot invalidate ready or running creative work in the same workspace',async()=>{
 const marker="document.addEventListener('m360:crm-loaded',async event=>{";
 const start=code.indexOf(marker)+marker.length,end=code.indexOf("\n $('m360-ai-preflight').addEventListener",start);
 const body=code.slice(start,code.lastIndexOf(' });',end));
 for(const busy of [true,false]){
  const run=new Function('workspace','busy','available','session','$','reset','return async event=>{'+body+'};')('workspace-a',busy,!busy,()=> 'token',()=>({value:'workspace-a'}),()=>assert.fail('Same workspace must not reset'));
  await run({detail:{workspace:'workspace-a'}});
 }
});
test('missing content consent returns a clear permission message before any generation',async()=>{
 const marker="async function generatePost(e){";
 const start=code.indexOf(marker)+marker.length,end=code.indexOf("\n $('m360-ai-post-form').addEventListener('submit',generatePost);",start),body=code.slice(start,code.lastIndexOf('\n }',end));
 let feedback='',focused=false;
 const fields={'m360-ai-post-prompt':{value:'Create a professional post'},'m360-ai-post-channel':{value:'Instagram'},'m360-ai-post-confirm':{checked:false,focus(){focused=true;}}};
 const submit=new Function('$','workspace','session','status','return async e=>{'+body+'};')(id=>fields[id],'synthetic-workspace',()=> 'synthetic-session',text=>{feedback=text;});
 await submit({preventDefault(){}});assert.match(feedback,/Permission required/);assert.equal(focused,true);
});

test('creative library filters actual media types and pages grouped poster versions',()=>{
 const start=code.indexOf(' function renderArchive('),end=code.indexOf("\n $('m360-archive-filters').addEventListener",start);
 function node(){return {dataset:{},children:[],append(...children){this.children.push(...children);},replaceChildren(){this.children=[];},setAttribute(){},addEventListener(){}};}
 const fields={};
 const get=id=>fields[id]??=node();
 get('m360-saved-design-search').value='';
 const poster=(poster_id,channel,version=1)=>({poster_id,channel,version,created_at:'2026-11-03',plan:{headline:poster_id}});
 const rows=[poster('Email artwork','Email'),poster('Email artwork','Email',2),...Array.from({length:6},(_,i)=>poster('Social '+i,'LinkedIn'))];
 const reels=[{reel_id:'reel',prompt:'Tour of the site',created_at:'2026-11-04'}];
 const render=new Function('$','document','archiveRows','reelRows',`let archiveKind='all',archivePage=0;
   const archivePageSize=6,posterError=false,reelError=false,reelsLoaded=true;
   ${code.slice(start,end)}
   return (kind,page=0)=>{archiveKind=kind;archivePage=page;renderArchive('workspace');};`)(get,{createElement:node},rows,reels);
 const cards=()=>get('m360-saved-designs').children;
 render('all');assert.equal(cards().length,6);assert.equal(cards()[0].dataset.kind,'video');
 render('all',1);assert.equal(cards().length,2);
 render('email');assert.deepEqual(cards().map(card=>card.dataset.kind),['email']);
 assert.equal(cards()[0].children[4].children[1].textContent,'Preview v1');
 render('image');assert.equal(cards().length,6);assert.ok(cards().every(card=>card.dataset.kind==='image'));
 get('m360-saved-design-search').value='tour';
 render('video');assert.equal(cards().length,1);assert.equal(cards()[0].dataset.kind,'video');
});

test('a CRM refresh leaves an active or completed reel preview intact',async()=>{
 const media=fs.readFileSync(path.join(__dirname,'../frontend-source/matrix360-media.js'),'utf8');
 const marker="document.addEventListener('m360:crm-loaded',async event=>{";
 const start=media.indexOf(marker)+marker.length,end=media.indexOf('\n });',start);
 const register=new Function('workspace','busy','checking','capabilityChecked','token','$','clear','fetch','return async event=>{'+media.slice(start,end)+'};');
 for(const state of [[true,false,false],[false,true,false],[false,false,true]]){
  const unexpected=()=>assert.fail('A same-workspace refresh disturbed the reel');
  await register('workspace-a',...state,()=> 'token',()=>({value:'workspace-a'}),unexpected,unexpected)({detail:{workspace:'workspace-a'}});
 }
});

test('a poster edit after undo reserves a new immutable archive version',()=>{
 const start=code.indexOf(' function snapshot('),end=code.indexOf(' function refreshRevision(',start);
 const item={url:'blob:design',revisionNumber:2,plan:{headline:'Revised'},source:'fixture'};
 const histories=[[{number:1},{number:2}]],positions=[0],saved=[];
 const snapshot=new Function('options','histories','positions','refreshRevision','persistSnapshot',code.slice(start,end)+';return snapshot;')(
  [item],histories,positions,()=>{},(index,version,number)=>saved.push([index,version.number,number]));
 snapshot(0,'Edit after undo');
 assert.deepEqual(histories[0].map(version=>version.number),[1,3]);
 assert.deepEqual(saved,[[0,3,3]]);
});

test('Overview hands an editable brief to the active studio without requesting generation',()=>{
 const marker="document.addEventListener('m360:content-brief',event=>{";
 const start=code.indexOf(marker)+marker.length,end=code.indexOf('\n });',start);
 const prompt={value:'',focus(){this.focused=true;}};
 let status='';
 const channel={value:'Instagram',options:[{value:'LinkedIn'}]};
 const fields={workspace:{value:'workspace-a'},'m360-ai-post-channel':channel,'m360-ai-post-prompt':prompt};
 const run=new Function('$','session','busy','selectedOption','options','status','return event=>{'+code.slice(start,end)+'};')(
  id=>fields[id],()=> 'valid-session',false,-1,[],message=>{status=message;});
 run({detail:{workspace:'workspace-b',prompt:'A different business'}});
 assert.equal(prompt.value,'');
 run({detail:{workspace:'workspace-a',prompt:'Create a LinkedIn post about approved site access',channel:'LinkedIn',format:'image'}});
 assert.equal(channel.value,'LinkedIn');
 assert.equal(prompt.value,'Create a LinkedIn post about approved site access');
 assert.equal(prompt.focused,true);
 assert.match(status,/Overview AI/);
});

test('master waits for the private creative archive and refuses a failed save',async()=>{
 const start=code.indexOf('window.M360ContentAgent='),end=code.indexOf("\n for(const id of",start);
 for(const saved of [true,false]){
  let finishSave,settled=false;
  const item={url:'blob:synthetic',posterId:'synthetic-poster',savedVersion:1,savePromise:new Promise(resolve=>{finishSave=resolve;})};
  const window={},fields={};
  new Function('window','workspace','active','available','busy','$','generatePost','options',code.slice(start,end))(window,'synthetic-workspace',()=>true,true,false,id=>fields[id]||(fields[id]={}),async()=>{},[item]);
  const running=window.M360ContentAgent.create({workspace_id:'synthetic-workspace',prompt:'Create approved industrial land campaign',channel:'Email'});
  running.then(()=>{settled=true;},()=>{settled=true;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);
  finishSave(saved);
  if(saved)assert.equal((await running).poster_id,item.posterId);
  else await assert.rejects(running,/private archive save failed/);
 }
});
test('lead presentation has a single generator and no provider cards or source column',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../lib/m360-unified-leads-subagent.js'),'utf8'),render=source.slice(source.indexOf('  function renderPanel()'),source.indexOf('  function wait('));
 assert.match(render,/Lead Generator/);assert.doesNotMatch(render,/Maps Scraper|Website Scraper|m360-engine-card|<th>Source/);
});

test('saving an existing creative retries its authenticated final upload without generating another image',async()=>{
 const start=code.indexOf('async function persistSnapshot'),end=code.indexOf(' async function loadSavedDesigns',start);
 const item={source:'saved-original',posterId:'synthetic-poster'},calls=[];
 const jpeg=Buffer.alloc(6000);jpeg[0]=255;jpeg[1]=216;jpeg[2]=255;
 class FileReader{async readAsDataURL(blob){this.result='data:image/jpeg;base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onload();}}
 let failures=1;
 const historyAPI=async(method,payload)=>{calls.push(payload);if(payload.action==='save-final'&&failures-- >0)throw Object.assign(Error('Transient upload failure'),{http:503});return {status:'saved'};};
 const run=new Function('workspace','options','session','historyAPI','fetch','FileReader','document','CustomEvent','revisionState','loadSavedDesigns','$','controls',code.slice(start,end)+';return persistSnapshot;')('workspace-a',[item],()=> 'synthetic-session',historyAPI,async()=>({blob:async()=>new Blob([jpeg],{type:'image/jpeg'})}),FileReader,{dispatchEvent(){}},class{},()=>{},async()=>{},()=>({value:'Email'}),()=>{});
 assert.equal(await run(0,{source:'saved-original',plan:{caption:'Saved copy'},url:'blob:existing',blob:new Blob([jpeg],{type:'image/jpeg'})},1),true);
 assert.deepEqual(calls.map(x=>x.action),['save','save-final','save-final']);assert.equal(item.savedVersion,1);assert.equal(item.saveError,'');
 assert.equal(calls[1].image_base64,calls[2].image_base64);
 assert.doesNotMatch(code,/fetch\(version.url\)/,'CSP must not block final image saving');
});

test('cancelling during lead startup cancels the returned campaign and never imports late results',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../lib/m360-unified-leads-subagent.js'),'utf8');
 let finishStart;const cancelled=[];let imports=0;
 const window={},document={readyState:'complete',getElementById:id=>id==='workspace'?{value:'synthetic-workspace'}:null,addEventListener(){}};
 const fetch=async(url,options={})=>{
  if(url.includes('action=cancel')){cancelled.push(JSON.parse(options.body).campaign_id);return {ok:true,json:async()=>({status:'ok',ui_state:'Cancelled',leads:[]})};}
  if(url==='/api/unified-leads-agent')return new Promise(resolve=>{finishStart=resolve;});
  imports++;throw Error('No late imports allowed');
 };
 require('node:vm').runInNewContext(source,{window,document,fetch,URLSearchParams,sessionStorage:{getItem:key=>key.includes('expires')?String(Date.now()+60000):'synthetic-session'},setTimeout});
 const running=window.M360LeadsSubAgent.executeFromMasterAgent('Find 1 manufacturer in Kolkata');
 await window.M360LeadsSubAgent.cancelDiscovery();
 finishStart({ok:true,json:async()=>({campaign_id:'late-synthetic-campaign',maps_job_id:'job',engines:{maps:{status:'running'}},target_limit:1})});
 await running;assert.ok(cancelled.includes('late-synthetic-campaign'));assert.equal(imports,0);assert.equal(window.M360LeadsSubAgent.getState().running,false);
});

test('lead discovery keeps polling past five minutes and imports late verified results',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../lib/m360-unified-leads-subagent.js'),'utf8');
 const window={},document={readyState:'complete',getElementById:id=>id==='workspace'?{value:'synthetic-workspace'}:null,addEventListener(){}};
 let elapsed=0,polls=0;const imports=[];
 const base=Date.now();
 const clock={now:()=>base+elapsed};
 const response=data=>({ok:true,json:async()=>data});
 const fetch=async(url,options)=>{
  if(url==='/api/unified-leads-agent')return response({campaign_id:'slow-campaign',maps_job_id:'job',overall_status:'running',target_limit:1});
  if(url==='/api/unified-leads-agent?action=status'){
   polls++;
   if(polls===1){elapsed=6*60*1000;return response({campaign_id:'slow-campaign',running:true,overall_status:'running',leads:[]});}
   elapsed=8*60*1000+12000;
   return response({campaign_id:'slow-campaign',running:false,overall_status:'completed',leads:[{company_name:'Verified manufacturer',website:'https://verified.example'}]});
  }
  assert.equal(url,'/api/crm/workspaces/synthetic-workspace/leads');
  imports.push(JSON.parse(options.body));
  return response({});
 };
 require('node:vm').runInNewContext(source,{window,document,fetch,URLSearchParams,Date:clock,
  sessionStorage:{getItem:key=>key.includes('expires')?String(base+30*60*1000):'synthetic-session'},
  setTimeout:fn=>queueMicrotask(fn)});
 const result=await window.M360LeadsSubAgent.executeFromMasterAgent('Find 1 manufacturer in Howrah');
 assert.equal(result.overallStatus,'completed');
 assert.equal(polls,2);
 assert.equal(imports.length,1);
 assert.equal(imports[0].name,'Verified manufacturer');
});

test('lead progress never exposes provider names or raw HTTP errors to the client',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../lib/m360-unified-leads-subagent.js'),'utf8'),messages=[];
 const window={},document={readyState:'complete',getElementById:id=>id==='workspace'?{value:'synthetic-workspace'}:null,addEventListener(){}};
 const fetch=async()=>({ok:false,json:async()=>({message:'Website engine HTTP 500; Maps failed',overall_status:'failed'})});
 require('node:vm').runInNewContext(source,{window,document,fetch,URLSearchParams,sessionStorage:{getItem:key=>key.includes('expires')?String(Date.now()+60000):'synthetic-session'},setTimeout});
 await window.M360LeadsSubAgent.executeFromMasterAgent('Find 3 manufacturers in Howrah',message=>messages.push(message));
 assert.equal(messages[0],'Lead scraper engine is running.');
 assert.ok(messages.length>1);assert.doesNotMatch(messages.join(' '),/website|maps|HTTP/i);
});
