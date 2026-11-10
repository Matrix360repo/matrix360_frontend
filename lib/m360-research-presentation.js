'use strict';
const string = { type: 'string' };
const array = items => ({ type: 'array', items });
const object = properties => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const shortlistLimit = 5;
const candidateDescription = 'Search a reserve pool of up to ten distinct candidates so weak matches can be replaced. Rank observations by overlap with the client’s actual offer first, then target buyers, then sales or service geography. Prioritize direct substitutes and explain the overlap with concrete facts. Each observation starts with the company name and a colon and includes the applicable source URL. Exclude the client, affiliates, duplicate brands, generic directory entries and candidates without a cited comparable feature. If too few qualify, search different operators or nearby locations within the approved market. Return fewer only if suitable candidates cannot be substantiated.';
const dimensionsSchema = { ...array(string), description: 'Up to four concrete offerings or capabilities relevant to a buyer. Include a dimension only when at least one competitor has an affirmative verbatim quote and a cited source for it. Return an empty list when none qualify.' };
const competitorsSchema = array(object({ observation: string, evidence: array(object({ dimension: string, quote: string, source_url: string })) }));
const shortlistSchema = object({
  competitor_findings: { ...array(string), description: candidateDescription },
  dimensions: dimensionsSchema,
  competitors: competitorsSchema
});
const schema = object({
  geography_rationale: string,
  dimensions: dimensionsSchema,
  competitors: competitorsSchema,
  messages: array(object({ observation: string, buyer_question: string, proof_needed: string, next_step: string, measurement: string, source_url: string })),
  actions: array(object({ recommendation: string, reason: string, deliverable: string, preparation: array(string), measurement: string, source_url: string })),
  quantitative: array(object({ metric: string, unit: string, values: array(object({ observation: string, value: { type: 'number' }, qualifier: string, source_url: string })) })),
  synthesis: object({ decision: string, gaps: array(string) })
});
schema.description = 'Concise presentation details, not additional company claims. Repeat each matching observation/recommendation exactly. Competitor quotes must be verbatim substrings of its observation, affirmatively support the dimension and cite a source returned by web search. Leave unsupported cells absent. For each message explain a distinct buyer question, proof to obtain, proposed next step and measurement; do not repeat its observation. For each action specify its own deliverable and preparation. Geography rationale must explain the proposed search area, not invent regional demand. Keep explanations short. Sources for proposed guidance may be empty; never invent URLs or approved client facts.';

function safeUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key)) url.searchParams.delete(key);
    url.hash = '';
    return url.href;
  } catch { return ''; }
}
const affirmative = text => !/\b(?:no|not|without|unavailable|lacks?|doesn[’']t|isn[’']t)\b/i.test(text);
const supportsQuote = (observation, quote) => observation.split(/[.!?;]\s+/).some(clause => clause.includes(quote) && affirmative(clause));
function normalize(value, research, sources) {
  const allowed = new Set(sources.map(safeUrl).filter(Boolean));
  const source = url => allowed.has(safeUrl(url)) ? safeUrl(url) : '';
  const dimensions = [...new Set(value.dimensions.map(s => s.trim()).filter(s => s && s.length <= 60))].slice(0, 4);
  const observations = new Set(research.competitor_findings);
  const seen = new Set();
  const competitors = value.competitors.filter(item => observations.has(item.observation) && !seen.has(item.observation) && seen.add(item.observation)).map(item => ({
    observation: item.observation,
    evidence: item.evidence.filter(e => dimensions.includes(e.dimension.trim()) && e.quote.trim().length >= 8 && supportsQuote(item.observation, e.quote) && source(e.source_url)).map(e => ({ ...e, dimension: e.dimension.trim(), source_url: source(e.source_url) }))
  }));
  const supportedDimensions = dimensions.filter(dimension =>
    competitors.some(item => item.evidence.some(entry => entry.dimension === dimension))
  );
  const synthesis = supportedDimensions.length === dimensions.length
    ? value.synthesis
    : {decision: '', gaps: []};
  const messages = value.messages.filter(item => research.content_trends.includes(item.observation)).map(item => ({ ...item, source_url: source(item.source_url) }));
  const actions = value.actions.filter(item => research.recommendations.includes(item.recommendation)).map(item => ({ ...item, source_url: source(item.source_url) }));
  const quantitative = value.quantitative.map(metric => ({ ...metric, values: metric.values.filter(item => {
    if(!observations.has(item.observation)||!source(item.source_url)||!Number.isFinite(item.value)||item.value<0)return false;
    const normalized=item.observation.toLowerCase().replace(/,/g,'');
    const qualifier=item.qualifier.trim().toLowerCase();
    if(!['','over','more than','approximately','about','up to'].includes(qualifier))return false;
    const literal=(qualifier?qualifier+' ':'')+String(item.value)+' '+metric.unit.toLowerCase();
    const at=normalized.indexOf(literal),prefix=normalized.slice(Math.max(0,at-16),at);
    return metric.unit.trim().length>0&&affirmative(item.observation)&&at>=0&&(at===0||!/[\d.]/.test(normalized[at-1]))&&!/[a-z0-9]/i.test(normalized[at+literal.length]||'')&&(qualifier||!/(?:over|more than|approximately|about|up to)\s*$/.test(prefix));
  }).map(item=>({...item,source_url:source(item.source_url)})) })).filter(metric=>metric.values.length>=2);
  return { ...value, dimensions: supportedDimensions, competitors, messages, actions, quantitative, synthesis };
}

const companyKey = name => String(name || '').normalize('NFKC').toLowerCase()
  .replace(/\b(?:private|pvt|limited|ltd|llp|inc|corp|corporation)\b/g, '')
  .replace(/[^\p{L}\p{N}]/gu, '');
const observationCompany = observation => companyKey(observation.split(':')[0]);

function selectShortlist(research, sources, clientName) {
  const data = normalize(research.presentation, research, sources);
  const evidenceByObservation = new Map(data.competitors.map(item => [item.observation, item]));
  const seen = new Set([companyKey(clientName), '']);
  const competitors = [];
  for (const observation of research.competitor_findings) {
    const candidate = evidenceByObservation.get(observation);
    const company = observationCompany(observation);
    if (!observation.includes(':') || seen.has(company) || !candidate?.evidence.length) continue;
    seen.add(company);
    competitors.push(candidate);
    if (competitors.length === shortlistLimit) break;
  }
  const findings = competitors.map(item => item.observation);
  const dimensions = data.dimensions.filter(dimension =>
    competitors.some(item => item.evidence.some(entry => entry.dimension === dimension))
  );
  const quantitative = data.quantitative.map(metric => ({
    ...metric,
    values: metric.values.filter(item => findings.includes(item.observation))
  })).filter(metric => metric.values.length >= 2);
  const selectionChanged = findings.length !== research.competitor_findings.length;
  return {
    ...research,
    competitor_findings: findings,
    presentation: {
      ...data, dimensions, competitors, quantitative, comparison_ranked: true,
      synthesis: selectionChanged ? {decision: '', gaps: []} : data.synthesis
    }
  };
}

module.exports = {
  schema, normalize, safeUrl, affirmative, shortlistSchema, shortlistLimit,
  candidateDescription, selectShortlist, observationCompany
};
