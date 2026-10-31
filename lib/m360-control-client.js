'use strict';
module.exports = '(' + function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const routes = {lead_pipeline:'/leads', content_creation:'/content', marketing_activation:'/marketing'};
  const names = {lead_pipeline:'Leads & Pipeline',content_creation:'Content Creation',marketing_activation:'Marketing'};
  let epoch = 0, controller, draft = null, session = '', reviewed = false, toastTimer, activeEngine='';
  const token = () => {
    try { return Number(sessionStorage.getItem('matrix360_pilot_expires_at')) > Date.now() ? sessionStorage.getItem('matrix360_pilot_token') : null; }
    catch { return null; }
  };
  const workspace = () => $('workspace')?.value || '';
  function removeLeftNavigation() {
    $('m360-sidebar-mp-nav')?.remove();
    document.querySelectorAll('.workspace-nav').forEach(nav => nav.style.setProperty('display','none','important'));
  }
  function mount() {
    removeLeftNavigation();
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
</style><p>YOUR MATRIX360 ASSISTANT</p><h2 id="m360-control-title">What would you like to achieve?</h2><p>Describe the outcome. Matrix360 will answer directly, route specialist work, and show progress here.</p><form id="m360-control-form"><label for="m360-control-prompt">Your question or task</label><textarea id="m360-control-prompt" minlength="3" maxlength="2500" required placeholder="Example: Find three verified dentists in Kolkata"></textarea><button class="primary" id="m360-control-submit" type="submit">Ask Matrix360</button><button id="m360-control-cancel" type="button" hidden>Cancel request</button></form><div id="m360-control-suggestions" aria-label="Suggested prompts"></div><p id="m360-control-context">Your request uses only this authorized workspace. Nothing is published or sent externally from this page.</p><p id="m360-control-status" role="status" aria-live="polite"><span id="m360-control-spinner" class="m360-control-spinner" hidden></span><span id="m360-control-status-text">Ready when you are.</span></p><div id="m360-control-output"></div><div id="m360-control-toast" class="m360-control-toast" role="status" aria-live="polite" hidden></div>`;
    top.after(root);
    for (const prompt of ['Find 10 prospects for my business.','Which market should I prioritize?','Plan a launch campaign.','Create content for my target audience.']) {
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
      setStatus(marketing?'Stopped waiting. A campaign draft already accepted by the server may still finish; nothing was sent.':'Request cancelled. Available lead results remain in Leads & Pipeline.');
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
    epoch++; controller?.abort(); draft = null; reviewed = false;
    $('m360-engine-draft')?.remove();
    $('m360-control-output')?.replaceChildren();
    if ($('m360-control-prompt')) $('m360-control-prompt').value = '';
    if ($('m360-control-submit')) $('m360-control-submit').disabled = false;
    setStatus('Ready when you are.');
  }
  function syncVisibility() {
    removeLeftNavigation();
    const root = $('m360-overview-control'); if (!root) return;
    const page = window.Matrix360Router?.resolveInitialPage() || new URLSearchParams(location.search).get('page') || location.pathname.split('/')[1] || 'dashboard';
    root.style.display = !token() || ['leads','content','marketing'].includes(page) ? 'none' : '';
    if (session !== token()) { session = token(); reset(); }
    const engineDraft = $('m360-engine-draft');
    if (engineDraft) engineDraft.hidden = !token() || !reviewed || !routes[engineDraft.dataset.engine] || routes[engineDraft.dataset.engine].slice(1) !== page;
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
  function openEngine(engine, handover, ws, auth) {
    if (!draft || ws !== workspace() || auth !== token()) return;
    const page = routes[engine]?.slice(1);
    const nav = document.querySelector('[data-m360-goto="'+page+'"]');
    if (!nav) { setStatus('That specialist page is unavailable. Your request remains here.'); return; }
    reviewed = true;
    showEngineDraft(handover,ws,auth);
    nav.click(); syncVisibility();
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
    summary.textContent = data.missing_information.length ? 'Answer these so I can find the right matches.' : data.answer || data.recommendation.summary; card.append(summary);
    if (data.missing_information.length) renderClarifications(card,data.missing_information);
    if (handover.required && engineName) {
      const essentials = document.createElement('div'); essentials.className = 'm360-control-essentials'; card.append(essentials);
      essential(essentials,'Assigned to',engineName);
      essential(essentials,'Task',handover.task_summary);
      essential(essentials,'Expected result',handover.expected_outputs.slice(0,2).join(' - '));
      const progress = document.createElement('div'); progress.id = 'm360-engine-progress'; progress.className = 'm360-control-progress'; progress.dataset.running = 'false';
      progress.textContent = handover.primary_engine === 'lead_pipeline' ? 'Delegating to the lead engine...' : 'Open '+engineName+' to continue with this prepared task.';
      card.append(progress);
      const actions = document.createElement('div'); actions.className = 'm360-control-actions'; card.append(actions);
      const open = document.createElement('button'); open.type = 'button'; open.className = 'primary'; open.textContent = 'Open '+engineName;
      open.addEventListener('click',()=>openEngine(handover.primary_engine,handover,ws,auth)); actions.append(open);
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
      if (progress) progress.textContent = 'Open Leads & Pipeline to start this request.';
      setStatus('Ready - Open Leads & Pipeline to continue.');
      return;
    }
    const runEpoch=epoch;
    let completionShown = false;
    const update = (status, state) => {
      if(runEpoch!==epoch)return;
      const displayStatus=state.overallStatus==='cancelled'?'Search cancelled.':state.overallStatus==='timed_out'?'Search time window ended. Available results are retained.':state.leads?.length?'Lead results are ready for review.':'Lead generation could not complete. Check your session and retry.';
      const count = state.leads?.length || 0, target = state.targetLimit;
      if (progress) {
        progress.dataset.running = String(Boolean(state.running));
        progress.textContent = state.running
          ? `Lead engine working - ${count}${target?' of '+target:''} leads found. Follow progress in Leads & Pipeline.`
          : displayStatus;
      }
      if (state.running) setStatus(`Lead engine working - ${count} of ${target} leads found.`,true);
      else if (!completionShown) {
        completionShown = true;
        const success = ['completed','partial_success'].includes(state.overallStatus) || count > 0;
        setStatus(success ? `Ready - ${count} lead${count === 1 ? '' : 's'} found.` : displayStatus);
        notify(success ? `${count} lead${count === 1 ? '' : 's'} ready. Open Leads & Pipeline to review them.` : displayStatus,success?'success':'error');
      }
    };
    setStatus('Lead engine starting...',true);
    const result = await agent.executeFromMasterAgent(message,update);
    if(runEpoch!==epoch)return;
    if (!result) {
      setStatus('A lead request is already running.',true);
      if (progress) { progress.dataset.running = 'true'; progress.textContent = 'A lead request is already running. Open Leads & Pipeline to follow it.'; }
    }
  }
  async function startMarketingEngine(message, handover, ws, auth) {
    activeEngine='marketing';
    const runEpoch=epoch;
    const progress = $('m360-engine-progress');
    if (progress) {
      progress.dataset.running = 'true';
      progress.textContent = 'Marketing engine working... Preparing campaign brief...';
    }
    setStatus('Marketing engine working...', true);
    try {
      const res = await fetch('/api/marketing/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth },
        signal:controller.signal,
        body: JSON.stringify({ workspace_id: ws, prompt: message, origin_module: 'overview' })
      });
      const result = await res.json();
      if(runEpoch!==epoch)return;
      if (!res.ok) throw new Error(result.error || 'Failed to dispatch marketing task');
      const corrId = result.correlation_id;
      window.M360ActiveCampaign = { correlation_id: corrId, channel: null };
      let done = false, pollCount = 0;
      while (!done && pollCount < 40) {
        pollCount++;
        await new Promise(r => setTimeout(r, 600));
        if (runEpoch!==epoch||ws !== workspace() || auth !== token()) break;
        const tRes = await fetch('/api/marketing/tasks?workspace_id=' + encodeURIComponent(ws) + '&correlation_id=' + encodeURIComponent(corrId), {
          headers: { Authorization: 'Bearer ' + auth }
        });
        if (tRes.ok) {
          const tData = await tRes.json();
          if(runEpoch!==epoch)return;
          const t = tData.task;
          if (t) {
            const step = t.status;
            const label = step === 'requesting_leads' ? 'Marketing requesting audience from Leads Engine...'
              : step === 'audience_received' ? 'Audience leads received. Requesting content from Studio...'
              : step === 'audience_empty' ? 'No CRM leads found. Proceeding with campaign positioning...'
              : step === 'requesting_content' ? 'Creative Studio assembling headlines & asset briefs...'
              : step === 'content_blocked' ? 'Creative brief created (visual assets pending). Assembling campaign package...'
              : step === 'assets_ready' ? 'Assets ready. Generating 10-channel campaign package...'
              : step === 'draft_ready' ? 'Campaign drafts & 3-gate readiness ready for review!'
              : step;
            if (progress) progress.textContent = label;
            if (step === 'draft_ready') {
              done = true;
              if (progress) {
                progress.dataset.running = 'false';
                progress.textContent = 'Marketing campaign package prepared. Open Marketing to review and launch.';
              }
              setStatus('Ready - Campaign drafts prepared in Marketing.');
              notify('Campaign drafts ready. Open Marketing to review them.', 'success');
            } else if (step === 'failed') {
              done = true;
              if (progress) { progress.dataset.running = 'false'; progress.textContent = 'Marketing task stopped.'; }
              setStatus('Marketing task stopped.');
            }
          }
        }
      }
    } catch {
      if(runEpoch!==epoch)return;
      if (progress) { progress.dataset.running = 'false'; progress.textContent = 'Open Marketing to continue with this prepared task.'; }
    }
  }
  async function analyse(event) {
    event.preventDefault();
    const auth = token(), ws = workspace(), message = $('m360-control-prompt').value.trim();
    if (!auth || !ws) { setStatus('Sign in and select an authorized business.'); return; }
    const current = ++epoch; controller?.abort(); controller = new AbortController(); draft = null; reviewed = false;
    activeEngine='';
    $('m360-engine-draft')?.remove();
    $('m360-control-cancel').hidden=false;
    $('m360-control-submit').disabled = true; $('m360-control-output').replaceChildren();
    setStatus('Understanding your request...',true);
    const requestController = controller;
    const timer = setTimeout(() => requestController.abort(), 60000);
    try {
      const response = await fetch('/api/control-center',{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify({message,workspace_id:ws,conversation_id:null,page_context:'overview',requested_mode:'auto'}),signal:controller.signal,cache:'no-store'});
      const data = await response.json();
      if (current !== epoch || auth !== token() || ws !== workspace()) return;
      if (!response.ok) throw Error(data.message || 'Matrix360 assistant is unavailable.');
      draft = data.handover_envelope;
      const handover = renderResponse(data,ws,auth);
      if (data.category === 'unsupported') setStatus('This request is outside the available engines.');
      else if (data.category === 'clarification_required' || data.missing_information.length) setStatus('Add the missing detail, then try again.');
      else if (handover.required && handover.primary_engine === 'lead_pipeline' && data.sub_agent_delegation === 'M360LeadsSubAgent') await startLeadEngine(message);
      else if (handover.required && (handover.primary_engine === 'marketing_activation' || data.sub_agent_delegation === 'M360MarketingSubAgent')) await startMarketingEngine(message, handover, ws, auth);
      else if(handover.required&&handover.primary_engine==='content_creation'){
        openEngine('content_creation',handover,ws,auth);
        document.dispatchEvent(new CustomEvent('m360:content-brief',{detail:{workspace:ws,prompt:message}}));
        setStatus('Content brief prepared. Confirm content-use permission in Content Creation before paid generation.');
      }
      else if (handover.required) setStatus('Ready - Open '+names[handover.primary_engine]+' to continue.');
      else setStatus('Ready.');
    } catch (error) {
      if (current===epoch) {
        const messageText=error.name==='AbortError'?'The request timed out. Please retry.':error.message;
        setStatus(messageText); notify(messageText,'error');
      }
    } finally {clearTimeout(timer);if(current===epoch){$('m360-control-submit').disabled=false;$('m360-control-cancel').hidden=true;}}
  }
  function showEngineDraft(handover, ws, auth) {
    $('m360-engine-draft')?.remove();
    const panel=document.createElement('section');panel.id='m360-engine-draft';panel.dataset.engine=handover.primary_engine;
    panel.setAttribute('data-m360-page',routes[handover.primary_engine].slice(1));
    panel.style.cssText='padding:24px;margin:18px 0;border:1px solid #9fb9b0;border-radius:12px;background:#f6faf8;color:#163c32;overflow-wrap:anywhere';
    paragraph(panel,'Task from Control Center',handover.task_summary);
    paragraph(panel,'Expected result',handover.expected_outputs);
    const back=document.createElement('button');back.type='button';back.textContent='Return to Control Center';panel.append(back);
    back.addEventListener('click',()=>{document.querySelector('[data-m360-goto="dashboard"]')?.click();syncVisibility();});
    $('m360-mp-topbar').after(panel);
  }
  document.addEventListener('m360:session-ended',reset);
  document.addEventListener('m360:workspace-changing',reset);
  window.addEventListener('popstate',syncVisibility);
  window.addEventListener('hashchange',syncVisibility);
  window.addEventListener('pageshow',syncVisibility);
  document.addEventListener('visibilitychange',syncVisibility);
  setInterval(syncVisibility, 1000);
  document.addEventListener('click',()=>queueMicrotask(syncVisibility));
  const observer=new MutationObserver(()=>{mount();syncVisibility();});
  observer.observe(document.body,{childList:true,subtree:true});
  mount();
}.toString() + ')();';
