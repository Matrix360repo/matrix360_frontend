(function initMatrix360MapsScraperV4() {
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeHref(url) {
    const s = String(url ?? '').trim();
    if (/^https?:\/\//i.test(s)) return escapeHtml(s);
    return '#';
  }

  function formatDuration(sec) {
    if (sec === undefined || sec === null || sec < 0) return 'Calculating...';
    const s = Math.max(0, Math.floor(sec));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const remSec = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (hrs > 0) return `${hrs}h${pad(mins)}m ${pad(remSec)}s`;
    return `${pad(mins)}m ${pad(remSec)}s`;
  }

  function formatFinishClockTime(etaSeconds) {
    if (!etaSeconds || etaSeconds <= 0) return '';
    const finishDate = new Date(Date.now() + etaSeconds * 1000);
    return finishDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function setupScraperV4() {
    const runBtn = document.getElementById('m360-scraper-run-btn');
    const stopBtn = document.getElementById('m360-scraper-stop-btn');
    const loadDbBtn = document.getElementById('m360-scraper-load-db-btn');
    const clearDbBtn = document.getElementById('m360-scraper-clear-db-btn');
    const exportCsvBtn = document.getElementById('m360-scraper-export-csv-btn');
    const pushAllBtn = document.getElementById('m360-scraper-push-all-btn');

    const queryInput = document.getElementById('m360-scraper-query');
    const locationInput = document.getElementById('m360-scraper-location');
    const contactFilterSelect = document.getElementById('m360-scraper-contact-filter');
    const entityFilterSelect = document.getElementById('m360-scraper-entity-filter');
    const titlesInput = document.getElementById('m360-scraper-titles');
    const exclusionsInput = document.getElementById('m360-scraper-exclusions');
    const companySizeSelect = document.getElementById('m360-scraper-company-size');
    const sliderInput = document.getElementById('m360-scraper-slider');
    const limitInput = document.getElementById('m360-scraper-limit');
    const stageSelect = document.getElementById('m360-scraper-stage');
    const pvtLtdHiddenCheckbox = document.getElementById('m360-scraper-pvt-ltd-only');

    const statSaved = document.getElementById('m360-stat-saved');
    const statScanned = document.getElementById('m360-stat-scanned');
    const statSkipped = document.getElementById('m360-stat-skipped');
    const elapsedEl = document.getElementById('m360-scraper-elapsed');
    const etaEl = document.getElementById('m360-scraper-eta');
    const etaDetailEl = document.getElementById('m360-scraper-eta-detail');
    const statusDot = document.getElementById('m360-status-dot');
    const phaseBadge = document.getElementById('m360-scraper-phase-badge');
    const phaseText = document.getElementById('m360-scraper-phase-text');
    const progressStats = document.getElementById('m360-scraper-progress-stats');
    const percentEl = document.getElementById('m360-scraper-percent');
    const progressBar = document.getElementById('m360-scraper-progress-bar');

    const filterTurnover = document.getElementById('m360-filter-turnover');
    const filterDm = document.getElementById('m360-filter-dm');
    const filterEmail = document.getElementById('m360-filter-email');
    const filterPhone = document.getElementById('m360-filter-phone');
    const tableSearchInput = document.getElementById('m360-scraper-table-search');

    const suppToggleBtn = document.getElementById('m360-scraper-suppression-toggle-btn');
    const suppDrawer = document.getElementById('m360-suppression-drawer');
    const suppBadge = document.getElementById('m360-suppression-count-badge');
    const suppTextarea = document.getElementById('m360-suppression-textarea');
    const suppAddBtn = document.getElementById('m360-suppression-add-btn');
    const suppClearBtn = document.getElementById('m360-suppression-clear-btn');
    const suppFileInput = document.getElementById('m360-suppression-file-input');
    const suppTagsWrap = document.getElementById('m360-suppression-tags-wrap');

    const statusBox = document.getElementById('m360-scraper-status');
    const resultsTbody = document.getElementById('m360-scraper-results-tbody');
    const resultsCount = document.getElementById('m360-scraper-results-count');

    if (!runBtn || !resultsTbody) return;

    let currentEntityTab = 'all';
    let allLoadedLeads = [];
    let pollTimer = null;

    function setStatus(message, type) {
      if (!statusBox) return;
      statusBox.style.display = 'block';
      statusBox.textContent = message;
      if (type === 'error') {
        statusBox.style.background = '#fef2f2';
        statusBox.style.color = '#b91c1c';
        statusBox.style.border = '1px solid #fecaca';
      } else if (type === 'success') {
        statusBox.style.background = '#e4f3ec';
        statusBox.style.color = '#0f6b5e';
        statusBox.style.border = '1px solid #99f6e4';
      } else {
        statusBox.style.background = '#f1f5f9';
        statusBox.style.color = '#334155';
        statusBox.style.border = '1px solid #cbd5e1';
      }
    }

    function syncQuotaValue(val) {
      const clamped = Math.max(1, Math.min(2000, parseInt(val, 10) || 200));
      if (limitInput) limitInput.value = String(clamped);
      if (sliderInput) sliderInput.value = String(clamped);
    }

    if (sliderInput) sliderInput.addEventListener('input', (e) => syncQuotaValue(e.target.value));
    if (limitInput) limitInput.addEventListener('input', (e) => syncQuotaValue(e.target.value));


    if (pvtLtdHiddenCheckbox) {
      pvtLtdHiddenCheckbox.addEventListener('change', () => {
        if (entityFilterSelect) {
          entityFilterSelect.value = pvtLtdHiddenCheckbox.checked ? 'pvt_ltd' : 'all';
        }
        applyClientFiltersAndRender();
      });
    }

    document.querySelectorAll('.m360-entity-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentEntityTab = btn.getAttribute('data-tab') || 'all';
        document.querySelectorAll('.m360-entity-tab').forEach((other) => {
          const active = other === btn;
          other.style.background = active ? '#0f6b5e' : '#f3f8f5';
          other.style.color = active ? '#ffffff' : '#102a26';
          other.style.borderColor = active ? '#0f6b5e' : '#d5e3dd';
          other.style.fontWeight = active ? '700' : '600';
        });
        applyClientFiltersAndRender();
      });
    });

    async function pushLeadToNativePipeline(leadObj) {
      const targetStage = stageSelect ? stageSelect.value : (leadObj.stage || 'enquiry');
      const bName = leadObj.business_name || leadObj.name || 'Unnamed Business';
      const dmPart = leadObj.dm_name ? ` • DM: ${leadObj.dm_name}` : '';
      const leadName = `${bName}${dmPart}`.slice(0, 195);
      const leadSource = `Maps V4 (${leadObj.niche || leadObj.category || 'B2B'} • ${leadObj.location || 'India'})`.slice(0, 145);

      const nameInp = document.getElementById('lead-name');
      const sourceInp = document.getElementById('lead-source');
      const stageSel = document.getElementById('lead-stage');
      const addForm = document.getElementById('add-form');

      if (nameInp && sourceInp && addForm) {
        nameInp.value = leadName;
        sourceInp.value = leadSource;
        if (stageSel && Array.from(stageSel.options).some((o) => o.value === targetStage)) {
          stageSel.value = targetStage;
        }
        addForm.requestSubmit ? addForm.requestSubmit() : addForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        return true;
      }
      return false;
    }

    function getFilteredLeads() {
      const q = (tableSearchInput ? tableSearchInput.value : '').trim().toLowerCase();
      const reqTurnover = Boolean(filterTurnover && filterTurnover.checked);
      const reqDm = Boolean(filterDm && filterDm.checked);
      const reqEmail = Boolean(filterEmail && filterEmail.checked);
      const reqPhone = Boolean(filterPhone && filterPhone.checked);
      const pvtOnly = Boolean(pvtLtdHiddenCheckbox && pvtLtdHiddenCheckbox.checked) || currentEntityTab === 'pvt_ltd';

      return allLoadedLeads.filter((l) => {
        const entity = l.entity_type || (/\b(pvt\.?\s*ltd|private\s+limited)\b/i.test(l.business_name || l.name || '') ? 'Pvt Ltd' : 'Other');
        if (pvtOnly && entity !== 'Pvt Ltd') return false;
        if (currentEntityTab === 'other' && entity === 'Pvt Ltd') return false;
        if (reqTurnover && (!l.turnover || l.turnover === 'Not Disclosed')) return false;
        if (reqDm && !l.dm_name && !l.dm_linkedin) return false;
        if (reqEmail && !l.email && !l.dm_email) return false;
        if (reqPhone && !l.phone) return false;
        if (q) {
          const hay = [
            l.business_name, l.name, l.entity_type, l.turnover, l.cin_or_gst,
            l.dm_name, l.dm_role, l.email, l.phone, l.location, l.niche, l.address
          ].join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    }

    function applyClientFiltersAndRender() {
      const filtered = getFilteredLeads();
      resultsTbody.innerHTML = '';
      if (resultsCount) {
        resultsCount.textContent = `${filtered.length} verified lead${filtered.length === 1 ? '' : 's'}`;
      }
      if (pushAllBtn) {
        pushAllBtn.style.display = filtered.length > 0 ? 'inline-flex' : 'none';
      }

      if (!filtered.length) {
        resultsTbody.innerHTML = `
          <tr>
            <td colspan="8" style="padding: 28px; text-align: center; color: #64748b; font-size: 0.85rem;">
              No verified prospects match the current view filters. Click <strong>Start Discovery →</strong> to run the 6-Tab Maps &amp; DNS MX Engine.
            </td>
          </tr>
        `;
        return;
      }

      filtered.forEach((l, idx) => {
        const bName = l.business_name || l.name || 'Unnamed Business';
        const isPvt = (l.entity_type === 'Pvt Ltd') || /\b(pvt\.?\s*ltd|private\s+limited)\b/i.test(bName);
        const entityBadge = isPvt
          ? `<span style="display:inline-block; font-size:0.7rem; font-weight:700; padding:2px 8px; border-radius:999px; background:#e4f3ec; color:#0f6b5e;">🏢 Pvt Ltd</span>`
          : `<span style="display:inline-block; font-size:0.7rem; font-weight:700; padding:2px 8px; border-radius:999px; background:#fdf3e1; color:#966216;">🏭 ${escapeHtml(l.entity_type || 'Other')}</span>`;

        const turnoverHtml = (l.turnover && l.turnover !== 'Not Disclosed')
          ? `<div style="margin-top:4px; font-size:0.76rem; font-family:monospace; font-weight:700; color:#0f6b5e;">💰 ${escapeHtml(l.turnover)}</div>`
          : `<div style="margin-top:4px; font-size:0.72rem; color:#7a8f89;">Turnover: Not Disclosed</div>`;

        const regHtml = l.cin_or_gst
          ? `<div style="margin-top:2px; font-size:0.68rem; font-family:monospace; color:#5a6e69;">${escapeHtml(l.cin_or_gst)}</div>`
          : '';

        const dmHtml = l.dm_name
          ? `<div style="font-weight:700; color:#102a26;">${escapeHtml(l.dm_name)}</div>
             <div style="font-size:0.74rem; color:#5a6e69;">${escapeHtml(l.dm_role || 'Executive')}</div>
             ${l.dm_linkedin ? `<a href="${safeHref(l.dm_linkedin)}" target="_blank" rel="noopener" style="display:inline-block; margin-top:2px; font-size:0.72rem; font-weight:600; color:#0f6b5e;">View LinkedIn →</a>` : ''}`
          : (l.dm_linkedin
              ? `<a href="${safeHref(l.dm_linkedin)}" target="_blank" rel="noopener" style="font-size:0.75rem; font-weight:600; color:#0f6b5e;">Executive LinkedIn →</a>`
              : `<span style="color:#8fa39e; font-size:0.75rem;">Not listed</span>`);

        const emailBadge = l.email
          ? `<div style="color:#102a26; font-family:monospace; font-size:0.76rem; font-weight:600;">${escapeHtml(l.email)}</div>
             <span style="display:inline-block; margin-top:3px; font-size:0.68rem; background:#e4f3ec; color:#0f6b5e; padding:1px 7px; border-radius:999px; font-weight:700;">✓ ${escapeHtml(l.email_status || 'Verified (MX)')}</span>`
          : `<span style="color:#8fa39e; font-size:0.75rem;">—</span>`;

        const phoneBadge = l.phone
          ? `<div style="color:#102a26; font-family:monospace; font-size:0.76rem; font-weight:600; white-space:nowrap;">${escapeHtml(l.phone)}</div>
             <span style="display:inline-block; margin-top:3px; font-size:0.68rem; background:#e4f3ec; color:#0f6b5e; padding:1px 7px; border-radius:999px; font-weight:700;">✓ ${escapeHtml(l.phone_status || 'Valid')}</span>`
          : `<span style="color:#8fa39e; font-size:0.75rem;">—</span>`;

        const socials = [];
        if (l.website) socials.push(`<a href="${safeHref(l.website)}" target="_blank" rel="noopener" style="color:#0f6b5e; font-weight:700;">Website →</a>`);
        if (l.linkedin) socials.push(`<a href="${safeHref(l.linkedin)}" target="_blank" rel="noopener" style="color:#0f6b5e;">LI</a>`);
        if (l.instagram) socials.push(`<a href="${safeHref(l.instagram)}" target="_blank" rel="noopener" style="color:#0f6b5e;">IG</a>`);
        if (l.facebook) socials.push(`<a href="${safeHref(l.facebook)}" target="_blank" rel="noopener" style="color:#0f6b5e;">FB</a>`);

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #e8f0ec';
        tr.style.verticalAlign = 'top';
        tr.innerHTML = `
          <td style="padding: 12px 13px;">
            <a href="${safeHref(l.maps_url)}" target="_blank" rel="noopener" style="font-weight:700; color:#102a26; text-decoration:none;">${escapeHtml(bName)}</a>
            <div style="font-size:0.75rem; font-weight:600; color:#4a635d; margin-top:2px;">📍 ${escapeHtml(l.location || '')}${l.rating ? ` • ★ ${escapeHtml(l.rating)}` : ''}</div>
            <div style="font-size:0.7rem; color:#7a8f89; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(l.address || '')}</div>
          </td>
          <td style="padding: 12px 13px;">
            ${entityBadge}
            ${turnoverHtml}${regHtml}
          </td>
          <td style="padding: 12px 13px;">${dmHtml}</td>
          <td style="padding: 12px 13px;">${emailBadge}</td>
          <td style="padding: 12px 13px;">${phoneBadge}</td>
          <td style="padding: 12px 13px;">
            <div style="font-weight:600; color:#102a26; font-size:0.76rem;">${escapeHtml(l.niche || l.category || '')}</div>
            <div style="color:#5a6e69; font-size:0.72rem; margin-top:2px;">${escapeHtml(l.company_size || 'Not Disclosed')}</div>
          </td>
          <td style="padding: 12px 13px; font-size:0.75rem;">${socials.join(' · ') || '—'}</td>
          <td style="padding: 12px 13px; text-align: right;">
            <button type="button" data-filtered-idx="${idx}" class="m360-push-single-lead-btn" style="background: #0f6b5e; color: #ffffff; border: none; border-radius: 8px; padding: 6px 12px; font-size: 0.76rem; font-weight: 700; cursor: pointer; white-space: nowrap;">
              + Push to Pipeline
            </button>
          </td>
        `;
        resultsTbody.appendChild(tr);
      });

      resultsTbody.querySelectorAll('.m360-push-single-lead-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const idx = Number(btn.getAttribute('data-filtered-idx'));
          const lead = filtered[idx];
          if (!lead) return;
          btn.disabled = true;
          btn.textContent = 'Pushed ✓';
          btn.style.background = '#64748b';
          await pushLeadToNativePipeline(lead);
          setStatus(`Added "${lead.business_name || lead.name}" to your active sales pipeline above.`, 'success');
        });
      });
    }

    [filterTurnover, filterDm, filterEmail, filterPhone, tableSearchInput].forEach((el) => {
      if (el) {
        el.addEventListener('input', applyClientFiltersAndRender);
        el.addEventListener('change', applyClientFiltersAndRender);
      }
    });

    async function fetchSavedLeads() {
      try {
        const res = await fetch(`/api/scraper/leads?_t=${Date.now()}`);
        const data = await res.json();
        allLoadedLeads = Array.isArray(data.leads) ? data.leads : (Array.isArray(data) ? data : []);
        if (statSaved && !pollTimer) statSaved.textContent = String(allLoadedLeads.length);
        applyClientFiltersAndRender();
      } catch (err) {
        setStatus(`Could not load saved leads: ${err.message}`, 'error');
      }
    }

    function updateTelemetryUI(st) {
      if (!st) return;
      if (statSaved && st.processed !== undefined) statSaved.textContent = String(st.processed);
      if (statScanned && st.scanned !== undefined) statScanned.textContent = String(st.scanned);
      if (statSkipped && st.skipped !== undefined) statSkipped.textContent = String(st.skipped);
      if (elapsedEl && st.elapsed_seconds !== undefined) elapsedEl.textContent = formatDuration(st.elapsed_seconds);

      if (st.running) {
        if (statusDot) statusDot.style.background = '#c87a19';
        if (stopBtn) stopBtn.style.display = 'inline-block';
        if (runBtn) runBtn.disabled = true;
        if (st.eta_seconds > 0) {
          if (etaEl) etaEl.textContent = `~${formatDuration(st.eta_seconds)}`;
          if (etaDetailEl) etaDetailEl.textContent = `Finishes around ${formatFinishClockTime(st.eta_seconds)}`;
        } else {
          if (etaEl) etaEl.textContent = 'Calculating...';
          if (etaDetailEl) etaDetailEl.textContent = 'Estimating velocity...';
        }
      } else {
        if (statusDot) statusDot.style.background = '#11694b';
        if (stopBtn) stopBtn.style.display = 'none';
        if (runBtn) runBtn.disabled = false;
        if (st.processed > 0 && st.phase === 'Complete') {
          if (etaEl) etaEl.textContent = 'Completed';
          if (etaDetailEl) etaDetailEl.textContent = `Finished in ${formatDuration(st.elapsed_seconds || 0)}`;
        }
      }

      if (phaseBadge && st.phase) phaseBadge.textContent = st.phase;
      if (phaseText && st.message) phaseText.textContent = st.message;
      if (progressStats) progressStats.textContent = `${st.processed || 0} / ${st.total || 0} Verified Leads`;
      const pct = Math.min(100, Math.round(st.percent || 0));
      if (percentEl) percentEl.textContent = `Progress: ${pct}%`;
      if (progressBar) progressBar.style.width = `${pct}%`;

      if (Array.isArray(st.leads) && st.leads.length > 0) {
        allLoadedLeads = st.leads;
        applyClientFiltersAndRender();
      }
    }

    function startStatusPolling() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(async () => {
        try {
          const res = await fetch(`/api/scraper/status?_t=${Date.now()}`);
          const st = await res.json();
          updateTelemetryUI(st);
          if (!st.running) {
            clearInterval(pollTimer);
            pollTimer = null;
            await fetchSavedLeads();
          }
        } catch {}
      }, 1000);
    }

    runBtn.addEventListener('click', async () => {
      const kw = (queryInput ? queryInput.value : '').trim();
      const loc = (locationInput ? locationInput.value : '').trim();
      if (!kw || !loc) {
        setStatus('Please enter both Keywords / Target Industries and Geography / Company HQ before starting discovery.', 'error');
        return;
      }

      const payload = {
        keyword: kw,
        query: kw,
        location: loc,
        max_leads: parseInt(limitInput ? limitInput.value : '200', 10) || 200,
        max_results: parseInt(limitInput ? limitInput.value : '200', 10) || 200,
        target_titles: (titlesInput ? titlesInput.value : '').trim(),
        exclusions: (exclusionsInput ? exclusionsInput.value : '').trim(),
        company_size: companySizeSelect ? companySizeSelect.value : '11–50 to 1,001–5,000',
        require_mode: contactFilterSelect ? contactFilterSelect.value : 'both',
        contact_filter: contactFilterSelect ? contactFilterSelect.value : 'both',
        entity_filter: entityFilterSelect ? entityFilterSelect.value : 'all',
        pvt_ltd_only: (entityFilterSelect && entityFilterSelect.value === 'pvt_ltd') || Boolean(pvtLtdHiddenCheckbox && pvtLtdHiddenCheckbox.checked),
        apply_suppression: true
      };

      runBtn.disabled = true;
      if (stopBtn) stopBtn.style.display = 'inline-block';
      setStatus(`Launching 6-Tab Google Maps + DNS MX Verification Pipeline for "${payload.keyword}" in "${payload.location}"...`, 'info');

      try {
        const res = await fetch('/api/scraper/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (Array.isArray(data.leads) && data.leads.length) {
          allLoadedLeads = data.leads;
          applyClientFiltersAndRender();
        }
        startStatusPolling();
      } catch (err) {
        setStatus(`Scraper launch error: ${err.message}`, 'error');
        runBtn.disabled = false;
      }
    });

    if (stopBtn) {
      stopBtn.addEventListener('click', async () => {
        await fetch('/api/scraper/stop', { method: 'POST' });
        setStatus('Stop requested. Saving verified leads collected so far...', 'info');
      });
    }

    if (loadDbBtn) {
      loadDbBtn.addEventListener('click', async () => {
        await fetchSavedLeads();
        setStatus(`Loaded ${allLoadedLeads.length} verified leads from leads.db.`, 'success');
      });
    }

    if (clearDbBtn) {
      clearDbBtn.addEventListener('click', async () => {
        await fetch('/api/scraper/leads', { method: 'DELETE' });
        allLoadedLeads = [];
        applyClientFiltersAndRender();
        if (statSaved) statSaved.textContent = '0';
        setStatus('Cleared saved scraper database.', 'info');
      });
    }

    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', () => {
        const hasTurnover = Boolean(filterTurnover && filterTurnover.checked);
        const hasDm = Boolean(filterDm && filterDm.checked);
        const hasEmail = Boolean(filterEmail && filterEmail.checked);
        const hasPhone = Boolean(filterPhone && filterPhone.checked);
        const search = encodeURIComponent((tableSearchInput ? tableSearchInput.value : '').trim());
        window.location.href = `/api/scraper/export.csv?entity_category=${currentEntityTab}&has_turnover=${hasTurnover}&has_dm=${hasDm}&has_email=${hasEmail}&has_phone=${hasPhone}&search=${search}`;
      });
    }

    if (pushAllBtn) {
      pushAllBtn.addEventListener('click', async () => {
        const buttons = Array.from(resultsTbody.querySelectorAll('.m360-push-single-lead-btn:not(:disabled)'));
        for (const b of buttons) {
          b.click();
          await new Promise((r) => setTimeout(r, 180));
        }
      });
    }

    // Suppression Drawer
    async function loadSuppressionList() {
      try {
        const res = await fetch(`/api/scraper/suppression?_t=${Date.now()}`);
        const data = await res.json();
        const items = data.items || [];
        if (suppBadge) suppBadge.textContent = String(data.count ?? items.length);
        if (suppTagsWrap) {
          suppTagsWrap.innerHTML = '';
          items.forEach((item) => {
            const val = typeof item === 'string' ? item : (item.value || item.term || '');
            if (!val) return;
            const span = document.createElement('span');
            span.style.cssText = 'display:inline-flex; align-items:center; gap:5px; background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; border-radius:999px; padding:3px 9px; font-size:0.74rem; font-family:monospace;';
            span.innerHTML = `${escapeHtml(val)} <button type="button" data-rem="${escapeHtml(val)}" style="border:none; background:none; color:#dc2626; cursor:pointer; font-weight:700;">✕</button>`;
            suppTagsWrap.appendChild(span);
          });
          suppTagsWrap.querySelectorAll('button[data-rem]').forEach((b) => {
            b.addEventListener('click', async () => {
              const term = b.getAttribute('data-rem');
              await fetch('/api/scraper/suppression', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'remove', terms: [term] })
              });
              await loadSuppressionList();
            });
          });
        }
      } catch {}
    }

    if (suppToggleBtn && suppDrawer) {
      suppToggleBtn.addEventListener('click', () => {
        suppDrawer.style.display = suppDrawer.style.display === 'none' ? 'block' : 'none';
      });
    }

    if (suppAddBtn && suppTextarea) {
      suppAddBtn.addEventListener('click', async () => {
        const raw = suppTextarea.value.trim();
        if (!raw) return;
        const terms = raw.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean);
        await fetch('/api/scraper/suppression', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', raw_text: raw, terms })
        });
        suppTextarea.value = '';
        await loadSuppressionList();
      });
    }

    if (suppFileInput) {
      suppFileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const text = await file.text();
        const terms = text.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean);
        await fetch('/api/scraper/suppression', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', raw_text: text, terms })
        });
        suppFileInput.value = '';
        await loadSuppressionList();
      });
    }

    if (suppClearBtn) {
      suppClearBtn.addEventListener('click', async () => {
        await fetch('/api/scraper/suppression', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'clear', terms: [] })
        });
        await loadSuppressionList();
      });
    }

    fetchSavedLeads();
    loadSuppressionList();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupScraperV4);
  } else {
    setupScraperV4();
  }
})();
