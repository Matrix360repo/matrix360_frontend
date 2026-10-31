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
 "<h3 id='m360-media-title'>Generate actual creative assets</h3>"+
 "<p>Each action requests one real asset for the selected business. Video mode is moving typography/motion graphics, not stock or filmed footage.</p>"+
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
 let workspace='',generation=0,busy=false,canReel=false,canImage=false,activeVerification=null;
 const mediaChannels=new Set(['Instagram','Facebook','LinkedIn','X','YouTube']);
 const visualChannel=()=>mediaChannels.has($('creative-platform')?.value);
 const controls=()=>{$('m360-make-reel').disabled=busy||!canReel||!visualChannel();};
 $('creative-platform')?.addEventListener('change',()=>{
   controls();
   if(!visualChannel())say('Text-only channel selected. Generate and review the editable copy above; no video or image request will be made.');
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
   workspace='';busy=false;canReel=false;canImage=false;controls();
   $('m360-media-results').replaceChildren();say('Waiting for an authorized business workspace…');
 }
 document.addEventListener('m360:workspace-changing',clear);
 document.addEventListener('m360:session-ended',clear);
 document.addEventListener('m360:crm-loaded',async event=>{
   const ws=event?.detail?.workspace;if(!token()||ws!==$('workspace')?.value)return clear();
   clear();workspace=ws;const seq=generation;say('Checking actual media capabilities for this business…');
   try{
     const result=await fetch('/api/creative?workspace_id='+encodeURIComponent(ws),{
       cache:'no-store',headers:{Authorization:'Bearer '+token(),Accept:'application/json'}});
     const data=await result.json().catch(()=>({}));
     if(seq!==generation||ws!==$('workspace')?.value||!token())return;
     canReel=result.ok&&data?.motion_reel_available===true;
     const reelRequirements=Array.isArray(data?.reel_prerequisites_missing)?data.reel_prerequisites_missing:[];
     canImage=result.ok&&data?.image_generation_available===true;
     controls();
     say(canReel?'Motion-graphics reel prerequisites verified by Social Manager.':
       (reelRequirements.length?'Full reel generation blocked: '+reelRequirements.join('; ')+'. Post generation remains available.':data.message||'Media generation is not yet connected. No renders can be started.'));
   }catch{
     if(seq===generation)say('Could not verify media generation. Nothing has been started.');
   }
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
