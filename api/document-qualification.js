'use strict';

const { createHmac, randomBytes } = require('node:crypto');
const { Readable } = require('node:stream');

const DEFAULT_CRM_ORIGIN = 'https://matrix360-crm-backend-p9os.onrender.com';
const configuredUploadLimit = Number.parseInt(process.env.MATRIX360_DOCUMENT_MAX_UPLOAD_BYTES || '26214400', 10);
const MAX_PROXY_BYTES = Number.isSafeInteger(configuredUploadLimit) && configuredUploadLimit > 0 ? configuredUploadLimit : 26214400;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const WORKSPACE = /^[A-Za-z0-9_-]{1,96}$/;

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

function safeOrigin(value, fallback) {
  try {
    const parsed = new URL(value || fallback);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('unsafe origin');
    return parsed.origin;
  } catch {
    return null;
  }
}

function errorMessage(payload, fallback) {
  if (!payload || typeof payload !== 'object') return fallback;
  const detail = typeof payload.detail === 'string' ? payload.detail : payload.message;
  return typeof detail === 'string' && detail.trim() ? detail.trim().slice(0, 500) : fallback;
}

function getBearer(req) {
  const value = String(req.headers.authorization || '');
  return /^Bearer [^\s]{16,4096}$/.test(value) ? value : null;
}

async function authorizedWorkspace(req) {
  const bearer = getBearer(req);
  if (!bearer) return { error: { status: 401, message: 'Sign in with an authorized CRM account before using document qualification.' } };
  const crm = safeOrigin(process.env.MATRIX360_CRM_API_URL, DEFAULT_CRM_ORIGIN);
  if (!crm) return { error: { status: 503, message: 'The CRM verification service is not configured safely.' } };
  let response;
  try {
    response = await fetch(`${crm}/me/workspaces`, {
      headers: { Authorization: bearer, Accept: 'application/json' },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000)
    });
  } catch {
    return { error: { status: 503, message: 'The CRM verification service is unavailable. Please retry.' } };
  }
  if (response.status === 401 || response.status === 403) return { error: { status: 401, message: 'Your CRM session has expired. Please sign in again.' } };
  if (!response.ok) return { error: { status: 503, message: 'The CRM verification service is temporarily unavailable.' } };
  let memberships;
  try { memberships = await response.json(); } catch { memberships = null; }
  const requested = String(req.query.workspace_id || req.headers['x-matrix-workspace'] || '').trim();
  const allowed = Array.isArray(memberships) && memberships.find(item => item && item.id === requested);
  if (!WORKSPACE.test(requested) || !allowed) return { error: { status: 403, message: 'Select one of your authorized CRM workspaces before continuing.' } };
  return { workspace: requested };
}

function resolveOperation(req) {
  const op = String(req.query.op || '');
  const id = String(req.query.id || '');
  const datasetId = String(req.query.dataset_id || '');
  const exportId = String(req.query.export_id || '');
  const requireId = () => ID.test(id) ? id : null;
  const requireDataset = () => ID.test(datasetId) ? datasetId : null;
  switch (op) {
    case 'datasets': return req.method === 'GET' ? { method: 'GET', path: '/api/v1/datasets' } : null;
    case 'upload': return req.method === 'POST' ? { method: 'POST', path: '/api/v1/datasets', upload: true } : null;
    case 'schema': return req.method === 'GET' && requireDataset() ? { method: 'GET', path: `/api/v1/datasets/${encodeURIComponent(datasetId)}/schema-catalog` } : null;
    case 'suggest': return req.method === 'POST' && requireDataset() ? { method: 'POST', path: `/api/v1/datasets/${encodeURIComponent(datasetId)}/filter-plans/suggest`, json: true } : null;
    case 'validate-plan': return req.method === 'POST' && requireDataset() ? { method: 'POST', path: `/api/v1/datasets/${encodeURIComponent(datasetId)}/filter-plans/validate`, json: true } : null;
    case 'apply-plan': return req.method === 'POST' && requireDataset() ? { method: 'POST', path: `/api/v1/datasets/${encodeURIComponent(datasetId)}/filter-plans/apply`, json: true } : null;
    case 'create-job': return req.method === 'POST' ? { method: 'POST', path: '/api/v1/jobs', json: true } : null;
    case 'execute-job': return req.method === 'POST' && requireId() ? { method: 'POST', path: `/api/v1/jobs/${encodeURIComponent(id)}/execute` } : null;
    case 'job': return req.method === 'GET' && requireId() ? { method: 'GET', path: `/api/v1/jobs/${encodeURIComponent(id)}` } : null;
    case 'results': return req.method === 'GET' && requireId() ? { method: 'GET', path: `/api/v1/jobs/${encodeURIComponent(id)}/results?offset=0&limit=100` } : null;
    case 'exports': return req.method === 'GET' && requireId() ? { method: 'GET', path: `/api/v1/jobs/${encodeURIComponent(id)}/exports` } : null;
    case 'download': return req.method === 'GET' && ID.test(exportId) ? { method: 'GET', path: `/api/v1/exports/${encodeURIComponent(exportId)}/download`, download: true } : null;
    default: return null;
  }
}

