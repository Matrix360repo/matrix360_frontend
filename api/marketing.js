'use strict';

const {workspaceContext}=require('../lib/m360-workspace-context');
const {hasPrivatePreviewEmailSession}=require('./gateway');
const { randomUUID } = require('node:crypto');
const { timingSafeEqual } = require('node:crypto');

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
  resumeMarketingTask,
  getMarketingTask,
  listMarketingTasks,
  reviseMarketingTaskDraft,
  approveChannelDraft,
  executeMarketingChannel,
  attachVerifiedHandoff,
  attachEmailCreative,
  mutateCampaignCalendar,
  mutateCampaignJourney,
  broadcastTaskTelemetry,
  restoreMarketingTask,
  verifyMarketingProvider,
  createMarketingConversation,
  hasCampaignTopic,
  continueMarketingConversation,
  getMarketingConversation,
  getTaskEventEmitter
} = require('../lib/m360-marketing-orchestrator');
const { importCsv } = require('../lib/m360-csv-import');
const durableStore = require('../lib/m360-marketing-durable-store');
const { estimateBudgetScenarios, calculateABSampleSize } = require('../lib/m360-budget-estimator');
const { importIntoCrm } = require('../lib/m360-crm-import-client');
const { loadSavedContentAssets, loadEmailCreative } = require('../lib/m360-content-assets-client');
const campaignWorkspace = require('../lib/m360-campaign-workspace');
const { savedCandidates } = require('../lib/m360-leads-orchestrator-server');
const { loadSavedReport } = require('../lib/m360-market-research');

const CRM = 'https://matrix360-crm-backend-p9os.onrender.com';
const WORKSPACE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const WRITERS = new Set(['platform_owner', 'agency_admin', 'client_admin', 'marketing_operator', 'sales_operator']);
const APPROVERS = new Set(['platform_owner', 'agency_admin', 'client_admin', 'marketing_operator']);

function ownerEmailScope(req, workspaceId, membership) {
  if (membership.role !== 'sales_operator' || process.env.M360_MARKETING_CONTROLLED_TEST_ONLY !== 'true' ||
      workspaceId !== 'lakhotia' || workspaceId !== process.env.M360_MARKETING_TEST_WORKSPACE ||
      process.env.M360_MARKETING_OWNER_DIRECT_EMAIL !== 'true') return '';
  if (req.matrix360Loopback === true) return 'local';
  return process.env.VERCEL_ENV === 'preview' ? 'preview' : '';
}

async function authorize(req, workspaceId, permission = 'read', emailAction = false) {
  const bearer = String(req.headers?.authorization || '');
  if (process.env.M360_SHOWCASE_ENABLED === 'true' && workspaceId === 'showcase' && bearer === 'Bearer matrix360-isolated-showcase') return { status: 200, bearer, showcase: true, membership: { id: 'showcase', name: 'Northstar Industries — Demo', role: 'marketing_operator', profile_type: 'b2b_industrial' } };
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
  if (permission === 'write' && !WRITERS.has(membership.role)) return { status: 403, message: 'Your role cannot change Outreach work.' };
  const ownerEmail = ownerEmailScope(req, workspaceId, membership);
  const ownerSession = Boolean(ownerEmail && hasPrivatePreviewEmailSession(req, bearer));
  if (permission === 'approve' && !APPROVERS.has(membership.role) && !(emailAction && ownerSession))
    return {status:403,message:emailAction && ownerEmail ? 'Sign in privately with the designated account to approve or send this email.' : 'Your role cannot approve Outreach work.'};
  return { status: 200, membership, bearer, ownerSession, privateEmail: emailAction && ownerSession && ownerEmail === 'preview' };
}

function showcaseContext(body, access) {
  if (!access.showcase) return null;
  const profile = body.showcase_profile && typeof body.showcase_profile === 'object' ? body.showcase_profile : {};
  return { workspace_id: 'showcase', available: true, storage_ready: false, profile: { business_name: String(profile.business_name || access.membership.name).slice(0, 200), industry: String(profile.industry || '').slice(0, 120), description: String(profile.description || '').slice(0, 1000), products_services: Array.isArray(profile.products_services) ? profile.products_services.map(value => String(value).slice(0, 160)).slice(0, 20) : [], approved_claims: [] }, source: 'isolated_showcase_browser' };
}

