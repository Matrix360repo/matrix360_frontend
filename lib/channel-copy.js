'use strict';
/* Platform-specific, factual-boundary-safe copy assembled from Tanmayi's
 * tenant-scoped creative-plan response. Not a sending or publishing engine.
 * No external model calls occur here; provider provenance comes from the plan. */
const CHANNELS=Object.freeze(['Instagram','Facebook','LinkedIn','X','YouTube','Email','WhatsApp','Google Business Profile','SMS','Website']);
const SOCIAL_MAPPING=Object.freeze({
 Instagram:'Instagram',Facebook:'Facebook',LinkedIn:'LinkedIn',X:'X',YouTube:'YouTube',
 Email:'LinkedIn',WhatsApp:'Facebook','Google Business Profile':'Facebook',SMS:'Facebook',Website:'LinkedIn'
});
const clean=(v,max=250)=>String(typeof v==='string'?v:'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
function trimWords(value,limit){
 const text=clean(value,5000);if([...text].length<=limit)return text;
 const clipped=[...text].slice(0,limit-1).join('');
 return (clipped.lastIndexOf(' ')>limit*.55?clipped.slice(0,clipped.lastIndexOf(' ')):clipped).trimEnd()+'…';
}
function tags(subject,business,max=5){
 const words=(subject+' '+business).normalize('NFKC').match(/[\p{L}\p{N}]+/gu)||[];
 const common=new Set(['the','and','for','with','from','this','that','your','our','new','create','promote','business','social','content','more','learn','about','into','through','you','how','are','why','what','can']);
 const arr=[];
 for(const word of words){
  const normalized=word.toLowerCase();if(word.length<4||common.has(normalized))continue;
  const token='#'+word.replace(/[^\p{L}\p{N}]/gu,'');
  if(!arr.some(x=>x.toLowerCase()===token.toLowerCase()))arr.push(token);
  if(arr.length===max)break;
 }
 return arr.join(' ');
}
function createDraft({channel,plan,business}){
 if(!CHANNELS.includes(channel))throw Error('Unsupported publication channel');
 if(!plan||typeof plan!=='object')throw Error('A verified creative plan is required');
 const brand=clean(business,72);if(brand.length<3)throw Error('An authorized business name is required');
 const subject=clean(plan.subject,110);
 if(subject.length<4)throw Error('Tanmayi planner did not identify a suitable subject');
 const caption=clean(plan.caption,320);
 const lead=clean(Array.isArray(plan.headlines)?plan.headlines[0]:'',130)||subject;
 const cta=clean(plan.cta,65)||'Learn more';
 const context=caption&&caption.toLowerCase()!==subject.toLowerCase()&&caption.toLowerCase()!==lead.toLowerCase()?caption:subject;
 const hashtag=tags(subject,brand);
 let subjectLine='',text='',limit=2000,format='social_caption';
 switch(channel){
  case 'Instagram':
   limit=2200;text=[lead,context,'',cta,hashtag].filter(Boolean).join('\n');break;
  case 'Facebook':
   text=[lead,'',context+'.','',cta,hashtag].filter(Boolean).join('\n');break;
  case 'LinkedIn':
   text=[lead,'',context+'.','', 'Explore how this subject connects with your plans and priorities.',cta,hashtag].filter(Boolean).join('\n');break;
  case 'X':
   limit=280;text=[lead,context.toLowerCase()===lead.toLowerCase()?'':context,cta,hashtag].filter(Boolean).join(' · ');break;
  case 'YouTube':
   limit=5000;subjectLine=trimWords(lead+' | '+brand,90);
   text=[context+'.','',cta,hashtag].filter(Boolean).join('\n');format='video_description';break;
  case 'Email':
   limit=4000;format='email';subjectLine=trimWords(lead+' | '+brand,90);
   text=['Hello,','',context+'.','','We wanted to share this topic with you and understand whether it is relevant to your plans.','',
      'If you would like to explore this further, please reply to this message.','','Regards,',brand].join('\n');break;
  case 'WhatsApp':
   limit=1024;format='whatsapp';
   text=[brand,lead,context.toLowerCase()===lead.toLowerCase()?'':context,cta,
      'Reply if you would like to know more.'].filter(Boolean).join('\n\n');break;
  case 'Google Business Profile':
   limit=1500;format='local_update';text=[lead,context+'.',cta].join('\n\n');break;
  case 'SMS':
   limit=160;format='sms';text=[brand+':',subject+'.',cta].join(' ');break;
  case 'Website':
   limit=4000;format='landing_page_draft';subjectLine=lead;
   text=[lead,'',context+'.','','What this could mean for you','',
     'Discuss your requirements with '+brand+'.','','Suggested next step: '+cta].join('\n');break;
 }
 text=trimWords(text,limit);
 if(channel==='X' && [...text].length>280)throw Error('X draft length exceeded limit');
 if(!text)throw Error('Planner did not supply enough content to create a draft');
 return {channel,format,subject:subjectLine,body:text,characters:[...text].length,limit,
  status:'draft_for_review',send_enabled:false,publish_enabled:false,
  source:'Tanmayi creative-plan + channel formatter',
  disclosure:plan.semantic_ai_verified===true?
  'Configured semantic planner used; human approval required before any use.':
  'Limited prompt-derived composition, not verified generative AI. Human editing and approval required.'};
}
module.exports={CHANNELS,SOCIAL_MAPPING,createDraft,trimWords};
