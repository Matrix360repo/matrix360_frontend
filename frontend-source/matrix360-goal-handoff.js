/* Authorized CRM goal handoff. Tenant selected by existing CRM, never by public-page input. */
(() => {
  'use strict';
  const key = 'matrix360_engagement_goal_v1';
  const ttl = 30 * 60 * 1000;
  const $ = id => document.getElementById(id);
  let pending = null;
  let loadedWorkspace = '';
  const rejected = value => /(?:https?:\/\/|www\.|\b[\w.+-]+@[\w.-]+\.[a-z]{2,})/i.test(value) ||
    /(?:\+?\d[\d\s().-]{7,}\d)/.test(value);
  const discard = () => { try { sessionStorage.removeItem(key); } catch {} pending = null; };
  const hide = () => { $('engagement-continuation')?.setAttribute('hidden', ''); };
  const clearPresentedGoal = () => {
    for (const id of ['engagement-goal-text','engagement-context-text','engagement-workspace-note']) {
      if ($(id)) $(id).textContent = '';
    }
  };
  function read() {
    let raw;
    try { raw = sessionStorage.getItem(key); } catch { return null; }
    if (!raw || raw.length > 1600) { discard(); return null; }
    try {
      const data = JSON.parse(raw);
      if (data.v !== 1 || !Number.isFinite(data.createdAt) || data.createdAt > Date.now() + 60000 ||
          Date.now() - data.createdAt > ttl || typeof data.goal !== 'string' ||
          data.goal.length < 18 || data.goal.length > 900 || rejected(data.goal) ||
          typeof data.businessType !== 'string' || data.businessType.length > 90 ||
          typeof data.targetMarket !== 'string' || data.targetMarket.length > 110 || rejected(data.targetMarket)) {
        discard(); return null;
      }
      return data;
    } catch { discard(); return null; }
  }
  const inferGoal = goal => /campaign|social|linkedin|email|reel|content|advertis/i.test(goal) ? 'campaign' :
    /follow.up|convert|conversion|pipeline|close existing|retention/i.test(goal) ? 'conversion' : 'enquiries';
  function show(event) {
    // The CRM dispatches m360:crm-loaded only after authenticated workspace APIs succeed.
    const ws = event?.detail?.workspace;
    if (typeof ws !== 'string' || !ws || ws !== $('workspace')?.value) return;
    loadedWorkspace = ws;
    if (pending && Date.now()-pending.createdAt > ttl) { discard(); hide(); return; }
    if (!pending) pending = read();
    if (!pending) return hide();
    $('engagement-goal-text').textContent = pending.goal;
    $('engagement-context-text').textContent = [pending.businessType,pending.targetMarket].filter(Boolean).join(' · ') || 'No additional context supplied';
    $('engagement-workspace-note').textContent = 'Review this objective in your authorized business workspace. No plan or message has been submitted.';
    $('engagement-continuation').removeAttribute('hidden');
  }
  document.addEventListener('m360:crm-loaded', show);
  document.addEventListener('m360:workspace-changing', () => { loadedWorkspace=''; hide(); clearPresentedGoal(); });
  document.addEventListener('m360:session-ended', () => { loadedWorkspace=''; discard(); hide(); clearPresentedGoal(); });
  $('engagement-use-goal')?.addEventListener('click', () => {
    if (pending && Date.now()-pending.createdAt > ttl) { discard(); hide(); return; }
    if (!pending || !loadedWorkspace || $('workspace').value !== loadedWorkspace) return;
    const selection = inferGoal(pending.goal);
    document.querySelector(`[data-goal="${selection}"]`)?.click();
    const aiBrief = $('ai-goal-brief');
    if (aiBrief) {
      if (pending.goal.length <= 240) {
        aiBrief.value = pending.goal;
        aiBrief.dispatchEvent(new Event('input',{bubbles:true}));
        $('engagement-workspace-note').textContent = 'Objective copied to your editable AI brief. Only the verified CRM can generate a real AI plan; no request has been sent.';
      } else {
        aiBrief.value = '';
        aiBrief.dispatchEvent(new Event('input',{bubbles:true}));
        $('engagement-workspace-note').textContent = 'Your objective exceeds the AI draft field’s 240-character limit. Review the full objective above and enter a shorter version if AI drafting is available.';
      }
    }
    $('growth-plan')?.scrollIntoView({behavior:'auto',block:'start'});
  });
  $('engagement-discard-goal')?.addEventListener('click', () => { discard();hide(); });
})();
