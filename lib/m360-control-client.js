'use strict';
module.exports = '(' + function (resolveOverviewIntent,leadSearchContext) {
  'use strict';
  const $ = id => document.getElementById(id);
  const names = {lead_pipeline:'Leads & Pipeline',content_creation:'Content Creation',marketing_activation:'Outreach'};
  let epoch = 0, controller, session = '', toastTimer, activeEngine='';
  const token = () => {
    try { return Number(sessionStorage.getItem('matrix360_pilot_expires_at')) > Date.now() ? sessionStorage.getItem('matrix360_pilot_token') : null; }
    catch { return null; }
  };
  const workspace = () => $('workspace')?.value || '';
  function mount() {
    if ($('m360-overview-control')) return;
    const top = $('m360-mp-topbar');
    if (!top) return;
    const root = document.createElement('section');
    root.id = 'm360-overview-control';
    root.setAttribute('data-m360-page','dashboard');
    root.setAttribute('aria-labelledby','m360-control-title');
    root.innerHTML = `<style>
#m360-mp-dashboard-hub .m360cc-wrap,.workspace-nav,#m360-sidebar-mp-nav{display:none!important}
#m360-overview-control{box-sizing:border-box;min-height:62vh;padding:clamp(20px,3vw,38px);margin:18px 0 28px;border:1px solid #9fb9b0;border-top:4px solid #176451;border-radius:16px;background:#f6faf8;color:#163c32;overflow-wrap:anywhere}
#m360-overview-control *{box-sizing:border-box;min-width:0}#m360-overview-control h2{font-size:clamp(24px,3vw,34px);margin:4px 0 18px}#m360-overview-control textarea{display:block;width:100%;min-height:130px;padding:16px;margin:12px 0;border:1px solid #708d82;border-radius:10px;background:white;color:#173b31;font:inherit;resize:vertical}#m360-overview-control button{padding:10px 15px;border:1px solid #729286;border-radius:8px;background:#fff;color:#173b31;cursor:pointer;font:inherit;white-space:normal}#m360-overview-control button:disabled{opacity:.6;cursor:wait}#m360-overview-control button:focus-visible,#m360-overview-control textarea:focus-visible,#m360-overview-control input:focus-visible{outline:3px solid #146bad;outline-offset:3px}#m360-overview-control .primary{background:#155b49;color:white}#m360-control-suggestions{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}#m360-control-output{display:grid;gap:16px}#m360-control-output article{padding:22px;background:white;border:1px solid #c1d3cb;border-radius:14px;box-shadow:0 8px 24px rgba(15,76,69,.06)}#m360-control-output p{white-space:pre-wrap}#m360-control-status{display:flex;align-items:center;gap:9px;font-weight:650;min-height:24px}#m360-control-context{font-size:13px}.m360-control-spinner{width:17px;height:17px;border:2px solid #a7c5ba;border-top-color:#155b49;border-radius:50%;animation:m360-spin .75s linear infinite}.m360-control-summary{font-size:1.05rem;line-height:1.55}.m360-control-questions{display:grid;gap:12px;margin-top:18px}.m360-control-question{display:grid;gap:8px;padding:15px;border-radius:14px 14px 14px 4px;background:#edf6f2}.m360-control-question label{font-weight:700}.m360-control-question input{width:100%;padding:11px 12px;border:1px solid #8aa99e;border-radius:9px;background:#fff;color:#173b31;font:inherit}.m360-control-essentials{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin:18px 0}.m360-control-essential{padding:14px;border-radius:11px;background:#edf6f2}.m360-control-essential strong{display:block;margin-bottom:5px}.m360-control-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.m360-control-progress{display:flex;align-items:center;gap:10px;padding:14px;margin-top:16px;border-radius:11px;background:#eef7ff;color:#174c73}.m360-control-progress[data-running="false"]{background:#edf8f1;color:#17603d}.m360-control-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.m360-control-option{padding:14px;border:1px solid #d5e4de;border-radius:11px}.m360-control-details{margin-top:18px;color:#49675d}.m360-control-toast{position:fixed;right:22px;bottom:22px;z-index:2147483000;max-width:min(420px,calc(100vw - 44px));padding:16px 18px;border-radius:12px;background:#123d33;color:white;box-shadow:0 16px 40px rgba(0,0,0,.24)}.m360-control-toast[data-tone="error"]{background:#7f1d1d}.m360-control-toast[data-tone="success"]{background:#14532d}@keyframes m360-spin{to{transform:rotate(360deg)}}@media(max-width:760px){#m360-overview-control{min-height:0;padding:20px}.m360-control-toast{right:14px;bottom:14px}}
</style><h2 id="m360-control-title">Ask Matrix360</h2><form id="m360-control-form"><label for="m360-control-prompt">Your question or task</label><textarea id="m360-control-prompt" minlength="3" maxlength="2500" required placeholder="Describe your objective, target audience and preferred region."></textarea><button class="primary" id="m360-control-submit" type="submit">Ask Matrix360</button><button id="m360-control-cancel" type="button" hidden>Cancel request</button></form><div id="m360-control-suggestions" aria-label="Suggested prompts"></div><p id="m360-control-context">Drafting does not contact your audience. Sending or publishing requires a separate review and explicit approval.</p><p id="m360-control-status" role="status" aria-live="polite"><span id="m360-control-spinner" class="m360-control-spinner" hidden></span><span id="m360-control-status-text">Ready when you are.</span></p><div id="m360-control-output"></div><div id="m360-control-toast" class="m360-control-toast" role="status" aria-live="polite" hidden></div>`;
    top.after(root);
    for (const prompt of ['Find 10 prospects for my business.','Which market should I prioritize?','Plan a launch campaign.','Create content for my target audience.','Create a reel for my business.']) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = prompt;
      button.addEventListener('click', () => { $('m360-control-prompt').value = prompt; $('m360-control-prompt').focus(); });
      $('m360-control-suggestions').append(button);
    }
    $('m360-control-form').addEventListener('submit', analyse);
    $('m360-control-cancel').addEventListener('click',async()=>{
      const marketing=activeEngine==='marketing';
      epoch++;controller?.abort();$('m360-control-submit').disabled=false;$('m360-control-cancel').hidden=true;
      const progress=$('m360-engine-progress');if(progress){progress.dataset.running='false';progress.textContent='Cancellation requested.';}
      setStatus('Cancellation requested.');
      if(window.M360LeadsSubAgent?.getState()?.running)await window.M360LeadsSubAgent.cancelDiscovery();
      setStatus(marketing?'Stopped waiting. An accepted campaign draft may still finish.':activeEngine==='lead'?'Search cancelled. Available results remain in Leads & Pipeline.':'Request cancelled.');
    });
    $('workspace')?.addEventListener('change', reset);
    syncVisibility();
  }
  function setStatus(text, busy = false) {
    if ($('m360-control-status-text')) $('m360-control-status-text').textContent = text;
    if ($('m360-control-spinner')) $('m360-control-spinner').hidden = !busy;
  }
  function notify(message, tone = 'info') {
    const toast = $('m360-control-toast');
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.dataset.tone = tone;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, tone === 'success' ? 10000 : 7000);
  }
  function reset() {
    if($('m360-control-cancel'))$('m360-control-cancel').hidden=true;
    epoch++; controller?.abort();
    $('m360-control-output')?.replaceChildren();
    window.M360LeadsSubAgent?.render();
    if ($('m360-control-prompt')) $('m360-control-prompt').value = '';
    if ($('m360-control-submit')) $('m360-control-submit').disabled = false;
    setStatus('Ready when you are.');
  }
  function syncVisibility() {
    const root = $('m360-overview-control'); if (!root) return;
    const page = window.Matrix360Router?.resolveInitialPage() || new URLSearchParams(location.search).get('page') || location.pathname.split('/')[1] || 'dashboard';
    root.style.display = !token() || ['leads','content','marketing'].includes(page) ? 'none' : '';
    if (session !== token()) { session = token(); reset(); }
  }
  function paragraph(parent, label, value) {
    if (!value || (Array.isArray(value) && !value.length)) return;
    const heading = document.createElement('h4'); heading.textContent = label; parent.append(heading);
    if (Array.isArray(value)) { const list = document.createElement('ul'); value.forEach(text => {const item=document.createElement('li');item.textContent=text;list.append(item);});parent.append(list); }
    else {const p=document.createElement('p');p.textContent=value;parent.append(p);}
  }
  function essential(parent, label, value) {
    if (!value) return;
    const item = document.createElement('div'); item.className = 'm360-control-essential';
    const heading = document.createElement('strong'); heading.textContent = label;
    const text = document.createElement('span'); text.textContent = value;
    item.append(heading,text); parent.append(item);
  }
  function renderClarifications(parent, questions) {
    const form = document.createElement('form'); form.className = 'm360-control-questions';
    questions.forEach((question,index) => {
      const bubble = document.createElement('div'); bubble.className = 'm360-control-question';
      const label = document.createElement('label'); label.htmlFor = 'm360-clarification-'+index; label.textContent = question;
      const input = document.createElement('input'); input.id = label.htmlFor; input.name = 'answer-'+index; input.required = true; input.maxLength = 300; input.placeholder = 'Type your answer';
      bubble.append(label,input); form.append(bubble);
    });
    const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'primary'; submit.textContent = 'Continue'; form.append(submit);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const original = $('m360-control-prompt').value.trim();
      const answers = questions.map((question,index) => question+': '+form.elements['answer-'+index].value.trim());
      $('m360-control-prompt').value = original+'\n'+answers.join('\n');
      $('m360-control-form').requestSubmit();
    });
    parent.append(form);
  }
  function renderResponse(data, ws, auth) {
    const output = $('m360-control-output'), card = document.createElement('article'); output.append(card);
    const handover = data.engine_handover, engineName = names[handover.primary_engine];
    const title = document.createElement('h3');
    title.textContent = data.category === 'clarification_required'
      ? 'Quick questions'
      : data.category === 'unsupported'
        ? 'I could not route that request'
        : handover.required && engineName
          ? 'Your request is ready for '+engineName
          : 'Here is what matters';
    card.append(title);
    const summary = document.createElement('p'); summary.className = 'm360-control-summary';
    const answer = data.answer || data.recommendation.summary;
    summary.textContent = data.missing_information.length ? 'Answer these so I can find the right matches.' : data.recommendation.summary; card.append(summary);
    if (!data.missing_information.length) {
      const full = document.createElement('details'), label = document.createElement('summary'), text = document.createElement('p');
      label.textContent = 'Open full answer'; text.textContent = answer; full.append(label,text); card.append(full);
      const steps = document.createElement('ol'); steps.className = 'm360-control-options'; steps.setAttribute('aria-label','Campaign plan');
      data.next_actions.slice(0,6).forEach((action,index)=>{const step=document.createElement('li');step.className='m360-control-option';const number=document.createElement('strong');number.textContent='Step '+(index+1);step.append(number);const description=document.createElement('p');description.textContent=action;step.append(description);steps.append(step);});
      if(data.next_actions.length)card.append(steps);
    }
    if (data.missing_information.length) renderClarifications(card,data.missing_information);
    if (handover.required && engineName) {
      const essentials = document.createElement('div'); essentials.className = 'm360-control-essentials'; card.append(essentials);
      essential(essentials,'Assigned to',engineName);
      essential(essentials,'Task',handover.task_summary);
      essential(essentials,'Expected result',handover.expected_outputs.slice(0,2).join(' - '));
      const progress = document.createElement('div'); progress.id = 'm360-engine-progress'; progress.className = 'm360-control-progress'; progress.dataset.running = 'false';
      progress.textContent = 'Review the brief before opening '+engineName+'.';
      card.append(progress);
      const actions = document.createElement('div'); actions.className = 'm360-control-actions'; card.append(actions);
      const open = document.createElement('button'); open.type = 'button'; open.className = 'primary'; open.textContent = 'Open '+engineName;
      open.textContent='Review brief for '+engineName;
      open.addEventListener('click',()=>{
        const kind={lead_pipeline:'leads',content_creation:'content',marketing_activation:'outreach'}[handover.primary_engine];
        prepareBrief({kind},$('m360-control-prompt').value,ws,auth);open.disabled=true;
      }); actions.append(open);
      notify('Assigned to '+engineName+'. Open that page to follow the work.');
    } else if (!data.missing_information.length && data.category !== 'unsupported') {
      paragraph(card,'Recommendation',data.recommendation.summary);
      paragraph(card,'Why',data.recommendation.rationale || data.strategic_insight);
      if (data.options.length) {
        const options = document.createElement('div'); options.className = 'm360-control-options'; card.append(options);
        data.options.slice(0,3).forEach(option => {
          const item = document.createElement('div'); item.className = 'm360-control-option';
          paragraph(item,option.name,option.benefits.slice(0,2)); options.append(item);
        });
      }
      paragraph(card,'Next steps',data.next_actions.slice(0,4));
    }
    if (data.facts_used.length || data.assumptions.length) {
      const details = document.createElement('details'); details.className = 'm360-control-details';
      const label = document.createElement('summary'); label.textContent = 'Context used'; details.append(label);
      paragraph(details,'Verified workspace facts',data.facts_used); paragraph(details,'Assumptions to review',data.assumptions); card.append(details);
    }
    return handover;
  }
  async function startLeadEngine(message) {
    activeEngine='lead';
    const agent = window.M360LeadsSubAgent, progress = $('m360-engine-progress');
    if (!agent || typeof agent.executeFromMasterAgent !== 'function') {
      setStatus('Lead Generator is unavailable. Your brief is still here. Reload the page and try again.');
      return;
    }
    const runEpoch=epoch;
    let completionShown = false;
    const update = (status, state) => {
      if(runEpoch!==epoch)return;
      const displayStatus = status;
      const count = state.leads?.length || 0, target = state.targetLimit;
      if (progress) {
        progress.dataset.running = String(Boolean(state.running));
        progress.textContent = state.running
          ? `Lead engine working - ${count}${target?' of '+target:''} leads found. Follow progress in Leads & Pipeline.`
          : displayStatus;
      }
      if (state.running) setStatus(target ? `Lead search running. ${count} of ${target} leads found.` : 'Starting prospect search…',true);
      else if (!completionShown) {
        completionShown = true;
        const success = ['completed','partial_success'].includes(state.overallStatus) || count > 0;
        setStatus(displayStatus);
        notify(displayStatus,success?'success':'info');
      }
    };
    setStatus('Lead engine starting...',true);
    const search = agent.executeFromMasterAgent(message,update);
    // Progress remains on Overview; opening the specialist is a separate choice.
    const result = await search;
    if (runEpoch === epoch && !result && !completionShown) setStatus(agent.getStatus());
  }
  const destinations={
    reel:{label:'Reel storyboard',page:'content',anchor:'#m360-storyboard',target:'m360-storyboard-brief',event:'m360:reel-brief'},
    image:{label:'Image studio',page:'content',anchor:'#m360-ai-post-studio',target:'m360-ai-post-prompt',event:'m360:content-brief'},
    copy:{label:'Channel copy',page:'content',anchor:'#creative-studio',target:'creative-prompt',event:'m360:copy-brief'},
    outreach:{label:'Outreach draft',page:'marketing',anchor:'#marketing-centre',target:'m360-conversation-input',event:'m360:outreach-brief'},
    leads:{label:'Leads & Pipeline',action:'Start prospect search'},
    research:{label:'Market Research',action:'Run market research'},
    campaign_plan:{label:'launch plan',action:'Build launch plan'},
    email_workflow:{label:'Email campaign workflow',action:'Start Email campaign workflow'}
  };
  function prepareBrief(intent,message,ws,auth){
    const card=document.createElement('article');
    const destination=destinations[intent.kind];
    const title=document.createElement('h3');
    title.textContent=destination?'Review brief for '+destination.label:'Choose the kind of content you want';
    const description=document.createElement('p');
    description.textContent=intent.kind==='leads'?'Review the prospect type and location, then select Start prospect search. Leads & Pipeline will open to show progress.':destination?'Edit this brief before continuing.':'Choose a reel, an image or written copy. Your brief will go to that tool.';
    if(intent.kind==='leads')card.id='m360-lead-review';
    const field=document.createElement('textarea');
    field.id='m360-overview-brief';field.maxLength=2300;field.rows=4;
    field.value=message.slice(0,field.maxLength);
    const label=document.createElement('label');label.htmlFor=field.id;label.textContent='Editable brief';
    const actions=document.createElement('div');actions.className='m360-control-actions';
    card.append(title,description,label,field,actions);
    $('m360-control-output').append(card);
    const options=destination?[intent.kind]:['reel','image','copy'];
    for(const kind of options){
      const target=destinations[kind],button=document.createElement('button');
      const startEmail=kind==='outreach'&&(!intent.channel||intent.channel==='Email');
      let emailReady=false;
      button.type='button';button.className='primary';button.textContent=startEmail?'Create campaign draft':target.action||'Open '+target.label;
      button.addEventListener('click',async()=>{
        if(ws!==workspace()||auth!==token()||!card.isConnected)return;
        const prompt=field.value.trim();
        if(!prompt){setStatus('Enter a brief before continuing.');field.focus();return;}
        if(window.M360CampaignWorkspace&&['outreach','leads','campaign_plan','email_workflow'].includes(kind)){
          window.M360CampaignWorkspace.open(prompt,{origin:'overview',mode:kind==='leads'?'leads':'campaign'});setStatus('Questions and review will stay here.');return;
        }
        if(kind==='leads'){
          const search=leadSearchContext(prompt);
          if(search.missing){setStatus('Add '+search.missing.toLowerCase()+' before starting the search.');field.focus();return;}
          button.disabled=true;
          $('m360-control-cancel').hidden=false;
          try{await startLeadEngine(prompt);}
          catch(error){if(ws===workspace()&&auth===token())setStatus(error.message);}
          finally{if(card.isConnected){button.disabled=false;$('m360-control-cancel').hidden=true;}}
          return;
        }
        if(['research','campaign_plan','email_workflow'].includes(kind)){
          if(!window.M360CampaignAgent){setStatus('Market Research is unavailable. Your brief remains here.');return;}
          const runEpoch=epoch;
          controller=new AbortController();
          activeEngine=kind==='email_workflow'?'marketing':'research';
          button.disabled=true;
          $('m360-control-submit').disabled=true;
          $('m360-control-cancel').hidden=false;
          try{
            await window.M360CampaignAgent.run(prompt,{mode:kind,signal:controller.signal,onProgress:message=>{
              if(runEpoch===epoch)setStatus(message,true);
            }});
          }catch(error){if(runEpoch===epoch)setStatus(error.message);}
          finally{
            if(runEpoch===epoch){
              $('m360-control-spinner').hidden=true;
              $('m360-control-submit').disabled=false;
              $('m360-control-cancel').hidden=true;
            }
            if(card.isConnected)button.disabled=false;
          }
          return;
        }
        if(startEmail){
          if(emailReady){window.Matrix360Router?.navigateToPage('marketing','#marketing-centre');return;}
          if(!window.M360Outreach){setStatus('Outreach is unavailable. Your brief remains here.');return;}
          button.disabled=true;setStatus('Preparing your email campaign draft…',true);
          try{
            const result=await window.M360Outreach.prepareCampaign(prompt,'Email',ws);
            if(ws!==workspace()||auth!==token()||!card.isConnected)return;
            if(result.status==='clarification_required'){
              setStatus('What should the campaign be about?');field.focus();return;
            }
            setStatus('Email campaign draft ready to review.');
            button.textContent='Review email draft';
            emailReady=true;
          }catch(error){if(card.isConnected)setStatus(error.message);}
          finally{button.disabled=false;}
          return;
        }
        if(!$(target.target)||!window.Matrix360Router?.navigateToPage){
          setStatus(target.label+' is unavailable. Your editable brief is still here.');return;
        }
        if(kind==='copy'&&intent.channel&&!Array.from($('creative-platform')?.options||[]).some(option=>option.value===intent.channel)){
          setStatus('Channel copy for '+intent.channel+' is unavailable in Content Creation. Your brief remains here.');return;
        }
        const limit=$(target.target).maxLength;
        if(limit>0&&prompt.length>limit){setStatus('Shorten the brief to '+limit+' characters for '+target.label+'.');field.focus();return;}
        window.Matrix360Router.navigateToPage(target.page,target.anchor);
        document.dispatchEvent(new CustomEvent(target.event,{detail:{workspace:ws,prompt,channel:intent.channel||'',format:kind}}));
        setStatus('Brief opened in '+target.label+'. Review it there before generating or sending.');
      });
      actions.append(button);
    }
    if(intent.kind==='leads')window.M360LeadsSubAgent?.render();
    setStatus(intent.kind==='leads'?'Lead brief ready. Start the search after reviewing it.':destination?'Brief ready to review.':'Choose a content format to continue.');
  }

  async function analyse(event) {
    event.preventDefault();
    const auth = token(), ws = workspace(), message = $('m360-control-prompt').value.trim();
    if (!auth || !ws) { setStatus('Sign in and select an authorized business.'); return; }
    const current = ++epoch; controller?.abort(); controller = new AbortController();
    activeEngine='';
    $('m360-control-cancel').hidden=false;
    $('m360-control-submit').disabled = true; $('m360-control-output').replaceChildren();
    window.M360LeadsSubAgent?.render();
    setStatus('Understanding your request...',true);
    const requestController = controller;
    // Allow two 15-second CRM checks, profile loading and the 45-second AI deadline.
    const timer = setTimeout(() => requestController.abort(), 90000);
    try {
      const intent=resolveOverviewIntent(message);
      if(['outreach','email_workflow','campaign_plan'].includes(intent.kind) && window.M360CampaignWorkspace){
        window.M360CampaignWorkspace.open(message,{origin:'overview'});setStatus('Campaign questions and review will stay here.');return;
      }
      if(intent.kind==='leads' && window.M360CampaignWorkspace){
        window.M360CampaignWorkspace.open(message,{origin:'overview',mode:'leads'});setStatus('Review saved audience before discovery.');return;
      }
      if(intent.kind==='leads'){
        const search=leadSearchContext(message);
        if(search.missing){
          const card=document.createElement('article');card.id='m360-lead-review';
          const heading=document.createElement('h3');heading.textContent='Where should I look for prospects?';card.append(heading);
          const questions=[];
          if(!search.query)questions.push('Type of prospects or industry focus');
          if(!search.location)questions.push('Target location for prospect search');
          renderClarifications(card,questions);
          $('m360-control-output').append(card);
          window.M360LeadsSubAgent?.render();
          setStatus('Complete the missing prospect details before searching.');
        }else prepareBrief(intent,message,ws,auth);
        return;
      }
      if(['reel','image','copy','content','outreach','research','campaign_plan','email_workflow'].includes(intent.kind)){
        prepareBrief(intent,message,ws,auth);return;
      }
      const response = await fetch('/api/control-center',{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify({message,workspace_id:ws,conversation_id:null,page_context:'overview',requested_mode:'auto'}),signal:controller.signal,cache:'no-store'});
      const data = await response.json();
      if (current !== epoch || auth !== token() || ws !== workspace()) return;
      if (!response.ok) throw Error(data.message || 'Matrix360 assistant is unavailable.');
      const handover = renderResponse(data,ws,auth);
      if (data.category === 'unsupported') setStatus('This request is outside the available engines.');
      else if (data.category === 'clarification_required' || data.missing_information.length) setStatus('Add the missing detail, then try again.');
      else if(handover.required&&names[handover.primary_engine])setStatus('Answer ready. Review the specialist brief to continue.');
      else setStatus('Ready.');
    } catch (error) {
      if (current===epoch) {
        const messageText=error.name==='AbortError'?'The request timed out. Please retry.':error.message;
        setStatus(messageText); notify(messageText,'error');
      }
    } finally {clearTimeout(timer);if(current===epoch){$('m360-control-submit').disabled=false;$('m360-control-cancel').hidden=true;}}
  }
  document.addEventListener('m360:session-ended',reset);
  document.addEventListener('m360:workspace-changing',reset);
  document.addEventListener('m360:page-changed',syncVisibility);
  window.addEventListener('popstate',syncVisibility);
  window.addEventListener('hashchange',syncVisibility);
  window.addEventListener('pageshow',syncVisibility);
  document.addEventListener('visibilitychange',syncVisibility);
  setInterval(syncVisibility, 1000);
  document.addEventListener('click',()=>queueMicrotask(syncVisibility));
  const observer=new MutationObserver(()=>{mount();syncVisibility();});
  observer.observe(document.body,{childList:true,subtree:true});
  mount();
}.toString() + ')(' + require('./m360-overview-intent').toString() + ',' + require('./m360-workspace-context').leadSearchContext.toString() + ');';
