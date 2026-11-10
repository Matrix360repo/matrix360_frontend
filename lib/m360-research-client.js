(() => {
 'use strict';
 const $=id=>document.getElementById(id),workspace=()=>$('workspace')?.value||'';
 const token=()=>Number(sessionStorage.getItem('matrix360_pilot_expires_at'))>Date.now()?sessionStorage.getItem('matrix360_pilot_token'):null;
 let report=null,running=false,generation=0,cancelPromptReview=null,researchSummary=null,reportLoading=false;
 const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);return e;};
 async function api(url,body,signal){const response=await fetch(url,{method:body?'POST':'GET',cache:'no-store',signal,headers:{Authorization:'Bearer '+token(),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw Object.assign(Error(data.message||data.error||'Campaign operation failed.'),{needsCompany:data.needs_company_details});return data;}
 function strategyVisuals(container,research,sources=[],fallback=null,search=null){
  const clean=text=>String(text||'').replace(/\*\*/g,'');
  const data=research.presentation||{};
  const earlier=research.competitor_findings.length===0&&fallback?.research?.competitor_findings?.length?fallback:null;
  const comparison=earlier?.research||research,comparisonData=comparison.presentation||{};
  const safeUrl=value=>{try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)return '';for(const key of [...u.searchParams.keys()])if(/^utm_/i.test(key))u.searchParams.delete(key);u.hash='';return u.href;}catch{return '';}};
  const comparisonSources=new Set((earlier?.sources||sources).map(safeUrl).filter(Boolean));
  const allowed=new Set([...sources.map(safeUrl).filter(Boolean),...comparisonSources]);
  const link=(parent,url,label='Source')=>{const href=safeUrl(url);if(!href||!allowed.has(href))return;const a=node('a',label);a.href=href;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);};
  const sourceLinks=(parent,text)=>{for(const url of String(text).match(/https?:\/\/[^\s)<>]+/g)||[])link(parent,url.replace(/[.,;]+$/,''),'Read source');};
  const affirmative=text=>!/\b(?:no|not|without|unavailable|lacks?|doesn[’']t|isn[’']t)\b/i.test(text);
  const claimText=text=>String(text).replace(/https?:\/\/\S+/g,'').replace(/^[^:]+:\s*/,'');
  const section=node('section');section.className='m360-strategy-visuals';
  section.append(node('h3','Your market → your campaign'));
  const flow=node('div');flow.className='m360-strategy-flow';flow.setAttribute('aria-label','Audience and campaign strategy diagram');
  const flowItems=[
   ['WHO TO REACH',research.audience_industry,research.audience_rationale],
   ['WHERE TO FOCUS',research.audience_location,data.geography_rationale||'This report proposes a search area, but does not provide a separate regional comparison. Confirm service coverage and access before allocating spend.'],
   ['WHY THEY FIT',research.audience_rationale,'This is a proposed fit with the saved company offer. Check each prospect’s operating requirements; an industry match does not establish purchase intent.']
  ];
  for(const [title,text,explanation]of flowItems){const item=node('div'),more=node('details');more.className='m360-strategy-disclosure';more.append(node('summary',title==='WHERE TO FOCUS'?'Geography and limits':title==='WHO TO REACH'?'Buyer selection':'Validate this fit'),node('p',clean(explanation)));item.append(node('small',title),node('strong',clean(text)),more);flow.append(item);}
  section.append(flow);
  const catalog=[
   ['Land / plots',/\b(?:land|plots?|parcel)\b/i,'Provide approved plot specifications, availability and the documentation buyers need to assess suitability.'],
   ['Warehousing',/\b(?:warehouses?|warehousing|storage space|distribution cent(?:re|er)s?)\b/i,'Show the relevant storage specification, handling requirements and operating arrangements.'],
   ['Infrastructure',/infrastruct|roads?|facilit|construction/i,'Separate facilities available now from planned work; give specifications and their verification date.'],
   ['Services / support',/\b(?:consultancy|consulting|support services?|technical support|design services?|customi[sz]ation)\b/i,'Set out the service scope, responsible team, exclusions and handover process.'],
   ['Product range',/products?|manufactur|catalog|assortment/i,'List the relevant products and specifications instead of claiming a broader range without evidence.'],
   ['Delivery / reach',/deliver|shipping|distribut|coverage/i,'State verified service areas, delivery terms and any exclusions relevant to the buyer.'],
   ['Credentials',/certif|accredit|licens|quality|ISO\b/i,'Provide current certificates or documented quality evidence and identify their scope.'],
   ['Price / terms',/pric|fees?|cost|payment|discount/i,'Make the approved price basis, conditions and exclusions clear; do not infer competitor prices.'],
   ['Care / treatment',/patient|clinic|treatment|medical/i,'Explain the supported service scope and credentials without promising individual outcomes.'],
   ['Digital experience',/software|platform|online|integration/i,'Show the relevant workflow, compatibility requirements and support terms.']
  ];
  const proposedDimensions=Array.isArray(comparisonData.dimensions)?comparisonData.dimensions.slice(0,4):[];
  let rows=comparison.competitor_findings.map(observation=>{
   const text=clean(observation),name=(text.includes(':')?text.split(':')[0]:text.split(/\s+(?:offers|provides|specializes|is |supports|features)/i)[0]).trim();
   const structured=Array.isArray(comparisonData.competitors)?comparisonData.competitors.find(item=>item.observation===observation):null;
   const entries=(structured?.evidence||[]).filter(entry=>
    proposedDimensions.includes(entry.dimension)&&entry.quote?.trim().length>=8&&
    observation.split(/[.!?;]\s+/).some(clause=>clause.includes(entry.quote)&&affirmative(clause))&&comparisonSources.has(safeUrl(entry.source_url)));
   return {name,text,entries};
  });
  const supportedDimensions=candidates=>candidates.filter(dimension=>
   rows.some(row=>row.entries.some(entry=>entry.dimension===dimension)));
  let dimensions=supportedDimensions(proposedDimensions);
  if(!dimensions.length&&!comparisonData.comparison_ranked){
   for(const row of rows){
    const claim=claimText(row.text);
    row.entries=affirmative(claim)?catalog.filter(([,pattern])=>pattern.test(claim)).map(([dimension])=>({dimension})):[];
   }
   dimensions=supportedDimensions(catalog.map(([dimension])=>dimension)).slice(0,4);
  }
  const originalRowCount=rows.length;
  if(dimensions.length){
   rows=rows.filter(row=>row.entries.some(entry=>dimensions.includes(entry.dimension))).slice(0,5);
   dimensions=supportedDimensions(dimensions);
  }
  const synthesis=rows.length===originalRowCount&&dimensions.length&&dimensions.length===proposedDimensions.length?comparisonData.synthesis:null;
  const rowEvidence=row=>{
   const evidence=node('details');
   evidence.append(node('summary','View evidence'),node('p',row.text));
   sourceLinks(evidence,row.text);
   for(const entry of row.entries)if(entry.source_url)link(evidence,entry.source_url,'Source: '+entry.dimension);
   return evidence;
  };
  const matrix=node('section');matrix.append(node('h4','Competitor positioning map'));
  if(!dimensions.length){
   const attempts=search?.replacement_batches||0;
   matrix.append(node('p',rows.length?'The report has competitor observations but lacks enough evidence for a feature comparison. Review the observations below.':attempts?'No candidates met the evidence requirements after '+attempts+' additional search batch'+(attempts===1?'':'es')+'.':'This report has no verified comparison yet.'));
   if(!rows.length){const guide=node('ul');for(const item of ['Look for a direct substitute with the same target buyers.','Compare one documented offer, location, or capability.','Use an operator page, project brochure, or public register as evidence.'])guide.append(node('li',item));matrix.append(guide);}
   for(const row of rows){const item=node('div');item.append(node('strong',row.name),rowEvidence(row));matrix.append(item);}
  }else{
  const ranked=Boolean(comparisonData.comparison_ranked);
  if(ranked){
   matrix.className='m360-ranked-comparison';
   const intro=node('div');intro.className='m360-comparison-intro';
   if(earlier){
    const notice=node('p',(earlier.source==='manual_public_review'?'Showing a source-checked comparison.':'Showing the last usable comparison.')+' The latest automated search did not substantiate new rows.');notice.className='m360-comparison-note';
    const date=new Date(earlier.checked_at);const checked=Number.isFinite(+date)?date.toLocaleDateString():earlier.checked_at;
    intro.append(notice,node('small',[earlier.market,checked?'Sources checked '+checked:''].filter(Boolean).join(' · ')));
   }
   intro.append(node('p',earlier?.source==='manual_public_review'?rows.length+' source-checked alternatives':rows.length+' of 5 closest competitors supported by evidence'),node('small','Ranked by overlap in offer, buyers and market.'+(!earlier&&comparisonData.comparison_checked_at?' Sources reviewed '+comparisonData.comparison_checked_at+'.':'')));
   matrix.append(intro);
  }else{
   matrix.append(node('p','Cells show documented features. “Not stated” marks a gap in the available evidence.'));
  }
  const table=node('table');table.className='m360-position-matrix';
  if(ranked)table.setAttribute('data-ranked','true');
  else table.append(node('caption','Competitive landscape · reported positioning'));
  const head=node('tr'),thead=node('thead'),tbody=node('tbody'),companyHead=node('th','Company');companyHead.scope='col';head.append(companyHead);
  const columns=dimensions.map(dimension=>{const th=node('th',dimension);th.scope='col';head.append(th);return [th];});
  thead.append(head);table.append(thead,tbody);
  for(const [index,row] of rows.entries()){
   const tr=node('tr'),label=node('th');label.scope='row';
   if(ranked){
    const identity=node('div'),rank=node('small',String(index+1).padStart(2,'0'));
    identity.className='m360-comparison-company';rank.className='m360-comparison-rank';
    rank.setAttribute('aria-label','Rank '+(index+1));identity.append(rank,node('strong',row.name));label.append(identity);
   }else label.append(node('strong',row.name));
   tr.append(label);
   for(const [column,dimension] of dimensions.entries()){
    const entry=row.entries.find(item=>item.dimension===dimension),td=node('td');
    td.className=entry?'m360-position-present':'m360-position-unknown';
    if(entry?.quote){
     td.append(node('span',clean(entry.quote)));
     if(!ranked)link(td,entry.source_url,'Source');
    }else if(ranked){
     td.append(node('small','Not documented'));
    }else{
     const marker=node('span',entry?'✓':'—');marker.className='m360-position-marker';
     td.append(marker,node('small',entry?'Reported':'Not stated'));
    }
    tr.append(td);columns[column].push(td);
   }
   label.append(rowEvidence(row));tbody.append(tr);
  }
  const scroll=node('div');scroll.className='m360-strategy-scroll';scroll.setAttribute('role','region');scroll.append(table);
  const select=active=>{
   const full=active===null;
   for(const [index,cells] of columns.entries())for(const cell of cells)cell.hidden=!full&&index!==active;
   for(const [key,button] of selectors)button.setAttribute('aria-pressed',String(key===active));
   scroll.className='m360-strategy-scroll'+(full?'':' m360-comparison-focused');
   scroll.setAttribute('tabindex',full?'0':'-1');
   scroll.setAttribute('aria-label',full?'Competitor comparison, all features':'Competitor comparison by '+dimensions[active]);
   scroll.scrollLeft=0;
  };
  const selectors=new Map();
  if(ranked&&dimensions.length>1){
   const options=node('div');options.className='m360-comparison-options';options.setAttribute('role','group');options.setAttribute('aria-label','Compare competitors by');
   const addOption=(key,label)=>{const button=node('button',label);button.type='button';button.addEventListener('click',()=>select(key));selectors.set(key,button);options.append(button);};
   dimensions.forEach((dimension,index)=>addOption(index,dimension));
   addOption(null,'All features');
   matrix.append(options);
  }
  select(ranked?Math.max(0,dimensions.findIndex(dimension=>/\boffer\b/i.test(dimension))):null);
  matrix.append(scroll);
  if(ranked&&rows.some(row=>dimensions.some(dimension=>!row.entries.some(entry=>entry.dimension===dimension)))){
   const note=node('small','“Not documented” means the sources reviewed did not confirm the feature.');note.className='m360-comparison-note';matrix.append(note);
  }
  }
  section.append(matrix);
  const metrics=Array.isArray(comparisonData.quantitative)?comparisonData.quantitative:[];
  const sizes=comparison.competitor_findings.map(observation=>{const match=String(observation).match(/\b(over |more than |approximately |about |up to )?([\d,]+(?:\.\d+)?)\s+acres\b/i);return match&&affirmative(observation)?{observation,value:Number(match[2].replace(/,/g,'')),qualifier:(match[1]||'').trim()}:null;}).filter(item=>item&&Number.isFinite(item.value)&&item.value>0);
  const comparisons=metrics.length?metrics:sizes.length>1?[{metric:'Reported industrial-site scale',unit:'acres',values:sizes}]:[];
  for(const metric of comparisons){const chart=node('section');chart.className='m360-market-scale';chart.append(node('h4',metric.metric),node('p','Reported '+metric.unit+'. Compare the stated measure only; it does not establish market share or available inventory.'));
   const max=Math.max(1,...metric.values.map(item=>item.value));
   for(const item of metric.values){const row=node('div');row.className='m360-scale-row';const track=node('div'),bar=node('span');track.className='m360-scale-track';bar.style.width=(item.value/max*100)+'%';track.append(bar);const evidence=node('details');evidence.append(node('summary','Source observation'),node('p',clean(item.observation)));sourceLinks(evidence,item.observation);if(item.source_url)link(evidence,item.source_url);row.append(node('strong',clean(item.observation).split(':')[0].slice(0,100)),track,node('span',(item.qualifier?item.qualifier+' ':'')+item.value.toLocaleString()+' '+metric.unit),evidence);chart.append(row);}section.append(chart);
  }
  if(!comparisons.length){const empty=node('details');empty.append(node('summary','Why there is no numerical comparison'),node('p','This report does not contain at least two comparable, sourced values. A chart would imply a measurement the research has not established.'));section.append(empty);}
  const interpretation=node('section');interpretation.className='m360-chart-reading';interpretation.append(node('h4','What this comparison means'));
  if(!dimensions.length){
   interpretation.append(node('p','Gather documented offerings or capabilities across competitors before drawing positioning conclusions.'));
  }else{
  interpretation.append(node('p','Public positioning is evidence of what was reported, not a ranking of delivery quality.'));
  const reading=node('div');reading.className='m360-chart-reading-grid';
  for(const dimension of dimensions){const mentioned=rows.filter(row=>row.entries.some(e=>e.dimension===dimension)),card=node('article');card.append(node('h5',dimension),node('strong',mentioned.length+' of '+rows.length+' observations support this theme'),node('p','Reported by '+mentioned.map(row=>row.name).join(', ')+'.'),node('h6','What your offer needs to explain'),node('p',catalog.find(([label])=>label===dimension)?.[2]||'Identify the buyer requirement, the relevant approved specification and the evidence needed to assess this part of the offer.'),node('small',mentioned.length<rows.length?'Unanswered cells need further research; they do not establish a competitor weakness.':'This theme appears across the reviewed sample. Use specific proof to distinguish your offer.'));reading.append(card);}
  interpretation.append(reading);
  const takeaway=node('article');takeaway.className='m360-comparison-synthesis';const common=dimensions.filter(d=>rows.every(row=>row.entries.some(e=>e.dimension===d))),gaps=dimensions.filter(d=>rows.some(row=>!row.entries.some(e=>e.dimension===d)));
  takeaway.append(node('h4','The overall takeaway'),node('p',synthesis?.decision||(common.length?'Competitors report '+common.join(', ').toLowerCase()+'. Show how your offer meets specific buyer requirements with approved evidence.':'The available evidence varies across '+dimensions.join(', ').toLowerCase()+'. Use the comparison to choose which buyer questions your campaign must answer.')),node('strong','Before making a comparison'),node('p',synthesis?.gaps?.length?synthesis.gaps.join(' '):gaps.length?'Resolve the unanswered points around '+gaps.join(', ').toLowerCase()+'. Ask for comparable specifications and dated source material.':'Check that each claim is current and relevant to the same buyer requirement.'),node('small','Missing information leaves a question open for further research.'));interpretation.append(takeaway);
  }
  section.append(interpretation);
  const classify=text=>/website|landing|brochure|material/i.test(text)?['Build the destination','Measure qualified enquiry rate from the destination.']:/email|outreach/i.test(text)?['Reach decision-makers','Measure consented replies and qualified enquiries.']:/fair|exhibition|association|chamber|partner|trade show|seminar|conference|network/i.test(text)?['Build relationships','Measure relevant conversations and follow-up meetings.']:/tour|video|case stud|testimonial/i.test(text)?['Demonstrate the offer','Measure requests for details and site visits.']:['Test and learn','Measure qualified enquiries and progression to a sales conversation.'];
  const explanations={
   'Build the destination':['Prospects need one reliable place to evaluate the offer before contacting sales. A clear destination reduces repeated questions and gives every campaign a measurable next step.',['Organize approved specifications, availability and supporting material around the buyer’s main questions.','Use one clear enquiry or site-visit call to action and record where enquiries came from.','Test the page on mobile and ask sales to check every commercial claim.'],'A mobile-friendly page or brochure, an enquiry form and a named owner for follow-up.'],
   'Reach decision-makers':['A focused message can connect the offer to a specific business need. Separate relevant buyer groups so recipients see why the offer matters to their operation.',['Use authorized, consented contacts and segment them by industry and location.','Write one relevant benefit, support it with an approved fact, and link to the destination or invite a conversation.','Review the draft and a small permitted test before considering wider distribution.'],'A reviewed audience segment, email draft, destination link and follow-up owner.'],
   'Build relationships':['Industry events and partners create opportunities for conversations with buyers who may not respond to an advertisement. The value comes from relevant introductions and organized follow-up.',['Choose events or associations whose members match the proposed audience.','Prepare a short introduction, an approved information pack and questions that reveal the buyer’s requirements.','Record permitted follow-up details and agree a next meeting while interest is fresh.'],'A shortlist of relevant events or partners, a conversation brief and a follow-up plan.'],
   'Demonstrate the offer':['Evidence helps a buyer picture how the offer fits their needs. A tour, case study or article should answer practical questions rather than repeat promotional claims.',['Choose one buyer question and show how the offer addresses it.','Use approved photographs, specifications and attributable examples; identify planned facilities clearly.','End with a relevant next step, such as requesting specifications or arranging a site visit.'],'A reviewed demonstration or evidence asset linked to a clear enquiry route.'],
   'Test and learn':['Treat this recommendation as a hypothesis about what will help the proposed audience decide. A focused test reveals whether the message produces useful conversations.',['Choose one audience segment and one claim supported by approved company facts.','Prepare a small test with a clear next step and keep other variables consistent.','Review enquiry quality with sales before expanding the activity.'],'One test brief, an approved asset, a measurement plan and a review owner.']
  };
  const actionExplanation=text=>{
   if(/discount|incentive|limited.time/i.test(text))return ['An offer needs clear conditions before it can be used as a reason to enquire. Do not promise a discount or saving that the business has not approved.',['Obtain approval for the price basis, eligibility and expiry.','Check the commercial conditions and what is excluded.','Prepare an offer brief for review; do not publish or apply it automatically.'],'An approved offer brief with conditions, expiry and a responsible reviewer.'];if(/tour|video/i.test(text))return ['A visual walkthrough lets a prospect assess access, layout and facilities before committing to a visit. It is especially useful for buyers outside the region.',['Storyboard the relevant place, product or workflow around the buyer’s practical questions.','Use current approved footage; label renderings and planned infrastructure so they cannot be mistaken for completed work.','Publish the reviewed tour with a route to request specifications or book a guided visit.'],'A short walkthrough, captions, approved site facts and a site-visit enquiry link.'];
   if(/article|case stud|content marketing|testimonial/i.test(text))return ['An educational article or documented example helps a buyer evaluate the decision in depth. It builds credibility by explaining a relevant problem and the evidence behind the proposed solution.',['Choose one buyer question from this recommendation and the approved company context.','Interview the responsible team and gather approved facts; obtain permission before using customer stories or quotations.','Publish an article or case study with attributable evidence and a relevant enquiry call to action.'],'An editorial outline, verified evidence, approved quotations where applicable and a published article or case study.'];
   if(/consult|site visit/i.test(text))return ['A consultation turns general interest into a discussion of the prospect’s operating requirements. A site visit can resolve questions that online material cannot answer.',['Ask about required space, access, utilities and the intended setup timeline.','Prepare a visit agenda and have the relevant technical or sales owner available.','Record the questions answered and agree a specific follow-up with the buyer.'],'A qualification checklist, visit agenda and follow-up record.'];
   const [stage]=classify(text);const [why,steps,deliverable]=explanations[stage];return [why,steps,deliverable];
  };
  const roadmap=node('section');roadmap.append(node('h4','Recommended campaign action map'),node('p','Select an action to review its deliverable, preparation and measurement.'));
  const lane=node('div');lane.className='m360-action-map';const detail=node('div');detail.className='m360-action-detail';detail.setAttribute('aria-live','polite');
  research.recommendations.forEach((recommendation,index)=>{const text=clean(recommendation),[stage,measure]=classify(text),button=node('button');button.type='button';button.append(node('small',String(index+1).padStart(2,'0')+' / '+stage),node('span',text));button.setAttribute('aria-pressed',index===0?'true':'false');
   const show=()=>{const supplied=data.actions?.find(item=>item.recommendation===recommendation),[why,steps,deliverable]=actionExplanation(text);
    detail.replaceChildren(node('small','ACTION '+String(index+1).padStart(2,'0')),node('h4',stage),node('h5','Deliverable'),node('p',supplied?.deliverable||deliverable),node('h5','Purpose'),node('p',supplied?.reason||why),node('h5','Preparation'));
    const list=node('ol');for(const step of supplied?.preparation?.length?supplied.preparation:steps)list.append(node('li',step));detail.append(list,node('h5','Review before release'),node('p','Check the approved facts, audience permissions and final asset for '+clean(research.audience_industry)+' in '+clean(research.audience_location)+'. Agree the responsible reviewer before release.'),node('h5','Suggested measurement'),node('p',supplied?.measurement||measure),node('small','Proposed implementation guidance. No owner, spend, publication or result is approved by this panel.'));if(supplied?.source_url)link(detail,supplied.source_url);
    for(const sibling of lane.children)sibling.setAttribute('aria-pressed',String(sibling===button));};
   button.addEventListener('click',show);lane.append(button);if(index===0)show();
  });roadmap.append(lane,detail);section.append(roadmap);
  const messagePlan=text=>{
   if(/title|document|legal|transparen/i.test(text))return ['Can the buyer verify the documentation before committing?','Ask the responsible team for current documents and permission to share them. Identify which claims are confirmed and which still need review.','Invite the prospect to request the approved information pack.','Track requests for documents and whether the subsequent conversation resolves the buyer’s due-diligence questions.'];
   if(/ready|infrastruct|facilit|plug.and.play/i.test(text))return ['What is available to use now, and what still needs to be completed?','Prepare a dated facility list and approved specifications. Separate existing capacity from planned works; use current images only when authorized.','Offer a specification review or a walkthrough of the confirmed facilities.','Track specification requests and questions about readiness; ask sales whether missing details prevent a useful next step.'];
   if(/location|connectiv|highway|transport|access|corridor/i.test(text))return ['Does this location support the buyer’s operating routes?','Use an approved map, access details and sourced distances where available. Check the routes against the buyer’s actual requirements.','Invite the prospect to review access requirements with the relevant team.','Track route and access enquiries and whether they lead to a qualified discussion or visit.'];
   if(/support|service|consult|planning/i.test(text))return ['Which tasks will the supplier handle, and where does the buyer take over?','List the approved scope, responsible roles, exclusions and commercial conditions. Avoid implying that optional services are included.','Offer a discussion of the support required for this buyer’s project.','Track service-scope enquiries and whether the buyer receives a clear responsibility and handover plan.'];
   if(/price|cost|discount|incentive/i.test(text))return ['What is the total cost under the stated conditions?','Obtain an approved price basis, inclusions, exclusions and any offer expiry. Do not infer competitor prices or promise unapproved savings.','Offer a quotation based on the buyer’s confirmed requirements.','Track qualified quote requests and unresolved cost questions rather than clicks alone.'];
   if(/quality|certif|trust|credib/i.test(text))return ['What evidence supports this quality claim?','Check the scope and date of the relevant certification or documented example. Obtain permission before using customer evidence.','Let the prospect inspect the relevant evidence before making a decision.','Track evidence requests and whether they resolve a specific buying concern.'];
   return ['Which buying question does this observation address?','This saved report does not provide a specific proof requirement for this message. Ask the responsible team to identify one approved fact or example before drafting a claim.','Choose a next step that answers that buying question; keep the observation available for review.','Agree a relevant enquiry-quality measure before testing. No response rate has been established by this report.'];
  };
  const messages=node('div');messages.className='m360-message-map';messages.append(node('h4','Message directions to test'));const messageDetail=node('section');messageDetail.className='m360-message-detail';messageDetail.setAttribute('aria-live','polite');
  for(const [index,trend]of research.content_trends.slice(0,4).entries()){const item=node('button');item.type='button';item.className='m360-message-selector';item.setAttribute('aria-pressed',String(index===0));
   const show=()=>{const supplied=data.messages?.find(entry=>entry.observation===trend),[question,proof,next,measurement]=messagePlan(clean(trend));messageDetail.replaceChildren(node('small','MESSAGE '+String(index+1).padStart(2,'0')),node('h4','Develop the message'),node('h5','The buyer’s decision'),node('p',supplied?.buyer_question||question),node('h5','Proof to obtain'),node('p',supplied?.proof_needed||proof),node('h5','Proposed next step'),node('p',supplied?.next_step||next),node('h5','What to measure'),node('p',supplied?.measurement||measurement),node('small','Suggested test based on observation '+(index+1)+'. This is not measured campaign performance. Claims and assets still need approval.'));const evidence=node('details');evidence.append(node('summary','Original observation'),node('p',clean(trend)));sourceLinks(evidence,trend);if(supplied?.source_url)link(evidence,supplied.source_url);messageDetail.append(evidence);for(const sibling of messages.children)if(sibling.tagName==='BUTTON'||sibling.tag==='button')sibling.setAttribute('aria-pressed',String(sibling===item));};
   item.append(node('span','MESSAGE '+String(index+1).padStart(2,'0')),node('p',clean(trend)));item.addEventListener('click',show);messages.append(item);if(index===0)show();
  }
  if(!research.content_trends.length)messageDetail.append(node('p','No message observations are available in this report.'));section.append(messages,messageDetail);container.append(section);
 }
 function render(container,value){
  container.replaceChildren();
  if(container.id==='m360-research-report') publishResearchSummary({workspace:workspace(),createdAt:value?.created_at||null});
  if(!value){container.append(node('p','Ask Control Center to research a campaign. Evidence, filters, creative direction and planning estimates appear here.'));return;}
  const research=value.research;container.append(node('h3','Research at a glance'),node('small','Researched '+new Date(value.created_at).toLocaleString()+' · Company version '+value.profile_version));
  const reportNav=node('nav');reportNav.className='m360-report-nav';reportNav.setAttribute('aria-label','Report sections');
  for(const [label,title]of [['Audience','Your market → your campaign'],['Competitors','Competitor positioning map'],['Implications','What this comparison means'],['Actions','Recommended campaign action map'],['Messages','Message directions to test']]){const button=node('button',label);button.type='button';button.addEventListener('click',()=>{const heading=[...container.querySelectorAll('h3,h4')].find(item=>item.textContent===title);heading?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});reportNav.append(button);}container.append(reportNav);
  if(value.current_profile_version!=null&&value.current_profile_version!==value.profile_version){const warning=node('aside','Company Details have changed since this report. Review the saved report before using it. A new research request requires your approval.');warning.className='m360-report-stale';warning.setAttribute('role','status');container.append(warning);}
  container.append(node('p',research.summary));strategyVisuals(container,research,value.sources||[],value.comparison_fallback,value.comparison_search);
  if(research.uncertainties.length){const caution=node('aside');caution.className='m360-pointer-card caution';caution.append(node('h4','What still needs checking'));const list=node('ul');for(const item of research.uncertainties)list.append(node('li',item));caution.append(list);container.append(caution);}
  container.append(node('h4','Planning scenarios · hypothetical'),node('p',value.forecast.disclaimer));
  const assumptions=node('button','Review planning assumptions');assumptions.type='button';assumptions.addEventListener('click',()=>{window.Matrix360Router?.navigateToPage('profile');document.getElementById('m360-brand-form')?.elements.namedItem(value.forecast.missing?.[0]||'investment_budget')?.focus();});container.append(assumptions);
  if(value.forecast.rows.length){const charts=node('div');charts.className='m360-forecast-grid';const scale=Math.max(1,...value.forecast.rows.flatMap(row=>['revenue','delivery_cost','initial_investment','net_profit'].map(key=>Math.abs(Number(row[key])||0))));for(const row of value.forecast.rows){const card=node('article');card.className='m360-forecast-card';card.append(node('h4',row.scenario),node('strong',(Number(row.conversion_percent)||0).toLocaleString(undefined,{maximumFractionDigits:2})+'% conversion · '+(Number(row.expected_clients)||0).toLocaleString(undefined,{maximumFractionDigits:2})+' expected clients'));for(const [label,key]of [['Revenue','revenue'],['Delivery cost','delivery_cost'],['Investment','initial_investment'],['Net profit','net_profit']]){const line=node('div');line.className='m360-bar-line';const track=node('span');track.className='m360-bar-track m360-diverging-track';const bar=node('span');bar.className='m360-bar '+(Number(row[key])<0?'negative':'');const width=Math.abs(Number(row[key])||0)/scale*50;bar.style.width=width+'%';bar.style.left=(Number(row[key])<0?50-width:50)+'%';track.append(bar);line.append(node('span',label+' · '+(Number(row[key])||0).toLocaleString(undefined,{maximumFractionDigits:2})),track);card.append(line);}charts.append(card);}container.append(node('p','Currency: '+value.forecast.currency+' · Lead count: '+value.forecast.lead_count),node('small','Zero is at the centre. Negative values extend left; positive values extend right.'),charts);const exact=node('details');exact.append(node('summary','Open exact scenario table'));const table=node('table'),head=node('tr');for(const label of ['Scenario','Conversion %','Expected clients','Revenue','Delivery cost','Investment','Net profit'])head.append(node('th',label));table.append(head);for(const row of value.forecast.rows){const tr=node('tr');for(const key of ['scenario','conversion_percent','expected_clients','revenue','delivery_cost','initial_investment','net_profit'])tr.append(node('td',typeof row[key]==='number'?row[key].toLocaleString(undefined,{maximumFractionDigits:2}):row[key]));table.append(tr);}exact.append(table);container.append(exact);}else container.append(node('p','Add the planning assumptions in Company Details: '+value.forecast.missing.map(key=>({investment_budget:'Investment budget',unit_sale_value:'Sale value per customer',unit_delivery_cost:'Delivery cost per customer',expected_conversion_rate:'Expected conversion rate (%)'})[key]||'Required planning assumption').join(', ')));
  const full=node('details');full.className='m360-text-bubble';full.append(node('summary','Open full research text'));for(const [label,text]of [['Summary',research.summary],['Proposed audience',research.audience_industry+' in '+research.audience_location],['Why this audience',research.audience_rationale],['Creative brief for Content AI',research.creative_brief]])full.append(node('h4',label),node('p',text));for(const [label,items]of [[research.competitor_findings.length?'Competitor observations':value.comparison_fallback?'Competitor observations from the separate comparison':'Competitor observations',research.competitor_findings.length?research.competitor_findings:value.comparison_fallback?.research?.competitor_findings||[]],['Content trends',research.content_trends],['Regional opportunities to investigate',research.recommendations],['Unknowns and limitations',research.uncertainties]]){full.append(node('h4',label));const ul=node('ul');for(const item of items)ul.append(node('li',item));full.append(ul);}full.append(node('h4','Sources'));for(const url of new Set([...value.sources,...(value.comparison_fallback?.sources||[])])){const a=node('a',url);a.href=url;a.target='_blank';a.rel='noopener noreferrer';full.append(a,node('br'));}container.append(full);
 }
 function reviewPrompt(stage,text,check,signal){
  return new Promise((resolve,reject)=>{check();const host=$('m360-control-output');if(!host)return reject(Error('Prompt review area is unavailable.'));
   const details=node('details');details.className='m360-prompt-bubble';details.open=true;const label=node('label','Edit before sending to '+stage),textarea=node('textarea'),status=node('p','This prompt has not been sent.'),send=node('button','Send to '+stage),cancel=node('button','Cancel workflow');textarea.id='m360-prompt-'+Date.now()+'-'+Math.random().toString(16).slice(2);label.htmlFor=textarea.id;textarea.value=text;textarea.maxLength=6000;textarea.rows=8;status.setAttribute('aria-live','polite');send.type=cancel.type='button';details.append(node('summary','Review prompt for '+stage),label,textarea,status,send,cancel);host.append(details);textarea.focus({preventScroll:true});
   if(stage==='Leads'){const research=host.querySelector?.('article');const continueButton=node('button','Continue to discovery review');continueButton.type='button';continueButton.addEventListener('click',()=>{textarea.focus({preventScroll:true});details.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});});research?.append(continueButton);research?.setAttribute('tabindex','-1');research?.focus({preventScroll:true});research?.scrollIntoView({behavior:'smooth',block:'start'});}
   let done=false;const abort=()=>finish(Error('Campaign stopped before the prompt was sent.'));const finish=error=>{if(done)return;done=true;cancelPromptReview=null;signal?.removeEventListener('abort',abort);send.disabled=cancel.disabled=textarea.disabled=true;if(error){status.textContent=error.message;reject(error);}else{status.textContent='Sent to '+stage+'.';details.open=false;resolve(textarea.value);}};cancelPromptReview=abort;signal?.addEventListener('abort',abort,{once:true});send.addEventListener('click',()=>{try{check();if(!textarea.value.trim())throw Error('Prompt cannot be empty.');finish();}catch(error){status.textContent=error.message;}});cancel.addEventListener('click',abort);
  });
 }
 function mount(){
  const host=$('verified');if(!host||$('m360-market-research'))return;
  const panel=node('section');panel.id='m360-market-research';panel.className='card';panel.dataset.m360Page='research';panel.classList.add('m360-mp-hidden-section');panel.append(node('h2','Market Research'));
  const results=node('div');results.id='m360-research-report';panel.append(results);host.append(panel);render(results,null);researchSummary=null;
  // Research presentation styles are owned by matrix360-workspace-theme.css.
  // Preserve the existing controls and handlers while relocating planning tools.
  const movePlanningTool=element=>{if(!element)return;element.classList.add('m360-research-planning-tool');panel.append(element);};
  for(const id of ['m360-budget-section','m360-strategy-card'])if($(id))movePlanningTool($(id).closest('details')||$(id));
  movePlanningTool($('m360-calendar-grid')?.closest('.m360-card'));
  movePlanningTool(document.querySelector('#marketing-centre .m360-advanced-tools'));
  for(const name of ['business_name','industry','description','service_areas']){const field=$('m360-brand-form')?.elements.namedItem(name);if(field)field.required=true;}
  window.Matrix360Router?.navigateToPage(window.Matrix360Router.resolveInitialPage(),undefined,true);
 }
 async function emailReview(taskId,ws,auth){
  const card=node('article');card.className='card';card.append(node('h3','Email review and release'));
  const copy=node('pre'),status=node('p','Loading current Email draft…'),approve=node('button','Approve this exact Email draft'),send=node('button','Send approved Email campaign'),verify=node('button','Verify email connection');
  const image=node('img');image.alt='Saved campaign creative included in this Email draft';image.style.maxWidth='100%';image.hidden=true;card.append(image);
  copy.style.whiteSpace='pre-wrap';approve.type=send.type=verify.type='button';approve.disabled=send.disabled=true;card.append(copy,status,verify,approve,send);$('m360-control-output')?.append(card);
  const guard=()=>{if(workspace()!==ws||token()!==auth)throw Error('Workspace changed. Reload the campaign before release.');};
  let latest=null,displayedDraft=null,refreshId=0;
  async function refresh(){
   guard();
   const id=++refreshId;
   approve.disabled=send.disabled=true;
   displayedDraft=null;
   const data=await api('/api/marketing/tasks?'+new URLSearchParams({workspace_id:ws,correlation_id:taskId}));
   guard();
   if(id!==refreshId)return;
   const task=data.task;
   const draft=task?.channel_draft_versions?.Email?.versions?.at(-1);
   let imageUrl;
   if(draft?.email_creative){
    const asset=await api('/api/poster-history?'+new URLSearchParams({workspace_id:ws,action:'source',poster_id:draft.email_creative.poster_id,version:draft.email_creative.version,view:'final'}));
    guard();
    if(id!==refreshId)return;
    imageUrl=asset.source_url;
   }
   latest=task;
   displayedDraft=draft;
   copy.textContent=draft?(draft.subject||'Email')+'\n\n'+(draft.body||''):'Draft preparation is still running. Use Refresh draft.';
   image.hidden=!imageUrl;
   if(imageUrl)image.src=imageUrl;
   const count=(task?.audience_snapshot?.contacts||[]).filter(c=>c.email&&['granted','opted_in'].includes(c.email_opt_in_status)&&c.consent_evidence?.email===true&&!c.suppressed&&!c.unsubscribed).length;
   approve.disabled=!draft||draft.status==='approved';
   send.textContent='Send approved Email to '+count+' consented contacts';
   send.disabled=draft?.status!=='approved'||!count;
   status.textContent='Task '+taskId+' · '+(task?.status||'pending')+' · '+count+' consent-eligible contacts. Provider, allowlist, cap and role checks still apply.';
   return draft;
  }
  const reload=node('button','Refresh draft');reload.type='button';card.append(reload);reload.addEventListener('click',()=>refresh().catch(e=>status.textContent=e.message));
  verify.addEventListener('click',async()=>{try{guard();await api('/api/marketing/providers/verify',{workspace_id:ws,provider:'email'});guard();status.textContent='SMTP authentication verified. Nothing sent.';}catch(e){status.textContent=e.message;}});
  approve.addEventListener('click',async()=>{
   const draft=displayedDraft;
   if(!draft||approve.disabled)return;
   approve.disabled=true;
   try{
    guard();
    await api('/api/marketing/approve',{workspace_id:ws,correlation_id:taskId,channel:'Email',version_hash:draft.version_hash});
    await refresh();
   }catch(e){status.textContent=e.message+' Use Refresh draft to review the current version.';}
  });
  send.addEventListener('click',async()=>{
   const draft=displayedDraft;
   if(draft?.status!=='approved'||send.disabled)return;
   try{
    guard();
    if(!window.confirm(send.textContent+'? This sends real email.'))return;
    send.disabled=true;
    const result=await api('/api/marketing/execute',{workspace_id:ws,correlation_id:taskId,channel:'Email',mode:'live',version_hash:draft.version_hash,operator_approved:true,approval_phrase:'SEND_APPROVED_EMAIL_CAMPAIGN'});
    guard();
    status.textContent='Provider result: '+result.status+'. Inbox delivery is not confirmed by acceptance.';
   }catch(e){status.textContent=e.message+' Use Refresh draft to review the current version.';}
  });
  try{
   for(let attempt=0;attempt<90;attempt++){
    await refresh();
    if(latest?.status==='failed')throw Error(latest.step_history?.at(-1)?.detail||'Outreach draft preparation failed.');
    if(latest?.status==='draft_ready')return refresh;
    await new Promise(resolve=>setTimeout(resolve,1000));
   }
   throw Error('Outreach draft preparation is still running. Use Refresh draft to check it; nothing was sent.');
  }catch(error){status.textContent=error.message;throw error;}
 }
 document.addEventListener('m360:company-ready',event=>{if(event.detail?.workspace===workspace()&&!event.detail.complete)window.Matrix360Router?.navigateToPage('profile');});
 function publishResearchSummary(detail){
  researchSummary=detail;
  document.dispatchEvent(new CustomEvent('m360:research-summary',{detail}));
 }
 async function loadReport(event){mount();const ws=workspace(),auth=token(),epoch=generation;if(running||!ws||event.detail?.workspace!==ws)return;reportLoading=true;try{const data=await api('/api/market-research?workspace_id='+encodeURIComponent(ws));if(running||ws!==workspace()||auth!==token()||epoch!==generation)return;report=data.report;render($('m360-research-report'),report);}catch(error){if(epoch!==generation||ws!==workspace()||auth!==token())return;
  if($('m360-research-report'))$('m360-research-report').textContent=error.message;
  publishResearchSummary({workspace:ws,unavailable:true});
 }finally{if(epoch===generation)reportLoading=false;}}
 document.addEventListener('m360:crm-loaded',loadReport);
 document.addEventListener('m360:brand-updated',loadReport);
 document.addEventListener('m360:crm-summary',event=>{
  if(researchSummary?.workspace===event.detail.workspace)publishResearchSummary(researchSummary);
  else if(!reportLoading)loadReport(event);
 });
 const resetReport=()=>{generation++;cancelPromptReview?.();report=null;reportLoading=false;const target=$('m360-research-report');if(target)render(target,null);researchSummary=null;};
 document.addEventListener('m360:workspace-changing',resetReport);
 document.addEventListener('m360:session-ended',resetReport);
 window.M360CampaignAgent={
  async run(message,{mode='campaign_plan',signal,onProgress=()=>{}}={}){
   if(running)throw Error('A campaign workflow is already running.');running=true;const ws=workspace(),auth=token(),epoch=++generation;
   const check=()=>{if(signal?.aborted||epoch!==generation||workspace()!==ws||token()!==auth)throw Error('Campaign stopped or workspace changed.');};
   try{
    onProgress('Market Research is studying your company, audience and competitors…');
    const report=(await api('/api/market-research',{workspace_id:ws,message},signal)).report;check();
    if(!report?.research)throw Error('Research did not return a usable report. No discovery was started.');
    mount();render($('m360-research-report'),report);
    const summary=node('article');summary.className='card';render(summary,report);$('m360-control-output')?.append(summary);
    if(mode==='research'||mode==='campaign_plan'){
     onProgress(mode==='campaign_plan'?'Launch plan ready. Review the strategy and recommended actions.':'Market Research report ready. Review the evidence and recommendations.');
     return;
    }
    const count=Math.max(1,Math.min(100,Number(message.match(/\b(\d+)\s+(?:leads|prospects)/i)?.[1]||10)));
    if(mode!=='email_workflow')throw Error('Choose a campaign workflow before continuing.');
    onProgress('Research ready. Read the report, then review the discovery prompt below. Nothing has been sent to Leads.');
    if(!window.M360LeadsSubAgent)throw Error('Lead specialist is not available. Research is saved.');
    const leadPrompt=await reviewPrompt('Leads','Find '+count+' prospects.\nType of prospects or industry focus: '+report.research.audience_industry+'\nTarget location for prospect search: '+report.research.audience_location,check,signal);check();
    const leads=await window.M360LeadsSubAgent.executeFromMasterAgent(leadPrompt,(status,state)=>{if(epoch===generation)onProgress('Leads: '+(state.leads?.length||0)+' / '+count+' · '+status);});check();
    if(!leads?.leads?.length)throw Error('Research completed, but discovery returned no prospects. No content or email was generated.');
    if(!window.M360ContentAgent)throw Error('Content specialist is not ready. Research and lead results are retained.');
    onProgress('Review the creative brief below before sending it to Content AI.');
    const contentPrompt=await reviewPrompt('Content AI',report.research.creative_brief,check,signal);check();
    const creative=await window.M360ContentAgent.create({workspace_id:ws,prompt:contentPrompt,channel:'Email',signal});check();
    const preview=node('img');preview.src=creative.url;preview.alt='Generated campaign creative for review';preview.style.maxWidth='100%';$('m360-control-output')?.append(preview,node('p',creative.caption));
    const history=await api('/api/poster-history?'+new URLSearchParams({workspace_id:ws,action:'list'}),null,signal);check();
    if(!(history.versions||[]).some(item=>item.poster_id===creative.poster_id))throw Error('Creative generated, but its saved version is not confirmed. Review Content Creation before Outreach.');
    onProgress('Creative saved. Review the Outreach prompt below before preparing drafts.');
    const outreachPrompt=await reviewPrompt('Outreach',message+'\nResearch direction: '+contentPrompt,check,signal);check();
    const task=await api('/api/marketing/dispatch',{workspace_id:ws,prompt:outreachPrompt,poster_id:creative.poster_id,poster_version:creative.version||1},signal);check();
    const result=node('p','Research, prospect discovery and creative preparation completed. Outreach task '+task.correlation_id+' is preparing drafts. Email approval and consent checks remain required; nothing was sent.');$('m360-control-output')?.append(result);
    onProgress('Creative saved. Waiting for Outreach draft preparation; nothing is being sent…');
    const refreshEmail=await emailReview(task.correlation_id,ws,auth);check();
    const attached=await api('/api/marketing/coordination',{workspace_id:ws,correlation_id:task.correlation_id,operation:'content',poster_id:creative.poster_id,poster_version:creative.version||1},signal);check();
    if(!(attached.task?.artifact_refs||[]).some(ref=>ref.metadata?.poster_id===creative.poster_id))throw Error('Email drafts are ready, but the generated creative was not attached. Review saved Content before release.');
    await refreshEmail();check();
    window.M360ActiveCampaign={workspace_id:ws,correlation_id:task.correlation_id,channel:'Email'};
    document.dispatchEvent(new CustomEvent('m360:campaign-prepared',{detail:window.M360ActiveCampaign}));
    const review=node('button','Review Outreach drafts');review.type='button';review.addEventListener('click',()=>window.Matrix360Router?.navigateToPage('marketing'));$('m360-control-output')?.append(review);
    onProgress('Research, leads, saved creative and Outreach drafts ready for review. Nothing was sent.');
   }catch(error){if(error.needsCompany)window.Matrix360Router?.navigateToPage('profile');throw error;}finally{running=false;}
  }
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
 // CRM may finish before this deferred module is evaluated.
 if(workspace()&&token())loadReport({detail:{workspace:workspace()}});
})();
