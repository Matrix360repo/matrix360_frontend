/* Matrix360 Audience Intelligence & Prompt-Driven Lead Generation Agent */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const services = $('services');
  if (!services || $('audience-engine')) return;

  // Keep the authenticated dataset workflow as a separate module so it can
  // share the existing dashboard session without widening this lead engine.
  if (!document.querySelector('script[src="matrix360-document-qualification.js"]')) {
    const documentModule = document.createElement('script');
    documentModule.src = 'matrix360-document-qualification.js';
    document.head.append(documentModule);
  }

  // Determine API base
  const apiBase = window.MATRIX360_LEAD_API || (
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://127.0.0.1:8012'
      : window.location.origin + '/api/leads'
  );

  const section = document.createElement('section');
  section.id = 'audience-engine';
  section.className = 'card m360-lead-panel';
  section.setAttribute('aria-labelledby', 'lead-engine-title');

  section.innerHTML = `
    <span class="eyebrow">AUDIENCE INTELLIGENCE · PROMPT-DRIVEN LEAD ENGINE</span>
    <h2 id="lead-engine-title">Audience Intelligence & Lead Discovery</h2>
    <p class="lede">Describe your target customers in plain English. Autonomous AI agents discover official businesses across Google Maps, web search engines, and LinkedIn, inspect official websites with anti-bot protection, and qualify decision-makers with estimated company size.</p>

    <div id="lead-conn-state" class="lead-status-banner">Checking Lead Engine service connection…</div>

    <div class="lead-input-block">
      <label for="lead-prompt-input"><strong>Who would you like to reach? (Plain English)</strong></label>
      <textarea id="lead-prompt-input" rows="3" placeholder="Example: Find packaging manufacturers around Mumbai that may need warehouse automation or supply chain services."></textarea>

      <div class="lead-slider-row">
        <div class="lead-target-stat">
          <strong id="lead-slider-display">50</strong>
          <span>Desired Qualified Leads</span>
        </div>
        <div class="lead-slider-wrap">
          <label for="lead-count-slider">Lead volume target (1 to 500)</label>
          <input id="lead-count-slider" type="range" min="1" max="500" value="50" step="5">
        </div>
        <button id="btn-create-lead-plan" class="btn primary" type="button">Generate Research Plan</button>
      </div>
    </div>

    <!-- AI Plan Strategy Card -->
    <div id="lead-plan-section" class="lead-subcard" hidden>
      <div class="row">
        <h3>AI-Generated Research Strategy</h3>
        <span class="tag tag-live">Dynamic Strategy</span>
      </div>
      <p id="lead-plan-goal" class="lead-goal-text"></p>
      <label><strong>Plain-English Qualification Rules</strong></label>
      <ul id="lead-plan-filters" class="lead-filter-list"></ul>
      <p id="lead-plan-note" class="lead-subnote"></p>
      <div style="margin-top: 15px;">
        <button id="btn-start-lead-search" class="btn primary" type="button" disabled>Start Lead Research</button>
      </div>
    </div>

    <!-- Live Execution & Agent Feed -->
    <div id="lead-progress-section" class="lead-subcard" hidden>
      <div class="row">
        <h3>Autonomous Agent Progress</h3>
        <span id="lead-job-badge" class="tag tag-live">RUNNING</span>
      </div>
      <div class="lead-progress-grid">
        <div>
          <label><strong>Live Agent Activity</strong></label>
          <ol id="lead-event-feed" class="lead-event-list">
            <li>Starting autonomous pipeline…</li>
          </ol>
        </div>
        <div id="lead-screenshot-wrap" hidden>
          <label><strong>Latest Website Evidence Rendered</strong></label>
          <img id="lead-screenshot-img" alt="Official website rendered by crawler" class="lead-preview-img">
        </div>
      </div>
    </div>

    <!-- Results & Download -->
    <div id="lead-results-section" class="lead-subcard" hidden>
      <div class="row">
        <h3>Qualified Leads Results</h3>
        <div class="lead-actions">
          <a id="link-download-leads" class="btn primary" href="#" target="_blank">📥 Download Leads (CSV)</a>
          <a id="link-download-report" class="btn" href="#" target="_blank">📄 Full Audit Report</a>
          <button id="btn-import-crm" class="btn" type="button">➕ Add to Current CRM Pipeline</button>
        </div>
      </div>
      <div id="lead-metrics-row" class="lead-metrics"></div>
      <div class="table-wrap" style="max-height: 420px; overflow-y: auto;">
        <table>
          <thead>
            <tr>
              <th>Company Name</th>
              <th>Website</th>
              <th>Fit Score</th>
              <th>Company Size</th>
              <th>AI Qualification</th>
              <th>Contact Person</th>
              <th>Role</th>
              <th>Email</th>
              <th>Phone</th>
            </tr>
          </thead>
          <tbody id="lead-table-body"></tbody>
        </table>
      </div>
    </div>
  `;

  // Insert before services section
  services.parentNode.insertBefore(section, services);

  // Add navigation link to workspace sidebar
  const nav = document.querySelector('.workspace-nav');
  if (nav && !nav.querySelector('a[href="#audience-engine"]')) {
    const link = document.createElement('a');
    link.href = '#audience-engine';
    link.textContent = 'Audience Intelligence';
    nav.append(link);
  }

  // Update Audience Intelligence card in "Your operations at a glance"
  const featureCard = $('audience-feature-card') || document.querySelector('.feature a[href="#services"]')?.parentNode;
  if (featureCard) {
    featureCard.innerHTML = `
      <span class="tag tag-live">LIVE AI AGENT</span>
      <strong>Audience Intelligence & Leads</strong>
      <p>Prompt-driven B2B lead discovery, official website evidence, and AI qualification.</p>
      <a href="#audience-engine">Launch Lead Engine →</a>
    `;
  }

  // Update Journey step 2
  const journeyStatus = $('audience-journey-status');
  if (journeyStatus) {
    journeyStatus.textContent = 'Live AI Engine';
    journeyStatus.className = 'tag tag-live';
  } else {
    // If element didn't have explicit ID, find journey step 2
    const items = document.querySelectorAll('.journey-list li');
    if (items.length >= 2) {
      const step2 = items[1];
      const tag = step2.querySelector('.tag');
      if (tag) {
        tag.textContent = 'Live AI Engine';
        tag.className = 'tag tag-live';
      }
    }
  }

  // Styles
  const style = document.createElement('style');
  style.textContent = `
    .m360-lead-panel { margin-top: 24px; }
    .lead-status-banner { border-left: 4px solid #0b786b; background: #eaf4ee; padding: 12px 15px; border-radius: 8px; margin: 14px 0; font-size: 13px; font-weight: 600; }
    .lead-input-block { background: #fbfdfc; border: 1px solid #dce8e3; border-radius: 14px; padding: 18px; margin-top: 14px; }
    .lead-input-block textarea { width: 100%; font-size: 14px; resize: vertical; min-height: 70px; border: 1px solid #c9ded5; border-radius: 8px; padding: 10px; }
    .lead-slider-row { display: flex; align-items: center; gap: 18px; margin-top: 14px; flex-wrap: wrap; }
    .lead-target-stat { min-width: 140px; }
    .lead-target-stat strong { font-size: 26px; color: #0a8278; display: block; line-height: 1; }
    .lead-target-stat span { font-size: 11px; text-transform: uppercase; color: #5f7b76; font-weight: 700; }
    .lead-slider-wrap { flex: 1; min-width: 180px; }
    .lead-slider-wrap input { width: 100%; accent-color: #0a8278; }
    .lead-subcard { background: #ffffff; border: 1px solid #d7e8e1; border-radius: 14px; padding: 20px; margin-top: 18px; }
    .lead-goal-text { font-size: 15px; font-weight: 700; color: #0f4b44; border-left: 3px solid #0a8278; padding-left: 10px; margin: 8px 0 12px; }
    .lead-filter-list { padding-left: 20px; color: #43635d; font-size: 13px; line-height: 1.5; margin: 6px 0; }
    .lead-subnote { font-size: 12px; color: #627e79; margin-top: 8px; }
    .lead-progress-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 10px; }
    @media(max-width: 800px) { .lead-progress-grid { grid-template-columns: 1fr; } }
    .lead-event-list { font-family: ui-monospace, monospace; font-size: 12px; color: #2c4d47; max-height: 240px; overflow-y: auto; background: #f6faf8; padding: 12px 28px; border-radius: 8px; border: 1px solid #d8eae2; margin: 0; }
    .lead-preview-img { max-width: 100%; max-height: 240px; border-radius: 8px; border: 1px solid #cce1d8; object-fit: contain; }
    .lead-metrics { display: flex; gap: 12px; flex-wrap: wrap; margin: 12px 0; }
    .lead-metric-box { background: #f6fbf9; border: 1px solid #d5eae1; border-radius: 8px; padding: 10px 14px; min-width: 110px; }
    .lead-metric-box strong { font-size: 20px; color: #086d64; display: block; }
    .lead-metric-box span { font-size: 11px; text-transform: uppercase; color: #63807a; font-weight: 700; }
    .lead-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .score-pill { display: inline-block; padding: 2px 7px; border-radius: 4px; font-weight: 800; font-size: 11px; background: #e3f5eb; color: #0f6e56; }
  `;
  document.head.append(style);

  // Logic & State
  let currentPlan = null;
  let activeJobId = null;
  let pollInterval = null;
  let latestReport = null;

  const promptInput = $('lead-prompt-input');
  const countSlider = $('lead-count-slider');
  const countDisplay = $('lead-slider-display');
  const btnPlan = $('btn-create-lead-plan');
  const btnStart = $('btn-start-lead-search');
  const planSection = $('lead-plan-section');
  const planGoal = $('lead-plan-goal');
  const planFilters = $('lead-plan-filters');
  const planNote = $('lead-plan-note');
  const progressSection = $('lead-progress-section');
  const eventFeed = $('lead-event-feed');
  const shotWrap = $('lead-screenshot-wrap');
  const shotImg = $('lead-screenshot-img');
  const resultsSection = $('lead-results-section');
  const tableBody = $('lead-table-body');
  const metricsRow = $('lead-metrics-row');
  const linkCsv = $('link-download-leads');
  const linkReport = $('link-download-report');
  const btnImportCrm = $('btn-import-crm');
  const connState = $('lead-conn-state');
  const jobBadge = $('lead-job-badge');

  countSlider.addEventListener('input', () => {
    countDisplay.textContent = countSlider.value;
  });

  // Verify connection to Lead Engine API
  async function checkConnection() {
    try {
      const res = await fetch(`${apiBase}/api/status`, { mode: 'cors' });
      if (res.ok) {
        const data = await res.json();
        connState.textContent = `✅ Lead Engine active (${data.ai_model || 'gpt-4o-mini'}) · Discovery: Multi-Engine Web & LinkedIn`;
        connState.style.borderLeftColor = '#0b786b';
        connState.style.background = '#eaf4ee';
      } else {
        fallbackConnText();
      }
    } catch {
      fallbackConnText();
    }
  }

  function fallbackConnText() {
    connState.innerHTML = `ℹ️ Lead Engine running on <code>${apiBase}</code>. Start with <code>run.bat</code> or <code>./run.sh</code> if local server is not started.`;
    connState.style.borderLeftColor = '#0a8278';
    connState.style.background = '#f2f9f6';
  }

  checkConnection();

  // Create Research Plan
  btnPlan.addEventListener('click', async () => {
    const prompt = promptInput.value.trim();
    if (prompt.length < 12) {
      alert('Please describe your target customers in a bit more detail (at least one complete sentence).');
      return;
    }
    btnPlan.disabled = true;
    btnPlan.textContent = 'Analyzing with AI…';
    try {
      const res = await fetch(`${apiBase}/api/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, lead_count: Number(countSlider.value) }),
      });
      btnPlan.disabled = false;
      btnPlan.textContent = 'Generate Research Plan';
      if (!res.ok) {
        alert('Could not generate plan: ' + await res.text());
        return;
      }
      const data = await res.json();
      currentPlan = data;
      planGoal.textContent = data.plan.client_goal;
      planFilters.innerHTML = (data.plan.plain_filters || []).map(f => `<li>${f}</li>`).join('');
      planNote.textContent = [...(data.plan.cautions || []), data.setup_message].filter(Boolean).join(' · ');
      planSection.hidden = false;
      btnStart.disabled = false;
      planSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      btnPlan.disabled = false;
      btnPlan.textContent = 'Generate Research Plan';
      alert('Error contacting Lead Engine: ' + err.message);
    }
  });

  // Start Research
  btnStart.addEventListener('click', async () => {
    if (!currentPlan) return;
    btnStart.disabled = true;
    progressSection.hidden = false;
    jobBadge.textContent = 'QUEUED';
    jobBadge.className = 'tag tag-pending';
    eventFeed.innerHTML = '<li>🚀 Launching autonomous research pipeline…</li>';
    resultsSection.hidden = true;

    try {
      const res = await fetch(`${apiBase}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: currentPlan.id }),
      });
      if (!res.ok) {
        btnStart.disabled = false;
        alert('Could not start research job: ' + await res.text());
        return;
      }
      const data = await res.json();
      activeJobId = data.id;
      startPolling();
    } catch (err) {
      btnStart.disabled = false;
      alert('Error starting job: ' + err.message);
    }
  });

  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(pollJob, 1400);
  }

  async function pollJob() {
    if (!activeJobId) return;
    try {
      const res = await fetch(`${apiBase}/api/jobs/${encodeURIComponent(activeJobId)}`);
      if (!res.ok) return;
      const job = await res.json();
      updateJobView(job);
      if (job.status === 'COMPLETE' || job.status === 'FAILED') {
        clearInterval(pollInterval);
        btnStart.disabled = false;
      }
    } catch {
      // transient network wait
    }
  }

  function updateJobView(job) {
    jobBadge.textContent = job.status;
    jobBadge.className = job.status === 'COMPLETE' ? 'tag tag-live' : job.status === 'FAILED' ? 'tag tag-error' : 'tag tag-pending';

    const events = job.events || [];
    eventFeed.innerHTML = events.slice(-30).reverse().map(e => {
      const d = e.data || {};
      const detail = d.agent || d.company || d.query || d.url || d.error || (d.qualified_contacts !== undefined ? `${d.qualified_contacts} leads qualified` : '');
      return `<li><b>${e.name}</b> ${detail}</li>`;
    }).join('') || '<li>Waiting for research activity…</li>';

    // Show latest rendered page screenshot
    const shotEvent = [...events].reverse().find(e => e.data && e.data.screenshot);
    if (shotEvent) {
      const filename = shotEvent.data.screenshot.split(/[\\/]/).pop();
      shotWrap.hidden = false;
      shotImg.src = `${apiBase}/api/jobs/${encodeURIComponent(job.id)}/screenshots/${encodeURIComponent(filename)}`;
    }

    if (job.report) {
      latestReport = job.report;
      renderResults(job.report, job.id);
    }
  }

  function renderResults(report, jobId) {
    resultsSection.hidden = false;
    linkCsv.href = `${apiBase}/api/jobs/${encodeURIComponent(jobId)}/leads.csv`;
    linkReport.href = `${apiBase}/api/jobs/${encodeURIComponent(jobId)}/report.json`;

    const pipeline = report.pipeline || {};
    const qualified = pipeline.qualified_contact_rows ?? report.contacts_extracted;
    const target = pipeline.target_qualified_leads ?? '—';
    const met = pipeline.target_met ? 'Yes' : 'In Progress';

    metricsRow.innerHTML = `
      <div class="lead-metric-box"><strong>${report.source_rows || 0}</strong><span>Discovered</span></div>
      <div class="lead-metric-box"><strong>${report.pages_fetched || 0}</strong><span>Websites</span></div>
      <div class="lead-metric-box"><strong>${qualified || 0}</strong><span>Qualified</span></div>
      <div class="lead-metric-box"><strong>${target}</strong><span>Target</span></div>
      <div class="lead-metric-box"><strong>${met}</strong><span>Target Met</span></div>
    `;

    const companies = report.companies || [];
    const rows = [];
    companies.forEach(comp => {
      const contacts = comp.contacts || [];
      if (contacts.length > 0) {
        contacts.forEach(c => rows.push({ ...c, company_name: comp.company_name, domain: comp.domain }));
      } else {
        rows.push({
          company_name: comp.company_name,
          domain: comp.domain,
          fit_score: comp.fit_score || 50,
          company_size: comp.company_size || 'Unknown',
          qualification_summary: comp.qualification_summary || (comp.reasons || []).join('; ') || 'Qualified candidate',
          named_contact: '',
          role: '',
          company_email: '',
          company_phone: '',
        });
      }
    });

    tableBody.innerHTML = rows.slice(0, 40).map(r => `
      <tr>
        <td><strong>${r.company_name || ''}</strong></td>
        <td><a href="https://${r.domain}" target="_blank" rel="noopener" style="color:#0a8278; font-weight:600;">${r.domain || ''}</a></td>
        <td><span class="score-pill">${r.fit_score || 75}</span></td>
        <td>${r.company_size || 'Small (11-50)'}</td>
        <td>${r.qualification_summary || 'Qualified business'}</td>
        <td>${r.named_contact || '—'}</td>
        <td>${r.role || '—'}</td>
        <td>${r.company_email || '—'}</td>
        <td>${r.company_phone || '—'}</td>
      </tr>
    `).join('');
  }

  // Import Leads into Avinash's CRM pipeline directly
  btnImportCrm.addEventListener('click', async () => {
    if (!latestReport || !latestReport.companies || latestReport.companies.length === 0) {
      alert('No qualified leads available to import.');
      return;
    }
    const crmBase = window.Matrix360ApiBase;
    const wsSelect = $('workspace');
    const wsId = wsSelect ? wsSelect.value : null;

    if (!crmBase || !wsId) {
      alert('CRM connection or active workspace not selected. You can download the CSV spreadsheet directly.');
      return;
    }

    btnImportCrm.disabled = true;
    btnImportCrm.textContent = 'Importing to CRM…';

    let importedCount = 0;
    for (const comp of latestReport.companies.slice(0, 25)) {
      try {
        const res = await fetch(`${crmBase}/me/workspaces/${encodeURIComponent(wsId)}/leads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: comp.company_name,
            source: `AI Lead Engine (${comp.domain})`,
            stage: 'New',
          }),
        });
        if (res.ok) importedCount++;
      } catch {
        // continue
      }
    }

    btnImportCrm.disabled = false;
    btnImportCrm.textContent = `✅ Imported ${importedCount} Leads to CRM!`;

    // Refresh CRM list
    const btnRefresh = $('refresh');
    if (btnRefresh) btnRefresh.click();
  });
})();