function normalizedAudience(records, testData = false) {
  if (!Array.isArray(records)) return [];
  return records.slice(0, 2000).filter(item => item && (item.id || item.name)).map(item => ({
    id: String(item.id || randomUUID()).slice(0, 200), name: String(item.name || 'CRM lead').slice(0, 200), company_name: String(item.company_name || '').slice(0, 200),
    email: typeof item.email === 'string' ? item.email.trim().toLowerCase().slice(0, 320) : '', phone: typeof item.phone === 'string' ? item.phone.trim().slice(0, 40) : '',
    source: String(item.source || 'Matrix 360 CRM').slice(0, 1000), stage: String(item.stage || 'enquiry').slice(0, 80),
    industry: String(item.industry || '').slice(0, 300), location: String(item.location || item.city || '').slice(0, 300), website: String(item.website || '').slice(0, 300),
    email_opt_in_status: ['granted', 'opted_in'].includes(item.email_opt_in_status) ? 'granted' : item.email_opt_in_status === 'unsubscribed' ? 'unsubscribed' : 'unknown',
    whatsapp_opt_in_status: item.whatsapp_opt_in_status === 'granted' ? 'granted' : 'unknown', sms_opt_in_status: item.sms_opt_in_status === 'granted' ? 'granted' : 'unknown',
    consent_evidence: item.consent_evidence && typeof item.consent_evidence === 'object' ? item.consent_evidence : {}, test_data: Boolean(testData), outbound_blocked: Boolean(testData)
  }));
}

