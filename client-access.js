/* Matrix 360 client access pilot: in-memory credentials only; no client session is trusted from localStorage. */
(()=>{'use strict';const $=id=>document.getElementById(id);const API='https://matrix360-crm-backend-p9os.onrender.com';let token=null,workspace=null,memberships=[],stages=[],version=0,authVersion=0,lastLeads=null,channelStatus=null;
const msg=(id,text,error=false)=>{const el=$(id);el.textContent=text;el.style.color=error?'#ac342e':'#0b7162'};
async function request(path,method='GET',body){const headers={...(token?{Authorization:'Bearer '+token}:{})};if(body!==undefined)headers['Content-Type']='application/json';let res;try{res=await fetch(API+path,{method,headers,cache:'no-store',body:body===undefined?undefined:JSON.stringify(body)});}catch{throw Error('Service temporarily unreachable. Please try again later.')}let value=null;try{value=await res.json()}catch{}if(res.status===401&&token){signOut();throw Error('Your session expired. Please sign in again.')}if(!res.ok)throw Error(typeof value?.detail==='string'?value.detail:'Service error '+res.status);return value}
function signOut(){++authVersion;++version;token=null;workspace=null;lastLeads=null;channelStatus=null;memberships=[];stages=[];$('password').value='';$('leadRows').replaceChildren();document.body.classList.remove('authed');history.replaceState(null,'',location.pathname);}
async function load(){const id=$('workspace').value;if(!memberships.some(x=>x.id===id))throw Error('Workspace not authorized');workspace=id;lastLeads=null;channelStatus=null;const v=++version;const url='/workspaces/'+encodeURIComponent(id);const [s,l,status]=await Promise.all([request(url+'/stages'),request(url+'/leads'),request(url+'/channel-status')]);if(v!==version)return;if(!Array.isArray(s)||!Array.isArray(l))throw Error('Unexpected data format');if(status?.workspace_id!==id||status?.crm?.status!=='connected')throw Error('CRM connection status could not be verified');stages=s;lastLeads=l;channelStatus=status;$('leadStage').replaceChildren(...s.map(x=>new Option(x.replaceAll('_',' '),x)));const body=$('leadRows');body.replaceChildren();for(const lead of l){const row=document.createElement('tr');for(const x of [lead.name,lead.source||'—',lead.stage]){const td=document.createElement('td');td.textContent=x||'—';row.appendChild(td)}const td=document.createElement('td');const sel=document.createElement('select');sel.setAttribute('aria-label','Update stage for '+lead.name);for(const st of s)sel.add(new Option(st.replaceAll('_',' '),st));sel.value=lead.stage;sel.addEventListener('change',async()=>{sel.disabled=true;try{await request(url+'/leads/'+encodeURIComponent(lead.id),'PATCH',{stage:sel.value});await load();msg('clientStatus','Lead stage updated')}catch(e){msg('clientStatus',e.message,true)}finally{sel.disabled=false}});td.appendChild(sel);row.appendChild(td);body.appendChild(row)}$('leadCount').textContent=l.length+' lead(s) from the selected authorized workspace.';msg('clientStatus','Workspace loaded.')}
$('signInTab').onclick=()=>{ $('loginForm').hidden=false;$('signup').hidden=true;$('signInTab').setAttribute('aria-selected','true');$('signUpTab').setAttribute('aria-selected','false')};$('signUpTab').onclick=()=>{$('loginForm').hidden=true;$('signup').hidden=false;$('signInTab').setAttribute('aria-selected','false');$('signUpTab').setAttribute('aria-selected','true')};
$('registerForm').onsubmit=async e=>{
  e.preventDefault();
  const button=$('submitRegistration'),status=$('registerStatus');
  if(!e.target.reportValidity())return;
  button.disabled=true;status.hidden=false;
  msg('registerStatus','Submitting your account registration…');
  const body={
    full_name:$('registerName').value.trim(),
    company_name:$('registerCompany').value.trim(),
    email:$('registerEmail').value.trim(),
    password:$('registerPassword').value
  };
  try {
    const result=await request('/auth/register','POST',body);
    if(result?.status!=='pending_review')throw Error('Registration response was not confirmed');
    $('registerPassword').value='';
    e.target.reset();
    msg('registerStatus',result.message || 'Registration received. Workspace access is pending approval.');
  } catch(err) {
    msg('registerStatus',err.message,true);
  } finally {
    body.password='';
    button.disabled=false;
  }
};
$('loginForm').onsubmit=async e=>{e.preventDefault();const attempt=++authVersion;$('submitLogin').disabled=true;msg('loginStatus','Checking your account…');try{const auth=await request('/auth/login','POST',{username:$('userName').value.trim(),password:$('password').value});if(attempt!==authVersion)return;if(!auth?.access_token)throw Error('Login response did not contain a session token');token=auth.access_token;const ms=await request('/me/workspaces');if(attempt!==authVersion)return;if(!Array.isArray(ms)||ms.length===0)throw Error('No approved client workspace was found for this account.');memberships=ms;$('workspace').replaceChildren(...ms.map(m=>new Option(m.name,m.id)));await load();if(attempt!==authVersion)return;$('password').value='';document.body.classList.add('authed');history.replaceState(null,'',location.pathname+'#workspace');$('crmWork').scrollIntoView({block:'nearest'});}catch(err){if(attempt===authVersion){signOut();$('submitLogin').disabled=false;msg('loginStatus',err.message,true)}}finally{if(attempt===authVersion)$('submitLogin').disabled=false}};
$('workspace').onchange=()=>load().catch(e=>msg('clientStatus',e.message,true));$('refresh').onclick=()=>load().catch(e=>msg('clientStatus',e.message,true));$('goCrm').onclick=()=>$('crmWork').scrollIntoView({behavior:'smooth'});$('signOut').onclick=()=>{const oldToken=token;signOut();if(oldToken){fetch(API+'/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+oldToken},cache:'no-store'}).catch(()=>{});}};$('leadForm').onsubmit=async e=>{e.preventDefault();if(!workspace)return;try{await request('/workspaces/'+encodeURIComponent(workspace)+'/leads','POST',{name:$('leadName').value.trim(),source:$('leadSource').value.trim()||null,stage:$('leadStage').value});$('leadForm').reset();await load();msg('clientStatus','Lead saved.')}catch(err){msg('clientStatus',err.message,true)}};

/* Scoped, deterministic pilot assistant. Never fabricates external metrics or calls a model. */
const answer=(value)=>{ $('assistantAnswer').textContent=value; };
const showPlanner=(show)=>{ $('budgetPlanner').hidden=!show; };
function respondToQuestion(question){
  if(!token||!workspace){answer('Sign in and select an authorized client workspace first.');return;}
  const q=question.toLowerCase().trim();
  if(!q){answer('Enter a question about your CRM or campaign planning.');return;}
  if(/\b(budget|reallocat|allocat|calculator|calculate|spend|investment)\b/.test(q)){
    showPlanner(true);
    answer('Use the calculator below to compare a proposed transfer between two channels. This does not estimate campaign results or spend money.');
    return;
  }
  showPlanner(false);
  if(/linkedin|instagram|facebook|meta ads|google ads|youtube|social|campaign|impressions|engagement|clicks|roas|cpc|ctr|email|newsletter|whatsapp|messaging|website|analytics/.test(q)){
    const names=Object.entries(channelStatus?.channels||{}).filter(([,status])=>status.status!=='connected').map(([name])=>name.replaceAll('_',' '));
    answer('Live cross-channel reporting is not currently available for '+workspace+'. '+(names.length?'Not connected: '+names.join(', ')+'. ':'No verified channel integration statuses loaded. ')+'I cannot verify spend, delivery, reach, clicks, conversions, CPL or ROI. Connect and authorize each data provider before relying on channel performance comparisons.');
    return;
  }
  if(/lead|pipeline|crm|opportunit|enquir|qualif|stage/.test(q)){
    if(!Array.isArray(lastLeads)){answer('CRM records are not loaded yet. Select an authorized workspace and use Refresh.');return;}
    const counts={}; for(const lead of lastLeads)counts[lead.stage]=(counts[lead.stage]||0)+1;
    const breakdown=Object.keys(counts).sort().map(k=>k.replaceAll('_',' ')+': '+counts[k]).join(' · ');
    answer('Verified CRM API records for your selected workspace: '+lastLeads.length+' lead(s).'+(breakdown?'\nStage breakdown: '+breakdown:'')+'\nThis is a current lead count, not an advertising conversion or attribution report.');
    return;
  }
  if(/connect|integration|available|module|service|tool/.test(q)){
    answer('Connected: the selected authorized CRM workspace. Pending: Instagram, Facebook, LinkedIn, YouTube, Google Ads, email, WhatsApp, website analytics, Audience Engine, Campaign Engine and Content Studio. AI analysis remains disabled pending approved credentials, permissions and usage budget. The planner is offline and never changes spending.');
    return;
  }
  answer('I can currently answer questions about loaded CRM leads, show connected-service status, and calculate an illustrative budget shift. I cannot provide free-form AI analysis or live marketing analytics until approved, tenant-authorized data and an AI answering service are connected.');
}
$('assistantForm').onsubmit=e=>{e.preventDefault();respondToQuestion($('assistantQuestion').value);};
document.querySelectorAll('[data-question]').forEach(btn=>btn.addEventListener('click',()=>{
  $('assistantQuestion').value=btn.dataset.question;respondToQuestion(btn.dataset.question);
}));
$('budgetCalculate').onclick=()=>{
  const total=Number($('budgetAmount').value);
  const share=Number($('budgetCurrentShare').value);
  const shift=Number($('budgetShift').value);
  const result=$('budgetResult');result.hidden=false;
  if(!$('budgetAmount').value||!Number.isFinite(total)||total<=0||total>100000000||
     !Number.isFinite(share)||share<0||share>100||
     !Number.isFinite(shift)||shift<0||shift>20||shift>share){
    result.textContent='Enter a budget between ₹1 and ₹10 crore, an allocation from 0–100%, and a shift from 0–20% that does not exceed Channel A’s current allocation.';
    return;
  }
  const fmt=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n);
  const from=share/100*total,change=shift/100*total;
  const a=Math.max(0,from-change),to=total-a;
  result.textContent='Illustrative monthly allocation (not a performance forecast):\nChannel A: '+fmt(from)+' → '+fmt(a)+'\nChannel B: '+fmt(total-from)+' → '+fmt(to)+'\nTransfer: '+fmt(change)+' ('+shift+'% of total budget).\nOverall budget remains '+fmt(total)+'. Actual ad accounts are unchanged.';
};

})();