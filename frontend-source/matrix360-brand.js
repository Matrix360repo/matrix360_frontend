/* CRM-authorized persistent brand library; backend never trusts browser workspace alone. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const host=$('verified'),services=$('services');
 if(!host||!services||$('m360-brand-profile'))return;
 const panel=document.createElement('section');panel.id='m360-brand-profile';panel.className='card';
 panel.setAttribute('aria-labelledby','m360-brand-title');
 panel.innerHTML=[
 '<div class="m360-brand-head"><div><span class="eyebrow">COMPANY DETAILS</span><h2 id="m360-brand-title">Business Profile</h2><p>Keep your company facts and references ready for the content team.</p></div><span class="tag" id="m360-brand-version">Not loaded</span></div>',
 '<p id="m360-brand-status" role="status" aria-live="polite">Waiting for CRM authorization…</p>',
 '<form id="m360-brand-form"><div class="m360-brand-fields">',
 '<label>Company name<input name="business_name" maxlength="120" placeholder="Your business name"></label>',
 '<label>Website<input name="website" maxlength="240" placeholder="https://"></label>',
 '<label>Industry<input name="industry" maxlength="240" placeholder="Industry or business category"></label>',
 '<label>Email<input name="email" maxlength="240" type="email"></label>',
 '<label>Telephone<input name="phone" maxlength="160"></label>',
 '<label>WhatsApp<input name="whatsapp" maxlength="160"></label>',
 '<label>Address<input name="address" maxlength="480"></label>',
 '<label class="wide">Expansion goals<textarea name="expansion_objective" maxlength="1500" placeholder="What you develop or sell, preferred expansion regions and capacity"></textarea></label>',
 '<label class="wide">Research constraints<textarea name="research_constraints" maxlength="1500" placeholder="Excluded regions, buyer types, restrictions and evidence requirements"></textarea></label>',
 '<label>Initial investment assumption<input name="investment_budget" type="number" min="0" step="any"></label>',
 '<label>Revenue per converted client<input name="unit_sale_value" type="number" min="0" step="any"></label>',
 '<label>Delivery cost per converted client<input name="unit_delivery_cost" type="number" min="0" step="any"></label>',
 '<label>Assumed conversion percentage<input name="expected_conversion_rate" type="number" min="0" max="100" step="any"></label>',
 '<label>Planning currency<input name="planning_currency" maxlength="12" placeholder="INR"></label>',
 '<label>Brand colors<input name="colors" maxlength="350" placeholder="#163E35, #E8EFEB"></label>',
 '<label>Typography<input name="typography" maxlength="500" placeholder="Font and hierarchy guidance"></label>',
 '<label class="wide">Business description<textarea name="description" maxlength="2500" rows="3"></textarea></label>',
 '<label class="wide">Products and services, one per line<textarea name="products_services" maxlength="2400" rows="3"></textarea></label>',
 '<label class="wide">Priority audiences, one per line<textarea name="target_audience" maxlength="1800" rows="3" placeholder="Who normally buys or decides"></textarea></label>',
 '<label class="wide">Service areas, one per line<textarea name="service_areas" maxlength="1200" rows="2" placeholder="Cities, regions or markets served"></textarea></label>',
 '<label class="wide">Common campaign objectives, one per line<textarea name="campaign_objectives" maxlength="1200" rows="2" placeholder="Qualified enquiries, site visits, product launch"></textarea></label>',
 '<label>Preferred channels<input name="preferred_channels" maxlength="500" placeholder="Email, LinkedIn, Instagram"></label>',
 '<label>Typical campaign duration<input name="campaign_duration" maxlength="160" placeholder="30 days"></label>',
 '<label>Approved paid-media budget cap<input name="campaign_budget" maxlength="120" placeholder="Optional; leave blank for organic planning"></label>',
 '<label class="wide">Approved claims, one per line<textarea name="approved_claims" maxlength="2400" rows="3"></textarea></label>',
 '<label class="wide">Creative style and inspiration guidance<textarea name="style_preferences" maxlength="2500" rows="3"></textarea></label>',
 '<label class="wide">Website review &amp; content ideas<textarea name="website_research" maxlength="5000" rows="6" placeholder="Research findings appear here. Review before saving for content planning."></textarea></label>',
 '<p class="wide" id="m360-brand-save-note" role="status"></p>',
 '</div><div class="m360-brand-actions"><button class="btn" id="m360-brand-research" type="button" disabled>Research company &amp; fill gaps</button><button aria-describedby="m360-brand-save-note" class="btn primary" id="m360-brand-save" type="submit" disabled>Save business profile</button><button class="btn" id="m360-brand-reload" type="button">Reload saved profile</button></div><div id="m360-brand-research-sources" aria-live="polite"></div></form>',
 '<section id="m360-website-assets" class="m360u"><h3>Website logos &amp; images</h3><p>Find assets on your saved website, review them, then add the logo or images you have permission to use.</p><button type="button" class="btn" id="m360-find-website-assets">Find website logos &amp; images</button><p id="m360-website-assets-status" role="status"></p><div id="m360-website-assets-list"></div></section>',
 '<div class="m360-brand-assets"><h3>Saved logos &amp; inspiration</h3><p>Selected references guide future creative. Images are private and are not published.</p>',
 '<div class="m360-brand-actions"><label>Image category<select id="m360-brand-role"><option value="primary_logo">Primary logo</option><option value="alternate_logo">Alternate logo</option><option value="photograph">Approved photograph</option><option value="inspiration">Inspiration / reference</option><option value="approved_creative">Approved creative</option></select></label>',
 '<label>Choose PNG, JPEG or WEBP (under 1.9 MB)<input id="m360-brand-file" type="file" accept="image/png,image/jpeg,image/webp"></label>',
 '<button class="btn" id="m360-brand-upload" type="button" disabled>Upload private asset</button></div>',
 '<div id="m360-brand-assets-list" class="m360-brand-assets-list" aria-live="polite"></div></div>'
 ].join('');
 services.before(panel);
 const nav=document.querySelector('.workspace-nav');if(nav){const a=document.createElement('a');a.href='#m360-brand-profile';a.textContent='Brand profile & assets';nav.append(a);}
 const css=document.createElement('style');
 css.textContent='#m360-brand-profile{scroll-margin-top:24px;padding:24px;margin:24px 0;border:1px solid #d1e4db;background:linear-gradient(145deg,#fff,#f8fbf8)}'+
 '.m360-brand-head{display:flex;justify-content:space-between;align-items:flex-start;gap:15px;flex-wrap:wrap}.m360-brand-head h2{color:#173e38;font-size:clamp(22px,2.8vw,29px);margin:8px 0}'+
 '#m360-brand-profile p{color:#526f65;line-height:1.5}#m360-brand-status{font-size:13px;min-height:1.5em}.m360-brand-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:16px 0}'+
 '.m360-brand-fields label,.m360-brand-assets label{display:grid;gap:6px;color:#284b43;font-size:13px;font-weight:600}'+
 '.m360-brand-fields input,.m360-brand-fields textarea,.m360-brand-assets input,.m360-brand-assets select{width:100%;box-sizing:border-box;border:1px solid #c9d9d0;border-radius:9px;background:#fff;color:#203f38;padding:11px;font:inherit;font-weight:400}'+
 '.m360-brand-fields .wide{grid-column:1/-1}.m360-brand-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin:16px 0}'+
 '.m360-brand-assets{border-top:1px solid #d6e4df;padding-top:18px;margin-top:20px}.m360-brand-assets-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:15px}'+
 '.m360-brand-asset{background:#fff;border:1px solid #d4e1d8;border-radius:12px;padding:14px;display:grid;gap:9px;min-width:0}.m360-brand-asset img{width:100%;height:140px;object-fit:contain;background:#f4f7f5;border-radius:8px}'+
 '.m360-brand-asset strong{font-size:13px;overflow-wrap:anywhere}.m360-brand-asset-actions{display:flex;flex-wrap:wrap;gap:8px}.m360-brand-asset-actions button{font-size:12px;padding:7px 10px}'+
 '@media(max-width:690px){.m360-brand-fields{grid-template-columns:1fr}#m360-brand-profile{padding:16px}}';
 document.head.append(css);
 const form=$('m360-brand-form'),names=['business_name','website','industry','email','phone','whatsapp','address','colors','typography','description','products_services','target_audience','service_areas','campaign_objectives','preferred_channels','campaign_duration','campaign_budget','approved_claims','style_preferences','website_research','investment_budget','unit_sale_value','unit_delivery_cost','expected_conversion_rate','planning_currency','expansion_objective','research_constraints'];
 const listFields=['approved_claims','products_services','target_audience','service_areas','campaign_objectives','preferred_channels'];
 const fields=form.querySelector('.m360-brand-fields');
 const groups={
  'Business':['business_name','website','industry','email','phone','whatsapp','address','description','products_services','service_areas'],
  'Brand':['colors','typography','approved_claims','style_preferences'],
  'Campaign defaults':['target_audience','expansion_objective','research_constraints','campaign_objectives','preferred_channels','campaign_duration','campaign_budget','planning_currency','investment_budget','unit_sale_value','unit_delivery_cost','expected_conversion_rate','website_research']
 };
 for(const [title,keys] of Object.entries(groups)){
  const group=document.createElement('fieldset'),legend=document.createElement('legend');
  group.className='m360-profile-group';legend.textContent=title;group.append(legend);
  for(const key of keys)group.append(form.elements.namedItem(key).closest('label'));
  fields.append(group);
 }
 fields.append($('m360-brand-save-note'));
 const editState=document.createElement('p');editState.className='m360-brand-edit-state';editState.setAttribute('role','status');
 $('m360-brand-save').parentElement.before(editState);
 let savedFields=null;
 const saveShortcut=document.createElement('button');saveShortcut.type='button';saveShortcut.className='btn primary';saveShortcut.textContent='Save company details';saveShortcut.hidden=true;
 $('m360-brand-status').after(saveShortcut);
 saveShortcut.addEventListener('click',()=>{if(!$('m360-brand-save').disabled)form.requestSubmit($('m360-brand-save'));});
 function showEditState(){
  $('m360-brand-save').parentElement.classList.toggle('m360-save-pending',savedFields!==null&&savedFields!==JSON.stringify(serialize()));
  saveShortcut.hidden=savedFields===null||savedFields===JSON.stringify(serialize());saveShortcut.disabled=$('m360-brand-save').disabled;
  editState.textContent=savedFields===null?'':savedFields===JSON.stringify(serialize())?(revision?'All changes saved':'Profile ready to edit'):'Unsaved changes';
 }
 form.addEventListener('input',showEditState);
 let workspace='',revision=0,seq=0,busy=false,assets=[],storageReady=false,researchReady=false;
 const status=s=>{$('m360-brand-status').textContent=s;};
 function token(){try{const t=sessionStorage.getItem('matrix360_pilot_token');return t&&Number(sessionStorage.getItem('matrix360_pilot_expires_at'))>Date.now()?t:null;}catch{return null;}}
 function allow(enabled){saveShortcut.disabled=!enabled||!storageReady;$('m360-brand-save').disabled=!enabled||!storageReady;$('m360-brand-upload').disabled=!enabled||!storageReady;$('m360-brand-research').disabled=!enabled||!researchReady;$('m360-brand-reload').disabled=busy||!workspace||!token();}
 function reset(){seq++;workspace='';revision=0;assets=[];busy=false;storageReady=false;researchReady=false;form.reset();savedFields=null;showEditState();$('m360-website-assets-list').replaceChildren();$('m360-website-assets-status').textContent='';$('m360-brand-file').value='';$('m360-brand-version').textContent='Not loaded';$('m360-brand-assets-list').replaceChildren();allow(false);status('Waiting for authorized workspace…');}
 async function api(method,data){const t=token();if(!t)throw Error('Your CRM session has expired');
  const r=await fetch('/api/brand'+(method==='GET'?'?'+new URLSearchParams(data).toString():''),
   {method,cache:'no-store',signal:AbortSignal.timeout(75000),headers:{Authorization:'Bearer '+t,Accept:'application/json',...(method==='POST'?{'Content-Type':'application/json'}:{})},body:method==='POST'?JSON.stringify(data):undefined});
  const value=await r.json().catch(()=>({message:'Unreadable brand server response'}));
  if(!r.ok)throw Error(value.message||'Brand request denied (HTTP '+r.status+')');return value;
 }
 function populate(p){for(const k of names){const elem=form.elements.namedItem(k);if(!elem)continue;const v=p[k];elem.value=k==='colors'?(Array.isArray(v)?v.join(', '):''):listFields.includes(k)?(Array.isArray(v)?v.join('\n'):''):typeof v==='string'?v:'';}}
 function serialize(){const out={};for(const k of names){const x=form.elements.namedItem(k)?.value?.trim()||'';if(!x)continue;if(k==='colors')out[k]=x.split(/[\s,]+/).filter(Boolean);else if(listFields.includes(k))out[k]=x.split(k==='preferred_channels'?/[\n,]+/:/\n+/).map(v=>v.trim()).filter(Boolean);else out[k]=x;}return out;}
 async function reload(ws,n){status('Loading saved business identity…');const result=await api('GET',{workspace_id:ws,action:'profile'});if(ws!==workspace||n!==seq||!token())return;
  storageReady=result.storage_ready!==false;researchReady=result.research_ready!==false;
  $('m360-brand-save-note').textContent=storageReady?'Saving stores this profile for use across your workspace.':'Saving and uploads are unavailable until your administrator connects company storage. Keep this page open to retain your edits.';
  $('m360-brand-save').title=storageReady?'Save the reviewed company profile':'Company storage is not connected';
  revision=result.version||0;assets=Array.isArray(result.assets)?result.assets:[];
  $('m360-brand-version').textContent=revision?'Version '+revision:'New business';
  populate(result.profile||{business_name:result.business_name||''});savedFields=JSON.stringify(serialize());showEditState();allow(true);
  status(!storageReady?'Profile storage is unavailable. You can research this website, but saving and uploads are disabled.':revision?'Saved profile restored, '+assets.length+' reference assets.':'No saved profile yet. Save company details and add two approved logos before image generation.');
  document.dispatchEvent(new CustomEvent('m360:company-ready',{detail:{workspace:ws,complete:Boolean(result.profile?.industry&&result.profile?.description&&result.profile?.service_areas?.length)}}));
  await listAssets(ws,n);
 }
 const transparentButton=document.createElement('button');transparentButton.type='button';transparentButton.className='btn';transparentButton.textContent='Prepare transparent logos';
 $('m360-brand-assets-list').before(transparentButton);
 async function transparentAsset(asset,ws,n){
  if(/-transparent\.png$/i.test(asset.filename||''))return;
  if(!window.M360LogoTools)throw Error('Logo preparation did not load. Refresh this page.');
  const filename=String(asset.filename||'logo').replace(/\.[^.]+$/,'').slice(0,95)+'-transparent.png';
  const known=assets.find(a=>a.filename===filename&&a.role===asset.role&&a.selected!==false);
  if(!known){
   const signed=await api('GET',{workspace_id:ws,action:'signed',asset_id:asset.id});
   const image=new Image();image.crossOrigin='anonymous';image.src=signed.asset_url;await image.decode();
   const canvas=window.M360LogoTools.prepare(image),base64=canvas.toDataURL('image/png').split(',')[1];
   if(base64.length>2500000)throw Error('Prepared logo is too large. Upload a smaller logo.');
   if(ws!==workspace||n!==seq||!token())throw Error('Workspace changed during logo preparation.');
   await api('POST',{workspace_id:ws,action:'upload',role:asset.role,mime:'image/png',filename,base64,selected:true});
  }
  // Retain the original file; select only the prepared PNG for future creatives.
  await api('POST',{workspace_id:ws,action:'select',asset_id:asset.id,selected:false});
 }
 transparentButton.addEventListener('click',async()=>{
  const ws=workspace,n=seq;if(!ws||busy||!token())return;busy=true;allow(false);transparentButton.disabled=true;
  try{
   status('Preparing transparent PNG logos. Original files are retained…');
   for(const asset of assets.filter(a=>['primary_logo','alternate_logo'].includes(a.role)&&a.selected!==false))await transparentAsset(asset,ws,n);
   await reload(ws,n);status('Transparent PNG logos are ready. Originals are retained but unselected.');
   document.dispatchEvent(new CustomEvent('m360:brand-updated',{detail:{workspace:ws}}));
  }catch(e){status('Logo preparation needs attention: '+e.message);}
  finally{busy=false;allow(true);transparentButton.disabled=false;}
 });

 async function listAssets(ws,n){const list=$('m360-brand-assets-list');list.replaceChildren();
  if(!assets.length){const p=document.createElement('p');p.textContent='No saved logos yet. Add two approved logos for image generation. Inspiration images are optional.';list.append(p);return;}
  for(const a of assets){if(n!==seq||workspace!==ws)return;const c=document.createElement('article');c.className='m360-brand-asset';
   const title=document.createElement('strong');title.textContent=(a.role||'Asset').replaceAll('_',' ')+' · '+(a.filename||a.id);c.append(title);
   const img=document.createElement('img');img.alt='Private saved reference';img.loading='lazy';c.append(img);
   const actions=document.createElement('div');actions.className='m360-brand-asset-actions';
   const select=document.createElement('button');select.type='button';select.className='btn';select.textContent=a.selected?'Reference selected ✓':'Select reference';
   const del=document.createElement('button');del.type='button';del.className='btn';del.textContent='Delete';
   actions.append(select,del);c.append(actions);list.append(c);
   select.addEventListener('click',async()=>{if(busy||workspace!==ws)return;busy=true;select.disabled=true;try{await api('POST',{workspace_id:ws,action:'select',asset_id:a.id,selected:!a.selected});await reload(ws,seq);}catch(e){status(e.message);}finally{busy=false;select.disabled=false;}});
   del.addEventListener('click',async()=>{if(busy||workspace!==ws||!confirm('Remove this brand reference from your business library?'))return;busy=true;del.disabled=true;try{await api('POST',{workspace_id:ws,action:'delete',asset_id:a.id});await reload(ws,seq);}catch(e){status(e.message);}finally{busy=false;del.disabled=false;}});
   api('GET',{workspace_id:ws,action:'signed',asset_id:a.id}).then(v=>{if(n===seq&&workspace===ws)img.src=v.asset_url;}).catch(()=>{if(n===seq&&workspace===ws)img.alt='Private image preview unavailable';});
  }
 }
 $('m360-find-website-assets').addEventListener('click',async()=>{
  const ws=workspace,n=seq;if(!ws||busy||!token())return;
  const feedback=$('m360-website-assets-status'),list=$('m360-website-assets-list');
  if(!revision){feedback.textContent='Save the company website first.';return;}
  busy=true;allow(false);$('m360-find-website-assets').disabled=true;feedback.textContent='Checking public website pages for logos and images…';list.replaceChildren();
  try{
   const result=await api('POST',{workspace_id:ws,action:'discover_assets'});
   if(ws!==workspace||seq!==n)return;
   feedback.textContent=result.pages_checked+' pages checked. '+result.assets.length+' assets found. '+result.coverage;
   for(const item of result.assets){
    const row=document.createElement('article');row.className='m360u';
    const title=document.createElement('strong');title.textContent=item.label;
    const source=document.createElement('a');source.href=item.url;source.target='_blank';source.rel='noopener noreferrer';source.textContent='View original image';
    const choice=document.createElement('select');choice.setAttribute('aria-label','Asset role');
    for(const [value,label] of [['primary_logo','Primary company logo'],['photograph','Creative reference image']]){const option=document.createElement('option');option.value=value;option.textContent=label;choice.append(option);}choice.value=item.role;
    const save=document.createElement('button');save.type='button';save.className='btn';save.textContent='Import reviewed asset';
    const note=document.createElement('p');note.setAttribute('role','status');
    save.addEventListener('click',async()=>{
     if(ws!==workspace||seq!==n||!token()||busy)return;
     if(!confirm('Confirm this image belongs to your company or you have permission to use it in generated content.'))return;
     busy=true;allow(false);save.disabled=true;note.textContent='Saving to the private brand library…';
     try{const result=await api('POST',{workspace_id:ws,action:'import_asset',source_url:item.url,role:choice.value});if(ws!==workspace||seq!==n)return;if(choice.value==='primary_logo')await transparentAsset({id:result.asset_id,filename:item.label,role:'primary_logo'},ws,n);note.textContent='Saved for content creation.';const updated=await api('GET',{workspace_id:ws,action:'profile'});if(ws!==workspace||seq!==n)return;assets=Array.isArray(updated.assets)?updated.assets:[];await listAssets(ws,n);status('Brand library updated: '+assets.length+' reference assets.');document.dispatchEvent(new CustomEvent('m360:brand-updated',{detail:{workspace:ws}}));}
     catch(e){if(seq===n)note.textContent=e.message;}
     finally{if(seq===n){busy=false;allow(true);save.disabled=false;}}
    });
    row.append(title,document.createElement('br'),source,document.createElement('br'),choice,save,note);list.append(row);
   }
  }catch(e){if(seq===n)feedback.textContent=e.message;}
  finally{if(seq===n){busy=false;allow(true);$('m360-find-website-assets').disabled=false;}}
 });
 document.addEventListener('m360:workspace-changing',reset);document.addEventListener('m360:session-ended',reset);
 document.addEventListener('m360:crm-loaded',event=>{const ws=event.detail?.workspace;if(ws!==$('workspace')?.value||!token())return reset();if(ws===workspace)return;reset();workspace=ws;reload(ws,seq).catch(e=>{status(e.message);allow(false);});});
 $('m360-brand-reload').addEventListener('click',()=>{if(workspace&&token()&&!busy){busy=true;allow(false);reload(workspace,seq).catch(e=>status(e.message)).finally(()=>{busy=false;allow(true);});}});
 $('m360-brand-research').addEventListener('click',async()=>{if(!workspace||busy||!token())return;const company=form.elements.business_name.value.trim();if(!company)return status('Enter the company name before research.');const ws=workspace,n=seq;busy=true;allow(false);status('Reviewing the company website and public sources…');
  try{const result=await api('POST',{workspace_id:ws,action:'research',business_name:company,website:form.elements.website.value.trim()});if(ws!==workspace||n!==seq||!token())return;for(const [field,value] of Object.entries(result.suggestions||{})){const elem=form.elements.namedItem(field);if(!elem||elem.value.trim())continue;elem.value=Array.isArray(value)?value.join('\n'):value||'';}
   const sources=$('m360-brand-research-sources');sources.replaceChildren();if(result.sources?.length){const p=document.createElement('p');p.textContent='Research sources: ';for(const [index,url] of result.sources.entries()){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=new URL(url).hostname;p.append(index?', ':'',a);}sources.append(p);}showEditState();status('Website review ready. Empty fields were filled; your existing entries were kept. Review the findings, then save for content planning.');}
  catch(e){if(n===seq)status(e.message);}finally{if(n===seq){busy=false;allow(true);}}
 });
 form.addEventListener('submit',async e=>{e.preventDefault();if(!workspace||busy||!token())return;const ws=workspace,n=seq;busy=true;allow(false);status('Saving your confirmed brand identity…');const profile=serialize();
  try{const r=await api('POST',{workspace_id:ws,action:'save',expected_version:revision,profile});if(seq===n&&workspace===ws){revision=r.version;savedFields=JSON.stringify(profile);showEditState();$('m360-brand-version').textContent='Version '+revision;status(r.showcase?'Demo profile saved in this browser as version '+revision+'.':'Brand profile saved permanently as version '+revision+'.');document.dispatchEvent(new CustomEvent('m360:profile-saved',{detail:{workspace:ws,version:revision}}));}}
  catch(e){if(seq===n)status(e.message+' Reload if edited elsewhere.');}finally{busy=false;if(seq===n)allow(true);}
 });
 $('m360-brand-upload').addEventListener('click',async()=>{const ws=workspace,n=seq,f=$('m360-brand-file').files[0];
  if(!ws||busy||!token()||!f)return status('Choose a valid image.');
  if(!revision)return status('Save the business profile once before uploading references.');
  if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size<128||f.size>1900000)return status('Choose PNG/JPEG/WEBP smaller than 1.9 MB.');
  busy=true;allow(false);status('Uploading to the private business library…');
  try{const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Image could not be read'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(f);});
   const result=await api('POST',{workspace_id:ws,action:'upload',role:$('m360-brand-role').value,mime:f.type,filename:f.name,base64,selected:true});
   if(seq===n&&workspace===ws){if(['primary_logo','alternate_logo'].includes($('m360-brand-role').value))await transparentAsset({id:result.asset_id,filename:f.name,role:$('m360-brand-role').value},ws,n);$('m360-brand-file').value='';status('Image saved: '+result.asset_id);await reload(ws,n);}}
  catch(e){if(seq===n)status(e.message);}finally{busy=false;if(seq===n)allow(true);}
 });
})();
