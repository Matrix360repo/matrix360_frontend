'use strict';

const {workspaceContext}=require('../lib/m360-workspace-context');
const { randomUUID } = require('node:crypto');

/**
 * Matrix360 Marketing API Endpoint
 *
 * Exposes:
 * - POST /api/marketing/dispatch -> starts or registers a marketing task from HandoverEnvelope
 * - GET  /api/marketing/tasks    -> retrieves task status, step progress, drafts & readiness
 * - GET  /api/marketing/events   -> SSE stream for real-time progress steps
 * - POST /api/marketing/revise   -> surgical natural-language revision of targeted channels
 * - POST /api/marketing/approve  -> approves draft for a specific channel
 * - POST /api/marketing/handoff  -> accepts reverse handoffs from Leads or Content
 */

const {
  createHandoverEnvelope,
  dispatchMarketingTask,
  getMarketingTask,
  listMarketingTasks,
  reviseMarketingTaskDraft,
  approveChannelDraft,
  executeMarketingChannel,
  getTaskEventEmitter
} = require('../lib/m360-marketing-orchestrator');

const CRM = 'https://matrix360-crm-backend-p9os.onrender.com';
const WORKSPACE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const WRITERS = new Set(['platform_owner', 'agency_admin', 'client_admin', 'marketing_operator', 'sales_operator']);
const APPROVERS = new Set(['platform_owner', 'agency_admin', 'client_admin', 'marketing_operator']);

async function authorize(req, workspaceId, permission = 'read') {
  const bearer = String(req.headers?.authorization || '');
  if (!/^Bearer [A-Za-z0-9_.-]{20,8000}$/.test(bearer)) return { status: 401, message: 'Sign in to your Matrix 360 workspace.' };
  if (!WORKSPACE_ID.test(workspaceId)) return { status: 400, message: 'Select a valid business workspace.' };
  let response;
  try {
    response = await fetch(CRM + '/me/workspaces', {
      headers: { Authorization: bearer, Accept: 'application/json' },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000)
    });
  } catch {
    return { status: 503, message: 'CRM workspace authorization is temporarily unavailable.' };
  }
  if (response.status === 401 || response.status === 403) return { status: 401, message: 'Your CRM session has expired.' };
  if (!response.ok) return { status: 503, message: 'CRM workspace authorization could not be verified.' };
  const memberships = await response.json().catch(() => null);
  if (!Array.isArray(memberships)) return { status: 503, message: 'CRM returned an invalid membership response.' };
  const membership = memberships.find(item => String(item?.id) === workspaceId && typeof item.role === 'string');
  if (!membership) return { status: 403, message: 'Business workspace access denied.' };
  if (permission === 'write' && !WRITERS.has(membership.role)) return { status: 403, message: 'Your role cannot change Marketing work.' };
  if (permission === 'approve' && !APPROVERS.has(membership.role)) return { status: 403, message: 'Your role cannot approve Marketing work.' };
  return { status: 200, membership, bearer };
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(data));
}

function error(res, status, message) {
  json(res, status, { status: 'error', error: message });
}

