'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const code=require('../lib/m360-post-client');
function compositor(logos=2){
 const painted=[],draws=[];
 const ctx={drawImage(...args){draws.push(args);},createLinearGradient(){return {addColorStop(){}};},fillRect(){},fillText(text){painted.push(text);},measureText(text){return {width:String(text).length*10};},save(){},restore(){},getImageData(){return {data:new Uint8ClampedArray(16)};},putImageData(){}};
 const document={createElement(){return {getContext:()=>ctx,toBlob:fn=>fn(new Blob([new Uint8Array(13000)]))};}};
 class Image{get naturalWidth(){return this.src.startsWith('blob:')?1000:2;}get naturalHeight(){return this.naturalWidth;}async decode(){}}
 const fetch=async url=>({ok:true,json:async()=>url.includes('action=profile')?{assets:Array.from({length:logos},(_,i)=>({id:String(i),role:i?'alternate_logo':'primary_logo',selected:true,filename:'brand-'+i})),profile:{approved_claims:['Approved site access'],phone:'Approved contact'}}:{asset_url:'https://example.com/logo'}});
 const start=code.indexOf(' function wrap('),end=code.indexOf(' function captureDraft()',start);
 const assemble=new Function('document','Image','fetch','workspace','session','URL',code.slice(start,end)+'; return assemble;')(document,Image,fetch,'synthetic-workspace',()=> 'synthetic-session',{createObjectURL:()=> 'blob:synthetic',revokeObjectURL(){}});
 const bytes=Buffer.alloc(6000);bytes[0]=255;bytes[1]=216;
 return {painted,draws,run:()=>assemble(bytes.toString('base64'),'image/jpeg',{hook:'Build your next chapter',headline:'A stronger business location',subheadline:'Clear supporting details',cta:'Arrange a visit',layout:'bottom'},'Instagram')};
}
test('creative pixels contain the hook, headline, approved detail and two logo draws',async()=>{
 const c=compositor();const output=await c.run();assert.equal(output.width,1080);assert.ok(c.painted.includes('Build your next chapter'));assert.ok(c.painted.includes('A stronger business location'));assert.ok(c.painted.includes('Approved site access'));assert.equal(c.draws.length,5);
});
test('creative export refuses one logo instead of duplicating or inventing a second logo',async()=>{await assert.rejects(compositor(1).run(),/Two approved logos/);});
test('missing content consent returns a clear permission message before any generation',async()=>{
 const marker="$('m360-ai-post-form').addEventListener('submit',async e=>{";
 const start=code.indexOf(marker)+marker.length,end=code.indexOf("\n for(const id of ['m360-ai-hook'",start),body=code.slice(start,code.lastIndexOf(' });',end));
 let feedback='',focused=false;
 const fields={'m360-ai-post-prompt':{value:'Create a professional post'},'m360-ai-post-channel':{value:'Instagram'},'m360-ai-post-confirm':{checked:false,focus(){focused=true;}}};
 const submit=new Function('$','workspace','session','status','return async e=>{'+body+'};')(id=>fields[id],'synthetic-workspace',()=> 'synthetic-session',text=>{feedback=text;});
 await submit({preventDefault(){}});assert.match(feedback,/Permission required/);assert.equal(focused,true);
});
test('lead presentation has a single generator and no provider cards or source column',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../lib/m360-unified-leads-subagent.js'),'utf8'),render=source.slice(source.indexOf('  function renderPanel()'),source.indexOf('  function wait('));
 assert.match(render,/Lead Generator/);assert.doesNotMatch(render,/Maps Scraper|Website Scraper|m360-engine-card|<th>Source/);
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
