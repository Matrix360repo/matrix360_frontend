/* Explicit media generation: real server-side jobs, honest progress and signed preview.
   No media generation on load, no automatic posting, no keys in browser. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const host=$('creative-studio');
 if(!host||$('m360-media-panel'))return;
 const pane=document.createElement('section');
 pane.id='m360-media-panel';
 pane.setAttribute('aria-labelledby','m360-media-title');
 pane.innerHTML=
 "<h3 id='m360-media-title'>15-second motion reel</h3>"+
 "<p>Create a short motion graphic from the selected business brief. Reel generation requires authorized narration, music and private storage.</p>"+
 "<p role='status' id='m360-media-state'>Waiting for workspace verification…</p>"+
 "<div class='m360-media-actions'><button class='btn primary' id='m360-make-reel' type='button' disabled>Render a 15-second MP4 reel</button></div>"+
 "<p class='m360-media-hint' id='m360-media-hint'>Create and compare AI image posts above. This separate reel workflow requires the Social Manager to verify narration, music and durable storage. Nothing is published automatically.</p>"+
 "<div id='m360-media-results' aria-live='polite'></div>";
 const prompt=$('creative-form');
 prompt.after(pane);
 const style=document.createElement('style');
 style.textContent=
 ".m360-media-actions{display:flex;flex-wrap:wrap;gap:12px;margin:14px 0}"+
 ".m360-media-hint{font-size:12px;color:#697a78}#m360-media-panel{margin-top:22px;padding-top:22px;border-top:1px solid #d9e7df}"+
 "#m360-media-results{display:grid;gap:14px;margin-top:16px}"+
 ".m360-media-preview{padding:16px;border:1px solid #d7e6da;background:#f7faf6;border-radius:12px}"+
 ".m360-media-preview video,.m360-media-preview img{display:block;width:min(100%,360px);max-height:560px;object-fit:contain;background:#111;margin:10px 0;border-radius:9px}"+
 ".m360-media-preview .m360-media-label{font-size:12px;color:#596a69;overflow-wrap:anywhere}";
 document.head.append(style);
 let workspace='',generation=0,busy=false,canReel=false,canImage=false,activeVerification=null,capabilityChecked=false,checking=false;
 const mediaChannels=new Set(['Instagram','Facebook','LinkedIn','X','YouTube']);
 const visualChannel=()=>mediaChannels.has($('creative-platform')?.value);
 const controls=()=>{$('m360-make-reel').disabled=busy||!canReel||!visualChannel();};
 $('creative-platform')?.addEventListener('change',()=>{
   controls();
   if(busy||!canReel)return;
   if(!visualChannel())say('Choose a social channel above to render a reel.');
   else if(workspace&&canReel)say('Verified reel generation prerequisites are available for this social channel.');
 });
 const say=text=>$('m360-media-state').textContent=text;
 const token=()=>{try{const t=sessionStorage.getItem('matrix360_pilot_token'),at=Number(sessionStorage.getItem('matrix360_pilot_expires_at'));return t&&at>Date.now()?t:null;}catch{return null;}};
 const api=async(method,ws,body)=>{
   const t=token();if(!t)throw Error('Your CRM session has expired.');
   const url='/api/creative-media'+(method==='GET'?'?'+new URLSearchParams(body).toString():'');
   const r=await fetch(url,{method,cache:'no-store',headers:{Authorization:'Bearer '+t,Accept:'application/json',
     ...(method==='POST'?{'Content-Type':'application/json'}:{})},body:method==='POST'?JSON.stringify(body):undefined});
   const data=await r.json().catch(()=>({message:'Non-JSON media server response'}));
   if(!r.ok)throw Error(data.message||'Media generation unavailable (HTTP '+r.status+').');
   return data;
 };
 function clear(){
   generation++;
   if(activeVerification){activeVerification.abort();activeVerification=null;}
   workspace='';busy=false;canReel=false;canImage=false;checking=false;capabilityChecked=false;controls();
   $('m360-media-results').replaceChildren();say('Waiting for an authorized business workspace…');
 }
 document.addEventListener('m360:workspace-changing',clear);
 document.addEventListener('m360:session-ended',clear);
 document.addEventListener('m360:crm-loaded',async event=>{
   const ws=event?.detail?.workspace;if(!token()||ws!==$('workspace')?.value)return clear();
   // Refreshing CRM records for the same business must not interrupt a render or clear a preview.
   if(workspace===ws&&(busy||checking||capabilityChecked))return;
   if(workspace!==ws)clear();
   workspace=ws;checking=true;
   const seq=generation;
   say('Checking reel availability for this business…');
   try{
     const result=await fetch('/api/creative?workspace_id='+encodeURIComponent(ws),{
       cache:'no-store',headers:{Authorization:'Bearer '+token(),Accept:'application/json'}});
     const data=await result.json().catch(()=>({}));
     if(seq!==generation||ws!==$('workspace')?.value||!token())return;
     canReel=result.ok&&data?.motion_reel_available===true;
     capabilityChecked=result.ok;
     const reelRequirements=Array.isArray(data?.reel_prerequisites_missing)?data.reel_prerequisites_missing:[];
     canImage=result.ok&&data?.image_generation_available===true;
     controls();
     say(canReel?(visualChannel()?'Ready to render a motion reel.':'Choose a social channel above to render a reel.'):
       (reelRequirements.length?'Full reel generation blocked: '+reelRequirements.join('; ')+'. Post generation remains available.':data.message||'Media generation is not yet connected. No renders can be started.'));
   }catch{
     if(seq===generation)say('Could not verify media generation. Nothing has been started.');
   }finally{if(seq===generation)checking=false;}
 });
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 async function render(kind){
   const ws=$('workspace')?.value,prompt=$('creative-prompt')?.value?.trim()||'',platform=$('creative-platform')?.value;
   if(!ws||workspace!==ws||!token()||busy||!visualChannel()||!(kind==='reel'?canReel:canImage))return;
   if(prompt.length<12||prompt.length>900){say('Enter a creative brief of 12–900 characters.');return;}
   if(!$('creative-confirm')?.checked){say('Confirm the brief contains no personal data or unapproved claims before generating.');return;}
   const seq=generation;busy=true;controls();
   const card=document.createElement('div');card.className='m360-media-preview';
   const title=document.createElement('strong');title.textContent=kind==='reel'?'Motion-graphics reel':'Generated social image';
   const progress=document.createElement('p');progress.setAttribute('role','status');progress.textContent='Submitting one real media job…';
   card.append(title,progress);$('m360-media-results').prepend(card);
   say('Requesting a real '+(kind==='reel'?'MP4 motion-graphics reel':'PNG image')+' from Social Manager…');
   try{
     const started=await api('POST',ws,{workspace_id:ws,kind,prompt,platform,confirm:true});
     if(seq!==generation||workspace!==ws||!token())return;
     if(started.status!=='queued'||!started.job_id)throw Error('The engine did not return a media job ID.');
     progress.textContent='Job queued. Rendering may take up to two minutes…';
     for(let i=0;i<30;i++){
       await sleep(4000);
       if(seq!==generation||workspace!==ws||!token())return;
       const state=await api('GET',ws,{workspace_id:ws,kind,job_id:started.job_id});
       if(state.status==='failed')throw Error(state.error||'Renderer reported a failed job.');
       if(state.status==='completed'){
         if(!state.asset_url)throw Error('Renderer completed a job but provided no signed media preview.');
         const verifier=window.Matrix360MediaVerification;
         if(!verifier?.verify)throw Error('Browser media decoder verification is unavailable.');
         const media=document.createElement(kind==='reel'?'video':'img');
         media.referrerPolicy='no-referrer';
         if(kind==='reel'){media.controls=true;media.playsInline=true;media.preload='auto';}
         else{media.alt='Generated image submitted for review';media.loading='eager';}
         progress.textContent='A media URL was returned. Verifying actual decoded '+(kind==='reel'?'video frames':'image pixels')+' before reporting success…';
         card.replaceChildren(title,media,progress);
         const verifyController=new AbortController();
         activeVerification=verifyController;
         const verified=verifier.verify(media,kind,{signal:verifyController.signal,timeoutMs:25000});
         // Register the decoder's listeners before setting src, avoiding cached-media races.
         media.src=state.asset_url;
         if(kind==='reel'&&typeof media.load==='function')media.load();
         let proof;
         try{proof=await verified;}
         finally{if(activeVerification===verifyController)activeVerification=null;}
         if(seq!==generation||workspace!==ws||!token())return;
         const note=document.createElement('p');note.className='m360-media-label';
         note.textContent=(kind==='reel'?'Browser-decoded MP4 first frame':'Browser-decoded generated image')+
           ' · '+proof.width+' × '+proof.height+
           (kind==='reel'?' · '+proof.duration.toFixed(1)+' seconds':'')+
           ' · Review status: '+(state.review_state||'not_reviewed')+
           ' · Signed preview is time-limited. Not published.';
         card.replaceChildren(title,media,note);
         if(kind==='reel'){
           media.addEventListener('playing',()=>{
             if(seq===generation&&workspace===ws&&token())say('Browser playback started; audio, narration and music require separate listening review.');
           });
         }
         say(kind==='reel'?'Video first frame decoded. Press play to review actual motion and audio. Nothing published.':
           'Image pixels decoded successfully. Nothing published.');
         return;
       }
       progress.textContent=state.status==='processing'?'Rendering the asset…':'Media queued…';
     }
     progress.textContent='Still processing. This request may take longer than the preview window. No success is claimed.';
     say('Media job did not finish within the preview window.');
   }catch(e){
     if(seq===generation){progress.textContent=e.message||'Media generation failed.';say('Media generation was not completed.');}
   }finally{
     if(seq===generation){busy=false;controls();}
   }
 }
 $('m360-make-reel').addEventListener('click',()=>render('reel'));

})();

// The storyboard uses the private reel archive and the reel renderer.
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const legacy=$('m360-media-panel');
 if(!legacy)return;
 const panel=document.createElement('section');
 panel.id='m360-storyboard';
 panel.setAttribute('aria-labelledby','m360-storyboard-title');
 panel.innerHTML=`
  <h3 id="m360-storyboard-title">Reel storyboard</h3>
  <p>Draft a 15-second sales story from your company profile. Review the captions, visuals and timed detail cards before rendering.</p>
  <label for="m360-storyboard-brief">Campaign direction (optional)</label>
  <textarea id="m360-storyboard-brief" rows="2" maxlength="900" placeholder="Example: Show why the product is useful and invite buyers to request a demo."></textarea>
  <button type="button" id="m360-storyboard-suggest" disabled>Suggest storyboard</button>
  <p id="m360-storyboard-status" role="status" aria-live="polite">Waiting for workspace verification…</p>
  <button type="button" id="m360-storyboard-retry" hidden>Check reel availability</button>
  <div id="m360-storyboard-scenes"></div>
  <div id="m360-storyboard-approval" hidden>
   <p>The end card includes the public website saved in <a href="#m360-brand-profile">Company Details</a>.</p>
   <label for="m360-storyboard-narration">Narration script</label>
   <textarea id="m360-storyboard-narration" rows="3" maxlength="240"></textarea>
   <p>Final render includes AI narration and an original instrumental bed. AI artwork is labeled in the reel.</p>
   <button type="button" id="m360-storyboard-preview">Preview storyboard and end card</button>
   <label class="m360-storyboard-check"><input id="m360-storyboard-confirm" type="checkbox"> I reviewed the claims and approve one billable render.</label>
   <button type="button" class="primary" id="m360-storyboard-render" disabled>Render 1080 × 1920 reel</button>
  </div>
  <dialog id="m360-storyboard-review" aria-label="Storyboard preview">
   <form method="dialog"><button type="submit">Close preview</button></form>
   <h3>Storyboard preview</h3>
   <p>Review shot order, captions, timed detail cards and the exact end card. Generated artwork and audio are created at render time.</p>
   <div class="m360-storyboard-preview-controls"><button type="button" id="m360-storyboard-play">Play 15-second preview</button><div id="m360-storyboard-beats" role="group" aria-label="Jump to beat"></div></div>
   <div id="m360-storyboard-frame" aria-live="off"></div>
  </dialog>
  <video id="m360-storyboard-player" controls playsinline preload="metadata" aria-label="Rendered storyboard reel" hidden></video>`;
 legacy.before(panel);
 const legacyGroup=document.createElement('details');
 const legacyTitle=document.createElement('summary');legacyTitle.textContent='Social Manager renderer';
 legacy.before(legacyGroup);legacyGroup.append(legacyTitle,legacy);
 const status=$('m360-storyboard-status'),sceneList=$('m360-storyboard-scenes'),player=$('m360-storyboard-player');
 const brief=$('m360-storyboard-brief'),confirmRender=$('m360-storyboard-confirm');
 const defaultBrief='Create a short sales reel for the main product or service in our approved company profile. Show its practical value and end with one relevant next step.';
 const times=['0–3 s','3–7 s','7–11 s','11–15 s'];
 const dialog=$('m360-storyboard-review');
 const narration=$('m360-storyboard-narration');
 let receipt='',previewTimer,detailTimer,previewCard='',previewWebsite='',previewScenes=[];
 let workspace='',credential='',revision=0,ready=false,renderer=false,busy=false,hasStoryboard=false,reels=[],checking=false;
 const token=()=>Number(sessionStorage.getItem('matrix360_pilot_expires_at'))>Date.now()?sessionStorage.getItem('matrix360_pilot_token'):null;
 const active=()=>workspace&&workspace===$('workspace')?.value&&credential===token();
 const say=message=>{status.textContent=message;};
 function controls(){
  $('m360-storyboard-suggest').disabled=!active()||!ready||busy;
  $('m360-storyboard-preview').disabled=!active()||!renderer||!hasStoryboard||busy;
  const retry=$('m360-storyboard-retry');
  retry.hidden=!active()||(ready&&renderer);
  retry.disabled=checking||busy;
  confirmRender.disabled=!receipt||busy;
  $('m360-storyboard-render').disabled=!active()||!renderer||!receipt||!confirmRender.checked||busy;
  for(const field of panel.querySelectorAll('textarea,select'))field.disabled=busy;
 }
 function reset(){
  revision++;workspace='';credential='';checking=false;ready=false;renderer=false;busy=false;hasStoryboard=false;reels=[];
  sceneList.replaceChildren();brief.value='';narration.value='';invalidatePreview();
  $('m360-storyboard-approval').hidden=true;
  player.pause();player.removeAttribute('src');player.load();player.hidden=true;controls();
 }
 async function request(endpoint,body,write=false){
  const url=endpoint+(write?'':'?'+new URLSearchParams(body));
  const options={method:write?'POST':'GET',cache:'no-store',
   headers:{Authorization:'Bearer '+credential,...(write?{'Content-Type':'application/json'}:{})},body:write?JSON.stringify(body):undefined};
  let response=await fetch(url,options);
  if(!write&&[502,503,504].includes(response.status)){
   await new Promise(resolve=>setTimeout(resolve,800));
   response=await fetch(url,options);
  }
  const result=await response.json().catch(()=>({message:'Reel service returned an unreadable response.'}));
  if(!response.ok)throw Error(result.message||'The reel service could not complete this request.');
  return result;
 }
 const api=(action,data={},write=false)=>request('/api/reel-motion',{workspace_id:workspace,action,...data},write);
 async function initialize(ws){
  if(!ws||ws!==$('workspace')?.value||!token())return;
  if(ws===workspace&&credential===token()&&(checking||(ready&&renderer)||busy))return;
  if(ws!==workspace||credential!==token())reset();
  workspace=ws;credential=token();checking=true;
  say('Checking storyboard and renderer availability…');controls();
  const turn=revision;
  try{
   const [capability,library]=await Promise.allSettled([api('storyboard_readiness'),request('/api/reel-library',{workspace_id:ws,phase:'list'})]);
   if(turn!==revision||!active())return;
   ready=capability.status==='fulfilled'&&capability.value.planner_ready===true;
   renderer=capability.status==='fulfilled'&&capability.value.renderer_ready===true;
   reels=library.status==='fulfilled'&&Array.isArray(library.value.reels)?library.value.reels:[];
   if(capability.status==='rejected')say('Could not check reel availability. '+capability.reason.message);
   else say(ready?(renderer?'Ready to suggest and render a storyboard.':'You can draft a storyboard. Preview and rendering are temporarily unavailable.'):'Authorized storyboard planning is unavailable.');
  }finally{if(turn===revision){checking=false;controls();}}
 }
 for(const event of ['m360:workspace-changing','m360:session-ended'])document.addEventListener(event,()=>{reset();say('Waiting for workspace verification…');});
 document.addEventListener('m360:crm-loaded',event=>initialize(event.detail?.workspace));
 $('m360-storyboard-retry').addEventListener('click',()=>initialize($('workspace')?.value));
 document.addEventListener('m360:reel-brief',event=>{
  const ws=event.detail?.workspace;
  if(ws&&ws===$('workspace')?.value&&token()&&!busy){
   initialize(ws);
   brief.value=String(event.detail.prompt||'').slice(0,900);
   invalidatePreview();controls();
   brief.focus({preventScroll:true});
  }
 });
 function renderScenes(scenes,callouts=[]){
  sceneList.replaceChildren();
  scenes.forEach((scene,index)=>{
   const field=document.createElement('fieldset'),legend=document.createElement('legend');
   legend.textContent=(index+1)+'. '+scene.role+' · '+times[index];field.append(legend);
   function labeled(name,input){
    const label=document.createElement('label');
    label.textContent=name;label.append(input);field.append(label);
    return label;
   }
   const end=scene.footage==='end_card';
   const caption=document.createElement('textarea');caption.rows=2;caption.maxLength=end?42:72;caption.value=scene.caption;caption.dataset.caption='';
   labeled(end?'End card call to action':'On-screen caption',caption);
   if(end){sceneList.append(field);return;}
   const footage=document.createElement('select');footage.dataset.footage='';
   footage.append(new Option('Generate AI artwork','ai'));
   for(const reel of reels){
    const title=String(reel.prompt||'Saved reel').replace(/\s+/g,' ').slice(0,64);
    footage.append(new Option(title+' · '+new Date(reel.created_at).toLocaleDateString()+' · reel '+(reel.variant||1),reel.reel_id));
   }
   labeled('Scene footage',footage);
   const detail=document.createElement('select');detail.dataset.callout='';
   detail.append(new Option('No detail card',''));
   for(const choice of callouts)detail.append(new Option(choice.label+' · '+choice.text,choice.id));
   detail.value=scene.callout?.id||'';
   labeled('Timed detail card from Company Details',detail);
   const visual=document.createElement('textarea');visual.rows=2;visual.maxLength=360;visual.value=scene.visual;visual.dataset.visual='';
   const direction=labeled('AI artwork direction',visual);
   footage.addEventListener('change',()=>{direction.hidden=footage.value!=='ai';});
   sceneList.append(field);
  });
  hasStoryboard=true;$('m360-storyboard-approval').hidden=false;
 }
 function invalidatePreview(){
  receipt='';previewScenes=[];previewCard='';previewWebsite='';confirmRender.checked=false;
  stopPreview();
  if(dialog.open)dialog.close();
 }
 function stopPreview(){
  clearTimeout(previewTimer);clearTimeout(detailTimer);
  $('m360-storyboard-play').textContent='Play 15-second preview';
 }
 function sceneValues(){
  return Array.from(sceneList.querySelectorAll('fieldset'),field=>({
   caption:field.querySelector('[data-caption]').value,
   footage:field.querySelector('[data-footage]')?.value,
   visual:field.querySelector('[data-visual]')?.value,
   callout:field.querySelector('[data-callout]')?.value
  }));
 }
 function showPreviewBeat(index,timed=false){
  clearTimeout(detailTimer);
  const frame=$('m360-storyboard-frame'),scene=previewScenes[index];
  if(!scene)return;
  for(const [i,button] of Array.from($('m360-storyboard-beats').children).entries())button.setAttribute('aria-pressed',String(i===index));
  frame.replaceChildren();
  if(index===3){
   const image=document.createElement('img');
   image.src='data:image/png;base64,'+previewCard;image.alt='Rendered branded end card: '+scene.caption;
   frame.append(image);
   if(previewWebsite){
    const link=document.createElement('a');link.href=previewWebsite;link.target='_blank';link.rel='noopener noreferrer';
    link.textContent='Open '+new URL(previewWebsite).hostname;frame.append(link);
   }
   return;
  }
  const heading=document.createElement('strong');heading.textContent=times[index];
  const visual=document.createElement('p');
  visual.textContent=scene.footage==='ai'?scene.visual:'Saved footage: '+(scene.footageLabel||'selected clip');
  const caption=document.createElement('p');caption.className='m360-storyboard-caption';caption.textContent=scene.caption;
  const layout=document.createElement('div');layout.className='m360-storyboard-shot';
  layout.append(heading,visual,caption);
  frame.append(layout);
  if(scene.callout){
   const detail=document.createElement('aside');
   detail.className='m360-storyboard-detail';
   detail.dataset.side=scene.callout.side;
   const label=document.createElement('strong');label.textContent=scene.callout.label;
   const value=document.createElement('span');value.textContent=scene.callout.text;
   detail.append(label,value);layout.append(detail);
   if(timed){detail.hidden=true;detailTimer=setTimeout(()=>{detail.hidden=false;},scene.callout.start*1000);}
  }
 }
 dialog.addEventListener('close',stopPreview);
 $('m360-storyboard-play').addEventListener('click',()=>{
  if($('m360-storyboard-play').textContent.startsWith('Stop')){stopPreview();return;}
  $('m360-storyboard-play').textContent='Stop preview';
  function next(index){
   showPreviewBeat(index,true);
   previewTimer=setTimeout(()=>index===3?stopPreview():next(index+1),index===0?3000:4000);
  }
  next(0);
 });
 $('m360-storyboard-preview').addEventListener('click',async()=>{
  if(!active()||busy||!renderer||!hasStoryboard)return;
  const turn=revision,scenes=sceneValues();
  invalidatePreview();busy=true;controls();say('Preparing the branded end card…');
  try{
   const data=await api('preview_storyboard',{prompt:approvedBrief,scenes,narration:narration.value},true);
   if(turn!==revision||!active())return;
   previewScenes=data.scenes.map((scene,i)=>{
    const select=sceneList.children[i]?.querySelector('select');
    return {...scene,footageLabel:select?.selectedOptions[0]?.textContent};
   });
   previewCard=data.end_card;previewWebsite=data.website;receipt=data.receipt;
   const beats=$('m360-storyboard-beats');beats.replaceChildren();
   for(const [i,time] of times.entries()){
    const button=document.createElement('button');button.type='button';button.textContent=time;
    button.addEventListener('click',()=>{stopPreview();showPreviewBeat(i);});beats.append(button);
   }
   showPreviewBeat(3);dialog.showModal();say('Preview ready. Review it before approving the render.');
  }catch(error){if(turn===revision&&active())say(error.message);}
  finally{if(turn===revision){busy=false;controls();}}
 });
 panel.addEventListener('input',event=>{if(event.target!==confirmRender)invalidatePreview();controls();});
 panel.addEventListener('change',event=>{if(event.target!==confirmRender)invalidatePreview();controls();});
 let approvedBrief='';
 $('m360-storyboard-suggest').addEventListener('click',async()=>{
  if(!active()||busy||!ready)return;
  const turn=revision,direction=brief.value.trim()||defaultBrief;
  busy=true;confirmRender.checked=false;controls();say('Writing a sales story from your company profile…');
  try{
   const data=await api('suggest_storyboard',{prompt:direction},true);
   if(turn!==revision||!active())return;
   invalidatePreview();renderScenes(data.scenes,data.callouts);narration.value=data.narration;approvedBrief=direction;
   say(!renderer?'Storyboard ready. Preview and rendering are temporarily unavailable.':data.adjusted?.length?'Storyboard ready. Review these adjusted fields before rendering: '+data.adjusted.join(', ')+'.':'Storyboard ready. Review the captions and visuals before rendering.');
  }catch(error){if(turn===revision&&active())say(error.message);}
  finally{if(turn===revision){busy=false;controls();}}
 });
 $('m360-storyboard-render').addEventListener('click',async()=>{
  if(!active()||busy||!renderer||!receipt||!confirmRender.checked)return;
  const turn=revision,scenes=sceneValues(),previewReceipt=receipt;
  busy=true;confirmRender.checked=false;controls();player.hidden=true;player.pause();
  say('Generating approved artwork and rendering the reel. Keep this tab open.');
  try{
   const result=await api('render_storyboard',{prompt:approvedBrief,scenes,narration:narration.value,preview_receipt:previewReceipt,confirm_paid:true},true);
   if(turn!==revision||!active())return;
   document.dispatchEvent(new CustomEvent('m360:library-updated',{detail:{workspace}}));
   say('Reel saved to the Creative library. Checking the video file…');
   const file=await request('/api/reel-library',{workspace_id:workspace,phase:'play',reel_id:result.reel_id});
   if(turn!==revision||!active())return;
   const url=new URL(file.url);
   if(url.protocol!=='https:'||url.username||url.password)throw Error('The archive returned an invalid playback link.');
   player.onloadedmetadata=()=>{
    if(turn!==revision||!active())return;
    const valid=player.videoWidth===1080&&player.videoHeight===1920&&Math.abs(player.duration-15)<0.2;
    player.hidden=!valid;
    say(valid?'Saved and verified: 1080 × 1920 · 15 seconds · '+result.ai_scenes+' AI artwork scenes · AI narration and original music.':'The saved reel did not pass the resolution or duration check.');
   };
   player.onerror=()=>{if(turn===revision&&active())say('Reel saved. Playback could not be verified here.');};
   player.src=url.href;player.load();
  }catch(error){if(turn===revision&&active())say(error.message);}
  finally{if(turn===revision){busy=false;controls();}}
 });
 initialize($('workspace')?.value);
})();