module.exports = async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Extract path and query
  const url = new URL(req.url || '/api/marketing', 'http://127.0.0.1');
  const pathname = url.pathname.replace(/^\/api\/marketing\/?/, '').replace(/\/$/, '');
  const method = req.method || 'GET';
  const query = req.query || Object.fromEntries(url.searchParams);
  const action = pathname || query.action || query.path || '';

  // Parse JSON body if present
  let body = req.body;
  if (typeof body === 'string' && body.trim()) {
    try { body = JSON.parse(body); } catch { return error(res, 400, 'Invalid JSON body'); }
  } else if (!body) {
    body = {};
  }

  const workspaceId = String(body.workspace_id || query.workspace_id || '').trim();
  if (!workspaceId) {
    return error(res, 400, 'workspace_id is required');
  }

  try {
    const permission = method === 'GET' ? 'read' : action === 'approve' || action === 'execute' ? 'approve' : 'write';
    const access = await authorize(req, workspaceId, permission);
    if (access.status !== 200) return error(res, access.status, access.message);

    // 1. SSE Live Events Stream
    if (action === 'events' && method === 'GET') {
      const corrId = String(query.correlation_id || '').trim();
      if (!corrId) return error(res, 400, 'correlation_id required for SSE');
      const task = getMarketingTask(workspaceId, corrId);
      if (!task) return error(res, 404, 'Task not found');

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      res.write(`event: connected\ndata: ${JSON.stringify({ correlation_id: corrId, status: 'listening' })}\n\n`);

      for (const evt of task.step_history || []) {
        res.write(`id: ${evt.sequence}\nevent: step\ndata: ${JSON.stringify({ correlation_id: corrId, workspace_id: workspaceId, ...evt })}\n\n`);
      }

      const emitter = getTaskEventEmitter(workspaceId, corrId);
      const onStep = (evt) => {
        res.write(`id: ${evt.sequence}\nevent: step\ndata: ${JSON.stringify(evt)}\n\n`);
      };

      emitter.on('step', onStep);
      req.on('close', () => {
        emitter.off('step', onStep);
      });
      return;
    }

    // 2. Query Tasks / Single Task
    if ((action === 'tasks' || action === '') && method === 'GET') {
      const corrId = String(query.correlation_id || '').trim();
      if (corrId) {
        const task = getMarketingTask(workspaceId, corrId);
        if (!task) return error(res, 404, 'Task not found');
        return json(res, 200, { status: 'ok', task });
      }
      const tasks = listMarketingTasks(workspaceId);
      return json(res, 200, { status: 'ok', tasks });
    }

    // 3. Dispatch / Create Task
    if ((action === 'dispatch' || action === '') && method === 'POST') {
      const prompt = String(body.prompt || body.message || body.goal || 'Prepare marketing campaign').trim();
      if (prompt.length < 12 || prompt.length > 2000) return error(res, 400, 'Enter a Marketing request between 12 and 2,000 characters.');
      const context=await workspaceContext(workspaceId,access.membership);
      const envelope = createHandoverEnvelope({
        workspace_id: workspaceId,
        correlation_id: body.correlation_id,
        parent_task_id: body.parent_task_id || null,
        origin_module: 'marketing',
        target_engine: 'marketing',
        idempotency_key: body.idempotency_key,
        artifact_refs: [],
        payload: {
          prompt,
          workspace_context:context,
          project: access.membership.project_slug || '',
          business_name: access.membership.name || 'Authorized Matrix 360 Workspace',
          profile_type: access.membership.profile_type || access.membership.market_model || ''
        }
      });

      const task = await dispatchMarketingTask(envelope, {
        budget: body.budget,
        authToken: access.bearer
      });

      return json(res, 202, {
        status: 'accepted',
        correlation_id: task.correlation_id,
        envelope_id: task.envelope_id,
        step: task.status,
        message: 'Marketing task initiated successfully.'
      });
    }

    // 4. Surgical Per-Channel Revision
    if (action === 'revise' && method === 'POST') {
      const corrId = String(body.correlation_id || query.correlation_id || '').trim();
      const revisionPrompt = String(body.revision_prompt || body.prompt || body.instruction || '').trim();
      if (!corrId || !revisionPrompt) {
        return error(res, 400, 'correlation_id and revision_prompt are required');
      }

      const result = reviseMarketingTaskDraft(workspaceId, corrId, revisionPrompt);
      return json(res, 200, { status: 'ok', ...result });
    }

    // 5. Approve Channel Draft (Gate 1)
    if (action === 'approve' && method === 'POST') {
      const corrId = String(body.correlation_id || query.correlation_id || '').trim();
      const channel = String(body.channel || '').trim();
      const versionHash = String(body.version_hash || '').trim();
      if (!corrId || !channel || !versionHash) {
        return error(res, 400, 'correlation_id, channel and version_hash are required');
      }

      const updatedReadiness = approveChannelDraft(workspaceId, corrId, channel, versionHash, access.membership.role);
      return json(res, 200, { status: 'ok', channel, readiness: updatedReadiness });
    }

    // 6. Reverse Handoff from Leads or Content Creation
    if (action === 'handoff' && method === 'POST') {
      return json(res, 501, {
        status: 'blocked',
        code: 'VERIFIED_ENGINE_HANDOFF_REQUIRED',
        message: 'Lead and Content handoffs require server-verified engine task IDs. Browser-supplied contacts or asset references are not accepted.'
      });
    }

    // 7. Execute / Launch Campaign Channel (Enforces All 3 Gates)
    if (action === 'execute' && method === 'POST') {
      const corrId = String(body.correlation_id || query.correlation_id || '').trim();
      const channel = String(body.channel || '').trim();
      if (!corrId || !channel) {
        return error(res, 400, 'correlation_id and channel are required');
      }

      try {
        const result = await executeMarketingChannel(workspaceId, corrId, channel, {
          mode: body.mode,
          request_id: randomUUID(),
          actor_id: access.membership.user_id || access.membership.member_id || null,
          actor_role: access.membership.role
        });
        return json(res, 200, { status: 'ok', ...result });
      } catch (execErr) {
        return json(res, 412, {
          status: 'blocked',
          error: execErr.message,
          code: execErr.code || 'EXECUTION_BLOCKED',
          provider: execErr.provider || null
        });
      }
    }

    return error(res, 404, `Unknown marketing action: ${action}`);
  } catch (err) {
    return error(res, err.code === 'STALE_DRAFT_VERSION' ? 409 : 422, err.message || 'Marketing request could not be completed');
  }
};
