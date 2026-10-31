/* Friday recovery-only UI. No API requests, persistence, telemetry or dispatch. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const cards=$('plan-steps');if(!cards)return;
 const el=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node;};
 const plan={
  enquiries:{title:'Capture and qualify every enquiry',steps:[
   ['Use your current pipeline','Review {leadCountText} to identify the source and current stage of each enquiry.'],
   ['Document the ideal customer','Define the location, industry and buyer profile with your team before commissioning audience research.'],
   ['Prepare an approval brief','Audience discovery and outbound campaigns require separately reviewed engine connections and explicit approval.']],action:'Review enquiries →',href:'#leads'},
  conversion:{title:'Prioritize next-step follow-up',steps:[
   ['Review the verified pipeline','Current CRM: {leadCountText}, including {enquiryCountText} in the enquiry stage.'],
   ['Agree on a next action','Assign a human owner and follow-up timing for qualified and unanswered enquiries. No automated messages are triggered.'],
   ['Measure outcomes after verification','Stage progress can be reviewed in CRM. Conversion rates and predictions require additional verified data.']],action:'View my pipeline →',href:'#leads'},
  campaign:{title:'Prepare an approval-ready campaign brief',steps:[
   ['Set the audience and offer','Document location, target industry, commercial proposition and proposed channels before selecting a provider.'],
   ['Request verified assets','Mayur’s audience output, Tanmayi’s creative content and Pratha’s campaign console are not connected in this recovered frontend.'],
   ['Obtain explicit approval','Do not dispatch emails or WhatsApp messages or present campaign analytics until integrations and permissions are verified.']],action:'View module status →',href:'#services'}
 };
 let selected='enquiries',latest=null;
 function render(){
  const p=plan[selected];if(!p)return;
  const count=latest?latest.total:null;
  const enquiries=latest?latest.stageCounts.enquiry||0:null;
  $('plan-heading').textContent=p.title;
  $('plan-live-count').textContent=latest?`${count} authorized CRM lead${count===1?'':'s'} · ${(enquiries??0)} in enquiry stage`:'Waiting for authorized workspace records';
  $('plan-source').textContent=latest?'Authorized CRM record counts':'CRM evidence pending';
  $('plan-source').className='tag '+(latest?'tag-live':'tag-pending');
  cards.replaceChildren();
  p.steps.forEach(([title,copy],idx)=>{
   const article=el('article');article.className='plan-step';
   const number=el('span',String(idx+1).padStart(2,'0'));number.className='step-number';
   const heading=el('h3',title);
   const description=el('p',copy.replaceAll('{leadCountText}',count===null?'an unverified number of CRM leads':`${count} authorized CRM ${count===1?'lead':'leads'}`).replaceAll('{enquiryCountText}',enquiries===null?'an unverified number of leads':`${enquiries} ${enquiries===1?'lead':'leads'}`));
   article.append(number,heading,description);cards.append(article);
  });
  $('plan-boundary').textContent='Source: '+(latest?'CRM lead counts and stages for the currently authorized business':'No CRM source loaded')+'. This is a rule-based illustrative brief, not an AI-generated strategy, forecast or live campaign recommendation. No external marketing metrics are inferred.';
  const action=$('plan-next-action');action.textContent=p.action;action.href=p.href;
  $('plan-review-status').textContent='Human review required · nothing saved or sent';
 }
 document.querySelectorAll('[data-goal]').forEach(button=>button.addEventListener('click',()=>{if(plan[button.dataset.goal]){selected=button.dataset.goal;render();}}));
 document.addEventListener('m360:workspace-changing',()=>{latest=null;render();});
 document.addEventListener('m360:crm-evidence-invalidated',()=>{latest=null;render();});
 // Session end must purge derived CRM metrics, not just the lead table and AI draft.
 document.addEventListener('m360:session-ended',()=>{latest=null;render();});
 document.addEventListener('m360:crm-loaded',event=>{
   const data=event.detail||{};
   if(!Number.isSafeInteger(data.total)||data.total<0||!data.stageCounts||typeof data.stageCounts!=='object')return;
   latest={total:data.total,stageCounts:data.stageCounts};render();
 });
 render();
})();