async function readBody(req, limit = MAX_PROXY_BYTES) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  if (req.body && typeof req.body === 'object') return Buffer.from(JSON.stringify(req.body));
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function engineHeaders(operation, workspace, contentType) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(32).toString('base64url');
  const secret = process.env.MATRIX360_ENGINE_SERVICE_AUTH_SECRET;
  const payload = ['v1', operation.method, operation.path.split('?')[0], workspace, timestamp, nonce].join('\n');
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return {
    Accept: 'application/json',
    'X-Matrix-Workspace': workspace,
    'X-Matrix-Timestamp': timestamp,
    'X-Matrix-Nonce': nonce,
    'X-Matrix-Signature': signature,
    ...(contentType ? { 'Content-Type': contentType } : {})
  };
}

async function handler(req, res) {
  const operation = resolveOperation(req);
  if (!operation) return json(res, 404, { error: 'not_found', message: 'Unsupported document qualification operation.' });
  const authorization = await authorizedWorkspace(req);
  if (authorization.error) return json(res, authorization.error.status, { error: 'authorization_failed', message: authorization.error.message });
  const engine = safeOrigin(process.env.MATRIX360_ENGINE_BASE_URL, '');
  if (!engine || !process.env.MATRIX360_ENGINE_SERVICE_AUTH_SECRET) {
    return json(res, 503, { error: 'integration_not_configured', message: 'Document qualification is not yet configured for this workspace. Contact Matrix 360 support; no file was uploaded or processed.' });
  }
  let body;
  try {
    if (operation.upload || operation.json) body = await readBody(req);
  } catch (error) {
    return json(res, error.message === 'request_too_large' ? 413 : 400, { error: 'invalid_request', message: error.message === 'request_too_large' ? 'This upload exceeds the secure gateway limit.' : 'The request body could not be read.' });
  }
  const contentType = operation.upload ? String(req.headers['content-type'] || '') : operation.json ? 'application/json' : '';
  if (operation.upload && !/^multipart\/form-data;\s*boundary=/i.test(contentType)) return json(res, 400, { error: 'invalid_upload', message: 'Upload a supported file using multipart form data.' });
  try {
    const response = await fetch(engine + operation.path, {
      method: operation.method,
      headers: engineHeaders(operation, authorization.workspace, contentType),
      body,
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(operation.upload ? 120000 : 30000)
    });
    const responseType = response.headers.get('content-type') || 'application/json; charset=utf-8';
    res.statusCode = response.status;
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (operation.download && response.ok && response.body) {
      res.setHeader('Content-Type', responseType);
      const disposition = response.headers.get('content-disposition');
      if (disposition) res.setHeader('Content-Disposition', disposition);
      return Readable.fromWeb(response.body).pipe(res);
    }
    const text = await response.text();
    if (!response.ok) {
      let payload;
      try { payload = JSON.parse(text); } catch { payload = null; }
      return json(res, response.status, { error: 'engine_request_failed', message: errorMessage(payload, `The qualification engine returned HTTP ${response.status}.`) });
    }
    res.setHeader('Content-Type', responseType);
    return res.end(text);
  } catch {
    return json(res, 502, { error: 'engine_unreachable', message: 'The qualification engine could not be reached. No success state was recorded.' });
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
module.exports._internals = { engineHeaders, resolveOperation, safeOrigin };
