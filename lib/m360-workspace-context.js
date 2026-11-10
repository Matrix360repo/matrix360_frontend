'use strict';
const {createHash}=require('node:crypto');
const DB='https://pmlacujsnnvbrimxbhpu.supabase.co';
const text=(value,max=500)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
const list=(value,max=260)=>Array.isArray(value)?value.filter(x=>typeof x==='string').slice(0,30).map(x=>text(x,max)):[];
function profileSnapshot(profile,version=0){
 if(!profile||typeof profile!=='object'||Array.isArray(profile))return null;
 return {investment_budget:text(profile.investment_budget,120),unit_sale_value:text(profile.unit_sale_value,120),unit_delivery_cost:text(profile.unit_delivery_cost,120),expected_conversion_rate:text(profile.expected_conversion_rate,120),planning_currency:text(profile.planning_currency,12),expansion_objective:text(profile.expansion_objective,1500),research_constraints:text(profile.research_constraints,1500),version:Number.isInteger(version)?version:0,business_name:text(profile.business_name,120),website:text(profile.website,240),industry:text(profile.industry,240),description:text(profile.description,2500),location:text(profile.location||profile.address,480),products_services:list(profile.products_services),approved_claims:list(profile.approved_claims),approved_offers:list(profile.approved_offers),target_audience:list(profile.target_audience),service_areas:list(profile.service_areas),campaign_objectives:list(profile.campaign_objectives),preferred_channels:list(profile.preferred_channels),campaign_budget:text(profile.campaign_budget,120),campaign_duration:text(profile.campaign_duration,160),colors:list(profile.colors,7),typography:text(profile.typography,500),style_preferences:text(profile.style_preferences,2500),brand_guidelines:text(profile.brand_guidelines,2500),website_research:text(profile.website_research,5000)};
}
async function readWorkspaceProfile(workspace,fetchImpl=fetch,{required=false}={}){
 if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(String(workspace)))return null;
 const key=process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY||'';if(key.length<30){if(required)throw Error('Profile storage unavailable');return null;}
 const tenant='m360-'+createHash('sha256').update('matrix360-crm-tenant-v1:'+workspace).digest('hex').slice(0,28);
 try{
  const response=await fetchImpl(DB+'/rest/v1/m360_brand_profiles?workspace_id=eq.'+tenant+'&select=version,profile',{headers:{apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key}),Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok){if(required)throw Error('Profile storage unavailable');return null;}const rows=await response.json();return profileSnapshot(rows?.[0]?.profile,rows?.[0]?.version);
 }catch(error){if(required)throw error;return null;}
}
// Call only after the caller has verified CRM membership for this workspace.
async function workspaceContext(workspace,membership,fetchImpl=fetch){
 const profile=await readWorkspaceProfile(workspace,fetchImpl);
 return {workspace_id:String(workspace),business_name:profile?.business_name||text(membership?.name,120),profile_version:profile?.version||0,profile_status:profile?'saved':'unavailable',profile,provenance:'CRM membership and saved workspace profile',research_is_unverified:true};
}
function leadSearchContext(message){
 const clean=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
 const raw=String(message||'').slice(0,2500),first=raw.split('\n')[0];
 const industry=raw.match(/(?:Business industry or sector|Type of prospects or industry focus|Target industry|Industry to focus on)\s*:\s*(.*?)(?=\n|Target location for prospect search:|$)/i)?.[1];
 const geography=raw.match(/(?:Target location for prospect search|Target area|Target geography|Search area|Location to focus on)\s*:\s*([^\n]+)/i)?.[1];
 const natural=first.match(/\b(?:find|search(?: for)?|get|generate)\s+(?:(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+)?(?:verified\s+)?(.+?)\s+in\s+(.+?)[.!?]?$/i)||first.match(/^(.+?)\s+in\s+(.+?)[.!?]?$/i);
 let query=clean(industry||natural?.[1],160);
 if(/^(?:leads?|prospects?|customers?|businesses?)$/i.test(query))query='';
 if(!query){const candidate=first.replace(/^.*?\b(?:find|get|generate|search(?: for)?)\s+/i,'').replace(/^(?:\d+|ten|three)\s+/i,'').replace(/[.!?]+$/,'');if(!/\b(my business|my company|prospects?|leads?|customers?)\b/i.test(candidate))query=clean(candidate,160);}
 if(/^(?:verified\s+)?(?:prospects?|leads?|customers?)(?:\s+for\s+(?:my|the|our)\s+(?:business|company))?$/i.test(query))query='';
 const location=clean(geography||natural?.[2],120);
 return {query,location,missing:!query?'Type of prospects or industry focus':!location?'Target location for prospect search':null};
}
module.exports={profileSnapshot,readWorkspaceProfile,workspaceContext,leadSearchContext};
