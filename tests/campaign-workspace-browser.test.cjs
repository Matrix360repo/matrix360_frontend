'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../lib/m360-campaign-workspace-client.js'),'utf8');
const {requirements}=require('../lib/m360-campaign-workspace');

function fixture({role='client_admin',assets=true,failDispatch=false,delayed=false,delayDiscovery=false}={}){
 class Element{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.dataset={};this.attributes={};this.value='';this.maxLength=2000;this._text='';}
  append(...items){for(const item of items){item.remove();item.parentElement=this;this.children.push(item);}}
  prepend(...items){for(const item of items.reverse()){item.remove();item.parentElement=this;this.children.unshift(item);}}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.parentElement=null;}
  replaceChildren(...items){for(const child of [...this.children])child.remove();this.append(...items);}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(key,fn){this.listeners[key]=fn;}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join(' ');}
  set textContent(value){this._text=value;this.replaceChildren();}
  get isConnected(){return this===root||Boolean(this.parentElement?.isConnected);}
  focus(){}
 }
 const root=new Element('main'),elements={};
 for(const id of ['workspace','m360-control-output','marketing-centre','m360-conversation-form','m360-ai-post-prompt','creative-prompt','m360-storyboard-brief']){elements[id]=new Element('div');elements[id].id=id;root.append(elements[id]);}
 elements['marketing-centre'].append(elements['m360-conversation-form']);elements.workspace.value='workspace-a';
 const events={},navigation=[],requests=[],emitted=[];
 const document={getElementById:id=>elements[id],createElement:tag=>new Element(tag),addEventListener(name,fn){(events[name]||=[]).push(fn);},dispatchEvent(event){emitted.push(event);for(const fn of events[event.type]||[])fn(event);}};
 const contacts=Array.from({length:6},(_,index)=>({selection_id:'crm:'+index,name:'Synthetic manufacturer '+index,pool:index<4?'crm':'reserved_crm_stage',email_opt_in_status:'unknown'}));
 let fail=failDispatch,pending,discoveryCalls=0,cancelled=0,finishDiscovery;
 const fetch=async(url,options)=>{
  const body=options.body?JSON.parse(options.body):null;requests.push({url,body});
  let data;
  if(url.endsWith('/resources')){
   data={workspace_id:'workspace-a',can_write:role!=='viewer',can_approve:role==='client_admin',topic_known:Boolean(body.answers.topic)||/widgets/.test(body.prompt),
    brief:requirements(body.prompt,{target_audience:['manufacturers'],service_areas:['Pune']},body.answers),context:{profile:{approved_claims:['Synthetic company fact']}},
    candidates:contacts,available_count:6,existing_count:4,saved_candidate_count:2,excluded_count:1,warnings:[],pool_note:'Verified checkpoint pool',
    assets:assets?[{id:'poster:v2',approval_state:'saved_content_studio_version',metadata:{poster_id:'poster',version:2,channel:'LinkedIn',headline:'Synthetic creative'}}]:[]};
   if(delayed)await new Promise(resolve=>pending=resolve);
  }else if(url.endsWith('/dispatch')){
   if(fail){fail=false;return {ok:false,json:async()=>({error:'Synthetic transient failure. Completed selections retained.'})};}
   data={correlation_id:body.correlation_id};
  }else if(url.includes('/tasks?'))data={task:{status:'draft_ready',step_history:[],audience_snapshot:{requested_count:10,total_count:6,missing_count:4,contacts:[]},artifact_refs:[],channel_draft_versions:{Email:{versions:[{version:1,status:'draft_for_review',body:'Synthetic editable email copy.',subject:'Launch',version_hash:'fixture-hash'}]}}}};
  else throw Error('Unexpected browser fixture request '+url);
  return {ok:true,json:async()=>data};
 };
 const window={Matrix360Router:{navigateToPage(...values){navigation.push(values);}},M360LeadsSubAgent:{getState:()=>({}),getStatus:()=>cancelled?'Search cancelled':'No results',
  executeFromMasterAgent:async(prompt,progress)=>{discoveryCalls++;progress('Checking saved candidates',{leads:[]});if(delayDiscovery)await new Promise(resolve=>finishDiscovery=resolve);return {leads:[]};},cancelDiscovery:async()=>{cancelled++;finishDiscovery?.();}}};
 vm.runInNewContext(source,{window,document,fetch,sessionStorage:{getItem:key=>key.includes('expires')?Date.now()+60000:'synthetic-fixture-session'},crypto:{randomUUID:require('node:crypto').randomUUID},AbortController,URLSearchParams,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},setTimeout,clearTimeout});
 const all=node=>[node,...node.children.flatMap(all)];
 const button=(state,label)=>{const found=all(state.body).find(item=>item.tagName==='BUTTON'&&item.textContent===label);assert.ok(found,'Missing button '+label);return found;};
 const click=async(state,label)=>{const control=button(state,label);assert.equal(control.disabled,false);await control.listeners.click();await flush();};
 return {window,document,root,elements,navigation,requests,emitted,all,button,click,resolve:()=>pending?.(),get discoveryCalls(){return discoveryCalls;}};
}
async function flush(){for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));}

