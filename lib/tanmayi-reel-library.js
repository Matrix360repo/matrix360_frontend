'use strict';
// Private, tenant-scoped persistent motion reel archive; separate from professional reel engine.
// All writes require fresh CRM workspace authorization. No key or service token reaches browser.
const {createHash,randomUUID}=require('node:crypto');
const CRM='https://matrix360-crm-backend-p9os.onrender.com';
const DB='https://pmlacujsnnvbrimxbhpu.supabase.co';
const BUCKET='matrix360-reel-assets';
const REG=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key=()=>process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY||'';
const tenant=ws=>'m360-'+createHash('sha256').update('matrix360-crm-tenant-v1:'+ws).digest('hex').slice(0,28);
const header=(content)=>({apikey:key(),...(key().startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key()}),Accept:'application/json',...(content?{'Content-Type':content}:{})});
const answer=(res,status,value)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private,no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(value));};
const reject=(res,code,message)=>answer(res,code,{status:'error',message});
async function request(method,path,data){
 const response=await fetch(DB+path,{method,headers:header(method==='POST'?'application/json':undefined),body:method==='POST'?JSON.stringify(data||{}):undefined,signal:AbortSignal.timeout(15000),redirect:'error',cache:'no-store'});
 const raw=await response.text();let out;
 try{out=JSON.parse(raw)}catch{out={message:raw.slice(0,140)}}
 if(!response.ok){const e=new Error('Private reel storage unavailable (HTTP '+response.status+')');e.status=response.status;throw e;}
 return out;
}
async function business(ws,bearer){
 const response=await fetch(CRM+'/me/workspaces',{headers:{Authorization:bearer,Accept:'application/json'},signal:AbortSignal.timeout(12000),redirect:'error',cache:'no-store'});
 if(!response.ok)return false;const values=await response.json();return Array.isArray(values)&&values.some(x=>x?.id===ws);
}
async function signedMedia(path,kind){
 const action=kind==='upload'?'upload/sign':'sign';
 const data=await request('POST','/storage/v1/object/'+action+'/'+BUCKET+'/'+path,kind==='upload'?{}:{expiresIn:600});
 const raw=data.signedURL||data.signedUrl||data.url;
 if(typeof raw!=='string')throw Error('Private signed URL missing');
 const result=new URL(raw,DB+'/storage/v1/');
 const full=new URL(raw.startsWith('/object/')?'/storage/v1'+raw:raw,DB);
 const suffix='/storage/v1/object/'+action+'/'+BUCKET+'/'+path;
 if(full.origin!==DB||full.pathname!==suffix||!full.searchParams.get('token'))throw Error('Unexpected signed archive path');
 return full.href;
}
module.exports=async (req,res)=>{
 if(!['GET','POST'].includes(req.method))return reject(res,405,'GET/POST only');
 const bearer=req.headers?.authorization||'';
 if(!/^Bearer [A-Za-z0-9_.-]{20,8000}$/.test(bearer))return reject(res,401,'Sign in to Matrix 360 first');
 const input=req.method==='GET'?req.query||{}:typeof req.body==='string'?(()=>{try{return JSON.parse(req.body)}catch{return {}}})():req.body||{};
 const ws=input.workspace_id;
 if(typeof ws!=='string'||!REG.test(ws))return reject(res,422,'Choose a valid business');
 if(key().length<30)return reject(res,503,'Staging reel archive is not configured');
 try{
  if(!await business(ws,bearer))return reject(res,403,'Business authorization denied');
  const client=tenant(ws);
  const phase=String(input.phase||'list');
  if(req.method==='GET'){
   if(phase==='list'){
    const rows=await request('GET','/rest/v1/m360_reel_assets?workspace_id=eq.'+client+'&select=reel_id,variant,content_type,prompt,byte_size,origin,batch_id,created_at&order=created_at.desc&limit=90');
    return answer(res,200,{status:'ok',reels:Array.isArray(rows)?rows:[]});
   }
   if(phase==='play'&&UUID.test(input.reel_id||'')){
    const rows=await request('GET','/rest/v1/m360_reel_assets?workspace_id=eq.'+client+'&reel_id=eq.'+input.reel_id+'&select=file_path,content_type');
    if(!Array.isArray(rows)||rows.length!==1)return reject(res,404,'Private reel not found');
    const path=rows[0].file_path,ext=rows[0].content_type==='video/mp4'?'.mp4':'.webm';
    if(path!==client+'/'+input.reel_id+ext)return reject(res,503,'Invalid reel storage mapping');
    return answer(res,200,{status:'ok',url:await signedMedia(path,'play'),content_type:rows[0].content_type,expires_in_seconds:600});
   }
   return reject(res,422,'Unknown archive request');
  }
  if(phase==='sign'){
   const mime=input.mime,ext=mime==='video/mp4'?'.mp4':mime==='video/webm'?'.webm':null;
   if(!ext||!Number.isInteger(input.variant)||input.variant<1||input.variant>3)return reject(res,422,'Unsupported file type or reel variation');
   const prompt=String(input.prompt||'').trim();
   if(prompt.length<12||prompt.length>900)return reject(res,422,'Provide a valid original reel prompt');
   const check=await request('GET','/rest/v1/m360_reel_assets?workspace_id=eq.'+client+'&select=reel_id&limit=91');
   if(Array.isArray(check)&&check.length>=90)return reject(res,429,'Private reel storage limit reached. Archive old content before continuing.');
   const reelId=randomUUID(),path=client+'/'+reelId+ext;
   return answer(res,200,{status:'signed',reel_id:reelId,upload_url:await signedMedia(path,'upload')});
  }
  if(phase==='confirm'){
   const id=input.reel_id,mime=input.mime,variant=input.variant,prompt=String(input.prompt||'').trim();
   const ext=mime==='video/mp4'?'.mp4':mime==='video/webm'?'.webm':null;
   if(!UUID.test(id||'')||!ext||!Number.isInteger(variant)||variant<1||variant>3||prompt.length<12||prompt.length>900)
    return reject(res,422,'Invalid video confirmation');
   const path=client+'/'+id+ext;
   const info=await request('GET','/storage/v1/object/info/'+BUCKET+'/'+path);
   const size=Number(info?.metadata?.size||info?.metadata?.contentLength||0);
   if(!Number.isFinite(size)||size<30000||size>40000000)return reject(res,422,'Video bytes were not verified by private storage');
   const seen=await request('GET','/rest/v1/m360_reel_assets?workspace_id=eq.'+client+'&reel_id=eq.'+id+'&select=reel_id');
   if(Array.isArray(seen)&&seen.length)return answer(res,200,{status:'exists',reel_id:id});
   const rows=await request('POST','/rest/v1/m360_reel_assets',{workspace_id:client,reel_id:id,
    variant,file_path:path,content_type:mime,prompt,byte_size:size,origin:input.origin==='canva_export'?'canva_export':input.origin==='ai_branded'?'ai_branded':'browser_render',batch_id:UUID.test(input.batch_id||'')?input.batch_id:null});
   return answer(res,201,{status:'saved',reel_id:id,byte_size:size});
  }
  return reject(res,422,'Unknown archive action');
 }catch(e){
  return reject(res,e.status===409?409:503,String(e?.message||'Private archive failure').slice(0,160));
 }
};
