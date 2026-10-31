'use strict';
// Genuine OpenAI SaaS post pipeline: semantic brief -> HMAC bound plan -> real AI image.
// Cost-gated, CRM tenant-authorized, no mocked/template fallback and no publishing.
const {createHash,createHmac,timingSafeEqual,randomUUID}=require('node:crypto');
const CRM='https://matrix360-crm-backend-p9os.onrender.com', OPENAI='https://api.openai.com/v1';
const WORKSPACE=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const TRIAL_DB='https://pmlacujsnnvbrimxbhpu.supabase.co';
const quotaKey=()=>process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY||'';
const quotaReady=()=>quotaKey().length>=30;
const hashSession=bearer=>createHash('sha256').update(bearer).digest('hex');
const CHANNELS=new Set(['Instagram','Facebook','LinkedIn','X','YouTube','Email','WhatsApp','Google Business Profile','Website']);
const SCHEMA={type:'object',additionalProperties:false,required:['meaningful','hook','headline','subheadline','cta','caption','hashtags','visual_prompt','layout','language','alt_text','review_notes'],properties:{
 meaningful:{type:'boolean'},hook:{type:'string'},headline:{type:'string'},subheadline:{type:'string'},cta:{type:'string'},caption:{type:'string'},
 hashtags:{type:'array',items:{type:'string'}},visual_prompt:{type:'string'},
 layout:{type:'string',enum:['top','bottom','left']},language:{type:'string'},alt_text:{type:'string'},
 review_notes:{type:'array',items:{type:'string'}}}};
