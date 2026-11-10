/* Shared campaign review. Navigation hides panels without replacing their unsent work. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id), flows = new Map();
  const workspace = () => $('workspace')?.value || '';
  const auth = () => { try { return +sessionStorage.getItem('matrix360_pilot_expires_at') > Date.now() ? sessionStorage.getItem('matrix360_pilot_token') : null; } catch { return null; } };
  const node = (tag, text) => { const element = document.createElement(tag); if (text) element.textContent = text; return element; };
  const valid = state => flows.get(state.origin) === state && state.workspace === workspace() && state.auth === auth();
  function status(state, message) { if (valid(state)) { state.message = message; state.status.textContent = message; } }
  function button(parent, label, action, disabled = false) {
    const element = node('button', label); element.type = 'button'; element.disabled = disabled;
    element.addEventListener('click', action); parent.append(element); return element;
  }
  function field(parent, label, value, change, multiline = false) {
    const wrap = node('label', label), input = node(multiline ? 'textarea' : 'input');
    input.value = value || ''; input.maxLength = multiline ? 2000 : 500; if (multiline) input.rows = 5;
    input.addEventListener('input', () => change(input.value)); wrap.append(input); parent.append(wrap); return input;
  }
  async function api(state, path, body) {
    if (!valid(state)) throw Error('Workspace or session changed.');
    const response = await fetch('/api/marketing/' + path, {method:body ? 'POST' : 'GET', cache:'no-store', signal:state.controller.signal,
      headers:{Authorization:'Bearer ' + state.auth, ...(body ? {'Content-Type':'application/json'} : {})},
      body:body ? JSON.stringify({workspace_id:state.workspace,...body}) : undefined});
    const result = await response.json();
    if (!valid(state)) throw Error('Workspace or session changed.');
    if (!response.ok) throw Error(result.error || result.message || 'The step could not finish. Retry this step.');
    return result;
  }
  function discoveryContext() {
    const state = window.M360LeadsSubAgent?.getState();
    return state?.campaignId ? {discovery_task_id:state.campaignId,checkpoint:state.checkpoint || ''} : {};
  }
  function payload(state) { return {prompt:state.prompt,answers:state.answers,...discoveryContext()}; }
  function beginStep(state, title) {
    state.body.replaceChildren(node('h3',title));
    if (state.resources?.warnings?.length) state.resources.warnings.forEach(message=>state.body.append(node('p',message)));
  }
  function recover(state, error, retry) {
    if (!valid(state)) return;
    state.busy = false;
    status(state, error.name === 'AbortError' ? 'Request cancelled. Completed work is retained.' : error.message);
    button(state.body, 'Retry this step', () => {state.controller = new AbortController();retry();});
  }
  async function inspect(state) {
    if (!valid(state) || state.busy) return;
    state.busy = true; status(state, 'Checking saved leads, research and creative…');
    try {
      const data = payload(state);
      const result = await api(state, 'resources', data);
      state.resources = result; state.busy = false;
      if (!result.can_write) { beginStep(state,'Workspace review'); state.body.append(node('p','Your role can review workspace records. Ask a workspace administrator or marketing operator to prepare this campaign.')); status(state,'Read-only role'); return; }
      if (state.mode !== 'leads' && !result.topic_known) return askTopic(state);
      state.answers = {...result.brief, count:result.brief.requested_count, ...state.answers};
      if (!state.confirmedBrief) return reviewBrief(state);
      audience(state);
      return true;
    } catch(error) { recover(state,error,()=>inspect(state)); }
  }
  function askTopic(state) {
    beginStep(state,'What should the campaign be about?'); status(state,'Waiting for your answer');
    const answer = field(state.body,'Product, service or launch',state.answers.topic,value=>state.answers.topic=value);
    for (const product of state.resources.context.profile?.products_services || []) button(state.body,product,()=>{state.answers.topic=product;inspect(state);});
    button(state.body,'Continue',()=>{if(!answer.value.trim())return answer.focus();inspect(state);});
  }
  function reviewBrief(state) {
    beginStep(state,'Review the campaign brief'); status(state,'Waiting for your answer');
    field(state.body,'Editable campaign brief',state.prompt,value=>state.prompt=value,true);
    const grid = node('div'); grid.className='m360-campaign-fields'; state.body.append(grid);
    for (const [key,label] of [['audience','Target audience'],['geography','Target geography'],['count','Requested leads'],['qualification','Qualification criteria (optional)']]) {
      const input = field(grid,label,state.answers[key],value=>state.answers[key]=value);
      if(key==='count'){input.type='number';input.min='1';input.max='2000';}
    }
    const channels=node('fieldset');channels.append(node('legend','Channels'));if(state.mode!=='leads')state.body.append(channels);
    for(const channel of ['Email','LinkedIn','Instagram','Facebook','WhatsApp','YouTube','X']){
      const label=node('label',channel),check=node('input');check.type='checkbox';check.checked=state.answers.channels?.includes(channel);
      check.addEventListener('change',()=>{state.answers.channels=check.checked?[...state.answers.channels||[],channel]:(state.answers.channels||[]).filter(value=>value!==channel);});label.prepend(check);channels.append(label);
    }
    const facts=node('details');facts.append(node('summary','Company facts, evidence and assumptions'));
    facts.append(node('h4','Approved company claims'),node('p',state.resources.context.profile?.approved_claims?.join('\n')||'No approved claims saved.'));
    const report=state.resources.research;
    facts.append(node('h4','Sourced observations'),node('p',report?.research?.summary||'No saved research.'));
    for(const source of report?.sources||[]){const url=typeof source==='string'?source:source.url;if(!/^https:\/\//i.test(url||''))continue;const link=node('a',url);link.href=url;link.target='_blank';link.rel='noopener noreferrer';facts.append(link);}
    facts.append(node('h4','Planning assumptions'),node('p',(report?.research?.uncertainties||[]).join('\n')||'Audience, count and channel choices are planning inputs, not measured results.'));
    state.body.append(facts);
    button(state.body,'Check this audience',()=>{
      if(!state.answers.audience?.trim()||!state.answers.geography?.trim()||!state.answers.count||(state.mode!=='leads'&&!state.answers.channels?.length))return status(state,'Add audience, geography, lead count and a channel for campaigns.');
      state.confirmedBrief=true;state.selected=[];state.briefs=[];inspect(state);
    });
  }
  function counts(state) {
    const requested=Number(state.answers.count), selected=state.selected.length;
    return {requested,selected,missing:Math.max(0,requested-selected)};
  }
  function audience(state) {
    beginStep(state,'Choose the campaign audience');
    const data=state.resources;
    state.selected=state.selected.filter(id=>data.candidates.some(row=>row.selection_id===id));
    const count=node('p');count.className='m360-campaign-counts';state.body.append(count);
    const update=()=>{const c=counts(state);count.textContent=`Requested ${c.requested} · Selected ${c.selected} · Missing ${c.missing}`;};update();
    state.body.append(node('p',`${data.existing_count} matching CRM records · ${data.saved_candidate_count} saved candidates · ${data.excluded_count} excluded by the brief or deduplication.`));
    const choices=node('div');choices.className='m360-campaign-actions';state.body.append(choices);
    const choose=rows=>{state.selected=rows.slice(0,Number(state.answers.count)).map(row=>row.selection_id);audience(state);};
    button(choices,'Use existing leads',()=>choose(data.candidates.filter(row=>row.pool==='crm')),!data.existing_count);
    button(choices,'Top up from saved candidates',()=>choose(data.candidates),!data.candidates.length);
    button(choices,'Run a new search',()=>discover(state,Number(state.answers.count)));
    const list=node('div');list.className='m360-campaign-audience';state.body.append(list);
    for(const row of data.candidates){
      const label=node('label'),check=node('input');check.type='checkbox';check.checked=state.selected.includes(row.selection_id);
      label.append(check,node('span',`${row.name || row.company_name} · ${row.pool==='crm'?'CRM':row.pool==='verified_discovery'?'Verified discovery':'Reserved CRM stage'} · ${row.email_opt_in_status==='granted'?'Email consent recorded':'Consent requires review'}`));
      check.addEventListener('change',()=>{if(check.checked&&state.selected.length>=Number(state.answers.count)){check.checked=false;return status(state,'The requested audience count is already selected. Replace a selection first.');}state.selected=check.checked?[...state.selected,row.selection_id]:state.selected.filter(id=>id!==row.selection_id);update();});list.append(label);
    }
    if(!data.candidates.length)list.append(node('p','No matching saved audience. Review the criteria or explicitly start discovery.'));
    const details=node('details');details.append(node('summary','Where saved candidates come from'),node('p',data.pool_note));state.body.append(details);
    button(state.body,'Find only the missing leads',()=>{const c=counts(state);if(!c.missing)return status(state,'The requested audience is selected.');discover(state,c.missing);});
    if(state.mode==='leads')button(state.body,'Review selected leads',()=>{
      beginStep(state,'Selected leads');const c=counts(state);state.body.append(node('p',`Requested ${c.requested} · Selected ${c.selected} · Missing ${c.missing}`));
      for(const row of data.candidates.filter(row=>state.selected.includes(row.selection_id)))state.body.append(node('p',`${row.name} · ${row.location||''} · ${row.fit_reasoning||row.source}`));
      button(state.body,'Replace selections',()=>audience(state));button(state.body,'Open Leads & Pipeline',()=>window.Matrix360Router?.navigateToPage('leads','#leads'));
      status(state,'Audience ready for review. No import or outreach was performed.');
    });else button(state.body,'Continue with selected audience',()=>creative(state));
    button(state.body,'Edit audience criteria',()=>{state.confirmedBrief=false;reviewBrief(state);});
    status(state,'Waiting for your answer');
  }
  async function discover(state,count) {
    const agent=window.M360LeadsSubAgent;
    if(state.busy)return;
    if(!agent)return status(state,'Lead discovery is unavailable. Selected records are retained.');
    beginStep(state,'Review discovery request');
    let prompt=`Find ${count} prospects.\nType of prospects or industry focus: ${state.answers.audience}\nTarget location for prospect search: ${state.answers.geography}\nQualification criteria: ${state.answers.qualification || 'Match the audience and geography.'}`;
    const excluded=state.resources.candidates.filter(row=>state.selected.includes(row.selection_id)).map(row=>row.name||row.company_name);
    if(excluded.length)prompt+='\nExclude already selected businesses: '+excluded.join('; ');
    const input=field(state.body,'Editable discovery brief',prompt,value=>prompt=value,true);
    input.maxLength=2500;
    button(state.body,`Request ${count} more leads`,async()=>{
      if(state.busy)return;
      const request=++state.discoveryRevision;
      state.busy=true;status(state,`${count} more leads requested`);
      try {
        const result=await agent.executeFromMasterAgent(prompt,(message,progress)=>{if(valid(state)&&request===state.discoveryRevision)status(state,`${count} more leads requested · ${progress.leads?.length||0} found · ${message}`);});
        if(!valid(state)||request!==state.discoveryRevision)return;
        state.busy=false;
        if(!result?.leads?.length)throw Error(agent.getStatus()||'Discovery returned no verified matches. Selected records are retained.');
        await inspect(state);
      }catch(error){if(request===state.discoveryRevision)recover(state,error,()=>discover(state,count));}
    });
    button(state.body,'Cancel discovery',async()=>{state.discoveryRevision++;if(state.busy){try{await agent.cancelDiscovery();}catch{}state.busy=false;}if(!valid(state))return;audience(state);status(state,'Discovery cancelled. Selected records are retained.');});
    button(state.body,'Back to selected audience',()=>{if(state.busy)return status(state,'Cancel the active discovery before returning.');audience(state);});
    status(state,'Discovery brief ready for review');
  }
  function creative(state) {
    beginStep(state,'Choose creative and review each brief');
    const c=counts(state);state.body.append(node('p',`Requested ${c.requested} · Selected ${c.selected} · Missing ${c.missing}. Drafting does not contact this audience.`));
    const assets=state.resources.assets.filter(asset=>!asset.metadata.channel||state.answers.channels.includes(asset.metadata.channel)).sort((a,b)=>Number(b.approval_state==='previously_approved')-Number(a.approval_state==='previously_approved'));
    if(!assets.length)state.body.append(node('p','No saved creative is available for these channels. Prepare fresh briefs below.'));
    else state.body.append(node('p',assets.length+' saved versions for the selected channels. Choose one per channel, or prepare fresh creative.'));
    const assetList=node('div');assetList.className='m360-campaign-assets';state.body.append(assetList);
    for(const asset of assets){
      const label=node('label'),check=node('input');check.type='checkbox';check.checked=state.assets.includes(asset.id);
      label.append(check,node('span',`${asset.metadata.channel || 'Creative'} · ${asset.metadata.headline || asset.id} · v${asset.metadata.version} · ${asset.approval_state==='previously_approved'?'Previously approved; review for this campaign':'Saved, approval required'}`));
      const row=node('div');row.className='m360-campaign-asset';assetList.append(row);
      check.addEventListener('change',()=>{state.assets=check.checked?[...state.assets.filter(id=>state.resources.assets.find(item=>item.id===id)?.metadata.channel!==asset.metadata.channel),asset.id]:state.assets.filter(id=>id!==asset.id);creative(state);});row.append(label);
      button(row,'Open this saved version',()=>{window.Matrix360Router?.navigateToPage('content','#m360-saved-designs');document.dispatchEvent(new CustomEvent('m360:open-saved-creative',{detail:{workspace:state.workspace,poster_id:asset.metadata.poster_id,version:asset.metadata.version}}));}).setAttribute('aria-label','Open '+(asset.metadata.headline||asset.id)+' version '+asset.metadata.version);
    }
    button(state.body,'Prepare fresh creative',()=>{state.assets=[];creative(state);});
    button(state.body,'Refresh saved assets',async()=>{if(await inspect(state))creative(state);});
    if(!state.briefs.length)for(const channel of state.answers.channels){
      const formats=channel==='Email'?['copy','image']:/\b(?:reel|storyboard)\b/i.test(state.prompt)?['reel']:['copy'];
      for(const format of formats)state.briefs.push({channel,format,prompt:`Prepare ${channel} ${format==='image'?'email artwork':format==='reel'?'reel storyboard':'copy'}.\nCampaign: ${state.prompt}\n${state.answers.topic?'Topic: '+state.answers.topic+'\n':''}Audience: ${state.answers.audience}. Geography: ${state.answers.geography}.\nUse only approved company claims and saved brand assets. Keep sourced observations separate from claims.`});
    }
    for(const brief of state.briefs){
      const panel=node('section');panel.className='m360-campaign-brief';state.body.append(panel);
      field(panel,`${brief.channel} ${brief.format==='image'?'artwork':brief.format==='reel'?'storyboard':'copy'} brief`,brief.prompt,value=>brief.prompt=value,true);
      button(panel,'Open in Content Creation',()=>openContent(state,brief));
    }
    for(const draft of state.drafts||[]){
      const panel=node('section');panel.className='m360-campaign-brief';panel.append(node('h4',draft.channel+' draft returned from Content Creation'));state.body.append(panel);
      field(panel,'Returned subject',draft.subject,value=>draft.subject=value);
      field(panel,'Returned draft',draft.body,value=>draft.body=value,true).maxLength=5500;
    }
    button(state.body,'Prepare campaign drafts',()=>dispatch(state));
    button(state.body,'Replace audience selections',()=>audience(state));
    status(state,'Briefs ready for review. Paid rendering is a separate step.');
  }
  function openContent(state,brief){
    if(!valid(state))return;
    const target=brief.format==='image'?{event:'m360:content-brief',id:'m360-ai-post-prompt',anchor:'#m360-ai-post-studio'}:brief.format==='reel'?{event:'m360:reel-brief',id:'m360-storyboard-brief',anchor:'#m360-storyboard'}:{event:'m360:copy-brief',id:'creative-prompt',anchor:'#creative-studio'};
    const limit=$(target.id)?.maxLength||900;
    if(brief.prompt.length>limit)return status(state,`Shorten this brief to ${limit} characters before handing it to Content Creation.`);
    window.Matrix360Router?.navigateToPage('content',target.anchor);
    document.dispatchEvent(new CustomEvent(target.event,{detail:{workspace:state.workspace,prompt:brief.prompt,channel:brief.channel,format:brief.format,workflow_id:state.id,return_to:state.origin}}));
    status(state,'Brief opened in Content Creation. Return here to continue; your selections are retained.');
  }
  async function dispatch(state){
    if(state.busy)return;
    state.busy=true;status(state,'Preparing campaign drafts…');
    try{
      const result=await api(state,'dispatch',{...payload(state),origin_module:state.origin,correlation_id:state.id,idempotency_key:'campaign_'+state.id,
        reviewed_selection:{audience_ids:state.selected,asset_ids:state.assets},creative_briefs:state.briefs,content_drafts:state.drafts||[]});
      state.taskId=result.correlation_id;await reviewTask(state);
    }catch(error){recover(state,error,()=>state.taskId?reviewTask(state):dispatch(state));}
    finally{state.busy=false;}
  }
  async function reviewTask(state){
    try{
      const result=await api(state,'tasks?'+new URLSearchParams({workspace_id:state.workspace,correlation_id:state.taskId}));
      const task=result.task;state.task=task;
      beginStep(state,task.status==='draft_ready'?'Draft ready for review':'Campaign progress');
      for(const step of task.step_history||[])state.body.append(node('p',step.detail));
      const audience=task.audience_snapshot;
      if(audience)state.body.append(node('p',`Requested ${audience.requested_count ?? 'not specified'} · Selected ${audience.total_count} · Missing ${audience.missing_count || 0}`));
      const references=node('details');references.append(node('summary','Selected records and saved versions'));
      for(const contact of audience?.contacts||[])references.append(node('p',`${contact.name} · ${contact.selection_id || contact.id}`));
      for(const ref of task.artifact_refs||[])references.append(node('p',`${ref.kind}: ${ref.id}${ref.version?' · version '+ref.version:''}`));state.body.append(references);
      for(const [channel,entry] of Object.entries(task.channel_draft_versions||{})){
        const draft=entry.versions.at(-1),panel=node('section');panel.className='m360-campaign-brief';panel.append(node('h4',`${channel} · v${draft.version} · ${draft.status==='approved'?'Approved':'Review required'}`));state.body.append(panel);
        let subject=draft.subject||'',body=draft.body||'',preview=draft.preview_text||'';
        field(panel,'Subject',subject,value=>subject=value);field(panel,'Preview text',preview,value=>preview=value);field(panel,'Editable '+channel+' draft',body,value=>body=value,true).maxLength=draft.limit||5500;
        const feedback=node('p');feedback.setAttribute('role','status');panel.append(feedback);
        const save=button(panel,'Save new draft version',async()=>{
          save.disabled=true;
          try{await api(state,'revise',{correlation_id:state.taskId,channel,version_hash:draft.version_hash,manual_edit:{subject,body,preview_text:preview}});await reviewTask(state);}catch(error){feedback.textContent=error.message;}finally{save.disabled=false;}
        });
        const approve=button(panel,'Approve this exact version',async()=>{
          if(subject!==(draft.subject||'')||body!==(draft.body||'')||preview!==(draft.preview_text||'')){feedback.textContent='Save edits as a new version before approving.';return;}
          approve.disabled=true;
          try{await api(state,'approve',{correlation_id:state.taskId,channel,version_hash:draft.version_hash});await reviewTask(state);}catch(error){feedback.textContent=error.message;}finally{approve.disabled=false;}
        },!state.resources.can_approve||draft.status==='approved');
      }
      if(!['draft_ready','failed'].includes(task.status)){
        status(state,'Draft preparation in progress.');button(state.body,'Refresh progress',()=>reviewTask(state));
        clearTimeout(state.poll);state.poll=setTimeout(()=>{if(valid(state))reviewTask(state);},1500);
      }else status(state,task.status==='failed'?'Draft preparation failed. Completed work is retained.':'Draft ready for review');
      if(task.status==='failed')button(state.body,'Retry incomplete campaign step',async()=>{
        try{await api(state,'retry',{correlation_id:state.taskId});await reviewTask(state);}catch(error){recover(state,error,()=>reviewTask(state));}
      });
      button(state.body,'Open this campaign in Outreach',()=>{
        window.M360ActiveCampaign={workspace_id:state.workspace,correlation_id:state.taskId,channel:state.answers.channels[0]};
        document.dispatchEvent(new CustomEvent('m360:campaign-prepared',{detail:window.M360ActiveCampaign}));window.Matrix360Router?.navigateToPage('marketing','#m360-channels-section');
      });
      state.body.append(node('p','Next: exact-version approval, then consent and provider checks in Outreach. Provider acceptance is not verified delivery.'));
    }catch(error){recover(state,error,()=>reviewTask(state));}
  }
  function open(prompt,{origin='overview',mode='campaign'}={}){
    if(!auth()||!workspace())throw Error('Sign in and select an authorized workspace.');
    const existing=flows.get(origin);
    if(existing&&valid(existing)){
      if(!existing.panel.isConnected)(origin==='overview'?$('m360-control-output'):origin==='leads'?$('leads'):$('marketing-centre')).append(existing.panel);
      status(existing,'Your existing campaign is retained. Continue below or start a separate brief.');
      if(prompt!==existing.prompt)button(existing.body,'Start this as a separate campaign',()=>{existing.controller.abort();clearTimeout(existing.poll);existing.panel.remove();flows.delete(origin);open(prompt,{origin,mode});});
      return existing;
    }
    const parent=origin==='overview'?$('m360-control-output'):origin==='leads'?$('leads'):$('m360-conversation-form')?.parentElement||$('marketing-centre');
    if(!parent)throw Error('Campaign workspace is not ready. Your brief is retained.');
    const panel=node('article');panel.className='m360-campaign-workspace';panel.dataset.origin=origin;
    const heading=node('h2',mode==='leads'?'Audience workspace':'Campaign workspace'),statusNode=node('p'),body=node('div');statusNode.setAttribute('role','status');statusNode.setAttribute('aria-live','polite');
    panel.append(heading,statusNode,body);parent.append(panel);
    const state={id:crypto.randomUUID(),origin,mode,workspace:workspace(),auth:auth(),prompt,answers:{},selected:[],assets:[],briefs:[],panel,body,status:statusNode,controller:new AbortController(),busy:false,discoveryRevision:0};
    flows.set(origin,state);inspect(state);return state;
  }
  function clear(origin){for(const state of flows.values()){if(typeof origin==='string'&&state.origin!==origin)continue;state.controller.abort();clearTimeout(state.poll);state.panel.remove();flows.delete(state.origin);}}
  for(const name of ['m360:workspace-changing','m360:session-ended'])document.addEventListener(name,clear);
  document.addEventListener('m360:library-updated',event=>{for(const state of flows.values())if(valid(state)&&event.detail?.workspace===state.workspace)status(state,'New creative is saved. Refresh saved assets to select its exact version.');});
  document.addEventListener('m360:content-draft-ready',event=>{for(const state of flows.values())if(valid(state)&&event.detail?.workspace===state.workspace&&event.detail?.workflow_id===state.id){
    const draft=event.detail;if(!state.answers.channels.includes(draft.channel)||typeof draft.body!=='string')continue;
    state.drafts=[...(state.drafts||[]).filter(item=>item.channel!==draft.channel),{channel:draft.channel,body:draft.body,subject:draft.subject||'',preview_text:draft.preview_text||''}];
    creative(state);status(state,draft.channel+' draft returned for review. No approval or publishing was performed.');
  }});
  document.addEventListener('m360:page-changed',()=>{for(const state of flows.values())if(!valid(state)){state.controller.abort();state.panel.remove();flows.delete(state.origin);}});
  window.M360CampaignWorkspace={open,clear};
})();
