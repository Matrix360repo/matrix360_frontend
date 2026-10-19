/* Matrix 360 CRM integration. Browser pilot ONLY. No persistent browser token storage. */
(() => {
  'use strict';
  const root = document.getElementById('app-crm');
  if (!root) return;
  const el = id => root.querySelector('#' + id);
  const config = window.MATRIX360_CRM_CONFIG || {};
  const base = String(config.apiBase || '').replace(/\/+$/, '');
  let token = null, workspace = null, generation = 0, memberships = [], validStages = [], audienceDataset = null, audiencePlan = null;
  let audienceProfileIds = [], copilotRequestId = 0;

  // User-facing Copilot is a server-authorized, RULE-BASED PLAN PREVIEW until
  // a separately approved and tested AI model/tool orchestration is deployed.
  function initCopilotPanel() {
    const target = el('m360-data-box');
    if (!target || el('m360-assistant-form')) return;
    const section = document.createElement('section');
    section.className = 'box';
    section.id = 'm360-assistant-panel';
    section.style.cssText = 'margin-bottom:20px;padding:22px;border-radius:16px;';
    const eyebrow = element('p', 'MATRIX 360 · GUIDED GROWTH');
    eyebrow.style.cssText = 'font-size:12px;font-weight:700;letter-spacing:.08em;color:#17665c;margin-bottom:8px';
    const heading = element('h3', 'What would you like your business to achieve?');
    heading.style.cssText = 'font-size:clamp(21px,2vw,27px);margin:4px 0 8px';
    const business = element('p', '');
    business.id = 'm360-assistant-business';
    business.style.cssText = 'font-weight:600;margin-bottom:9px';
    const description = element('p', 'Describe a business objective. Review a proposed plan; nothing is sent, published, purchased or executed.');
    description.style.cssText = 'margin:0 0 14px;color:#536a72';
    const form = document.createElement('form');
    form.id = 'm360-assistant-form';
    const label = element('label', 'Business objective');
    label.htmlFor = 'm360-assistant-goal';
    const field = document.createElement('textarea');
    field.id = 'm360-assistant-goal';
    field.className = 'formcontrol';
    field.maxLength = 600;
    field.minLength = 3;
    field.required = true;
    field.rows = 3;
    field.placeholder = 'For example: Find manufacturers relevant to our industrial property, then prepare an outreach proposal.';
    const submit = element('button', 'Review proposed plan');
    submit.className = 'btn primary';
    submit.type = 'submit';
    const state = element('p', 'Planning mode: not connected. Sign in to check workspace capabilities.');
    state.id = 'm360-assistant-status';
    state.setAttribute('role', 'status');
    state.setAttribute('aria-live', 'polite');
    state.style.cssText = 'margin:10px 0;color:#536a72';
    const availability = element('p', '');
    availability.id = 'm360-assistant-capabilities';
    availability.style.cssText = 'font-size:13px;color:#536a72';
    const output = document.createElement('div');
    output.id = 'm360-assistant-preview';
    output.hidden = true;
    output.style.cssText = 'white-space:pre-line;background:#f2f7f7;padding:16px;border-radius:12px;margin-top:12px;color:#183b42';
    const shortcuts = document.createElement('div');
    shortcuts.className = 'actions';
    shortcuts.setAttribute('aria-label', 'Suggested business goals');
    shortcuts.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 14px';
    for (const [caption, goal] of [
      ['Find suitable customers', 'Find suitable West Bengal prospects for my business and explain the qualification criteria.'],
      ['Plan a campaign', 'Prepare a campaign plan for my business, including audience evidence and approval requirements.'],
      ['Improve follow-up', 'Help us prioritize our existing customer enquiries and plan a follow-up process.']
    ]) {
      const button = element('button', caption);
      button.type = 'button';
      button.className = 'btn sm';
      button.addEventListener('click', () => { field.value = goal; field.focus(); });
      shortcuts.appendChild(button);
    }
    const next = element('p', 'What happens next: enter a goal → review proposed steps → check evidence → decide whether to continue. Nothing runs from this plan.');
    next.style.cssText = 'font-size:13px;color:#506775;margin:10px 0';
    form.append(label, field, submit);
    section.append(eyebrow, heading, business, description, shortcuts, form, next, state, availability, output);
    target.prepend(section);
    form.addEventListener('submit', submitCopilotGoal);
  }

  function copilotMessage(text, isError = false) {
    const node = el('m360-assistant-status');
    if (!node) return;
    node.textContent = text;
    node.style.color = isError ? '#a32936' : '#17665c';
  }

  const humanStatus = status => ({
    AVAILABLE_PREVIEW_ONLY: 'Available: guidance only',
    REVIEW_REQUIRED: 'Needs your review',
    CONFIGURED_UNVERIFIED: 'Configured, not verified',
    CONFIG_REQUIRED: 'Needs setup',
    NOT_INTEGRATED: 'Not connected',
    NOT_CONFIGURED: 'Not configured',
    UNAVAILABLE: 'Unavailable',
    DEMONSTRATED_SIMULATION: 'Simulation only'
  })[status] || 'Status unverified';

  async function loadCopilotCapabilities() {
    if (!workspace || !token) return;
    const currentWorkspace = workspace, currentGeneration = generation;
    const caption = el('m360-assistant-capabilities');
    const scope = '/workspaces/' + encodeURIComponent(currentWorkspace) + '/assistant/capabilities';
    try {
      const data = await api(scope);
      if (currentWorkspace !== workspace || currentGeneration !== generation || !token) return;
      if (data.workspace_id !== currentWorkspace || !Array.isArray(data.capabilities)) {
        throw new Error('Capability response does not match the authorized business.');
      }
      if (caption) {
        caption.replaceChildren();
        for (const capability of data.capabilities) {
          const note = element('p', String(capability.id || 'Capability').replaceAll('_', ' ') +
            ' — ' + humanStatus(capability.status) + '. ' + String(capability.reason || ''));
          note.style.cssText = 'margin:5px 0;font-size:13px;line-height:1.5';
          caption.appendChild(note);
        }
      }
      copilotMessage('Rule-based planning preview available. No AI model or live campaign execution is connected.');
    } catch (error) {
      if (currentWorkspace !== workspace || currentGeneration !== generation || !token) return;
      if (caption) caption.textContent = 'Copilot capabilities cannot be confirmed for this business.';
      copilotMessage('Plan preview requires the reviewed CRM staging backend. Existing CRM functions remain separate. ' + errorMessage(error), true);
    }
  }

  function renderReviewedPlan(result) {
    const output = el('m360-assistant-preview');
    output.replaceChildren();
    const title = element('h4', 'Proposed plan — REVIEW ONLY');
    title.style.cssText = 'font-size:20px;margin:0 0 8px';
    const status = element('p', 'RULE-BASED PREVIEW · NOT EXECUTED · NOT SAVED · NOT APPROVED');
    status.style.cssText = 'font-size:12px;font-weight:700;color:#925f22';
    const goal = element('p', 'Goal: ' + result.goal);
    goal.style.cssText = 'font-size:15px;font-weight:650;margin:10px 0';
    const boundary = element('p', 'Audience size: not checked. Lead eligibility: not verified. Campaign, image and video execution: not connected.');
    boundary.style.cssText = 'background:#fff4e5;border-radius:8px;padding:10px 12px;margin:12px 0';
    output.append(title, status, goal, boundary);
    for (const [index, step] of result.steps.entries()) {
      const section = document.createElement('section');
      section.style.cssText = 'border-top:1px solid #c9dcd7;padding:13px 0';
      const h = element('h5', (index + 1) + '. ' + step.title);
      h.style.cssText = 'font-size:16px;margin:0 0 6px';
      const state = element('p', humanStatus(step.status));
      state.style.cssText = 'font-size:12px;font-weight:700;color:#865e27;margin:0 0 7px';
      const description = element('p', String(step.detail || ''));
      const evidence = element('p', 'Evidence required: ' +
        (Array.isArray(step.evidence) && step.evidence.length ? step.evidence.join(' · ') : 'Not specified'));
      evidence.style.cssText = 'font-size:13px;color:#49636a';
      const noteLabel = element('label', 'Your review notes (this browser session only)');
      noteLabel.style.cssText = 'display:block;font-size:13px;font-weight:700;margin-top:10px';
      const note = document.createElement('textarea');
      note.rows = 2;
      note.maxLength = 500;
      note.className = 'formcontrol';
      note.placeholder = 'Edit the proposed step for your team. This does not approve or save it.';
      note.setAttribute('aria-label', 'Review notes for ' + step.title);
      section.append(h, state, description, evidence, noteLabel, note);
      output.appendChild(section);
    }
    const limitations = document.createElement('section');
    const h = element('h5', 'What is not verified');
    h.style.cssText = 'font-size:16px;margin:12px 0';
    limitations.append(h);
    for (const item of result.limitations || []) {
      const p = element('p', '• ' + item);
      p.style.cssText = 'font-size:13px;color:#49636a';
      limitations.appendChild(p);
    }
    const footer = element('p', 'Review notes are local and disappear when you sign out or switch businesses. There is no approval, execution or publishing action in this preview.');
    footer.style.cssText = 'font-size:13px;font-weight:600;margin-top:12px';
    output.append(limitations, footer);
    output.hidden = false;
  }

  async function submitCopilotGoal(event) {
    event.preventDefault();
    if (!workspace || !token) return copilotMessage('Sign in to an authorized business first.', true);
    const value = el('m360-assistant-goal').value.trim();
    if (value.length < 3) return copilotMessage('Please describe a concrete business goal.', true);
    const currentWorkspace = workspace, currentGeneration = generation, requestId = ++copilotRequestId;
    const button = el('m360-assistant-form').querySelector('button[type=submit]');
    button.disabled = true;
    const output = el('m360-assistant-preview');
    output.replaceChildren(); output.hidden = true;
    copilotMessage('Preparing a review-only plan. No dataset, message or provider is being contacted.');
    try {
      const result = await api('/workspaces/' + encodeURIComponent(currentWorkspace) + '/assistant/preview', 'POST', { objective: value });
      if (currentWorkspace !== workspace || currentGeneration !== generation || requestId !== copilotRequestId || !token) return;
      if (result.workspace_id !== currentWorkspace ||
          result.mode !== 'RULE_BASED_PREVIEW_ONLY' ||
          result.executed !== false || result.persisted !== false || result.approved !== false ||
          !Array.isArray(result.steps) || !Array.isArray(result.limitations)) {
        throw new Error('Plan preview response does not match the authorized business or review-only mode.');
      }
      renderReviewedPlan(result);
      copilotMessage('Review the proposed steps and evidence. Notes stay in your browser only; nothing is approved or executed.');
    } catch (error) {
      if (currentWorkspace === workspace && currentGeneration === generation && requestId === copilotRequestId && token) {
        copilotMessage('Plan preview unavailable: ' + errorMessage(error), true);
      }
    } finally {
      if (requestId === copilotRequestId) button.disabled = false;
    }
  }

  const errorMessage = e => (e instanceof Error ? e.message : String(e));
  function message(text, isError = false) {
    const node = el('m360-status'); if (!node) return;
    node.textContent = text;
    node.style.color = isError ? '#a32936' : '#17665c';
  }
  async function apiForm(path, form) {
    if (!base) throw new Error('CRM API has not been configured for this environment.');
    const headers = { ...(token ? { Authorization: 'Bearer ' + token } : {}) };
    let response;
    try { response = await fetch(base + path, { method: 'POST', headers, body: form, cache:'no-store' }); }
    catch { throw new Error('CRM API unreachable. Check API URL, backend, CORS and HTTPS.'); }
    let data; try { data = await response.json(); } catch { data = null; }
    if (!response.ok) throw new Error((data && typeof data.detail === 'string' ? data.detail : 'API error ' + response.status));
    return data;
  }
  async function api(path, method = 'GET', body) {
    if (!base) throw new Error('CRM API has not been configured for this environment.');
    const headers = { ...(token ? { Authorization: 'Bearer ' + token } : {}) };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache:'no-store' });
    } catch { throw new Error('CRM API unreachable. Check API URL, backend, CORS and HTTPS.'); }
    let data;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok) throw new Error((data && typeof data.detail === 'string' ? data.detail : 'API error ' + response.status));
    return data;
  }
  function element(tag, text) { const n = document.createElement(tag); n.textContent = text == null ? '' : String(text); return n; }
  initCopilotPanel();
  function setAuthenticated(active) {
    el('m360-login-box').hidden = active;
    el('m360-data-box').hidden = !active;
    document.dispatchEvent(new CustomEvent('m360-crm-auth-changed', { detail: { active } }));
  }
  function reset() {
    ++generation; ++copilotRequestId; token = null; workspace = null; memberships = []; validStages = []; audienceDataset = null; audiencePlan = null; audienceProfileIds = [];
    el('m360-password').value = '';
    el('m360-leads').replaceChildren();
    if (el('m360-assistant-preview')) el('m360-assistant-preview').hidden = true;
    if (el('m360-assistant-goal')) el('m360-assistant-goal').value = '';
    if (el('m360-assistant-business')) el('m360-assistant-business').textContent = '';
    if (el('m360-assistant-capabilities')) el('m360-assistant-capabilities').textContent = '';
    setAuthenticated(false);
  }
  async function populateWorkspaces() {
    memberships = await api('/me/workspaces');
    if (!Array.isArray(memberships) || !memberships.length) throw new Error('No authorized workspace membership');
    const select = el('m360-workspace'); select.replaceChildren();
    const isPortfolioAdmin = memberships.some(m => m.role === 'platform_owner' || m.role === 'agency_admin');
    if (!isPortfolioAdmin && memberships.length > 1) {
      throw new Error('Multiple client memberships require administrator resolution; no cross-business selector is available to clients.');
    }
    for (const member of memberships) {
      const option = new Option(member.name, member.id); select.appendChild(option);
    }
    const canChooseBusiness = isPortfolioAdmin && memberships.length > 1;
    select.hidden = !canChooseBusiness;
    const wsLabel = root.querySelector('label[for=m360-workspace]');
    if (wsLabel) wsLabel.hidden = !canChooseBusiness;
    workspace = select.value;
    await loadWorkspace();
  }
  async function loadWorkspace() {
    ++generation; ++copilotRequestId;
    workspace = el('m360-workspace').value;
    audienceDataset = null; audiencePlan = null; audienceProfileIds = [];
    if (el('m360-assistant-preview')) { el('m360-assistant-preview').replaceChildren(); el('m360-assistant-preview').hidden = true; }
    if (el('m360-assistant-capabilities')) el('m360-assistant-capabilities').replaceChildren();
    if (el('m360-assistant-form')) el('m360-assistant-form').querySelector('button[type=submit]').disabled = false;
    const member = memberships.find(x => x.id === workspace);
    if (el('m360-assistant-business') && member) el('m360-assistant-business').textContent = 'Your business: ' + member.name;
    if (!memberships.some(x => x.id === workspace)) throw new Error('Unauthorized workspace selection');
    const seq = generation, slug = encodeURIComponent(workspace);
    const [stages, leads] = await Promise.all([api('/workspaces/' + slug + '/stages'), api('/workspaces/' + slug + '/leads')]);
    if (seq !== generation) return;
    validStages = stages;
    if (!Array.isArray(stages) || !Array.isArray(leads)) throw new Error('Unexpected CRM response');
    const stageSelect = el('m360-stage'); stageSelect.replaceChildren();
    for (const stage of stages) stageSelect.add(new Option(stage.replaceAll('_', ' '), stage));
    renderLeads(leads, seq);
    el('m360-count').textContent = leads.length + ' recorded lead(s) — verified API records';
    loadAudience().catch(e => audienceMessage(errorMessage(e), true));
    loadCopilotCapabilities().catch(e => copilotMessage(errorMessage(e), true));
  }
  function renderLeads(leads, seq) {
    const renderWorkspace = workspace; // Freeze row authority at render time, never take it from mutable selection.
    const body = el('m360-leads'); body.replaceChildren();
    for (const lead of leads) {
      const tr = document.createElement('tr');
      for (const content of [lead.id, lead.name, lead.source || '—']) {
        tr.appendChild(element('td', content));
      }
      const td = document.createElement('td');
      const select = document.createElement('select'); select.className = 'formcontrol';
      select.setAttribute('aria-label', 'Stage for ' + lead.name);
      for (const stage of validStages) select.add(new Option(stage.replaceAll('_',' '), stage));
      select.value = lead.stage;
      select.addEventListener('change', async () => {
        if (seq !== generation || renderWorkspace !== workspace) return; // Stale row cannot write into a new tenant.
        select.disabled = true;
        const activeWorkspace = renderWorkspace;
        try {
          await api('/workspaces/' + encodeURIComponent(activeWorkspace) + '/leads/' + encodeURIComponent(lead.id), 'PATCH', { stage: select.value });
          if (seq === generation) { message('Stage updated'); await loadWorkspace(); }
        } catch (e) { message(errorMessage(e), true); if (seq === generation) await loadWorkspace().catch(() => {}); }
        finally { select.disabled = false; }
      });
      td.appendChild(select); tr.appendChild(td);
      body.appendChild(tr);
    }
  }
  function audienceMessage(text, isError = false) {
    const node = el('m360-audience-status'); if (!node) return;
    node.textContent = text; node.style.color = isError ? '#a32936' : '#17665c';
  }
  function renderAudienceJobs(jobs) {
    const body = el('m360-audience-jobs'); if (!body) return; body.replaceChildren();
    for (const job of jobs) {
      const tr = document.createElement('tr');
      for (const value of [job.dataset_name || job.dataset_id || '—', job.id || '—', job.status || '—', job.progress_percent == null ? '—' : String(job.progress_percent) + '%']) tr.appendChild(element('td', value));
      body.appendChild(tr);
    }
  }
  async function loadAudience() {
    if (!workspace || !el('m360-audience-box')) return;
    const scopedWorkspace = workspace, seq = generation;
    const panel = el('m360-audience-box');
    panel.hidden = false;
    audienceProfileIds = [];
    for (const id of ['m360-audience-start', 'm360-audience-plan', 'm360-audience-start-ai']) el(id).disabled = true;
    const uploadButton = el('m360-audience-upload-form').querySelector('button[type=submit]');
    uploadButton.disabled = true;
    audienceMessage('Checking the independently operated Audience Engine gateway…');
    const scope = '/workspaces/' + encodeURIComponent(scopedWorkspace) + '/audience';
    try {
      const status = await api(scope + '/status');
      if (seq !== generation || scopedWorkspace !== workspace || !token) return;
      if (!status.configured) {
        audienceMessage('NEEDS SETUP: The Audience Engine gateway is not configured. No audience processing or transfers can start.', true);
        renderAudienceJobs([]); return;
      }
      if (status.workspace_id !== scopedWorkspace ||
          !Array.isArray(status.authorized_client_profiles) ||
          !status.authorized_client_profiles.length ||
          !status.authorized_client_profiles.every(x => typeof x === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(x))) {
        audienceMessage('NEEDS SETUP: No tenant-verified audience profile mapping was returned. Processing is locked to prevent another client’s data being selected.', true);
        renderAudienceJobs([]); return;
      }
      audienceProfileIds = [...new Set(status.authorized_client_profiles)];
      const jobs = await api(scope + '/jobs');
      if (seq !== generation || scopedWorkspace !== workspace || !token) return;
      renderAudienceJobs(Array.isArray(jobs.jobs) ? jobs.jobs : []);
      uploadButton.disabled = false;
      el('m360-audience-start').disabled = !audienceDataset;
      el('m360-audience-plan').disabled = !audienceDataset;
      el('m360-audience-start-ai').disabled = !audiencePlan?.predicate;
      audienceMessage('Gateway profile mapping is available for this business. Processing needs an explicit user action; no campaign sending is connected.');
    } catch (error) {
      if (seq !== generation || scopedWorkspace !== workspace || !token) return;
      renderAudienceJobs([]);
      audienceMessage('UNAVAILABLE: Audience Engine gateway could not be verified. ' + errorMessage(error), true);
    }
  }
  async function uploadAudience(e) {
    e.preventDefault(); if (!workspace || !audienceProfileIds.length) return audienceMessage('A tenant-verified Audience Engine profile is required before upload.', true);
    const input = el('m360-audience-files');
    if (!input.files || !input.files.length) return audienceMessage('Choose at least one dataset file.', true);
    const form = new FormData(); for (const file of input.files) form.append('files', file, file.name);
    audienceMessage('Uploading dataset to the isolated workspace…');
    try {
      const result = await apiForm('/workspaces/' + encodeURIComponent(workspace) + '/audience/datasets', form);
      audienceDataset = result.dataset_id; audiencePlan = null;
      el('m360-audience-plan-preview').hidden = true;
      audienceMessage('Dataset uploaded. It is ready for classification or safe AI Direct planning.');
      el('m360-audience-start').disabled = false; el('m360-audience-plan').disabled = false; el('m360-audience-start-ai').disabled = true;
    } catch (e) { audienceMessage(errorMessage(e), true); }
  }
  function renderAudiencePlan(plan) {
    const node = el('m360-audience-plan-preview'); if (!node) return;
    node.hidden = false; node.textContent = JSON.stringify({ predicate: plan.predicate, explanation: plan.segment_explanation, unknown_conditions: plan.unknown_conditions, warnings: plan.warnings }, null, 2);
  }
  async function suggestAudiencePlan() {
    if (!workspace || !audienceDataset || !audienceProfileIds.length) return audienceMessage('An authorized audience profile and dataset must be verified first.', true);
    const objective = el('m360-audience-objective').value.trim();
    if (objective.length < 3) return audienceMessage('Describe the audience segment first.', true);
    audienceMessage('Creating a schema-bound plan; no source rows are sent to AI…');
    try {
      const scope = '/workspaces/' + encodeURIComponent(workspace) + '/audience';
      audiencePlan = await api(scope + '/datasets/' + encodeURIComponent(audienceDataset) + '/ai-direct/plan', 'POST', { objective });
      renderAudiencePlan(audiencePlan);
      el('m360-audience-start-ai').disabled = !audiencePlan.predicate;
      audienceMessage(audiencePlan.predicate ? 'Review the proposed filters, then explicitly approve processing.' : 'No safe executable filter was inferred; use observed source fields.');
    } catch (e) { audienceMessage(errorMessage(e), true); }
  }
  async function startAiAudienceJob() {
    if (!workspace || !audienceDataset || !audiencePlan?.predicate || !audienceProfileIds.length) return;
    if (!window.confirm('Start this separately authorized audience classification job for the selected business? No campaign messages will be sent.')) return;
    const key = globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : 'aud-ai-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    audienceMessage('Submitting the approved AI Direct plan to the deterministic engine…');
    try {
      const result = await api('/workspaces/' + encodeURIComponent(workspace) + '/audience/jobs', 'POST', { dataset_id: audienceDataset, idempotency_key: key, client_profiles: [...audienceProfileIds], filter_plan: audiencePlan.predicate, audience_plan: audiencePlan });
      audienceMessage('AI Direct job ' + (result.job_id || 'queued') + ' started. Refresh to see progress and exports.');
      await loadAudience();
    } catch (e) { audienceMessage(errorMessage(e), true); }
  }
  async function startAudienceJob() {
    if (!workspace || !audienceDataset || !audienceProfileIds.length) return;
    if (!window.confirm('Start this classification job using the authorized business profiles? No outbound messages will be sent.')) return;
    const key = globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : 'aud-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    audienceMessage('Starting classification job…');
    try {
      const result = await api('/workspaces/' + encodeURIComponent(workspace) + '/audience/jobs', 'POST', { dataset_id: audienceDataset, idempotency_key: key, client_profiles: [...audienceProfileIds] });
      audienceMessage('Classification job ' + (result.job_id || 'queued') + ' started. Refresh to see progress and exports.');
      await loadAudience();
    } catch (e) { audienceMessage(errorMessage(e), true); }
  }
  async function signIn(e) {
    e.preventDefault(); message('Signing in...');
    try {
      const result = await api('/auth/login', 'POST', { username: el('m360-username').value, password: el('m360-password').value });
      token = result.access_token;
      el('m360-password').value = '';
      await populateWorkspaces();
      setAuthenticated(true);
      message('Signed in. Live CRM data is shown only for authorized workspaces.');
    } catch (e) { reset(); message(errorMessage(e), true); }
  }
  async function addLead(e) {
    e.preventDefault();
    if (!workspace) return;
    try {
      await api('/workspaces/' + encodeURIComponent(workspace) + '/leads', 'POST', {
        name: el('m360-name').value.trim(), source: el('m360-source').value.trim() || null,
        stage: el('m360-stage').value
      });
      el('m360-lead-form').reset(); message('Lead created'); await loadWorkspace();
    } catch (e) { message(errorMessage(e), true); }
  }
  root.querySelector('#m360-login-form').addEventListener('submit', signIn);
  root.querySelector('#m360-lead-form').addEventListener('submit', addLead);
  el('m360-workspace').addEventListener('change', () => loadWorkspace().catch(e => message(errorMessage(e), true)));
  el('m360-logout').addEventListener('click', async () => {
    try { if (token) await api('/auth/logout', 'POST'); } catch {} finally { reset(); message('Signed out.'); }
  });
  el('m360-refresh').addEventListener('click', () => loadWorkspace().catch(e => message(errorMessage(e), true)));
  el('m360-audience-refresh').addEventListener('click', () => loadAudience().catch(e => audienceMessage(errorMessage(e), true)));
  el('m360-audience-plan').addEventListener('click', suggestAudiencePlan);
  el('m360-audience-start-ai').addEventListener('click', startAiAudienceJob);
  el('m360-audience-upload-form').addEventListener('submit', uploadAudience);
  el('m360-audience-start').addEventListener('click', startAudienceJob);
  if (!base) message('CRM API not configured. Prototype sections elsewhere remain illustrative.', true);
})();
