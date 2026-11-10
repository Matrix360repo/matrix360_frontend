'use strict';

const { randomUUID, createHash } = require('node:crypto');

const MAX_ROWS = 2000;
const HEADER_ALIASES = Object.freeze({
  name: ['name', 'contact_name', 'full_name'],
  company_name: ['company', 'company_name', 'business'],
  email: ['email', 'email_address'],
  phone: ['phone', 'mobile', 'phone_number'],
  source: ['source', 'lead_source'],
  consent_email: ['consent_email', 'email_consent'],
  consent_whatsapp: ['consent_whatsapp', 'whatsapp_consent'],
  consent_sms: ['consent_sms', 'sms_consent'],
  consent_source: ['consent_source', 'opt_in_source'],
  consent_captured_at: ['consent_captured_at', 'opt_in_at', 'consent_date']
});

function parseCsv(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('CSV content is required');
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field');
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function resolveHeaders(headers) {
  const normalized = headers.map(normalizeHeader);
  const mapping = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const index = normalized.findIndex(value => aliases.includes(value));
    if (index >= 0) mapping[field] = index;
  }
  if (mapping.name === undefined && mapping.company_name === undefined) throw new Error('CSV needs a name or company column');
  return mapping;
}

function truthy(value) { return /^(1|true|yes|granted|opted_in)$/i.test(String(value || '').trim()); }
function clean(value, max = 300) { return String(value || '').trim().slice(0, max); }

function importCsv(text, { workspaceId, testData = true } = {}) {
  if (!workspaceId) throw new Error('workspaceId is required');
  const parsed = parseCsv(text);
  if (parsed.length < 2) throw new Error('CSV needs a header and at least one data row');
  if (parsed.length - 1 > MAX_ROWS) throw new Error(`CSV exceeds the ${MAX_ROWS} row limit`);
  const mapping = resolveHeaders(parsed[0]);
  const records = [], errors = [], seen = new Set();
  parsed.slice(1).forEach((values, index) => {
    const get = field => mapping[field] === undefined ? '' : clean(values[mapping[field]]);
    const name = get('name') || get('company_name');
    const email = get('email').toLowerCase();
    const phone = get('phone').replace(/[^0-9+]/g, '');
    const consentSource = get('consent_source'), consentCapturedAt = get('consent_captured_at');
    const verifiedConsent = Boolean(consentSource && consentCapturedAt && !Number.isNaN(new Date(consentCapturedAt).getTime()));
    if (!name) { errors.push({ row: index + 2, code: 'NAME_REQUIRED' }); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push({ row: index + 2, code: 'INVALID_EMAIL' }); return; }
    if (phone && phone.replace(/\D/g, '').length < 8) { errors.push({ row: index + 2, code: 'INVALID_PHONE' }); return; }
    const key = email || phone || `${name.toLowerCase()}|${get('company_name').toLowerCase()}`;
    if (seen.has(key)) { errors.push({ row: index + 2, code: 'DUPLICATE' }); return; }
    seen.add(key);
    records.push({
      id: `csv_${createHash('sha256').update(`${workspaceId}:${key}`).digest('hex').slice(0, 16)}`,
      name, company_name: get('company_name'), email, phone,
      source: get('source') || 'csv_import', test_data: Boolean(testData),
      outbound_blocked: Boolean(testData),
      email_opt_in_status: verifiedConsent && truthy(get('consent_email')) ? 'granted' : 'unknown',
      whatsapp_opt_in_status: verifiedConsent && truthy(get('consent_whatsapp')) ? 'granted' : 'unknown',
      sms_opt_in_status: verifiedConsent && truthy(get('consent_sms')) ? 'granted' : 'unknown',
      consent_evidence: verifiedConsent ? { email: truthy(get('consent_email')), whatsapp: truthy(get('consent_whatsapp')), sms: truthy(get('consent_sms')), source: consentSource, captured_at: new Date(consentCapturedAt).toISOString() } : {}
    });
  });
  return {
    schema_version: '1.0', import_batch_id: randomUUID(), workspace_id: workspaceId,
    test_data: Boolean(testData), external_sending_blocked: Boolean(testData),
    input_count: parsed.length - 1, accepted_count: records.length,
    rejected_count: errors.length, records, errors
  };
}

module.exports = { parseCsv, importCsv, MAX_ROWS };