const send=(res,code,data)=>{res.statusCode=code;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(data))};
const reject=(res,code,status,message)=>send(res,code,{status,message});
const txt=(v,max)=>String(typeof v==='string'?v:'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const enabled=()=>typeof process.env.OPENAI_API_KEY==='string'&&process.env.OPENAI_API_KEY.length>=30&&process.env.M360_OPENAI_SPEND_APPROVED==='yes';
const signKey=()=>createHash('sha256').update('m360-staging-post-v1:'+(process.env.M360_AI_POST_SIGNING_SECRET||process.env.OPENAI_API_KEY||'')).digest();
function seal(plan,workspace,channel,bearer,trialId){
 const json=Buffer.from(JSON.stringify({v:1,issued:Date.now(),workspace,channel,
  session:hashSession(bearer),plan,trialId})).toString('base64url');
 return json+'.'+createHmac('sha256',signKey()).update(json).digest('base64url');
}
function unseal(token,workspace,channel,bearer){
 if(typeof token!=='string'||token.length>16000||!token.includes('.'))throw Error('Creative approval missing or invalid');
 const [data,sig]=token.split('.');
 const expected=createHmac('sha256',signKey()).update(data).digest();
 const actual=Buffer.from(sig,'base64url');
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error('Invalid creative approval signature');
 const item=JSON.parse(Buffer.from(data,'base64url').toString('utf8'));
 if(item.v!==1||item.workspace!==workspace||item.channel!==channel||
    item.session!==hashSession(bearer)||
    Date.now()-item.issued>900000||item.issued>Date.now()+5000)
    throw Error('Creative approval expired or belongs to another business/session');
 if(typeof item.trialId!=='string'||!/^[0-9a-f-]{36}$/i.test(item.trialId))throw Error('Trial authorization missing');
 return {plan:item.plan,trialId:item.trialId};
}
function sanitize(p){
 if(!p||p.meaningful!==true)throw Error('The brief is incoherent or lacks a meaningful creative objective');
 const z={};
 for(const [k,n] of Object.entries({hook:130,headline:100,subheadline:180,cta:80,caption:2000,visual_prompt:1400,alt_text:260}))
  z[k]=txt(p[k],n);
 if(z.headline.length<5||z.caption.length<25||z.visual_prompt.length<40)throw Error('AI returned an incomplete creative brief');
 z.layout=['top','bottom','left'].includes(p.layout)?p.layout:'bottom';
 z.language=txt(p.language,45)||'English';
 z.hashtags=Array.isArray(p.hashtags)?p.hashtags.slice(0,12).map(x=>txt(x,48)).filter(Boolean):[];
 z.review_notes=Array.isArray(p.review_notes)?p.review_notes.slice(0,8).map(x=>txt(x,220)).filter(Boolean):[];
 return z;
}
async function membership(id,bearer){
 const r=await fetch(CRM+'/me/workspaces',{headers:{Authorization:bearer,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(r.status===401)return{code:401};if(!r.ok)return{code:503};
 const list=await r.json();if(!Array.isArray(list))return{code:503};
 const item=list.find(x=>String(x?.id)===id);
 return item?{code:200,name:txt(item.name,72)||'Authorized business',
 facts:Array.isArray(item.approved_facts)?item.approved_facts.filter(x=>typeof x==='string').slice(0,8).map(x=>txt(x,180)):[]}:{code:403};
}
// Best-effort, tenant-scoped READ ONLY brand snapshot. No generation calls or writes.
// Existing OpenAI model, signatures, RPC reservation and image output stay unchanged.
const {readWorkspaceProfile:authorizedBrandSnapshot}=require('../lib/m360-workspace-context');

async function quotaRPC(functionName,request){
 const key=quotaKey();
 if(!quotaReady())throw Error('Durable staging quota has not been configured.');
 const r=await fetch(TRIAL_DB+'/rest/v1/rpc/'+functionName,{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(14000),
  headers:{apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key}),
   Accept:'application/json','Content-Type':'application/json'},
  body:JSON.stringify(request)});
 if(!r.ok)throw Error('Durable paid budget authorization denied or is unavailable (HTTP '+r.status+')');
 const raw=await r.text();
 return raw.trim()==='true';
}
async function checkOpenAIModel(model){
 // Safe and non-generative. Checks the same server-side API key used by paid requests.
 const key=process.env.OPENAI_API_KEY||'';
 if(typeof key!=='string'||key.length<30)return {ok:false,reason:'missing_key'};
 if(!key.startsWith('sk-')||key!==key.trim()||/\s/.test(key))
   return {ok:false,reason:'malformed_key'};
 try{
  const response=await fetch(OPENAI+'/models/'+encodeURIComponent(model),{
   method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),
   headers:{Authorization:'Bearer '+key,Accept:'application/json'}});
  return {ok:response.ok,reason:response.ok?'ok':
   response.status===401?'rejected_key':response.status===403?'permission_denied':
   response.status===404?'model_not_found':
   response.status===429?'provider_rate_limited':'provider_http_'+response.status};
 }catch{return {ok:false,reason:'unreachable'}}
}
async function providerPreflight(workspace){
 // No model inference, image generation, reservation, or paid provider execution.
 const checks={openai_model_access:false,openai_image_model_access:false,
  openai_text_status:'not_checked',openai_image_status:'not_checked',
  staging_quota_access:false,remaining:null};
 const text=await checkOpenAIModel(process.env.M360_OPENAI_TEXT_MODEL||'gpt-4.1-mini');
 checks.openai_model_access=text.ok;checks.openai_text_status=text.reason;
 if(text.reason!=='rejected_key'&&text.reason!=='missing_key'&&text.reason!=='malformed_key'){
  const image=await checkOpenAIModel(process.env.M360_OPENAI_IMAGE_MODEL||'gpt-image-1.5');
  checks.openai_image_model_access=image.ok;checks.openai_image_status=image.reason;
 }else checks.openai_image_status=text.reason;
 checks.staging_quota_access=true;checks.remaining=null;
 return checks;
}
function preflightError(res,diagnostic){
 if(diagnostic.ok)return false;
 const message=diagnostic.reason==='rejected_key'?'OpenAI rejected the staging API key. Replace it in Vercel Preview with a valid project API key, then redeploy. No trial reservation was used.':
 diagnostic.reason==='malformed_key'?'OPENAI_API_KEY has an invalid format or extra whitespace. Set the bare project API key, not a Bearer header or JSON, then redeploy. No trial reservation was used.':
 diagnostic.reason==='permission_denied'?'OpenAI API project lacks access to the selected model. Review model permissions before retrying. No trial reservation was used.':
 diagnostic.reason==='model_not_found'?'Configured OpenAI model is unavailable or unknown. Check the Preview model setting. No trial reservation was used.':
 diagnostic.reason==='missing_key'?'OpenAI API key is missing. No trial reservation was used.':
 'OpenAI provider model-access check failed ('+diagnostic.reason+'). No trial reservation was used.';
 reject(res,503,'provider_preflight_failed',message);
 return true;
}
async function openai(route,data,timeout){
 const r=await fetch(OPENAI+route,{method:'POST',redirect:'error',signal:AbortSignal.timeout(timeout),
  headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(data)});
 if(!r.ok)return {failed:true,code:r.status===429?429:r.status===401?503:r.status===400?422:502,
  message:r.status===429?'OpenAI API quota or rate limit reached':r.status===401?'OpenAI API key rejected':r.status===400?'OpenAI model rejected the request':'OpenAI provider error (HTTP '+r.status+')'};
 const raw=await r.text();if(raw.length>12000000)throw Error('OpenAI output exceeds server response limit');
 return JSON.parse(raw);
}
function jpegInfo(b64){
 if(typeof b64!=='string'||b64.length>3600000)throw Error('OpenAI image missing or oversized');
 const b=Buffer.from(b64,'base64');
 if(b.length<5000||b.length>2700000||b[0]!==255||b[1]!==216||b[2]!==255)throw Error('Invalid generated JPEG');
 let pos=2;while(pos+10<b.length){
  if(b[pos]!==255){pos++;continue}
  const marker=b[pos+1];pos+=2;if(marker===0xd9||marker===0xda)break;
  if(marker===0x00||marker===0xff)continue;
  const n=b.readUInt16BE(pos);if(n<2||pos+n>b.length)break;
  if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb].includes(marker)){
   const height=b.readUInt16BE(pos+3),width=b.readUInt16BE(pos+5);
   if(width<900||height<900)throw Error('AI image resolution insufficient');
   return{height,width,bytes:b.length};
  }
  pos+=n;
 }
 throw Error('Could not decode AI image dimensions');
}
module.exports=async(req,res)=>{
 if(!['GET','POST'].includes(req.method))return reject(res,405,'method_not_allowed','Only GET and POST supported');
 const bearer=req.headers?.authorization||'';
 if(!/^Bearer [A-Za-z0-9_.-]{20,8000}$/.test(bearer))return reject(res,401,'unauthorized','Sign in to Matrix 360');
 let body=req.body||{};
 if(typeof body==='string'){try{body=JSON.parse(body)}catch{body={}}}
 if(!body||typeof body!=='object'||Array.isArray(body))body={};
 const input=req.method==='GET'?req.query||{}:body;
 const id=input.workspace_id;
 if(typeof id!=='string'||!WORKSPACE.test(id))return reject(res,400,'invalid_workspace','Choose an authorized business');
 let identity;try{identity=await membership(id,bearer)}catch{return reject(res,503,'crm_unavailable','Could not verify CRM membership')}
 if(identity.code!==200)return reject(res,identity.code,identity.code===403?'forbidden':'auth_error','Business access not authorized');
 const ready=enabled();
 if(req.method==='GET'){
  const diagnostics=input.probe==='yes'?await providerPreflight(id):null;
  return send(res,200,{status:ready?'ready':'provider_unavailable',provider:'OpenAI',ai_image_ready:ready,semantic_planner_ready:ready,
   need_api_key:!(typeof process.env.OPENAI_API_KEY==='string'&&process.env.OPENAI_API_KEY.length>=30),
   need_spend_approval:process.env.M360_OPENAI_SPEND_APPROVED!=='yes',
   need_quota_service:false,quota:'No platform monthly slot cap in Preview; real provider usage is billable',
   text_model:process.env.M360_OPENAI_TEXT_MODEL||'gpt-4.1-mini',
   image_model:process.env.M360_OPENAI_IMAGE_MODEL||'gpt-image-1.5',publishing:false,
   ...(diagnostics?{preflight:diagnostics}:{}),preflight_billed:false});
 }
 if(!ready)return reject(res,503,'provider_unavailable','OpenAI API key and explicit image/text provider spend approval are required. No template substitutes for AI.');
 const channel=input.channel;if(!CHANNELS.has(channel))return reject(res,422,'invalid_channel','Unsupported publication channel');
 try{
  if(input.action==='edit_artwork'){
   const instruction=txt(input.instruction,900);
   if(instruction.length<12||!input.confirm_paid)return reject(res,422,'revision_confirmation_required','Confirm one billable edit and supply a meaningful instruction.');
   const base64=input.image_base64;
   let image;
   if(typeof base64!=='string'||base64.length>3700000)return reject(res,422,'invalid_image','Provide the selected current image JPEG for an actual image edit.');
   try{jpegInfo(base64);image=Buffer.from(base64,'base64')}catch{return reject(res,422,'invalid_image','Current selected image is not a valid JPEG.');}
   // Preview testing: billable provider edit without monthly slot gate.
   const form=new FormData();
   form.append('model',process.env.M360_OPENAI_IMAGE_MODEL||'gpt-image-1.5');
   form.append('image',new Blob([image],{type:'image/jpeg'}),'current-artwork.jpg');
   form.append('prompt','Edit the supplied CURRENT image, not a newly imagined replacement. '+instruction+'. Retain all unaffected objects and overall composition as closely as possible. No rendered logos, words, typography, or watermarks; exact brand overlays are applied separately.');
   form.append('quality','medium');form.append('size','auto');form.append('n','1');form.append('output_format','jpeg');
   const response=await fetch(OPENAI+'/images/edits',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY},body:form,signal:AbortSignal.timeout(110000)});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)return reject(res,response.status===429?429:502,'provider_error',txt(data.error?.message||'OpenAI image edit failed',220));
   const edited=data.data?.[0]?.b64_json;
   const info=jpegInfo(edited);
   return send(res,200,{status:'ai_edit_completed',provider:'OpenAI',model:process.env.M360_OPENAI_IMAGE_MODEL||'gpt-image-1.5',base64:edited,mime:'image/jpeg',width:info.width,height:info.height,review_required:true,usage_reservation_cents:100});
  }
  if(input.action==='plan'){
   const prompt=typeof input.prompt==='string'?input.prompt.trim():'';
   if(prompt.length<20||prompt.length>2300||/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,})/i.test(prompt))
    return reject(res,422,'invalid_brief','Provide a meaningful 20–2300-character non-sensitive brief without URLs/emails');
   // The existing OpenAI image provider, model, trial RPCs and compositor remain unchanged.
   // A bounded variation index requests a genuinely different creative treatment.
   const variant=Number.isInteger(input.variant)&&input.variant>=0&&input.variant<=2?input.variant:0;
   const directions=[
     'Composition direction: visual storytelling with a distinctive environmental establishing view.',
     'Composition direction: intimate subject-specific detail, tactile composition and unusual perspective.',
     'Composition direction: expressive editorial visual metaphor with a distinctive narrative viewpoint.'
   ];
   const instructions='You are an award-winning ad art director and strategist. Interpret the user brief semantically, not by copying raw prompt text. Create polished, distinct professional visual social creative across industries. Return strict JSON schema. If the brief is gibberish or incoherent set meaningful false and fill fields with safe empty strings. Do not invent project amenities, infrastructure completion, claims, approvals, contact details, investment returns, fake logos or facts. Treat facts in user input as UNVERIFIED unless present in CRM approved facts, flag them in review_notes. Website research is unverified planning context, not approved claims. Honor explicitly requested exact headlines. Write a strong hook, short punchy headline (max 9 words), supporting sentence, CTA, compelling native-platform caption and specific relevant hashtags. The visual_prompt must vividly describe a context-appropriate, original full-bleed editorial/photographic visual, not abstract geometric cards, stock placeholders or decorative gradients. NO readable text/letters/logos inside AI image; a downstream adaptive designer sets typography. Every social post should use an immediate relevant hook, value-led text, clear call to action and channel-appropriate composition. For industrial land or property marketing, use a believable environmental aerial or site overview, NOT hands holding renderings, human hands in foreground, multiple limbs or distorted people. Human subjects are forbidden unless explicitly requested, and must be anatomically natural if requested. Leave image text-safe negative space and include location (top,bottom,left). If a property is unbuilt, image must be represented as a conceptual illustration, never existing-site documentary evidence.';
   const access=await checkOpenAIModel(process.env.M360_OPENAI_TEXT_MODEL||'gpt-4.1-mini');
   if(preflightError(res,access))return;
   const trialId=randomUUID(); // Signed workspace/session-scoped creative approval.
   // Use latest explicitly saved brand instructions, if any. The prompt remains primary.
   const savedBrand=await authorizedBrandSnapshot(id);
   const result=await openai('/responses',{model:process.env.M360_OPENAI_TEXT_MODEL||'gpt-4.1-mini',store:false,max_output_tokens:1800,
    input:[{role:'system',content:[{type:'input_text',text:instructions+' '+directions[variant]+' Vary cinematography, visual angle, and storytelling without adding unverified client claims or violating any negative constraints in the user brief.'}]},{role:'user',content:[{type:'input_text',text:JSON.stringify({business:savedBrand?.business_name||identity.name,channel,prompt,crm_approved_facts:identity.facts,approved_saved_brand:savedBrand})}]}],
    text:{format:{type:'json_schema',name:'m360_post_brief',strict:true,schema:SCHEMA}}},45000);
   if(result.failed)return reject(res,result.code,'provider_error',result.message);
   const raw=result.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text;
   if(!raw)throw Error('OpenAI did not return a structured creative brief');
   const plan=sanitize(JSON.parse(raw));
   return send(res,200,{status:'ai_plan_completed',provider:'OpenAI',model:result.model||'gpt-4.1-mini',
    business:identity.name,channel,plan,proof:seal(plan,id,channel,bearer,trialId),review_required:true});
  }
  if(input.action==='image'){
   let authorized;try{authorized=unseal(input.proof,id,channel,bearer)}catch(e){return reject(res,422,'invalid_plan',e.message)}
   const access=await checkOpenAIModel(process.env.M360_OPENAI_IMAGE_MODEL||'gpt-image-1.5');
   if(preflightError(res,access))return;
   // Preview: generation credit slots are unrestricted; provider charges apply.
   const plan=authorized.plan;
   const size=['Instagram','WhatsApp'].includes(channel)?'1024x1536':['LinkedIn','YouTube','Website','Email'].includes(channel)?'1536x1024':'1024x1024';
   const visual='Create an original, premium, industry-relevant advertising VISUAL WITHOUT TYPOGRAPHY. '+plan.visual_prompt+
    ' Sector and brand context: '+identity.name+'; destination channel: '+channel+
    '. The composition must have natural negative space in the '+plan.layout+
    ' portion for separately typeset precise headline/CTA. Photographic or premium editorial treatment with a clean, credible industrial or business scene. No foreground hands, people holding site plans, anatomy distortions, malformed hands, duplicate limbs, fabricated site documentation, templates, circles, generic gradients or fake corporate logos. NO text, letters, invented certifications, watermark or fake completed-building documentary claims. Favor clear subject hierarchy, clean negative space and compelling honest visual storytelling.';
   const result=await openai('/images/generations',{model:process.env.M360_OPENAI_IMAGE_MODEL||'gpt-image-1.5',
    prompt:visual,size,quality:'medium',n:1,output_format:'jpeg',output_compression:76},95000);
   if(result.failed)return reject(res,result.code,'provider_error',result.message);
   const image=result.data?.[0]?.b64_json;const proof=jpegInfo(image);
   return send(res,200,{status:'ai_image_completed',provider:'OpenAI',model:process.env.M360_OPENAI_IMAGE_MODEL||'gpt-image-1.5',
    base64:image,mime:'image/jpeg',width:proof.width,height:proof.height,bytes:proof.bytes,layout:plan.layout,review_required:true});
  }
  return reject(res,422,'invalid_action','Choose plan or image');
 }catch(e){return reject(res,502,'generation_failed',(e?.name==='TimeoutError'?'Provider call timed out':e?.message||'Generation failed').slice(0,300))}
};
module.exports._test={sanitize,jpegInfo,seal,unseal};
