'use strict';
/* Staging-only media API. Every request validates current CRM membership before
 * using the operator credential. Generates ONE asset per explicit user action:
 * motion-graphics MP4 or Cloudflare PNG (only with separate image-cost approval).
 * Nothing published; no Director approval is impersonated.
 */
const {createHash}=require('node:crypto');
const CRM='https://matrix360-crm-backend-p9os.onrender.com';
const SOCIAL='https://matrix360-socialmanager-recovery-staging.onrender.com';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORKSPACE=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const PLATFORM=new Set(['Instagram','Facebook','LinkedIn','X','YouTube']);
const PII=/(?:https?:\/\/|www\.|\b[\w.+-]+@[\w.-]+\.[a-z]{2,})|(?:\+?\d[\d\s().-]{7,}\d)/i;
const output=(res,code,body)=>{
 res.statusCode=code;
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.end(JSON.stringify(body));
};
const error=(res,code,reason,message)=>output(res,code,{status:reason,message});
async function jsonFetch(url,options={}){
 const r=await fetch(url,{...options,redirect:'error',cache:'no-store',
  // Genuine semantic storyboard inference can exceed the 25s general readiness timeout.
  // Extend only the authenticated, explicitly initiated reel enqueue.
  signal:AbortSignal.timeout(String(url).endsWith('/api/v2/reels') && options.method==='POST'?55000:25000),
  headers:{Accept:'application/json',...(options.headers||{})}});
 const type=(r.headers.get('content-type')||'').toLowerCase();
 if(!type.includes('application/json'))throw Error('Upstream did not return JSON');
 const raw=await r.text();
 if(raw.length>80000)throw Error('Upstream JSON too large');
 return {code:r.status,data:JSON.parse(raw)};
}
function tenant(ws) {
 const raw=process.env.M360_SOCIAL_WORKSPACE_MAP||'{}';
 let map={};try{map=JSON.parse(raw)||{}}catch{}
 const prev=map&&typeof map==='object'&&!Array.isArray(map)?map[ws]:undefined;
 if(prev!==undefined){
  if(typeof prev!=='string'||!/^([a-z0-9][a-z0-9-]{2,59})$/.test(prev)||prev==='matrix360-demo')return null;
  return prev;
 }
 return 'm360-'+createHash('sha256').update('matrix360-crm-tenant-v1:'+ws).digest('hex').slice(0,28);
}
function bodyValue(req){
 if(req.body&&typeof req.body==='object'&&!Array.isArray(req.body))return req.body;
 if(typeof req.body==='string'&&req.body.length<2200){try{return JSON.parse(req.body)}catch{}}
 return {};
}
async function ensureClient(client,name,operator){
 const hdr={'X-Matrix360-Key':operator};
 const list=await jsonFetch(SOCIAL+'/api/v2/clients',{headers:hdr});
 if(list.code!==200||!Array.isArray(list.data))return false;
 if(list.data.some(x=>x.id===client))return true;
 if(process.env.M360_SOCIAL_AUTO_PROVISION!=='yes')return false;
 const director=process.env.M360_SOCIAL_DIRECTOR_KEY||'';
 if(director.length<16||director===operator)return false;
 const value=typeof name==='string'&&name.trim().length>=3?name.trim().slice(0,72):'Matrix 360 Business';
 const result=await jsonFetch(SOCIAL+'/api/v2/clients',{
  method:'POST',headers:{'X-Matrix360-Key':director,'Content-Type':'application/json'},
  body:JSON.stringify({id:client,name:value,approved_facts:[],cta:'Learn more',approved_logo_path:''})
 });
 if(![201,409].includes(result.code))return false;
 const confirm=await jsonFetch(SOCIAL+'/api/v2/clients',{headers:hdr});
 return confirm.code===200&&Array.isArray(confirm.data)&&confirm.data.some(x=>x.id===client);
}
module.exports=async function(req,res){
 if(!['GET','POST'].includes(req.method))return error(res,405,'blocked','Method not allowed');
 const bearer=req.headers.authorization||'';
 if(!/^Bearer [A-Za-z0-9_.-]{20,8000}$/.test(bearer))
  return error(res,401,'denied','Sign in before using Creative Studio.');
 const body=req.method==='POST'?bodyValue(req):req.query||{};
 const workspace=body.workspace_id;
 if(typeof workspace!=='string'||!WORKSPACE.test(workspace))
  return error(res,400,'blocked','Choose a valid CRM business.');
 let business;
 try{
  const auth=await jsonFetch(CRM+'/me/workspaces',{headers:{Authorization:bearer}});
  if(auth.code===401)return error(res,401,'denied','CRM session expired.');
  if(auth.code!==200||!Array.isArray(auth.data))return error(res,503,'blocked','CRM permissions could not be confirmed.');
  business=auth.data.find(x=>x?.id===workspace);
 }catch{return error(res,503,'blocked','CRM is unavailable for permission checks.');}
 if(!business)return error(res,403,'denied','You cannot use media for this business.');
 const operator=process.env.M360_SOCIAL_OPERATOR_KEY||'';
 const client=tenant(workspace);
 if(operator.length<16||!client)
  return error(res,503,'not_configured','Social Manager access is not configured.');
 const kind=body.kind;
 if(!['image','reel'].includes(kind))return error(res,400,'blocked','Choose a post image or motion-graphics reel.');
 const h={'X-Matrix360-Key':operator};
 try{
  if(req.method==='POST'){
   if(process.env.M360_SOCIAL_PLAN_APPROVED!=='yes')
    return error(res,503,'approval_required','Creative provider authorization has not been enabled.');
   if(body.confirm!==true)return error(res,422,'blocked','Confirm the creative brief and type before rendering.');
   const prompt=body.prompt,platform=body.platform;
   if(typeof prompt!=='string'||prompt.trim().length<12||prompt.length>900||
     PII.test(prompt)||!PLATFORM.has(platform))
    return error(res,422,'blocked','Provide a non-sensitive 12–900-character prompt and a valid platform.');
   if(kind==='image'){
    if(process.env.M360_SOCIAL_IMAGE_APPROVED!=='yes')
     return error(res,503,'approval_required','Image generation needs separate provider-cost approval.');
    const readiness=await jsonFetch(SOCIAL+'/api/v2/images/readiness',{headers:h});
    if(readiness.code!==200||readiness.data?.ready_to_request!==true)
     return error(res,503,'provider_unavailable','Cloudflare image provider is not ready and authorized.');
   }
   // CRM tenant membership and all approval gates are checked BEFORE provisioning.
   if(!await ensureClient(client,business.name,operator))
     return error(res,503,'provisioning_failed','Authorized creative workspace enrollment is unavailable.');
   const endpoint=kind==='image'?'/api/v2/images':'/api/v2/reels';
   const payload={client_id:client,prompt:prompt.trim(),platform,
    allow_limited_fallback:true,...(kind==='reel'?{mode:'motion_graphics',duration_seconds:15}:{})};
   const r=await jsonFetch(SOCIAL+endpoint,{
    method:'POST',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify(payload)
   });
   // Preserve authentic provider/authorization failures. Do not present a 503 as a failed UUID.
   if(r.code===503||r.code===422){
    const reasons=Array.isArray(r.data?.detail?.requirements)?
      r.data.detail.requirements.filter(x=>typeof x==='string').slice(0,7).map(x=>x.slice(0,160)):[];
    const message=reasons.length?
      'Reel generation prerequisites unavailable: '+reasons.join('; '):
      (typeof r.data?.detail==='string'?r.data.detail.slice(0,260):
       'Media provider is unavailable or the creative request needs revision.');
    return output(res,r.code,{status:'provider_unavailable',message,requirements:reasons,job_started:false});
   }
   if(r.code!==202||!UUID.test(r.data?.id||''))
    return error(res,503,'generation_failed','Social Manager did not accept a verified media job.');
   return output(res,202,{status:'queued',kind,workspace_id:workspace,
    job_id:r.data.id,disclosure:kind==='reel'?
    'A prompt-derived MP4 must pass neural narration, licensed music and motion QA; no completion is guaranteed.':
    'Real Cloudflare-generated image subject to provider quota and Director review.',
    note:'Output must be reviewed; nothing was published.'});
  }
  // Read-only status polling. Only UUIDs and the already verified tenant are accepted.
  if(!UUID.test(body.job_id||''))
   return error(res,400,'blocked','A valid media job ID is required.');
  const path=kind==='image'?'/api/v2/images/':'/api/v2/reels/';
  const job=await jsonFetch(SOCIAL+path+body.job_id+'?client_id='+encodeURIComponent(client),{headers:h});
  if(job.code===404)return error(res,404,'not_found','Media job is not found in this business.');
  if(job.code!==200||!job.data)return error(res,503,'unavailable','Media status could not be retrieved.');
  const state=job.data.status;
  if(!['queued','processing','completed','failed'].includes(state))
    return error(res,503,'unavailable','Media returned an unknown status.');
  const result={status:state,workspace_id:workspace,kind,job_id:body.job_id,
   error:state==='failed'?String(job.data.error||job.data.failure||'Media rendering failed').slice(0,190):null,
   review_state:String(job.data.review_state||'not_reviewed').slice(0,36),asset_url:null};
  if(state==='completed'){
    if(kind==='reel'){
      const proof=job.data.result||{};
      if(proof.professional_audio_verified!==true||
         !proof.narration_provider||!proof.music_license||
         proof.staging_storage?.status!=='archived_in_separate_staging_only')
        return error(res,503,'reel_quality_gate_failed',
          'Reel output lacks verified neural narration, licensed recorded music, or durable private archive. It cannot be presented as a finished MP4.');
    }
    const signed=await jsonFetch(SOCIAL+path+body.job_id+'/player?client_id='+encodeURIComponent(client),{headers:h});
    const relative=kind==='image'?signed.data?.image_url:signed.data?.player_url;
    const expected=kind==='image'?'/api/v2/image-file/'+client+'/'+body.job_id:
      '/api/v2/video/'+client+'/'+body.job_id;
    if(signed.code===200&&typeof relative==='string'){
      const url=new URL(relative,SOCIAL);
      const hasToken=(url.searchParams.get('token')||'').length>12;
      const native=url.origin===SOCIAL&&url.pathname===expected&&
        relative.startsWith(expected+'?token=');
      const stagedVideo=kind==='reel'&&url.protocol==='https:'&&
        /^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)&&!url.port&&
        !url.username&&!url.password&&
        url.pathname==='/storage/v1/object/sign/matrix360-media-staging/'+
          client+'/'+body.job_id+'.mp4' &&
        signed.data?.storage==='private_staging_archive';
      if(hasToken&&(native||stagedVideo))result.asset_url=url.href;
    }
    if(!result.asset_url)
      return error(res,503,'preview_unavailable','Media completed but a secure playback link is not available.');
   result.expires_in_seconds=600;
  }
  return output(res,200,result);
 }catch{return error(res,503,'unavailable','Social Manager media service is unavailable. No completion is confirmed.');}
};
