(()=>{'use strict';const API=window.Matrix360ApiBase;const $=id=>document.getElementById(id);let token=null,expiresAt=0,crmSummary=null;try{token=sessionStorage.getItem('matrix360_pilot_token');expiresAt=Number(sessionStorage.getItem('matrix360_pilot_expires_at'));if(!token||!Number.isFinite(expiresAt)||expiresAt<=Date.now()){token=null;expiresAt=0;sessionStorage.removeItem('matrix360_pilot_token');sessionStorage.removeItem('matrix360_pilot_expires_at')}}catch{token=null;expiresAt=0}let workspace='',memberships=[],stages=[],generation=0,expiryTimer=null,workspaceReady=false;
const endSession=()=>{
  ++generation;
  if(expiryTimer!==null){clearTimeout(expiryTimer);expiryTimer=null;}
  token=null;expiresAt=0;crmSummary=null;workspace='';memberships=[];stages=[];workspaceReady=false;
  if($('add-form')) $('add-form').querySelector('button[type=submit]').disabled=true;
  try{sessionStorage.removeItem('matrix360_pilot_token');sessionStorage.removeItem('matrix360_pilot_expires_at');}catch{}
  $('lead-list')?.replaceChildren();$('lead-stage')?.replaceChildren();$('workspace')?.replaceChildren();
  $('add-form')?.reset();
  if($('who'))$('who').textContent='';
  if($('workspace-single-name'))$('workspace-single-name').textContent='';
  if($('count'))$('count').textContent='—';
  if($('summary-lead-count'))$('summary-lead-count').textContent='—';
  $('verified')?.classList.add('hidden');$('loading')?.classList.add('hidden');$('denied')?.classList.remove('hidden');
  if($('denied-msg'))$('denied-msg').textContent='Session ended or workspace access removed. Please sign in again.';
  document.dispatchEvent(new Event('m360:session-ended'));
};
const armExpiry=()=>{
  if(!token||!expiresAt)return;
  const remaining=expiresAt-Date.now();
  if(remaining<=0){endSession();return;}
  expiryTimer=setTimeout(()=>{
    expiryTimer=null;
    if(!token)return;
    if(Date.now()>=expiresAt)endSession();else armExpiry();
  },Math.min(remaining,2147483647));
};
armExpiry();const status=(msg,bad=false)=>{$('status').textContent=msg;$('status').className=bad?'error':'ok'};const val=x=>String(x??'');const el=(tag,t)=>{const n=document.createElement(tag);n.textContent=val(t);return n};const denied=(m)=>{$('loading').classList.add('hidden');$('verified').classList.add('hidden');$('denied').classList.remove('hidden');$('denied-msg').textContent=m};async function api(path,method='GET',body){if(!API)throw Error(window.Matrix360ApiConfigError||'CRM connection is unavailable.');if(!token||!expiresAt||Date.now()>=expiresAt){token=null;sessionStorage.removeItem('matrix360_pilot_token');sessionStorage.removeItem('matrix360_pilot_expires_at');endSession();throw Error('Your session has expired. Please sign in again.')}const resp=await fetch(API+path,{method,headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});if(resp.status===401){endSession();throw Error('Your session has expired. Please sign in again.')}
const deniedRead = method==='GET' ? /^\/workspaces\/([^/]+)\/(stages|leads)$/.exec(path) : null;
if(resp.status===403 && deniedRead && decodeURIComponent(deniedRead[1])===workspace){
  // Denial on a protected CRM *read* indicates the active workspace cannot be safely displayed.
  // Do not treat 403 on optional features or writes as proof that all membership has been revoked.
  endSession();throw Error('Access to the active workspace is no longer authorized. Please sign in again.');
}const data=await resp.json().catch(()=>null);if(!resp.ok)throw Error((data&&typeof data.detail==='string')?data.detail:'Service returned '+resp.status);return data}async function load(){const seq=++generation;const id=$('workspace').value;if(!memberships.some(m=>m.id===id))throw Error('Workspace is not authorized');workspace=id; workspaceReady=false; stages=[];
$('lead-stage').replaceChildren();
$('add-form').querySelector('button[type=submit]').disabled=true;
$('lead-list').replaceChildren(el('div','Checking authorized workspace records…'));
$('count').textContent='—';
if($('summary-lead-count'))$('summary-lead-count').textContent='—';
crmSummary=null;
document.dispatchEvent(new Event('m360:crm-evidence-invalidated'));
status('Loading your workspace…');const key=encodeURIComponent(id);
let ss, leads;
try {
 [ss,leads]=await Promise.all([api('/workspaces/'+key+'/stages'),api('/workspaces/'+key+'/leads')]);
} catch (error) {
 if(seq!==generation)return; // A previous workspace's request must not overwrite the new workspace's status.
const retry=el('button','Retry loading pipeline');
retry.type='button';retry.className='btn';
retry.addEventListener('click',()=>load().catch(e=>status(e.message,true)));
$('lead-list').replaceChildren(el('p','CRM records could not be loaded. Please retry.'),retry);
crmSummary={workspace:id,unavailable:true};
document.dispatchEvent(new CustomEvent('m360:crm-unavailable',{detail:crmSummary}));
 throw error;
}
if(seq!==generation)return;if(!Array.isArray(ss)||!Array.isArray(leads))throw Error('Unexpected CRM response');stages=ss;$('lead-stage').replaceChildren(...ss.map(x=>new Option(x.replaceAll('_',' '),x)));
workspaceReady=true;
$('add-form').querySelector('button[type=submit]').disabled=false;$('count').textContent=leads.length+' leads';const leadSummary=$('summary-lead-count');if(leadSummary)leadSummary.textContent=leads.length+' '+(leads.length===1?'lead':'leads');const node=$('lead-list');node.replaceChildren();if(!leads.length){const none=el('div','No leads yet. Add your first lead using the form below.');none.className='empty';node.append(none)}else{const tbl=el('table');const head=el('thead');const hr=el('tr');for(const h of ['Lead','Source','Stage'])hr.append(el('th',h));head.append(hr);tbl.append(head);const body=el('tbody');for(const lead of leads){const tr=el('tr');tr.append(el('td',lead.name),el('td',lead.source||'—'));const cell=el('td');const sel=el('select');sel.setAttribute('aria-label','Stage for '+val(lead.name));for(const stage of ss)sel.append(new Option(stage.replaceAll('_',' '),stage));sel.value=lead.stage;tr.dataset.pipelineStage=lead.stage||'unknown';tr.dataset.pipelineSource=leadSourceCounts([lead])[0]?.label||'';sel.addEventListener('change',async()=>{sel.disabled=true;try{await api('/workspaces/'+encodeURIComponent(id)+'/leads/'+encodeURIComponent(lead.id),'PATCH',{stage:sel.value});await load()}catch(e){status(e.message,true)}finally{sel.disabled=false}});cell.append(sel);tr.append(cell);body.append(tr)}tbl.append(body);node.append(tbl)}status('Showing authorized CRM records.');crmSummary={workspace:id,total:leads.length,stages:ss,creationDays:leadCreationDays(leads),sources:leadSourceCounts(leads),stageCounts:leads.reduce((counts,lead)=>{const stage=String(lead.stage||'unknown');counts[stage]=(counts[stage]||0)+1;return counts},Object.create(null))};document.dispatchEvent(new CustomEvent('m360:crm-loaded',{detail:crmSummary}));}async function begin(){if(!token){denied('You must sign in with an approved client account.');return}try{memberships=await api('/me/workspaces');if(!Array.isArray(memberships)||!memberships.length)throw Error('No authorized client workspace is assigned to this account.');$('workspace').replaceChildren(...memberships.map(m=>new Option(m.name,m.id)));const switcher=$('workspace-selector-row'),business=$('workspace-single-name');if(switcher)switcher.classList.toggle('hidden',memberships.length===1);if(business)business.textContent=memberships.length===1?memberships[0].name:'Multiple authorized businesses';$('who').textContent='Client access verified';$('loading').classList.add('hidden');$('verified').classList.remove('hidden');}catch(e){denied(e.message);return;}
await load().catch(e=>status(e.message,true));
}$('workspace').addEventListener('change',()=>{++generation;document.dispatchEvent(new Event('m360:workspace-changing'));workspaceReady=false;stages=[];
$('lead-stage').replaceChildren();
$('add-form').reset();
$('add-form').querySelector('button[type=submit]').disabled=true;
$('lead-list').replaceChildren(el('div','Loading authorized workspace records…'));$('count').textContent='—';const summary=$('summary-lead-count');if(summary)summary.textContent='—';const business=$('workspace-single-name');if(business&&memberships.length>1){const selected=memberships.find(m=>m.id===$('workspace').value);business.textContent=selected?selected.name:'Select an authorized business'}load().catch(e=>status(e.message,true))});$('refresh').addEventListener('click',()=>load().catch(e=>status(e.message,true)));$('add-form').addEventListener('submit',async e=>{e.preventDefault();try{
 if(!workspaceReady||!memberships.some(m=>m.id===workspace)||!stages.includes($('lead-stage').value))
  throw Error('Wait for the authorized workspace and its pipeline stages to finish loading.');
 await api('/workspaces/'+encodeURIComponent(workspace)+'/leads','POST',{name:$('lead-name').value.trim(),source:$('lead-source').value.trim()||null,stage:$('lead-stage').value});$('add-form').reset();await load()}catch(err){status(err.message,true)}});$('logout').addEventListener('click',async()=>{try{if(token)await api('/auth/logout','POST')}catch{}finally{sessionStorage.removeItem('matrix360_pilot_token');sessionStorage.removeItem('matrix360_pilot_expires_at');token=null;endSession();location.replace('login.html')}});if (window.Matrix360AI) window.Matrix360AI.mount({api, getWorkspace:()=>workspace});
// Keep source labels and counts in the active workspace, without sending lead records to the overview.
function leadSourceCounts(leads){
 const labels=new Map([
  ['csv import','CSV import'],['google maps','Google Maps'],['manual','Manual entry'],['manual entry','Manual entry'],
  ['matrix 360 verified discovery','Matrix360 discovery'],['verified business listing','Verified business listing'],
  ['website','Website'],['website enquiry','Website'],['referral','Referral'],['linkedin','LinkedIn']
 ]);
 const groups=new Map();
 for(const lead of leads){
  const value=typeof lead.source==='string'?lead.source.trim():'';
  const category=value.split('|',1)[0].trim().toLowerCase().replace(/[_\s]+/g,' ');
  // Discovery can store a contact name, phone, email and website in the source field.
  const contact= /[|@]|https?:\/\/|^\+?[\d() .-]{7,}$/i.test(value);
  const label=!value?'':labels.get(category)||(contact?'Contact details only':'Other recorded entries');
  groups.set(label,(groups.get(label)||0)+1);
 }
 return [...groups].map(([label,count])=>({label,count}));
}
// Send only daily counts to the overview, without individual lead details.
function leadCreationDays(leads, now=Date.now()){
 const counts=Object.create(null);
 for(const lead of leads){
  const value=lead.created_at;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(value))continue;
  const created=new Date(value);
  if(!Number.isFinite(+created)||+created>now)continue;
  const day=Date.UTC(created.getFullYear(),created.getMonth(),created.getDate())/86400000;
  counts[day]=(counts[day]||0)+1;
 }
 return counts;
}
document.addEventListener('m360:request-crm-summary',()=>{if(crmSummary?.workspace===$('workspace').value)document.dispatchEvent(new CustomEvent('m360:crm-summary',{detail:crmSummary}));});
begin()
// Local, explainable goal guide. No API request and no session persistence.
const goalGuide={
 enquiries:{status:'CRM available',live:true,title:'Start by capturing every enquiry',detail:'Keep a clean pipeline now. Audience discovery and campaign integrations will become available after authorization and testing.',label:'Add an enquiry →',href:'#add-form'},
 conversion:{status:'CRM available',live:true,title:'Review and progress your existing leads',detail:'Use the authorized sales pipeline to track the next action for each enquiry. Conversion predictions are not yet available.',label:'Review my pipeline →',href:'#leads'},
 campaign:{status:'Check connection',live:false,title:'Prepare your creative brief',detail:'Open Creative Studio to verify planning and media-generation availability for your business. Campaign publishing and dispatch are not connected.',label:'Open Creative Studio →',href:'#creative-studio'}
};
for(const b of document.querySelectorAll('[data-goal]'))b.addEventListener('click',()=>{
 const item=goalGuide[b.dataset.goal];if(!item)return;
 for(const other of document.querySelectorAll('[data-goal]')){const active=other===b;other.setAttribute('aria-pressed',String(active));other.classList.toggle('selected',active)}
 const state=$('goal-state');state.textContent=item.status;state.className='tag '+(item.live?'tag-live':'tag-pending');
 $('goal-result-title').textContent=item.title;$('goal-result-detail').textContent=item.detail;
 const action=$('goal-result-link');action.textContent=item.label;action.setAttribute('href',item.href);
});
})();

