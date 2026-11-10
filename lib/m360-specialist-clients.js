'use strict';

const { createHmac, randomBytes } = require('node:crypto');

function safeOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash ? url.origin : null;
  } catch { return null; }
}

function config(kind) {
  const name = kind === 'leads' ? 'M360_LEADS_TASK_API_URL' : 'M360_CONTENT_TASK_API_URL';
  return { origin: safeOrigin(process.env[name] || ''), secret: process.env.MATRIX360_ENGINE_SERVICE_AUTH_SECRET || '', name };
}

function signedHeaders(method, path, workspaceId, secret) {
  const timestamp = String(Math.floor(Date.now() / 1000)), nonce = randomBytes(24).toString('base64url');
  const signature = createHmac('sha256', secret).update(['v1', method, path, workspaceId, timestamp, nonce].join('\n')).digest('hex');
  return { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Matrix-Workspace': workspaceId, 'X-Matrix-Timestamp': timestamp, 'X-Matrix-Nonce': nonce, 'X-Matrix-Signature': signature };
}

function validateResult(result, expected) {
  if (!result || typeof result !== 'object' || !String(result.task_id || '') || result.correlation_id !== expected.correlation_id || result.workspace_id !== expected.workspace_id || !['accepted','clarification_required','running','partial','completed','failed','blocked'].includes(result.status)) throw new Error('Specialist service returned an invalid task contract.');
  return result;
}

async function requestSpecialistTask(kind, task, fetchImpl = fetch) {
  const settings = config(kind), path = '/api/v1/tasks';
  if (!settings.origin || settings.secret.length < 32) return { status: 'blocked', code: 'SPECIALIST_SERVICE_NOT_CONFIGURED', missing: [settings.name, 'MATRIX360_ENGINE_SERVICE_AUTH_SECRET'] };
  const payload = { schema_version: '1.0', correlation_id: task.correlation_id, workspace_id: task.workspace_id, task_type: kind === 'leads' ? 'audience_discovery' : 'content_creation', objective: task.objective, requirements: task.requirements || {}, artifact_refs: task.artifact_refs || [] };
  let response;
  try { response = await fetchImpl(settings.origin + path, { method: 'POST', headers: signedHeaders('POST', path, task.workspace_id, settings.secret), body: JSON.stringify(payload), redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) }); }
  catch { return { status: 'failed', code: 'SPECIALIST_SERVICE_UNREACHABLE', retryable: true }; }
  const body = await response.json().catch(() => null);
  if (!response.ok) return { status: 'failed', code: `SPECIALIST_HTTP_${response.status}`, retryable: response.status === 429 || response.status >= 500 };
  return validateResult(body, task);
}

module.exports = { safeOrigin, signedHeaders, requestSpecialistTask };
