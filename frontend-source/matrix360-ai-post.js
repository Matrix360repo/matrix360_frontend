/* Matrix360 genuine AI-first content UX. Real OpenAI visual + adaptive exact text,
   caption, hashtags, transparent provider states; no fake/template image fallback. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id),host=$('creative-studio');
 if(!host||$('m360-ai-post-studio'))return;
 const app=document.createElement('section');
 app.id='m360-ai-post-studio';app.className='card';
 app.setAttribute('aria-label','AI creative production');
 app.innerHTML=
  "<span class='eyebrow'>MATRIX 360 · OPENAI CREATIVE PRODUCTION</span>"+
  "<h2>Generate a complete AI post</h2>"+
  "<p>Describe your goal once. The creative strategist develops a hook, headline, scene, caption and hashtags; OpenAI generates the real visual. No stock placeholder or template substitution.</p>"+
  "<p id='m360-ai-post-status' role='status' aria-live='polite'>Verifying authorized business and AI provider…</p>"+
  "<button class='btn' id='m360-ai-preflight' type='button' disabled>Check OpenAI + quota credentials · no credits</button>"+
  "<form id='m360-ai-post-form'>"+
  "<label for='m360-ai-post-prompt'>What should this post communicate?</label>"+
  "<textarea id='m360-ai-post-prompt' rows='5' minlength='20' maxlength='2300' required disabled placeholder='Example: Premium Instagram creative promoting an industrial park for manufacturers, with a compelling location-led headline. Treat unverified facts as requiring review.'></textarea>"+
  "<label for='m360-ai-post-channel'>Publication channel</label>"+
  "<select id='m360-ai-post-channel' disabled><option>Instagram</option><option>Facebook</option><option>LinkedIn</option><option>X</option><option>YouTube</option><option>Email</option><option>WhatsApp</option><option>Google Business Profile</option><option>Website</option></select>"+
  "<label class='m360-ai-consent'><input type='checkbox' id='m360-ai-post-confirm' disabled> I have permission to use this brief and will review all claims and content before publishing.</label>"+
  "<button type='submit' class='btn primary' id='m360-ai-post-generate' disabled>Generate 3 OpenAI post options</button>"+
  "</form>"+
  "<div id='m360-ai-post-output' hidden>"+
  "<p id='m360-ai-option-count' role='status'>Independent OpenAI image options are prepared for review.</p>"+
  "<div id='m360-ai-options' aria-label='Three AI-generated image options'></div>"+
  "<div class='m360-ai-result-grid'>"+
  "<section><h3>Generated creative</h3><p id='m360-ai-visual-status'>Image not yet generated.</p>"+
  "<div id='m360-ai-visual'></div><a id='m360-ai-download' class='btn primary' hidden>Download final image</a></section>"+
  "<section><h3>Copy for review</h3>"+
  "<label for='m360-ai-hook'>Hook</label><input id='m360-ai-hook' maxlength='180'>"+
  "<label for='m360-ai-headline'>Headline</label><input id='m360-ai-headline' maxlength='140'>"+
  "<label for='m360-ai-caption'>Caption</label><textarea id='m360-ai-caption' rows='8'></textarea>"+
  "<label for='m360-ai-hashtags'>Hashtags</label><textarea id='m360-ai-hashtags' rows='3'></textarea>"+
  "<label for='m360-ai-cta'>Call to action</label><input id='m360-ai-cta' maxlength='100'>"+
  "<button type='button' id='m360-ai-copy' class='btn'>Copy caption + hashtags</button>"+
  "<button type='button' id='m360-ai-apply' class='btn' disabled>Apply edits to selected post · no credits</button>"+
  "<p id='m360-ai-review' class='m360-ai-review'></p>"+
  "</section></div></div>";
 host.parentNode.insertBefore(app,host);
 host.querySelector('h2')?.setAttribute('data-legacy-studio','true');
 const css=document.createElement('style');css.textContent=
 "#m360-ai-post-studio{margin:22px 0;border:2px solid #10786f;background:#f6fcfa;padding:24px;border-radius:18px}"+
 "#m360-ai-post-studio textarea,#m360-ai-post-studio input:not([type=checkbox]),#m360-ai-post-studio select{width:100%;padding:12px;border:1px solid #cadbd5;border-radius:9px;background:white;color:#102e36;font:inherit;margin:5px 0 14px}"+
 "#m360-ai-post-studio label{display:block;font-weight:700;font-size:13px}#m360-ai-post-studio p{line-height:1.5}"+
 "#m360-ai-post-studio .m360-ai-consent{display:flex;gap:8px;align-items:center;margin:14px 0;font-weight:500}"+
 "#m360-ai-post-status{padding:12px;border:1px solid #cbded8;border-radius:9px;background:#eaf4ef}"+
 ".m360-ai-result-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:22px;margin-top:20px}"+
 "#m360-ai-download[hidden]{display:none!important}#m360-ai-visual img{display:block;max-width:100%;max-height:520px;object-fit:contain;border-radius:10px;margin:12px 0}"+
 "#m360-ai-post-output section{min-width:0}#m360-ai-download{display:inline-block;margin:10px 0}"+
 "#m360-ai-post-studio .m360-ai-review{font-size:12px;color:#705c29}"+
 "#m360-ai-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:16px 0 22px}"+
 "#m360-ai-options .m360-ai-choice{min-width:0;border:1px solid #cbded8;background:white;border-radius:12px;padding:10px}"+
 "#m360-ai-options .m360-ai-choice[data-selected=true]{border:3px solid #0b786b}"+
 "#m360-ai-options img{width:100%;height:210px;object-fit:contain;border-radius:8px;background:#f2f6f4}"+
 "#m360-ai-options button{width:100%;margin-top:8px;min-height:36px;font-size:12px}"+
 "#m360-ai-options p{font-size:11px;overflow-wrap:anywhere}"+

 "@media(max-width:820px){.m360-ai-result-grid{grid-template-columns:1fr}#m360-ai-options{grid-template-columns:1fr}#m360-ai-options img{height:300px}}";
 document.head.append(css);
 const CHANNELS=new Set(['Instagram','Facebook','LinkedIn','X','YouTube','Email','WhatsApp','Google Business Profile','Website']);
 const status=(s)=>{$('m360-ai-post-status').textContent=s};
 let workspace='',counter=0,busy=false,available=false,controller=null,blobUrl='';
 const options=[null,null,null];let currentBatch='',selectedOption=-1;
 const session=()=>{try{const t=sessionStorage.getItem('matrix360_pilot_token');const e=Number(sessionStorage.getItem('matrix360_pilot_expires_at'));return t&&e>Date.now()?t:null}catch{return null}};
 const active=()=>!!workspace&&$('workspace')?.value===workspace&&!!session();
 const controls=()=>{const can=active()&&available&&!busy;$('m360-ai-preflight').disabled=!active()||busy;$('m360-ai-post-prompt').disabled=!can;$('m360-ai-post-channel').disabled=!can;$('m360-ai-post-confirm').disabled=!can;$('m360-ai-post-generate').disabled=!can};
 const cleanupImage=()=>{for(let i=0;i<options.length;i++){if(options[i]?.url)URL.revokeObjectURL(options[i].url);options[i]=null;}blobUrl='';currentBatch='';selectedOption=-1;$('m360-ai-options').replaceChildren();$('m360-ai-visual').replaceChildren();$('m360-ai-download').hidden=true;$('m360-ai-download').removeAttribute('href')};
 const reset=()=>{counter++;controller?.abort();controller=null;busy=false;available=false;workspace='';cleanupImage();$('m360-ai-post-output').hidden=true;$('m360-ai-post-prompt').value='';$('m360-ai-post-confirm').checked=false;controls();status('Select an authorized CRM workspace to check AI availability.')};
 async function call(method,ws,token,data,signal){
  const suffix=method==='GET'?'?workspace_id='+encodeURIComponent(ws):'';
  const response=await fetch('/api/ai-post'+suffix,{method,signal,cache:'no-store',
    headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},
    body:data?JSON.stringify(data):undefined});
  const result=await response.json().catch(()=>({message:'AI gateway returned invalid JSON'}));
  if(!response.ok)throw Error(result.message||'AI content service returned HTTP '+response.status);
  return result;
 }
 document.addEventListener('m360:workspace-changing',reset);
 document.addEventListener('m360:session-ended',reset);
 document.addEventListener('visibilitychange',()=>{if(!session())reset()});
 document.addEventListener('m360:crm-loaded',async event=>{
  const ws=event?.detail?.workspace,token=session();
  if(!token||!ws||ws!==$('workspace')?.value)return reset();
  if(workspace!==ws){cleanupImage();$('m360-ai-post-output').hidden=true}
  workspace=ws;available=false;busy=false;const epoch=++counter;
  controls();status('Checking OpenAI image-generation readiness for your business…');
  try{
   const result=await call('GET',ws,token);
   if(epoch!==counter||ws!==workspace||!session())return;
   available=result.status==='ready'&&result.ai_image_ready&&result.semantic_planner_ready;
   status(available?'OpenAI AI-post generation available. One click produces a real visual, caption and hashtags.':
    'AI image generation unavailable: '+(result.need_api_key?'OPENAI_API_KEY is not configured. ':'')+
    (result.need_spend_approval?'Provider-spend approval is disabled. ':'')+
    (result.need_quota_service?'Staging trial quota credential is not configured. ':'')+
    'No generic fallback will be presented as an AI post.');
  }catch(e){if(epoch===counter){available=false;status('AI readiness could not be verified: '+e.message)}}
  controls();
 });
 $('m360-ai-preflight').addEventListener('click',async()=>{
  const ws=workspace,token=session(),epoch=counter;
  if(!active()||!token)return;
  status('Checking OpenAI model access and staging quota permission without generating content or spending credits…');
  try{
   const response=await fetch('/api/ai-post?workspace_id='+encodeURIComponent(ws)+'&probe=yes',{
    method:'GET',headers:{Authorization:'Bearer '+token},cache:'no-store'});
   const payload=await response.json();
   if(!response.ok)throw Error(payload.message||'Credential test was not authorized');
   if(epoch!==counter||ws!==workspace||!session())return;
   const p=payload.preflight;
   if(!p)throw Error('No provider preflight response');
   status('No-cost credential check: OpenAI text-model access '+(p.openai_model_access?'PASS':'FAILED')+
     ', OpenAI image-model access '+(p.openai_image_model_access?'PASS':'FAILED')+
     ', staging quota access '+(p.staging_quota_access?'PASS':'FAILED')+
     (p.remaining===null?'':', '+p.remaining+' trial reservations remaining')+
     '. Paid generation remains '+(payload.need_spend_approval?'disabled.':'controlled by the configured quota.') );
  }catch(e){if(epoch===counter)status('Credential check unavailable: '+(e?.message||'Unknown error'))}
 });
 function wrap(ctx,text,maxWidth,maxLines){
  const words=String(text).split(/\s+/),lines=[];let line='';
  for(const word of words){const next=(line?line+' ':'')+word;
   if(ctx.measureText(next).width>maxWidth&&line){lines.push(line);line=word}else line=next;
   if(lines.length>=maxLines)break;
  }
  if(lines.length<maxLines&&line)lines.push(line);
  return lines;
 }
 async function assemble(base64,mime,plan,channel){
  const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
  if(bytes.length<5000||bytes[0]!==255||bytes[1]!==216)throw Error('Provider output was not a valid JPEG.');
  const source=new Blob([bytes],{type:mime}),sourceUrl=URL.createObjectURL(source);
  const img=new Image();img.src=sourceUrl;
  try{await img.decode()}finally{URL.revokeObjectURL(sourceUrl)}
  if(img.naturalWidth<900||img.naturalHeight<900)throw Error('OpenAI image did not decode at required resolution.');
  const portrait=['Instagram','WhatsApp'].includes(channel),landscape=['LinkedIn','YouTube','Website','Email'].includes(channel);
  const w=portrait?1080:landscape?1200:1080,h=portrait?1350:landscape?630:1080;
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image compositor is unavailable.');
  const scale=Math.max(w/img.naturalWidth,h/img.naturalHeight),sw=w/scale,sh=h/scale;
  ctx.drawImage(img,(img.naturalWidth-sw)/2,(img.naturalHeight-sh)/2,sw,sh,0,0,w,h);
  const loc=plan.layout==='top'?'top':plan.layout==='left'?'left':'bottom';
  const gradient=loc==='top'?ctx.createLinearGradient(0,0,0,h*.72):loc==='left'?ctx.createLinearGradient(0,0,w*.82,0):ctx.createLinearGradient(0,h*.3,0,h);
  if(loc==='top'){gradient.addColorStop(0,'rgba(4,19,28,.91)');gradient.addColorStop(1,'rgba(4,19,28,0)')}
  else if(loc==='left'){gradient.addColorStop(0,'rgba(4,19,28,.89)');gradient.addColorStop(1,'rgba(4,19,28,0)')}
  else{gradient.addColorStop(0,'rgba(4,19,28,0)');gradient.addColorStop(1,'rgba(4,19,28,.91)')}
  ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#fff';ctx.textBaseline='top';ctx.shadowColor='rgba(0,0,0,.24)';ctx.shadowBlur=12;
  const m=Math.round(w*.065),maxWidth=loc==='left'&&landscape?w*.57:w-2*m;
  const fontSize=portrait?58:landscape?43:52;
  ctx.font='800 '+fontSize+'px Arial, sans-serif';
  let lines=wrap(ctx,plan.headline,maxWidth,3);
  const lineHeight=fontSize*1.16;
  const y=loc==='top'?h*.14:loc==='left'?h*.30:h-(lines.length*lineHeight)-h*.27;
  ctx.font='800 '+fontSize+'px Arial, sans-serif';
  lines.forEach((line,i)=>ctx.fillText(line,m,y+i*lineHeight,maxWidth));
  ctx.font='500 '+Math.round(fontSize*.44)+'px Arial, sans-serif';
  const sub=wrap(ctx,plan.subheadline,maxWidth,2);
  sub.forEach((line,i)=>ctx.fillText(line,m,y+lines.length*lineHeight+22+i*fontSize*.57,maxWidth));
  ctx.font='700 '+Math.round(fontSize*.38)+'px Arial, sans-serif';
  ctx.fillText(plan.cta,m,loc==='top'?Math.min(h*.62,y+lines.length*lineHeight+125):
    loc==='left'?Math.min(h*.79,y+lines.length*lineHeight+140):h-m-35,maxWidth);
  return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob&&blob.size>12000?resolve({blob,width:w,height:h}):reject(Error('Final creative could not be exported')),'image/jpeg',.93));
 }
 function captureDraft(){
  if(selectedOption<0||!options[selectedOption]?.url)return;
  const item=options[selectedOption],p=item.draft||item.plan;
  item.draft={...p,
   hook:$('m360-ai-hook').value.slice(0,130),
   headline:$('m360-ai-headline').value.slice(0,100),
   caption:$('m360-ai-caption').value.slice(0,2000),
   hashtags:$('m360-ai-hashtags').value.split(/[\s,]+/).map(x=>x.trim().slice(0,48)).filter(Boolean).slice(0,12),
   cta:$('m360-ai-cta').value.slice(0,80)};
  const graphicDirty=item.draft.headline!==item.plan.headline||item.draft.cta!==item.plan.cta;
  $('m360-ai-download').hidden=graphicDirty;
  $('m360-ai-apply').disabled=busy||!active();
  if(graphicDirty)$('m360-ai-visual-status').textContent='Headline or CTA edited. Apply changes before downloading the updated post image.';
 }
 function showOption(index){
  const item=options[index];if(!item?.url||!active())return;
  if(selectedOption!==index)captureDraft();
  selectedOption=index;blobUrl=item.url;
  const p=item.draft||item.plan;
  $('m360-ai-hook').value=p.hook;$('m360-ai-headline').value=p.headline;
  $('m360-ai-caption').value=p.caption;$('m360-ai-hashtags').value=p.hashtags.join(' ');
  $('m360-ai-cta').value=p.cta;
  $('m360-ai-review').textContent='Option '+String.fromCharCode(65+index)+
   '. Verify claims and brand approvals before publication. '+(p.review_notes||[]).join(' · ');
  const img=document.createElement('img');img.src=item.url;img.alt=p.alt_text||'OpenAI-generated concept for review';
  $('m360-ai-visual').replaceChildren(img);
  $('m360-ai-visual-status').textContent='Option '+String.fromCharCode(65+index)+
    ' · Genuine OpenAI image and unchanged typography compositor · '+item.width+' × '+item.height+
    ' · '+item.model+' · Not published';
  const link=$('m360-ai-download');
  link.href=item.url;link.download='matrix360-ai-post-option-'+String.fromCharCode(97+index)+'.jpg';
  link.hidden=p.headline!==item.plan.headline||p.cta!==item.plan.cta;
  $('m360-ai-apply').disabled=busy||!active();
  showGallery();
 }
 function showGallery(){
  const host=$('m360-ai-options');host.replaceChildren();
  let count=0;
  for(let i=0;i<3;i++){
   const item=options[i],box=document.createElement('div');box.className='m360-ai-choice';
   box.dataset.selected=String(i===selectedOption);
   const heading=document.createElement('strong');heading.textContent='Option '+String.fromCharCode(65+i);box.append(heading);
   if(item?.url){
    count++;
    const img=document.createElement('img');img.src=item.url;img.alt=item.plan.alt_text||'AI post option';
    const button=document.createElement('button');button.type='button';button.className='btn';
    button.textContent=i===selectedOption?'Selected':'Choose this option';
    button.addEventListener('click',()=>showOption(i));
    const label=document.createElement('p');label.textContent=item.plan.headline+' · '+item.model;
    box.append(img,label,button);
   }else{
    const message=document.createElement('p');
    message.textContent=item?.error?'Generation failed: '+item.error:
      item?.pending?'Generating an independent OpenAI composition…':'Not yet generated';
    box.append(message);
   }
   host.append(box);
  }
  $('m360-ai-option-count').textContent=count+' of 3 independently generated OpenAI post images ready.'+
    (count<3?' Retry missing options without regenerating successful images.':' Select an option to inspect its original artwork and editable copy.');
  $('m360-ai-post-generate').textContent=count>0&&count<3?'Retry missing post options':'Generate 3 OpenAI post options';
 }
 async function noCostPreflight(ws,token,required,signal){
  const response=await fetch('/api/ai-post?workspace_id='+encodeURIComponent(ws)+'&probe=yes',{
   method:'GET',headers:{Authorization:'Bearer '+token},signal,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.message||'OpenAI authorization preflight failed');
  const p=data.preflight;
  if(!p?.openai_model_access||!p?.openai_image_model_access||!p?.staging_quota_access)
   throw Error('OpenAI model or staging quota is not verified; no credits spent.');
  if(!Number.isInteger(p.remaining)||p.remaining<required)
   throw Error('Only '+(p?.remaining??'unknown')+' of '+required+
    ' required trial slots remain. No new generations were started.');
 }
 $('m360-ai-post-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const ws=workspace,token=session(),prompt=$('m360-ai-post-prompt').value.trim(),channel=$('m360-ai-post-channel').value;
  if(!active()||!available||busy||!$('m360-ai-post-confirm').checked||!CHANNELS.has(channel))return;
  if(prompt.length<20||prompt.length>2300)return status('The brief must be 20–2300 characters.');
  const batch=JSON.stringify([ws,channel,prompt]);
  if(batch!==currentBatch){cleanupImage();currentBatch=batch;}
  const pending=[0,1,2].filter(i=>!options[i]?.url);
  if(!pending.length){captureDraft();showGallery();return status('All three independently generated options are available for review.');}
  const seq=++counter;busy=true;controller=new AbortController();controls();
  $('m360-ai-post-output').hidden=false;showGallery();
  try{
   status('Checking your existing eight-slot OpenAI trial quota before any billable generation…');
   await noCostPreflight(ws,token,pending.length,controller.signal);
   if(seq!==counter||!active())return;
   for(const i of pending){
    if(seq!==counter||!active())return;
    options[i]={pending:true};showGallery();
    try{
     status('Generating distinct OpenAI post option '+String.fromCharCode(65+i)+' ('+(i+1)+'/3)…');
     const result=await call('POST',ws,token,{
      workspace_id:ws,action:'plan',channel,prompt,variant:i},controller.signal);
     if(result.status!=='ai_plan_completed'||!result.proof||!result.plan?.headline)
      throw Error('OpenAI did not return a valid independent creative plan');
     const art=await call('POST',ws,token,{
      workspace_id:ws,action:'image',channel,proof:result.proof},controller.signal);
     if(art.status!=='ai_image_completed'||art.provider!=='OpenAI'||!art.base64)
      throw Error('No actual OpenAI image was returned');
     const final=await assemble(art.base64,art.mime,result.plan,channel);
     if(seq!==counter||!active())return;
     const url=URL.createObjectURL(final.blob);
     options[i]={url,plan:result.plan,model:art.model,width:final.width,height:final.height,source:art.base64,mime:art.mime};
     if(selectedOption<0)showOption(i);else showGallery();
    }catch(err){
     if(controller.signal.aborted)throw err;
     options[i]={error:String(err?.message||'Provider unavailable').slice(0,180)};
     showGallery();
    }
   }
   const ready=options.filter(o=>o?.url).length;
   status(ready===3?'Three genuinely generated OpenAI visual options are ready. Compare, select, edit copy and review. Nothing published.':
    ready+' of 3 genuine OpenAI images completed. Failed slots may be retried individually; completed images remain unchanged.');
  }catch(err){if(seq===counter)status('Three-option generation not completed: '+(err.message||'Unknown error'))}
  finally{if(seq===counter){busy=false;controller=null;controls()}}
 });
 for(const id of ['m360-ai-hook','m360-ai-headline','m360-ai-caption','m360-ai-hashtags','m360-ai-cta']){
  $(id).addEventListener('input',captureDraft);
 }
 $('m360-ai-apply').addEventListener('click',async()=>{
  if(!active()||selectedOption<0||busy)return;
  const index=selectedOption,item=options[index];
  if(!item?.url||!item.source)return;
  captureDraft();
  const p=item.draft||item.plan;
  if(p.headline.trim().length<5||p.caption.trim().length<10){
   status('Enter a usable headline and caption before applying edits. No provider calls were made.');return;
  }
  busy=true;controls();$('m360-ai-apply').disabled=true;
  const epoch=counter;
  try{
   status('Applying selected copy and exact typography locally. No provider calls or trial credits.');
   const composed=await assemble(item.source,item.mime,p,$('m360-ai-post-channel').value);
   if(epoch!==counter||!active()||options[index]!==item)return;
   const url=URL.createObjectURL(composed.blob),old=item.url;
   item.url=url;item.plan={...p};item.draft=null;item.width=composed.width;item.height=composed.height;
   showOption(index);
   URL.revokeObjectURL(old);
   status('Edits applied to Option '+String.fromCharCode(65+index)+'. Updated image and copy ready for review; zero additional OpenAI credits.');
  }catch(e){if(epoch===counter)status('Local revision failed: '+(e.message||'Unknown error'))}
  finally{if(epoch===counter){busy=false;controls();$('m360-ai-apply').disabled=selectedOption<0}}
 });
 $('m360-ai-copy').addEventListener('click',async()=>{
  if(!active()||$('m360-ai-post-output').hidden)return;
  try{await navigator.clipboard.writeText($('m360-ai-caption').value+'\n\n'+$('m360-ai-hashtags').value);status('Caption and hashtags copied for editorial review. Nothing has been published.')}
  catch{status('Clipboard unavailable; copy from the editable text fields.')}
 });
})();