/* ── Sidebar Scroll-Spy for client-dashboard.html ──
   Purely cosmetic: transfers the green active-pill highlight across the
   workspace-nav sidebar links as the user scrolls, clicks, or arrives
   via a #hash URL.  Zero functional / API / DOM-contract changes.        */
(function m360DashboardScrollSpy() {
  'use strict';

  /* --- constants -------------------------------------------------------- */
  var ACTIVE_CLS = 'active';            // the class that gives the green pill
  var ARIA_VAL   = 'page';              // value for aria-current on the active link
  var TRIGGER    = 0.35;                // 35 % from viewport top
  var CLICK_LOCK = 600;                 // ms to suppress scroll-spy after a click

  /* --- state ------------------------------------------------------------ */
  var nav, links, pairs;                // discovered at boot / re-scan
  var clickLock  = false;
  var lockTimer  = null;
  var rafPending = false;

  /* --- helpers ---------------------------------------------------------- */
  function discoverLinks() {
    nav = document.querySelector('.workspace-nav');
    if (!nav) return false;
    links = Array.from(nav.querySelectorAll('a[href^="#"]'));
    pairs = [];
    links.forEach(function (a) {
      var id = a.getAttribute('href').replace(/^#/, '');
      var el = id ? document.getElementById(id) : null;
      if (el) pairs.push({ link: a, section: el });
    });
    pairs.sort(function (a, b) {
      return (a.section.compareDocumentPosition(b.section) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });
    return pairs.length > 0;
  }

  function setActive(targetLink) {
    links.forEach(function (a) {
      var on = a === targetLink;
      a.classList.toggle(ACTIVE_CLS, on);
      if (on)  a.setAttribute('aria-current', ARIA_VAL);
      else     a.removeAttribute('aria-current');
    });
  }

  /* --- scroll position → active link ------------------------------------ */
  function updateFromScroll() {
    if (clickLock) return;

    var triggerY = window.innerHeight * TRIGGER;

    // at bottom? → last section
    if (window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 24) {
      setActive(pairs[pairs.length - 1].link);
      return;
    }

    // near top? → first section ("Overview")
    if (window.scrollY < 120) {
      setActive(pairs[0].link);
      return;
    }

    var best = pairs[0];
    for (var i = 0; i < pairs.length; i++) {
      if (pairs[i].section.getBoundingClientRect().top <= triggerY) {
        best = pairs[i];
      }
    }
    setActive(best.link);
  }

  function onScroll() {
    if (!rafPending) {
      rafPending = true;
      window.requestAnimationFrame(function () {
        rafPending = false;
        updateFromScroll();
      });
    }
  }

  /* --- click handler for sidebar links ---------------------------------- */
  function onNavClick(e) {
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a || !nav.contains(a)) return;
    var id = a.getAttribute('href').replace(/^#/, '');
    var el = id ? document.getElementById(id) : null;
    if (!el) return;

    e.preventDefault();
    clickLock = true;
    clearTimeout(lockTimer);
    setActive(a);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', '#' + id);
    lockTimer = setTimeout(function () {
      clickLock = false;
      updateFromScroll();
    }, CLICK_LOCK);
  }

  /* --- initial hash handling -------------------------------------------- */
  function applyHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h) return;
    for (var i = 0; i < pairs.length; i++) {
      if (pairs[i].section.id === h) { setActive(pairs[i].link); return; }
    }
  }

  /* --- boot / re-boot --------------------------------------------------- */
  function boot() {
    if (!discoverLinks()) return;

    // capture-phase scroll listener catches scroll on ANY element
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    window.addEventListener('hashchange', function () {
      if (!clickLock) { discoverLinks(); applyHash(); }
    });

    nav.addEventListener('click', onNavClick);

    applyHash();
    updateFromScroll();
  }

  /* Re-scan when new sidebar links appear (Creative Studio, Brand Profile)
     or when the authenticated workspace content becomes visible.           */
  function reBoot() {
    if (discoverLinks()) { applyHash(); updateFromScroll(); }
  }

  // Run after all synchronous scripts have executed
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Re-discover after dynamically injected sections appear
  document.addEventListener('m360:crm-loaded',   reBoot);
  document.addEventListener('m360:session-ended', reBoot);

  // MutationObserver on .workspace-nav to catch dynamically-added links
  var moTimer = null;
  var observer = new MutationObserver(function () {
    clearTimeout(moTimer);
    moTimer = setTimeout(reBoot, 60);
  });
  function observeNav() {
    var target = document.querySelector('.workspace-nav');
    if (target) observer.observe(target, { childList: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeNav);
  } else {
    observeNav();
  }
})();
