/* Document upload and qualification UI. All data operations use the same-origin server gateway. */
(() => {
  'use strict';

  const root = document.getElementById('services');
  if (!root || document.getElementById('document-qualification')) return;
  const accepted = '.csv,.tsv,.xlsx,.xls,.xlsb,.parquet,.jsonl,.ndjson';
  const style = document.createElement('style');
  style.textContent = `
    .m360-document-qualification{margin-top:24px}.dq-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:16px}.dq-panel{margin-top:18px;padding:18px;border:1px solid #d7e8e1;border-radius:14px;background:#fff}.dq-panel h3{margin:0 0 7px}.dq-panel p{font-size:13px;color:#617a76}.dq-dropzone{display:grid;gap:7px;border:2px dashed #a9cec4;background:#f6fbf9;border-radius:12px;padding:20px;text-align:center;cursor:pointer}.dq-dropzone span{font-size:12px;color:#617a76}.dq-dropzone input{position:absolute;inline-size:1px;block-size:1px;opacity:0;pointer-events:none}.dq-dropzone.dq-drag{border-color:#0a8278;background:#eaf7f0}.dq-file-list,.dq-schema-fields{list-style:none;padding:0;margin:13px 0;display:grid;gap:7px}.dq-file-list li,.dq-schema-fields li{display:flex;justify-content:space-between;gap:12px;padding:9px 11px;border-radius:8px;background:#f6faf8;font-size:12px}.dq-file-list span,.dq-schema-fields span{color:#617a76;text-align:right}.dq-four{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0}.dq-four label,.dq-panel>label{font-size:12px;font-weight:800}.dq-four input,.dq-panel textarea,.dq-panel select{width:100%;margin-top:5px;padding:10px;border:1px solid #c9ded5;border-radius:8px;font:inherit}.dq-actions,.dq-exports{display:flex;gap:8px;flex-wrap:wrap}.dq-status{min-height:20px}.dq-error{color:#9c2530!important}.dq-plan{white-space:pre-wrap;overflow:auto;max-height:280px;background:#102d2c;color:#e8f8f2;padding:13px;border-radius:9px;font-size:12px}.dq-counts{display:flex;gap:9px;flex-wrap:wrap;margin:13px 0}.dq-counts>div{min-width:110px;padding:10px;border:1px solid #d7e8e1;background:#f6fbf9;border-radius:9px}.dq-counts strong,.dq-counts span{display:block}.dq-counts strong{font-size:18px;color:#086d64}.dq-counts span{font-size:10px;text-transform:uppercase;color:#63807a}.dq-empty{font-size:13px;color:#617a76;padding:12px;background:#f6faf8;border-radius:8px}@media(max-width:760px){.dq-grid,.dq-four{grid-template-columns:1fr}.dq-file-list li,.dq-schema-fields li{display:block}.dq-file-list span,.dq-schema-fields span{display:block;text-align:left;margin-top:3px}}`;
  document.head.append(style);
  const profileOptions = [
    ['lakhotia', 'Lakhotia Industrial'],
    ['shree', 'Shree Heights'],
    ['vrindavan', 'Vrindavan Greens']
  ];
  let workspaceId = '';
  let selectedFiles = [];
  let datasetId = '';
  let filterPlan = null;
  let approvedPlan = null;
  let activeJobId = '';
  let poller = null;

  const section = document.createElement('section');
  section.id = 'document-qualification';
  section.className = 'card m360-document-qualification';
  section.setAttribute('aria-labelledby', 'document-qualification-title');
  section.innerHTML = `
    <div class="row"><div><span class="eyebrow">AUTHORIZED WORKSPACE DATA</span><h2 id="document-qualification-title">Document Upload &amp; Qualification</h2><p class="lede">Upload supported tabular data to your authorized workspace, inspect its schema, approve criteria and run an existing qualification profile. Nothing is fabricated or sent to a provider without an explicit action.</p></div><span id="dq-connection" class="tag tag-pending" role="status">Waiting for CRM workspace</span></div>
    <div class="dq-grid">
      <section class="dq-panel" aria-labelledby="dq-upload-title"><h3 id="dq-upload-title">1. Upload a dataset</h3><p>Supported by the processing engine: CSV, TSV, XLSX, XLS, XLSB, Parquet, JSONL and NDJSON.</p><label class="dq-dropzone" id="dq-dropzone" for="dq-files"><strong>Choose files or drop them here</strong><span>Files remain in your authorized processing workspace; do not upload confidential data unless you are authorized to do so.</span><input id="dq-files" type="file" accept="${accepted}" multiple></label><ul id="dq-file-list" class="dq-file-list" aria-live="polite"></ul><button id="dq-upload" class="btn primary" type="button" disabled>Upload to authorized workspace</button><p id="dq-upload-status" class="dq-status" role="status">Select one or more supported files after your CRM workspace is verified.</p></section>
      <section class="dq-panel" aria-labelledby="dq-schema-title"><h3 id="dq-schema-title">2. Inspect detected fields</h3><p id="dq-dataset-id">No dataset uploaded.</p><div id="dq-schema-summary" class="dq-empty">Field recognition appears only after the processing engine has inspected an uploaded dataset.</div><ul id="dq-schema-fields" class="dq-schema-fields"></ul></section>
    </div>
    <section class="dq-panel" aria-labelledby="dq-criteria-title"><h3 id="dq-criteria-title">3. Review qualification criteria</h3><label for="dq-objective">What type of leads do you want to qualify from this dataset?</label><textarea id="dq-objective" rows="3" maxlength="600" placeholder="For example: Manufacturing companies in West Bengal with an operations decision-maker."></textarea><div class="dq-four"><label>Industry / sector<input id="dq-industry" maxlength="160" placeholder="Observed sector or industry"></label><label>Business scale<input id="dq-scale" maxlength="160" placeholder="Observed turnover, revenue or size"></label><label>Designation<input id="dq-role" maxlength="160" placeholder="Observed role or title"></label><label>Documented assets / operations<input id="dq-operations" maxlength="160" placeholder="Observed fleet, plant or operational attribute"></label></div><div class="dq-actions"><button id="dq-suggest" class="btn" type="button" disabled>Get deterministic recommendation</button><button id="dq-approve" class="btn" type="button" disabled>Validate &amp; approve criteria</button></div><p id="dq-provider" class="dq-status" role="status">Recommendations use the engine’s declared provider status. This page does not claim AI use unless the engine reports it.</p><pre id="dq-plan" class="dq-plan" hidden></pre></section>
    <section class="dq-panel" aria-labelledby="dq-run-title"><h3 id="dq-run-title">4. Run qualification</h3><p>The available profiles are the engine’s current supported processing profiles. AI review is intentionally off; the selected criteria must be approved first.</p><label for="dq-profile">Qualification profile<select id="dq-profile"></select></label><button id="dq-run" class="btn primary" type="button" disabled>Start qualification</button><p id="dq-job-status" class="dq-status" role="status">Approve a validated filter plan before starting a job.</p><div id="dq-counts" class="dq-counts" aria-live="polite"></div><div id="dq-results" class="dq-empty">Actual result counts and exports appear only when the engine reports them.</div><div id="dq-exports" class="dq-exports"></div></section>`;
  root.parentNode.insertBefore(section, root);

  const nav = document.querySelector('.workspace-nav');
  if (nav && !nav.querySelector('a[href="#document-qualification"]')) {
    const link = document.createElement('a');
    link.href = '#document-qualification';
    link.textContent = 'Document Upload';
    nav.append(link);
  }
  const $ = id => document.getElementById(id);
  const byId = id => encodeURIComponent(id);
  const status = (id, message, error = false) => { const node = $(id); node.textContent = message; node.classList.toggle('dq-error', error); };
  const text = value => value == null ? '' : String(value);
  const token = () => { try { return sessionStorage.getItem('matrix360_pilot_token') || ''; } catch { return ''; } };
  const apiUrl = (op, params = {}) => {
    const query = new URLSearchParams({ op, workspace_id: workspaceId, ...params });
    return `api/document-qualification?${query.toString()}`;
  };

  async function request(op, options = {}, params = {}) {
    if (!workspaceId) throw new Error('Wait for an authorized CRM workspace to load.');
    const session = token();
    if (!session) throw new Error('Your CRM session has expired. Please sign in again.');
    let response;
    try {
      response = await fetch(apiUrl(op, params), { cache: 'no-store', ...options, headers: { Authorization: `Bearer ${session}`, ...(options.headers || {}) } });
    } catch { throw new Error('The secure document gateway could not be reached.'); }
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data && typeof data.message === 'string' ? data.message : `Request failed with HTTP ${response.status}.`);
    }
    return response;
  }

  function clearChildren(id) { $(id).replaceChildren(); }
  function addTextItem(parent, heading, detail) {
    const item = document.createElement('li');
    const strong = document.createElement('strong'); strong.textContent = heading;
    const span = document.createElement('span'); span.textContent = detail;
    item.append(strong, span); parent.append(item);
  }
  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  function renderSelectedFiles() {
    clearChildren('dq-file-list');
    for (const file of selectedFiles) addTextItem($('dq-file-list'), file.name, formatBytes(file.size));
    $('dq-upload').disabled = !workspaceId || selectedFiles.length === 0;
  }
  function renderUploadedFiles(files) {
    clearChildren('dq-file-list');
    const receivedAt = new Date().toLocaleString();
    for (const file of Array.isArray(files) ? files : []) {
      const inspection = file && file.inspection && file.inspection.status ? file.inspection.status : 'uploaded';
      addTextItem($('dq-file-list'), text(file && file.name), `${formatBytes(file && file.size_bytes)} · ${receivedAt} · ${inspection}`);
    }
  }
  function setFiles(files) {
    selectedFiles = [...files].filter(file => file && file.name);
    renderSelectedFiles();
    status('dq-upload-status', selectedFiles.length ? `${selectedFiles.length} file(s) selected. Upload has not started.` : 'Select one or more supported files after your CRM workspace is verified.');
  }
  function resetDataset() {
    datasetId = ''; filterPlan = null; approvedPlan = null; activeJobId = '';
    if (poller) { clearInterval(poller); poller = null; }
    $('dq-dataset-id').textContent = 'No dataset uploaded.';
    $('dq-schema-summary').textContent = 'Field recognition appears only after the processing engine has inspected an uploaded dataset.';
    clearChildren('dq-schema-fields'); $('dq-plan').hidden = true; $('dq-plan').textContent = '';
    $('dq-suggest').disabled = true; $('dq-approve').disabled = true; $('dq-run').disabled = true;
    $('dq-counts').replaceChildren(); $('dq-results').textContent = 'Actual result counts and exports appear only when the engine reports them.'; $('dq-exports').replaceChildren();
  }
  function showSchema(data) {
    $('dq-dataset-id').textContent = `Dataset ID: ${data.dataset_id || datasetId}`;
    const summary = data.summary || {};
    $('dq-schema-summary').textContent = `${Number(summary.fixed_fields || 0)} recognized fields, ${Number(summary.filter_fields || 0)} filterable fields, ${Number(summary.numeric_filter_fields || 0)} numeric fields. ${data.inspection && data.inspection.message ? data.inspection.message : ''}`;
    clearChildren('dq-schema-fields');
    for (const field of Array.isArray(data.fields) ? data.fields : []) {
      const label = text(field.label || field.header || field.id || 'Unnamed field');
      const detail = [field.group, field.fixed ? 'recognized' : 'observed', field.numeric_eligible ? 'numeric capable' : ''].filter(Boolean).join(' · ');
      addTextItem($('dq-schema-fields'), label, detail || 'Observed source field');
    }
    $('dq-suggest').disabled = !datasetId;
    status('dq-provider', data.ai && data.ai.available ? 'Schema AI is available in the engine, but it is not called automatically. Deterministic recommendations remain the default.' : 'Provider status: deterministic schema-only recommendation. No source rows, contact values or documents are sent to an AI provider.');
  }
  async function loadSchema() {
    const response = await request('schema', {}, { dataset_id: datasetId });
    showSchema(await response.json());
  }
  async function upload() {
    if (!selectedFiles.length) return;
    resetDataset();
    $('dq-upload').disabled = true;
    status('dq-upload-status', 'Uploading selected files to the authorized processing workspace…');
    const form = new FormData();
    for (const file of selectedFiles) form.append('files', file, file.name);
    try {
      const response = await request('upload', { method: 'POST', body: form });
      const data = await response.json();
      datasetId = text(data.dataset_id);
      if (!datasetId) throw new Error('The engine did not return a dataset ID.');
      renderUploadedFiles(data.files);
      status('dq-upload-status', `Upload complete. Dataset ${datasetId} was created by the processing engine.`);
      await loadSchema();
    } catch (error) {
      status('dq-upload-status', error.message, true);
    } finally { renderSelectedFiles(); }
  }
  function criteriaPrompt() {
    const objective = $('dq-objective').value.trim();
    const parts = [
      ['Industry / sector', $('dq-industry').value.trim()],
      ['Business scale', $('dq-scale').value.trim()],
      ['Designation', $('dq-role').value.trim()],
      ['Documented assets / operations', $('dq-operations').value.trim()]
    ].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
    return [objective, ...parts].filter(Boolean).join('\n');
  }
  async function suggest() {
    const prompt = criteriaPrompt();
    if (prompt.length < 3) return status('dq-provider', 'Describe the leads you want to qualify before requesting a recommendation.', true);
    $('dq-suggest').disabled = true;
    status('dq-provider', 'Creating a deterministic schema-only recommendation…');
    try {
      const response = await request('suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) }, { dataset_id: datasetId });
      const data = await response.json();
      filterPlan = data.draft || null; approvedPlan = null;
      $('dq-plan').hidden = false;
      $('dq-plan').textContent = JSON.stringify({ mode: data.mode, draft: data.draft, source_columns: data.source_columns, note: data.next_step }, null, 2);
      $('dq-approve').disabled = !filterPlan;
      $('dq-run').disabled = true;
      status('dq-provider', filterPlan ? `Provider status: ${data.mode || 'engine-declared'}. Review the draft, then validate and approve it.` : `Provider status: ${data.mode || 'engine-declared'}. The engine could not create a safe predicate from the available headers; edit the objective with observed column names.`);
    } catch (error) { status('dq-provider', error.message, true); }
    finally { $('dq-suggest').disabled = !datasetId; }
  }
  async function approve() {
    if (!filterPlan) return;
    $('dq-approve').disabled = true;
    status('dq-provider', 'Validating the criteria against this dataset schema…');
    try {
      const validated = await (await request('validate-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: filterPlan }) }, { dataset_id: datasetId })).json();
      const applied = await (await request('apply-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: validated.plan }) }, { dataset_id: datasetId })).json();
      approvedPlan = applied.plan;
      $('dq-plan').hidden = false; $('dq-plan').textContent = JSON.stringify({ approval: 'validated by processing engine', filter_plan_id: applied.filter_plan_id, plan: approvedPlan }, null, 2);
      $('dq-run').disabled = false;
      status('dq-provider', 'Criteria validated and approved. You may now start a qualification job.');
    } catch (error) { status('dq-provider', error.message, true); }
    finally { $('dq-approve').disabled = !filterPlan; }
  }
  function addCount(label, value) {
    const box = document.createElement('div'); const strong = document.createElement('strong'); const span = document.createElement('span');
    strong.textContent = text(value); span.textContent = label; box.append(strong, span); $('dq-counts').append(box);
  }
  function renderJob(job) {
    const report = job && typeof job.report === 'object' && job.report ? job.report : {};
    const statusText = [job.status, job.progress_phase, Number.isFinite(Number(job.progress_percent)) ? `${job.progress_percent}%` : ''].filter(Boolean).join(' · ');
    status('dq-job-status', statusText || 'The qualification engine did not report a job status.');
    $('dq-counts').replaceChildren();
    const actualCounts = { ...report, ...(report.reconciliation || {}), ...(report.export_counts || {}) };
    const labels = {
      expected_rows: 'input rows', input_rows_processed: 'processed rows', active_rows: 'output rows',
      Unique_export_candidates: 'qualified candidates', Review_Required: 'review required',
      Outside_WB: 'excluded by profile', deduplication_review_groups: 'duplicate review groups'
    };
    for (const [key, label] of Object.entries(labels)) if (Number.isFinite(Number(actualCounts[key]))) addCount(label, actualCounts[key]);
    if (!Object.keys(report).length) $('dq-results').textContent = 'The engine has not reported result counts yet.';
  }
  async function loadResultsAndExports() {
    const results = await (await request('results', {}, { id: activeJobId })).json();
    $('dq-results').textContent = `Engine results: ${Number(results.total || 0)} rows available; job status: ${results.status || 'unknown'}.`;
    const exports = await (await request('exports', {}, { id: activeJobId })).json();
    $('dq-exports').replaceChildren();
    for (const item of Array.isArray(exports.exports) ? exports.exports : []) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn'; button.textContent = `Download ${text(item.name || 'export')}`; button.disabled = !item.available;
      button.addEventListener('click', () => downloadExport(text(item.id), text(item.name)));
      $('dq-exports').append(button);
    }
  }
  async function pollJob() {
    if (!activeJobId) return;
    try {
      const job = await (await request('job', {}, { id: activeJobId })).json();
      renderJob(job);
      if (['completed', 'needs_review', 'failed', 'cancelled'].includes(String(job.status || '').toLowerCase())) {
        clearInterval(poller); poller = null;
        await loadResultsAndExports();
      }
    } catch (error) { status('dq-job-status', error.message, true); }
  }
  async function startJob() {
    if (!approvedPlan || !datasetId) return;
    $('dq-run').disabled = true;
    status('dq-job-status', 'Creating qualification job…');
    try {
      const idempotency = self.crypto && self.crypto.randomUUID ? self.crypto.randomUUID() : `dq-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const profile = $('dq-profile').value;
      const created = await (await request('create-job', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataset_id: datasetId, idempotency_key: idempotency, districts: [], client_profiles: [profile], ai_review_enabled: false, filter_plan: approvedPlan }) })).json();
      activeJobId = text(created.job_id);
      if (!activeJobId) throw new Error('The engine did not return a job ID.');
      await request('execute-job', { method: 'POST' }, { id: activeJobId });
      status('dq-job-status', `Qualification job ${activeJobId} started. Progress is from the processing engine.`);
      await pollJob();
      if (!poller) poller = setInterval(pollJob, 1500);
    } catch (error) { status('dq-job-status', error.message, true); }
    finally { $('dq-run').disabled = !approvedPlan; }
  }
  async function downloadExport(exportId, filename) {
    try {
      const response = await request('download', {}, { export_id: exportId });
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = filename || 'matrix360-export.csv'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) { status('dq-job-status', error.message, true); }
  }
  function setWorkspace(next) {
    workspaceId = text(next).trim();
    resetDataset();
    $('dq-connection').textContent = workspaceId ? 'Authorized workspace ready' : 'Waiting for CRM workspace';
    $('dq-connection').className = workspaceId ? 'tag tag-live' : 'tag tag-pending';
    status('dq-upload-status', workspaceId ? 'Choose supported files. The gateway will verify this workspace before any upload.' : 'Select one or more supported files after your CRM workspace is verified.');
    renderSelectedFiles();
  }
  for (const [value, label] of profileOptions) $('dq-profile').append(new Option(label, value));
  $('dq-files').addEventListener('change', event => setFiles(event.target.files || []));
  $('dq-dropzone').addEventListener('dragover', event => { event.preventDefault(); $('dq-dropzone').classList.add('dq-drag'); });
  $('dq-dropzone').addEventListener('dragleave', () => $('dq-dropzone').classList.remove('dq-drag'));
  $('dq-dropzone').addEventListener('drop', event => { event.preventDefault(); $('dq-dropzone').classList.remove('dq-drag'); setFiles(event.dataTransfer.files || []); });
  $('dq-upload').addEventListener('click', upload); $('dq-suggest').addEventListener('click', suggest); $('dq-approve').addEventListener('click', approve); $('dq-run').addEventListener('click', startJob);
  document.addEventListener('m360:crm-loaded', event => setWorkspace(event.detail && event.detail.workspace));
  document.addEventListener('m360:workspace-changing', () => setWorkspace(''));
  document.addEventListener('m360:session-ended', () => setWorkspace(''));
  const workspaceSelect = document.getElementById('workspace');
  if (workspaceSelect && workspaceSelect.value) setWorkspace(workspaceSelect.value);
})();
