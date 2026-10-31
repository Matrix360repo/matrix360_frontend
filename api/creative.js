'use strict';
/* Matrix360 tenant-scoped Creative Studio gateway.
 * CRM membership is authoritative. Tenant identity is deterministic; no
 * manually maintained client-ID map is required for NEW workspaces.
 * Only this server-side gateway holds Tanmayi service keys.
 * Auto-provisioning uses a distinct Director credential, never the operator key.
 * Still REVIEW-ONLY: no images, video, posting, dispatch, or lead writes.
 */
const {createHash} = require('node:crypto');
const {workspaceContext}=require('../lib/m360-workspace-context');
const {CHANNELS,SOCIAL_MAPPING,createDraft}=require('../lib/channel-copy.js');
const CRM = 'https://matrix360-crm-backend-p9os.onrender.com';
const SOCIAL = 'https://matrix360-socialmanager-recovery-staging.onrender.com';
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SOCIAL_ID = /^[a-z0-9][a-z0-9-]{2,59}$/;
const PLATFORMS = new Set(CHANNELS);
const DISALLOWED = /(?:https?:\/\/|www\.|\b[\w.+-]+@[\w.-]+\.[a-z]{2,})|(?:\+?\d[\d\s().-]{7,}\d)/i;
function autoClientId(workspace) {
  return 'm360-' + createHash('sha256').update('matrix360-crm-tenant-v1:' + workspace,'utf8').digest('hex').slice(0,28);
}
function legacyMap() {
  let value;try{value=JSON.parse(process.env.M360_SOCIAL_WORKSPACE_MAP||'{}');}catch{return {};}
  return value && typeof value==='object' && !Array.isArray(value) ? value : {};
}
function clientId(workspace) {
  // Optional migration override protects earlier published creative histories;
  // no mapping is required for any newly enrolled business.
  const m=legacyMap();
  const candidate=Object.prototype.hasOwnProperty.call(m,workspace)?m[workspace]:null;
  if(candidate!==null) {
    if(typeof candidate!=='string'||!SOCIAL_ID.test(candidate)||candidate==='matrix360-demo')return null;
    return candidate;
  }
  return autoClientId(workspace);
}
const fail=(res,status,message,state='blocked')=>{
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','private, no-store');
  res.end(JSON.stringify({status:state,message}));
};
async function jsonFetch(url,options={}) {
  const response=await fetch(url,{
    ...options,redirect:'error',signal:AbortSignal.timeout(18000),
    headers:{Accept:'application/json',...(options.headers||{})},cache:'no-store'
  });
  if(!(response.headers.get('content-type')||'').toLowerCase().includes('application/json'))
    throw Error('Upstream response was not JSON');
  const raw=await response.text();
  if(raw.length>80000)throw Error('Oversized upstream response');
  let data;try{data=JSON.parse(raw)}catch{throw Error('Invalid JSON')}
  return {status:response.status,data};
}
function readBody(req) {
  const input=req.body;
  if(input&&typeof input==='object'&&!Array.isArray(input))return input;
  if(typeof input==='string'&&input.length<2500){try{return JSON.parse(input)}catch{return {}}}
  return {};
}
function safeBusinessName(value) {
  if(typeof value!=='string')return 'Matrix 360 Business';
  const name=value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,72);
  return name.length>=3?name:'Matrix 360 Business';
}
function present(list,destination){
  return Array.isArray(list)&&list.some(c=>c&&c.id===destination);
}
function canProvision(){
  return process.env.M360_SOCIAL_AUTO_PROVISION==='yes' &&
    typeof process.env.M360_SOCIAL_DIRECTOR_KEY==='string' &&
    process.env.M360_SOCIAL_DIRECTOR_KEY.length>=16 &&
    process.env.M360_SOCIAL_DIRECTOR_KEY!==process.env.M360_SOCIAL_OPERATOR_KEY;
}
async function listClients(operator){
  return jsonFetch(SOCIAL+'/api/v2/clients',{headers:{'X-Matrix360-Key':operator}});
}
async function ensureClient(destination,name,operator){
  const listing=await listClients(operator);
  if(listing.status!==200||!Array.isArray(listing.data))return 'unavailable';
  if(present(listing.data,destination))return 'existing';
  if(!canProvision())return 'not_configured';

  // This is an explicit user-initiated POST, after fresh CRM membership validation.
  // New clients receive NO inferred brand claims, logos, contact data or permissions.
  const provision=await jsonFetch(SOCIAL+'/api/v2/clients',{
    method:'POST',
    headers:{'X-Matrix360-Key':process.env.M360_SOCIAL_DIRECTOR_KEY,
      'Content-Type':'application/json'},
    body:JSON.stringify({id:destination,name,approved_facts:[],cta:'Learn more',approved_logo_path:''})
  });
  if(provision.status!==201&&provision.status!==409)return 'unavailable';
  // 409 can occur if a parallel request already provisioned the same tenant.
  // Re-read instead of claiming success from a conflict response.
  const verified=await listClients(operator);
  if(verified.status!==200||!present(verified.data,destination))return 'unavailable';
  return provision.status===201?'created':'existing';
}
module.exports=async function creativeBridge(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','POST'].includes(req.method))return fail(res,405,'Method not allowed');
  const bearer=req.headers.authorization||'';
  if(!/^Bearer [A-Za-z0-9_.-]{20,8000}$/.test(bearer))return fail(res,401,'Sign in to your Matrix 360 workspace.');
  const body=req.method==='POST'?readBody(req):{};
  const source=req.method==='POST'?body:req.query||{};
  const workspace=source.workspace_id;
  if(typeof workspace!=='string'||!ID.test(workspace))
    return fail(res,400,'Select an authorized CRM business workspace.');

  let own;
  try{
    const auth=await jsonFetch(CRM+'/me/workspaces',{headers:{Authorization:bearer}});
    if(auth.status===401)return fail(res,401,'Your CRM session has expired.');
    if(auth.status!==200||!Array.isArray(auth.data))
      return fail(res,503,'CRM workspace authorization unavailable.');
    own=auth.data.find(m=>m&&String(m.id)===workspace);
  }catch{return fail(res,503,'CRM workspace authorization could not be verified.');}
  if(!own)return fail(res,403,'Business workspace access denied.');

  const operator=process.env.M360_SOCIAL_OPERATOR_KEY||'';
  const destination=clientId(workspace);
  if(!destination)return fail(res,503,'Legacy creative client mapping is invalid.','not_configured');
  if(operator.length<16)return fail(res,503,'Social Manager staging operator access is not configured.','not_configured');
  const planningApproved=process.env.M360_SOCIAL_PLAN_APPROVED==='yes';
  const headers={'X-Matrix360-Key':operator};
  try{
    // Capability reads have zero effects, including zero provisioning writes.
    if(req.method==='GET'){
      const clients=await listClients(operator);
      if(clients.status!==200||!Array.isArray(clients.data))
        return fail(res,503,'Social Manager staging access is unavailable.');
      const registered=present(clients.data,destination);
      const automatic=canProvision();
      const capability=await jsonFetch(SOCIAL+'/api/capabilities',{headers});
      if(capability.status!==200)
        return fail(res,503,'Social Manager capability verification is unavailable.');
      if(!registered&&!automatic)
        return fail(res,503,'Automatic creative client enrollment is not configured.','not_configured');
      // Report actual provider readiness, not an invented "connected" state.
      let imageReady=false;
      if(process.env.M360_SOCIAL_IMAGE_APPROVED==='yes' && planningApproved) {
        try{
          const provider=await jsonFetch(SOCIAL+'/api/v2/images/readiness',{headers});
          imageReady=provider.status===200 && provider.data?.ready_to_request===true;
        }catch{imageReady=false;}
      }
      // Only enable finished reels on actual backend/provider readiness.
      let reelReady=false,reelBlockers=[];
      try{
        const live=await jsonFetch(SOCIAL+'/health/media');
        if(live.status===200 && live.data && typeof live.data==='object'){
          const q=live.data;
          if(!q.semantic_planner_ready)reelBlockers.push('Semantic storyboard AI is not authorized');
          if(!q.natural_voice_ready)reelBlockers.push('Natural neural voice provider is not enabled/approved');
          if(!q.licensed_music_catalog)reelBlockers.push('Licensed music catalog unavailable');
          if(!q.private_staging_storage_ready)reelBlockers.push('Durable private media storage is not ready');
          reelReady=Boolean(q.professional_reel_prerequisites && !reelBlockers.length);
        }else reelBlockers.push('Reel engine live health could not be verified');
      }catch{reelBlockers.push('Reel engine health endpoint is unavailable');}
      res.statusCode=200;res.setHeader('Content-Type','application/json; charset=utf-8');
      return res.end(JSON.stringify({
        status:'connected_review_only',workspace_id:workspace,
        mode:'staging',preview_only:true,client_provisioned:registered,
        automatic_provisioning_available:automatic,
        creative_planning:planningApproved&&(registered||automatic),
        channel_drafts_available:planningApproved&&(registered||automatic),
        supported_channels:CHANNELS,
        motion_reel_available:planningApproved&&(registered||automatic)&&reelReady,
        reel_prerequisites_missing:reelBlockers,
        image_generation_available:imageReady&&(registered||automatic),
        media_generation:planningApproved&&(registered||automatic),publishing:false,
        provider:capability.data?.status||'unverified',
        note:reelReady?'Verified reel prerequisites are available for generation; each actual video still requires successful rendering and review.':'Finished narrated reels are blocked until provider requirements are verified. Existing copy and OpenAI post workflows remain available.'
      }));
    }

    // No tenant writes, providers, or planning unless explicitly permitted.
    if(!planningApproved)
      return fail(res,503,'Creative planning awaits Director authorization for any provider costs.','approval_required');
    const prompt=body.prompt,platform=body.platform;
    if(typeof prompt!=='string'||prompt.trim().length<12||prompt.length>900||
       DISALLOWED.test(prompt)||!PLATFORMS.has(platform))
      return fail(res,422,'Enter a 12–900-character non-sensitive brief and a supported platform.');
    const provisioned=await ensureClient(destination,safeBusinessName(own.name),operator);
    if(provisioned==='not_configured')
      return fail(res,503,'Authorized automatic client enrollment is not configured.','not_configured');
    if(provisioned==='unavailable')
      return fail(res,503,'Social Manager client could not be verified or provisioned.','provisioning_failed');
    const context=await workspaceContext(workspace,own);
    const contextBrief=context.profile?'\nSaved company context (research is unverified; only approved_claims are approved): '+JSON.stringify(context.profile):'';
    const reply=await jsonFetch(SOCIAL+'/api/v2/creative-plan',{
      method:'POST',headers:{...headers,'Content-Type':'application/json'},
      body:JSON.stringify({client_id:destination,prompt:(prompt.trim()+contextBrief).slice(0,900),platform:SOCIAL_MAPPING[platform],
        duration_seconds:15,mode:'motion_graphics',allow_limited_fallback:true})
    });
    if(reply.status===404)return fail(res,503,'Studio client is not available.','not_provisioned');
    if(reply.status===422)return fail(res,422,'Creative request needs revision.');
    if(reply.status!==200||!reply.data||typeof reply.data!=='object')
      return fail(res,503,'Creative planner did not return a reviewable plan.');
    const p=reply.data,txt=(v,max)=>typeof v==='string'?v.slice(0,max):'';
    const channelDraft=createDraft({channel:platform,plan:p,business:safeBusinessName(own.name)});
    const headlines=Array.isArray(p.headlines)?p.headlines.slice(0,3).map(x=>txt(x,120)):[];
    const scenes=Array.isArray(p.scenes)?p.scenes.slice(0,3).map((s,i)=>({
      step:i+1,headline:txt(s?.headline,120),visual:txt(s?.visual_subject,180)})):[];
    res.statusCode=200;res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.end(JSON.stringify({
      status:'review_only',workspace_id:workspace,
      origin:'Tanmayi Social Manager recovery staging',subject:txt(p.subject,180),
      caption:txt(p.caption,350),cta:txt(p.cta,80),headlines,scenes,
      channel_draft:channelDraft,
      generation:p.provider==='CONFIGURED_SEMANTIC_MODEL'?'configured_model':'limited_prompt_derived',
      semantic_ai_verified:p.semantic_ai_verified===true,
      note:'Draft copy and creative direction for human review. No email, WhatsApp message or social post has been sent or published.'
    }));
  }catch{return fail(res,503,'Creative Studio staging is unavailable. No action was submitted.');}
};
