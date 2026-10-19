/* Matrix 360 client access pilot: in-memory credentials only; no client session is trusted from localStorage. */
(()=>{'use strict';const $=id=>document.getElementById(id);const API='https://matrix360-crm-backend-p9os.onrender.com';let token=null,workspace=null,memberships=[],stages=[],version=0,authVersion=0,lastLeads=null,channelStatus=null,approvalVersion=0;
const msg=(id,text,error=false)=>{const el=$(id);el.textContent=text;el.style.color=error?'#ac342e':'#0b7162'};
async function request(path,method='GET',body){const headers={...(token?{Authorization:'Bearer '+token}:{})};if(body!==undefined)headers['Content-Type']='application/json';let res;try{res=await fetch(API+path,{method,headers,cache:'no-store',body:body===undefined?undefined:JSON.stringify(body)});}catch{throw Error('Service temporarily unreachable. Please try again later.')}let value=null;try{value=await res.json()}catch{}if(res.status===401&&token){signOut();throw Error('Your session expired. Please sign in again.')}if(!res.ok)throw Error(typeof value?.detail==='string'?value.detail:'Service error '+res.status);return value}
function signOut(){++authVersion;++version;++approvalVersion;token=null;workspace=null;lastLeads=null;channelStatus=null;memberships=[];stages=[];$('approvalPanel').hidden=true;$('approvalRows').replaceChildren();$('password').value='';$('leadRows').replaceChildren();document.body.classList.remove('authed');history.replaceState(null,'',location.pathname);}
async function load(){const id=$('workspace').value;if(!memberships.some(x=>x.id===id))throw Error('Workspace not authorized');workspace=id;lastLeads=null;channelStatus=null;const v=++version;const url='/workspaces/'+encodeURIComponent(id);const [s,l,status]=await Promise.all([request(url+'/stages'),request(url+'/leads'),request(url+'/channel-status')]);if(v!==version)return;if(!Array.isArray(s)||!Array.isArray(l))throw Error('Unexpected data format');if(status?.workspace_id!==id||status?.crm?.status!=='connected')throw Error('CRM connection status could not be verified');stages=s;lastLeads=l;channelStatus=status;$('leadStage').replaceChildren(...s.map(x=>new Option(x.replaceAll('_',' '),x)));const body=$('leadRows');body.replaceChildren();for(const lead of l){const row=document.createElement('tr');for(const x of [lead.name,lead.source||'—',lead.stage]){const td=document.createElement('td');td.textContent=x||'—';row.appendChild(td)}const td=document.createElement('td');const sel=document.createElement('select');sel.setAttribute('aria-label','Update stage for '+lead.name);for(const st of s)sel.add(new Option(st.replaceAll('_',' '),st));sel.value=lead.stage;sel.addEventListener('change',async()=>{sel.disabled=true;try{await request(url+'/leads/'+encodeURIComponent(lead.id),'PATCH',{stage:sel.value});await load();msg('clientStatus','Lead stage updated')}catch(e){msg('clientStatus',e.message,true)}finally{sel.disabled=false}});td.appendChild(sel);row.appendChild(td);body.appendChild(row)}$('leadCount').textContent=l.length+' lead(s) from the selected authorized workspace.';msg('clientStatus','Workspace loaded.')}
$('signInTab').onclick=()=>{ $('loginForm').hidden=false;$('signup').hidden=true;$('signInTab').setAttribute('aria-selected','true');$('signUpTab').setAttribute('aria-selected','false')};$('signUpTab').onclick=()=>{$('loginForm').hidden=true;$('signup').hidden=false;$('signInTab').setAttribute('aria-selected','false');$('signUpTab').setAttribute('aria-selected','true')};
$('resendForm').onsubmit=async e=>{
  e.preventDefault();
  const email=$('resendEmail').value.trim(),button=$('resendButton');
  if(!email||!e.target.reportValidity())return;
  button.disabled=true;
  msg('resendStatus','Requesting verification…');
  try {
    const reply=await request('/auth/resend-verification','POST',{email});
    if(reply?.status!=='request_received')throw Error('Verification request was not acknowledged');
    msg('resendStatus',reply.message || 'Request acknowledged. Check your inbox and Spam folder.');
  } catch(err) {
    msg('resendStatus',err.message,true);
  } finally {
    button.disabled=false;
  }
};
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
async function loadApprovals(){
  const current=++approvalVersion;
  const data=await request('/admin/registration-requests');
  if(current!==approvalVersion||!token)return;
  if(!data||!Array.isArray(data.pending)||!Array.isArray(data.approvable_workspaces))
    throw Error('Invalid administrator review response');
  const tbody=$('approvalRows');tbody.replaceChildren();
  if(!data.pending.length){
    msg('approvalStatus','No pending client registrations.');return;
  }
  const spaces=data.approvable_workspaces;
  for(const applicant of data.pending){
    const row=document.createElement('tr');
    for(const value of [applicant.full_name||'Unnamed applicant',applicant.company_name||'Unspecified business']){
      const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell);
    }
    const workCell=document.createElement('td'),choose=document.createElement('select');
    choose.setAttribute('aria-label','Assign workspace for '+(applicant.full_name||'applicant'));
    for(const id of spaces)choose.add(new Option(id.replaceAll('_',' '),id));
    workCell.appendChild(choose);row.appendChild(workCell);
    const actions=document.createElement('td');
    for(const [label,decision] of [['Approve',true],['Reject',false]]){
      const button=document.createElement('button');button.type='button';button.className='btn';
      button.textContent=label;button.style.margin='2px';
      button.addEventListener('click',async()=>{
        const selected=choose.value;
        const verb=decision?'approve':'reject';
        if(!window.confirm('Confirm '+verb+' for '+(applicant.full_name||'this applicant')+
          (decision?' in workspace '+selected:'')+'?'))return;
        button.disabled=true;
        try{
          const output=await request('/admin/registration-requests/review','POST',{
            user_id:applicant.user_id,workspace_id:selected,approve:decision});
          if(output?.status!==(decision?'approved':'rejected'))throw Error('Unexpected approval response');
          await loadApprovals();
          msg('approvalStatus','Registration '+output.status+'.');
        }catch(err){msg('approvalStatus',err.message,true)}
        finally{button.disabled=false}
      });
      actions.appendChild(button);
    }
    row.appendChild(actions);tbody.appendChild(row);
  }
  msg('approvalStatus',data.pending.length+' pending registrations. Verify business identity before approval.');
}
$('refreshApprovals').onclick=()=>loadApprovals().catch(err=>msg('approvalStatus',err.message,true));
$('loginForm').onsubmit=async e=>{e.preventDefault();const attempt=++authVersion;$('submitLogin').disabled=true;msg('loginStatus','Checking your account…');try{const auth=await request('/auth/login','POST',{username:$('userName').value.trim(),password:$('password').value});if(attempt!==authVersion)return;if(!auth?.access_token)throw Error('Login response did not contain a session token');token=auth.access_token;const ms=await request('/me/workspaces');if(attempt!==authVersion)return;if(!Array.isArray(ms)||ms.length===0){const registration=await request('/me/registration');if(attempt!==authVersion)return;throw Error(registration?.status==='pending'?'Your account is registered but awaiting administrator approval.':registration?.status==='rejected'?'Your access request was not approved. Contact Matrix 360 support.':'No approved client workspace was found for this account.');}memberships=ms;$('workspace').replaceChildren(...ms.map(m=>new Option(m.name,m.id)));await load();if(attempt!==authVersion)return;const isAdmin=ms.some(m=>['platform_owner','agency_admin'].includes(m.role));$('approvalPanel').hidden=!isAdmin;if(isAdmin)loadApprovals().catch(err=>msg('approvalStatus',err.message,true));if(attempt!==authVersion)return;$('password').value='';document.body.classList.add('authed');history.replaceState(null,'',location.pathname+'#workspace');$('crmWork').scrollIntoView({block:'nearest'});}catch(err){if(attempt===authVersion){signOut();$('submitLogin').disabled=false;msg('loginStatus',err.message,true)}}finally{if(attempt===authVersion)$('submitLogin').disabled=false}};
$('workspace').onchange=()=>load().catch(e=>msg('clientStatus',e.message,true));$('refresh').onclick=()=>load().catch(e=>msg('clientStatus',e.message,true));$('goCrm').onclick=()=>$('crmWork').scrollIntoView({behavior:'smooth'});$('signOut').onclick=()=>{const oldToken=token;signOut();if(oldToken){fetch(API+'/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+oldToken},cache:'no-store'}).catch(()=>{});}};$('leadForm').onsubmit=async e=>{e.preventDefault();if(!workspace)return;try{await request('/workspaces/'+encodeURIComponent(workspace)+'/leads','POST',{name:$('leadName').value.trim(),source:$('leadSource').value.trim()||null,stage:$('leadStage').value});$('leadForm').reset();await load();msg('clientStatus','Lead saved.')}catch(err){msg('clientStatus',err.message,true)}};

/* Scoped, deterministic pilot assistant. Never fabricates external metrics or calls a model. */
const answer=(value)=>{ $('assistantAnswer').textContent=value; };
const showPlanner=(show)=>{ $('budgetPlanner').hidden=!show; };
async function respondToQuestion(question){
  if(!token||!workspace){answer('Sign in and select an authorized client workspace first.');return;}
  const q=question.trim();
  if(!q){answer('Enter a question about your CRM or campaign planning.');return;}
  if(/\\b(budget|reallocat|allocat|calculator|calculate|spend|investment)\\b/i.test(q)){
    showPlanner(true);
    answer('Use the conservative planning calculator below. It changes no advertising budgets and does not estimate results.');
    return;
  }
  showPlanner(false);
  const requestVersion=version,requestWorkspace=workspace;
  answer('Checking approved workspace data…');
  try{
    const result=await request('/workspaces/'+encodeURIComponent(requestWorkspace)+'/assistant/ask','POST',{question:q});
    if(requestVersion!==version||requestWorkspace!==workspace||!token)return;
    if(!result||typeof result.answer!=='string'||!['authorized_crm','capability_registry'].includes(result.response_source))
      throw Error('The assistant returned an unverified response');
    const evidence=Array.isArray(result.evidence)?result.evidence:[];
    if(!evidence.some(e=>e&&e.workspace_id===requestWorkspace))throw Error('The assistant response is missing workspace evidence');
    answer(result.answer+'\\n\\nSource: '+(result.response_source==='authorized_crm'?'Your authorized CRM records':'Workspace integration availability')+'. AI model usage: none.');
  }catch(err){
    if(requestVersion===version&&requestWorkspace===workspace&&token)
      answer('I could not verify a response from the CRM service. '+err.message);
  }
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