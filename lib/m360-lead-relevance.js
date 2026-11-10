'use strict';
const {download,publicURL}=require('./m360-website-assets');
const {createHash}=require('node:crypto');
const regions={
 'west bengal':['kolkata','howrah','hooghly','durgapur','asansol','haldia','kharagpur','siliguri','dankuni','uluberia'],
 odisha:['orissa','bhubaneswar','cuttack','rourkela','paradip','jharsuguda','balasore','angul']
};
const words=text=>String(text||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(Boolean);
function terms(query){return words(query).filter(w=>w.length>3&&!['business','businesses','company','companies','industry','industries','sector','services','targets','buyers','prospects'].includes(w)).map(w=>w.replace(/(?:ing|ers|er|ies|s)$/,''));}
function evidence(html,query,location){
 const text=html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&[a-z#0-9]+;/gi,' ').replace(/\s+/g,' ').toLowerCase();
 const industry=terms(query).find(term=>words(text).some(w=>w.startsWith(term)));
 const places=String(location).toLowerCase().split(/[,;&]|\band\b/).map(s=>s.trim()).filter(Boolean);
 const geography=places.flatMap(place=>[place,...(regions[place]||[])]).find(place=>new RegExp('\\b'+place.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(text));
 return {matched:!!industry&&!!geography,industry_evidence:industry||null,location_evidence:geography||null};
}
async function qualifyCandidates(leads,record,load=download){
 record.relevance_cache||={};const accepted=[];
 const identity=lead=>createHash('sha256').update(JSON.stringify([lead.company_name,lead.website,record.query,record.location])).digest('hex');
 const unchecked=leads.filter(lead=>!record.relevance_cache[identity(lead)]);
 const selected=[...leads.filter(lead=>record.relevance_cache[identity(lead)]),...unchecked.slice(0,12)];
 // Bound each poll's network work and retain decisions in tenant-encrypted checkpoints.
 await Promise.all(selected.map(async lead=>{
  const key=identity(lead);
  let result=record.relevance_cache[key];
  if(!result){
   try{
    const url=publicURL(/^https?:\/\//i.test(lead.website)?lead.website.replace(/^http:/i,'https:'):'https://'+lead.website);
    const page=await load(url.href,500000);if(page.mime!=='text/html')throw Error('No business page');
    const proof=evidence(page.bytes.toString('utf8'),record.query,record.location);
    result={...proof,source_url:page.url,checked_at:new Date().toISOString()};
   }catch{result={matched:false,reason:'Industry and location could not be independently established.'};}
   record.relevance_cache[key]=result;
  }
  if(result.matched)accepted.push({...lead,relevance:result,location:result.location_evidence,fit_reasoning:'Industry and location supported by '+result.source_url});
 }));
 Object.defineProperty(accepted,'pending',{value:unchecked.length>12});
 return accepted;
}
module.exports={qualifyCandidates,evidence};
