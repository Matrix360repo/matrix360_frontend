/**
 * Matrix 360 — Non-Destructive Multi-Page Architecture & Overview Dashboard Hub
 * Isolates post-login sections into dedicated pages:
 *   1. dashboard (Overview Dashboard + OpenAI Configuration Hub + Navigation Cards)
 *   2. leads     (My Leads & Sales Pipeline + Google Maps Lead Scraper V4)
 *   3. profile   (Persistent business profile, research and private brand assets)
 *   4. content   (Focused message and post creation studio)
 *   5. marketing (Marketing & Outreach Tools + How It Works / Growth Brief)
 *
 * Strictly preserves 100% of existing DOM IDs, event listeners, and runtime state.
 */
(function initMatrix360MultiPageArchitecture() {
  if (window.__M360_MULTIPAGE_ROUTER_ACTIVE__) return;
  window.__M360_MULTIPAGE_ROUTER_ACTIVE__ = true;

  const PAGE_CONFIG = {
    dashboard: {
      key: 'dashboard',
      title: 'Control Center',
      subtitle: 'Plan your next task, review recommendations and open specialist workspaces.',
      badge: 'Command Center',
      icon: '⊞',
      hashes: ['#overview', '#start-here', '#top', '']
    },
    leads: {
      key: 'leads',
      title: 'Leads & Pipeline',
      subtitle: 'Manage your CRM sales pipeline, add enquiries, and find relevant business contacts.',
      badge: 'CRM & Discovery',
      icon: '◎',
      hashes: ['#leads', '#pipeline', '#m360-maps-scraper-panel']
    },
    profile: {
      key: 'profile',
      title: 'Company Details',
      subtitle: 'Review saved company facts, research context, logos, and brand references.',
      badge: 'Company Record',
      icon: '◆',
      hashes: ['#m360-brand-profile', '#business-profile', '#brand-profile', '#brand']
    },
    content: {
      key: 'content',
      title: 'Content Creation Studio',
      subtitle: 'Create channel messages, social posts, captions, hashtags, hooks, and editable post graphics.',
      badge: 'Creative & Brand',
      icon: '✦',
      hashes: ['#m360-ai-post-studio', '#creative-studio', '#creative', '#ai-post', '#creative-library', '#m360-storyboard', '#m360-live-motion', '#m360-media-panel', '#m360-reel-tools', '#m360-content-library', '#m360-saved-designs']
    },
    research: {key:'research', title:'Market Research', subtitle:'Evidence, audience filters, creative direction and hypothetical economics.', badge:'Research & Planning', icon:'◈', hashes:['#market-research','#m360-research-report','#m360-research-planning']},
    marketing: {
      key: 'marketing',
      title: 'Outreach',
      subtitle: 'Prepare outreach campaigns, channel messages, approvals, and connection checks.',
      badge: 'Campaigns & Outreach',
      icon: '↗',
      hashes: ['#marketing', '#marketing-tools', '#how-it-works', '#growth-brief', '#m360-conversation-title', '#m360-channels-section', '#m360-outreach-test', '#m360-outreach-results']
    }
  };

  const HASH_TO_PAGE = {};
  Object.values(PAGE_CONFIG).forEach((cfg) => {
    cfg.hashes.forEach((h) => {
      if (h) HASH_TO_PAGE[h.toLowerCase()] = cfg.key;
    });
  });

  function injectMultiPageStyles() {
    if (document.getElementById('m360-multipage-styles')) return;
    const style = document.createElement('style');
    style.id = 'm360-multipage-styles';
    style.textContent = `
      /* Hide sections belonging to inactive pages without unmounting DOM nodes */
      .m360-mp-hidden-section {
        display: none !important;
      }

      /* Retired from the focused Content Studio. Existing code stays mounted for safe rollback. */
      #m360-live-motion, #m360-content-library { display: none !important; }

      /* Page View Header Bar */
      #m360-mp-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 14px;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        padding: 16px 22px;
        margin-bottom: 24px;
        box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
      }
      .m360-mp-topbar-left {
        display: flex;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
      }
      .m360-mp-back-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: #f8fafc;
        color: #0f172a;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        padding: 8px 13px;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .m360-mp-back-btn:hover {
        background: #e6f4ef;
        color: #0f766e;
        border-color: #99f6e4;
      }
      .m360-mp-page-badge {
        background: #e6f4ef;
        color: #0f766e;
        font-size: 0.72rem;
        font-weight: 700;
        padding: 3px 10px;
        border-radius: 999px;
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }
      .m360-mp-page-title {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 700;
        color: #0f172a;
      }
      .m360-mp-page-subtitle {
        margin: 2px 0 0;
        font-size: 0.84rem;
        color: #64748b;
      }
      .m360-mp-quick-pills {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .m360-mp-pill {
        background: #f8fafc;
        color: #475569;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 8px 14px;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .m360-mp-pill:hover {
        background: #f1f5f9;
        color: #0f172a;
      }
      .m360-mp-pill.is-active {
        background: #0f766e;
        color: #ffffff;
        border-color: #0f766e;
      }

      /* Overview Dashboard Hub Container */
      #m360-mp-dashboard-hub {
        display: flex;
        flex-direction: column;
        gap: 24px;
        margin-bottom: 28px;
      }

      /* OpenAI Assistant & API Key Hub Card */
      .m360-ai-hub-card {
        background: linear-gradient(135deg, #0f2926 0%, #0f4c45 100%);
        color: #ffffff;
        border-radius: 16px;
        padding: 24px 28px;
        box-shadow: 0 10px 28px -6px rgba(15, 76, 69, 0.25);
        border: 1px solid rgba(153, 246, 228, 0.2);
      }
      .m360-ai-hub-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 14px;
        margin-bottom: 18px;
      }
      .m360-ai-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(255, 255, 255, 0.12);
        color: #99f6e4;
        font-size: 0.75rem;
        font-weight: 700;
        padding: 5px 12px;
        border-radius: 999px;
        border: 1px solid rgba(153, 246, 228, 0.3);
      }
      .m360-ai-config-grid {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 12px;
        margin-bottom: 14px;
      }
      @media (max-width: 768px) {
        .m360-ai-config-grid {
          grid-template-columns: 1fr;
        }
      }
      .m360-ai-prompt-input {
        width: 100%;
        box-sizing: border-box;
        padding: 12px 16px;
        border-radius: 11px;
        border: 1px solid rgba(255, 255, 255, 0.22);
        background: rgba(15, 23, 42, 0.45);
        color: #ffffff;
        font-size: 0.9rem;
      }
      .m360-ai-prompt-input::placeholder {
        color: rgba(255, 255, 255, 0.6);
      }
      .m360-ai-key-drawer {
        background: rgba(15, 23, 42, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 12px;
        padding: 14px 16px;
        margin-top: 12px;
      }

      /* Navigation Launch Cards Grid */
      .m360-nav-cards-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 20px;
      }
      .m360-nav-card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        padding: 24px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 16px;
        box-shadow: 0 4px 16px -2px rgba(15, 23, 42, 0.05);
        transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
        cursor: pointer;
      }
      .m360-nav-card:hover {
        transform: translateY(-3px);
        box-shadow: 0 12px 24px -4px rgba(15, 118, 110, 0.12);
        border-color: #99f6e4;
      }
      .m360-nav-card-icon {
        width: 42px;
        height: 42px;
        border-radius: 11px;
        background: #e6f4ef;
        color: #0f766e;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        font-weight: 700;
      }
      .m360-nav-card-cta {
        display: inline-flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        box-sizing: border-box;
        padding: 10px 14px;
        background: #f8fafc;
        color: #0f766e;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        font-size: 0.84rem;
        font-weight: 700;
        transition: background 0.15s ease, color 0.15s ease;
      }
      .m360-nav-card:hover .m360-nav-card-cta {
        background: #0f766e;
        color: #ffffff;
        border-color: #0f766e;
      }

      /* Left Sidebar Multi-Page Navigation Links */
      .m360-sidebar-mp-group {
        margin-bottom: 14px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.2);
      }
      .m360-sidebar-mp-label {
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #64748b;
        padding: 0 12px;
        margin-bottom: 8px;
      }
      .m360-sidebar-mp-link {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        margin-bottom: 4px;
        border-radius: 10px;
        font-size: 0.88rem;
        font-weight: 600;
        color: #334155;
        text-decoration: none;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .m360-sidebar-mp-link:hover {
        background: #f1f5f9;
        color: #0f172a;
      }
      .m360-sidebar-mp-link.is-active {
        background: #e6f4ef !important;
        color: #0f766e !important;
        font-weight: 700 !important;
        box-shadow: inset 3px 0 0 #0f766e;
      }

      /* ── Matrix360 AI Control Center ─────────────────────── */
      #m360-mp-dashboard-hub {
        width: 100%;
        box-sizing: border-box;
      }
      .m360cc-wrap {
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        border: 1px solid #334155;
        border-radius: 16px;
        padding: 28px 32px 24px;
        margin: 0 0 24px 0;
        min-height: 56vh;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        display: flex;
        flex-direction: column;
        gap: 20px;
        box-sizing: border-box;
      }
      .m360cc-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        flex-wrap: wrap;
      }
      .m360cc-header-left { flex: 1; min-width: 260px; }
      .m360cc-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(16,185,129,0.15);
        border: 1px solid rgba(16,185,129,0.3);
        color: #10b981;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding: 4px 10px;
        border-radius: 20px;
        margin-bottom: 10px;
      }
      .m360cc-badge-dot {
        width: 6px;
        height: 6px;
        background: #10b981;
        border-radius: 50%;
        animation: m360cc-pulse 2s infinite;
      }
      @keyframes m360cc-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
      .m360cc-title {
        color: #f1f5f9;
        font-size: 22px;
        font-weight: 700;
        margin: 0 0 6px 0;
        line-height: 1.3;
      }
      .m360cc-subtitle {
        color: #94a3b8;
        font-size: 15px;
        font-weight: 500;
        margin: 0 0 8px 0;
      }
      .m360cc-desc {
        color: #64748b;
        font-size: 13px;
        line-height: 1.6;
        margin: 0;
      }
      .m360cc-engines {
        display: flex;
        flex-direction: column;
        gap: 6px;
        align-items: flex-end;
        padding-top: 4px;
      }
      .m360cc-engine-pill {
        background: rgba(99,102,241,0.12);
        border: 1px solid rgba(99,102,241,0.25);
        color: #a5b4fc;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 12px;
        border-radius: 20px;
        white-space: nowrap;
      }
      .m360cc-input-area {
        display: flex;
        gap: 12px;
        align-items: flex-end;
      }
      .m360cc-textarea {
        flex: 1;
        background: rgba(30,41,59,0.8);
        border: 1.5px solid #334155;
        border-radius: 10px;
        color: #f1f5f9;
        font-size: 14px;
        line-height: 1.6;
        padding: 12px 16px;
        resize: vertical;
        min-height: 56px;
        outline: none;
        transition: border-color 0.2s;
        font-family: inherit;
      }
      .m360cc-textarea:focus { border-color: #10b981; }
      .m360cc-textarea::placeholder { color: #475569; }
      .m360cc-btn-primary {
        background: linear-gradient(135deg, #10b981, #0891b2);
        color: #fff;
        border: none;
        border-radius: 10px;
        padding: 12px 22px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        transition: opacity 0.2s, transform 0.1s;
        letter-spacing: 0.02em;
      }
      .m360cc-btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
      .m360cc-btn-primary:active { transform: translateY(0); }
      .m360cc-btn-secondary {
        background: rgba(51,65,85,0.6);
        color: #94a3b8;
        border: 1px solid #334155;
        border-radius: 10px;
        padding: 10px 18px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s;
      }
      .m360cc-btn-secondary:hover { background: rgba(71,85,105,0.8); }
      .m360cc-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .m360cc-chip {
        background: rgba(30,41,59,0.6);
        border: 1px solid #334155;
        color: #94a3b8;
        font-size: 12px;
        padding: 5px 12px;
        border-radius: 16px;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s, color 0.15s;
      }
      .m360cc-chip:hover {
        background: rgba(16,185,129,0.1);
        border-color: rgba(16,185,129,0.3);
        color: #10b981;
      }
      .m360cc-privacy {
        color: #475569;
        font-size: 11px;
        text-align: center;
        padding-top: 4px;
      }
      /* ── Result Panel ── */
      .m360cc-result { width: 100%; }
      .m360cc-hidden { display: none !important; }
      .m360cc-section {
        background: rgba(15,23,42,0.7);
        border: 1px solid #1e293b;
        border-radius: 12px;
        padding: 24px;
        margin-bottom: 8px;
      }
      /* Analysing */
      .m360cc-analysing {
        display: flex;
        align-items: center;
        gap: 16px;
        border-color: rgba(16,185,129,0.2);
      }
      .m360cc-spinner {
        width: 28px;
        height: 28px;
        border: 3px solid #1e293b;
        border-top-color: #10b981;
        border-radius: 50%;
        animation: m360cc-spin 0.8s linear infinite;
        flex-shrink: 0;
      }
      @keyframes m360cc-spin { to { transform: rotate(360deg); } }
      .m360cc-analysing-msg { color: #94a3b8; font-size: 14px; }
      /* Category Badge */
      .m360cc-cat-badge {
        display: inline-block;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        padding: 3px 10px;
        border-radius: 12px;
        margin-bottom: 14px;
        background: rgba(99,102,241,0.15);
        color: #a5b4fc;
        border: 1px solid rgba(99,102,241,0.25);
      }
      .m360cc-cat-badge.m360cc-cat-lead_pipeline { background: rgba(16,185,129,0.12); color: #34d399; border-color: rgba(16,185,129,0.25); }
      .m360cc-cat-badge.m360cc-cat-content_creation { background: rgba(245,158,11,0.12); color: #fbbf24; border-color: rgba(245,158,11,0.25); }
      .m360cc-cat-badge.m360cc-cat-marketing_activation { background: rgba(239,68,68,0.12); color: #f87171; border-color: rgba(239,68,68,0.25); }
      .m360cc-cat-badge.m360cc-cat-multi_engine { background: rgba(168,85,247,0.12); color: #c084fc; border-color: rgba(168,85,247,0.25); }
      .m360cc-cat-badge.m360cc-cat-business_strategy { background: rgba(14,165,233,0.12); color: #38bdf8; border-color: rgba(14,165,233,0.25); }
      /* Answer */
      .m360cc-answer { color: #cbd5e1; font-size: 15px; line-height: 1.7; margin-bottom: 16px; }
      /* Insight */
      .m360cc-insight {
        background: rgba(245,158,11,0.08);
        border-left: 3px solid #f59e0b;
        padding: 12px 16px;
        border-radius: 0 8px 8px 0;
        margin-bottom: 16px;
        color: #fbbf24;
        font-size: 13px;
        line-height: 1.6;
      }
      .m360cc-insight-icon { margin-right: 8px; }
      /* Subsections */
      .m360cc-subsection { margin-top: 16px; }
      .m360cc-subsection-title { color: #64748b; font-size: 11px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; margin-bottom: 10px; }
      /* Options Grid */
      .m360cc-options-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
      .m360cc-option-card { background: rgba(30,41,59,0.5); border: 1px solid #1e293b; border-radius: 8px; padding: 12px; }
      .m360cc-option-name { color: #94a3b8; font-weight: 600; font-size: 13px; margin-bottom: 6px; }
      .m360cc-option-benefit { color: #34d399; font-size: 12px; margin-bottom: 4px; }
      .m360cc-option-risk { color: #fbbf24; font-size: 12px; }
      /* Recommended Direction */
      .m360cc-rec { background: rgba(16,185,129,0.07); border: 1px solid rgba(16,185,129,0.15); border-radius: 8px; padding: 14px 16px; margin: 16px 0 0; }
      .m360cc-rec-label { font-size: 11px; font-weight: 700; color: #10b981; text-transform: uppercase; letter-spacing: 0.07em; display: block; margin-bottom: 6px; }
      .m360cc-rec p { margin: 0; color: #cbd5e1; font-size: 14px; line-height: 1.6; }
      /* List */
      .m360cc-list { margin: 0; padding-left: 18px; }
      .m360cc-list li { color: #94a3b8; font-size: 13px; line-height: 1.8; }
      /* Engine Recommendation Block */
      .m360cc-eng-rec { background: rgba(99,102,241,0.07); border: 1px solid rgba(99,102,241,0.15); border-radius: 10px; padding: 16px; margin-bottom: 16px; }
      .m360cc-eng-rec-title { font-size: 11px; font-weight: 700; color: #6366f1; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 6px; }
      .m360cc-eng-rec-name { color: #f1f5f9; font-size: 16px; font-weight: 700; margin-bottom: 8px; }
      .m360cc-eng-rec-reason { color: #94a3b8; font-size: 13px; line-height: 1.6; margin-bottom: 6px; }
      .m360cc-eng-rec-output { color: #64748b; font-size: 12px; }
      /* Workflow chain */
      .m360cc-workflow { margin-bottom: 16px; }
      .m360cc-workflow-title { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 8px; }
      .m360cc-workflow-chain { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
      .m360cc-wf-step { background: rgba(168,85,247,0.12); border: 1px solid rgba(168,85,247,0.2); color: #c084fc; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 16px; }
      .m360cc-wf-arrow { color: #475569; font-size: 14px; }
      /* Envelope */
      .m360cc-envelope { margin-bottom: 16px; }
      .m360cc-envelope-summary { color: #64748b; font-size: 12px; cursor: pointer; padding: 6px 0; }
      .m360cc-envelope-json { background: rgba(0,0,0,0.4); border: 1px solid #1e293b; border-radius: 8px; padding: 12px; color: #64748b; font-size: 11px; font-family: monospace; overflow-x: auto; white-space: pre-wrap; word-break: break-all; max-height: 260px; overflow-y: auto; }
      /* Actions */
      .m360cc-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
      /* Blocked */
      .m360cc-blocked { text-align: center; padding: 32px; }
      .m360cc-blocked-icon { font-size: 36px; margin-bottom: 12px; }
      .m360cc-blocked-title { color: #f87171; font-size: 16px; font-weight: 700; margin-bottom: 8px; }
      .m360cc-blocked-msg { color: #94a3b8; font-size: 13px; margin-bottom: 16px; line-height: 1.6; }
      .m360cc-retry-btn { margin-top: 8px; }
      /* Engine Cards */
      .m360cc-engine-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
        margin-top: 8px;
      }
      .m360cc-engine-card {
        position: relative;
        background: #0d1a24;
        border: 1px solid #213442;
        border-radius: 14px;
        padding: 22px 22px 20px;
        cursor: pointer;
        transition: border-color .18s, background .18s, transform .18s;
      }
      .m360cc-engine-card:hover {
        border-color: #3c6f70;
        background: #10212b;
        transform: translateY(-1px);
      }
      .m360cc-engine-card-icon { color:#67d9c9; font-size:11px; font-weight:800; letter-spacing:.14em; margin-bottom:24px; }
      .m360cc-engine-card-title { color: #f1f7f6; font-size: 15px; font-weight: 700; margin-bottom: 8px; letter-spacing:-.01em; }
      .m360cc-engine-card-desc { color: #8aa0aa; font-size: 12.5px; line-height: 1.55; margin-bottom: 22px; max-width:42ch; }
      .m360cc-engine-card-cta { color: #73dfcf; font-size: 12px; font-weight: 700; }
      /* Responsive */
      @media (max-width: 768px) {
        .m360cc-wrap { padding: 20px 16px 18px; min-height: auto; }
        .m360cc-header { flex-direction: column; }
        .m360cc-engines { flex-direction: row; flex-wrap: wrap; align-items: flex-start; }
        .m360cc-input-area { flex-direction: column; }
        .m360cc-title { font-size: 18px; }
      }
      body.m360-matched-crm {
        background:
          radial-gradient(circle at 78% 5%, rgba(31, 181, 163, .13), transparent 27%),
          radial-gradient(circle at 24% 42%, rgba(44, 108, 139, .10), transparent 32%),
          #f4f7f6;
      }
      #m360-mp-topbar {
        border: 1px solid rgba(38, 105, 91, .18);
        border-radius: 16px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, .12);
        backdrop-filter: blur(18px);
      }
      .m360-mp-title-row { display:flex; align-items:baseline; gap:10px; }
      .m360-mp-pill { border-radius: 9px; transition: background .18s ease, color .18s ease, border-color .18s ease; }
      .m360-mp-pill:hover { transform:none; box-shadow:none; }
      .m360-mp-pill.is-active { box-shadow:none; }
      #primary-content > .card, #verified > .card, #verified > section {
        border-radius: 20px;
        box-shadow: 0 12px 34px rgba(19, 59, 53, .07);
      }
      /* ── End AI Control Center ────────────────────────────── */
`;
    document.head.appendChild(style);
  }

  function classifySectionToPage(el) {
    if (!el || el.id === 'm360-mp-topbar' || el.id === 'm360-mp-dashboard-hub') {
      return null;
    }

    const id = (el.id || '').toLowerCase();
    const text = (el.textContent || '').slice(0, 600).toLowerCase();
    const headingEl = el.querySelector('h1, h2, h3');
    const heading = headingEl ? headingEl.textContent.toLowerCase() : '';

    if(id==='m360-market-research')return 'research';
    // 1. Explicit ID matching
    if (['home', 'journey', 'quick-start', 'services'].includes(id)) {
      return 'dashboard';
    }
    if (id === 'm360-brand-profile' || id.includes('business-profile')) {
      return 'profile';
    }
    if (id.includes('lead') || id.includes('pipeline') || id.includes('scraper')) {
      return 'leads';
    }
    if (
      id.includes('creative') ||
      id.includes('brand') ||
      id.includes('reel') ||
      id.includes('poster') ||
      id.includes('post') ||
      id.includes('studio')
    ) {
      return 'content';
    }
    if (
      id.includes('marketing') ||
      id.includes('how-it-works') ||
      id.includes('how_it_works') ||
      id.includes('growth') ||
      id.includes('outreach') ||
      id.includes('campaign')
    ) {
      return 'marketing';
    }
    if (id.includes('overview') || id.includes('start-here') || id.includes('start_here') || id.includes('hero')) {
      return 'dashboard';
    }

    // 2. Child ID inspection
    if (el.querySelector('#lead-list, #add-form, #m360-maps-scraper-panel, #pipeline-title')) {
      return 'leads';
    }
    if (
      el.querySelector(
        '[id*="creative"], [id*="poster"], [id*="reel"], [data-creative]'
      )
    ) {
      return 'content';
    }

    // 3. Heading semantic matching
    if (heading.includes('lead') || heading.includes('pipeline')) {
      return 'leads';
    }
    if (
      heading.includes('creative') ||
      heading.includes('brand') ||
      heading.includes('content') ||
      heading.includes('studio') ||
      heading.includes('reel') ||
      heading.includes('post')
    ) {
      return 'content';
    }
    if (
      heading.includes('marketing') ||
      heading.includes('how it works') ||
      heading.includes('more ways we can help') ||
      heading.includes('campaign') ||
      heading.includes('outreach')
    ) {
      return 'marketing';
    }
    if (
      heading.includes('overview') ||
      heading.includes('start here') ||
      heading.includes('what do you want to achieve') ||
      text.includes('what do you want to achieve')
    ) {
      return 'dashboard';
    }

    return 'dashboard';
  }

  function findMainWorkspaceContainer() {
    // Locate #leads or primary sections and return their shared parent container
    const leadsEl =
      document.getElementById('leads') ||
      document.getElementById('pipeline-title')?.closest('section, .card, div');
    if (leadsEl && leadsEl.parentElement) {
      return leadsEl.parentElement;
    }
    return (
      document.querySelector('main, .dashboard-main, .workspace-main, .main-content, .content-area') ||
      document.body
    );
  }

  function collectAndTagWorkspaceBlocks(mainContainer) {
    const blocks = Array.from(mainContainer.children).filter((child) => {
      const tag = child.tagName;
      if (['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT'].includes(tag)) return false;
      if (child.id === 'm360-mp-topbar' || child.id === 'm360-mp-dashboard-hub') return false;
      // Do not hide a persistent top navbar if one exists inside mainContainer
      if (tag === 'HEADER' || tag === 'NAV' || child.classList.contains('topbar')) return false;
      return true;
    });

    blocks.forEach((block) => {
      if (!block.getAttribute('data-m360-page')) {
        const pageKey = classifySectionToPage(block);
        if (pageKey) {
          block.setAttribute('data-m360-page', pageKey);
        }
      }
    });

    return blocks;
  }

  function createTopNavigationHeader(mainContainer) {
    let topbar = document.getElementById('m360-mp-topbar');
    if (topbar) return topbar;

    topbar = document.createElement('div');
    topbar.id = 'm360-mp-topbar';
    topbar.innerHTML = `
      <div class="m360-mp-topbar-left">
        <button type="button" id="m360-mp-back-dashboard-btn" class="m360-mp-back-btn" style="display: none;">
          ← Control Center
        </button>
        <div>
          <div id="m360-mp-client-name" style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#0b7f73;margin-bottom:4px;">Your workspace</div>
          <div class="m360-mp-title-row">
            <span id="m360-mp-active-badge" class="m360-mp-page-badge">Command Center</span>
            <h1 id="m360-mp-active-title" class="m360-mp-page-title">Control Center</h1>
          </div>
          <p id="m360-mp-active-subtitle" class="m360-mp-page-subtitle">
            Central command center, AI assistant configuration, and workspace navigation.
          </p>
        </div>
      </div>
      <div class="m360-mp-quick-pills" role="navigation" aria-label="Page Switcher">
        <button type="button" class="m360-mp-pill is-active" data-m360-goto="dashboard">Control Center</button>
        <button type="button" class="m360-mp-pill" data-m360-goto="leads">Leads &amp; Pipeline</button>
        <button type="button" class="m360-mp-pill" data-m360-goto="content">Content Creation</button>
        <button type="button" class="m360-mp-pill" data-m360-goto="research">Market Research</button>
        <button type="button" class="m360-mp-pill" data-m360-goto="marketing">Outreach</button>
        <button type="button" class="m360-mp-pill" data-m360-goto="profile">Company Details</button>
      </div>
    `;

    mainContainer.insertBefore(topbar, mainContainer.firstChild);

    const back = topbar.querySelector('#m360-mp-back-dashboard-btn');
    document.body.append(back);
    back.title = 'Return to Control Center. Drag to move; use Alt + arrow keys to reposition.';
    back.setAttribute('aria-label', back.title);
    let drag = null, moved = false;
    const place = (x, y) => {
      back.style.left = Math.max(8, Math.min(innerWidth - back.offsetWidth - 8, x)) + 'px';
      back.style.top = Math.max(8, Math.min(innerHeight - back.offsetHeight - 8, y)) + 'px';
      back.style.right = 'auto'; back.style.bottom = 'auto';
    };
    back.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const rect = back.getBoundingClientRect();
      drag = {x: event.clientX, y: event.clientY, left: rect.left, top: rect.top};
      moved = false; back.setPointerCapture(event.pointerId);
    });
    back.addEventListener('pointermove', event => {
      if (!drag) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      if (moved) place(drag.left + dx, drag.top + dy);
    });
    back.addEventListener('pointerup', () => { drag = null; });
    back.addEventListener('pointercancel', () => { drag = null; moved = true; });
    back.addEventListener('click', () => { if (!moved) navigateToPage('dashboard'); moved = false; });
    back.addEventListener('keydown', event => {
      if (!event.altKey || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault(); const rect = back.getBoundingClientRect();
      place(rect.left + (event.key === 'ArrowRight' ? 20 : event.key === 'ArrowLeft' ? -20 : 0), rect.top + (event.key === 'ArrowDown' ? 20 : event.key === 'ArrowUp' ? -20 : 0));
    });
    window.addEventListener('resize', () => {
      if (back.style.left && back.offsetWidth) { const rect = back.getBoundingClientRect(); place(rect.left, rect.top); }
    });

    topbar.querySelectorAll('[data-m360-goto]').forEach((btn) => {
      btn.addEventListener('click', () => {
        navigateToPage(btn.getAttribute('data-m360-goto'));
      });
    });

    document.addEventListener('m360:crm-loaded', event => {
      const label = topbar.querySelector('#m360-mp-client-name');
      const name = String(event.detail?.businessName || document.getElementById('workspace-single-name')?.textContent || '').trim();
      if (label && name) label.textContent = name;
    });

    return topbar;
  }

  function createOverviewDashboardHub(mainContainer, topbar) {
    let hub = document.getElementById('m360-mp-dashboard-hub');
    if (hub) return hub;

    hub = document.createElement('div');
    hub.id = 'm360-mp-dashboard-hub';

    // ── Build initial HTML ──────────────────────────────────────────────
    hub.innerHTML = [
      '<div class="m360cc-wrap">',
      '  <div class="m360cc-header">',
      '    <div class="m360cc-header-left">',
      '      <div class="m360cc-badge"><span class="m360cc-badge-dot"></span>AI Control Center</div>',
      '      <h2 class="m360cc-title">Matrix360 AI Control Center</h2>',
      '      <p class="m360cc-subtitle">What would you like to achieve?</p>',
      '      <p class="m360cc-desc">Ask Matrix360 a business question, explore an opportunity, or assign a task. The Control Center will develop actionable recommendations and coordinate the right specialist AI agent.</p>',
      '    </div>',
      '    <div class="m360cc-engines">',
      '      <span class="m360cc-engine-pill">Lead &amp; Pipeline</span>',
      '      <span class="m360cc-engine-pill">Content Creation</span>',
      '      <span class="m360cc-engine-pill">Outreach</span>',
      '    </div>',
      '  </div>',
      '  <div class="m360cc-input-area">',
      '    <textarea id="m360cc-input" class="m360cc-textarea" rows="3" placeholder="Ask a business question, describe an objective, or assign a task across lead generation, content and marketing..."></textarea>',
      '    <button id="m360cc-submit" class="m360cc-btn-primary">Analyse &amp; Route</button>',
      '  </div>',
      '  <div class="m360cc-chips">',
      '    <span class="m360cc-chip" data-prompt="Find new prospects for my business.">Find new prospects for my business.</span>',
      '    <span class="m360cc-chip" data-prompt="Help me decide which market to prioritize.">Help me decide which market to prioritize.</span>',
      '    <span class="m360cc-chip" data-prompt="Plan a campaign for an upcoming launch.">Plan a campaign for an upcoming launch.</span>',
      '    <span class="m360cc-chip" data-prompt="Create content for a specific audience.">Create content for a specific audience.</span>',
      '    <span class="m360cc-chip" data-prompt="Review my current pipeline and recommend the next action.">Review my current pipeline and recommend the next action.</span>',
      '    <span class="m360cc-chip" data-prompt="Build a coordinated lead, content and outreach workflow.">Build a coordinated lead, content and outreach workflow.</span>',
      '  </div>',
      '  <div id="m360cc-privacy" class="m360cc-privacy">&#128274; Your query is processed securely server-side. No data is stored beyond your session.</div>',
      '  <!-- Result panel — hidden initially -->',
      '  <div id="m360cc-result" class="m360cc-result m360cc-hidden"></div>',
      '</div>',
      '<!-- Engine Cards -->',
      '<div class="m360cc-engine-cards">',
      '  <div class="m360cc-engine-card" data-m360-card-goto="leads">',
      '    <div class="m360cc-engine-card-icon">01 / DISCOVER</div>',
      '    <div class="m360cc-engine-card-title">Lead Generation &amp; Pipeline</div>',
      '    <div class="m360cc-engine-card-desc">Find prospects, qualify leads and build your sales pipeline with AI.</div>',
      '    <div class="m360cc-engine-card-cta">Open leads workspace &rarr;</div>',
      '  </div>',
      '  <div class="m360cc-engine-card" data-m360-card-goto="content">',
      '    <div class="m360cc-engine-card-icon">02 / CREATE</div>',
      '    <div class="m360cc-engine-card-title">Content Creation</div>',
      '    <div class="m360cc-engine-card-desc">Generate campaign copy, proposals and brand content tailored to your audience.</div>',
      '    <div class="m360cc-engine-card-cta">Open content workspace &rarr;</div>',
      '  </div>',
      '  <div class="m360cc-engine-card" data-m360-card-goto="marketing">',
      '    <div class="m360cc-engine-card-icon">03 / ACTIVATE</div>',
      '    <div class="m360cc-engine-card-title">Outreach</div>',
      '    <div class="m360cc-engine-card-desc">Plan and activate campaigns across channels — WhatsApp, LinkedIn, email and more.</div>',
      '    <div class="m360cc-engine-card-cta">Open marketing workspace &rarr;</div>',
      '  </div>',
      '</div>'
    ].join('\n');

    // ── Wire up event handlers ──────────────────────────────────────────

    // Suggested prompt chips
    hub.querySelectorAll('[data-prompt]').forEach(function(chip) {
      chip.addEventListener('click', function() {
        var inp = hub.querySelector('#m360cc-input');
        if (inp) { inp.value = chip.getAttribute('data-prompt'); inp.focus(); }
      });
    });

    // Wire Launch Cards → navigateToPage
    hub.querySelectorAll('[data-m360-card-goto]').forEach(function(card) {
      card.addEventListener('click', function() {
        navigateToPage(card.getAttribute('data-m360-card-goto'));
      });
    });

    // Submit button
    hub.querySelector('#m360cc-submit').addEventListener('click', function() {
      runControlCenter();
    });

    // Enter key (Ctrl+Enter or Shift+Enter = newline)
    hub.querySelector('#m360cc-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        runControlCenter();
      }
    });

    // ── Core query runner ───────────────────────────────────────────────
    function esc(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function showState(html) {
      var r = hub.querySelector('#m360cc-result');
      if (!r) return;
      r.classList.remove('m360cc-hidden');
      r.innerHTML = html;
    }

    function hideResult() {
      var r = hub.querySelector('#m360cc-result');
      if (r) { r.classList.add('m360cc-hidden'); r.innerHTML = ''; }
    }

    function categoryLabel(cat) {
      var map = {
        general_question: 'General Question',
        business_strategy: 'Business Strategy',
        lead_pipeline: 'Lead Generation & Pipeline',
        content_creation: 'Content Creation',
        marketing_activation: 'Outreach',
        multi_engine: 'Multi-Engine Workflow',
        clarification_required: 'Clarification Required',
        unsupported: 'Unsupported'
      };
      return map[cat] || cat;
    }

    function enginePage(eng) {
      var map = { lead_pipeline: 'leads', content_creation: 'content', marketing_activation: 'marketing' };
      return map[eng] || null;
    }

    function buildStrategyHTML(data) {
      var html = '<div class="m360cc-section m360cc-strategy">';
      html += '<div class="m360cc-cat-badge m360cc-cat-' + esc(data.category) + '">' + esc(categoryLabel(data.category)) + '</div>';
      html += '<div class="m360cc-answer">' + esc(data.answer || '') + '</div>';

      var strat = data.strategic_analysis || {};
      if (strat.key_insight) {
        html += '<div class="m360cc-insight"><span class="m360cc-insight-icon">&#128161;</span><strong>Key Insight:</strong> ' + esc(strat.key_insight) + '</div>';
      }

      var opts = strat.options_and_tradeoffs;
      if (opts && opts.length) {
        html += '<div class="m360cc-subsection"><div class="m360cc-subsection-title">Options &amp; Trade-offs</div>';
        html += '<div class="m360cc-options-grid">';
        opts.forEach(function(o) {
          html += '<div class="m360cc-option-card">';
          html += '<div class="m360cc-option-name">' + esc(o.option || '') + '</div>';
          if (o.benefit) html += '<div class="m360cc-option-benefit">&#10003; ' + esc(o.benefit) + '</div>';
          if (o.risk) html += '<div class="m360cc-option-risk">&#9888; ' + esc(o.risk) + '</div>';
          html += '</div>';
        });
        html += '</div></div>';
      }

      var rec = strat.recommended_direction;
      if (rec) {
        html += '<div class="m360cc-rec"><span class="m360cc-rec-label">Recommended Direction</span><p>' + esc(rec) + '</p></div>';
      }

      var nexts = strat.next_steps;
      if (nexts && nexts.length) {
        html += '<div class="m360cc-subsection"><div class="m360cc-subsection-title">Next Steps</div><ul class="m360cc-list">';
        nexts.forEach(function(s) { html += '<li>' + esc(s) + '</li>'; });
        html += '</ul></div>';
      }

      html += '</div>';
      return html;
    }

    function buildHandoverHTML(data) {
      var eng = data.primary_engine;
      var page = enginePage(eng);
      var wf = data.workflow || [];
      var env = data.handover_envelope || {};

      var html = '<div class="m360cc-section m360cc-handover">';
      html += '<div class="m360cc-cat-badge m360cc-cat-' + esc(data.category) + '">' + esc(categoryLabel(data.category)) + '</div>';
      html += '<div class="m360cc-answer">' + esc(data.answer || '') + '</div>';

      // Engine recommendation
      html += '<div class="m360cc-eng-rec">';
      html += '<div class="m360cc-eng-rec-title">&#128268; Recommended Engine</div>';
      html += '<div class="m360cc-eng-rec-name">' + esc(categoryLabel(eng)) + '</div>';
      if (data.engine_recommendation && data.engine_recommendation.reason) {
        html += '<div class="m360cc-eng-rec-reason">' + esc(data.engine_recommendation.reason) + '</div>';
      }
      if (data.engine_recommendation && data.engine_recommendation.expected_output) {
        html += '<div class="m360cc-eng-rec-output"><strong>Expected output:</strong> ' + esc(data.engine_recommendation.expected_output) + '</div>';
      }
      html += '</div>';

      if (wf.length > 1) {
        html += '<div class="m360cc-workflow"><div class="m360cc-workflow-title">Workflow chain:</div><div class="m360cc-workflow-chain">';
        wf.forEach(function(step, i) {
          html += '<span class="m360cc-wf-step">' + esc(categoryLabel(step)) + '</span>';
          if (i < wf.length - 1) html += '<span class="m360cc-wf-arrow">&rarr;</span>';
        });
        html += '</div></div>';
      }

      // Handover envelope preview (collapsed)
      html += '<details class="m360cc-envelope"><summary class="m360cc-envelope-summary">&#128196; Inspect handover context (draft)</summary>';
      html += '<pre class="m360cc-envelope-json">' + esc(JSON.stringify(env, null, 2)) + '</pre></details>';

      // Action buttons
      if (page) {
        html += '<div class="m360cc-actions">';
        html += '<button class="m360cc-btn-primary" id="m360cc-handover-btn" data-page="' + esc(page) + '">Review and hand over &rarr;</button>';
        html += '<button class="m360cc-btn-secondary" id="m360cc-cancel-btn">Clear</button>';
        html += '</div>';
      } else {
        html += '<div class="m360cc-actions"><button class="m360cc-btn-secondary" id="m360cc-cancel-btn">Clear</button></div>';
      }

      var nexts = (data.strategic_analysis && data.strategic_analysis.next_steps) || [];
      if (nexts.length) {
        html += '<div class="m360cc-subsection"><div class="m360cc-subsection-title">Recommended next actions</div><ul class="m360cc-list">';
        nexts.forEach(function(s) { html += '<li>' + esc(s) + '</li>'; });
        html += '</ul></div>';
      }

      html += '</div>';
      return html;
    }

    function wireResultActions() {
      var handoverBtn = hub.querySelector('#m360cc-handover-btn');
      var cancelBtn = hub.querySelector('#m360cc-cancel-btn');
      if (handoverBtn) {
        handoverBtn.addEventListener('click', function() {
          var pg = handoverBtn.getAttribute('data-page');
          if (pg) navigateToPage(pg);
        });
      }
      if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
          hideResult();
          var inp = hub.querySelector('#m360cc-input');
          if (inp) inp.value = '';
        });
      }
    }

    function runControlCenter() {
      var inp = hub.querySelector('#m360cc-input');
      var message = inp ? inp.value.trim() : '';
      if (!message) { inp && inp.focus(); return; }

      var token = sessionStorage.getItem('matrix360_pilot_token');
      if (!token) {
        showState('<div class="m360cc-section m360cc-blocked"><div class="m360cc-blocked-icon">&#128274;</div><div class="m360cc-blocked-title">Not authenticated</div><div class="m360cc-blocked-msg">Please sign in to use the AI Control Center.</div></div>');
        return;
      }

      // Show analysing state
      showState('<div class="m360cc-section m360cc-analysing"><div class="m360cc-spinner"></div><div class="m360cc-analysing-msg">Understanding your objective and selecting the right agent...</div></div>');

      var workspaceEl = document.getElementById('workspace');
      var workspace_id = workspaceEl ? (workspaceEl.value || workspaceEl.textContent || '') : '';

      fetch('/api/control-center', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: message,
          workspace_id: workspace_id,
          conversation_id: null,
          page_context: 'overview',
          requested_mode: 'auto'
        })
      })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (!data || data.error) {
          var errMsg = (data && data.error) || 'Unexpected error. Please try again.';
          showState('<div class="m360cc-section m360cc-blocked"><div class="m360cc-blocked-icon">&#9888;</div><div class="m360cc-blocked-title">Unable to process request</div><div class="m360cc-blocked-msg">' + esc(errMsg) + '</div><button class="m360cc-btn-secondary m360cc-retry-btn" id="m360cc-retry">Try again</button></div>');
          var retryBtn = hub.querySelector('#m360cc-retry');
          if (retryBtn) retryBtn.addEventListener('click', function() { hideResult(); });
          return;
        }

        var cat = data.category || 'general_question';
        var hasEngine = data.primary_engine && data.primary_engine !== 'none';

        if (hasEngine) {
          showState(buildHandoverHTML(data));
        } else {
          showState(buildStrategyHTML(data));
        }
        wireResultActions();
      })
      .catch(function(err) {
        showState('<div class="m360cc-section m360cc-blocked"><div class="m360cc-blocked-icon">&#9889;</div><div class="m360cc-blocked-title">Network error</div><div class="m360cc-blocked-msg">' + esc(String(err)) + '</div><button class="m360cc-btn-secondary" id="m360cc-retry">Try again</button></div>');
        var retryBtn = hub.querySelector('#m360cc-retry');
        if (retryBtn) retryBtn.addEventListener('click', function() { hideResult(); });
      });
    }

    topbar.insertAdjacentElement('afterend', hub);
    return hub;
  }

    function syncDashboardMetrics() {
    const countEl = document.getElementById('count');
    const badgeEl = document.getElementById('m360-dash-leads-metric');
    if (countEl && badgeEl && countEl.textContent.trim()) {
      badgeEl.textContent = `${countEl.textContent.trim()} in Pipeline`;
    }
  }

  function enhanceLeftSidebar() {
    const sidebar = document.querySelector(
      'aside, .sidebar, .app-sidebar, .dashboard-sidebar, nav[aria-label*="Sidebar" i]'
    );
    if (!sidebar) return;

    // 1. Inject our 4 primary isolated page links at the top of the sidebar navigation
    if (!document.getElementById('m360-sidebar-mp-nav')) {
      const mpNav = document.createElement('div');
      mpNav.id = 'm360-sidebar-mp-nav';
      mpNav.className = 'm360-sidebar-mp-group';
      mpNav.innerHTML = `
        <div class="m360-sidebar-mp-label">Workspaces (Pages)</div>
        <a href="?page=dashboard#overview" class="m360-sidebar-mp-link is-active" data-m360-sidebar-page="dashboard">
          <span>⊞</span> <span>Control Center</span>
        </a>
        <a href="?page=leads#leads" class="m360-sidebar-mp-link" data-m360-sidebar-page="leads">
          <span>◎</span> <span>Leads &amp; Pipeline</span>
        </a>
        <a href="?page=content#creative-studio" class="m360-sidebar-mp-link" data-m360-sidebar-page="content">
          <span>✦</span> <span>Content Creation</span>
        </a>
        <a href="?page=marketing#marketing" class="m360-sidebar-mp-link" data-m360-sidebar-page="marketing">
          <span>↗</span> <span>Outreach</span>
        </a>
        <a href="?page=profile#m360-brand-profile" class="m360-sidebar-mp-link" data-m360-sidebar-page="profile">
          <span>◆</span> <span>Company Details</span>
        </a>
      `;

      const existingNavContainer = sidebar.querySelector('nav, ul, .nav-list') || sidebar;
      existingNavContainer.insertBefore(mpNav, existingNavContainer.firstChild);

      mpNav.querySelectorAll('[data-m360-sidebar-page]').forEach((link) => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const targetPage = link.getAttribute('data-m360-sidebar-page');
          navigateToPage(targetPage);
        });
      });
    }

    // 2. Intercept clicks on any original sidebar links so they switch to the right isolated page
    sidebar.querySelectorAll('a[href^="#"]').forEach((a) => {
      if (a.hasAttribute('data-m360-sidebar-wired')) return;
      a.setAttribute('data-m360-sidebar-wired', 'true');

      a.addEventListener('click', (e) => {
        if (e.defaultPrevented) return;
        const rawHash = (a.getAttribute('href') || '').toLowerCase();
        const text = (a.textContent || '').toLowerCase();
        let targetPage = HASH_TO_PAGE[rawHash];

        if (!targetPage) {
          if (text.includes('lead') || text.includes('pipeline')) targetPage = 'leads';
          else if (text.includes('business profile') || text.includes('brand profile')) targetPage = 'profile';
          else if (text.includes('creative') || text.includes('content')) targetPage = 'content';
          else if (text.includes('marketing') || text.includes('outreach') || text.includes('how it works')) targetPage = 'marketing';
          else targetPage = 'dashboard';
        }

        e.preventDefault();
        navigateToPage(targetPage, rawHash);
      });
    });
  }

  function updateSidebarActiveStates(activePageKey) {
    // Update the 4 primary workspace page links
    document.querySelectorAll('[data-m360-sidebar-page]').forEach((link) => {
      const isMatch = link.getAttribute('data-m360-sidebar-page') === activePageKey;
      link.classList.toggle('is-active', isMatch);
      if (isMatch) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    // Also update original sidebar links so existing visual/test expectations stay synchronized
    const sidebar = document.querySelector(
      'aside, .sidebar, .app-sidebar, .dashboard-sidebar, nav[aria-label*="Sidebar" i]'
    );
    if (!sidebar) return;

    sidebar.querySelectorAll('a[href^="#"]').forEach((a) => {
      const text = (a.textContent || '').toLowerCase();
      let linkPage = 'dashboard';
      if (text.includes('lead') || text.includes('pipeline')) linkPage = 'leads';
      else if (text.includes('business profile') || text.includes('brand profile')) linkPage = 'profile';
      else if (text.includes('creative')) linkPage = 'content';
      else if (text.includes('marketing') || text.includes('outreach') || text.includes('how it works')) linkPage = 'marketing';
      else if (text.includes('overview') || text.includes('control center') || text.includes('start here')) linkPage = 'dashboard';

      const isPrimaryMatch =
        (activePageKey === 'dashboard' && (text.includes('overview')||text.includes('control center'))) ||
        (activePageKey === 'leads' && text.includes('lead')) ||
        (activePageKey === 'profile' && text.includes('profile')) ||
        (activePageKey === 'content' && text.includes('creative')) ||
        (activePageKey === 'marketing' && (text.includes('marketing') || text.includes('outreach')));

      a.classList.toggle('active', isPrimaryMatch);
      a.classList.toggle('is-active', isPrimaryMatch);
      if (isPrimaryMatch) {
        a.setAttribute('aria-current', 'true');
      } else {
        a.removeAttribute('aria-current');
      }
    });
  }

  function resolveInitialPage() {
    const params = new URLSearchParams(window.location.search);
    const pageParam = (params.get('page') || '').toLowerCase();
    if (PAGE_CONFIG[pageParam]) return pageParam;

    const path = window.location.pathname.toLowerCase();
    if (path.endsWith('/leads') || path.endsWith('/leads.html')) return 'leads';
    if (path.endsWith('/profile') || path.endsWith('/profile.html')) return 'profile';
    if (path.endsWith('/content') || path.endsWith('/content.html')) return 'content';
    if (path.endsWith('/marketing') || path.endsWith('/marketing.html')) return 'marketing';

    const hash = (window.location.hash || '').toLowerCase();
    if (HASH_TO_PAGE[hash]) return HASH_TO_PAGE[hash];

    return 'dashboard';
  }

  let mainContainerRef = null;

  function navigateToPage(pageKey, optionalAnchorHash, skipHistoryPush) {
    const cfg = PAGE_CONFIG[pageKey] || PAGE_CONFIG.dashboard;
    if (!mainContainerRef) {
      mainContainerRef = findMainWorkspaceContainer();
    }

    const blocks = collectAndTagWorkspaceBlocks(mainContainerRef);

    // Toggle visibility of all tagged blocks
    blocks.forEach((block) => {
      const blockPage = block.getAttribute('data-m360-page') || 'dashboard';
      const shouldShow = blockPage === cfg.key;
      block.classList.toggle('m360-mp-hidden-section', !shouldShow);
      block.setAttribute('data-m360-page-hidden', shouldShow ? 'false' : 'true');
    });

    // Explicitly toggle Marketing Centre visibility
    const mkt = document.getElementById('marketing-centre');
    if (mkt) {
      const showMkt = cfg.key === 'marketing';
      mkt.classList.toggle('m360-mp-hidden-section', !showMkt);
      mkt.setAttribute('data-m360-page-hidden', showMkt ? 'false' : 'true');
    }

    // Toggle Overview Dashboard Hub visibility
    const hub = document.getElementById('m360-mp-dashboard-hub');
    if (hub) {
      hub.hidden = true;
      hub.style.display = 'none';
    }

    // Update Topbar Title, Subtitle, Pill states & Back button
    const badgeEl = document.getElementById('m360-mp-active-badge');
    const titleEl = document.getElementById('m360-mp-active-title');
    const subtitleEl = document.getElementById('m360-mp-active-subtitle');
    const backBtn = document.getElementById('m360-mp-back-dashboard-btn');

    if (badgeEl) badgeEl.textContent = cfg.badge;
    if (titleEl) titleEl.textContent = cfg.title;
    if (subtitleEl) subtitleEl.textContent = cfg.subtitle;
    if (backBtn) backBtn.style.display = cfg.key === 'dashboard' ? 'none' : 'inline-flex';

    document.querySelectorAll('[data-m360-goto]').forEach((pill) => {
      pill.classList.toggle('is-active', pill.getAttribute('data-m360-goto') === cfg.key);
    });

    updateSidebarActiveStates(cfg.key);
    syncDashboardMetrics();

    // Update URL cleanly without reloading page or losing JS memory state
    if (!skipHistoryPush) {
      const url = new URL(window.location.href);
      url.searchParams.set('page', cfg.key);
      url.hash = optionalAnchorHash || cfg.hashes[0] || '';
      window.history.pushState({ m360Page: cfg.key }, '', url.toString());
    }

    document.dispatchEvent(new CustomEvent('m360:page-changed', { detail: { page: cfg.key, anchor: optionalAnchorHash } }));

    // Scroll to specific anchor if requested on the active page, otherwise top of page
    if (optionalAnchorHash && optionalAnchorHash.length > 1) {
      const targetEl = document.getElementById(optionalAnchorHash.replace(/^#/, ''));
      if (targetEl && !targetEl.closest('.m360-mp-hidden-section')) {
        targetEl.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function interceptInPageAnchorLinks() {
    // Any in-page CTA button (like "Review my pipeline ->" or "Prepare a campaign ->")
    // that links to #leads, #creative-studio, #brand-profile, or #marketing automatically switches pages
    document.addEventListener(
      'click',
      (e) => {
        const anchor = e.target.closest('a[href^="#"]');
        if (!anchor) return;
        const rawHash = (anchor.getAttribute('href') || '').toLowerCase();
        if (anchor.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
        const mappedPage = HASH_TO_PAGE[rawHash];
        if (mappedPage) {
          e.preventDefault();
          navigateToPage(mappedPage, rawHash);
        }
      },
      true
    );
  }

  function hideRetiredOverviewBlocks() {
    for (const id of ['home', 'services', 'm360-demo-campaign', 'm360-mp-dashboard-hub']) {
      const element = document.getElementById(id);
      if (element) element.hidden = true;
    }
    for (const id of ['goals', 'growth-plan', 'ai-draft', 'journey']) {
      const element = document.getElementById(id);
      if (element) element.hidden = true;
    }
    let node = document.getElementById('quick-start');
    const leads = document.getElementById('leads');
    while (node && node !== leads) {
      node.hidden = true;
      node = node.nextElementSibling;
    }
  }

  function repairInjectedText(root = document) {
    const replacements = new Map([
      ['â', '—'],
      ['â', '→'],
      ['â¦', '…'],
      ['Â·', '·']
    ]);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      let value = walker.currentNode.nodeValue;
      for (const [broken, correct] of replacements) value = value.replaceAll(broken, correct);
      walker.currentNode.nodeValue = value;
    }
  }

  function matchingLeadRows(rows) {
    const stage=document.getElementById('m360-pipeline-filter')?.value||'';
    const search=(document.getElementById('m360-pipeline-search')?.value||'').trim().toLowerCase();
    const source=document.getElementById('m360-source-filter')?.value||'';
    return [...rows].filter(row=>(!stage||row.dataset.pipelineStage===stage)&&(!search||row.textContent.toLowerCase().includes(search))&&(!source||(row.dataset.pipelineSource||'__none')===source));
  }
  function organizeLeadWorkspace(resetPage = false) {
    const section = document.getElementById('leads');
    const list = document.getElementById('lead-list');
    if (!section || !list) return;

    const generator = document.getElementById('m360-autonomous-leads-panel');
    if (generator && generator.previousElementSibling !== list && generator.previousElementSibling?.id !== 'm360-lead-pagination') {
      (document.getElementById('m360-lead-pagination') || list).after(generator);
    }

    const body = list.querySelector('tbody');
    let controls = document.getElementById('m360-lead-pagination');
    if (!body) {
      if (controls) controls.hidden = true;
      return;
    }
    const allRows = [...body.rows];
    if (!controls) {
      controls = document.createElement('nav');
      controls.id = 'm360-lead-pagination';
      controls.setAttribute('aria-label', 'Lead record pages');
      controls.innerHTML = '<button type="button" class="btn" data-lead-page="previous">← Previous</button><span aria-live="polite"></span><button type="button" class="btn" data-lead-page="next">Next →</button>';
      list.after(controls);
      controls.addEventListener('click', event => {
        const action = event.target.closest('[data-lead-page]')?.dataset.leadPage;
        if (!action) return;
        const currentBody = list.querySelector('tbody');
        if (!currentBody) return;
        const size=Number(document.getElementById('m360-lead-page-size')?.value)||10;
        const total = matchingLeadRows(currentBody.rows).length;
        const pages = Math.max(1, Math.ceil(total / size));
        let page = Number(controls.dataset.page || 0);
        page = action === 'next' ? Math.min(pages - 1, page + 1) : Math.max(0, page - 1);
        controls.dataset.page = String(page);
        organizeLeadWorkspace(false);
      });
    }
    if (resetPage) controls.dataset.page = '0';
    const stage = document.getElementById('m360-pipeline-filter')?.value || '';
    const rows = matchingLeadRows(allRows);
    const size=Number(document.getElementById('m360-lead-page-size')?.value)||10;
    const pages = Math.max(1, Math.ceil(rows.length / size));
    const page = Math.min(pages - 1, Math.max(0, Number(controls.dataset.page || 0)));
    controls.dataset.page = String(page);
    const visibleRows = new Set(rows.slice(page * size, page * size + size));
    allRows.forEach(row => { row.hidden = !visibleRows.has(row); });
    const start = rows.length ? page * size + 1 : 0;
    const end = Math.min(rows.length, page * size + size);
    controls.querySelector('span').textContent = rows.length ? `${start}–${end} of ${rows.length} leads` : 'No leads match these filters.';
    controls.querySelector('[data-lead-page="previous"]').disabled = page === 0;
    controls.querySelector('[data-lead-page="next"]').disabled = page >= pages - 1;
    controls.hidden = false;
  }

  function monitorInjectedWorkspaceUI() {
    repairInjectedText();
    organizeLeadWorkspace(true);
    document.addEventListener('m360:crm-loaded', () => queueMicrotask(() => organizeLeadWorkspace(true)));
    document.addEventListener('change', event => {
      if (['m360-pipeline-filter','m360-lead-page-size','m360-source-filter'].includes(event.target.id)) organizeLeadWorkspace(true);
    });
    document.addEventListener('input',event=>{if(event.target.id==='m360-pipeline-search')organizeLeadWorkspace(true);});
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.target.id === 'lead-list') queueMicrotask(() => organizeLeadWorkspace(false));
        for (const node of record.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          repairInjectedText(node);
          if (node.id === 'm360-autonomous-leads-panel') queueMicrotask(() => organizeLeadWorkspace(false));
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function bootMultiPageWorkspace() {
    // Only activate on the authenticated dashboard workspace (not on login.html or public landing page)
    const isDashboardWorkspace =
      window.location.pathname.includes('client-dashboard') ||
      window.location.pathname.includes('app.html') ||
      document.getElementById('leads') ||
      document.getElementById('pipeline-title') ||
      document.querySelector('aside, .sidebar, .dashboard-sidebar');

    if (!isDashboardWorkspace) return;

    hideRetiredOverviewBlocks();
    injectMultiPageStyles();
    mainContainerRef = findMainWorkspaceContainer();
    const topbar = createTopNavigationHeader(mainContainerRef);
    // The assistant replaces the retired overview hub; shared handlers remain available.
    enhanceLeftSidebar();
    interceptInPageAnchorLinks();
    monitorInjectedWorkspaceUI();

    const initialPage = resolveInitialPage();
    navigateToPage(initialPage, window.location.hash, true);

    window.addEventListener('popstate', () => {
      navigateToPage(resolveInitialPage(), window.location.hash, true);
    });

    window.addEventListener('hashchange', () => {
      const h = (window.location.hash || '').toLowerCase();
      if (HASH_TO_PAGE[h]) {
        navigateToPage(HASH_TO_PAGE[h], h, true);
      }
    });

    // Observe #count changes so the Overview Dashboard card stays live-synced with CRM leads
    const countEl = document.getElementById('count');
    if (countEl && typeof MutationObserver !== 'undefined') {
      const obs = new MutationObserver(syncDashboardMetrics);
      obs.observe(countEl, { childList: true, characterData: true, subtree: true });
    }
  }

  // Expose programmatic navigation helper on window
  window.Matrix360Router = {
    navigateToPage,
    resolveInitialPage
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootMultiPageWorkspace);
  } else {
    bootMultiPageWorkspace();
  }
})();
