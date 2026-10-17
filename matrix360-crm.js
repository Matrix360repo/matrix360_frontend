/* Matrix 360 CRM integration. Browser pilot ONLY. No persistent browser token storage. */
(() => {
  'use strict';
  const root = document.getElementById('app-crm');
  if (!root) return;
  const el = id => root.querySelector('#' + id);
  const config = window.MATRIX360_CRM_CONFIG || {};
  const base = String(config.apiBase || '').replace(/\/+$/, '');
  let token = null, workspace = null, generation = 0, memberships = [], validStages = [];
  const errorMessage = e => (e instanceof Error ? e.message : String(e));
  function message(text, isError = false) {
    const node = el('m360-status'); if (!node) return;
    node.textContent = text;
    node.style.color = isError ? '#a32936' : '#17665c';
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
    if (response.status === 401 && token) {
      reset();
      throw new Error('Session expired or access was revoked. Please sign in again.');
    }
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
    const [stages, leads, audit] = await Promise.all([api('/workspaces/' + slug + '/stages'), api('/workspaces/' + slug + '/leads'), api('/workspaces/' + slug + '/audit')]);
    if (seq !== generation) return;
    validStages = stages;
    if (!Array.isArray(stages) || !Array.isArray(leads)) throw new Error('Unexpected CRM response');
    const stageSelect = el('m360-stage'); stageSelect.replaceChildren();
    for (const stage of stages) stageSelect.add(new Option(stage.replaceAll('_', ' '), stage));
    renderLeads(leads, seq);
    renderAudit(audit);

    el('m360-count').textContent = leads.length + ' recorded lead(s) — verified API records';
  }
  function renderAudit(audit) {
    if (!Array.isArray(audit)) throw new Error('Unexpected audit history response');
    const body = el('m360-audit'); body.replaceChildren();
    for (const entry of audit) {
      const tr = document.createElement('tr');
      const stamp = entry.created_at ? new Date(entry.created_at) : null;
      const dateText = stamp && !Number.isNaN(stamp.valueOf()) ? stamp.toLocaleString() : '—';
      for (const value of [dateText, String(entry.action || '—').replaceAll('_', ' '), entry.lead_id ?? '—', entry.actor_id ?? '—']) {
        tr.appendChild(element('td', value));
      }
      body.appendChild(tr);
    }
    el('m360-audit-count').textContent = audit.length + ' recent activity event(s) — verified API records';
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
  if (!base) message('CRM API not configured. Prototype sections elsewhere remain illustrative.', true);
})();
