/* Authenticated, tenant-scoped social/email/WhatsApp draft studio. No browser service keys. */
(() => {
 'use strict';
 const $ = id => document.getElementById(id);
 const services = $('services');
 if (!services || $('creative-studio')) return;
 const section = document.createElement('section');
 section.id='creative-studio';section.className='card m360-creative-panel';
 section.setAttribute('aria-labelledby','creative-studio-title');
 section.innerHTML =
 "<span class='eyebrow'>FOCUSED CONTENT CREATION</span>"+
 "<h2 id='creative-studio-title'>Messages, Posts &amp; Captions</h2>"+
 "<p>Create WhatsApp, LinkedIn or email messages, or prepare post copy for the visual editor. Nothing is sent or published automatically.</p>"+
 "<p id='creative-state' role='status' aria-live='polite'>Verifying your authorized business first…</p>"+
 "<form id='creative-form'>"+
 "<label for='creative-prompt'>Describe the content you want to create</label>"+
 "<textarea id='creative-prompt' required minlength='12' maxlength='900' rows='3' disabled placeholder='For example: A LinkedIn concept describing how our equipment helps distributors'></textarea>"+
 "<label for='creative-platform'>Content type</label><select id='creative-platform' disabled><optgroup label='Messages'><option>WhatsApp</option><option>LinkedIn</option><option>Email</option></optgroup><optgroup label='Posts'><option>Instagram</option><option>Facebook</option></optgroup></select>"+
 "<label class='m360-creative-confirm'><input type='checkbox' id='creative-confirm' disabled> I confirm this brief has no private customer data, contact details, trade secrets or unapproved claims.</label>"+
 "<button id='creative-submit' type='submit' class='btn primary' disabled>Generate editable content draft</button></form>"+
 "<section id='creative-result' hidden aria-label='Generated copy and creative plan for review'><h3 id='creative-result-title'>Content draft for review</h3>"+
 "<p id='creative-source'></p><p id='creative-subject'></p>"+
 "<h4>Hook lines for the post or message</h4><ol id='creative-headlines'></ol>"+
 "<div id='creative-scenes' hidden></div>"+
 "<p id='creative-caption'></p><label for='creative-draft-subject' id='creative-draft-subject-label' hidden>Email subject or video title</label><input id='creative-draft-subject' maxlength='140' hidden><label for='creative-draft-body'>Editable post or message draft</label><textarea id='creative-draft-body' rows='9' maxlength='5500' spellcheck='true'></textarea><div class='m360-copy-actions'><button class='btn primary' type='button' id='creative-copy-draft'>Copy content for review</button><span id='creative-draft-count'></span></div><p id='creative-draft-source'></p><p id='creative-note'></p></section>"+
 "<p class='m360-creative-disclaimer'>Channel-ready drafts only. The separate media controls generate images and reels when configured. All external sending and publishing require a human review and independently authorized channel integration.</p>";
 services.parentNode.insertBefore(section,services);
 const nav=document.querySelector('.workspace-nav');
 if(nav&&!nav.querySelector('a[href="#creative-studio"]')){
   const link=document.createElement('a');link.href='#creative-studio';link.textContent='Creative Studio';nav.append(link);
 }
 const style=document.createElement('style');
 style.textContent = ".m360-creative-panel label{display:block;margin:15px 0 5px;font-size:13px;font-weight:800}"+
 ".m360-creative-panel textarea,.m360-creative-panel select{width:100%;display:block;background:#fff}"+
 ".m360-creative-panel textarea{min-height:100px;resize:vertical}"+
 ".m360-creative-panel .m360-creative-confirm{display:flex;gap:12px;align-items:flex-start;font-weight:600;line-height:1.55}"+
 ".m360-creative-confirm input{width:19px;height:19px;min-height:19px;flex:none;margin-top:2px}"+
 ".m360-creative-panel #creative-state{border-left:4px solid #0b786b;background:#eaf4ee;padding:12px 15px;border-radius:8px}"+
 ".m360-creative-panel #creative-result{padding:18px;margin-top:18px;border-radius:14px;border:1px solid #d9e7df;background:#f8fbf8;overflow-wrap:anywhere}"+
 ".m360-creative-panel #creative-draft-body{min-height:210px;white-space:pre-wrap}"+
 ".m360-creative-panel #creative-result :is(input,textarea){width:100%;box-sizing:border-box}"+
 ".m360-copy-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:12px 0}#creative-draft-source{font-size:12px;color:#627875}"+
 ".m360-creative-panel .m360-creative-disclaimer{font-size:12px;color:#667b78;margin-top:15px;line-height:1.65}";
 document.head.append(style);
 let current='',ready=false,revision=0,busy=false,handoff=null;
 function status(message,problem=false,mode='checking'){
  const el=$('creative-state');el.textContent=message;el.style.borderLeftColor=problem?'#b15c35':'#0b786b';
  const chip=$('creative-feature-status'),description=$('creative-feature-description');
  const service=$('creative-service-status'),serviceDescription=$('creative-service-description');
  const names={checking:'CHECKING CONNECTION',ready:'PLAN CREATION READY',blocked:'SETUP REQUIRED',error:'CONNECTION ERROR',review:'DRAFT FOR REVIEW'};
  const label=names[mode]||names.checking;
  const journey=$('creative-journey-status');
  for(const badge of [chip,service,journey])if(badge){
    badge.textContent=label;badge.classList.toggle('tag-live',mode==='ready'||mode==='review');
    badge.classList.toggle('tag-pending',mode!=='ready'&&mode!=='review');
  }
  if(description)description.textContent=mode==='ready'?'Channel-specific content drafts can be generated and edited. Media capability is checked separately.':
     mode==='review'?'Channel draft generated and available for editing; not published or sent.':
     mode==='blocked'||mode==='error'?message:'Checking the Social Manager connection for this business.';
  if(serviceDescription)serviceDescription.textContent=mode==='ready'?'Draft generation is connected; sending and publishing require separate permission.':
     mode==='review'?'Editable content draft prepared; media creation is an independent workflow.':message;
 }
 function reset(){
  revision++;current='';ready=false;busy=false;handoff=null;$('creative-result').hidden=true;
  $('creative-form').reset();
  for(const id of ['creative-prompt','creative-platform','creative-confirm','creative-submit'])$(id).disabled=true;
  $('creative-draft-body').value='';$('creative-draft-subject').value='';$('creative-draft-subject').hidden=true;$('creative-draft-subject-label').hidden=true;
  status('Waiting for an authorized business workspace.',false,'checking');
 }
 function credential(){
  try{
   const token=sessionStorage.getItem('matrix360_pilot_token'),expiry=Number(sessionStorage.getItem('matrix360_pilot_expires_at'));
   return token&&Number.isFinite(expiry)&&expiry>Date.now()?token:null;
  }catch{return null}
 }
 async function call(method,ws,body,token){
  const url='/api/creative'+(method==='GET'?'?workspace_id='+encodeURIComponent(ws):'');
  const result=await fetch(url,{method,cache:'no-store',headers:{
   Authorization:'Bearer '+token,Accept:'application/json',
   ...(body?{'Content-Type':'application/json'}:{})
  },body:body?JSON.stringify(body):undefined});
  return {ok:result.ok,data:await result.json().catch(()=>({message:'Unexpected response from Creative Studio'}))};
 }
 document.addEventListener('m360:workspace-changing',reset);
 document.addEventListener('m360:session-ended',reset);
 document.addEventListener('m360:crm-loaded',async event=>{
  const ws=event?.detail?.workspace,token=credential();
  if(typeof ws!=='string'||!token||ws!==$('workspace')?.value)return reset();
  if(current===ws&&(busy||ready))return;
  const retained=$('creative-prompt').value,channel=$('creative-platform').value;
  reset();current=ws;$('creative-prompt').value=retained;$('creative-platform').value=channel;
  const seq=revision;status('Checking Creative Studio configuration…',false,'checking');
  try{
   const result=await call('GET',ws,null,token);
   if(seq!==revision||ws!==$('workspace')?.value||!credential())return;
   ready=result.ok&&result.data?.status==='connected_review_only'&&result.data?.creative_planning===true;
   status(ready?'Channel content generation is available for this authorized business.':
      (result.ok && result.data?.status==='connected_review_only'?'Staging reachable; content generation awaits approved planner configuration.':
      (result.data?.message||'Creative Studio not yet connected for this business.')),!ready,ready?'ready':'blocked');
   for(const id of ['creative-prompt','creative-platform','creative-confirm','creative-submit'])$(id).disabled=!ready;
  }catch{
   if(seq===revision){ready=false;status('Social Manager staging unavailable. No content generated.',true,'error');}
  }
 });
 const previewLabel=document.createElement('label');
 previewLabel.hidden=true;previewLabel.textContent='Email preview text';
 const previewInput=document.createElement('input');
 previewInput.id='creative-draft-preview';previewInput.maxLength=120;
 previewLabel.append(previewInput);$('creative-draft-body').before(previewLabel);
 $('creative-copy-draft').addEventListener('click',async()=>{
  const body=$('creative-draft-body').value,subject=$('creative-draft-subject').hidden?'':$('creative-draft-subject').value;
  const preview=$('creative-draft-preview');
  if($('creative-result').hidden||!credential()||current!==$('workspace')?.value)return status('Reopen an authorized business draft before copying.',true,'blocked');
  try{
    if(!navigator.clipboard?.writeText)throw Error('Clipboard permission unavailable.');
    await navigator.clipboard.writeText((subject?'Subject: '+subject+'\n'+(preview?.value?'Preview text: '+preview.value+'\n':'')+'\n':'')+body);
    status('Draft copied. Review claims, consent and recipient before use.',false,'review');
  }catch{status('Clipboard is unavailable. Select the text in the editable draft to copy manually.',true,'review');}
 });
 $('creative-draft-body').addEventListener('input',()=>{
  const v=$('creative-draft-body').value;
  const count=$('creative-draft-count'),limit=Number(count.dataset.limit);
  count.textContent=[...v].length+(limit?' / '+limit:'')+' characters'+(limit&&[...v].length>limit?' · shorten before use':'');
 });
 document.addEventListener('m360:copy-brief',event=>{
  if(event.detail?.workspace!==$('workspace')?.value||!credential()||busy)return;
  handoff=event.detail.workflow_id?{...event.detail}:null;
  $('creative-prompt').value=String(event.detail.prompt||'').slice(0,900);
  const channel=$('creative-platform');
  if(Array.from(channel.options).some(option=>option.value===event.detail.channel))channel.value=event.detail.channel;
  $('creative-confirm').checked=false;
  $('creative-prompt').focus({preventScroll:true});
 });
 $('creative-form').addEventListener('submit',async e=>{
  e.preventDefault();const ws=$('workspace')?.value,token=credential(),prompt=$('creative-prompt').value.trim();
  if(!ready||busy||!ws||ws!==current||!token||!$('creative-confirm').checked)return;
  if(prompt.length<12||prompt.length>900){status('Brief must be 12–900 characters.',true,'ready');return;}
  const seq=revision;busy=true;$('creative-submit').disabled=true;$('creative-result').hidden=true;
  status('Generating channel-specific content and creative direction…',false,'checking');
  try{
   const response=await call('POST',ws,{workspace_id:ws,prompt,platform:$('creative-platform').value},token);
   if(seq!==revision||ws!==current||!credential())return;
   if(!response.ok)throw Error(response.data?.message||'Creative planner not available.');
   const d=response.data;
   if(d.status!=='review_only'||d.workspace_id!==ws)throw Error('Unexpected creative result');
   $('creative-subject').textContent=d.subject?'Subject: '+d.subject:'';
   const generated=d.generation==='configured_model';
   $('creative-result-title').textContent=generated?'Generated content for review':'Starter draft for review';
   $('creative-source').textContent=generated?'Source: AI writing model':'AI writing was unavailable for this request. Edit this starter draft or try generating again.';
   $('creative-caption').textContent='Suggested caption: '+(d.caption||'Not supplied');
   const copy=d.channel_draft;
   if(!copy||copy.status!=='draft_for_review'||copy.channel!==$('creative-platform').value||typeof copy.body!=='string'||!copy.body.trim())throw Error('Channel copy was not returned by Social Manager integration.');
   $('creative-draft-subject').hidden=!copy.subject;$('creative-draft-subject-label').hidden=!copy.subject;
   $('creative-draft-subject').value=copy.subject||'';
   $('creative-draft-body').value=copy.body;
   const count=$('creative-draft-count');count.dataset.limit=String(copy.limit);
   const preview=$('creative-draft-preview');preview.value=copy.preview_text||'';preview.parentElement.hidden=copy.channel!=='Email';
   $('creative-draft-count').textContent=[...copy.body].length+' / '+copy.limit+' characters';
   $('creative-draft-source').textContent=copy.disclosure||'Draft for human review only.';
   $('creative-note').textContent=d.note||'Draft only; no messages sent.';
   for(const [id,items,render] of [
      ['creative-headlines',d.headlines,x=>String(x).slice(0,120)],
      ['creative-scenes',d.scenes,x=>String(x?.headline||'')+' — '+String(x?.visual||'')]
   ]){
    const list=$(id);list.replaceChildren();
    for(const item of Array.isArray(items)?items:[]){const li=document.createElement('li');li.textContent=render(item);list.append(li);}
   }
   $('creative-result').hidden=false;
   document.dispatchEvent(new CustomEvent('m360:creative-draft-ready',{detail:{
     workspace:ws,platform:$('creative-platform').value,prompt,
     headline:Array.isArray(d.headlines)?String(d.headlines[0]||d.subject||''):String(d.subject||''),
     cta:d.cta||'Explore more'
   }}));
   if(handoff)document.dispatchEvent(new CustomEvent('m360:content-draft-ready',{detail:{workspace:ws,workflow_id:handoff.workflow_id,channel:copy.channel,subject:copy.subject||'',preview_text:copy.preview_text||'',body:copy.body}}));
   status(generated?'Editable '+copy.channel+' draft created for review.':'Editable '+copy.channel+' starter draft ready for your details.',false,'review');
  }catch(err){if(seq===revision)status(err.message||'No creative plan generated.',true,'error');}
  finally{if(seq===revision){busy=false;$('creative-submit').disabled=!ready;}}
 });
 const returnButton=document.createElement('button');returnButton.type='button';returnButton.textContent='Return edited draft to campaign';returnButton.hidden=true;
 $('creative-copy-draft').after(returnButton);
 document.addEventListener('m360:copy-brief',event=>{returnButton.hidden=!event.detail?.workflow_id;});
 for(const event of ['m360:workspace-changing','m360:session-ended'])document.addEventListener(event,()=>{returnButton.hidden=true;});
 returnButton.addEventListener('click',()=>{
   if(!handoff||busy||$('creative-result').hidden||handoff.workspace!==current||!credential())return;
   document.dispatchEvent(new CustomEvent('m360:content-draft-ready',{detail:{workspace:current,workflow_id:handoff.workflow_id,channel:$('creative-platform').value,subject:$('creative-draft-subject').value,preview_text:$('creative-draft-preview').value,body:$('creative-draft-body').value}}));
   window.Matrix360Router?.navigateToPage(handoff.return_to, handoff.return_to==='overview'?'#m360-overview-control':'#marketing-centre');
 });
})();
