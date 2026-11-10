'use strict';

const CRM = 'https://matrix360-crm-backend-p9os.onrender.com';

function configuredEndpoint(workspaceId = '') {
  try {
    const configured = process.env.M360_CRM_CSV_IMPORT_URL || `${CRM}/workspaces/${encodeURIComponent(workspaceId)}/leads/import`;
    const url = new URL(configured);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash ? url.href : null;
  } catch { return null; }
}

async function importIntoCrm(batch, bearer, fetchImpl = fetch) {
  const endpoint = configuredEndpoint(batch.workspace_id);
  if (!endpoint) return { status: 'blocked', code: 'CRM_IMPORT_NOT_CONFIGURED' };
  let response;
  try { response = await fetchImpl(endpoint, { method: 'POST', headers: { Authorization: bearer, Accept: 'application/json', 'Content-Type': 'application/json', 'Idempotency-Key': batch.import_batch_id }, body: JSON.stringify(batch), redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) }); }
  catch { return { status: 'failed', code: 'CRM_IMPORT_UNREACHABLE', retryable: true }; }
  const result = await response.json().catch(() => null);
  if (!response.ok && !process.env.M360_CRM_CSV_IMPORT_URL && [404, 405].includes(response.status)) return importThroughCurrentCrm(batch, bearer, fetchImpl);
  if (!response.ok) return { status: 'failed', code: `CRM_IMPORT_HTTP_${response.status}`, retryable: response.status === 429 || response.status >= 500 };
  if (!result || !String(result.import_batch_id || '') || !Number.isInteger(result.accepted_count) || !Number.isInteger(result.rejected_count)) return { status: 'failed', code: 'CRM_IMPORT_INVALID_RESPONSE', retryable: false };
  return { status: 'completed', ...result };
}

async function importThroughCurrentCrm(batch, bearer, fetchImpl) {
  let accepted = 0; const errors = [];
  for (const [index, record] of batch.records.entries()) {
    let response;
    try { response = await fetchImpl(`${CRM}/workspaces/${encodeURIComponent(batch.workspace_id)}/leads`, { method: 'POST', headers: { Authorization: bearer, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: record.name, source: record.source || 'CSV import', stage: 'enquiry', email: record.email, phone: record.phone, email_opt_in_status: record.email_opt_in_status, whatsapp_opt_in_status: record.whatsapp_opt_in_status, sms_opt_in_status: record.sms_opt_in_status, consent_evidence: record.consent_evidence }), redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) }); }
    catch { errors.push({ row: index + 2, code: 'CRM_IMPORT_UNREACHABLE' }); continue; }
    if (response.ok) accepted++; else errors.push({ row: index + 2, code: `CRM_IMPORT_HTTP_${response.status}` });
  }
  return { status: 'completed', import_batch_id: batch.import_batch_id, accepted_count: accepted, rejected_count: batch.rejected_count + errors.length, errors: [...batch.errors, ...errors], contact_fields_persisted: false, warning: 'The current hosted CRM accepted lead rows through its compatibility endpoint. Deploy the included CRM batch migration to retain email, phone and consent evidence.' };
}

module.exports = { configuredEndpoint, importIntoCrm };
