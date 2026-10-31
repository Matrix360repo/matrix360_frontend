/* Recovery V4: optional LOCAL model plan. No browser-side model keys and no dispatch. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let api = null, getWorkspace = null, generation = 0, available = false, checkedWorkspace = '';
  // Client-only acknowledgement. Never a persisted campaign approval.
  let reviewReady = false, reviewAcknowledged = false;
  function resetReview() {
    reviewReady = false; reviewAcknowledged = false;
    const gate = $('ai-review-gate'); if (gate) gate.hidden = true;
    document.querySelectorAll('[data-ai-review-check]').forEach(c => { c.checked = false; c.disabled = false; });
    const confirm = $('ai-review-confirm'); if (confirm) confirm.disabled = true;
    const status = $('ai-review-status'); if (status) status.textContent = 'Not yet reviewed. Nothing saved or sent.';
    const summary = $('ai-review-evidence'); if (summary) summary.textContent = 'Evidence pending';
  }
  function showReview(evidence) {
    resetReview();
    const gate = $('ai-review-gate'); if (!gate) return;
    const count = Number.isSafeInteger(evidence?.sampled_rows) && evidence.sampled_rows >= 0
      ? evidence.sampled_rows : null;
    const capped = evidence?.may_be_truncated === true;
    $('ai-review-evidence').textContent = count === null
      ? 'Evidence size unknown · verify the actual authorized CRM data.'
      : `Source: ${count} sampled authorized CRM ${count === 1 ? 'row' : 'rows'}. ${capped ? 'Sample reached the 1,000-row cap; totals may be incomplete.' : 'No channel analytics or conversion estimates included.'}`;
    gate.hidden = false;
    reviewReady = true;
  }
  function updateReview() {
    if (!reviewReady || reviewAcknowledged) return;
    $('ai-review-confirm').disabled = !Array.from(document.querySelectorAll('[data-ai-review-check]')).every(c => c.checked);
  }
  function clearPlan(statusText = 'No AI plan generated. The rule-based brief above remains available.') {
    $('ai-plan-output').replaceChildren();
    resetReview();
    $('ai-plan-status').textContent = statusText;
    $('ai-plan-generate').disabled = true;
  }
  function goal() {
    const choice = document.querySelector('[data-goal][aria-pressed="true"]');
    return choice && ['enquiries','conversion','campaign'].includes(choice.dataset.goal)
      ? choice.dataset.goal : 'enquiries';
  }
  function field(tag, text, cls) {
    const el = document.createElement(tag);
    el.textContent = text == null ? '' : String(text);
    if (cls) el.className = cls;
    return el;
  }
  async function refreshCapabilities() {
    if (!api || !getWorkspace) return;
    const ws = getWorkspace();
    if (!ws) return;
    const seq = ++generation;
    available = false;
    checkedWorkspace = '';
    clearPlan('Checking local AI drafting availability…');
    try {
      const c = await api('/workspaces/'+encodeURIComponent(ws)+'/ai/capabilities');
      if (seq !== generation || getWorkspace() !== ws) return;
      available = c && c.mode === 'local_model' && c.drafting_available === true;
      checkedWorkspace = ws;
      $('ai-plan-status').textContent = available
        ? 'Local model configured · anonymized CRM aggregates · human review required'
        : 'AI drafting is not configured here. The rule-based brief above is available.';
      $('ai-plan-generate').disabled = !available;
    } catch {
      if (seq === generation && getWorkspace() === ws)
        clearPlan('AI drafting unavailable in this environment; your CRM remains available.');
    }
  }
  async function generate() {
    if (!api || !getWorkspace || !available) return;
    const ws = getWorkspace();
    if (!ws || ws !== checkedWorkspace) return;
    const selectedGoal = goal();
    const brief = ($('ai-goal-brief')?.value || '').trim();
    if (brief.includes('@') || /https?:\/\//i.test(brief) || /\+?\d[\d ()-]{7,}\d/.test(brief)) {
      $('ai-plan-status').textContent = 'Remove contact details and URLs from your business goal before generating a draft.';
      return;
    }
    const seq = ++generation;
    clearPlan('Requesting a review-only plan from the locally configured model…');
    try {
      const data = await api('/workspaces/'+encodeURIComponent(ws)+'/ai/plan-draft','POST',{goal:selectedGoal,brief});
      if (seq !== generation || getWorkspace() !== ws || selectedGoal !== goal()) return;
      if (!data || data.model_generated !== true || data.source !== 'local_ai_model' ||
          data.status !== 'draft_for_review' || !Array.isArray(data.draft?.steps) ||
          data.draft.steps.length !== 3 || data.requires_human_review !== true ||
          data.dispatched !== false || data.saved !== false || data.objective !== selectedGoal ||
          data.workspace_id !== ws) {
        throw new Error('Unverified response; no AI plan displayed');
      }
      const output = $('ai-plan-output');
      output.replaceChildren(field('h3',data.draft.headline),field('p',data.draft.rationale));
      const ol = field('ol');
      for (const item of data.draft.steps) {
        const li = field('li');
        li.append(field('strong',item.title),field('p',item.action));
        ol.append(li);
      }
      output.append(ol);
      const e = data.evidence || {};
      showReview(e);
      $('ai-plan-status').textContent = `AI-generated draft · ${Number.isInteger(e.sampled_rows)?e.sampled_rows:'unknown'} sampled CRM rows · human approval required · no messages sent`;
    } catch (error) {
      if (seq === generation && getWorkspace() === ws) {
        resetReview();
        $('ai-plan-status').textContent = 'Unable to validate an AI draft; continue with the reviewed rule-based brief.';
      }
    } finally {
      if (seq === generation && getWorkspace() === ws)
        $('ai-plan-generate').disabled = !available;
    }
  }
  function mount(host) {
    api = host.api; getWorkspace = host.getWorkspace;
    $('ai-plan-generate')?.addEventListener('click', generate);
    document.querySelectorAll('[data-ai-review-check]').forEach(c => c.addEventListener('change', updateReview));
    $('ai-review-confirm')?.addEventListener('click', () => {
      if (!reviewReady || reviewAcknowledged ||
          !Array.from(document.querySelectorAll('[data-ai-review-check]')).every(c => c.checked)) return;
      reviewAcknowledged = true;
      document.querySelectorAll('[data-ai-review-check]').forEach(c => { c.disabled = true; });
      $('ai-review-confirm').disabled = true;
      $('ai-review-status').textContent = 'Reviewed in this browser only · not saved, approved or dispatched.';
    });
    document.addEventListener('m360:session-ended', () => {
      if ($('ai-goal-brief')) $('ai-goal-brief').value = '';
      ++generation; available = false; checkedWorkspace = '';
      clearPlan('Session ended. Sign in to access business-specific AI planning.');
    });
    document.addEventListener('m360:workspace-changing', () => {
      if ($('ai-goal-brief')) $('ai-goal-brief').value = '';
      ++generation; available = false; checkedWorkspace = '';
      clearPlan('Business changed. Waiting for authorized CRM records…');
    });
    // A failed CRM refresh cannot leave an earlier AI recommendation labelled current.
    document.addEventListener('m360:crm-evidence-invalidated', () => {
      ++generation; available = false; checkedWorkspace = '';
      clearPlan('CRM evidence is being refreshed. AI drafting is unavailable until verified records reload.');
    });
    document.addEventListener('m360:crm-loaded', () => refreshCapabilities());
    // Editing a brief invalidates any in-flight model result, even in the
    // same workspace/goal. Otherwise an outdated plan could be presented as
    // relevant to the new brief.
    $('ai-goal-brief')?.addEventListener('input', () => {
      ++generation;
      $('ai-plan-output').replaceChildren();
      resetReview();
      $('ai-plan-status').textContent = 'Business brief changed. Generate a fresh draft for review.';
      $('ai-plan-generate').disabled = !available || checkedWorkspace !== getWorkspace();
    });
    document.querySelectorAll('[data-goal]').forEach(button => button.addEventListener('click', () => {
      ++generation;
      $('ai-plan-output').replaceChildren();
      resetReview();
      $('ai-plan-status').textContent = 'Objective updated. Generate a new draft only after reviewing the source evidence.';
      $('ai-plan-generate').disabled = !available;
    }));
  }
  window.Matrix360AI = { mount };
})();
