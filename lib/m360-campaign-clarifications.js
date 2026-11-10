'use strict';

const CAMPAIGN_QUESTIONS = Object.freeze([
  { key: 'objective', text: 'What single business result should this campaign prioritize?', profile: p => p.campaign_objectives?.length, prompt: /\b(generate|increase|grow|book|sell|promote|awareness|enquir|lead|visit|registration)\b/i },
  { key: 'offer', text: 'Which product, service or approved offer should this campaign promote?', profile: p => p.approved_offers?.length || p.products_services?.length, prompt: /\b(?:promote|campaign for|launch)\s+(?:the|our|a|an)?\s*(?!(?:paid\s+)?(?:marketing\s+)?campaign\b|(?:my|our|the)\s+business\b)([^\n.]{3,120})/i },
  { key: 'audience', text: 'Who is the priority audience for this campaign?', profile: p => p.target_audience?.length, prompt: /\b(?:audience|customers?|buyers?|prospects?|decision[- ]makers?|residents?|manufacturers?|families|investors?)\b/i },
  { key: 'geography', text: 'Which location or service area should this campaign cover?', profile: p => p.service_areas?.length || p.location, prompt: /\b(?:in|around|across|location|area|city|region)\s+[A-Z][A-Za-z -]{2,80}/ },
  { key: 'timing', text: 'When should the campaign start, and is there a deadline?', profile: p => p.campaign_duration, prompt: /\b(?:today|tomorrow|next\s+(?:week|month)|\d{1,2}[/-]\d{1,2}|january|february|march|april|may|june|july|august|september|october|november|december|deadline|for\s+\d+\s+days?)\b/i },
  { key: 'budget', text: 'What is the approved paid-media budget cap?', profile: p => p.campaign_budget, prompt: /\b(?:budget|₹|rs\.?|inr|usd|\$)\s*[\d,]+/i, onlyWhen: message => /\b(?:paid|ads?|boost|media spend)\b/i.test(message) }
]);

function campaignClarifications(message, profile = {}) {
  const raw = String(message || '').slice(0, 5000);
  return CAMPAIGN_QUESTIONS.filter(question => {
    if (question.onlyWhen && !question.onlyWhen(raw)) return false;
    if (question.profile(profile)) return false;
    if (question.prompt.test(raw)) return false;
    if (raw.includes(question.text + ':')) return false;
    return true;
  }).slice(0, 7).map(question => question.text);
}

function isMarketingCampaignIntent(message, parsed = {}) {
  return parsed.category === 'marketing_activation' || parsed.engine_handover?.primary_engine === 'marketing_activation' || /\b(?:launch|plan|prepare|create|run)\b[\s\S]{0,80}\b(?:marketing\s+)?campaign\b/i.test(String(message || ''));
}

module.exports = { CAMPAIGN_QUESTIONS, campaignClarifications, isMarketingCampaignIntent };