async function crmAudience(workspaceId, bearer) {
  const response = await fetch(`${CRM}/workspaces/${encodeURIComponent(workspaceId)}/leads`, { headers: { Authorization: bearer, Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Object.assign(new Error('Authorized CRM audience could not be loaded.'), { code: `CRM_AUDIENCE_HTTP_${response.status}` });
  const rows = await response.json().catch(() => null);
  if (!Array.isArray(rows)) throw Object.assign(new Error('CRM audience response was invalid.'), { code: 'CRM_AUDIENCE_INVALID_RESPONSE' });
  return normalizedAudience(rows, false);
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

function safeTokenMatch(actual, expected) {
  const a = Buffer.from(String(actual || '')), b = Buffer.from(String(expected || ''));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

async function findTask(workspaceId, correlationId) {
  const task = getMarketingTask(workspaceId, correlationId) || await durableStore.loadTask(workspaceId, correlationId);
  return task ? restoreMarketingTask(task) : null;
}

async function campaignResources(workspaceId, access, input) {
  const context = await workspaceContext(workspaceId, access.membership);
  const answers = input.answers && typeof input.answers === 'object' ? input.answers : {};
  const [audience, content, research] = await Promise.allSettled([
    crmAudience(workspaceId, access.bearer), loadSavedContentAssets(workspaceId), loadSavedReport(workspaceId)
  ]);
  const staged = savedCandidates(workspaceId, input.discovery_task_id, input.checkpoint);
  const report = research.status === 'fulfilled' ? research.value : null;
  const profile=context.profile||{};
  const brief=campaignWorkspace.requirements(String(input.prompt||'').slice(0,2000),{
    ...profile,target_audience:profile.target_audience?.length?profile.target_audience:[report?.research?.audience_industry].filter(Boolean),
    service_areas:profile.service_areas?.length?profile.service_areas:[report?.research?.audience_location].filter(Boolean)
  },answers);
  const inventory = campaignWorkspace.audienceInventory(audience.status === 'fulfilled' ? audience.value : [], staged, brief);
  const assets=content.status==='fulfilled'?content.value.assets:[];
  if(durableStore.enabled())for(const task of await durableStore.listTasks(workspaceId))restoreMarketingTask(task);
  const approved=listMarketingTasks(workspaceId).flatMap(item=>Object.values(getMarketingTask(workspaceId,item.correlation_id)?.channel_draft_versions||{}).map(entry=>entry.versions.at(-1)).filter(version=>version?.status==='approved'));
  for(const asset of assets)asset.approval_state=approved.some(version=>
    (version.asset_refs||[]).some(ref=>ref.id===asset.id&&ref.metadata?.version===asset.metadata?.version)||
    version.email_creative?.poster_id===asset.metadata?.poster_id&&version.email_creative?.version===asset.metadata?.version
  )?'previously_approved':'saved';
  const refs = [];
  if (report) refs.push({kind:'research',id:report.id || report.report_id,version:report.profile_version,created_at:report.created_at});
  return { workspace_id: workspaceId, can_write: WRITERS.has(access.membership.role), can_approve: APPROVERS.has(access.membership.role),
    brief, topic_known: Boolean(answers.topic) || hasCampaignTopic(String(input.prompt || '')), context, ...inventory, assets,
    research: report, artifact_refs: refs,
    warnings: [audience.status === 'rejected' ? 'CRM audience could not be loaded. Retry before selecting contacts.' : null,
      content.status === 'rejected' || content.value?.status !== 'completed' ? 'Saved creative is unavailable. Retry or prepare a fresh brief.' : null,
      research.status === 'rejected' ? 'Saved research could not be loaded. Company facts remain separate from planning assumptions.' : null].filter(Boolean) };
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

  if (action === 'webhooks/brevo' && method === 'POST') {
    const expected = process.env.BREVO_WEBHOOK_BEARER_TOKEN || '';
    const actual = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (expected.length < 24 || !safeTokenMatch(actual, expected)) return error(res, 401, 'Provider webhook authentication failed.');
    try { const event = await durableStore.recordBrevoEvent(body); return json(res, 202, { status: 'accepted', provider_event_id: event.provider_event_id }); }
    catch (webhookError) { return error(res, webhookError.code === 'EXECUTION_NOT_FOUND' ? 404 : webhookError.code === 'INVALID_PROVIDER_EVENT' ? 400 : 503, webhookError.message); }
  }

  const workspaceId = String(body.workspace_id || query.workspace_id || '').trim();
  if (!workspaceId) {
    return error(res, 400, 'workspace_id is required');
  }

  try {
    // SMTP verification authenticates without sending; approval remains required for release.
    const permission = method === 'GET' || action === 'resources' ? 'read' : action === 'approve' || action === 'execute' ? 'approve' : 'write';
    const emailAction=body.channel==='Email'&&(action==='approve'||action==='execute'&&body.controlled_test===true&&body.mode==='live');
    const access = await authorize(req, workspaceId, permission, emailAction);
    if (access.status !== 200) return error(res, access.status, access.message);

    if (action === 'resources' && method === 'POST') {
      return json(res, 200, {status:'ok', ...await campaignResources(workspaceId, access, body)});
    }
    if(action==='retry' && method==='POST'){
      const task=await findTask(workspaceId,String(body.correlation_id||''));
      if(!task)return error(res,404,'Campaign not found.');
      await resumeMarketingTask(workspaceId,task.correlation_id,{authToken:access.bearer});
      return json(res,202,{status:task.status,correlation_id:task.correlation_id});
    }
    if (action === 'resources' && method === 'GET') {
      let answers = {};
      try { answers = JSON.parse(query.answers || '{}'); } catch { return error(res,400,'Invalid campaign answers.'); }
      return json(res, 200, {status:'ok', ...await campaignResources(workspaceId, access, {...query,answers})});
    }

    // 1. SSE Live Events Stream
    if (action === 'events' && method === 'GET') {
      const corrId = String(query.correlation_id || '').trim();
      if (!corrId) return error(res, 400, 'correlation_id required for SSE');
      const task = await findTask(workspaceId, corrId);
      if (!task) return error(res, 404, 'Task not found');

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      res.write(`event: connected\ndata: ${JSON.stringify({ correlation_id: corrId, status: 'listening' })}\n\n`);
      let lastSequence = Math.max(0, Number(req.headers?.['last-event-id'] || query.after_sequence) || 0);
      const durableEvents = await durableStore.loadTaskEvents(workspaceId, corrId, lastSequence);
      const replay = durableEvents === null ? (task.step_history || []).filter(event => event.sequence > lastSequence).map(event => ({ sequence: event.sequence, event_type: event.step, detail: { message: event.detail }, created_at: event.timestamp })) : durableEvents;
      for (const evt of replay) {
        lastSequence = Math.max(lastSequence, evt.sequence);
        res.write(`id: ${evt.sequence}\nevent: step\ndata: ${JSON.stringify({ correlation_id: corrId, workspace_id: workspaceId, sequence: evt.sequence, step: evt.event_type, detail: evt.detail?.message || '', timestamp: evt.created_at })}\n\n`);
      }

      const emitter = getTaskEventEmitter(workspaceId, corrId);
      const onStep = (evt) => {
        if (evt.sequence <= lastSequence) return;
        lastSequence = evt.sequence;
        res.write(`id: ${evt.sequence}\nevent: step\ndata: ${JSON.stringify(evt)}\n\n`);
      };

      emitter.on('step', onStep);
      const heartbeat = setInterval(() => res.write(`: heartbeat ${Date.now()}\n\n`), 15000);
      const durablePoll = durableStore.enabled() ? setInterval(async () => {
        try {
          for (const evt of await durableStore.loadTaskEvents(workspaceId, corrId, lastSequence) || []) {
            if (evt.sequence <= lastSequence) continue;
            lastSequence = evt.sequence;
            res.write(`id: ${evt.sequence}\nevent: step\ndata: ${JSON.stringify({ correlation_id: corrId, workspace_id: workspaceId, sequence: evt.sequence, step: evt.event_type, detail: evt.detail?.message || '', timestamp: evt.created_at })}\n\n`);
          }
        } catch { res.write(`event: warning\ndata: ${JSON.stringify({ code: 'DURABLE_EVENT_POLL_DELAYED', retryable: true })}\n\n`); }
      }, 3000) : null;
      req.on('close', () => {
        emitter.off('step', onStep);
        clearInterval(heartbeat);
        if (durablePoll) clearInterval(durablePoll);
      });
      return;
    }

    // 2. Query Tasks / Single Task
    if ((action === 'tasks' || action === '') && method === 'GET') {
      const corrId = String(query.correlation_id || '').trim();
      if (corrId) {
        const task = await findTask(workspaceId, corrId);
        if (!task) return error(res, 404, 'Task not found');
        return json(res, 200, { status: 'ok', task });
      }
      for (const task of await durableStore.listTasks(workspaceId)) restoreMarketingTask(task);
      if (query.overview === '1') {
        const approvesAll = !access.showcase && APPROVERS.has(access.membership.role);
        const approvesEmail = !access.showcase && access.ownerSession;
        const tasks = listMarketingTasks(workspaceId, channel => approvesAll || (approvesEmail && channel === 'Email'));
        return json(res, 200, { status: 'ok', tasks, can_review: approvesAll || approvesEmail });
      }
      return json(res, 200, { status: 'ok', tasks: listMarketingTasks(workspaceId) });
    }

    if (action === 'durability' && method === 'GET') {
      return json(res, 200, { status: 'ok', ...(await durableStore.readiness()) });
    }

    if (action === 'estimate' && method === 'POST') {
      const budget = Number(body.budget), durationDays = Number(body.duration_days), dailyVisitors = Number(body.daily_visitors || 450);
      if (!Number.isFinite(budget) || budget < 1000 || budget > 100000000 || !Number.isFinite(durationDays) || durationDays < 1 || durationDays > 365) return error(res, 400, 'Enter a valid budget and campaign duration.');
      return json(res, 200, { status: 'ok', estimate: estimateBudgetScenarios({ budget, durationDays, profileType: body.profile_type }), ab_test: calculateABSampleSize({ baselineConversion: Number(body.baseline_conversion || .03), expectedLiftPercent: Number(body.expected_lift_percent || 25), dailyVisitors, campaignDurationDays: durationDays, availableSample: body.available_sample }) });
    }

    if (action === 'providers/verify' && method === 'POST') {
      if (access.showcase && process.env.M360_SHOWCASE_LIVE_ENABLED !== 'true') return error(res, 403, 'Controlled showcase email testing is disabled.');
      const provider = String(body.provider || '').trim().toLowerCase();
      if (provider !== 'email') return error(res, 400, 'Only the Brevo email connection can be verified in this release.');
      const result = await verifyMarketingProvider(provider);
      if (!result.verified) return json(res, 412, { status: result.status, ...result, code: result.error, error: result.error === 'SMTP_AUTHENTICATION_REJECTED'
        ? 'Brevo rejected the SMTP login or SMTP key. Copy the Login value and generate a new SMTP key in Brevo Settings → SMTP & API, then try again.'
        : result.status === 'credentials_missing'
          ? `Brevo is missing ${result.missing.join(', ')} on this deployment. Drafts and previews are available; email delivery is disabled.`
          : 'Brevo SMTP could not be verified. Check the host, port, sender verification and authorized IP settings.' });
      return json(res, 200, { status: result.status, ...result });
    }

    if (action === 'conversations' && method === 'POST') {
      const message = String(body.message || body.prompt || '').trim();
      if (message.length < 2 || message.length > 5000) return error(res, 400, 'Enter a campaign topic up to 5,000 characters.');
      const context = showcaseContext(body, access) || await workspaceContext(workspaceId, access.membership);
      const conversation = await createMarketingConversation({ workspaceId, message, parentTaskId: body.parent_task_id || null });
      let task = null;
      if (conversation.status === 'ready_to_dispatch') {
        const envelope = createHandoverEnvelope({ workspace_id: workspaceId, correlation_id: conversation.correlation_id, parent_task_id: conversation.parent_task_id, origin_module: 'marketing', target_engine: 'marketing', payload: { prompt: conversation.messages.filter(item => item.role === 'user').map(item => item.content).join('\n'), workspace_context: context, project: access.membership.project_slug || '', business_name: access.membership.name || 'Authorized Matrix 360 Workspace', profile_type: access.membership.profile_type || access.membership.market_model || '' } });
        task = await dispatchMarketingTask(envelope, access.showcase ? { keylessTestMode: true, audienceFixture: normalizedAudience(body.showcase_audience, true), creativePlan: { test_data: true, subject: 'Showcase campaign draft', caption: 'Review this fictional showcase draft before any real use.' } } : { authToken: access.bearer, waitForDraft:true });
        conversation.status = 'dispatched'; conversation.updated_at = new Date().toISOString(); await durableStore.saveConversation(conversation);
      }
      return json(res, task ? 202 : 200, { status: conversation.status, conversation, correlation_id: conversation.correlation_id, task_status: task?.status || null });
    }

    const conversationMessageMatch = /^conversations\/([0-9a-f-]{36})\/messages$/i.exec(action);
    if (conversationMessageMatch && method === 'POST') {
      const conversation = await getMarketingConversation(workspaceId, conversationMessageMatch[1]);
      if (!conversation) return error(res, 404, 'Marketing conversation not found.');
      if (conversation.status === 'dispatched') return json(res, 409, { status: 'dispatched', error: 'This conversation already created a campaign task.', correlation_id: conversation.correlation_id });
      const message = String(body.message || '').trim();
      if (!message || message.length > 5000) return error(res, 400, 'Enter a conversation response up to 5,000 characters.');
      const context = showcaseContext(body, access) || await workspaceContext(workspaceId, access.membership);
      await continueMarketingConversation(conversation, message);
      let task = null;
      if (conversation.status === 'ready_to_dispatch') {
        const envelope = createHandoverEnvelope({ workspace_id: workspaceId, correlation_id: conversation.correlation_id, parent_task_id: conversation.parent_task_id, origin_module: 'marketing', target_engine: 'marketing', payload: { prompt: conversation.messages.filter(item => item.role === 'user').map(item => item.content).join('\n'), workspace_context: context, project: access.membership.project_slug || '', business_name: access.membership.name || 'Authorized Matrix 360 Workspace', profile_type: access.membership.profile_type || access.membership.market_model || '' } });
        task = await dispatchMarketingTask(envelope, access.showcase ? { keylessTestMode: true, audienceFixture: normalizedAudience(body.showcase_audience, true), creativePlan: { test_data: true, subject: 'Showcase campaign draft', caption: 'Review this fictional showcase draft before any real use.' } } : { authToken: access.bearer, waitForDraft:true });
        conversation.status = 'dispatched'; conversation.updated_at = new Date().toISOString(); await durableStore.saveConversation(conversation);
      }
      return json(res, task ? 202 : 200, { status: conversation.status, conversation, correlation_id: conversation.correlation_id, task_status: task?.status || null });
    }

    const conversationGetMatch = /^conversations\/([0-9a-f-]{36})$/i.exec(action);
    if (conversationGetMatch && method === 'GET') {
      const conversation = await getMarketingConversation(workspaceId, conversationGetMatch[1]);
      if (!conversation) return error(res, 404, 'Marketing conversation not found.');
      return json(res, 200, { status: 'ok', conversation });
    }

    const campaignMatch = /^campaigns\/([0-9a-f-]{36})(?:\/(versions|results))?$/i.exec(action);
    if (campaignMatch && method === 'GET') {
      const task = await findTask(workspaceId, campaignMatch[1]);
      if (!task) return error(res, 404, 'Campaign not found.');
      if (campaignMatch[2] === 'versions') return json(res, 200, { status: 'ok', correlation_id: task.correlation_id, channels: task.channel_draft_versions || {} });
      if (campaignMatch[2] === 'results') {
        const events=await durableStore.loadVerifiedDeliveryEvents(workspaceId,task.correlation_id);
        return json(res,200,{status:'ok',correlation_id:task.correlation_id,executions:task.execution_history||[],metrics:task.result_metrics||[],verified_events:events,
          analytics_status:events.length?'verified_events_available':'unavailable_until_verified_provider_events'});
      }
      return json(res, 200, { status: 'ok', campaign: task });
    }

    // 3. Dispatch / Create Task
    if ((action === 'dispatch' || action === '') && method === 'POST') {
      const prompt = String(body.prompt || body.message || body.goal || 'Prepare marketing campaign').trim();
      if (prompt.length < 12 || prompt.length > 2000) return error(res, 400, 'Enter a Marketing request between 12 and 2,000 characters.');
      let reviewed = null, selectedCreative = null;
      if (body.reviewed_selection) {
        if (!body.idempotency_key || !body.correlation_id) return error(res,400,'A stable campaign request ID is required.');
        const previous = await findTask(workspaceId, body.correlation_id);
        if (previous) {
          if (previous.idempotency_key !== body.idempotency_key) return error(res,409,'This request ID belongs to another campaign.');
          return json(res,202,{status:'accepted',correlation_id:previous.correlation_id,step:previous.status});
        }
        const resources = await campaignResources(workspaceId, access, body);
        if (resources.warnings.some(value => value.startsWith('CRM audience'))) return error(res,503,resources.warnings[0]);
        const selection = campaignWorkspace.selectAudience(resources, body.reviewed_selection.audience_ids, resources.brief.requested_count);
        if (!resources.brief.channels.length || !resources.brief.audience || !resources.brief.geography || resources.brief.requested_count === null) return error(res,422,'Review audience, geography, count and channels before drafting.');
        const assetIds = body.reviewed_selection.asset_ids;
        if (!Array.isArray(assetIds) || new Set(assetIds).size !== assetIds.length) return error(res,400,'Choose distinct saved creative versions.');
        const assets = assetIds.map(id => resources.assets.find(asset => asset.id === id));
        if (assets.some(asset => !asset)) return error(res,409,'A saved creative version is unavailable. Refresh the review.');
        const assetChannels=assets.map(asset=>asset.metadata.channel||'Creative');
        if(new Set(assetChannels).size!==assetChannels.length||assets.some(asset=>asset.metadata.channel&&!resources.brief.channels.includes(asset.metadata.channel)))return error(res,422,'Select one saved creative version per requested channel.');
        const emailAsset = assets.find(asset => asset.metadata.channel === 'Email');
        if (emailAsset) selectedCreative = await loadEmailCreative(workspaceId,emailAsset.metadata.poster_id,emailAsset.metadata.version);
        reviewed = { ...selection, brief:resources.brief, context:resources.context,
          content_drafts:Array.isArray(body.content_drafts)?body.content_drafts.slice(0,7).filter(item=>resources.brief.channels.includes(item.channel)&&typeof item.body==='string').map(item=>({channel:item.channel,body:item.body.slice(0,5500),subject:String(item.subject||'').slice(0,150),preview_text:String(item.preview_text||'').slice(0,120)})):[],
          artifact_refs:[...resources.artifact_refs,...assets],
          creative_briefs: Array.isArray(body.creative_briefs) ? body.creative_briefs.slice(0,10).map(item => ({channel:resources.brief.channels.includes(item.channel)?item.channel:'',format:String(item.format||'copy').slice(0,30),prompt:String(item.prompt||'').slice(0,2000)})).filter(item=>item.channel) : [] };
      }
      const savedCreative=selectedCreative || (body.poster_id?await loadEmailCreative(workspaceId,body.poster_id,Number(body.poster_version)):null);
      const context=reviewed?.context || showcaseContext(body, access) || await workspaceContext(workspaceId,access.membership);
      const envelope = createHandoverEnvelope({
        workspace_id: workspaceId,
        correlation_id: body.correlation_id,
        parent_task_id: body.parent_task_id || null,
        origin_module: body.origin_module === 'overview' ? 'overview' : 'marketing',
        target_engine: 'marketing',
        idempotency_key: body.idempotency_key,
        artifact_refs: reviewed?.artifact_refs || [],
        payload: {
          prompt,
          campaign_brief:reviewed?.brief,
          creative_briefs:reviewed?.creative_briefs,
          workspace_context:context,
          project: access.membership.project_slug || '',
          business_name: access.membership.name || 'Authorized Matrix 360 Workspace',
          profile_type: access.membership.profile_type || access.membership.market_model || ''
        }
      });

      const task = await dispatchMarketingTask(envelope, {
        reviewedSelection:reviewed,
        budget: body.budget,
        emailCreative:savedCreative?.creative,
        // Finish preparation before a serverless response can freeze this invocation.
        waitForDraft:true,
        skip_ai:Boolean(savedCreative),
        authToken: access.bearer,
        keylessTestMode: access.showcase || process.env.M360_KEYLESS_TEST_MODE === 'true' && body.test_data === true,
        audienceFixture: access.showcase ? normalizedAudience(body.showcase_audience, true) : Array.isArray(body.test_audience) ? body.test_audience : undefined,
        creativePlan: savedCreative?{verified_content_task_id:savedCreative.creative.poster_id,subject:savedCreative.creative.headline,caption:savedCreative.creative.caption,headlines:[savedCreative.creative.headline],cta:'Contact our team for details.'}:body.test_data === true && body.test_content && typeof body.test_content === 'object'
          ? { ...body.test_content, test_data: true }
          : undefined,
        startDate: body.start_date,
        timezone: body.timezone
      });

      return json(res, 202, {
        status: 'accepted',
        correlation_id: task.correlation_id,
        envelope_id: task.envelope_id,
        step: task.status,
        message: 'Marketing task initiated successfully.'
      });
    }

    if (action === 'coordination' && method === 'POST') {
      const corrId = String(body.correlation_id || '').trim(), operation = String(body.operation || '').trim();
      if (!corrId || !['audience', 'content', 'overview', 'full'].includes(operation)) return error(res, 400, 'correlation_id and a supported coordination operation are required.');
      const task = await findTask(workspaceId, corrId);
      if (!task) return error(res, 404, 'Marketing task not found.');
      const result = { operation, audience: null, content: null, overview: null };
      if (operation === 'audience' || operation === 'full') {
        const contacts = access.showcase ? normalizedAudience(body.showcase_audience, true) : await crmAudience(workspaceId, access.bearer);
        attachVerifiedHandoff(workspaceId, corrId, { verified: true, origin_module: 'leads', task_id: access.showcase ? 'showcase-browser-pipeline' : 'authorized-crm-pipeline', artifact_id: randomUUID(), test_data: access.showcase, contacts });
        result.audience = { status: 'completed', source: access.showcase ? 'isolated_showcase_pipeline' : 'authorized_crm_pipeline', count: contacts.length, outbound_blocked: access.showcase };
      }
      if (operation === 'content' || operation === 'full') {
        if(body.poster_id){
          const selected=await loadEmailCreative(workspaceId,body.poster_id,Number(body.poster_version));
          attachEmailCreative(workspaceId,corrId,selected.creative,{includeCaption:body.email_poster_only!==true});
        }
        const content = access.showcase ? { status: 'completed', assets: [] } : await loadSavedContentAssets(workspaceId);
        attachVerifiedHandoff(workspaceId, corrId, { verified: true, origin_module: 'content', task_id: access.showcase ? 'showcase-local-strategy' : 'content-studio-library', artifact_id: randomUUID(), test_data: access.showcase, artifact_refs: content.assets || [] });
        result.content = { status: content.status, asset_count: content.assets?.length || 0, strategy_status: 'text_campaign_ready', code: content.code || null };
      }
      if (operation === 'overview' || operation === 'full') result.overview = broadcastTaskTelemetry(workspaceId, corrId);
      await durableStore.saveTask(getMarketingTask(workspaceId, corrId));
      return json(res, 200, { status: 'completed', ...result, task: getMarketingTask(workspaceId, corrId) });
    }

    // 4. Surgical Per-Channel Revision
    if (action === 'revise' && method === 'POST') {
      const corrId = String(body.correlation_id || query.correlation_id || '').trim();
      const revisionPrompt = String(body.revision_prompt || body.prompt || body.instruction || '').trim();
      const edit=body.manual_edit;
      const manual=edit&&typeof edit.body==='string'&&typeof edit.subject==='string'&&typeof edit.preview_text==='string'&&typeof body.version_hash==='string'
        ?{body:edit.body.trim(),subject:edit.subject.trim(),previewText:edit.preview_text.trim(),versionHash:body.version_hash}:null;
      if (!corrId || (edit&&!manual) || (!revisionPrompt&&!manual)) {
        return error(res, 400, 'Choose a campaign and provide a rewrite request or a complete draft edit.');
      }

      const result = await reviseMarketingTaskDraft(workspaceId, corrId, revisionPrompt, { channel: String(body.channel || '').trim(), manual });
      await durableStore.saveTask(getMarketingTask(workspaceId, corrId));
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

      if(!await findTask(workspaceId,corrId))return error(res,404,'Campaign not found.');
      const updatedReadiness = approveChannelDraft(workspaceId, corrId, channel, versionHash, { role: access.membership.role, id: access.membership.user_id || access.membership.member_id || 'unknown' });
      await durableStore.saveTask(getMarketingTask(workspaceId, corrId));
      return json(res, 200, { status: 'ok', channel, readiness: updatedReadiness });
    }

    // 6. Reverse Handoff from Leads or Content Creation
    if (action === 'handoff' && method === 'POST') {
      const corrId = String(body.correlation_id || '').trim();
      const origin = String(body.origin_module || '').trim();
      const fixtureAllowed = process.env.M360_KEYLESS_TEST_MODE === 'true' && body.test_data === true;
      if (!fixtureAllowed) {
        return json(res, 501, { status: 'blocked', code: 'VERIFIED_ENGINE_HANDOFF_REQUIRED', message: 'The owning Leads or Content service must verify this handoff. Browser-supplied contacts or asset references are not accepted.' });
      }
      if (!corrId || !['leads', 'content'].includes(origin)) return error(res, 400, 'correlation_id and a valid origin_module are required');
      const task = attachVerifiedHandoff(workspaceId, corrId, {
        verified: true, origin_module: origin, test_data: true,
        task_id: String(body.task_id || 'isolated-keyless-fixture'),
        artifact_id: String(body.artifact_id || `test_${randomUUID()}`),
        contacts: Array.isArray(body.contacts) ? body.contacts : []
      });
      await durableStore.saveTask(task);
      return json(res, 200, { status: 'mock_test_handoff_attached', correlation_id: task.correlation_id, test_data: true, outbound_blocked: true });
    }

    if (action === 'csv-preview' && method === 'POST') {
      if (!access.showcase && process.env.M360_KEYLESS_TEST_MODE !== 'true') return json(res, 403, { status: 'blocked', code: 'TEST_IMPORT_MODE_DISABLED', message: 'CSV preview is restricted to the isolated keyless test mode.' });
      const result = importCsv(String(body.csv || ''), { workspaceId, testData: true });
      return json(res, 200, { status: 'validated_test_fixture', ...result });
    }

    if (action === 'csv-import' && method === 'POST') {
      const batch = importCsv(String(body.csv || ''), { workspaceId, testData: false });
      if (access.showcase) return json(res, 400, { status: 'error', error: 'Showcase CSV imports are stored in the browser and must not enter the production CRM.' });
      const result = await importIntoCrm(batch, access.bearer);
      if (result.status !== 'completed') return json(res, result.status === 'blocked' ? 503 : 502, result);
      return json(res, 201, { status: 'completed', import_batch_id: result.import_batch_id, input_count: batch.input_count, accepted_count: result.accepted_count, rejected_count: result.rejected_count, errors: result.errors || [], contact_fields_persisted: result.contact_fields_persisted !== false, warning: result.warning || null });
    }

    if (action === 'calendar' && ['POST', 'PATCH', 'DELETE'].includes(method)) {
      const corrId = String(body.correlation_id || query.correlation_id || '').trim();
      if (!corrId) return error(res, 400, 'correlation_id is required');
      const operation = method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'remove';
      const result = mutateCampaignCalendar(workspaceId, corrId, operation, body);
      await durableStore.saveTask(getMarketingTask(workspaceId, corrId));
      return json(res, 200, { status: 'ok', operation, ...result });
    }

    if (action === 'journeys' && ['POST', 'PATCH', 'DELETE'].includes(method)) {
      const corrId = String(body.correlation_id || query.correlation_id || '').trim();
      if (!corrId) return error(res, 400, 'correlation_id is required');
      const operation = method === 'POST' ? 'create' : method === 'PATCH' ? 'update' : 'remove';
      const result = mutateCampaignJourney(workspaceId, corrId, operation, body);
      await durableStore.saveTask(getMarketingTask(workspaceId, corrId));
      return json(res, 200, { status: 'ok', operation, ...result });
    }

    // 7. Execute / Launch Campaign Channel (Enforces All 3 Gates)
    if (action === 'execute' && method === 'POST') {
      const corrId = String(body.correlation_id || query.correlation_id || '').trim();
      const channel = String(body.channel || '').trim();
      if (!corrId || !channel) {
        return error(res, 400, 'correlation_id and channel are required');
      }

      try {
        const testRecipient=String(body.test_recipient||'').trim();
        const controlledTest=body.controlled_test===true;
        const validRecipient=testRecipient.length<=254&&/^[^\s@<>,;:"\\\[\]()]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(testRecipient);
        if(body.recipient||body.email||(testRecipient&&!controlledTest)||(controlledTest&&
          (channel!=='Email'||body.mode!=='live'||!validRecipient))){
          return error(res,400,'Use the single-email action with a valid recipient address.');
        }

        if(body.mode==='live'&&process.env.M360_MARKETING_CONTROLLED_TEST_ONLY==='true'&&(!controlledTest||workspaceId!==process.env.M360_MARKETING_TEST_WORKSPACE))
          return error(res,403,'This preview permits only an allowlisted test email.');
        if(body.mode==='live'&&process.env.MARKETING_LIVE_SEND_ENABLED!=='true')
          return json(res,412,{status:'blocked',code:'LIVE_SEND_BLOCKED',error:'Sending is disabled. Drafts and paid creative generation remain available.'});
        if(!await findTask(workspaceId,corrId))return error(res,404,'Campaign not found.');
        const result = await executeMarketingChannel(workspaceId, corrId, channel, {
          mode: body.mode,
          operatorApproved: body.operator_approved === true,
          approvalPhrase: String(body.approval_phrase || ''),
          versionHash: String(body.version_hash || ''),
          request_id: randomUUID(),
          actor_id: access.membership?.user_id || access.membership?.member_id || access.membership?.id || null,
          actor_role: access.membership?.role,
          testRecipient,
          privateRecipient:access.privateEmail===true
        });
        await durableStore.saveTask(getMarketingTask(workspaceId, corrId));
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
