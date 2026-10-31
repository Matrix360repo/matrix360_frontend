'use strict';

// This is an isolated browser demo, never an authentication bypass for live APIs.
function showcaseClient() {
  'use strict';
  const DEMO = 'matrix360-isolated-showcase';
  try {
    sessionStorage.setItem('matrix360_pilot_token', DEMO);
    sessionStorage.setItem('matrix360_pilot_expires_at', String(Date.now() + 86400000));
  } catch { return; }
  const initial = () => ({version:1, profile:{business_name:'Northstar Industries — Demo',industry:'Manufacturing',website:'https://example.com',description:'Fictional business for the Matrix360 showcase.',products_services:['Industrial facilities','Business services'],approved_claims:[],style_preferences:'Professional, clear and concise.'}, leads:[
    {id:'demo-1',name:'Atlas Manufacturing — Sample',source:'Fictional sample prospect',stage:'enquiry'},
    {id:'demo-2',name:'Harbour Logistics — Sample',source:'Fictional sample prospect',stage:'qualified'},
    {id:'demo-3',name:'Summit Packaging — Sample',source:'Fictional sample prospect',stage:'proposal'}]});
  let state=initial();
  try { const saved=JSON.parse(sessionStorage.getItem('matrix360_showcase_data')); if(saved?.profile&&Array.isArray(saved.leads))state=saved; } catch {}
  const stages=['enquiry','qualified','proposal','won','lost'];
  const persist=()=>sessionStorage.setItem('matrix360_showcase_data',JSON.stringify(state));
  const answer=(body,status=200)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}));
  const unavailable=()=>answer({status:'showcase_only',message:'Showcase mode uses fictional data. Live AI, scraping, uploads and publishing require the signed-in workspace.',detail:'Live services are disabled in the isolated showcase.'},403);
  const originalFetch=window.fetch.bind(window);
  window.fetch=(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(options.signal?.aborted)return Promise.reject(new DOMException('Request cancelled','AbortError'));
    // Never transmit a real session or a demo request to any external backend.
    if(url.origin!==location.origin)return unavailable();
    if(!url.pathname.startsWith('/api/'))return originalFetch(input,options);
    const method=String(options.method||'GET').toUpperCase();
    let body={};try{body=JSON.parse(options.body||'{}');}catch{}
    const path=url.pathname;
    if(path==='/api/crm/me/workspaces')return answer([{id:'showcase',name:state.profile.business_name,role:'owner'}]);
    if(path==='/api/crm/auth/logout')return answer({status:'ok'});
    if(path==='/api/crm/workspaces/showcase/stages')return answer(stages);
    if(path==='/api/crm/workspaces/showcase/leads'){
      if(method==='POST'){
        if(typeof body.name!=='string'||!body.name.trim()||!stages.includes(body.stage))return answer({detail:'Enter a name and valid stage.'},422);
        const lead={id:'demo-'+Date.now(),name:body.name.trim().slice(0,120),source:String(body.source||'Demo entry').slice(0,240),stage:body.stage};state.leads.push(lead);persist();return answer(lead,201);
      }
      if(method==='GET')return answer(state.leads);
    }
    if(path.startsWith('/api/crm/workspaces/showcase/leads/')&&method==='PATCH'){
      const lead=state.leads.find(x=>x.id===decodeURIComponent(path.split('/').pop()));
      if(!lead||!stages.includes(body.stage))return answer({detail:'Demo lead or stage not found.'},404);
      lead.stage=body.stage;persist();return answer(lead);
    }
    if(path==='/api/brand'){
      const action=body.action||url.searchParams.get('action')||'profile';
      if(action==='profile')return answer({status:'ok',workspace_id:'showcase',business_name:state.profile.business_name,profile:state.profile,version:state.version,assets:[],storage_ready:true,research_ready:false,showcase:true});
      if(action==='save'&&method==='POST'){
        if(body.expected_version!==state.version)return answer({message:'Reload the demo profile before saving.'},409);
        if(!body.profile||typeof body.profile!=='object'||JSON.stringify(body.profile).length>16000)return answer({message:'Invalid demo profile.'},422);
        state.profile=body.profile;state.version++;persist();return answer({status:'saved',showcase:true,workspace_id:'showcase',version:state.version,profile:state.profile,updated_at:new Date().toISOString()});
      }
      return unavailable();
    }
    if(path==='/api/control-center'&&method==='POST')return answer({status:'ok',category:'strategy',answer:'This is the isolated Matrix360 showcase. Explore Leads & Pipeline, Content Creation, Marketing and Company Details using the top navigation. Sample leads and profile edits stay in this browser. Live AI and lead discovery remain available only in the signed-in product.',missing_information:[],recommendation:{summary:'Review the sample pipeline and update the fictional company profile.',rationale:'This showcase keeps client records and paid services private.'},options:[],next_actions:['Open Leads & Pipeline to review sample prospects.','Open Company Details to save a demo profile.'],facts_used:['Fictional showcase workspace'],assumptions:[],engine_handover:{required:false,primary_engine:'none',task_summary:'',expected_outputs:[]}});
    if(path==='/api/ai-post'&&method==='GET')return answer({status:'showcase_only',ai_image_ready:false,semantic_planner_ready:false,publishing:false,quota:'Isolated showcase: live generation disabled.'});
    if(path==='/api/poster-history'&&method==='GET')return answer({versions:[]});
    if(path==='/api/reel-library'&&method==='GET')return answer({reels:[]});
    return unavailable();
  };
  document.addEventListener('DOMContentLoaded',()=>{
    const banner=document.createElement('p');banner.id='m360-showcase-notice';banner.setAttribute('role','status');
    banner.textContent='Showcase workspace · Fictional data · Changes stay in this browser · Live services disabled';
    banner.style.cssText='padding:12px 16px;border:1px solid var(--ws-line,#50747b);border-radius:10px;background:var(--ws-soft,#173139);color:var(--ws-text,#f0f8f8);font-size:13px';
    document.querySelector('.main')?.prepend(banner);
    const logout=document.getElementById('logout');if(logout){logout.textContent='Back to website';logout.addEventListener('click',event=>{event.stopImmediatePropagation();location.assign('/index.html');},true);}
    const who=document.getElementById('who');if(who)who.textContent='Showcase access';
  });
}

const enabled=()=>process.env.M360_SHOWCASE_ENABLED==='true';
function bootstrap(){
  if(enabled())return '<script>('+showcaseClient.toString()+')();</script>';
  return '<script>try{if(sessionStorage.getItem("matrix360_pilot_token")==="matrix360-isolated-showcase"){sessionStorage.removeItem("matrix360_pilot_token");sessionStorage.removeItem("matrix360_pilot_expires_at");}}catch{}</script>';
}
module.exports={enabled,bootstrap,showcaseClient};
