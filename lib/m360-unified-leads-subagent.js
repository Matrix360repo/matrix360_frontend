if (typeof module !== 'undefined' && module.exports && typeof window === 'undefined') {
  module.exports = require('fs').readFileSync(__filename, 'utf8');
} else {
(function () {
  if (typeof window === 'undefined' || window.__M360_UNIFIED_LEADS_SUBAGENT_V2__) return;
  window.__M360_UNIFIED_LEADS_SUBAGENT_V2__ = true;

  const POLL_WINDOW_MINUTES = 15;

  var state = {
    running: false,
    uiState: 'Ready',
    overallStatus: 'idle',
    statusText: 'Ask the dashboard assistant to find leads.',
    lastPrompt: '',
    campaignId: '',
    checkpoint: '',
    mapsJobId: '',
    websiteJobId: '',
    targetLimit: 0,
    startError: '',
    engines: {
      maps: {
        status: 'pending',
        job_id: null,
        error_code: null,
        error_message: null,
        result_count: 0,
        completion_state: false
      },
      website: {
        status: 'pending',
        job_id: null,
        error_code: null,
        error_message: null,
        result_count: 0,
        completion_state: false
      }
    },
    leads: [],
    addedKeys: {},
    activePollAbort: null
  };

  function getClientScopeId() { return document.getElementById('workspace')?.value || ''; }
  function sessionToken(){try{return +sessionStorage.getItem('matrix360_pilot_expires_at')>Date.now()?sessionStorage.getItem('matrix360_pilot_token'):null;}catch{return null;}}
  function requestHeaders(){return {'Content-Type':'application/json',Authorization:'Bearer '+(sessionToken()||'')};}

  function clientStatus() {
    if(state.running)return 'Lead scraper engine is running.';
    if(!getClientScopeId()||!sessionToken())return 'Sign in and choose a workspace before searching.';
    if(state.overallStatus==='cancelled')return 'Lead search cancelled. Available results are retained.';
    if(state.overallStatus==='timed_out')return 'The search time window ended. Available results are retained.';
    if(state.leads.length && state.leads.length < state.targetLimit)return `Found ${state.leads.length} of ${state.targetLimit} requested leads that passed verification.`;
    if(state.leads.length)return state.leads.length+' leads found. Review contact information before outreach.';
    if(['completed','partial_success'].includes(state.overallStatus))return 'The search finished without verified matches. Try a different prospect type or area.';
    return state.startError || 'Lead search could not complete. Please retry shortly.';
  }

  function clean(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function esc(value) {
    return clean(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function leadKey(lead) {
    return [
      clean(lead.company_name || lead.name).toLowerCase(),
      clean(lead.phone).replace(/\D+/g, ''),
      clean(lead.email).toLowerCase(),
      clean(lead.website).toLowerCase()
    ].join('|');
  }

  function addLeadToPipeline(lead,expectedWorkspace,expectedAuth) {
    if(expectedWorkspace!==getClientScopeId()||expectedAuth!==sessionToken())return Promise.resolve(false);
    var key = leadKey(lead);
    if (!key || state.addedKeys[key]) return Promise.resolve(false);

    var name = clean(lead.company_name || lead.name);
    var sourceParts = [
      clean(lead.decision_maker),
      clean(lead.phone),
      clean(lead.email),
      clean(lead.website)
    ].filter(Boolean);
    var payload = {
      name: name,
      source: sourceParts.join(' | ').slice(0, 240),
      stage: 'enquiry'
    };
    const ws=getClientScopeId(),auth=sessionToken();if(!ws||!auth)return Promise.resolve(false);
    return fetch('/api/crm/workspaces/'+encodeURIComponent(ws)+'/leads', {
      method: 'POST',
      headers: requestHeaders(),
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        if(res.ok&&ws===getClientScopeId()&&auth===sessionToken())state.addedKeys[key]=true;
        return res.ok;
      })
      .catch(function () {
        return false;
      });
  }

  function refreshPipelineList() { document.getElementById('refresh')?.click();return Promise.resolve(); }

  function formatEngineBadge(engineState) {
    var st = clean(engineState && engineState.status) || 'pending';
    var count = Number(engineState && engineState.result_count) || 0;
    var errCode = clean(engineState && engineState.error_code);
    var errMsg = clean(engineState && engineState.error_message);
    var colorBg = '#f1f5f9';
    var colorFg = '#334155';
    if (st === 'running' || st === 'pending') {
      colorBg = '#e0f2fe';
      colorFg = '#0369a1';
    } else if (st === 'completed') {
      colorBg = '#dcfce7';
      colorFg = '#166534';
    } else if (st === 'failed' || st === 'timed_out') {
      colorBg = '#fef2f2';
      colorFg = '#991b1b';
    } else if (st === 'cancelled') {
      colorBg = '#fef3c7';
      colorFg = '#92400e';
    }
    return {
      status: st,
      count: count,
      errCode: errCode,
      errMsg: errMsg,
      colorBg: colorBg,
      colorFg: colorFg
    };
  }

  function renderPanel() {
    const section=document.getElementById('leads');if(!section)return;
    if(!document.getElementById('m360-leads-start')){
      const form=document.createElement('form');form.id='m360-leads-start';form.className='card';
      form.innerHTML='<h3>Plan an audience</h3><label for="m360-leads-brief">Who do you want to reach?</label><textarea id="m360-leads-brief" maxlength="2000" required placeholder="Find 10 manufacturers in Pune"></textarea><button type="submit" class="btn primary">Check existing leads and candidates</button><p role="status"></p>';
      form.addEventListener('submit',event=>{event.preventDefault();try{window.M360CampaignWorkspace.open(document.getElementById('m360-leads-brief').value,{origin:'leads',mode:'leads'});}catch(error){form.querySelector('[role="status"]').textContent=error.message;}});
      section.append(form);
    }
    const old=document.getElementById('m360-maps-scraper-panel');if(old)old.style.display='none';
    let panel=document.getElementById('m360-autonomous-leads-panel');
    if(!panel){panel=document.createElement('section');panel.id='m360-autonomous-leads-panel';panel.className='m360u';section.append(panel);}
    const review = !state.running && document.getElementById('m360-lead-review');
    const label = state.running ? 'Processing' : state.uiState === 'Ready' ? (review ? 'Awaiting review' : 'Ready') : state.overallStatus === 'cancelled' ? 'Cancelled' : state.overallStatus === 'failed' ? 'Unable to complete' : state.overallStatus === 'timed_out' ? 'Time limit reached' : state.leads.length ? 'Results ready' : 'No matches';
    const message = state.running ? (state.overallStatus === 'starting' ? 'Starting prospect search…' : 'Finding relevant leads. Results appear as they become available.') : state.overallStatus !== 'idle' ? clientStatus() : review ? 'Your lead request is in Control Center. Review it there to start the search.' : 'Describe your target prospects in Control Center.';
    const count = state.targetLimit ? `<strong>${state.leads.length} / ${state.targetLimit} found</strong>` : '';
    const reviewAction = review ? '<button type="button" class="btn" id="m360-lead-review-btn">Review lead request</button>' : '';
    const rows=state.leads.map(lead=>'<tr><td>'+esc(lead.company_name||lead.name)+'</td><td>'+esc(lead.decision_maker)+(lead.role?' · '+esc(lead.role):'')+'</td><td>'+[lead.phone,lead.email,lead.website].filter(Boolean).map(esc).join(' · ')+'</td><td>'+esc(lead.location)+'</td></tr>').join('');
    panel.innerHTML='<div class="m360u-row"><h3>Lead Generator</h3><span role="status" id="m360-orchestrator-ui-state">'+label+'</span>'+count+(state.running?'<button type="button" class="btn" id="m360-orchestrator-cancel-btn">Cancel search</button>':'')+'</div><p id="m360-orchestrator-status-text" role="status">'+esc(message)+'</p>'+reviewAction+(rows?'<div style="overflow:auto"><table><thead><tr><th>Lead</th><th>Contact person</th><th>Contact details</th><th>Location</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'');
    document.getElementById('m360-orchestrator-cancel-btn')?.addEventListener('click',cancelActiveDiscovery);
    document.getElementById('m360-lead-review-btn')?.addEventListener('click',()=>window.Matrix360Router?.navigateToPage('dashboard','#m360-lead-review'));
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function cancelActiveDiscovery() {
    const ws=getClientScopeId(),auth=sessionToken();
    state.activePollAbort=null;
    state.running = false;
    state.uiState = 'Cancelled';
    state.overallStatus = 'cancelled';
    state.statusText = 'Cancelling active lead discovery...';
    renderPanel();
    try {
      const res = await fetch('/api/unified-leads-agent?action=cancel', {
        method: 'POST',
        headers: requestHeaders(),
        body: JSON.stringify({ campaign_id: state.campaignId,checkpoint:state.checkpoint,workspace_id:getClientScopeId() })
      });
      const data = await res.json().catch(function () {
        return {};
      });
      if(ws!==getClientScopeId()||auth!==sessionToken())return;
      if (data && data.engines) state.engines = data.engines;
      if (Array.isArray(data.leads) && data.leads.length) {
        state.leads = data.leads;
      }
      state.uiState = data.ui_state || 'Cancelled';
      state.statusText =
        data.message || 'Lead discovery cancelled. Partial results have been preserved.';
    } catch (_) {
      state.uiState = 'Cancelled';
      state.statusText = 'Lead discovery cancelled.';
    }
    renderPanel();
  }

  async function runFromMaster(promptText, onProgress) {
    var prompt = String(promptText||'').trim();
    var ws=getClientScopeId(),auth=sessionToken();
    if(!ws||!auth){state.statusText='Sign in and choose a workspace before searching.';renderPanel();return null;}
    if (!prompt || state.running) return null;

    var myCampaignToken = 'run_' + Date.now();
    state.activePollAbort = myCampaignToken;
    state.running = true;
    state.lastPrompt = prompt;
    state.leads = [];
    state.checkpoint = '';
    state.targetLimit = 0;
    state.startError = '';
    state.uiState = 'Processing';
    state.overallStatus = 'starting';
    state.statusText = 'Starting lead generation...';
    state.engines = {
      maps: {
        status: 'pending',
        job_id: null,
        error_code: null,
        error_message: null,
        result_count: 0,
        completion_state: false
      },
      website: {
        status: 'pending',
        job_id: null,
        error_code: null,
        error_message: null,
        result_count: 0,
        completion_state: false
      }
    };
    renderPanel();
    if (onProgress) onProgress(clientStatus(), state);

    try {
      var start = await fetch('/api/unified-leads-agent', {
        method: 'POST',
        headers: requestHeaders(),
        body: JSON.stringify({ prompt: prompt,workspace_id:getClientScopeId() })
      });
      var started = await start.json().catch(function () {
        return {};
      });

      if(ws!==getClientScopeId()||auth!==sessionToken())return null;
      if(state.activePollAbort!==myCampaignToken){
        if(started.campaign_id)await fetch('/api/unified-leads-agent?action=cancel',{method:'POST',headers:requestHeaders(),body:JSON.stringify({workspace_id:ws,campaign_id:started.campaign_id})}).catch(()=>{});
        return null;
      }
      if (started.engines) {
        state.engines = started.engines;
      }
      state.campaignId = clean(started.campaign_id);
      state.checkpoint = started.checkpoint || '';
      state.mapsJobId = clean(started.maps_job_id);
      state.websiteJobId = clean(started.website_job_id);
      state.targetLimit = Number(started.target_limit) || 0;
      state.uiState = clean(started.ui_state) || 'Both engines failed';
      state.overallStatus = clean(started.overall_status) || 'failed';

      // Proceed if EITHER Maps OR Website started
      var anyEngineStarted = Boolean(state.mapsJobId || state.websiteJobId);
      if (!start.ok || !anyEngineStarted) {
        state.running = false;
        state.uiState = clean(started.ui_state) || 'Both engines failed';
        state.statusText = clean(started.message) || 'Both lead engines failed to start.';
        if(start.status===401)state.startError='Your session expired. Sign in again before searching.';
        else if(start.status===403)state.startError='This workspace did not authorize the search. Check your workspace access.';
        else if(started.error_code==='LEAD_LIMIT_EXCEEDED')state.startError='Request up to 2,000 leads per search.';
        else if(start.status===422)state.startError='Check the prospect type and target location in your lead brief.';
        else state.startError='Lead discovery could not start. Try the request again shortly.';
        renderPanel();
        if (onProgress) onProgress(clientStatus(), state);
        return state;
      }

      state.statusText = clean(started.message) || state.uiState;
      renderPanel();
      if (onProgress) onProgress(clientStatus(), state);

      var pollDeadline = Date.now() + POLL_WINDOW_MINUTES * 60 * 1000;
      for (var attempt = 0; Date.now() < pollDeadline; attempt++) {
        if (!state.running || state.activePollAbort !== myCampaignToken) {
          break;
        }
        await wait(attempt === 0 ? 1500 : 4000);
        if (!state.running || state.activePollAbort !== myCampaignToken) {
          break;
        }

        if(ws!==getClientScopeId()||auth!==sessionToken())return null;
        var queryParams = new URLSearchParams({workspace_id:ws});
        if (state.campaignId) queryParams.set('campaign_id', state.campaignId);
        if (state.mapsJobId) queryParams.set('maps_job_id', state.mapsJobId);
        if (state.websiteJobId) queryParams.set('website_job_id', state.websiteJobId);

        var poll = await fetch('/api/unified-leads-agent?action=status', {
          method:'POST',cache:'no-store',headers:requestHeaders(),
          body:JSON.stringify({...Object.fromEntries(queryParams),checkpoint:state.checkpoint})
        });
        var data = await poll.json().catch(function () {
          return {};
        });
        if (!poll.ok) {
          throw new Error(data.message || 'Lead status check failed.');
        }

        if(ws!==getClientScopeId()||auth!==sessionToken()||state.activePollAbort!==myCampaignToken)return null;
        // Ignore stale poll responses from an older campaign
        if (data.campaign_id && state.campaignId && data.campaign_id !== state.campaignId) {
          continue;
        }

        if(data.checkpoint)state.checkpoint=data.checkpoint;
        if(data.website_job_id)state.websiteJobId=clean(data.website_job_id);
        if (data.engines) {
          state.engines = data.engines;
        }
        state.uiState = clean(data.ui_state) || state.uiState;
        state.overallStatus = clean(data.overall_status) || state.overallStatus;
        state.targetLimit = Number(data.target_limit) || state.targetLimit;
        state.leads = Array.isArray(data.leads) ? data.leads.slice(0,state.targetLimit) : state.leads;

        for (var i = 0; i < state.leads.length; i++) {
          await addLeadToPipeline(state.leads[i],ws,auth);
        }
        if (state.leads.length) await refreshPipelineList();

        state.statusText =
          clean(data.message) ||
          state.uiState + ' (' + state.leads.length + ' verified lead(s)).';
        renderPanel();
        if (onProgress) onProgress(clientStatus(), state);

        if (!data.running) {
          state.running = false;
          renderPanel();
          if (onProgress) onProgress(clientStatus(), state);
          return state;
        }
      }

      if (state.activePollAbort !== myCampaignToken) return null;
      // Polling loop exhausted while at least one engine was still running -> Timed out or Partial Success
      state.running = false;
      for (var engine of Object.values(state.engines)) {
        if (!engine.completion_state) {
          engine.status = 'timed_out';
          engine.error_code = 'POLLING_WINDOW_ENDED';
          engine.error_message = `No completion confirmed within ${POLL_WINDOW_MINUTES} minutes. The remote job may still be running.`;
        }
      }
      if (state.leads.length > 0) {
        state.uiState = 'Completed with partial results';
        state.overallStatus = 'partial_success';
        state.statusText =
          'Completed with partial results: ' +
          state.leads.length +
          ' lead(s) found before polling timeout. '+state.leads.filter(lead=>state.addedKeys[leadKey(lead)]).length+' confirmed in the pipeline.';
      } else {
        state.uiState = 'Timed out';
        state.overallStatus = 'timed_out';
        state.statusText = `No completion confirmed within ${POLL_WINDOW_MINUTES} minutes. Remote jobs may still be running; avoid starting duplicate searches.`;
      }
      renderPanel();
      if (onProgress) onProgress(clientStatus(), state);
      return state;
    } catch (err) {
      if(ws!==getClientScopeId()||auth!==sessionToken()||state.activePollAbort!==myCampaignToken)return null;
      state.running = false;
      if (state.leads.length > 0) {
        state.uiState = 'Completed with partial results';
        state.overallStatus = 'partial_success';
        state.statusText =
          'Completed with partial results (' +
          state.leads.length +
          ' lead(s) preserved): ' +
          clean(err && err.message ? err.message : 'Polling interrupted.');
      } else {
        state.uiState = 'Both engines failed';
        state.overallStatus = 'failed';
        state.statusText = clean(err && err.message ? err.message : 'Lead discovery failed.');
      }
      renderPanel();
      if (onProgress) onProgress(clientStatus(), state);
      return state;
    }
  }

  function clearWorkspaceState(){
    state.activePollAbort=null;state.running=false;state.leads=[];state.addedKeys={};state.campaignId='';state.mapsJobId='';state.websiteJobId='';state.lastPrompt='';state.engines={maps:{status:'pending'},website:{status:'pending'}};state.statusText='Ask the dashboard assistant to find leads.';state.uiState='Ready';state.overallStatus='idle';state.targetLimit=0;state.startError='';renderPanel();
  }
  for(const event of ['m360:workspace-changing','m360:session-ended'])document.addEventListener(event,clearWorkspaceState);
  window.M360LeadsSubAgent = {
    executeFromMasterAgent: runFromMaster,
    executeAutonomousWorkflow: runFromMaster,
    cancelDiscovery: cancelActiveDiscovery,
    getStatus: clientStatus,
    getState: function () {
      return state;
    },
    render: renderPanel
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderPanel);
  } else {
    renderPanel();
  }
})();
}
