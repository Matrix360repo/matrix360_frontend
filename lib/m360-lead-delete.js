'use strict';
// Client & Workspace CRM lead deletion. Uses the user JWT, a publishable key and Supabase RLS.
// Enables isolated client lead removal without admin-only restriction.
const BASE='https://unabhltnmqoqysrrdbcp.supabase.co';
const CRM_BASE='https://matrix360-crm-backend-p9os.onrender.com';
const WR=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
function reply(res,code,data){res.statusCode=code;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private,no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(data))}
async function get(url,headers){const r=await fetch(url,{method:'GET',headers,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Object.assign(new Error('Access verification failed'),{status:r.status});return r.json()}
module.exports=async(req,res)=>{
 if(req.method!=='POST' && req.method!=='DELETE')return reply(res,405,{message:'POST or DELETE only'});
 const data=typeof req.body==='string'?(()=>{try{return JSON.parse(req.body)}catch{return {}}})():req.body||{};
 const ws=data.workspace_id||req.query?.workspace_id||'default';
 let ids=data.ids;
 if(!ids && (data.id||req.query?.lead_id||req.query?.id)){
   const single=Number(data.id||req.query?.lead_id||req.query?.id);
   if(Number.isSafeInteger(single)) ids=[single];
 }
 if(!Array.isArray(ids)||ids.length<1){
   return reply(res,400,{message:'Choose at least one lead to delete'});
 }
 ids=[...new Set(ids.map(Number).filter(Number.isSafeInteger))];
 if(!ids.length||ids.length>100)return reply(res,400,{message:'Lead IDs must contain between 1 and 100 integers'});
 const auth=req.headers?.authorization||'';
 if(!/^Bearer [A-Za-z0-9._-]{20,8192}$/.test(auth))return reply(res,401,{message:'A valid client session is required'});

 // Use the same authenticated CRM service that owns the visible pipeline.
 let upstreamDeleted=[];
 let upstreamUnavailable=false;
 for(const id of ids){
   try{
     const response=await fetch(CRM_BASE+'/workspaces/'+encodeURIComponent(ws)+'/leads/'+encodeURIComponent(id),{
       method:'DELETE',headers:{Authorization:auth,Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(18000)
     });
     if(response.ok){upstreamDeleted.push(id);continue}
     if(response.status===401||response.status===403)return reply(res,response.status,{message:'You are not allowed to delete leads from this workspace'});
     if(response.status!==404&&response.status!==405)upstreamUnavailable=true;
   }catch{upstreamUnavailable=true}
 }
 if(upstreamDeleted.length===ids.length)return reply(res,200,{status:'ok',deleted:true,deleted_count:upstreamDeleted.length,deleted_ids:upstreamDeleted});
 if(upstreamDeleted.length)return reply(res,200,{status:'partial',deleted:true,deleted_count:upstreamDeleted.length,deleted_ids:upstreamDeleted,message:'Some selected leads could not be deleted'});

 const key=process.env.M360_CRM_DEV_PUBLISHABLE_KEY||'';
 if(!key||key.length<24){
   return reply(res,upstreamUnavailable?503:501,{message:'Persistent lead deletion is not available from the configured CRM service'});
 }
 const headers={apikey:key,Authorization:auth,Accept:'application/json'};
 try{
  const who=await get(BASE+'/auth/v1/user',headers);if(!who?.id)return reply(res,401,{message:'Session expired'});
  const membership=await get(BASE+'/rest/v1/m360_memberships?select=role&user_id=eq.'+encodeURIComponent(who.id)+'&workspace_id=eq.'+encodeURIComponent(ws),headers);
  // Allow all active workspace members (clients, admins, operators)
  if(!Array.isArray(membership)||membership.length===0){
    return reply(res,403,{message:'Active workspace membership required'});
  }
  const q='?workspace_id=eq.'+encodeURIComponent(ws)+'&id=in.('+ids.join(',')+')&select=id,workspace_id';
  const result=await fetch(BASE+'/rest/v1/m360_leads'+q,{method:'DELETE',headers:{...headers,Prefer:'return=representation'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(18000)});
  const body=await result.json().catch(()=>null);
  if(!result.ok)return reply(res,result.status,{message:'CRM rejected the lead deletion request'});
  return reply(res,200,{status:'ok',deleted:true,deleted_count:Array.isArray(body)?body.length:ids.length,deleted_ids:Array.isArray(body)?body.map(x=>x.id):ids,requested_count:ids.length});
 }catch(e){
  return reply(res,e.status&&e.status>=400?e.status:503,{message:'Lead deletion could not be completed'});
 }
};
