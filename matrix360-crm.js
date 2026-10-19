/* Matrix 360 CRM integration. Browser pilot ONLY. No persistent browser token storage. */
(() => {
  'use strict';
  const root = document.getElementById('app-crm');
  if (!root) return;
  const el = id => root.querySelector('#' + id);
  const config = window.MATRIX360_CRM_CONFIG || {};
  const base = String(config.apiBase || '').replace(/\/+$/, '');
  let token = null, workspace = null, generation = 0, memberships = [], validStages = [], audienceDataset = null;
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
  function setAuthenticated(active) {
    el('m360-login-box').hidden = active;
    el('m360-data-box').hidden = !active;
  }
  function reset() {
    ++generation; token = null; workspace = null; memberships = []; validStages = [];
    el('m360-password').value = '';
    el('m360-leads').replaceChildren();
    setAuthenticated(false);
  }
  async function populateWorkspaces() {
    memberships = await api('/me/workspaces');
    if (!Array.isArray(memberships) || !memberships.length) throw new Error('No authorized workspace membership');
    const select = el('m360-workspace'); select.replaceChildren();
    for (const member of memberships) {
      const option = new Option(member.name, member.id); select.appendChild(option);
    }
    workspace = select.value;
    await loadWorkspace();
  }
  async function loadWorkspace() {
    ++generation;
    workspace = el('m360-workspace').value;
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
  }
  function renderLeads(leads, seq) {
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
        select.disabled = true;
        const activeWorkspace = workspace;
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
    const scope = '/workspaces/' + encodeURIComponent(workspace) + '/audience';
    const status = await api(scope + '/status');
    el('m360-audience-box').hidden = false;
    if (!status.configured) {
      audienceMessage('Audience Engine is not configured for this CRM environment.', true);
      el('m360-audience-start').disabled = true;
      renderAudienceJobs([]); return;
    }
    const jobs = await api(scope + '/jobs');
    renderAudienceJobs(Array.isArray(jobs.jobs) ? jobs.jobs : []);
    el('m360-audience-start').disabled = !audienceDataset;
    audienceMessage(audienceDataset ? 'Dataset ready. Review the default client profiles, then start classification.' : 'Choose a supported dataset to begin.');
  }
  async function uploadAudience(e) {
    e.preventDefault(); if (!workspace) return;
    const input = el('m360-audience-files');
    if (!input.files || !input.files.length) return audienceMessage('Choose at least one dataset file.', true);
    const form = new FormData(); for (const file of input.files) form.append('files', file, file.name);
    audienceMessage('Uploading dataset to the isolated workspace…');
    try {
      const result = await apiForm('/workspaces/' + encodeURIComponent(workspace) + '/audience/datasets', form);
      audienceDataset = result.dataset_id;
      audienceMessage('Dataset uploaded. It is ready for classification.');
      el('m360-audience-start').disabled = false;
    } catch (e) { audienceMessage(errorMessage(e), true); }
  }
  async function startAudienceJob() {
    if (!workspace || !audienceDataset) return;
    const key = globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : 'aud-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    audienceMessage('Starting classification job…');
    try {
      const result = await api('/workspaces/' + encodeURIComponent(workspace) + '/audience/jobs', 'POST', { dataset_id: audienceDataset, idempotency_key: key, client_profiles: ['lakhotia','shree','vrindavan'] });
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
  el('m360-audience-upload-form').addEventListener('submit', uploadAudience);
  el('m360-audience-start').addEventListener('click', startAudienceJob);
  if (!base) message('CRM API not configured. Prototype sections elsewhere remain illustrative.', true);
})();
