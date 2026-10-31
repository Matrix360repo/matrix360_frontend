/* Matrix 360 visual post companion: REAL browser PNG, no provider charges.
   Uses the authorized CRM business and the same prompt as Tanmayi's copy planner.
   This is a designed graphic, NOT AI-generated photography or a published post. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const core=window.Matrix360PostDraft,form=$('creative-form'),host=$('creative-studio');
 if(!core||!form||!host||$('m360-post-graphic-panel'))return;
 const section=document.createElement('section');
 section.id='m360-post-graphic-panel';
 section.setAttribute('aria-labelledby','m360-post-graphic-heading');
 section.innerHTML=
  "<h3 id='m360-post-graphic-heading'>Create a real post graphic</h3>"+
  "<p>Generate a downloadable PNG for the selected business and channel. Captions are editable above. This is an original, designed graphic—not an AI photograph.</p>"+
  "<button type='button' class='btn primary' id='m360-create-post-graphic' disabled>Create PNG post graphic · no credits</button>"+
  "<p id='m360-post-graphic-status' role='status' aria-live='polite'>Choose an authorized business to begin.</p>"+
  "<div id='m360-post-graphic-result' aria-live='polite'></div>";
 form.after(section);
 const style=document.createElement('style');
 style.textContent=
 "#m360-post-graphic-panel{border:1px solid #cfe3da;border-radius:15px;background:#f5fbf7;padding:20px;margin-top:18px}"+
 "#m360-post-graphic-panel p{font-size:13px;color:#476c67;line-height:1.5}"+
 "#m360-post-graphic-result img{display:block;width:min(100%,500px);height:auto;max-height:520px;object-fit:contain;border-radius:12px;margin:12px 0;border:1px solid #d9e7df}"+
 "#m360-post-graphic-result .m360-post-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}"+
 "#m360-post-graphic-result .m360-post-note{font-size:12px;color:#59746e}";
 document.head.append(style);
 const visualChannels=new Set(Object.keys(core.SIZES));
 let workspace='',epoch=0,latestUrl='',busy=false,draft=null;
 const label=(text)=>{$('m360-post-graphic-status').textContent=text};
 const validSession=()=>{
  try{const t=sessionStorage.getItem('matrix360_pilot_token'),exp=Number(sessionStorage.getItem('matrix360_pilot_expires_at'));return !!(t&&exp>Date.now());}catch{return false}
 };
 const selected=()=>$('workspace')?.value;
 const valid=()=>Boolean(validSession()&&workspace&&selected()===workspace);
 function enabled(){
  const channel=$('creative-platform')?.value;
  $('m360-create-post-graphic').disabled=busy||!valid()||!visualChannels.has(channel);
  if(valid()&&channel&&!visualChannels.has(channel))label('Text-only channel selected. Use the editable message draft above; an image is not required for SMS.');
 }
 function dispose(){
  epoch++;busy=false;workspace='';draft=null;
  if(latestUrl){URL.revokeObjectURL(latestUrl);latestUrl=''}
  $('m360-post-graphic-result').replaceChildren();
  $('m360-create-post-graphic').disabled=true;
  label('Choose an authorized CRM business to generate a post graphic.');
 }
 document.addEventListener('m360:workspace-changing',dispose);
 document.addEventListener('m360:session-ended',dispose);
 document.addEventListener('visibilitychange',()=>{if(!validSession())dispose()});
 document.addEventListener('m360:crm-loaded',event=>{
  const ws=event?.detail?.workspace;
  if(!validSession()||!ws||ws!==selected())return dispose();
  if(workspace&&workspace!==ws)dispose();
  workspace=ws;epoch++;busy=false;draft=null;
  enabled();
  if(visualChannels.has($('creative-platform')?.value))label('Ready. Enter a brief and create a PNG post, or generate copy and graphic together.');
 });
 $('creative-platform')?.addEventListener('change',()=>{draft=null;if(latestUrl){URL.revokeObjectURL(latestUrl);latestUrl=''}$('m360-post-graphic-result').replaceChildren();enabled()});
 $('creative-prompt')?.addEventListener('input',()=>{draft=null});
 async function generate(brief){
  const platform=$('creative-platform')?.value,ws=selected();
  if(!valid()||ws!==workspace)throw Error('Choose your authorized business and sign in.');
  if(!visualChannels.has(platform))throw Error('This channel does not use a post image.');
  if(!$('creative-confirm')?.checked)throw Error('Confirm your brief contains no personal data or unapproved claims.');
  const prompt=$('creative-prompt')?.value?.trim()||'';
  if(!prompt||prompt.length<12||prompt.length>900)throw Error('Describe the post in 12–900 characters.');
  const business=$('workspace')?.selectedOptions?.[0]?.textContent?.trim()||'';
  const match=brief&&brief.workspace===ws&&brief.platform===platform&&brief.prompt===prompt?brief:null;
  const plan=core.plan({prompt,business,workspace:ws,platform,
    headline:match?.headline||'',cta:match?.cta||'Explore more'});
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  if(!ctx)throw Error('PNG design is not supported by this browser.');
  core.draw(ctx,plan);
  const blob=await new Promise((resolve,reject)=>{
   try{canvas.toBlob(b=>b?resolve(b):reject(Error('The browser failed to encode the post PNG.')),'image/png');}
   catch(e){reject(e)}
  });
  if(blob.type!=='image/png'||blob.size<500)throw Error('PNG encoding returned an invalid image.');
  const magic=new Uint8Array(await blob.slice(0,8).arrayBuffer());
  if(magic.join(',')!=='137,80,78,71,13,10,26,10')throw Error('PNG file signature verification failed.');
  return {blob,plan};
 }
 async function create(brief){
  if(busy)return;
  const snapshot=++epoch,ws=workspace,channel=$('creative-platform')?.value;
  busy=true;enabled();label('Rendering the actual PNG graphic and validating its file bytes…');
  try{
   const {blob,plan}=await generate(brief);
   if(snapshot!==epoch||!valid()||ws!==workspace||channel!==$('creative-platform')?.value)return;
   if(latestUrl)URL.revokeObjectURL(latestUrl);
   latestUrl=URL.createObjectURL(blob);
   const result=$('m360-post-graphic-result');result.replaceChildren();
   const image=document.createElement('img');image.alt='Designed social media post, requires human review';image.src=latestUrl;
   const note=document.createElement('p');note.className='m360-post-note';
   note.textContent=plan.width+' × '+plan.height+' PNG · '+Math.round(blob.size/1024)+' KB · Designed graphic (not AI photography) · Not published';
   const actions=document.createElement('div');actions.className='m360-post-actions';
   const link=document.createElement('a');link.className='btn primary';link.textContent='Download PNG post';
   link.href=latestUrl;link.download='matrix360-post-'+channel.toLowerCase().replace(/[^a-z]+/g,'-')+'.png';
   const info=document.createElement('span');info.textContent='Use the editable caption above with this image.';
   actions.append(link,info);result.append(image,note,actions);
   label('Post graphic created and verified. Download it and review before publishing.');
  }catch(e){if(snapshot===epoch){$('m360-post-graphic-result').replaceChildren();label(e.message||'Post generation failed.');}}
  finally{if(snapshot===epoch){busy=false;enabled();}}
 }
 $('m360-create-post-graphic').addEventListener('click',()=>create(draft));
 document.addEventListener('m360:creative-draft-ready',event=>{
  const d=event?.detail;if(!d||!valid()||d.workspace!==workspace||d.platform!==$('creative-platform')?.value)return;
  draft={workspace:d.workspace,platform:d.platform,prompt:d.prompt,headline:d.headline,cta:d.cta};
  if(visualChannels.has(d.platform)&&$('creative-confirm')?.checked)void create(draft);
 });
})();