for(const origin of ['overview','marketing'])test(`${origin} retains questions, selected shortfall, editable briefs and exact draft review through navigation and retry`,async()=>{
 const f=fixture({failDispatch:true});const state=f.window.M360CampaignWorkspace.open('Plan an email and LinkedIn campaign',{origin});await flush();
 assert.match(state.body.textContent,/What should the campaign be about/);assert.equal(state.message,'Waiting for your answer');assert.equal(f.navigation.length,0);
 state.answers.topic='Widget launch';await f.click(state,'Continue');
 // The input handler is exercised separately; the Continue button requires its field value.
 if(state.body.textContent.includes('What should')){const input=f.all(state.body).find(item=>item.tagName==='INPUT');input.value='Widget launch';input.listeners.input();await f.click(state,'Continue');}
 state.answers.count=10;await f.click(state,'Check this audience');await f.click(state,'Use existing leads');assert.equal(state.selected.length,4);
 await f.click(state,'Top up from saved candidates');assert.equal(state.selected.length,6);assert.match(state.body.textContent,/Requested 10 · Selected 6 · Missing 4/);
 f.document.dispatchEvent({type:'m360:page-changed',detail:{page:'research'}});f.document.dispatchEvent({type:'m360:page-changed',detail:{page:origin}});assert.equal(state.selected.length,6);
 await f.click(state,'Continue with selected audience');assert.equal(state.briefs.length,3);
 state.briefs[0].prompt='Edited email brief about synthetic widgets.';
 await f.click(state,'Open in Content Creation');assert.equal(f.emitted.at(-1).detail.prompt,state.briefs[0].prompt);assert.equal(f.emitted.at(-1).detail.return_to,origin);
 assert.equal(state.briefs[0].prompt,'Edited email brief about synthetic widgets.');
 f.document.dispatchEvent({type:'m360:content-draft-ready',detail:{workspace:'workspace-a',workflow_id:state.id,channel:'Email',subject:'Edited launch',body:'Edited Content draft for review.'}});
 assert.match(state.body.textContent,/draft returned from Content Creation/);
 await f.click(state,'Prepare campaign drafts');assert.match(state.message,/transient failure/);await f.click(state,'Retry this step');
 const dispatches=f.requests.filter(item=>item.url.endsWith('/dispatch'));assert.equal(dispatches.length,2);assert.equal(dispatches[0].body.correlation_id,dispatches[1].body.correlation_id);
 assert.equal(dispatches[1].body.reviewed_selection.audience_ids.length,6);assert.equal(dispatches[1].body.creative_briefs[0].prompt,state.briefs[0].prompt);
 assert.equal(dispatches[1].body.content_drafts[0].body,'Edited Content draft for review.');
 assert.match(state.body.textContent,/Draft ready for review/);assert.match(state.body.textContent,/Approve this exact version/);
 f.document.dispatchEvent({type:'m360:workspace-changing'});f.elements.workspace.value='workspace-b';assert.equal(state.panel.isConnected,false);
 assert.ok(f.requests.every(item=>!/execute|publish|render/.test(item.url)));
});
test('no saved assets leaves fresh editable briefs; discovery starts only after review',async()=>{
 const f=fixture({assets:false}),state=f.window.M360CampaignWorkspace.open('Plan email widgets campaign for 10 leads',{origin:'marketing'});await flush();await f.click(state,'Check this audience');
 await f.click(state,'Top up from saved candidates');await f.click(state,'Find only the missing leads');assert.equal(f.discoveryCalls,0);assert.match(state.body.textContent,/Request 4 more leads/);
 await f.click(state,'Request 4 more leads');assert.equal(f.discoveryCalls,1);assert.match(state.message,/No results/);assert.equal(state.selected.length,6);
 await f.click(state,'Back to selected audience');await f.click(state,'Continue with selected audience');assert.match(state.body.textContent,/No saved creative/);assert.ok(state.briefs.length);
 f.window.M360CampaignWorkspace.clear();
});
test('restricted roles cannot prepare work and late responses cannot leak across workspaces',async()=>{
 const restricted=fixture({role:'viewer'}),state=restricted.window.M360CampaignWorkspace.open('Plan email widgets campaign');await flush();assert.equal(state.message,'Read-only role');assert.equal(restricted.requests.length,1);
 const f=fixture({delayed:true}),pending=f.window.M360CampaignWorkspace.open('Plan email widgets campaign');await flush();f.document.dispatchEvent({type:'m360:workspace-changing'});f.elements.workspace.value='workspace-b';f.resolve();await flush();assert.equal(pending.panel.isConnected,false);assert.equal(f.root.textContent.includes('Synthetic company fact'),false);
});

test('cancelled specialist requests retain audience and ignore a late completion',async()=>{
 const f=fixture({delayDiscovery:true}),state=f.window.M360CampaignWorkspace.open('Plan email widgets campaign for 10 leads');await flush();await f.click(state,'Check this audience');await f.click(state,'Top up from saved candidates');await f.click(state,'Find only the missing leads');
 const pending=f.button(state,'Request 4 more leads').listeners.click();await flush();
 await f.click(state,'Cancel discovery');await pending;await flush();
 assert.equal(state.selected.length,6);assert.match(state.message,/Discovery cancelled/);assert.doesNotMatch(state.message,/No results/);f.window.M360CampaignWorkspace.clear();
});
test('Overview explicit formats choose their owning workflow',()=>{
 const intent=require('../lib/m360-overview-intent');assert.equal(intent('Create a reel storyboard for our launch').kind,'reel');assert.deepEqual(intent('Write a LinkedIn post for our launch'),{kind:'copy',channel:'LinkedIn'});assert.equal(intent('Plan an email and LinkedIn campaign').kind,'outreach');
});
