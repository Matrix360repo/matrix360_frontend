'use strict';
// Authenticated CRM gateway: single prompt -> independent FFmpeg worker -> 3 permanent MP4s.
// Secrets stay in Vercel. FFmpeg worker never handles CRM tokens or Supabase keys.
const {createHash,createHmac,timingSafeEqual,randomUUID}=require('node:crypto');
const storyboard=require('./m360-reel-storyboard');
const {readWorkspaceProfile}=require('./m360-workspace-context');
const activeRenders=new Set();
function previewSignature(workspace,bearer,scenes,narration,brand,expires){
 const logoHash=createHash('sha256').update(brand.logo).digest('hex');
 return createHmac('sha256',process.env.OPENAI_API_KEY||'').update(JSON.stringify([
  workspace,bearer,scenes,narration,brand.name,brand.color,brand.context?.website,logoHash,expires
 ])).digest();
}
function reviewed(token,workspace,bearer,scenes,narration,brand){
 if(typeof token!=='string'||!/^\d{13}\.[a-f0-9]{64}$/.test(token))return false;
 const [expires,signature]=token.split('.');
 const now=Date.now();
 return Number(expires)>now&&Number(expires)<=now+30*60000&&timingSafeEqual(
  Buffer.from(signature,'hex'),previewSignature(workspace,bearer,scenes,narration,brand,expires));
}
const CRM='https://matrix360-crm-backend-p9os.onrender.com';
const DB='https://pmlacujsnnvbrimxbhpu.supabase.co';
const BUCKET='matrix360-reel-assets';
const WORKSPACE=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dbKey=()=>process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY||'';
const worker=()=>process.env.M360_OPENAI_FFMPEG_WORKER_URL||'https://matrix360-openai-ffmpeg-preview.onrender.com';
const workerKey=()=>process.env.M360_REEL_WORKER_KEY||'';
const tenant=ws=>'m360-'+createHash('sha256').update('matrix360-crm-tenant-v1:'+ws).digest('hex').slice(0,28);
const answer=(res,status,data)=>{res.statusCode=status;res.setHeader('Cache-Control','private,no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));};
const fail=(res,code,message)=>answer(res,code,{status:'error',message});
const dbHeaders=(type)=>({apikey:dbKey(),...(dbKey().startsWith('sb_secret_')?{}:{Authorization:'Bearer '+dbKey()}),Accept:'application/json',...(type?{'Content-Type':type}:{})});
async function db(method,path,data,options={}){
 const binary=Buffer.isBuffer(data);
 const res=await fetch(DB+path,{method,headers:{...dbHeaders(binary?'video/mp4':'application/json'),...(options.prefer?{Prefer:options.prefer}:{})},
 body:data===undefined?undefined:binary?data:JSON.stringify(data),
 cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
 const raw=await res.text();let result;try{result=raw?JSON.parse(raw):null}catch{result=raw}
 if(!res.ok){const e=new Error('Private CRM storage HTTP '+res.status);e.code=res.status;throw e;}
 return result;
}
async function member(ws,bearer){
 const response=await fetch(CRM+'/me/workspaces',{headers:{Authorization:bearer,Accept:'application/json'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!response.ok)return false;
 const workspaces=await response.json();return Array.isArray(workspaces)&&workspaces.some(item=>String(item?.id)===ws);
}
async function callWorker(method,path,data,expectVideo=false){
 if(!/^https:\/\/[a-z0-9.-]+\.onrender\.com$/i.test(worker())||workerKey().length<40)throw Error('FFmpeg worker is not configured');
 const response=await fetch(worker()+'/api/m360-motion'+path,{method,
 headers:{'X-M360-Worker-Key':workerKey(),Accept:expectVideo?'video/mp4':'application/json',...(data?{'Content-Type':'application/json'}:{})},
 body:data?JSON.stringify(data):undefined,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(expectVideo?25000:16000)});
 if(!response.ok)throw Error('FFmpeg worker HTTP '+response.status);
 if(expectVideo){
  const len=Number(response.headers.get('content-length')||0);
  if(len>36000000)throw Error('Renderer output exceeds archive limit');
  const b=Buffer.from(await response.arrayBuffer());
  if(b.length<30000||b.length>36000000||!b.subarray(0,48).includes(Buffer.from('ftyp')))throw Error('Renderer did not return playable MP4');
  return b;
 }
 return response.json();
}
async function identity(id,{approvedOnly=false}={}){
 const profile=await db('GET','/rest/v1/m360_brand_profiles?workspace_id=eq.'+id+'&select=version,profile');
 const p=profile?.[0]?.profile||{};
 const logoItems=await db('GET','/rest/v1/m360_brand_assets?workspace_id=eq.'+id+'&role=eq.primary_logo&status=eq.active&selected=eq.true&select=object_path,mime_type&order=created_at.desc&limit=1');
 let encoded='';
 let candidate=logoItems?.[0];
 if(!candidate&&!approvedOnly){
  const fallback=await db('GET','/rest/v1/m360_brand_assets?workspace_id=eq.'+id+'&role=eq.primary_logo&status=eq.active&select=object_path,mime_type&order=created_at.desc&limit=1');
  candidate=fallback?.[0];
 }
 if(candidate&&String(candidate.object_path||'').startsWith(id+'/')&&['image/png','image/jpeg','image/webp'].includes(candidate.mime_type)){
  try{
   const raw=await fetch(DB+'/storage/v1/object/authenticated/'+BUCKET.replace('reel','brand')+'/'+candidate.object_path,{
    headers:dbHeaders(),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(14000)});
   if(raw.ok){
    const blob=Buffer.from(await raw.arrayBuffer());
    if(blob.length>200&&blob.length<1400000)encoded=blob.toString('base64');
   }
  }catch{}
 }
 return {context:require('./m360-workspace-context').profileSnapshot(p,profile?.[0]?.version),claims:Array.isArray(p.approved_claims)?p.approved_claims.map(v=>String(v).slice(0,180)):[],name:String(p.business_name||'Your Business').slice(0,95),color:(Array.isArray(p.colors)?p.colors:[]).find(x=>/^#[\da-f]{6}$/i.test(x))||'#1AA9A0',logo:encoded};
}

const IMAGE_MODEL='gpt-image-1-mini';
const VISUAL_DIRECTIONS=[
 'Connected AI business growth ecosystem, compelling real technical environment and intelligent networks, cinematic establishing view',
 'Realistic marketing analytics control room, dashboards and people analyzing data, intimate editorial detail composition',
 'Premium technology growth workspace, interconnected business intelligence displays and dynamic digital ecosystem, dramatic angled composition',
 'Photorealistic wide-angle industrial or business district with realistic roads, logistics and infrastructure',
 'Distinct aerial perspective of the approved business topic with clean environmental detail and no overlaid text'
];
const PLAN_SCHEMA={type:'object',additionalProperties:false,required:['scenes'],properties:{scenes:{type:'array',items:{type:'object',additionalProperties:false,required:['headline','subline','visual'],properties:{headline:{type:'string'},subline:{type:'string'},visual:{type:'string',enum:['network','charts','orbit','tunnel','typography','particles']}}}}}};
async function generateVisualBatch(batch,client,prompt,brand){
 const key=process.env.OPENAI_API_KEY||'';
 if(key.length<30||process.env.M360_OPENAI_SPEND_APPROVED!=='yes')
  throw Error('Paid OpenAI API authorization unavailable; no visual calls were made');
 // One durable atomic reservation covers the WHOLE three-reel batch and all provider calls.
 // The three-reel batch has no application-side credit slot limiter in Preview.
 // Real image/text provider use remains billable to the connected account.
 const claims=Array.isArray(brand.claims)?brand.claims.slice(0,7):[];
 const p=await fetch('https://api.openai.com/v1/chat/completions',{
  method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(40000),
  headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
  body:JSON.stringify({model:'gpt-4o-mini',max_completion_tokens:600,temperature:0.3,
   response_format:{type:'json_schema',json_schema:{name:'motion_storyboard',strict:true,schema:PLAN_SCHEMA}},
   messages:[{role:'system',content:'Produce three DISTINCT relevant premium advertising reel concepts and scenes. Preserve explicitly quoted user headlines, in their original order when three are supplied. No invented client claims, statistics or fake logos. Use client-approved facts only. Make concise headlines and subtitles. Each visual enum must differ. The generated scene subject must reflect the supplied business and actual user request.'},
    {role:'user',content:JSON.stringify({business:brand.name,approved_claims:claims,saved_workspace_context:brand.context,research_is_unverified:true,prompt})}]})});
 const pdata=await p.json().catch(()=>({}));
 if(!p.ok)throw Error('OpenAI structured storyboard rejected ('+p.status+'): '+String(pdata.error?.message||'provider error').slice(0,130));
 let plans;try{plans=JSON.parse(pdata.choices[0].message.content).scenes}catch{throw Error('OpenAI storyboard response was not valid JSON')}
 if(!Array.isArray(plans)||plans.length!==3||new Set(plans.map(x=>x.visual)).size!==3||
  plans.some(x=>typeof x.headline!=='string'||x.headline.length<3||x.headline.length>70||
  typeof x.subline!=='string'||x.subline.length>100||
  !['network','charts','orbit','tunnel','typography','particles'].includes(x.visual)))
  throw Error('OpenAI storyboard failed the strict three-scene schema');
 const arts=await Promise.all(VISUAL_DIRECTIONS.map(async (direction,i)=>{
   const plan=plans[i%3];
   const visualPrompt='Photorealistic or premium editorial, original cinematic advertising VISUAL for a 9:16 reel. Subject and industry from the real user brief: '+
    prompt.slice(0,700)+'. Business: '+brand.name+'. '+direction+
    '. This visual supports the approach '+plan.visual+'. Brand colour '+brand.color+
    '. Distinct camera angle, meaningful objects, sophisticated natural lighting, room for text at top and bottom.'+
    ' NO readable text, NO words, NO fake logo, NO invented construction or factual claims.';
   const res=await fetch('https://api.openai.com/v1/images/generations',{
     method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(104000),
     headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
     body:JSON.stringify({model:IMAGE_MODEL,prompt:visualPrompt,size:'1024x1536',quality:'low',n:1,output_format:'jpeg',output_compression:72})});
   const reply=await res.json().catch(()=>({}));
   if(!res.ok)throw Error('OpenAI visual '+(i+1)+' failed ('+res.status+'): '+String(reply.error?.message||'provider error').slice(0,130));
   const image=reply.data?.[0]?.b64_json;
   if(typeof image!=='string'||image.length>3500000)throw Error('Missing or oversized OpenAI visual '+(i+1));
   const raw=Buffer.from(image,'base64');
   if(raw.length<5000||raw.length>2600000||raw[0]!==255||raw[1]!==216||raw[2]!==255)
    throw Error('OpenAI visual '+(i+1)+' was not a valid JPEG');
   return image;
 }));
 if(arts.length!==5)throw Error('Slideshow requires five distinct OpenAI source images');
 return {images:arts,plans};
}

async function saveCompleted(ws,batch,prompt,variant){
 const client=tenant(ws);
 const existing=await db('GET','/rest/v1/m360_reel_assets?workspace_id=eq.'+client+'&batch_id=eq.'+batch+'&variant=eq.'+variant+'&origin=eq.ffmpeg_generated&select=reel_id&limit=1');
 if(existing?.length)return existing[0].reel_id;
 const bytes=await callWorker('GET','/jobs/'+batch+'/video/'+variant,null,true);
 const reelId=randomUUID(),path=client+'/'+reelId+'.mp4';
 await db('POST','/storage/v1/object/'+BUCKET+'/'+path,bytes);
 const result=await db('POST','/rest/v1/m360_reel_assets',{workspace_id:client,reel_id:reelId,variant,file_path:path,content_type:'video/mp4',prompt,byte_size:bytes.length,origin:'ffmpeg_generated',batch_id:batch},{prefer:'return=representation'});
 if(!Array.isArray(result)||result.length!==1)throw Error('Private MP4 archive did not verify metadata');
 return reelId;
}
module.exports=async(req,res)=>{
 if(!['GET','POST'].includes(req.method))return fail(res,405,'GET/POST only');
 const bearer=req.headers?.authorization||'';
 if(!/^Bearer [A-Za-z0-9_.-]{20,8000}$/.test(bearer))return fail(res,401,'Sign into Matrix 360');
 const data=req.method==='GET'?req.query||{}:typeof req.body==='string'?(()=>{try{return JSON.parse(req.body)}catch{return{}}})():req.body||{};
 const ws=data.workspace_id;if(typeof ws!=='string'||!WORKSPACE.test(ws))return fail(res,422,'Choose a valid CRM business');
 if(dbKey().length<30)return fail(res,503,'Private Library storage not configured');
 try{
  if(!await member(ws,bearer))return fail(res,403,'Not authorized for selected business');
  const client=tenant(ws),action=String(data.action||'health');
  if(req.method==='GET'&&action==='storyboard_readiness'){
   return answer(res,200,{status:'ok',planner_ready:storyboard.approved(),renderer_ready:await storyboard.rendererReady()});
  }
  if(req.method==='POST'&&['suggest_storyboard','preview_storyboard','render_storyboard'].includes(action)){
   if(!storyboard.approved())return fail(res,503,'Authorized OpenAI storyboard access is not configured.');
   let brief,scenes,narration;
   try{
    brief=storyboard.checkText(data.prompt,12,900,'Campaign direction');
    if(action!=='suggest_storyboard'){
     narration=storyboard.validateNarration(data.narration);
    }
   }catch(error){return fail(res,422,error.message);}
   if(action==='suggest_storyboard'){
    const profile=await readWorkspaceProfile(ws);
    try{
     const suggestion=await storyboard.suggest(brief,profile||{business_name:'the selected business'});
     return answer(res,200,{status:'ok',...suggestion});
    }catch(error){
     const detail=/^(?:OpenAI storyboard request failed|The agent did not return)/.test(error.message)?error.message:'The storyboard planner did not return a usable draft. Try suggesting again.';
     return fail(res,502,detail);
    }
   }
   if(!await storyboard.rendererReady())return fail(res,503,'The reel renderer is unavailable. Try again when rendering is back online.');
   const brand=await identity(client,{approvedOnly:true});
   try{scenes=storyboard.validateScenes(data.scenes,storyboard.calloutChoices(brand.context||{}));}
   catch(error){return fail(res,422,error.message);}
   if(!brand.logo)return fail(res,422,'Select an approved primary logo in Company Details before previewing the reel.');
   if(action==='preview_storyboard'){
    const destination=storyboard.publicDestination(brand.context?.website);
    if(!destination)return fail(res,422,'Save a public HTTPS website in Company Details before previewing the reel.');
    const card=await storyboard.previewEndCard(brand,scenes.at(-1).caption);
    const expires=String(Date.now()+30*60000);
    const signature=previewSignature(ws,bearer,scenes,narration,brand,expires).toString('hex');
    return answer(res,200,{status:'preview',end_card:card.toString('base64'),website:destination.href,scenes,receipt:expires+'.'+signature});
   }
   if(data.confirm_paid!==true||!reviewed(data.preview_receipt,ws,bearer,scenes,narration,brand))
    return fail(res,422,'Preview the current storyboard and branding, then confirm one billable render.');
   if(activeRenders.has(client))return fail(res,409,'This workspace already has a reel rendering.');
   activeRenders.add(client);
   try{
    const clips=new Map();
    for(const id of new Set(scenes.filter(scene=>scene.footage!=='ai'&&scene.footage!=='end_card').map(scene=>scene.footage))){
     const rows=await db('GET','/rest/v1/m360_reel_assets?workspace_id=eq.'+client+'&reel_id=eq.'+id+'&select=file_path,content_type,byte_size&limit=1');
     const clip=rows?.[0],extension=clip?.content_type==='video/mp4'?'.mp4':clip?.content_type==='video/webm'?'.webm':'';
     const path=client+'/'+id+extension;
     if(!extension||clip.file_path!==path||!Number.isFinite(Number(clip.byte_size))||clip.byte_size<30000||clip.byte_size>40000000)return fail(res,422,'A selected video is unavailable for this workspace.');
     const response=await fetch(DB+'/storage/v1/object/authenticated/'+BUCKET+'/'+path,{headers:dbHeaders(),redirect:'error',signal:AbortSignal.timeout(22000),cache:'no-store'});
     if(!response.ok)throw Error('Could not read the selected private footage.');
     const bytes=Buffer.from(await response.arrayBuffer());
     if(bytes.length<30000||bytes.length>40000000)throw Error('Saved footage has an invalid size.');
     clips.set(id,bytes);
    }
    const speech=await storyboard.narrate(narration);
    const context={...brand.context,business_name:brand.name};
    const bytes=await storyboard.compose(scenes,scene=>scene.footage==='ai'?storyboard.generateImage(scene,context):clips.get(scene.footage),brand,speech);
    if(bytes.length<30000||bytes.length>36000000||!bytes.subarray(0,48).includes(Buffer.from('ftyp')))throw Error('The renderer did not produce a valid-sized MP4.');
    const reelId=randomUUID(),path=client+'/'+reelId+'.mp4';
    await db('POST','/storage/v1/object/'+BUCKET+'/'+path,bytes);
    const rows=await db('POST','/rest/v1/m360_reel_assets',{workspace_id:client,reel_id:reelId,variant:1,file_path:path,content_type:'video/mp4',prompt:brief,byte_size:bytes.length,origin:'ffmpeg_generated'},{prefer:'return=representation'});
    if(!Array.isArray(rows)||rows.length!==1)throw Error('The rendered video was not confirmed in the private archive.');
    return answer(res,201,{status:'saved',reel_id:reelId,width:1080,height:1920,duration_seconds:15,audio:'AI narration and original instrumental music',ai_scenes:scenes.filter(scene=>scene.footage==='ai').length});
   }finally{activeRenders.delete(client);}
  }
  if(req.method==='GET'&&action==='health'){
   const info=await callWorker('GET','/health');
   return answer(res,200,{status:'ok',ready:info.ready===true,engine:'FFmpeg',cost:'Provider usage billed to connected account',duration_seconds:15,variants:3,provider:IMAGE_MODEL});
  }
  if(req.method==='GET'&&action==='recent'){
   const recent=await db('GET','/rest/v1/m360_motion_jobs?workspace_id=eq.'+client+'&select=batch_id,prompt,created_at&order=created_at.desc&limit=1');
   return answer(res,200,{status:'ok',batch:recent?.[0]||null});
  }
  if(req.method==='POST'&&action==='generate'){
   const prompt=String(data.prompt||'').trim();
   if(prompt.length<12||prompt.length>900)return fail(res,422,'Prompt must be 12–900 characters');
   // Trial frequency cap retired. Durable paid budget and worker capacity protections remain.\n   const batch=randomUUID(),brand=await identity(client);
   const art=await generateVisualBatch(batch,client,prompt,brand);
   const result=await callWorker('POST','/jobs',{id:batch,prompt,business_name:brand.name,logo_base64:brand.logo,brand_color:brand.color,workspace_id:client,images_base64:art.images,scene_plans:art.plans});
   if(result.id!==batch)throw Error('Renderer returned incorrect batch identity');
   await db('POST','/rest/v1/m360_motion_jobs',{workspace_id:client,batch_id:batch,prompt},{prefer:'return=representation'});
   return answer(res,202,{status:'queued',batch_id:batch,variants:3,engine:'OpenAI images + FFmpeg',image_model:IMAGE_MODEL,monthly_slot_cap:null,brand_logo_included:!!brand.logo});
  }
  if(req.method==='GET'&&action==='status'){
   const batch=String(data.batch_id||'');if(!UUID.test(batch))return fail(res,422,'Invalid batch ID');
   const jobs=await db('GET','/rest/v1/m360_motion_jobs?workspace_id=eq.'+client+'&batch_id=eq.'+batch+'&select=prompt,batch_id&limit=1');
   if(!jobs?.length)return fail(res,404,'Batch not found in this business');
   const prompt=jobs[0].prompt;
   const existing=await db('GET','/rest/v1/m360_reel_assets?workspace_id=eq.'+client+'&batch_id=eq.'+batch+'&origin=eq.ffmpeg_generated&select=reel_id,variant&limit=3');
   let status;try{status=await callWorker('GET','/jobs/'+batch)}catch(e){status={state:'worker_unavailable',variants:{}};}
   const items=[];
   for(let i=1;i<=3;i++){
    const found=existing?.find(x=>x.variant===i);
    if(found){items.push({variant:i,status:'saved',reel_id:found.reel_id});continue;}
    const state=status.variants?.[i]||status.variants?.[String(i)]||{status:'queued'};
    if(state.status==='complete'){
     try{const id=await saveCompleted(ws,batch,prompt,i);items.push({variant:i,status:'saved',reel_id:id});}
     catch(e){items.push({variant:i,status:'archive_error',message:String(e.message||e).slice(0,150)});}
    }else items.push({variant:i,status:state.status||'pending',message:state.message||null});
   }
   return answer(res,200,{status:'ok',batch_id:batch,engine:'OpenAI images + FFmpeg',state:status.state,items});
  }
  return fail(res,422,'Unsupported motion request');
 }catch(e){
  const stage=data.action==='preview_storyboard'?'Reel preview could not be prepared':data.action==='render_storyboard'?'Reel render could not be completed':'Motion renderer unavailable';
  return fail(res,503,stage+': '+String(e.message||e).slice(0,190));
 }
};
