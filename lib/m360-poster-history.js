'use strict';
// Matrix 360: CRM-authorized, private source-artwork and revision history.
// No browser service key; no cross-tenant reads; historical versions immutable.
const {createHash}=require('node:crypto');
const CRM='https://matrix360-crm-backend-p9os.onrender.com';
const DB='https://pmlacujsnnvbrimxbhpu.supabase.co';
const BUCKET='matrix360-poster-history';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORKSPACE=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const CHANNELS=new Set(['Instagram','Facebook','LinkedIn','X','YouTube','Email','WhatsApp','Google Business Profile','Website']);
const key=()=>process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY||'';
const send=(res,code,body)=>{res.statusCode=code;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(body))};
const fail=(res,code,message)=>send(res,code,{status:'error',message});
const clientId=(ws)=>'m360-'+createHash('sha256').update('matrix360-crm-tenant-v1:'+ws).digest('hex').slice(0,28);
const headers=(contentType)=>({apikey:key(),...(key().startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key()}),Accept:'application/json',...(contentType?{'Content-Type':contentType}:{})});
async function request(method,path,body,options={}){
 const response=await fetch(DB+path,{method,headers:{...headers(Buffer.isBuffer(body)?'image/jpeg':'application/json'),...(options.prefer?{Prefer:options.prefer}:{})},body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body),signal:AbortSignal.timeout(16000),redirect:'error',cache:'no-store'});
 const text=await response.text();let parsed;try{parsed=text?JSON.parse(text):null}catch{parsed=text}
 if(!response.ok){const e=new Error('Private poster history unavailable (HTTP '+response.status+')');e.http=response.status;throw e}
 return parsed;
}
async function authorize(ws,bearer){
 const r=await fetch(CRM+'/me/workspaces',{headers:{Authorization:bearer,Accept:'application/json'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(13000)});
 if(!r.ok)return false;
 const list=await r.json();return Array.isArray(list)&&list.some(x=>x?.id===ws);
}
function validPlan(plan){
 if(!plan||typeof plan!=='object'||Array.isArray(plan)||Buffer.byteLength(JSON.stringify(plan))>12000)throw Error('Invalid saved design plan');
 return plan;
}
function validOverlay(overlay){
 if(!overlay||typeof overlay!=='object'||Array.isArray(overlay)||Buffer.byteLength(JSON.stringify(overlay))>1800)throw Error('Invalid poster overlay settings');
 return overlay;
}
function jpeg(value){
 if(typeof value!=='string'||value.length>3900000||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('Source artwork must be a bounded JPEG');
 const b=Buffer.from(value,'base64');
 if(b.length<5000||b.length>2900000||b[0]!==255||b[1]!==216||b[2]!==255)throw Error('Source artwork is not a valid-sized JPEG');
 return b;
}
module.exports=async(req,res)=>{
 if(!['GET','POST'].includes(req.method))return fail(res,405,'Only GET and POST are supported');
 const bearer=req.headers?.authorization||'';
 if(!/^Bearer [A-Za-z0-9_.-]{20,8000}$/.test(bearer))return fail(res,401,'Sign in to Matrix 360');
 const body=req.method==='GET'?req.query||{}:typeof req.body==='string'?(()=>{try{return JSON.parse(req.body)}catch{return{}}})():req.body||{};
 const ws=body.workspace_id;
 if(typeof ws!=='string'||!WORKSPACE.test(ws))return fail(res,422,'Choose a valid business workspace');
 if(key().length<30)return fail(res,503,'Private creative archive is not configured');
 try{
  if(!await authorize(ws,bearer))return fail(res,403,'Business membership could not be verified');
  const tenant=clientId(ws);
  const action=String(body.action||'list');
  if(req.method==='GET'){
   if(action==='list'){
    const rows=await request('GET','/rest/v1/m360_poster_versions?workspace_id=eq.'+tenant+'&select=poster_id,version,channel,instruction,plan,overlay,created_at&order=created_at.desc&limit=100');
    return send(res,200,{status:'ok',versions:Array.isArray(rows)?rows:[]});
   }
   if(action==='source'){
    if(!UUID.test(body.poster_id||'')||!Number.isSafeInteger(Number(body.version))||Number(body.version)<1)return fail(res,422,'Choose an existing poster version');
    const version=Number(body.version);
    const found=await request('GET','/rest/v1/m360_poster_versions?workspace_id=eq.'+tenant+'&poster_id=eq.'+body.poster_id+'&version=eq.'+version+'&select=image_path');
    if(!Array.isArray(found)||found.length!==1)return fail(res,404,'Poster version not found for this business');
    const original=found[0].image_path;
    if(typeof original!=='string'||original!==tenant+'/'+body.poster_id+'/'+version+'.jpg')return fail(res,503,'Invalid private poster storage path');
    const path=body.view==='final'?tenant+'/'+body.poster_id+'/'+version+'-final.jpg':original;
    const signed=await request('POST','/storage/v1/object/sign/'+BUCKET+'/'+path,{expiresIn:300});
    const pathPart=signed?.signedURL||signed?.signedUrl;
    if(typeof pathPart!=='string')return fail(res,503,'Private poster URL unavailable');
    const parsed=new URL(pathPart,DB);
    const expected='/object/sign/'+BUCKET+'/'+path;
    if(parsed.origin!==DB||!['/storage/v1'+expected,expected].includes(parsed.pathname)||!parsed.searchParams.get('token'))return fail(res,503,'Invalid signed poster URL');
    return send(res,200,{status:'ok',source_url:DB+'/storage/v1'+expected+'?token='+encodeURIComponent(parsed.searchParams.get('token')),expires_in_seconds:300});
   }
   return fail(res,422,'Unknown poster history request');
  }
  if(action==='save-final'){
   const id=body.poster_id,v=body.version;
   if(!UUID.test(id||'')||!Number.isInteger(v)||v<1||v>250)return fail(res,422,'Invalid image version');
   const rows=await request('GET','/rest/v1/m360_poster_versions?workspace_id=eq.'+tenant+'&poster_id=eq.'+id+'&version=eq.'+v+'&select=image_path');
   if(!Array.isArray(rows)||rows.length!==1||rows[0].image_path!==tenant+'/'+id+'/'+v+'.jpg')return fail(res,404,'Save the source artwork before the branded image');
   const image=jpeg(body.image_base64),objectPath=tenant+'/'+id+'/'+v+'-final.jpg';
   try{await request('POST','/storage/v1/object/'+BUCKET+'/'+objectPath,image);}catch(error){
    // A lost upload acknowledgement can be retried without replacing immutable artwork.
    const existing=await fetch(DB+'/storage/v1/object/authenticated/'+BUCKET+'/'+objectPath,{headers:headers(),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(16000)});
    if(!existing.ok)throw error;
    const bytes=Buffer.from(await existing.arrayBuffer());
    if(!bytes.equals(image))return fail(res,409,'A different branded image already exists for this version. Save edits as a new version.');
   }
   return send(res,200,{status:'final_saved',poster_id:id,version:v,sha256:createHash('sha256').update(image).digest('hex')});
  }
  if(action==='final-sign'){
   const id=body.poster_id,v=body.version;
   if(!UUID.test(id||'')||!Number.isInteger(v)||v<1||v>250)return fail(res,422,'Invalid image version');
   const existing=await request('GET','/rest/v1/m360_poster_versions?workspace_id=eq.'+tenant+'&poster_id=eq.'+id+'&version=eq.'+v+'&select=poster_id');
   if(!Array.isArray(existing)||existing.length!==1)return fail(res,404,'Save the source artwork before final preview');
   const path=tenant+'/'+id+'/'+v+'-final.jpg';
   const sign=await request('POST','/storage/v1/object/upload/sign/'+BUCKET+'/'+path,{});
   const raw=sign?.signedURL||sign?.signedUrl||sign?.url;
   if(typeof raw!=='string')return fail(res,503,'Final image upload authorization unavailable');
   const url=new URL(raw.startsWith('/object/')?'/storage/v1'+raw:raw,DB);
   if(url.origin!==DB||url.pathname!=='/storage/v1/object/upload/sign/'+BUCKET+'/'+path||!url.searchParams.get('token'))return fail(res,503,'Invalid final artwork upload URL');
   return send(res,200,{status:'signed',upload_url:url.href});
  }
  if(action!=='save')return fail(res,422,'Unknown poster write operation');
  const id=body.poster_id,v=body.version,channel=body.channel;
  if(!UUID.test(id||'')||!Number.isInteger(v)||v<1||v>250||!CHANNELS.has(channel))return fail(res,422,'Poster identity, version or channel is invalid');
  const instruction=String(body.instruction||'').trim().slice(0,700);
  if(!instruction) return fail(res,422,'Revision instruction is required');
  const plan=validPlan(body.plan),overlay=validOverlay(body.overlay||{});
  const image=jpeg(body.image_base64);
  const path=tenant+'/'+id+'/'+v+'.jpg';
  // Immutable version paths. No overwrites. A duplicate request is reconciled below.
  const existing=await request('GET','/rest/v1/m360_poster_versions?workspace_id=eq.'+tenant+'&poster_id=eq.'+id+'&version=eq.'+v+'&select=image_path');
  if(Array.isArray(existing)&&existing.length)return send(res,200,{status:'exists',poster_id:id,version:v});
  await request('POST','/storage/v1/object/'+BUCKET+'/'+path,image);
  const rows=await request('POST','/rest/v1/m360_poster_versions',{
   workspace_id:tenant,poster_id:id,version:v,image_path:path,channel,instruction,plan,overlay
  },{prefer:'return=representation'});
  if(!Array.isArray(rows)||rows.length!==1)throw Error('Poster version metadata was not confirmed');
  return send(res,201,{status:'saved',poster_id:id,version:v});
 }catch(e){
  const status=e.http===409?409:e.http===400?422:/invalid|bounded|valid-sized|too large/i.test(e.message||'')?422:503;
  return fail(res,status,status===503?'Private poster storage failed; no success was recorded.':String(e.message).slice(0,180));
 }
};
