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
    {id:'demo-1',name:'Atlas Manufacturing — Sample',source:'Fictional sample prospect',stage:'enquiry',test_data:true,outbound_blocked:true},
    {id:'demo-2',name:'Harbour Logistics — Sample',source:'Fictional sample prospect',stage:'qualified',test_data:true,outbound_blocked:true},
    {id:'demo-3',name:'Summit Packaging — Sample',source:'Fictional sample prospect',stage:'proposal',test_data:true,outbound_blocked:true}]});
  const durableStorage=typeof localStorage!=='undefined'?localStorage:sessionStorage;
  let state=initial();
  try { const saved=JSON.parse(durableStorage.getItem('matrix360_showcase_data')); if(saved?.profile&&Array.isArray(saved.leads))state=saved; } catch {}
  const stages=['enquiry','qualified','proposal','won','lost'];
  const persist=()=>durableStorage.setItem('matrix360_showcase_data',JSON.stringify(state));
  const answer=(body,status=200)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}));
  const unavailable=()=>answer({status:'showcase_only',message:'Showcase mode uses fictional data. Controlled email testing may be enabled; scraping, uploads and publishing still require the signed-in workspace.',detail:'Unverified live services remain disabled.'},403);
  const originalFetch=window.fetch.bind(window);
  const csvRows=text=>{const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<String(text).length;i++){const ch=text[i];if(ch==='"'&&quoted&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=!quoted;else if(ch===','&&!quoted){row.push(cell);cell='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(value=>value.trim()))rows.push(row);row=[];}else cell+=ch;}row.push(cell);if(row.some(value=>value.trim()))rows.push(row);if(quoted)throw Error('CSV contains an unclosed quoted field');return rows;};
  const importShowcaseCsv=text=>{const rows=csvRows(text);if(rows.length<2)throw Error('CSV needs a header and at least one row');if(rows.length>2001)throw Error('CSV exceeds the 2,000 row limit');const headers=rows[0].map(value=>String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g,'_')),at=(values,...names)=>{const index=headers.findIndex(value=>names.includes(value));return index<0?'':String(values[index]||'').trim();},truthy=value=>/^(1|true|yes|granted|opted_in)$/i.test(value);const records=[],errors=[],seen=new Set(state.leads.map(lead=>String(lead.email||lead.phone||lead.name).toLowerCase()));for(let i=1;i<rows.length;i++){const values=rows[i],name=at(values,'name','contact_name','full_name')||at(values,'company','company_name','business'),email=at(values,'email','email_address').toLowerCase(),phone=at(values,'phone','mobile','phone_number').replace(/[^0-9+]/g,''),key=(email||phone||name).toLowerCase(),consentSource=at(values,'consent_source','opt_in_source'),consentAt=at(values,'consent_captured_at','opt_in_at','consent_date'),verified=Boolean(consentSource&&consentAt&&!Number.isNaN(new Date(consentAt).getTime()));if(!name){errors.push({row:i+1,code:'NAME_REQUIRED'});continue;}if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){errors.push({row:i+1,code:'INVALID_EMAIL'});continue;}if(seen.has(key)){errors.push({row:i+1,code:'DUPLICATE'});continue;}seen.add(key);records.push({id:'demo-csv-'+Date.now()+'-'+i,name,company_name:at(values,'company','company_name','business'),email,phone,source:at(values,'source','lead_source')||'Showcase CSV import',stage:'enquiry',email_opt_in_status:verified&&truthy(at(values,'consent_email','email_consent'))?'granted':'unknown',whatsapp_opt_in_status:verified&&truthy(at(values,'consent_whatsapp','whatsapp_consent'))?'granted':'unknown',sms_opt_in_status:verified&&truthy(at(values,'consent_sms','sms_consent'))?'granted':'unknown',consent_evidence:verified?{email:truthy(at(values,'consent_email','email_consent')),whatsapp:truthy(at(values,'consent_whatsapp','whatsapp_consent')),sms:truthy(at(values,'consent_sms','sms_consent')),source:consentSource,captured_at:new Date(consentAt).toISOString()}: {},test_data:true,outbound_blocked:true});}state.leads.push(...records);persist();return{status:'completed',import_batch_id:'showcase-'+Date.now(),input_count:rows.length-1,accepted_count:records.length,rejected_count:errors.length,records,errors,test_data:true,external_sending_blocked:true};};
  window.fetch=(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(options.signal?.aborted)return Promise.reject(new DOMException('Request cancelled','AbortError'));
    // Never transmit a real session or a demo request to any external backend.
    if(url.origin!==location.origin)return unavailable();
    if(!url.pathname.startsWith('/api/'))return originalFetch(input,options);
    const method=String(options.method||'GET').toUpperCase();
    let body={};try{body=JSON.parse(options.body||'{}');}catch{}
    const path=url.pathname;
    if(path==='/api/marketing/csv-preview'&&method==='POST'){
      try{const result=importShowcaseCsv(body.csv||'');state.leads.splice(state.leads.length-result.records.length,result.records.length);persist();return answer({...result,status:'validated_test_fixture'});}catch(error){return answer({status:'error',error:error.message},400);}
    }
    if(path==='/api/marketing/csv-import'&&method==='POST'){
      try{return answer(importShowcaseCsv(body.csv||''),201);}catch(error){return answer({status:'error',error:error.message},400);}
    }
    if(path==='/api/marketing'||path.startsWith('/api/marketing/')){
      const allowed=/^\/api\/marketing(?:\/(?:tasks|conversations(?:\/[0-9a-f-]{36}\/messages)?|coordination|revise|approve|calendar|journeys|estimate|execute|providers\/verify))?$/.test(path);
      if(!allowed)return unavailable();
      const enriched={...body,workspace_id:body.workspace_id||url.searchParams.get('workspace_id')||'showcase',showcase_profile:state.profile,showcase_audience:state.leads};
      const forwarded={...options,headers:{...(options.headers||{}),Authorization:'Bearer '+DEMO},body:['GET','HEAD'].includes(method)?options.body:JSON.stringify(enriched)};
      return originalFetch(url.href,forwarded);
    }
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
      if(action==='research'){
        const enriched={workspace_id:'showcase',action:'research',business_name:body.business_name||state.profile.business_name,website:body.website||state.profile.website};
        const forwarded={...options,headers:{...(options.headers||{}),Authorization:'Bearer '+DEMO},body:JSON.stringify(enriched)};
        return originalFetch(url.href,forwarded);
      }
      if(action==='profile')return answer({status:'ok',workspace_id:'showcase',business_name:state.profile.business_name,profile:state.profile,version:state.version,assets:[],storage_ready:true,research_ready:true,showcase:true});
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
    banner.textContent='Showcase workspace · Fictional data · Controlled live email test available after SMTP verification · Scraping, uploads and publishing require sign-in';
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
