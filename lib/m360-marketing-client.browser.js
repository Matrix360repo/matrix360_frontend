(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const CHANNELS = ['WhatsApp', 'Email', 'Facebook', 'Instagram', 'LinkedIn', 'X', 'YouTube', 'Google Business Profile', 'SMS', 'Website'];

  let activeTask = null;
  let activeChannel = 'WhatsApp';
  let pollInterval = null;
  let toastTimer = null;

  const auth = () => {
    try {
      const val = sessionStorage.getItem('matrix360_pilot_token');
      return val && +sessionStorage.getItem('matrix360_pilot_expires_at') > Date.now() ? val : null;
    } catch { return null; }
  };

  function getActiveClientInfo() {
    const wsSelect = $('workspace');
    const wsId = wsSelect?.value || sessionStorage.getItem('matrix360_active_workspace') || '';
    const selectedOpt = wsSelect?.selectedOptions?.[0] || (wsSelect && wsSelect.selectedIndex >= 0 ? wsSelect.options[wsSelect.selectedIndex] : null);
    let clientName = selectedOpt?.text ? selectedOpt.text.split('(')[0].trim() : '';
    if (!clientName || clientName.startsWith('--')) {
      clientName = 'Your Business';
    }
    return { wsId, clientName };
  }

  const ws = () => getActiveClientInfo().wsId;

  function notify(message, tone = 'info') {
    let toast = $('m360-mkt-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'm360-mkt-toast';
      toast.className = 'm360-control-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.dataset.tone = tone;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, tone === 'success' ? 8000 : 5000);
  }

  function injectMarketingStyles() {
    if ($('m360-marketing-styles')) return;
    const style = document.createElement('style');
    style.id = 'm360-marketing-styles';
    style.textContent = `
      #marketing-centre.m360-mp-hidden-section,
      #marketing-centre[data-m360-page-hidden="true"] {
        display: none !important;
      }
      #marketing-centre {
        box-sizing: border-box;
        min-height: 62vh;
        padding: clamp(20px, 3vw, 38px);
        margin: 18px 0 35px;
        border: 1px solid #9fb9b0;
        border-top: 4px solid #176451;
        border-radius: 16px;
        background: #f6faf8;
        color: #163c32;
        overflow-wrap: anywhere;
        display: grid;
        gap: 24px;
        font-family: inherit;
      }
      #marketing-centre * { box-sizing: border-box; min-width: 0; }
      #marketing-centre h2 { font-size: clamp(24px, 3vw, 34px); margin: 4px 0 10px; color: #163c32; }
      #marketing-centre textarea {
        display: block;
        width: 100%;
        min-height: 120px;
        padding: 16px;
        margin: 10px 0 14px;
        border: 1px solid #708d82;
        border-radius: 10px;
        background: #ffffff;
        color: #173b31;
        font: inherit;
        resize: vertical;
      }
      #marketing-centre button {
        padding: 10px 16px;
        border: 1px solid #729286;
        border-radius: 8px;
        background: #ffffff;
        color: #173b31;
        cursor: pointer;
        font: inherit;
        white-space: normal;
        font-weight: 500;
        transition: background-color 0.15s, border-color 0.15s;
      }
      #marketing-centre button:hover { background: #eef6f3; }
      #marketing-centre button:disabled { opacity: .6; cursor: wait; }
      #marketing-centre button.primary { background: #155b49; color: #ffffff; border: none; font-weight: 600; }
      #marketing-centre button.primary:hover { background: #0f4c3c; }
      #marketing-centre button:focus-visible, #marketing-centre textarea:focus-visible, #marketing-centre input:focus-visible {
        outline: 3px solid #146bad;
        outline-offset: 3px;
      }

      .m360-kicker {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #176451;
        margin: 0 0 6px;
      }
      .m360-suggestions-wrap {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin: 14px 0;
      }
      .m360-suggestions-wrap button {
        padding: 7px 13px;
        font-size: 13px;
        border-radius: 20px;
        background: #edf6f2;
        border: 1px solid #a5c7bb;
        color: #164338;
      }
      .m360-suggestions-wrap button:hover {
        background: #dbeef7;
        border-color: #72a9bf;
      }

      /* Cards & Containers */
      .m360-card {
        padding: 22px;
        background: #ffffff;
        border: 1px solid #c1d3cb;
        border-radius: 14px;
        box-shadow: 0 8px 24px rgba(15, 76, 69, 0.06);
      }
      .m360-card h3 {
        margin: 0 0 8px;
        font-size: 18px;
        color: #163c32;
        font-weight: 700;
      }
      .m360-subtext {
        font-size: 13.5px;
        color: #49675d;
        margin: 0 0 16px;
        line-height: 1.5;
      }

      /* Neural Mesh */
      .m360-mesh-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid #e1ede8;
      }
      .m360-mesh-title {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 16px;
        font-weight: 700;
        color: #163c32;
      }
      .m360-mesh-pulse {
        width: 10px;
        height: 10px;
        background: #176451;
        border-radius: 50%;
        display: inline-block;
        box-shadow: 0 0 0 3px rgba(23, 100, 81, 0.25);
        animation: m360Pulse 2s infinite;
      }
      @keyframes m360Pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.2); opacity: 0.7; }
      }
      .m360-mesh-badge {
        font-size: 11.5px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #176451;
        background: #edf6f2;
        padding: 5px 12px;
        border-radius: 20px;
        border: 1px solid #b7d6ca;
      }
      .m360-agent-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }
      .m360-agent-box {
        background: #f6faf8;
        border: 1px solid #cbdcd5;
        border-radius: 12px;
        padding: 14px 16px;
      }
      .m360-agent-box.active {
        background: #edf8f4;
        border-color: #176451;
        border-width: 2px;
      }
      .m360-agent-box-head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
      }
      .m360-agent-tag {
        font-size: 11px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 4px;
        background: #d5e6df;
        color: #174c40;
      }
      .m360-agent-name {
        font-size: 14px;
        font-weight: 700;
        color: #163c32;
      }
      .m360-agent-status {
        font-size: 12px;
        color: #176451;
        font-weight: 600;
        margin-bottom: 4px;
      }
      .m360-agent-desc {
        font-size: 12.5px;
        color: #49675d;
        margin: 0;
        line-height: 1.45;
      }
      .m360-agent-toolbar {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 14px;
      }
      .m360-agent-toolbar button {
        font-size: 13px;
        padding: 8px 14px;
      }

      /* Monospace Terminal */
      .m360-terminal-wrap {
        background: #0f2420;
        border: 1px solid #081614;
        border-radius: 10px;
        padding: 14px 16px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
        line-height: 1.6;
        color: #a7d3c4;
        max-height: 140px;
        overflow-y: auto;
      }
      .m360-term-line { margin: 2px 0; }
      .m360-term-ts { color: #5b8778; }
      .m360-term-tag { color: #4ade80; font-weight: bold; }

      /* Stepper */
      .m360-stepper-wrap {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
        gap: 8px;
        margin: 6px 0 16px;
      }
      .m360-step {
        background: #ffffff;
        border: 1px solid #cbdcd5;
        border-radius: 10px;
        padding: 10px 12px;
        text-align: center;
      }
      .m360-step.done {
        background: #edf8f4;
        border-color: #8ec3b1;
      }
      .m360-step.active {
        background: #e6f4ef;
        border: 2px solid #176451;
      }
      .m360-step em {
        display: block;
        font-style: normal;
        font-size: 11px;
        font-weight: 700;
        color: #5b8778;
      }
      .m360-step.active em { color: #176451; }
      .m360-step strong {
        display: block;
        font-size: 12.5px;
        color: #163c32;
        margin: 2px 0;
      }
      .m360-step small {
        font-size: 11px;
        color: #6b8c82;
      }

      /* 10 Channel Tabs */
      .m360-tabs-bar {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid #d5e6df;
      }
      .m360-tab-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px !important;
        font-size: 13px !important;
        border-radius: 8px !important;
        background: #ffffff !important;
        border: 1px solid #cbdcd5 !important;
        color: #163c32 !important;
        font-weight: 500 !important;
      }
      .m360-tab-pill.active {
        background: #155b49 !important;
        border-color: #155b49 !important;
        color: #ffffff !important;
        font-weight: 600 !important;
      }
      .m360-tab-pill.active .m360-tab-badge {
        background: rgba(255, 255, 255, 0.25);
        color: #ffffff;
      }
      .m360-tab-badge {
        font-size: 10.5px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 4px;
        background: #e2ede8;
        color: #174c40;
      }

      /* 3-Gate Readiness Row */
      .m360-gates-wrap {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }
      .m360-gate-item {
        background: #f6faf8;
        border: 1px solid #cbdcd5;
        border-radius: 10px;
        padding: 12px 14px;
      }
      .m360-gate-item h4 {
        margin: 0 0 4px;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #49675d;
      }
      .m360-gate-val {
        font-size: 13.5px;
        font-weight: 600;
      }
      .m360-gate-pass { color: #166534; }
      .m360-gate-warn { color: #92400e; }
      .m360-gate-fail { color: #991b1b; }

      /* Mockups */
      .m360-wa-mockup {
        background: #e5ddd5;
        border: 1px solid #cbdcd5;
        border-radius: 12px;
        overflow: hidden;
        margin: 12px 0;
      }
      .m360-wa-header {
        background: #075e54;
        color: #ffffff;
        padding: 10px 14px;
        font-size: 13.5px;
        font-weight: 600;
      }
      .m360-wa-bubble {
        background: #ffffff;
        margin: 14px 14px 10px;
        padding: 12px 14px;
        border-radius: 0 10px 10px 10px;
        font-size: 13.5px;
        line-height: 1.55;
        color: #111827;
        white-space: pre-wrap;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
      }
      .m360-wa-btn-cta {
        background: #ffffff;
        margin: 0 14px 14px;
        padding: 10px 14px;
        border-radius: 8px;
        text-align: center;
        font-size: 13px;
        font-weight: 600;
        color: #0284c7;
        border-top: 1px solid #e2e8f0;
      }
      .m360-email-mockup {
        background: #ffffff;
        border: 1px solid #cbdcd5;
        border-radius: 12px;
        padding: 16px;
        margin: 12px 0;
      }
      .m360-email-field {
        font-size: 12.5px;
        color: #49675d;
        padding: 4px 0;
        border-bottom: 1px solid #f1f5f9;
      }
      .m360-email-body {
        margin: 14px 0;
        font-size: 13.5px;
        line-height: 1.6;
        color: #1e293b;
        white-space: pre-wrap;
      }

      /* Visual Diff */
      .m360-diff-viewer {
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        padding: 12px 14px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
        line-height: 1.6;
        max-height: 180px;
        overflow-y: auto;
      }
      .m360-diff-add { color: #166534; background: #dcfce7; display: block; padding: 2px 4px; }
      .m360-diff-rem { color: #991b1b; background: #fee2e2; display: block; padding: 2px 4px; }
      .m360-diff-same { color: #475569; display: block; padding: 2px 4px; }

      /* CTWA Card */
      .m360-ctwa-card {
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        border-radius: 12px;
        padding: 16px 18px;
        margin: 14px 0;
      }
      .m360-ctwa-card h4 {
        margin: 0 0 6px;
        font-size: 14px;
        font-weight: 700;
        color: #1e40af;
      }

      /* Budget Sliders */
      .m360-slider-row {
        display: grid;
        grid-template-columns: 140px 1fr 100px;
        align-items: center;
        gap: 14px;
        margin: 10px 0;
      }
      .m360-slider-row input[type=range] {
        width: 100%;
        accent-color: #155b49;
      }

      /* Tables */
      .m360-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12.5px;
        margin: 10px 0;
      }
      .m360-table th {
        text-align: left;
        padding: 8px 10px;
        background: #edf6f2;
        color: #164338;
        font-weight: 700;
        border-bottom: 1px solid #cbdcd5;
      }
      .m360-table td {
        padding: 8px 10px;
        border-bottom: 1px solid #e7f0ec;
        color: #1f2937;
      }

      /* Grids */
      .m360-grid-2 {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 18px;
      }

      /* Authenticated dark workspace theme */
      body.m360-matched-crm #marketing-centre {
        background: linear-gradient(155deg, #0d2026 0%, #09171c 100%);
        color: #d9eeeb;
        border: 1px solid #29434b;
        border-top: 3px solid #43dac4;
        box-shadow: 0 24px 60px rgba(0, 0, 0, .22);
      }
      body.m360-matched-crm #marketing-centre h2,
      body.m360-matched-crm #marketing-centre h3,
      body.m360-matched-crm #marketing-centre h4,
      body.m360-matched-crm #marketing-centre label,
      body.m360-matched-crm #marketing-centre strong,
      body.m360-matched-crm #marketing-centre .m360-mesh-title,
      body.m360-matched-crm #marketing-centre .m360-agent-name,
      body.m360-matched-crm #marketing-centre .m360-step strong {
        color: #ecfffb !important;
      }
      body.m360-matched-crm #marketing-centre .m360-kicker,
      body.m360-matched-crm #marketing-centre .m360-agent-status,
      body.m360-matched-crm #marketing-centre .m360-step.active em {
        color: #58e5cf !important;
      }
      body.m360-matched-crm #m360-mkt-context,
      body.m360-matched-crm #m360-mkt-status,
      body.m360-matched-crm #marketing-centre .m360-subtext,
      body.m360-matched-crm #marketing-centre .m360-agent-desc,
      body.m360-matched-crm #marketing-centre .m360-step small,
      body.m360-matched-crm #marketing-centre .m360-step em {
        color: #9ab4b5 !important;
      }
      body.m360-matched-crm #marketing-centre .m360-card,
      body.m360-matched-crm #marketing-centre .m360-agent-box,
      body.m360-matched-crm #marketing-centre .m360-step,
      body.m360-matched-crm #marketing-centre .m360-gate-item,
      body.m360-matched-crm #marketing-centre .m360-email-mockup,
      body.m360-matched-crm #marketing-centre .m360-diff-viewer {
        background: #11262c !important;
        color: #d9eeeb !important;
        border-color: #2c4850 !important;
        box-shadow: none;
      }
      body.m360-matched-crm #marketing-centre .m360-agent-box.active,
      body.m360-matched-crm #marketing-centre .m360-step.active {
        background: #12332f !important;
        border-color: #43dac4 !important;
      }
      body.m360-matched-crm #marketing-centre .m360-mesh-head,
      body.m360-matched-crm #marketing-centre .m360-tabs-bar,
      body.m360-matched-crm #marketing-centre .m360-email-field,
      body.m360-matched-crm #marketing-centre .m360-table td {
        border-color: #29434b !important;
      }
      body.m360-matched-crm #marketing-centre button,
      body.m360-matched-crm #marketing-centre .m360-tab-pill,
      body.m360-matched-crm #marketing-centre input:not([type=range]),
      body.m360-matched-crm #marketing-centre textarea,
      body.m360-matched-crm #marketing-centre select {
        background: #0b1b21 !important;
        color: #dff8f4 !important;
        border-color: #35535c !important;
      }
      body.m360-matched-crm #marketing-centre button:hover,
      body.m360-matched-crm #marketing-centre .m360-tab-pill:hover {
        background: #17343b !important;
        border-color: #4b7777 !important;
      }
      body.m360-matched-crm #marketing-centre button.primary,
      body.m360-matched-crm #marketing-centre .m360-tab-pill.active {
        background: linear-gradient(135deg, #20b8a6, #13867e) !important;
        color: #ffffff !important;
        border-color: transparent !important;
      }
      body.m360-matched-crm #marketing-centre .m360-mesh-badge,
      body.m360-matched-crm #marketing-centre .m360-agent-tag,
      body.m360-matched-crm #marketing-centre .m360-tab-badge {
        background: #183b39 !important;
        color: #72ead8 !important;
        border-color: #315d59 !important;
      }
      body.m360-matched-crm #marketing-centre .m360-table th {
        background: #163137;
        color: #bfe9e3;
        border-color: #35535c;
      }
      body.m360-matched-crm #marketing-centre .m360-table td,
      body.m360-matched-crm #marketing-centre .m360-email-body,
      body.m360-matched-crm #marketing-centre #m360-strategy-content,
      body.m360-matched-crm #marketing-centre #m360-ab-test-content {
        color: #c6dcda !important;
      }
      body.m360-matched-crm #marketing-centre .m360-terminal-wrap {
        background: #06110f;
        border-color: #28443e;
      }
      body.m360-matched-crm #marketing-centre input::placeholder,
      body.m360-matched-crm #marketing-centre textarea::placeholder { color: #71898c; opacity: 1; }

      @media(max-width: 760px) {
        #marketing-centre { padding: 18px; }
        .m360-slider-row { grid-template-columns: 1fr; gap: 6px; }
      }
    `;
    document.head.appendChild(style);
  }

  function mountMarketingCenter() {
    const leadsEl = document.getElementById('leads') || document.getElementById('pipeline-title')?.closest('section, .card, div');
    const mainContainer = (leadsEl && leadsEl.parentElement) || document.querySelector('main, .dashboard-main, .workspace-main, .main-content, .content-area') || document.body;
    if ($('marketing-centre')) return;
    injectMarketingStyles();

    const host = document.createElement('section');
    host.id = 'marketing-centre';
    host.className = 'card m360-marketing-section m360-mkt-container';
    host.setAttribute('data-m360-page', 'marketing');
    host.setAttribute('aria-labelledby', 'm360-mkt-title');

    // Immediately hide if not on the marketing page
    const isMarketing = (window.location.hash || '').toLowerCase().includes('marketing') || (new URLSearchParams(window.location.search).get('page') === 'marketing');
    if (!isMarketing) {
      host.classList.add('m360-mp-hidden-section');
      host.setAttribute('data-m360-page-hidden', 'true');
    }

    host.innerHTML = `
      <!-- Top Title & Kicker matching Overview -->
      <div>
        <p class="m360-kicker">YOUR MATRIX360 MARKETING ASSISTANT</p>
        <h2 id="m360-mkt-title">Campaign workspace</h2>
        <p class="m360-subtext">Choose your audience, prepare channel drafts, and review approvals before previewing a campaign.</p>
      </div>

      <!-- Safety Disclaimer matching Overview #m360-control-context -->
      <p id="m360-mkt-context" style="font-size:13px; color:#49675d; margin:6px 0 12px;">Your request uses only this authorized workspace. Nothing is published or sent externally without explicit provider authorization.</p>

      <!-- Live Status Line matching Overview #m360-control-status -->
      <p id="m360-mkt-status" role="status" aria-live="polite" style="display:flex; align-items:center; gap:9px; font-weight:650; min-height:24px; color:#163c32;">
        <span id="m360-mkt-spinner" class="m360-control-spinner" hidden></span>
        <span id="m360-mkt-status-text">Ready when you are.</span>
      </p>

      <!-- Multi-Agent Inter-Communication Console -->
      <div class="m360-card">
        <div class="m360-mesh-head">
          <div class="m360-mesh-title">
            <span class="m360-mesh-pulse"></span>
            <span>Campaign coordination</span>
          </div>
          <span class="m360-mesh-badge">WORKFLOW TOOLS</span>
        </div>
        <div class="m360-agent-grid">
          <div class="m360-agent-box active" id="box-agent-mkt">
            <div class="m360-agent-box-head">
              <span class="m360-agent-tag">MKT</span>
              <span class="m360-agent-name">Marketing Master AI</span>
            </div>
            <div class="m360-agent-status">Active Orchestrator</div>
            <p class="m360-agent-desc">Coordinates campaigns, surgical channel copy, 3-gate readiness &amp; budget math.</p>
          </div>
          <div class="m360-agent-box" id="box-agent-overview">
            <div class="m360-agent-box-head">
              <span class="m360-agent-tag">OVR</span>
              <span class="m360-agent-name">Overview AI</span>
            </div>
            <div class="m360-agent-status">Contract available; live acknowledgement not assumed</div>
            <p class="m360-agent-desc">Synchronizes live step telemetry, commercial goals &amp; global client routing.</p>
          </div>
          <div class="m360-agent-box" id="box-agent-leads">
            <div class="m360-agent-box-head">
              <span class="m360-agent-tag">LEAD</span>
              <span class="m360-agent-name">Leads &amp; Pipeline AI</span>
            </div>
            <div class="m360-agent-status">Authorized CRM query only; zero remains zero</div>
            <p class="m360-agent-desc">Supplies verified CRM lead snapshots with email/phone &amp; opt-in consent states.</p>
          </div>
          <div class="m360-agent-box" id="box-agent-content">
            <div class="m360-agent-box-head">
              <span class="m360-agent-tag">CONT</span>
              <span class="m360-agent-name">Content Creation AI</span>
            </div>
            <div class="m360-agent-status">Verified Content task contract pending</div>
            <p class="m360-agent-desc">Supplies key visuals, reels storyboards &amp; brand asset library.</p>
          </div>
        </div>
        <div class="m360-agent-toolbar">
          <button type="button" id="btn-bus-leads">Request Audience from Leads AI</button>
          <button type="button" id="btn-bus-content">Request Assets from Content AI</button>
          <button type="button" id="btn-bus-overview">Broadcast Telemetry to Overview AI</button>
          <button type="button" class="primary" id="btn-bus-full-sync">Run Multi-Engine Coordination</button>
        </div>
        <div class="m360-terminal-wrap" id="m360-terminal-logs">
          <div class="m360-term-line"><span class="m360-term-ts">[READY]</span> <span class="m360-term-tag">[Marketing]</span> Waiting for an authenticated task. Dependencies are reported from API results only.</div>
        </div>
      </div>

      <!-- Step Progress Pipeline -->
      <div class="m360-stepper-wrap" id="m360-step-stepper">
        <div class="m360-step" id="step-accepted"><em>01</em><strong>Accepted</strong><small>Waiting</small></div>
        <div class="m360-step" id="step-requesting_leads"><em>02</em><strong>Requesting Leads</strong><small>Waiting</small></div>
        <div class="m360-step" id="step-audience_received"><em>03</em><strong>Audience Result</strong><small>Waiting</small></div>
        <div class="m360-step" id="step-requesting_content"><em>04</em><strong>Requesting Content</strong><small>Waiting</small></div>
        <div class="m360-step" id="step-assets_ready"><em>05</em><strong>Assets Result</strong><small>Waiting</small></div>
        <div class="m360-step" id="step-draft_ready"><em>06</em><strong>Draft Ready</strong><small>Waiting</small></div>
      </div>

      <!-- Whiteboard & Strategy Row -->
      <div class="m360-grid-2">
        <div class="m360-card" id="m360-strategy-card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h3 style="margin:0;">Campaign strategy</h3>
            <span class="m360-tab-badge" id="m360-profile-badge">B2C Residential / Affinity</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px; font-size:13px; color:#174c40;">
            <span>Active Client Workspace:</span>
            <strong id="m360-active-client-label">Your Business</strong>
          </div>
          <div id="m360-strategy-content" style="font-size:13.5px; line-height:1.55; color:#334155;">
            <!-- Rendered dynamically -->
          </div>
        </div>

        <!-- Audience & Assets Picker -->
        <div class="m360-card">
          <h3 style="margin:0 0 4px;">Audience &amp; creative assets</h3>
          <p class="m360-subtext">Verified contacts from Leads &amp; Pipeline Engine with consent state telemetry.</p>
          <div style="display:flex; gap:10px; margin-bottom:10px;">
            <input type="text" id="m360-lead-search" placeholder="Filter contacts by name, email, or segment..." style="width:100%; padding:8px 12px; border:1px solid #cbdcd5; border-radius:6px; font-size:12.5px;">
          </div>
          <div style="max-height:180px; overflow-y:auto; border:1px solid #cbdcd5; border-radius:8px;">
            <table class="m360-table" id="m360-leads-table">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Channel Identifier</th>
                  <th>WhatsApp Opt-In</th>
                  <th>Affinity Segment</th>
                </tr>
              </thead>
              <tbody id="m360-leads-tbody">
                <!-- Rendered dynamically -->
              </tbody>
            </table>
          </div>
          <div style="margin-top:12px; font-size:12px; color:#5b8778;">
            <span id="m360-leads-summary-text">Total Snapshot: <strong>0 contacts</strong></span>
          </div>
        </div>
      </div>

      <!-- 10-Channel Dedicated Workspaces -->
      <div class="m360-card" id="m360-channels-section">
        <h3 style="margin:0 0 4px;">Channel drafts</h3>
        <p class="m360-subtext">Surgically craft, preview, and revise channel copies. Edits to one channel never overwrite others.</p>

        <!-- Channel Tabs -->
        <div class="m360-tabs-bar" id="m360-channel-tabs">
          <!-- Rendered dynamically -->
        </div>

        <!-- 3-Gate Readiness Row -->
        <div class="m360-gates-wrap" id="m360-gate-container">
          <!-- Rendered dynamically -->
        </div>

        <!-- Channel Workspace Content (Split View: Preview vs Diff) -->
        <div class="m360-grid-2">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-weight:700; font-size:14px; color:#163c32;" id="m360-active-channel-label">WhatsApp Campaign Workspace</span>
              <span class="m360-tab-badge" id="m360-active-version-pill">v1 Draft for Review</span>
            </div>

            <div id="m360-channel-custom-view">
              <!-- Rendered dynamically -->
            </div>

            <div style="margin-top:16px;">
              <label for="m360-revision-input" style="font-weight:700; font-size:13px; color:#173b31; display:block; margin-bottom:5px;">Surgical Natural-Language Revision</label>
              <div style="display:flex; gap:8px;">
                <input type="text" id="m360-revision-input" placeholder="e.g. Shorten WhatsApp and make LinkedIn more formal..." style="flex:1; padding:9px 12px; border:1px solid #708d82; border-radius:8px; font-size:13px;">
                <button type="button" class="primary" id="btn-apply-revision">Apply</button>
                <button type="button" id="btn-approve-channel">Approve</button>
                <button type="button" id="btn-launch-channel" class="primary" style="display:none; font-size:13px; padding:9px 14px;">Launch Channel</button>
                <button type="button" id="btn-test-preview" style="display:none; font-size:13px; padding:9px 14px; background:#075e54; color:#fff; border:none; border-radius:8px; font-weight:600; cursor:pointer;">Test on My Device</button>
              </div>
            </div>
          </div>

          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-weight:700; font-size:14px; color:#163c32;">Line-by-Line Visual Diff (vs Parent Version)</span>
              <span style="font-size:11px; color:#6b8c82;">Zero-Unintended Mutation Guarantee</span>
            </div>
            <div class="m360-diff-viewer" id="m360-diff-viewer">
              <span class="m360-diff-same">Initial version created. No revisions recorded yet.</span>
            </div>

            <!-- Email-to-CTWA Bridge -->
            <div class="m360-ctwa-card" id="m360-ctwa-card">
              <h4>Email-to-Click-to-WhatsApp (CTWA) Opt-In Bridge</h4>
              <p style="font-size:12.5px; color:#1e3a8a; margin:0 0 10px; line-height:1.5;" id="m360-ctwa-summary">
                18 contacts have verified email addresses but lack documented WhatsApp opt-in. A compliant invitation draft is prepared so contacts can voluntarily opt in.
              </p>
              <button type="button" id="btn-preview-ctwa-bridge" style="background:#ffffff; border-color:#93c5fd; color:#1e40af; font-size:12.5px; padding:6px 12px;">Preview CTWA Bridge Email</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Bayesian Budget Saturation & A/B Testing -->
      <div class="m360-card" id="m360-budget-section">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
          <h3 style="margin:0;">Budget &amp; test planning</h3>
          <span class="m360-tab-badge" style="background:#fee2e2; color:#991b1b; font-weight:700;">Planning estimate · not measured results</span>
        </div>
        <p class="m360-subtext">Compute explainable diminishing-returns saturation curves and two-tailed MDE sample size math. Zero fabricated ROI.</p>

        <div class="m360-grid-2">
          <div>
            <div class="m360-slider-row">
              <label style="font-size:13px; font-weight:600; color:#173b31;">Campaign Budget:</label>
              <input type="range" id="m360-slider-budget" min="10000" max="100000" step="5000" value="35000">
              <span style="font-weight:700; color:#155b49;" id="m360-val-budget">INR 35,000</span>
            </div>
            <div class="m360-slider-row">
              <label style="font-size:13px; font-weight:600; color:#173b31;">Duration (Days):</label>
              <input type="range" id="m360-slider-duration" min="7" max="60" step="1" value="30">
              <span style="font-weight:700; color:#155b49;" id="m360-val-duration">30 Days</span>
            </div>

            <div id="m360-budget-scenarios-card" style="margin-top:14px;">
              <!-- Rendered dynamically -->
            </div>
          </div>

          <div>
            <div class="m360-card" id="m360-ab-test-card" style="background:#f8fafc; border:1px solid #cbd5e1; box-shadow:none;">
              <h4 style="margin:0 0 6px; font-size:14px; color:#1e293b;">A/B Experiment Sizing (Two-Tailed MDE)</h4>
              <p style="font-size:12px; color:#64748b; margin:0 0 10px;">Statistical power 80%, significance alpha 5%, minimum duration 14 days.</p>
              <div id="m360-ab-test-content" style="font-size:12.5px; line-height:1.6; color:#334155;">
                <!-- Rendered dynamically -->
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Campaign Calendar & Connections -->
      <div class="m360-grid-2">
        <div class="m360-card">
          <h3 style="margin:0 0 4px;">Campaign Calendar &amp; Journeys</h3>
          <p class="m360-subtext">Approved schedule and staging. Outbound execution is gated until providers are connected.</p>
          <table class="m360-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Channel</th>
                <th>Audience Segment</th>
                <th>Execution Gate</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Day 1</td>
                <td>WhatsApp</td>
                <td>Verified Opt-In Contacts (6)</td>
                <td><span class="m360-tab-badge">Awaiting Provider</span></td>
              </tr>
              <tr>
                <td>Day 2</td>
                <td>Email</td>
                <td>All Qualified Leads (24)</td>
                <td><span class="m360-tab-badge">Awaiting Provider</span></td>
              </tr>
              <tr>
                <td>Day 3</td>
                <td>Email (CTWA)</td>
                <td>Unconsented Contacts (18)</td>
                <td><span class="m360-tab-badge">Draft Ready</span></td>
              </tr>
              <tr>
                <td>Day 5</td>
                <td>LinkedIn / Instagram</td>
                <td>Professional &amp; Metro Diaspora</td>
                <td><span class="m360-tab-badge">Awaiting Provider</span></td>
              </tr>
            </tbody>
          </table>
          <small style="color:#6b8c82;">Status: <strong>dispatched: false</strong> (Review and connection required before dispatch).</small>
        </div>

        <div class="m360-card">
          <h3 style="margin:0 0 4px;">Connections &amp; results</h3>
          <p class="m360-subtext">Provider status and verified outcome metrics. Zero synthetic reporting.</p>
          <div style="display:grid; gap:8px; margin-bottom:14px;">
            <div style="display:flex; justify-content:space-between; padding:8px 10px; background:#f6faf8; border:1px solid #cbdcd5; border-radius:6px; font-size:12.5px;">
              <span>WhatsApp Cloud API</span>
              <span style="color:#92400e; font-weight:600;">Disconnected (Setup Required)</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:8px 10px; background:#f6faf8; border:1px solid #cbdcd5; border-radius:6px; font-size:12.5px;">
              <span>SendGrid / SMTP Mailbox</span>
              <span style="color:#92400e; font-weight:600;">Disconnected (Setup Required)</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:8px 10px; background:#f6faf8; border:1px solid #cbdcd5; border-radius:6px; font-size:12.5px;">
              <span>Meta Graph API</span>
              <span style="color:#92400e; font-weight:600;">Disconnected (Setup Required)</span>
            </div>
          </div>
          <div style="padding:12px; background:#edf6f2; border:1px solid #cbdcd5; border-radius:8px; font-size:12.5px; color:#174c40;">
            <strong>Verified Analytics:</strong> No verified delivery results yet. Once providers are authorized and drafts dispatched, real delivery, read, and conversion events will display here.
          </div>
        </div>
      </div>
    `;

    // Mount into mainContainer
    const ref = $('services') || $('m360-content-library') || $('leads');
    if (ref && ref.parentElement === mainContainer) {
      mainContainer.insertBefore(host, ref);
    } else {
      mainContainer.appendChild(host);
    }

    bindEventListeners();

    function syncMarketingVisibility() {
      const isMkt = (window.location.hash || '').toLowerCase().includes('marketing') || (new URLSearchParams(window.location.search).get('page') === 'marketing');
      const el = $('marketing-centre');
      if (el) {
        el.classList.toggle('m360-mp-hidden-section', !isMkt);
        el.setAttribute('data-m360-page-hidden', isMkt ? 'false' : 'true');
      }
    }
    window.addEventListener('hashchange', syncMarketingVisibility);
    window.addEventListener('popstate', syncMarketingVisibility);
    syncMarketingVisibility();

    activeTask = null;
    loadSavedTaskForWorkspace(ws());
  }

  async function api(path, options = {}) {
    const token = auth();
    if (!token) throw Error('Sign in to use Marketing.');
    const response = await fetch(path, { cache: 'no-store', ...options, headers: { Accept: 'application/json', Authorization: 'Bearer ' + token, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({ error: 'Marketing API returned unreadable data.' }));
    if (!response.ok) throw Error(data.error || data.message || 'Marketing request failed.');
    return data;
  }

  function normalizeTask(task) {
    return { ...task, profile_type: task.affinity_strategy?.profile_type || task.profile_type || 'unclassified', strategy: task.affinity_strategy || task.strategy };
  }

  async function loadTask(correlationId) {
    const data = await api('/api/marketing/tasks?' + new URLSearchParams({ workspace_id: ws(), correlation_id: correlationId }));
    activeTask = normalizeTask(data.task);
    if (activeTask.strategy && activeTask.channel_draft_versions) renderCompleteTask();
    return activeTask;
  }

  async function loadSavedTaskForWorkspace(workspaceId) {
    if (!workspaceId || !auth()) return setMktStatus('Sign in and choose an authorized workspace.');
    try {
      const activeCtx = window.M360ActiveCampaign;
      if (activeCtx && activeCtx.channel && CHANNELS.includes(activeCtx.channel)) {
        activeChannel = activeCtx.channel;
      }
      if (activeCtx && activeCtx.correlation_id) {
        try {
          await loadTask(activeCtx.correlation_id);
          setMktStatus('Active campaign loaded from Overview.');
          return;
        } catch (_) {}
      }
      const data = await api('/api/marketing/tasks?' + new URLSearchParams({ workspace_id: workspaceId }));
      if (!data.tasks?.length) return setMktStatus('No Marketing task exists for this workspace yet.');
      await loadTask(data.tasks[0].correlation_id);
      setMktStatus(activeTask.status === 'draft_ready' ? 'Latest review draft loaded.' : 'Latest Marketing task: ' + activeTask.status);
    } catch (error) { setMktStatus(error.message); }
  }

  async function waitForTask(correlationId) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const task = await loadTask(correlationId);
      setMktStatus('Marketing task: ' + task.status, !['draft_ready', 'failed'].includes(task.status));
      if (['draft_ready', 'failed'].includes(task.status)) return task;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw Error('Marketing task is still running. Use the task list to refresh.');
  }

  function bindEventListeners() {
    // Automatic workspace synchronization
    $('workspace')?.addEventListener('change', () => {
      const info = getActiveClientInfo();
      if ($('m360-active-client-label')) $('m360-active-client-label').textContent = info.clientName;
      activeTask = null;
      loadSavedTaskForWorkspace(info.wsId);
    });

    // Inter-Agent Action Buttons
    $('btn-bus-leads')?.addEventListener('click', () => notify('Start an authenticated Marketing task to query the authorized CRM audience. No standalone fake handoff is available.', 'info'));

    $('btn-bus-content')?.addEventListener('click', () => notify('Verified Content Studio task IDs are not connected to Marketing yet. No asset was claimed ready.', 'error'));

    $('btn-bus-overview')?.addEventListener('click', () => activeTask ? notify('Overview can read the same authenticated task endpoint using correlation ID ' + activeTask.correlation_id + '.', 'info') : notify('No active Marketing task to share.', 'error'));

    $('btn-bus-full-sync')?.addEventListener('click', () => notify('Full sync is blocked until verified Leads and Content task contracts are available.', 'error'));

    // Surgical Revision
    $('btn-apply-revision')?.addEventListener('click', async () => {
      const revText = $('m360-revision-input')?.value?.trim();
      if (!revText || !activeTask?.channel_draft_versions) return;

      appendTerminalLog('Revision AI', 'Surgically revising channel copies based on: ' + revText);

      try {
        const data = await api('/api/marketing/revise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace_id: ws(), correlation_id: activeTask.correlation_id, revision_prompt: revText }) });
        activeTask.channel_draft_versions = data.channel_draft_versions;
        activeTask.channel_readiness = data.channel_readiness;
        renderActiveChannel(); renderChannelTabs();
        appendTerminalLog('Revision', 'Updated: ' + data.targeted_channels.join(', ') + '; preserved: ' + data.preserved_channels.join(', ') + '.');
        notify('Only ' + data.targeted_channels.join(', ') + ' received new versions.', 'success');
      } catch (error) { notify(error.message, 'error'); }
    });

    // Approve Channel Draft
    $('btn-approve-channel')?.addEventListener('click', async () => {
      if (!activeTask?.channel_draft_versions?.[activeChannel]) return;
      const entry = activeTask.channel_draft_versions[activeChannel];
      const cur = entry.versions[entry.versions.length - 1];
      try {
        await api('/api/marketing/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace_id: ws(), correlation_id: activeTask.correlation_id, channel: activeChannel, version_hash: cur.version_hash }) });
        await loadTask(activeTask.correlation_id);
        appendTerminalLog('Editorial Gate', 'Backend approved version ' + cur.version + ' for ' + activeChannel + '.');
        notify(activeChannel + ' draft approved for review workflow.', 'success');
      } catch (error) { notify(error.message, 'error'); }
    });

    // Launch Channel (Requires all 3 Gates)
    $('btn-launch-channel')?.addEventListener('click', async () => {
      const g = activeTask?.channel_readiness?.[activeChannel]?.gates;
      if (!g?.gate1_draft?.passed) {
        notify('Gate 1 Blocked: Editorial approval required before launch.', 'error');
        return;
      }
      if (!g?.gate2_audience?.passed || g.gate2_audience.eligible_count <= 0) {
        notify('Gate 2 Blocked: No eligible contacts with verified consent found.', 'error');
        return;
      }
      if (!g?.gate3_provider?.passed) {
        alert('[GATE 3 BLOCKED - PROVIDER CONNECTION REQUIRED]\n\n' +
          'No authenticated ' + (g?.gate3_provider?.provider_name || 'API') + ' connection is configured.\n\n' +
          'To dispatch real messages, configure the authorized credentials in your local .env.local:\n' +
          (activeChannel === 'WhatsApp' ? '- WHATSAPP_API_TOKEN\n- WHATSAPP_PHONE_NUMBER_ID\n' :
           activeChannel === 'Email' ? '- SMTP_HOST (or SENDGRID_API_KEY)\n' :
           '- META_ACCESS_TOKEN\n') +
          '\nLive outbound execution is blocked until genuine credentials are provided.');
        return;
      }

      setMktStatus('Launching ' + activeChannel + ' through live provider gateway…', true);
      try {
        const res = await fetch('/api/marketing/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (auth() || '') },
          body: JSON.stringify({
            workspace_id: ws(),
            correlation_id: activeTask.correlation_id,
            channel: activeChannel
          })
        });
        const data = await res.json();
        if (data.status === 'ok') {
          appendTerminalLog('Execution Dispatch', 'Successfully dispatched to ' + activeChannel + ' gateway. Receipt: ' + data.receipt_id + ' (' + data.recipients_sent + ' recipients).');
          notify(activeChannel + ' campaign dispatched! Receipt: ' + data.receipt_id, 'success');
        } else {
          notify('Dispatch blocked: ' + (data.error || 'Provider execution failed'), 'error');
        }
      } catch (err) {
        notify('Execution error: ' + err.message, 'error');
      } finally {
        setMktStatus('Ready');
      }
    });

    // Test on My Device (WhatsApp Click-to-Chat or Email test preview)
    $('btn-test-preview')?.addEventListener('click', async () => {
      setMktStatus('Preparing verified test preview for ' + activeChannel + '...', true);
      try {
        const res = await fetch('/api/marketing/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (auth() || '') },
          body: JSON.stringify({
            workspace_id: ws(),
            correlation_id: activeTask.correlation_id,
            channel: activeChannel,
            mode: 'test_preview'
          })
        });
        const data = await res.json();
        if (data.status === 'ok' && data.test_url) {
          appendTerminalLog('Test Preview', 'WhatsApp Click-to-Chat URL ready: ' + data.test_url);
          notify('Test URL ready! Opening WhatsApp Web/App...', 'success');
          window.open(data.test_url, '_blank');
        } else if (data.status === 'ok') {
          appendTerminalLog('Test Preview', data.message || 'Test preview generated.');
          notify(data.message || 'Test preview generated.', 'success');
        } else {
          notify('Test preview failed: ' + (data.error || 'Blocked'), 'error');
        }
      } catch (err) {
        notify('Preview error: ' + err.message, 'error');
      } finally {
        setMktStatus('Ready');
      }
    });

    // Preview CTWA Bridge Email
    $('btn-preview-ctwa-bridge')?.addEventListener('click', () => {
      const b = activeTask.email_to_ctwa_bridge;
      if (!b || b.status === 'blocked_verified_sender_required') return notify('CTWA bridge is blocked until a verified tenant WhatsApp sender and email consent evidence exist.', 'error');
      alert('[EMAIL-TO-CTWA BRIDGE DRAFT]\n\nSubject: ' + b.subject + '\n\n' + b.body + '\n\nTarget Contacts: ' + b.target_contacts_count + '\nCompliance: Meta WhatsApp Opt-In Policy (Voluntary Tap Required).');
    });

    // Budget Sliders
    $('m360-slider-budget')?.addEventListener('input', (e) => {
      const val = +e.target.value;
      $('m360-val-budget').textContent = 'INR ' + val.toLocaleString('en-IN');
      recalcBudget(val, +$('m360-slider-duration').value);
    });

    $('m360-slider-duration')?.addEventListener('input', (e) => {
      const val = +e.target.value;
      $('m360-val-duration').textContent = val + ' Days';
      recalcBudget(+$('m360-slider-budget').value, val);
    });

    // Lead Search Filter
    $('m360-lead-search')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      renderLeadsTable(q);
    });
  }

  function setMktStatus(text, busy = false) {
    if ($('m360-mkt-status-text')) $('m360-mkt-status-text').textContent = text;
    if ($('m360-mkt-spinner')) $('m360-mkt-spinner').hidden = !busy;
  }

  function appendTerminalLog(sender, message) {
    const term = $('m360-terminal-logs');
    if (!term) return;
    const now = new Date().toTimeString().slice(0, 8);
    const line = document.createElement('div');
    line.className = 'm360-term-line';
    line.innerHTML = '<span class="m360-term-ts">[' + now + ']</span> <span class="m360-term-tag">[' + escapeHtml(sender) + ']</span> ' + escapeHtml(message);
    term.appendChild(line);
    term.scrollTop = term.scrollHeight;
  }

  function renderCompleteTask() {
    if (!activeTask) return;

    // Strategy & Profile Badge
    if ($('m360-active-client-label')) $('m360-active-client-label').textContent = activeTask.business_name || getActiveClientInfo().clientName;
    if ($('m360-profile-badge')) {
      $('m360-profile-badge').textContent = activeTask.profile_type === 'b2b_industrial' ? 'B2B Industrial Mode' : 'B2C Residential / Affinity Mode';
    }

    const strat = activeTask.strategy;
    if ($('m360-strategy-content')) {
      $('m360-strategy-content').innerHTML = `
        <div style="margin-bottom:10px;">
          <strong>Value Proposition:</strong> ${escapeHtml(strat.pitch_framing.value_proposition)}
        </div>
        <div style="margin-bottom:10px;">
          <strong>Emotional Hook:</strong> ${escapeHtml(strat.pitch_framing.emotional_hook)}
        </div>
        <div style="margin-bottom:12px;">
          <strong>Call to Action:</strong> <em>${escapeHtml(strat.pitch_framing.call_to_action)}</em>
        </div>
        <div>
          <strong>Core Affinity Segments:</strong>
          <ul style="margin:6px 0 0; padding-left:20px; font-size:13px;">
            ${strat.core_segments.map(s => `<li><strong>${escapeHtml(s.name)}:</strong> ${escapeHtml(s.affinity_signal)}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    renderLeadsTable();
    renderChannelTabs();
    renderActiveChannel();
    recalcBudget(+$('m360-slider-budget').value, +$('m360-slider-duration').value);
  }

  function renderLeadsTable(query = '') {
    const tbody = $('m360-leads-tbody');
    if (!tbody) return;
    const contacts = (activeTask?.audience_snapshot?.contacts || []).filter(c => {
      if (!query) return true;
      return (c.name || '').toLowerCase().includes(query) || (c.email || '').toLowerCase().includes(query) || (c.segment && c.segment.toLowerCase().includes(query));
    });

    const waCount = contacts.filter(c => c.whatsapp_opt_in_status === 'granted' && c.consent_evidence?.whatsapp).length;
    const emailCount = contacts.filter(c => c.email && c.email.includes('@') && ['granted','opted_in'].includes(c.email_opt_in_status) && c.consent_evidence?.email).length;
    if ($('m360-leads-summary-text')) {
      $('m360-leads-summary-text').innerHTML = 'Total Snapshot: <strong>' + contacts.length + ' contact' + (contacts.length === 1 ? '' : 's') + '</strong> (' + waCount + ' WhatsApp eligible, ' + emailCount + ' Email eligible with stored consent evidence).';
    }

    if (contacts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:22px; color:#64748b;">' +
        '<p style="margin:0 0 10px;">No verified contacts in this workspace snapshot yet.</p>' +
        '<button type="button" id="m360-goto-leads-btn" style="background:#155b49;color:#fff;border:none;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">Discover Prospects in Leads &amp; Pipeline &rarr;</button>' +
        '</td></tr>';
      $('m360-goto-leads-btn')?.addEventListener('click', () => {
        if (window.Matrix360Router?.navigateToPage) {
          window.Matrix360Router.navigateToPage('leads');
        } else {
          const nav = document.querySelector('[data-m360-goto="leads"]') || document.querySelector('a[href="#leads"]');
          if (nav) nav.click();
          else window.location.hash = '#leads';
        }
      });
      return;
    }

    tbody.innerHTML = contacts.map(c => `
      <tr>
        <td><strong>${escapeHtml(c.name || 'Contact')}</strong></td>
        <td><code>${escapeHtml(c.email || '')}</code><br><small style="color:#64748b;">${escapeHtml(c.phone || '')}</small></td>
        <td>
          <span class="m360-tab-badge" style="${c.whatsapp_opt_in_status === 'granted' ? 'background:#dcfce7; color:#166534;' : 'background:#fef3c7; color:#92400e;'}">
            ${c.whatsapp_opt_in_status === 'granted' ? 'Opted-In' : 'Pending Opt-In'}
          </span>
        </td>
        <td>${escapeHtml(c.segment || 'General')}</td>
      </tr>
    `).join('');
  }

  function renderChannelTabs() {
    const tabsContainer = $('m360-channel-tabs');
    if (!tabsContainer || !activeTask?.channel_draft_versions) return;

    tabsContainer.innerHTML = CHANNELS.map(ch => {
      const entry = activeTask.channel_draft_versions[ch];
      const isApproved = entry?.versions[entry.versions.length - 1]?.status === 'approved';
      const vNum = entry?.current_version || 1;
      const isActive = ch === activeChannel;

      return `
        <button type="button" class="m360-tab-pill ${isActive ? 'active' : ''}" data-channel="${ch}">
          <span>${ch}</span>
          <span class="m360-tab-badge">${isApproved ? 'Approved v' + vNum : 'v' + vNum}</span>
        </button>
      `;
    }).join('');

    tabsContainer.querySelectorAll('.m360-tab-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        activeChannel = btn.getAttribute('data-channel');
        renderChannelTabs();
        renderActiveChannel();
      });
    });
  }

  function renderActiveChannel() {
    if (!activeTask || !activeTask.channel_draft_versions) return;

    $('m360-active-channel-label').textContent = activeChannel + ' Campaign Workspace';
    const entry = activeTask.channel_draft_versions[activeChannel];
    const curVer = entry?.versions[entry.versions.length - 1];
    $('m360-active-version-pill').textContent = 'v' + (curVer?.version || 1) + ' ' + (curVer?.status === 'approved' ? 'Approved for Release' : 'Draft for Review');

    // 3 Gates
    const readiness = activeTask.channel_readiness?.[activeChannel] || {
      gates: {
        gate1_draft: { status: curVer?.status || 'draft_for_review', label: 'Gate 1: Editorial Draft Status' },
        gate2_audience: { status: 'ineligible', eligible_count: 0, ineligible_count: 0, label: 'Gate 2: Audience Eligibility & Consent' },
        gate3_provider: { status: 'disconnected_connection_required', label: 'Gate 3: Provider Connection Status' }
      }
    };

    const g1 = readiness.gates.gate1_draft;
    const g2 = readiness.gates.gate2_audience;
    const g3 = readiness.gates.gate3_provider;

    $('m360-gate-container').innerHTML = `
      <div class="m360-gate-item">
        <h4>${g1.label}</h4>
        <div class="m360-gate-val ${g1.status === 'approved' ? 'm360-gate-pass' : 'm360-gate-warn'}">
          ${g1.status === 'approved' ? 'Approved for Release' : 'Draft for Review'}
        </div>
      </div>
      <div class="m360-gate-item">
        <h4>${g2.label}</h4>
        <div class="m360-gate-val ${g2.eligible_count > 0 ? 'm360-gate-pass' : 'm360-gate-fail'}">
          ${g2.eligible_count ?? 0} Verified Contacts Eligible
        </div>
        ${g2.eligible_count <= 0 ? '<button type="button" class="m360-gate-leads-btn" style="margin-top:6px;padding:3px 8px;font-size:11px;font-weight:600;background:#155b49;color:#fff;border:none;border-radius:4px;cursor:pointer;">Find Leads &rarr;</button>' : ''}
      </div>
      <div class="m360-gate-item">
        <h4>${g3.label}</h4>
        <div class="m360-gate-val ${g3.status === 'connected' ? 'm360-gate-pass' : 'm360-gate-warn'}">
          ${g3.status === 'connected' ? 'API Connected' : 'Disconnected (Connection Required)'}
        </div>
      </div>
    `;

    const launchBtn = $('btn-launch-channel');
    if (launchBtn) {
      launchBtn.style.display = curVer?.status === 'approved' ? 'inline-block' : 'none';
      if (g3.status === 'connected') {
        launchBtn.textContent = 'Launch to ' + activeChannel;
        launchBtn.title = 'All 3 gates passed. Dispatch campaign via connected provider.';
      } else {
        launchBtn.textContent = 'Launch (Connection Required)';
        launchBtn.title = 'Provider disconnected. Click for required configuration details.';
      }
    }

    const testPreviewBtn = $('btn-test-preview');
    if (testPreviewBtn) {
      testPreviewBtn.style.display = (curVer?.status === 'approved' && (activeChannel === 'WhatsApp' || activeChannel === 'Email')) ? 'inline-block' : 'none';
      testPreviewBtn.textContent = activeChannel === 'WhatsApp' ? 'Test WhatsApp (Click-to-Chat)' : 'Send Email Preview';
    }

    document.querySelectorAll('.m360-gate-leads-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.Matrix360Router?.navigateToPage) {
          window.Matrix360Router.navigateToPage('leads');
        } else {
          const nav = document.querySelector('[data-m360-goto="leads"]') || document.querySelector('a[href="#leads"]');
          if (nav) nav.click();
          else window.location.hash = '#leads';
        }
      });
    });

    // Render Custom Previews based on Channel
    const viewContainer = $('m360-channel-custom-view');
    const textBody = curVer?.body || '';

    if (activeChannel === 'WhatsApp') {
      viewContainer.innerHTML = `
        <div class="m360-wa-mockup">
          <div class="m360-wa-header">
            <span>WhatsApp Business • ${escapeHtml(activeTask.business_name)}</span>
          </div>
          <div class="m360-wa-bubble">${escapeHtml(textBody)}</div>
          <div class="m360-wa-btn-cta">
            Verified tenant sender required before a chat link can be shown
          </div>
        </div>
        <small style="color:#5f7a72; display:block; margin-top:6px;">
          Character count: <strong>${textBody.length}</strong> (Meta WhatsApp max 1,024). Variables: <code>{{contact_name}}</code>, <code>{{project}}</code>.
        </small>
      `;
      $('m360-ctwa-card').style.display = 'block';
    } else if (activeChannel === 'Email') {
      viewContainer.innerHTML = `
        <div class="m360-email-mockup">
          <div class="m360-email-field"><strong>Subject:</strong> ${escapeHtml(curVer?.subject || 'Draft subject not supplied')}</div>
          <div class="m360-email-field"><strong>From:</strong> Verified tenant sender required</div>
          <div class="m360-email-field"><strong>Deliverability:</strong> Not verified; provider connection and domain checks required</div>
          <div class="m360-email-body">${escapeHtml(textBody)}</div>
          <div style="font-size:11px; color:#888; border-top:1px solid #eee; padding-top:8px;">
            Consent wording and unsubscribe controls must be supplied by the verified provider workflow before sending.
          </div>
        </div>
      `;
      $('m360-ctwa-card').style.display = 'none';
    } else {
      viewContainer.innerHTML = `
        <div style="background:#ffffff; border:1px solid #cbdcd5; border-radius:10px; padding:16px; margin:12px 0;">
          <strong style="display:block; font-size:13px; color:#163c32; margin-bottom:6px;">${curVer?.subject ? escapeHtml(curVer.subject) : activeChannel + ' Post Draft'}</strong>
          <div style="font-size:13.5px; line-height:1.55; white-space:pre-wrap; color:#334155;">${escapeHtml(textBody)}</div>
        </div>
        <small style="color:#5f7a72; display:block; margin-top:6px;">
          Character count: <strong>${textBody.length}</strong> chars.
        </small>
      `;
      $('m360-ctwa-card').style.display = 'none';
    }

    // Visual Diff
    const diff = curVer?.diff;
    if (diff && Array.isArray(diff) && diff.length > 0) {
      $('m360-diff-viewer').innerHTML = diff.map(d => {
        if (d.type === 'added') return `<span class="m360-diff-add">+ ${escapeHtml(d.line)}</span>`;
        if (d.type === 'removed') return `<span class="m360-diff-rem">- ${escapeHtml(d.line)}</span>`;
        return `<span class="m360-diff-same">  ${escapeHtml(d.line)}</span>`;
      }).join('');
    } else {
      $('m360-diff-viewer').innerHTML = '<span class="m360-diff-same">Initial version active (v' + (curVer?.version || 1) + '). No revisions recorded yet.</span>';
    }
  }

  function recalcBudget(budgetInr, durationDays) {
    const k = 25000;
    const rMax = 180;
    const expLeads = Math.round(rMax * (budgetInr / (budgetInr + k)));
    const lowLeads = Math.round(expLeads * 0.45);
    const highLeads = Math.round(expLeads * 1.85);

    const cplExp = Math.round(budgetInr / Math.max(1, expLeads));
    const cplLow = Math.round(budgetInr / Math.max(1, highLeads));
    const cplHigh = Math.round(budgetInr / Math.max(1, lowLeads));

    const card = $('m360-budget-scenarios-card');
    if (card) {
      card.innerHTML = `
        <table class="m360-table">
          <thead>
            <tr>
              <th>Scenario</th>
              <th>Estimated Leads</th>
              <th>Cost per Lead</th>
              <th>Saturation Level</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Conservative Low</td>
              <td><strong>${lowLeads}</strong></td>
              <td>INR ${cplHigh.toLocaleString('en-IN')}</td>
              <td>Linear Phase</td>
            </tr>
            <tr style="background:#edf8f4;">
              <td><strong>Expected Median</strong></td>
              <td><strong>${expLeads}</strong></td>
              <td><strong>INR ${cplExp.toLocaleString('en-IN')}</strong></td>
              <td>Optimal Yield</td>
            </tr>
            <tr>
              <td>Optimistic High</td>
              <td><strong>${highLeads}</strong></td>
              <td>INR ${cplLow.toLocaleString('en-IN')}</td>
              <td>High Saturation</td>
            </tr>
          </tbody>
        </table>
        <small style="color:#6b8c82;">Formula: R(b) = Rmax * (b / (b + k)), where k = INR 25,000, Rmax = 180 leads. Diminishing returns modeled past INR 40,000.</small>
      `;
    }

    const abCard = $('m360-ab-test-content');
    if (abCard) {
      const samplePerArm = Math.round(1840 * (30 / Math.max(7, durationDays)));
      abCard.innerHTML = `
        <div><strong>Baseline Conversion Rate:</strong> 3.2%</div>
        <div><strong>Minimum Detectable Effect (MDE):</strong> 20% relative (3.2% -> 3.84%)</div>
        <div><strong>Required Sample per Arm:</strong> ${samplePerArm.toLocaleString()} visits</div>
        <div><strong>Total Test Sample Size:</strong> ${(samplePerArm * 2).toLocaleString()} visits</div>
        <div><strong>Recommended Test Duration:</strong> ${Math.max(14, durationDays)} Days (min 14 days for weekend seasonality)</div>
        <div style="margin-top:6px; color:#49675d; font-size:11.5px;">Test power 80%, 2-sided alpha 0.05. Test is statistically feasible within current audience reach.</div>
      `;
    }
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>'"]/g, tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
  }

  // Auto-mount and synchronize with router
  window.addEventListener('popstate', () => { mountMarketingCenter(); loadSavedTaskForWorkspace(ws()); });
  window.addEventListener('hashchange', () => { mountMarketingCenter(); loadSavedTaskForWorkspace(ws()); });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountMarketingCenter);
  } else {
    mountMarketingCenter();
  }
})();
