'use strict';

const { createHash } = require('node:crypto');
const { leadSearchContext } = require('./m360-workspace-context');
const { evidence } = require('./m360-lead-relevance');
const CHANNELS = ['Email', 'LinkedIn', 'Instagram', 'Facebook', 'WhatsApp', 'YouTube', 'X'];
const text = (value, limit = 300) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

function requirements(prompt, profile = {}, answers = {}) {
  const search = leadSearchContext(prompt);
  const count = answers.count ?? (prompt.match(/\b(\d+)\s+(?:(?:qualified|verified|usable)\s+)?(?:leads?|prospects?|contacts?|candidates?)\b/i) || prompt.match(/\b(?:find|get|for)\s+(\d+)\b/i))?.[1];
  const natural = prompt.match(/\b(?:target(?:ing)?|audience[: ]|for\s+\d+)\s*([^\n.]+?)\s+in\s+([^\n.;]+)/i);
  const requested = count === undefined || count === '' ? null : Number(count);
  if (requested !== null && (!Number.isInteger(requested) || requested < 1 || requested > 2000)) throw Error('Request between 1 and 2,000 leads.');
  const channels = CHANNELS.filter(channel => new RegExp('\\b' + channel + '\\b', 'i').test(prompt));
  return {
    topic: text(answers.topic, 500),
    audience: text(answers.audience || prompt.match(/(?:Target audience|Type of prospects or industry focus):\s*([^\n]+)/i)?.[1] || natural?.[1] || (/^\s*(?:find|get|search|generate)\b/i.test(prompt) && search.query) || profile.target_audience?.join(', ')),
    geography: text(answers.geography || prompt.match(/(?:Target geography|Target location for prospect search):\s*([^\n]+)/i)?.[1] || natural?.[2] || (/^\s*(?:find|get|search|generate)\b/i.test(prompt) && search.location) || profile.service_areas?.join(', ') || profile.location),
    qualification: text(answers.qualification || prompt.match(/Qualification criteria:\s*([^\n]+)/i)?.[1] || '', 500),
    requested_count: requested,
    channels: Array.isArray(answers.channels) ? CHANNELS.filter(channel => answers.channels.includes(channel)) : channels.length ? channels : CHANNELS.filter(channel => profile.preferred_channels?.includes(channel))
  };
}

function candidateId(row) {
  return 'candidate_' + createHash('sha256').update(JSON.stringify([row.company_name || row.name, row.email, row.phone, row.website])).digest('hex').slice(0, 24);
}

function deduplicate(rows) {
  const seen = new Set();
  return rows.filter(row => {
    const email=String(row.email||'').trim().toLowerCase(),phone=String(row.phone||'').replace(/\D/g,'');
    const website=String(row.website||'').toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
    const name=String(row.company_name||row.name||'').trim().toLowerCase();
    const keys = [/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&'email:'+email,/^\d{7,15}$/.test(phone)&&'phone:'+phone,
      /^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/.test(website)&&'site:'+website,
      row.id&&'id:'+row.id,name&&!/^(?:crm lead|unknown|not available|n\/a)$/.test(name)&&'name:'+name].filter(Boolean);
    if (!keys.length || keys.some(key => seen.has(key))) return false;
    keys.forEach(key => seen.add(key)); return true;
  });
}

function eligible(row, brief) {
  if (/^(?:disqualified|do_not_contact|unsubscribed|opted_out|lost)$/i.test(row.stage || '') || row.email_opt_in_status === 'unsubscribed') return false;
  const facts = [row.name, row.company_name, row.industry, row.location, row.city, row.source,
    row.relevance?.industry_evidence, row.relevance?.location_evidence, row.fit_reasoning].filter(Boolean).join(' ');
  if (brief.audience && brief.geography && !evidence(facts, brief.audience, brief.geography).matched) return false;
  if (brief.qualification) {
    const criteria = brief.qualification.toLowerCase().split(/[,;]+/).map(part => part.trim()).filter(Boolean);
    if (!criteria.every(criterion => facts.toLowerCase().includes(criterion))) return false;
  }
  return true;
}

function audienceInventory(crm, staged, brief) {
  const rows = deduplicate([
    ...crm.map(row => ({ ...row, selection_id: 'crm:' + row.id, pool: /^(?:reserved|staged|candidate|reservation)$/i.test(row.stage) ? 'reserved_crm_stage' : 'crm', record_id: row.id })),
    ...staged.map(row => ({ ...row, id: candidateId(row), selection_id: 'staged:' + candidateId(row), pool: 'verified_discovery', email_opt_in_status: 'unknown', whatsapp_opt_in_status: 'unknown', sms_opt_in_status: 'unknown' }))
  ]);
  const matching = rows.filter(row => eligible(row, brief));
  return { candidates: matching, excluded_count: crm.length + staged.length - matching.length, available_count: matching.length,
    existing_count: matching.filter(row => row.pool === 'crm').length,
    saved_candidate_count: matching.filter(row => row.pool !== 'crm').length,
    pool_note: 'Saved candidates are reserved CRM stages, when present, and verified discovery checkpoints retained for 20 minutes. No separate reservation service is configured.' };
}

function selectAudience(inventory, ids, requested) {
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) throw Error('Choose distinct audience records.');
  const contacts = ids.map(id => inventory.candidates.find(row => row.selection_id === id));
  if (contacts.some(row => !row)) throw Error('An audience record changed, expired or no longer matches. Refresh the audience review.');
  if (requested && contacts.length > requested) throw Error('Select no more than the requested audience count.');
  return { contacts, requested_count: requested, selected_count: contacts.length, missing_count: requested === null ? 0 : Math.max(0, requested - contacts.length) };
}

module.exports = { requirements, audienceInventory, selectAudience, deduplicate, candidateId };
