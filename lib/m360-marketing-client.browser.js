(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const liveSendingEnabled = window.M360LiveSendingEnabled === true;
  const CHANNELS = ['WhatsApp', 'Email', 'Facebook', 'Instagram', 'LinkedIn', 'X', 'YouTube', 'Google Business Profile', 'SMS', 'Website'];

  let activeTask = null;
  let activeChannel = 'Email';
  let pollInterval = null;
  let toastTimer = null;
  let calendarCursor = null;
  let calendarSelectedDate = '';
  let calendarSelectedEventId = '';
  let activeConversation = null;

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
        font-family: Manrope, "DM Sans", "Segoe UI", system-ui, sans-serif;
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
      .m360-conversation-bubble { margin:0; padding:11px 13px; border-radius:10px; white-space:pre-wrap; line-height:1.55; }
      .m360-conversation-bubble.user { background:#dff0ff; color:#12324a; border-left:4px solid #2b7bbb; }
      .m360-conversation-bubble.assistant { background:#e5f5ee; color:#173b31; border-left:4px solid #1d9678; }
      .m360-revision-suggestions { display:flex; gap:6px; flex-wrap:wrap; margin:8px 0; }
      .m360-revision-suggestions button { padding:6px 10px !important; font-size:12px !important; border-radius:18px !important; }
      .m360-revision-actions { display:flex; gap:8px; flex-wrap:wrap; }
      .m360-revision-actions input { flex:1 1 260px !important; min-width:220px !important; }
      .m360-revision-actions button { flex:0 0 auto; }
      .m360-advanced-tools > summary { cursor:pointer; font-weight:700; color:#174c40; }
      .m360-advanced-tools[open] > summary { margin-bottom:16px; }

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
        margin-inline: 0;
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
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
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
      body.m360-matched-crm #marketing-centre .m360-beginner-step {
        background:#132f34;
        border-color:#2c5960;
        color:#dff8f4;
      }
      body.m360-matched-crm #marketing-centre .m360-beginner-step span { color:#62dfcc; }
      body.m360-matched-crm #marketing-centre .m360-conversation-bubble.user {
        background:#122f46 !important;
        color:#dff3ff !important;
        border-left-color:#55b6ec;
      }
      body.m360-matched-crm #marketing-centre .m360-conversation-bubble.assistant {
        background:#13352f !important;
        color:#e5fff9 !important;
        border-left-color:#4be0c7;
      }
      body.m360-matched-crm #marketing-centre .m360-wa-bubble,
      body.m360-matched-crm #marketing-centre .m360-wa-btn-cta,
      body.m360-matched-crm #marketing-centre #m360-channel-custom-view > div {
        background:#132a31 !important;
        color:#e3f5f3 !important;
        border-color:#34525a !important;
      }
      body.m360-matched-crm #marketing-centre .m360-wa-mockup { background:#0a191e !important; border-color:#34525a !important; }
      body.m360-matched-crm #marketing-centre .m360-email-field { color:#a8c9c7 !important; }
      body.m360-matched-crm #marketing-centre .m360-advanced-tools > summary { color:#a7cbc6; }
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
        <p class="m360-kicker">YOUR MATRIX360 OUTREACH ASSISTANT</p>
        <h2 id="m360-mkt-title">Campaign workspace</h2>
        <p class="m360-subtext">Review a campaign prepared in Overview AI or start a new brief here.</p><p id="m360-campaign-summary"></p><a href="/client-dashboard.html?page=dashboard#overview" data-outreach-page="dashboard">Open Overview AI</a> · <a href="/client-dashboard.html?page=research#market-research" data-outreach-page="research">Research, budget and calendar</a>
      </div>

      <!-- Safety Disclaimer matching Overview #m360-control-context -->
      <p id="m360-mkt-context" style="font-size:13px; color:#49675d; margin:6px 0 12px;">Your request uses only this authorized workspace. Nothing is published or sent externally without explicit provider authorization.</p>

      <!-- Live Status Line matching Overview #m360-control-status -->
      <p id="m360-mkt-status" role="status" aria-live="polite" style="display:flex; align-items:center; gap:9px; font-weight:650; min-height:24px; color:#163c32;">
        <span id="m360-mkt-spinner" class="m360-control-spinner" hidden></span>
        <span id="m360-mkt-status-text">Ready when you are.</span>
      </p>

      <nav class="m360-workspace-steps" aria-label="Campaign steps">
        <a href="#m360-conversation-title" aria-current="step"><b>01</b> Draft</a>
        <a href="#m360-channels-section" aria-disabled="true"><b>02</b> Review</a>
        <a href="#m360-outreach-test" aria-disabled="true"><b>03</b> Test send</a>
        <a href="#m360-outreach-results" aria-disabled="true"><b>04</b> Results</a>
      </nav>

      <section class="m360-card" aria-labelledby="m360-conversation-title">
        <h3 id="m360-conversation-title" style="margin:0 0 6px;">1. Tell the AI what you want to achieve</h3>
        <p class="m360-subtext">Tell us what the campaign is about. Outreach uses your saved Company Details to prepare the draft.</p>
        <div id="m360-conversation-history" role="log" aria-live="polite" style="display:grid;gap:8px;margin:12px 0;"></div>
        <form id="m360-conversation-form">
          <label for="m360-conversation-input">What should the campaign be about?</label>
          <textarea id="m360-conversation-input" maxlength="5000" required placeholder="Example: Generate qualified enquiries for our industrial estate through email and WhatsApp next month."></textarea>
          <div class="m360-suggestions-wrap" aria-label="Campaign examples"><button type="button" data-campaign-suggestion="Generate qualified enquiries using email and WhatsApp.">Get enquiries</button><button type="button" data-campaign-suggestion="Promote our approved offer to existing opted-in customers.">Promote an offer</button><button type="button" data-campaign-suggestion="Create an awareness campaign using our approved Company Details.">Build awareness</button></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="primary" type="submit">Create my campaign</button><button id="m360-conversation-new" type="button">Start over</button></div>
        </form>
      </section>

      <!-- Multi-Agent Inter-Communication Console -->
      <details class="m360-card m360-advanced-tools">
        <summary>Advanced coordination tools</summary>
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
              <span class="m360-agent-name">Outreach AI</span>
            </div>
            <div class="m360-agent-status">Available; dependency status remains evidence-based</div>
            <p class="m360-agent-desc">Coordinates campaigns, surgical channel copy, 3-gate readiness &amp; budget math.</p>
          </div>
          <div class="m360-agent-box" id="box-agent-overview">
            <div class="m360-agent-box-head">
              <span class="m360-agent-tag">OVR</span>
              <span class="m360-agent-name">Overview AI</span>
            </div>
            <div class="m360-agent-status">Campaign telemetry summary available on demand</div>
            <p class="m360-agent-desc">Synchronizes live step telemetry, commercial goals &amp; global client routing.</p>
          </div>
          <div class="m360-agent-box" id="box-agent-leads">
            <div class="m360-agent-box-head">
              <span class="m360-agent-tag">LEAD</span>
              <span class="m360-agent-name">Leads &amp; Pipeline AI</span>
            </div>
            <div class="m360-agent-status">Authorized CRM and showcase pipeline refresh available</div>
            <p class="m360-agent-desc">Supplies verified CRM lead snapshots with email/phone &amp; opt-in consent states.</p>
          </div>
          <div class="m360-agent-box" id="box-agent-content">
            <div class="m360-agent-box-head">
              <span class="m360-agent-tag">CONT</span>
              <span class="m360-agent-name">Content Creation AI</span>
            </div>
            <div class="m360-agent-status">Saved Content Studio library query available</div>
            <p class="m360-agent-desc">Supplies key visuals, reels storyboards &amp; brand asset library.</p>
          </div>
        </div>
        <div class="m360-agent-toolbar">
          <button type="button" id="btn-bus-leads">Request Audience from Leads AI</button>
          <button type="button" id="btn-bus-content">Request Assets from Content AI</button>
          <button type="button" id="btn-bus-overview">Broadcast Telemetry to Overview AI</button>
          <button type="button" class="primary" id="btn-bus-full-sync">Run Multi-Engine Coordination</button>
        </div>
        <p style="margin:8px 0 0;font-size:12px;color:#526b5f"><strong>Audience</strong> refreshes this campaign from Leads &amp; Pipeline. <strong>Assets</strong> attaches saved Content Studio versions, or keeps the generated text plan when none exist. <strong>Telemetry</strong> prepares the current campaign summary for Overview. <strong>Coordination</strong> runs all three safely.</p>
        <div class="m360-terminal-wrap" id="m360-terminal-logs">
          <div class="m360-term-line"><span class="m360-term-ts">[READY]</span> <span class="m360-term-tag">[Outreach]</span> Waiting for an authenticated task. Dependencies are reported from API results only.</div>
        </div>
      </details>

      <!-- Step Progress Pipeline -->
      <details class="m360-card"><summary>Campaign activity</summary><div class="m360-stepper-wrap" id="m360-step-stepper">
        <div class="m360-step" id="step-accepted"><em>01</em><strong>Accepted</strong><small>Waiting</small></div>
        <div class="m360-step" id="step-requesting_leads"><em>02</em><strong>Requesting Leads</strong><small>Waiting</small></div>
        <div class="m360-step" id="step-audience_received"><em>03</em><strong>Audience Result</strong><small>Waiting</small></div>
        <div class="m360-step" id="step-requesting_content"><em>04</em><strong>Requesting Content</strong><small>Waiting</small></div>
        <div class="m360-step" id="step-assets_ready"><em>05</em><strong>Assets Result</strong><small>Waiting</small></div>
        <div class="m360-step" id="step-draft_ready"><em>06</em><strong>Draft Ready</strong><small>Waiting</small></div>
      </div></details>

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
          <h3 style="margin:0 0 4px;">Audience readiness</h3>
          <p id="m360-leads-summary-text" role="status">No audience loaded.</p>
          <p><a href="/client-dashboard.html?page=leads#leads" data-outreach-page="leads">Review contacts and permissions in Leads &amp; Pipeline</a></p>
          <details><summary>Browse contacts</summary>
          <label for="m360-audience-filter">Show contacts</label>
          <select id="m360-audience-filter"><option value="all">All contacts</option><option value="eligible">Eligible for the selected channel</option><option value="permission">Missing permission</option><option value="identifier">Missing contact details</option><option value="excluded">Suppressed or unsubscribed</option></select>
          <div style="display:flex; gap:10px; margin-bottom:10px;">
            <input type="text" id="m360-lead-search" placeholder="Filter contacts by name, email, or segment..." style="width:100%; padding:8px 12px; border:1px solid #cbdcd5; border-radius:6px; font-size:12.5px;">
          </div>
          <div style="max-height:180px; overflow-y:auto; border:1px solid #cbdcd5; border-radius:8px;">
            <table class="m360-table" id="m360-leads-table">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Channel Identifier</th>
                  <th>Permission for selected channel</th>
                  <th>Affinity Segment</th>
                </tr>
              </thead>
              <tbody id="m360-leads-tbody">
                <!-- Rendered dynamically -->
              </tbody>
            </table>
          </div>
          </details>
        </div>
      </div>

      <!-- 10-Channel Dedicated Workspaces -->
      <div class="m360-card" id="m360-channels-section">
        <h3 style="margin:0 0 4px;">2. Review and improve each message</h3>
        <p class="m360-subtext">Choose a channel. AI writes from the campaign goal and approved Company Details; your rewrite changes only this channel.</p>

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

            <button type="button" id="m360-edit-draft">Edit draft</button>
            <div id="m360-channel-custom-view">
              <!-- Rendered dynamically -->
            </div>

            <div style="margin-top:16px;">
              <label for="m360-revision-input" style="font-weight:700; font-size:13px; color:#173b31; display:block; margin-bottom:5px;">Ask AI to improve this message</label>
              <div class="m360-revision-suggestions"><button type="button" data-revision-suggestion="Make it shorter and clearer.">Shorter</button><button type="button" data-revision-suggestion="Make it warmer and more conversational while keeping every claim factual.">Friendlier</button><button type="button" data-revision-suggestion="Make the call to action stronger without adding unsupported claims.">Stronger action</button></div>
              <div class="m360-revision-actions">
                <input type="text" id="m360-revision-input" placeholder="Example: Make this clearer for first-time industrial buyers." style="flex:1; padding:9px 12px; border:1px solid #708d82; border-radius:8px; font-size:13px;">
                <button type="button" class="primary" id="btn-apply-revision">Rewrite with AI</button>
                <button type="button" id="btn-approve-channel">Approve this version</button>
                <button type="button" id="btn-launch-channel" class="primary" style="display:none; font-size:13px; padding:9px 14px;">Launch Channel</button>
                <button type="button" id="btn-test-preview" style="display:none; font-size:13px; padding:9px 14px; background:#075e54; color:#fff; border:none; border-radius:8px; font-weight:600; cursor:pointer;">Test on My Device</button>
              </div>
            </div>
          </div>

          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-weight:700; font-size:14px; color:#163c32;"></span>
              <span style="font-size:11px; color:#6b8c82;"></span>
            </div>
            <details><summary>Changes from previous version</summary><div class="m360-diff-viewer" id="m360-diff-viewer">
              <span class="m360-diff-same">Initial version created. No revisions recorded yet.</span>
            </div></details>

            <!-- Email-to-CTWA Bridge -->
            <div class="m360-ctwa-card" id="m360-ctwa-card">
              <h4>Email-to-Click-to-WhatsApp (CTWA) Opt-In Bridge</h4>
              <p style="font-size:12.5px; color:#1e3a8a; margin:0 0 10px; line-height:1.5;" id="m360-ctwa-summary">
                No verified bridge audience is available yet.
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
        <p class="m360-subtext">Explore how budget and duration affect planning estimates. These are assumptions, not measured campaign results.</p>

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
              <h4 style="margin:0 0 6px; font-size:14px; color:#1e293b;">Plan a message comparison</h4>
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
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:10px 0;">
            <button type="button" id="m360-calendar-prev" aria-label="Previous month">Previous</button>
            <strong id="m360-calendar-month">Campaign month</strong>
            <button type="button" id="m360-calendar-next" aria-label="Next month">Next</button>
          </div>
          <div id="m360-calendar-grid" role="grid" aria-label="Campaign calendar" style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;"></div>
          <p id="m360-calendar-summary" role="status" style="font-size:12px;color:#49675d;margin:10px 0;">No campaigns scheduled.</p>
          <section id="m360-calendar-editor" aria-labelledby="m360-calendar-editor-title" style="margin-top:10px;padding:12px;border:1px solid #cbdcd5;border-radius:8px;">
            <h4 id="m360-calendar-editor-title" style="margin:0 0 8px;">Add campaign</h4>
            <div id="m360-calendar-day-events" style="font-size:12px;margin-bottom:8px;"></div>
            <form id="m360-calendar-form">
              <label>Campaign title<input id="m360-calendar-title" maxlength="160" required></label>
              <label>Channel<select id="m360-calendar-channel">${CHANNELS.map(channel => `<option>${channel}</option>`).join('')}</select></label>
              <label>Date<input id="m360-calendar-date" type="date" required></label>
              <label>Status<select id="m360-calendar-status"><option value="draft">Draft</option><option value="pending_approval">Pending approval</option><option value="approved">Approved</option><option value="pending_provider_connection">Waiting for provider</option><option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
              <div style="display:flex;gap:8px;margin-top:8px;"><button type="submit" class="primary" id="m360-calendar-save">Add campaign</button><button type="button" id="m360-calendar-new">New</button><button type="button" id="m360-calendar-remove" hidden>Remove</button></div>
            </form>
          </section>
          <section aria-labelledby="m360-journey-title" style="margin-top:12px;padding:12px;border:1px solid #cbdcd5;border-radius:8px;">
            <h4 id="m360-journey-title" style="margin:0 0 8px;">Customer journey rules</h4>
            <form id="m360-journey-form">
              <label>Rule name<input id="m360-journey-name" maxlength="120" required placeholder="Notify owner after an email click"></label>
              <label>Verified trigger<select id="m360-journey-trigger"><option value="email_delivered">Email delivered</option><option value="email_clicked">Email clicked</option><option value="lead_replied">Lead replied</option><option value="campaign_provider_accepted">Provider accepted campaign</option></select></label>
              <label>Action<select id="m360-journey-action"><option value="notify_owner">Notify owner</option><option value="create_crm_followup">Create CRM follow-up</option><option value="stop_campaign">Stop campaign</option></select></label>
              <label>Delay hours<input id="m360-journey-delay" type="number" min="0" max="720" value="0"></label>
              <button type="submit">Add journey rule</button>
            </form>
            <div id="m360-journey-list" style="display:grid;gap:6px;margin-top:8px;"></div>
            <small>Rules execute only from verified provider/CRM events. Draft rules do not send messages.</small>
          </section>
          <small style="color:#6b8c82;">Status: <strong>dispatched: false</strong> (Review and connection required before dispatch).</small>
        </div>

        <div class="m360-card">
          <dialog id="m360-draft-editor" aria-label="Edit channel draft">
            <form id="m360-draft-edit-form">
              <h3>Edit draft</h3>
              <label id="m360-edit-subject-label">Subject or title<input id="m360-edit-subject" maxlength="150"></label>
              <label id="m360-edit-preheader-label">Email preview text<input id="m360-edit-preheader" maxlength="120"></label>
              <label>Message<textarea id="m360-edit-body" rows="8" required></textarea></label>
              <p id="m360-draft-edit-status" role="status">Saving creates a version for review.</p>
              <button type="button" id="m360-cancel-draft-edit">Cancel</button>
              <button type="submit" id="m360-save-draft-edit">Save as new draft</button>
            </form>
          </dialog><dialog id="m360-email-preview" aria-label="Email preview"><form method="dialog"><button>Close preview</button></form><h3>Email preview</h3><div id="m360-email-preview-content"></div></dialog>
          <h3 id="m360-outreach-test" style="margin:0 0 4px;">3. Send a test email</h3>
          <p class="m360-subtext">Approve the Email message, enter the recipient’s email address, and send one message. No contact list is needed for this test.</p>
          <div style="display:grid; gap:8px; margin-bottom:14px;">
            <div style="display:flex; justify-content:space-between; padding:8px 10px; background:#f6faf8; border:1px solid #cbdcd5; border-radius:6px; font-size:12.5px;">
              <span>WhatsApp Cloud API</span>
              <span style="color:#92400e; font-weight:600;">Disconnected (Setup Required)</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:8px 10px; background:#f6faf8; border:1px solid #cbdcd5; border-radius:6px; font-size:12.5px;">
               <span>Brevo SMTP Email</span>
              <span id="m360-email-provider-status" style="color:#92400e; font-weight:600;">Connection checked when you send</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:8px 10px; background:#f6faf8; border:1px solid #cbdcd5; border-radius:6px; font-size:12.5px;">
              <span>Meta Graph API</span>
              <span style="color:#92400e; font-weight:600;">Disconnected (Setup Required)</span>
            </div>
          </div>
          <label for="m360-email-test-recipient" style="display:block;margin-top:10px;">Where should the test email go?</label>
          <input id="m360-email-test-recipient" type="email" autocomplete="email" placeholder="name@example.com" aria-describedby="m360-email-test-help">
          <small id="m360-email-test-help" style="display:block;color:#6b8c82;">Prepare and approve an Email draft first.</small>
          <button type="button" class="primary" id="m360-send-test-email" disabled style="margin:10px 0;">Send one test email</button>
          <div style="padding:12px; background:#edf6f2; border:1px solid #cbdcd5; border-radius:8px; font-size:12.5px; color:#174c40;">
            <strong id="m360-outreach-results">Campaign results</strong><p id="m360-results-summary">No verified delivery results yet.</p><p id="m360-delivery-events" role="status"></p><button type="button" id="m360-refresh-results">Check verified events</button>
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

    const campaignEntry=$('m360-conversation-form').closest('section');
    host.insertBefore(campaignEntry,$('m360-mkt-context'));
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
    if (!token) throw Error('Sign in to use Outreach.');
    const response = await fetch(path, { cache: 'no-store', ...options, headers: { Accept: 'application/json', Authorization: 'Bearer ' + token, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({ error: 'Outreach API returned unreadable data.' }));
    if (!response.ok) throw Object.assign(Error(data.error || data.message || 'Outreach request failed.'), { status: response.status, code: data.code });
    return data;
  }

  function normalizeTask(task) {
    return { ...task, profile_type: task.affinity_strategy?.profile_type || task.profile_type || 'unclassified', strategy: task.affinity_strategy || task.strategy };
  }

  async function loadTask(correlationId) {
    const workspaceId=ws(),handoff=window.M360ActiveCampaign;
    const data = await api('/api/marketing/tasks?' + new URLSearchParams({ workspace_id: workspaceId, correlation_id: correlationId }));
    if(workspaceId!==ws())throw Error('Workspace changed while opening the campaign.');
    if(window.M360ActiveCampaign!==handoff&&window.M360ActiveCampaign?.workspace_id===workspaceId&&window.M360ActiveCampaign.correlation_id!==correlationId)return activeTask||normalizeTask(data.task);
    if (activeTask?.correlation_id !== correlationId) {
      calendarCursor=null;
      $('m360-delivery-events').textContent='';
      if($('m360-draft-editor').open)$('m360-draft-editor').close();
      $('m360-email-test-recipient').value='';
      if($('m360-email-preview').open)$('m360-email-preview').close();
    }
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
      if (activeCtx && activeCtx.correlation_id && (!activeCtx.workspace_id || activeCtx.workspace_id===workspaceId)) {
        try {
          await loadTask(activeCtx.correlation_id);
          setMktStatus('Active campaign loaded from Overview.');
          return;
        } catch (_) {}
      }
      const data = await api('/api/marketing/tasks?' + new URLSearchParams({ workspace_id: workspaceId }));
      if(workspaceId!==ws()||window.M360ActiveCampaign!==activeCtx)return;
      if (!data.tasks?.length) return setMktStatus('No Outreach task exists for this workspace yet.');
      await loadTask(data.tasks[0].correlation_id);
      setMktStatus(activeTask.channel_draft_versions ? 'Latest campaign loaded.' : 'Campaign preparation is in progress.');
    } catch (error) { setMktStatus(error.message); }
  }

  async function waitForTask(correlationId) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const task = await loadTask(correlationId);
      setMktStatus('Outreach task: ' + task.status, !['draft_ready', 'failed'].includes(task.status));
      if (['draft_ready', 'failed'].includes(task.status)) return task;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw Error('Outreach task is still running. Use the task list to refresh.');
  }

  function bindDraftEditor(){
    const editor=$('m360-draft-editor');
    let editing=null;
    $('m360-edit-draft').addEventListener('click',()=>{
      const draft=activeTask?.channel_draft_versions?.[activeChannel]?.versions?.at(-1);
      if(!draft)return;
      editing={workspace:ws(),task:activeTask.correlation_id,channel:activeChannel,hash:draft.version_hash};
      $('m360-edit-subject-label').hidden=!draft.subject&&activeChannel!=='Email';
      $('m360-edit-preheader-label').hidden=activeChannel!=='Email';
      $('m360-edit-subject').value=draft.subject||'';
      $('m360-edit-preheader').value=draft.preview_text||'';
      $('m360-edit-body').value=draft.body||'';
      $('m360-draft-edit-status').textContent='Saving creates a version for review.';
      editor.showModal();
    });
    $('m360-cancel-draft-edit').addEventListener('click',()=>editor.close());
    $('m360-draft-edit-form').addEventListener('submit',async event=>{
      event.preventDefault();
      if(!editing||editing.workspace!==ws()||editing.task!==activeTask?.correlation_id)return;
      const context=editing,button=$('m360-save-draft-edit');
      if(button.disabled)return;
      button.disabled=true;
      try{
        const data=await api('/api/marketing/revise',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          workspace_id:context.workspace,correlation_id:context.task,channel:context.channel,version_hash:context.hash,
          manual_edit:{body:$('m360-edit-body').value,subject:$('m360-edit-subject').value,preview_text:$('m360-edit-preheader').value}
        })});
        if(context.workspace!==ws()||context.task!==activeTask?.correlation_id)return;
        activeTask.channel_draft_versions=data.channel_draft_versions;
        activeTask.channel_readiness=data.channel_readiness;
        renderChannelTabs();renderActiveChannel();
        if(editing===context&&editor.open)editor.close();
        notify('New draft saved for approval.','success');
      }catch(error){if(editing===context)$('m360-draft-edit-status').textContent=error.message;}
      finally{button.disabled=false;}
    });
  }

  function bindEventListeners() {
    $('marketing-centre').querySelectorAll('[data-outreach-page]').forEach(link=>link.addEventListener('click',event=>{
      if(!window.Matrix360Router?.navigateToPage||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      event.preventDefault();window.Matrix360Router.navigateToPage(link.dataset.outreachPage);
    }));
    bindDraftEditor();
    document.addEventListener('m360:outreach-open-review', async event => {
      const { workspace, correlationId, channel } = event.detail;
      if (workspace !== ws() || !auth() || !CHANNELS.includes(channel)) return;
      window.M360ActiveCampaign = { workspace_id: workspace, correlation_id: correlationId, channel };
      activeChannel = channel;
      try {
        await loadTask(correlationId);
        if (workspace !== ws() || activeTask?.correlation_id !== correlationId || window.Matrix360Router?.resolveInitialPage() !== 'marketing') return;
        activeChannel = channel;
        renderChannelTabs();
        renderActiveChannel();
        window.Matrix360Router?.navigateToPage('marketing', '#m360-channels-section', true);
        $('m360-channels-section').tabIndex = -1;
        $('m360-channels-section').focus({preventScroll:true});
      } catch (error) {
        if (workspace === ws()) setMktStatus(error.message);
      }
    });
    $('m360-refresh-results').addEventListener('click',loadVerifiedResults);
    $('m360-email-test-recipient').addEventListener('input',renderTestReadiness);
    $('m360-audience-filter').addEventListener('change',()=>renderLeadsTable());
    $('m360-email-preview').addEventListener('close',()=>$('m360-email-preview-content').replaceChildren());
    document.addEventListener('m360:outreach-brief',event=>{
      if(event.detail?.workspace!==ws()||!auth())return;
      activeConversation=null;renderConversation();
      if(CHANNELS.includes(event.detail.channel))activeChannel=event.detail.channel;
      const input=$('m360-conversation-input');
      input.value=String(event.detail.prompt||'').slice(0,input.maxLength);
      input.focus({preventScroll:true});
      setMktStatus('Overview brief loaded. Review it before preparing campaign drafts.');
    });
    document.addEventListener('m360:campaign-prepared',event=>{
      if(event.detail?.workspace_id!==ws())return;
      activeChannel=CHANNELS.includes(event.detail.channel)?event.detail.channel:'Email';
      loadTask(event.detail.correlation_id).then(()=>setMktStatus(activeChannel+' draft ready for review. Nothing sent.')).catch(error=>setMktStatus(error.message));
    });
    // Automatic workspace synchronization
    document.addEventListener('m360:crm-loaded', event => {
      if (event.detail?.workspace !== ws()) return;
      if ($('m360-active-client-label')) $('m360-active-client-label').textContent = getActiveClientInfo().clientName;
      if (!activeTask) loadSavedTaskForWorkspace(ws());
    });
    $('workspace')?.addEventListener('change', () => {
      const info = getActiveClientInfo();
      if ($('m360-active-client-label')) $('m360-active-client-label').textContent = info.clientName;
      activeTask=null;activeConversation=null;activeChannel='Email';
      $('m360-email-test-recipient').value='';
      $('m360-email-provider-status').textContent='Connection checked when you send';
      if($('m360-email-preview').open)$('m360-email-preview').close();
      if($('m360-draft-editor').open)$('m360-draft-editor').close();
      $('m360-delivery-events').textContent='';
      $('m360-conversation-input').value='';renderConversation();renderTestReadiness();
      for(const id of ['m360-campaign-summary','m360-results-summary','m360-channel-tabs','m360-channel-custom-view','m360-gate-container','m360-leads-tbody','m360-leads-summary-text','m360-diff-viewer','m360-strategy-content'])$(id)?.replaceChildren();
      $('m360-channels-section').hidden=true;
      syncOutreachSteps();
      loadSavedTaskForWorkspace(info.wsId);
    });

    // Inter-Agent Action Buttons
    $('btn-bus-leads')?.addEventListener('click', () => coordinateEngines('audience'));
    $('btn-bus-content')?.addEventListener('click', () => coordinateEngines('content'));
    $('btn-bus-overview')?.addEventListener('click', () => coordinateEngines('overview'));
    $('btn-bus-full-sync')?.addEventListener('click', () => coordinateEngines('full'));
    $('m360-calendar-prev')?.addEventListener('click', () => { const date = calendarCursor || new Date(); calendarCursor = new Date(date.getFullYear(), date.getMonth() - 1, 1); renderCalendar(); });
    $('m360-calendar-next')?.addEventListener('click', () => { const date = calendarCursor || new Date(); calendarCursor = new Date(date.getFullYear(), date.getMonth() + 1, 1); renderCalendar(); });
    $('m360-calendar-new')?.addEventListener('click', () => { calendarSelectedEventId = ''; renderCalendarEditor(); });
    $('m360-calendar-form')?.addEventListener('submit', saveCalendarEvent);
    $('m360-calendar-remove')?.addEventListener('click', removeCalendarEvent);
    $('m360-journey-form')?.addEventListener('submit', saveJourneyRule);
    $('m360-conversation-form')?.addEventListener('submit', submitMarketingConversation);
    $('m360-conversation-new')?.addEventListener('click', () => { window.M360CampaignWorkspace?.clear('marketing');activeConversation = null; $('m360-conversation-history').replaceChildren(); $('m360-conversation-input').value = ''; setMktStatus('New Outreach conversation ready.'); });
    document.querySelectorAll('[data-campaign-suggestion]').forEach(button => button.addEventListener('click', () => { $('m360-conversation-input').value = button.dataset.campaignSuggestion; $('m360-conversation-input').focus(); }));
    document.querySelectorAll('[data-revision-suggestion]').forEach(button => button.addEventListener('click', () => { $('m360-revision-input').value = button.dataset.revisionSuggestion; $('m360-revision-input').focus(); }));
    $('m360-send-test-email')?.addEventListener('click', sendControlledTestEmail);

    // Surgical Revision
    $('btn-apply-revision')?.addEventListener('click', async () => {
      const revText = $('m360-revision-input')?.value?.trim();
      if (!revText || !activeTask?.channel_draft_versions) return;

      appendTerminalLog('Revision AI', 'Surgically revising channel copies based on: ' + revText);

      try {
        setMktStatus('Outreach AI is grounding the rewrite in Company Details…', true);
        const data = await api('/api/marketing/revise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace_id: ws(), correlation_id: activeTask.correlation_id, channel: activeChannel, revision_prompt: revText }) });
        activeTask.channel_draft_versions = data.channel_draft_versions;
        activeTask.channel_readiness = data.channel_readiness;
        activeTask.ai_telemetry = data.ai_telemetry;
        $('m360-revision-input').value = '';
        renderActiveChannel(); renderChannelTabs();
        appendTerminalLog('Revision', 'Updated: ' + data.targeted_channels.join(', ') + '; preserved: ' + data.preserved_channels.join(', ') + '.');
        notify('Only ' + data.targeted_channels.join(', ') + ' received new versions.', 'success');
      } catch (error) { notify(error.message, 'error'); }
      finally { setMktStatus('Ready'); }
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
      if (!liveSendingEnabled) return notify('Sending is disabled. Drafts and paid creative generation remain available.', 'error');
      const g = activeTask?.channel_readiness?.[activeChannel]?.gates;
      if (!g?.gate1_draft?.passed) {
        notify('Gate 1 Blocked: Editorial approval required before launch.', 'error');
        return;
      }
      if (!g?.gate2_audience?.passed || g.gate2_audience.eligible_count <= 0) {
        notify('Gate 2 Blocked: No eligible contacts with verified consent found.', 'error');
        return;
      }
      if (activeChannel!=='Email'&&!g?.gate3_provider?.passed) {
        alert('[GATE 3 BLOCKED - PROVIDER CONNECTION REQUIRED]\n\n' +
          'No authenticated ' + (g?.gate3_provider?.provider_name || 'API') + ' connection is configured.\n\n' +
          'To dispatch real messages, configure the authorized credentials in your local .env.local:\n' +
          (activeChannel === 'WhatsApp' ? '- WHATSAPP_API_TOKEN\n- WHATSAPP_PHONE_NUMBER_ID\n' :
           activeChannel === 'Email' ? '- BREVO_SMTP_HOST\n- BREVO_SMTP_PORT\n- BREVO_SMTP_LOGIN\n- BREVO_SMTP_KEY\n- BREVO_SENDER_EMAIL\n' :
           '- META_ACCESS_TOKEN\n') +
          '\nLive outbound execution is blocked until genuine credentials are provided.');
        return;
      }

      const channel=activeChannel,workspaceId=ws(),taskId=activeTask.correlation_id;
      const draft=activeTask.channel_draft_versions[channel].versions.at(-1);
      if(!confirm('Launch '+channel+' version '+draft.version+' to '+g.gate2_audience.eligible_count+' eligible contact(s)?'))return;
      $('btn-launch-channel').disabled=true;

      setMktStatus('Launching ' + activeChannel + ' through live provider gateway…', true);
      try {
        const res = await fetch('/api/marketing/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (auth() || '') },
          body: JSON.stringify({
            workspace_id: ws(),
            correlation_id: activeTask.correlation_id,
            channel: activeChannel,
            mode: 'live',
            operator_approved: activeChannel === 'Email',
            approval_phrase: activeChannel === 'Email' ? 'SEND_APPROVED_EMAIL_CAMPAIGN' : '',
            version_hash: draft.version_hash
          })
        });
        const data = await res.json();
        if (data.status === 'ok' || data.status === 'provider_accepted') {
          const execution = data.executions?.[0] || {};
          const dest = (data.recipient_count || execution.recipient_count || 0) + ' recipient(s)';
          appendTerminalLog('Execution Dispatch', activeChannel + ' accepted by ' + (execution.provider || 'verified provider') + ' for ' + dest + '.');
          notify(channel + ' was accepted by the verified provider. Delivery is pending.', 'success');
          if(workspaceId===ws()&&activeTask?.correlation_id===taskId)await loadTask(taskId);
        } else {
          notify('Dispatch blocked: ' + (data.error || 'Provider execution failed'), 'error');
        }
      } catch (err) {
        notify('Execution error: ' + err.message, 'error');
      } finally {
        setMktStatus('Ready');
        if(activeTask?.channel_draft_versions)renderActiveChannel();
      }
    });

    // Test on My Device (WhatsApp Click-to-Chat or Email test preview)
    $('btn-test-preview')?.addEventListener('click', async () => {
      if(activeChannel==='Email'){
        const view=$('m360-channel-custom-view');
        $('m360-email-preview-content').replaceChildren(view.firstElementChild.cloneNode(true));
        $('m360-email-preview').showModal();
        return;
      }
      setMktStatus('Preparing WhatsApp preview…', true);
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
        if ((data.status === 'ok' || data.status === 'test_preview_ready') && data.test_url) {
          appendTerminalLog('Test Preview', 'WhatsApp Click-to-Chat URL ready: ' + data.test_url);
          notify('Test URL ready! Opening WhatsApp Web/App...', 'success');
          window.open(data.test_url, '_blank');
        } else if (data.status === 'ok' || data.status === 'test_preview_ready') {
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

  async function coordinateEngines(operation) {
    if (!activeTask) return notify('Create or open an Outreach campaign first.', 'error');
    const labels = { audience: 'Refreshing audience from Leads & Pipeline…', content: 'Checking saved Content Studio assets…', overview: 'Preparing Overview campaign telemetry…', full: 'Coordinating Leads, Content, Overview and Outreach…' };
    setMktStatus(labels[operation], true);
    try {
      const data = await api('/api/marketing/coordination', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace_id: ws(), correlation_id: activeTask.correlation_id, operation }) });
      activeTask = normalizeTask(data.task);
      renderCompleteTask();
      if (data.audience) appendTerminalLog('Leads & Pipeline', `${data.audience.count} authorized record(s) attached${data.audience.outbound_blocked ? '; showcase outbound remains blocked' : ''}.`);
      if (data.content) appendTerminalLog('Content Studio', data.content.asset_count ? `${data.content.asset_count} saved asset version(s) attached.` : 'No saved visual asset found; generated text strategy remains ready.');
      if (data.overview) appendTerminalLog('Overview', `Telemetry ready for campaign ${data.overview.correlation_id}.`);
      notify(operation === 'full' ? 'Multi-engine coordination completed.' : labels[operation].replace('…', ' completed.'), 'success');
    } catch (error) { notify(error.message, 'error'); }
    finally { setMktStatus('Ready'); }
  }

  let sendingTest=false;
  function testBlocker(){
    if(!liveSendingEnabled)return 'Sending is disabled. You can prepare and review drafts.';
    const draft=activeTask?.channel_draft_versions?.Email?.versions?.at(-1);
    const recipient=$('m360-email-test-recipient').value.trim();
    if(!draft)return 'Prepare an Email draft first.';
    if(draft.status!=='approved')return 'Approve Email version '+draft.version+' first.';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))return 'Enter a valid recipient email address.';
    return '';
  }

  function renderTestReadiness(){
    const blocker=testBlocker();
    $('m360-email-test-help').textContent=blocker||'Ready to send this approved draft to the address you entered.';
    $('m360-send-test-email').disabled=sendingTest||Boolean(blocker);
  }

  async function sendControlledTestEmail() {
    if (!activeTask?.channel_draft_versions?.Email) return notify('Create a campaign first.', 'error');
    const draft = activeTask.channel_draft_versions.Email.versions.at(-1);
    if (draft.status !== 'approved') return notify('Approve the current Email draft before sending the test.', 'error');
    const recipient = $('m360-email-test-recipient').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return notify('Enter a valid test email address.', 'error');
    const blocker=testBlocker();
    if(sendingTest||blocker)return;
    if(!confirm('Send one copy of Email version '+draft.version+' to '+recipient+'?'))return;
    const taskId=activeTask.correlation_id,workspaceId=ws();
    sendingTest=true;renderTestReadiness();
    setMktStatus('Submitting one Brevo test email…', true);
    try {
      const data = await api('/api/marketing/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace_id: ws(), correlation_id: activeTask.correlation_id, channel: 'Email', mode: 'live', operator_approved: true, controlled_test: true, test_recipient: recipient, version_hash: draft.version_hash }) });
      appendTerminalLog('Brevo Email Test', `Provider accepted the approved Email draft for ${recipient}. Message ID: ${data.executions?.[0]?.provider_message_ids?.[0] || 'recorded by provider'}.`);
      $('m360-email-provider-status').textContent='Brevo accepted the test email';
      notify(`Brevo accepted the email for ${recipient}. Delivery is not claimed until a verified event arrives.`, 'success');
      if(workspaceId===ws()&&activeTask?.correlation_id===taskId)await loadTask(taskId);
    } catch (error) { $('m360-email-provider-status').textContent=error.message; notify(error.message, 'error'); }
    finally { sendingTest=false;renderTestReadiness();setMktStatus('Ready'); }
  }

  function renderConversation() {
    const history = $('m360-conversation-history');
    if (!history) return;
    history.replaceChildren();
    for (const message of activeConversation?.messages || []) {
      const bubble = document.createElement('p');
      bubble.className = 'm360-conversation-bubble ' + (message.role === 'user' ? 'user' : 'assistant');
      bubble.textContent = `${message.role === 'user' ? 'You' : 'Outreach AI'}: ${message.content}`;
      history.append(bubble);
    }
  }

  let preparingCampaign=false;
  async function prepareCampaign(message, channel, workspaceId=ws()) {
    if(workspaceId!==ws()||!auth())throw Error('Your workspace session changed.');
    if(preparingCampaign)throw Error('A campaign is already being prepared.');
    preparingCampaign=true;
    setMktStatus('Preparing campaign draft…',true);
    try {
      const path=activeConversation?.status==='clarification_required'
        ? '/api/marketing/conversations/'+activeConversation.conversation_id+'/messages'
        : '/api/marketing/conversations';
      const data=await api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspace_id:workspaceId,message})});
      if(workspaceId!==ws())throw Error('Workspace changed while preparing the campaign.');
      activeConversation=data.conversation;
      renderConversation();
      if(data.status!=='dispatched'){
        setMktStatus('What should the campaign be about?');
        return data;
      }
      if(CHANNELS.includes(channel))activeChannel=channel;
      const task=await waitForTask(data.correlation_id);
      if(task.status==='failed')throw Error('Campaign preparation failed. Review the task and try again.');
      setMktStatus('Campaign draft ready to review.');
      return data;
    } finally { preparingCampaign=false; }
  }
  window.M360Outreach={prepareCampaign};

  async function submitMarketingConversation(event) {
    event.preventDefault();
    const input = $('m360-conversation-input'), message = input.value.trim();
    if (!message) return;
    if(window.M360CampaignWorkspace){
      try{window.M360CampaignWorkspace.open(message,{origin:'marketing'});setMktStatus('Campaign questions and review will stay here.');}
      catch(error){setMktStatus(error.message);}
      return;
    }
    setMktStatus('Preparing campaign conversation…', true);
    try {
      await prepareCampaign(message,activeChannel);
      if(input.value.trim()===message)input.value='';
    } catch (error) { setMktStatus(error.message); notify(error.message, 'error'); }
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

    renderCampaignSummary();
    const strat = activeTask.strategy;
    if ($('m360-strategy-content')) {
      $('m360-strategy-content').innerHTML = `
        <div style="margin-bottom:10px;">
          <strong>Offer direction to review:</strong> ${escapeHtml(strat.pitch_framing.value_proposition)}
        </div>
        <div style="margin-bottom:10px;">
          <strong>Message angle to review:</strong> ${escapeHtml(strat.pitch_framing.emotional_hook)}
        </div>
        <div style="margin-bottom:12px;">
          <strong>Call to Action:</strong> <em>${escapeHtml(strat.pitch_framing.call_to_action)}</em>
        </div>
        <div>
          <strong>Audience groups to review:</strong>
          <ul style="margin:6px 0 0; padding-left:20px; font-size:13px;">
            ${strat.core_segments.map(s => `<li><strong>${escapeHtml(s.name)}:</strong> ${escapeHtml(s.affinity_signal)}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    renderChannelTabs();
    renderActiveChannel();
    renderCalendar();
    renderJourneyRules();
    recalcBudget(+$('m360-slider-budget').value, +$('m360-slider-duration').value);
    document.dispatchEvent(new CustomEvent('m360:outreach-review-updated', { detail: { workspace: ws() } }));
  }

  function syncOutreachSteps() {
    const draft = activeTask?.channel_draft_versions?.[activeChannel]?.versions?.at(-1);
    const recorded = (activeTask?.execution_history || []).some(entry => entry.status === 'provider_accepted' && entry.channel === activeChannel && entry.draft_version_id === draft?.version_id);
    const current = recorded && draft?.status === 'approved' ? 3 : draft?.status === 'approved' ? 2 : draft ? 1 : 0;
    $('marketing-centre').querySelectorAll('.m360-workspace-steps a').forEach((link, index) => {
      if (current === index) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
      if (!draft && index) link.setAttribute('aria-disabled', 'true');
      else link.removeAttribute('aria-disabled');
    });
  }

  function renderCampaignSummary(){
    const task=activeTask;
    const hasDraft=Object.values(task.channel_draft_versions||{}).some(entry=>entry?.versions?.length);
    const objective=task.prompt||task.objective||task.handover_envelope?.objective||task.strategy?.pitch_framing?.value_proposition;
    const updated=new Date(task.updated_at);
    $('m360-campaign-summary').textContent=[objective,hasDraft?'Drafts available to review':task.status==='failed'?'Preparation failed':'Preparing campaign',Number.isFinite(+updated)?'Updated '+updated.toLocaleString():''].filter(Boolean).join(' · ');
    for(const step of $('m360-step-stepper').querySelectorAll('.m360-step')){
      const name=step.id.slice(5),record=(task.step_history||[]).find(item=>item.step===name||item.status===name);
      step.querySelector('small').textContent=record?'Recorded':name==='draft_ready'&&hasDraft?'Available':'Waiting';
    }
    const executions=(task.execution_history||[]).filter(item=>item.status==='provider_accepted');
    const accepted=executions.filter(item=>item.provider!=='brevo_smtp_controlled_test').reduce((sum,item)=>sum+(Number(item.recipient_count)||0),0);
    const tests=executions.filter(item=>item.provider==='brevo_smtp_controlled_test').length;
    $('m360-results-summary').textContent=accepted||tests?'Provider accepted '+accepted+' campaign recipient(s) and '+tests+' test send(s).':'No provider acceptance recorded.';
  }

  async function loadVerifiedResults(){
    const wsId=ws(),taskId=activeTask?.correlation_id;
    const status=$('m360-delivery-events'),button=$('m360-refresh-results');
    if(!taskId){status.textContent='Open a campaign first.';return;}
    button.disabled=true;status.textContent='Checking verified provider events…';
    try{
      const result=await api('/api/marketing/campaigns/'+encodeURIComponent(taskId)+'/results?'+new URLSearchParams({workspace_id:wsId}));
      if(wsId!==ws()||taskId!==activeTask?.correlation_id)return;
      const labels={delivered:'Delivered',opened:'Opened',unique_opened:'Opened',click:'Clicked',clicked:'Clicked',hard_bounce:'Hard bounce',soft_bounce:'Soft bounce',unsubscribed:'Unsubscribed'};
      const events=(result.verified_events||[]).filter(item=>Object.hasOwn(labels,item.event_type)&&Number.isFinite(Date.parse(item.occurred_at)));
      if(!events.length){status.textContent='No verified delivery or engagement events found.';return;}
      const counts=new Map();
      for(const event of events){const label=labels[event.event_type];counts.set(label,(counts.get(label)||0)+1);}
      status.textContent='Recent verified events · '+[...counts].map(([label,count])=>label+' '+count).join(' · ')+'. Latest '+new Date(events[0].occurred_at).toLocaleString()+'.';
    }catch(error){
      if(wsId===ws()&&taskId===activeTask?.correlation_id)status.textContent='Could not load verified events. Try again.';
    }finally{button.disabled=false;}
  }

  function renderLeadsTable(query = $('m360-lead-search').value.trim().toLowerCase()) {
    const tbody = $('m360-leads-tbody');
    if (!tbody) return;
    const all=activeTask?.audience_snapshot?.contacts||[];
    const status=c=>{
      if(c.suppressed||c.unsubscribed)return 'excluded';
      if(activeChannel==='Email'){
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email||''))return 'identifier';
        return ['granted','opted_in'].includes(c.email_opt_in_status)&&c.consent_evidence?.email===true?'eligible':'permission';
      }
      if(activeChannel==='WhatsApp'){
        if(!c.phone)return 'identifier';
        return c.whatsapp_opt_in_status==='granted'&&c.consent_evidence?.whatsapp===true?'eligible':'permission';
      }
      return 'unavailable';
    };
    const labels={eligible:'Eligible',permission:'Missing permission',identifier:'Missing contact details',excluded:'Suppressed or unsubscribed',unavailable:'See channel readiness'};
    const filter=$('m360-audience-filter').value;
    const contacts = all.filter(c => {
      if(filter!=='all'&&status(c)!==filter)return false;
      if (!query) return true;
      return (c.name || '').toLowerCase().includes(query) || (c.email || '').toLowerCase().includes(query) || (c.segment && c.segment.toLowerCase().includes(query));
    });

    const counts={eligible:0,permission:0,identifier:0,excluded:0,unavailable:0};
    const names=new Map();
    for(const contact of all){
      counts[status(contact)]++;
      const name=String(contact.name||'').trim().toLowerCase();
      if(name)names.set(name,(names.get(name)||0)+1);
    }
    $('m360-leads-summary-text').textContent=activeChannel+' · '+all.length+' contacts · '+Object.entries(counts).filter(([key,count])=>count||key==='eligible').map(([key,count])=>count+' '+labels[key].toLowerCase()).join(' · ');

    if (contacts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:22px; color:#64748b;">' +
        '<p style="margin:0 0 10px;">No contacts match this view.</p>' +
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
        <td><strong>${escapeHtml(c.name || 'Contact')}</strong>${names.get(String(c.name||'').trim().toLowerCase())>1?'<br><small>Repeated name · review in Leads</small>':''}</td>
        <td><code>${escapeHtml(c.email || '')}</code><br><small style="color:#64748b;">${escapeHtml(c.phone || '')}</small></td>
        <td>
          <span class="m360-tab-badge" style="${c.whatsapp_opt_in_status === 'granted' ? 'background:#dcfce7; color:#166534;' : 'background:#fef3c7; color:#92400e;'}">
            ${labels[status(c)]}
          </span>
        </td>
        <td>${escapeHtml(c.segment || 'General')}</td>
      </tr>
    `).join('');
  }

  function renderCalendar() {
    const grid = $('m360-calendar-grid');
    if (!grid) return;
    const events = Array.isArray(activeTask?.calendar_events) ? activeTask.calendar_events : [];
    if (!calendarCursor) calendarCursor = events.length ? new Date(events[0].scheduled_for) : new Date();
    const year = calendarCursor.getFullYear(), month = calendarCursor.getMonth();
    $('m360-calendar-month').textContent = calendarCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const byDay = new Map();
    for (const event of events) {
      const date = new Date(event.scheduled_for);
      if (Number.isNaN(date.getTime())) continue;
      const parts = new Intl.DateTimeFormat('en', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: event.timezone || 'Asia/Kolkata' }).formatToParts(date);
      const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
      const key = `${values.year}-${values.month}-${values.day}`;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(event);
    }
    const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const cells = weekdays.map(day => `<div role="columnheader" style="font-weight:700;padding:6px;text-align:center;">${day}</div>`);
    const first = new Date(year, month, 1), start = new Date(year, month, 1 - first.getDay());
    const today = new Date(), todayKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
    for (let index = 0; index < 42; index++) {
      const date = new Date(start); date.setDate(start.getDate() + index);
      const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      const items = byDay.get(key) || [];
      const muted = date.getMonth() !== month ? 'opacity:.45;' : '';
      const details = items.map(event => `<button type="button" data-calendar-event="${escapeHtml(event.event_id)}" style="display:block;width:100%;margin-top:3px;padding:3px;border:0;border-radius:4px;background:#e8f5ee;font-size:10px;text-align:left;" title="${escapeHtml(String(event.status || '').replaceAll('_',' '))}">${escapeHtml(event.title || event.channel)}</button>`).join('');
      const todayStyle = key === todayKey ? 'display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#0b8474;color:white;' : '';
      cells.push(`<div role="gridcell" tabindex="0" data-calendar-date="${key}" aria-label="${escapeHtml(date.toDateString())}" style="min-height:72px;padding:5px;border:1px solid #d7e5df;border-radius:6px;cursor:pointer;${muted}"><strong style="${todayStyle}">${date.getDate()}</strong>${details}</div>`);
    }
    grid.innerHTML = cells.join('');
    grid.querySelectorAll('[data-calendar-date]').forEach(cell => {
      const select = () => { calendarSelectedDate = cell.dataset.calendarDate; calendarSelectedEventId = ''; renderCalendarEditor(); };
      cell.addEventListener('click', event => { if (!event.target.closest('[data-calendar-event]')) select(); });
      cell.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
    });
    grid.querySelectorAll('[data-calendar-event]').forEach(button => button.addEventListener('click', () => { calendarSelectedEventId = button.dataset.calendarEvent; const event = events.find(item => item.event_id === calendarSelectedEventId); calendarSelectedDate = event ? dateInputValue(event.scheduled_for) : ''; renderCalendarEditor(); }));
    const now = new Date(); now.setHours(0,0,0,0); const tomorrow = new Date(now); tomorrow.setDate(now.getDate()+1);
    const active = events.filter(event => event.status !== 'cancelled');
    const completed = active.filter(event => ['published','completed'].includes(event.status)).length;
    const past = active.filter(event => new Date(event.scheduled_for) < now).length;
    const todayCount = active.filter(event => { const date = new Date(event.scheduled_for); return date >= now && date < tomorrow; }).length;
    const upcoming = active.filter(event => new Date(event.scheduled_for) >= tomorrow && !['published','completed'].includes(event.status)).length;
    $('m360-calendar-summary').textContent = `${active.length} campaigns · ${completed} completed · ${past} past dates · ${todayCount} today · ${upcoming} upcoming`;
    renderCalendarEditor();
  }

  function dateInputValue(value) {
    const date = new Date(value); if (Number.isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
  }

  function renderCalendarEditor() {
    const events = Array.isArray(activeTask?.calendar_events) ? activeTask.calendar_events : [];
    const selected = events.find(event => event.event_id === calendarSelectedEventId);
    if (!calendarSelectedDate) calendarSelectedDate = selected ? dateInputValue(selected.scheduled_for) : dateInputValue(new Date());
    $('m360-calendar-editor-title').textContent = selected ? 'Update campaign' : `Add campaign on ${calendarSelectedDate}`;
    $('m360-calendar-title').value = selected?.title || '';
    $('m360-calendar-channel').value = selected?.channel || activeChannel;
    $('m360-calendar-date').value = selected ? dateInputValue(selected.scheduled_for) : calendarSelectedDate;
    $('m360-calendar-status').value = selected?.status || 'pending_approval';
    $('m360-calendar-save').textContent = selected ? 'Update campaign' : 'Add campaign';
    $('m360-calendar-remove').hidden = !selected;
    const dayEvents = events.filter(event => dateInputValue(event.scheduled_for) === calendarSelectedDate);
    $('m360-calendar-day-events').textContent = dayEvents.length ? dayEvents.map(event => `${event.title} · ${event.channel} · ${event.status.replaceAll('_',' ')}`).join(' | ') : 'No campaigns on this date.';
  }

  async function saveCalendarEvent(event) {
    event.preventDefault(); if (!activeTask) return notify('Start or open an Outreach campaign first.', 'error');
    const selected = activeTask.calendar_events?.find(item => item.event_id === calendarSelectedEventId);
    const method = selected ? 'PATCH' : 'POST';
    const date = $('m360-calendar-date').value;
    try {
      await api('/api/marketing/calendar', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace_id: ws(), correlation_id: activeTask.correlation_id, event_id: selected?.event_id, title: $('m360-calendar-title').value, channel: $('m360-calendar-channel').value, scheduled_for: new Date(date + 'T09:00:00').toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata', status: $('m360-calendar-status').value }) });
      calendarSelectedEventId = ''; calendarSelectedDate = date; await loadTask(activeTask.correlation_id); notify(selected ? 'Campaign updated.' : 'Campaign added.', 'success');
    } catch (error) { notify(error.message, 'error'); }
  }

  async function removeCalendarEvent() {
    if (!activeTask || !calendarSelectedEventId) return;
    try {
      await api('/api/marketing/calendar', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace_id: ws(), correlation_id: activeTask.correlation_id, event_id: calendarSelectedEventId }) });
      calendarSelectedEventId = ''; await loadTask(activeTask.correlation_id); notify('Campaign removed from the calendar.', 'success');
    } catch (error) { notify(error.message, 'error'); }
  }

  function renderJourneyRules() {
    const host = $('m360-journey-list'); if (!host) return;
    host.replaceChildren();
    for (const rule of activeTask?.journey_rules || []) {
      const row = document.createElement('div'); row.style.cssText = 'padding:7px;border:1px solid #d7e5df;border-radius:6px;';
      const label = document.createElement('span'); label.textContent = `${rule.name} · ${rule.trigger_event.replaceAll('_',' ')} → ${rule.action.replaceAll('_',' ')} · ${rule.status}`;
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove'; remove.style.marginLeft = '8px';
      remove.addEventListener('click', async () => { await api('/api/marketing/journeys', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace_id: ws(), correlation_id: activeTask.correlation_id, rule_id: rule.rule_id }) }); await loadTask(activeTask.correlation_id); });
      row.append(label, remove); host.append(row);
    }
    if (!host.childElementCount) host.textContent = 'No journey rules yet.';
  }

  async function saveJourneyRule(event) {
    event.preventDefault(); if (!activeTask) return notify('Open a campaign first.', 'error');
    try {
      await api('/api/marketing/journeys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace_id: ws(), correlation_id: activeTask.correlation_id, name: $('m360-journey-name').value, trigger_event: $('m360-journey-trigger').value, action: $('m360-journey-action').value, delay_hours: Number($('m360-journey-delay').value), max_executions: 1, stop_on_reply: true, status: 'draft' }) });
      $('m360-journey-name').value = ''; await loadTask(activeTask.correlation_id); notify('Journey rule saved as a non-executing draft.', 'success');
    } catch (error) { notify(error.message, 'error'); }
  }

  function renderChannelTabs() {
    const tabsContainer = $('m360-channel-tabs');
    if (!tabsContainer || !activeTask?.channel_draft_versions) return;

    const channels=CHANNELS.filter(channel=>activeTask.channel_draft_versions[channel]?.versions?.length);
    $('m360-channels-section').hidden=!channels.length;
    if(!channels.includes(activeChannel))activeChannel=channels[0]||'Email';
    tabsContainer.innerHTML = channels.map(ch => {
      const entry = activeTask.channel_draft_versions[ch];
      const isApproved = entry?.versions[entry.versions.length - 1]?.status === 'approved';
      const vNum = entry?.current_version || 1;
      const isActive = ch === activeChannel;

      return `
        <button type="button" class="m360-tab-pill ${isActive ? 'active' : ''}" data-channel="${ch}" aria-pressed="${isActive}">
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
        tabsContainer.querySelector('[aria-pressed="true"]')?.focus();
      });
    });
  }

  function renderActiveChannel() {
    if (!activeTask || !activeTask.channel_draft_versions) return;

    renderLeadsTable();renderTestReadiness();
    $('m360-active-channel-label').textContent = activeChannel + ' draft';
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
    syncOutreachSteps();
    const controlledEmailTest = ws() === 'showcase' && activeChannel === 'Email';

    $('m360-gate-container').innerHTML = `
      <div class="m360-gate-item">
        <h4>1. Message approval</h4>
        <div class="m360-gate-val ${g1.status === 'approved' ? 'm360-gate-pass' : 'm360-gate-warn'}">
          ${g1.status === 'approved' ? 'Approved for Release' : 'Draft for Review'}
        </div>
      </div>
      <div class="m360-gate-item">
        <h4>2. Recipient permission</h4>
        <div class="m360-gate-val ${controlledEmailTest || g2.eligible_count > 0 ? 'm360-gate-pass' : 'm360-gate-fail'}">
          ${controlledEmailTest ? 'Your entered test email is used only for this one send' : `${g2.eligible_count ?? 0} opted-in contacts ready`}
        </div>
        ${!controlledEmailTest && g2.eligible_count <= 0 ? '<button type="button" class="m360-gate-leads-btn" style="margin-top:6px;padding:3px 8px;font-size:11px;font-weight:600;background:#155b49;color:#fff;border:none;border-radius:4px;cursor:pointer;">Open Leads &amp; consent details &rarr;</button>' : ''}
      </div>
      <div class="m360-gate-item">
        <h4>3. Sending connection</h4>
        <div class="m360-gate-val ${['connected','verified_connected'].includes(g3.status) ? 'm360-gate-pass' : 'm360-gate-warn'}">
          ${['connected','verified_connected'].includes(g3.status) ? 'Provider Verified' : 'Disconnected (Connection Required)'}
        </div>
      </div>
    `;

    $('btn-approve-channel').disabled=!curVer||curVer.status==='approved';
    $('btn-apply-revision').disabled=!curVer;
    $('m360-edit-draft').disabled=!curVer;
    const launchBtn = $('btn-launch-channel');
    if (launchBtn) {
      launchBtn.style.display = curVer && !controlledEmailTest ? 'inline-block' : 'none';
      launchBtn.disabled=!(g1.passed&&g2.passed&&g2.eligible_count>0&&(activeChannel==='Email'||g3.passed));
      if(!liveSendingEnabled){
        launchBtn.disabled=true;launchBtn.textContent='Sending disabled';
        launchBtn.title='You can prepare and review drafts. Sending is currently disabled.';
      }else if(activeChannel!=='Email'){
        launchBtn.disabled=true;launchBtn.textContent='Draft only';
        launchBtn.title='Live delivery is currently available through the approved Email provider path.';
      }else if (['connected','verified_connected'].includes(g3.status)) {
        launchBtn.textContent = 'Launch to ' + activeChannel;
        launchBtn.title = launchBtn.disabled?'Approval and recipient permission are required.':'Review the audience before dispatch.';
      } else {
        launchBtn.textContent = 'Launch (Connection Required)';
        launchBtn.title = 'Provider disconnected. Click for required configuration details.';
      }
    }

    const testPreviewBtn = $('btn-test-preview');
    if (testPreviewBtn) {
      testPreviewBtn.style.display = curVer && (activeChannel === 'WhatsApp' || activeChannel === 'Email') ? 'inline-block' : 'none';
      testPreviewBtn.textContent = activeChannel === 'WhatsApp' ? 'Preview WhatsApp message' : 'Preview email without sending';
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
      const bridge = activeTask.email_to_ctwa_bridge;
      $('m360-ctwa-summary').textContent = bridge?.target_contacts_count
        ? `${bridge.target_contacts_count} email-consented contact(s) lack verified WhatsApp opt-in. This is an invitation draft only.`
        : 'No verified email-consented contacts currently qualify for a WhatsApp opt-in invitation.';
    } else if (activeChannel === 'Email') {
      viewContainer.innerHTML = `
        <div class="m360-email-mockup">
          <div class="m360-email-field"><strong>Subject:</strong> ${escapeHtml(curVer?.subject || 'Draft subject not supplied')}</div>
          ${curVer?.preview_text?`<div class="m360-email-field"><strong>Preview text:</strong> ${escapeHtml(curVer.preview_text)}</div>`:'' }
          <div class="m360-email-field"><strong>From:</strong> Verified tenant sender required</div>
          <div class="m360-email-field"><strong>Deliverability:</strong> Not verified; provider connection and domain checks required</div>
          <div class="m360-email-body">${textBody.split(/\r?\n\r?\n/).map(part=>'<p>'+escapeHtml(part)+'</p>').join('')}</div>
          <div style="font-size:11px; color:#888; border-top:1px solid #eee; padding-top:8px;">
            Consent wording and unsubscribe controls must be supplied by the verified provider workflow before sending.
          </div>
        </div>
      `;
      if(curVer?.email_creative){
        const creative=curVer.email_creative,preview=document.createElement('img'),taskId=activeTask.correlation_id;
        preview.alt='Saved campaign creative included in this Email';preview.style.cssText='max-width:100%;height:auto';
        const body=viewContainer.querySelector('.m360-email-body');
        body.insertBefore(preview,body.children[2]||null);
        api('/api/poster-history?'+new URLSearchParams({workspace_id:ws(),action:'source',poster_id:creative.poster_id,version:creative.version,view:'final'})).then(data=>{if(activeTask?.correlation_id===taskId&&activeChannel==='Email')preview.src=data.source_url;}).catch(()=>{preview.replaceWith(document.createTextNode('Saved image preview unavailable. Reload before approval.'));});
      }
      $('m360-ctwa-card').style.display = 'none';
      if(curVer?.email_creative){const note=document.createElement('p');note.textContent='Attached saved design · version '+curVer.email_creative.version;viewContainer.append(note);}
      if(curVer?.website_url){
        const link=document.createElement('a');link.href=curVer.website_url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Visit the product website';
        viewContainer.querySelector('.m360-email-body').append(link);
      }
      if(curVer&&!curVer.email_creative){
        const artworkLabel=document.createElement('label');artworkLabel.textContent='Editable email artwork brief';
        const artworkBrief=document.createElement('textarea');artworkBrief.rows=4;artworkBrief.maxLength=2300;
        artworkBrief.value=activeTask.local_artwork_brief||activeTask.creative_briefs?.find(item=>item.channel==='Email'&&item.format==='image')?.prompt||('Create one branded campaign poster for this email brief. Use only approved company facts. '+activeTask.prompt).slice(0,2300);
        artworkBrief.addEventListener('input',()=>{activeTask.local_artwork_brief=artworkBrief.value;});artworkLabel.append(artworkBrief);
        const poster=document.createElement('button');
        poster.type='button';poster.textContent='Generate and attach poster (1 image)';
        const note=document.createElement('p');note.setAttribute('role','status');
        poster.addEventListener('click',async()=>{
          if(poster.disabled)return;
          const workspaceId=ws(),taskId=activeTask.correlation_id,brief=artworkBrief.value.trim();
          if(brief.length<12){note.textContent='Review an artwork brief of at least 12 characters.';return;}
          if(!window.M360ContentAgent){note.textContent='Image generation is unavailable.';return;}
          poster.disabled=true;note.textContent='Creating and saving the email poster…';
          try{
            const creative=await window.M360ContentAgent.create({workspace_id:workspaceId,channel:'Email',prompt:brief});
            if(workspaceId!==ws()||taskId!==activeTask?.correlation_id)throw Error('Campaign changed. The poster is saved in Content Creation.');
            await api('/api/marketing/coordination',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspace_id:workspaceId,correlation_id:taskId,operation:'content',poster_id:creative.poster_id,poster_version:creative.version,email_poster_only:true})});
            await loadTask(taskId);
          }catch(error){note.textContent=error.message;poster.disabled=false;}
        });
        viewContainer.append(artworkLabel,poster,note);
      }
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

  async function recalcBudget(budgetInr, durationDays) {
    try {
      const data = await api('/api/marketing/estimate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace_id: ws(), budget: budgetInr, duration_days: durationDays, profile_type: activeTask?.profile_type, available_sample: activeTask?.audience_snapshot?.total_count || 0 }) });
      const scenarios = data.estimate.scenarios, rows = [['Conservative', scenarios.conservative_low], ['Expected', scenarios.expected_median], ['Optimistic', scenarios.optimistic_high]];
      $('m360-budget-scenarios-card').innerHTML = `<table class="m360-table"><thead><tr><th>Scenario</th><th>Estimated leads</th><th>Estimated CPL</th></tr></thead><tbody>${rows.map(([label, row]) => `<tr><td>${label}</td><td>${row.estimated_leads}</td><td>INR ${Number(row.estimated_cpl_inr).toLocaleString('en-IN')}</td></tr>`).join('')}</tbody></table><small>${data.estimate.badge} · ${escapeHtml(data.estimate.stated_assumptions[0])}</small>`;
      const ab = data.ab_test;
      $('m360-ab-test-content').innerHTML = `<div><strong>Baseline:</strong> ${escapeHtml(ab.baseline_conversion)}</div><div><strong>MDE:</strong> ${escapeHtml(ab.minimum_detectable_lift)}</div><div><strong>Required per arm:</strong> ${Number(ab.sample_size_per_variant).toLocaleString()}</div><div><strong>Total required:</strong> ${Number(ab.total_required_sample_size).toLocaleString()}</div><div><strong>Available reach:</strong> ${Number(ab.available_sample).toLocaleString()}</div><div style="margin-top:6px;font-weight:700;color:${ab.feasible_with_current_reach ? '#166534' : '#991b1b'};">${escapeHtml(ab.feasibility_status.replaceAll('_', ' '))}</div>`;
    } catch (error) {
      if ($('m360-budget-scenarios-card')) $('m360-budget-scenarios-card').textContent = error.message;
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
