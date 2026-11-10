'use strict';

const DEFAULT_DB = 'https://pmlacujsnnvbrimxbhpu.supabase.co';
const enabled = () => process.env.M360_MARKETING_DURABLE_ENABLED === 'true';
const config = () => ({ url: String(process.env.M360_MARKETING_SUPABASE_URL || DEFAULT_DB).replace(/\/$/, ''), key: process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY || '' });

function headers(prefer = '') {
  const { key } = config();
  if (key.length < 30) throw Object.assign(new Error('Marketing durable-store credential is missing.'), { code: 'DURABLE_STORE_CREDENTIAL_MISSING' });
  return { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }), Accept: 'application/json', ...(prefer ? { Prefer: prefer } : {}) };
}

async function request(path, options = {}) {
  const response = await fetch(config().url + '/rest/v1/' + path, { ...options, headers: { ...headers(options.prefer), ...(options.headers || {}) }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) }).catch(() => null);
  if (!response) throw Object.assign(new Error('Marketing durable store is unavailable.'), { code: 'DURABLE_STORE_UNAVAILABLE' });
  if (!response.ok) {
    const code = response.status === 401 || response.status === 403 ? 'DURABLE_STORE_AUTH_REJECTED' : response.status === 404 ? 'DURABLE_STORE_SCHEMA_UNAVAILABLE' : 'DURABLE_STORE_WRITE_FAILED';
    throw Object.assign(new Error('Marketing durable store rejected the operation.'), { code, status: response.status });
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

async function readiness() {
  if (!enabled()) return { enabled: false, status: 'disabled', durable: false };
  try {
    await request('marketing_campaigns?select=workspace_id&limit=0');
    await request('campaign_calendar_events?select=workspace_id&limit=0');
    return { enabled: true, status: 'verified_ready', durable: true };
  } catch (error) {
    return { enabled: true, status: error.code || 'unavailable', durable: false };
  }
}

async function saveTask(task) {
  if (!enabled()) return { status: 'disabled', durable: false };
  const row = {
    workspace_id: task.workspace_id, correlation_id: task.correlation_id,
    idempotency_key: task.idempotency_key || `idemp_${task.correlation_id}`,
    objective: task.prompt, status: task.status, context: task,
    version: Number.isInteger(task.storage_version) ? task.storage_version + 1 : 1,
    updated_at: new Date().toISOString()
  };
  await request('marketing_campaigns?on_conflict=workspace_id,correlation_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row) });
  await request('marketing_tasks?on_conflict=workspace_id,idempotency_key', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace_id: task.workspace_id, correlation_id: task.correlation_id, parent_task_id: task.parent_task_id, task_type: 'prepare_campaign', status: task.status, idempotency_key: task.idempotency_key, input: { prompt: task.prompt }, result: task, version: row.version, updated_at: row.updated_at }) });
  if (task.handover_envelope) {
    const envelope = task.handover_envelope;
    await request('handover_envelopes?on_conflict=workspace_id,idempotency_key', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ envelope_id: envelope.envelope_id, workspace_id: envelope.workspace_id, correlation_id: envelope.correlation_id, schema_version: envelope.schema_version, origin_module: envelope.origin_module, target_engine: envelope.target_engine, status: envelope.status, payload: envelope.payload || {}, artifact_refs: envelope.artifact_refs || [], idempotency_key: envelope.idempotency_key, created_at: envelope.created_at, updated_at: envelope.updated_at }) });
  }
  await replaceTaskEvents(task);
  await saveNormalizedArtifacts(task);
  await replaceCalendar(task);
  task.storage_version = row.version;
  task.persistence = { status: 'verified_durable_store', durable: true, saved_at: row.updated_at };
  return task.persistence;
}

async function saveNormalizedArtifacts(task) {
  const snapshot = task.audience_snapshot;
  if (snapshot?.snapshot_id) await request('audience_snapshots?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: snapshot.snapshot_id, workspace_id: task.workspace_id, correlation_id: task.correlation_id, source_task_id: snapshot.source_task_id || null, source_type: snapshot.source || 'unknown', requested_count: snapshot.requested_count || snapshot.total_count || 0, discovered_count: snapshot.discovered_count || snapshot.total_count || 0, eligible_count: snapshot.eligible_count || 0, lead_ids: (snapshot.contacts || []).map(contact => contact.id).filter(Boolean), policy_version: snapshot.policy_version || 'm360-audience-v1', test_data: Boolean(snapshot.test_data), captured_at: snapshot.received_at || new Date().toISOString() }) });
  const refs = (task.artifact_refs || []).filter(ref => ref?.id).map(ref => ({ workspace_id: task.workspace_id, correlation_id: task.correlation_id, artifact_type: ref.kind || 'artifact', artifact_id: String(ref.id), source_task_id: ref.source_task_id || null, approval_state: ref.approval_state || (ref.test_data ? 'test_fixture' : 'referenced'), test_data: Boolean(ref.test_data) }));
  if (refs.length) await request('campaign_artifact_refs?on_conflict=workspace_id,correlation_id,artifact_type,artifact_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(refs) });
  const drafts = [];
  for (const [channel, entry] of Object.entries(task.channel_draft_versions || {})) for (const version of entry.versions || []) drafts.push({ id: version.version_id, workspace_id: task.workspace_id, correlation_id: task.correlation_id, channel, version: version.version, parent_version_id: version.parent_version_id || null, subject: version.subject || '', body: version.body, structured_fields: { format: version.format || 'draft', asset_refs: version.asset_refs || [], email_creative: version.email_creative || null }, content_hash: version.version_hash, status: version.status, author_type: version.ai_generated ? 'ai' : 'deterministic', actor_id: version.actor_id || null, provenance: { model: task.ai_telemetry?.model || 'deterministic_engine' }, created_at: version.created_at });
  if (drafts.length) await request('channel_draft_versions?on_conflict=workspace_id,correlation_id,channel,version', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(drafts) });
  const approvals = (task.approval_history || []).filter(item => item.draft_version_id).map(item => ({ id: item.approval_id, workspace_id: task.workspace_id, draft_version_id: item.draft_version_id, content_hash: item.version_hash, actor_id: item.actor_id, actor_role: item.actor_role, approved_at: item.approved_at }));
  if (approvals.length) await request('channel_approvals?on_conflict=workspace_id,draft_version_id,content_hash', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(approvals) });
  const executions = (task.execution_history || []).filter(item => item.draft_version_id).map(item => ({ id: item.execution_id, workspace_id: task.workspace_id, correlation_id: task.correlation_id, channel: item.channel, draft_version_id: item.draft_version_id, audience_snapshot_id: snapshot?.snapshot_id || null, idempotency_key: item.idempotency_key, status: item.status, provider_ack_id: item.provider_message_ids?.[0] || null, policy_version: item.policy_version, created_at: item.created_at }));
  if (executions.length) await request('campaign_executions?on_conflict=workspace_id,idempotency_key', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(executions) });
  const journeys = (task.journey_rules || []).map(rule => ({ id: rule.rule_id, workspace_id: task.workspace_id, correlation_id: task.correlation_id, name: rule.name, trigger_event: rule.trigger_event, action: rule.action, delay_hours: rule.delay_hours, max_executions: rule.max_executions, execution_count: rule.execution_count, stop_on_reply: rule.stop_on_reply, status: rule.status, created_at: rule.created_at, updated_at: rule.updated_at }));
  if (journeys.length) await request('campaign_journey_rules?on_conflict=workspace_id,correlation_id,name', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(journeys) });
}

async function replaceTaskEvents(task) {
  const rows = (task.step_history || []).map(event => ({ workspace_id: task.workspace_id, correlation_id: task.correlation_id, sequence: event.sequence, event_type: event.step, detail: { message: event.detail }, created_at: event.timestamp }));
  if (rows.length) await request('marketing_task_events?on_conflict=workspace_id,correlation_id,sequence', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rows) });
}

async function replaceCalendar(task) {
  const existing = await request(`campaign_calendar_events?workspace_id=eq.${encodeURIComponent(task.workspace_id)}&correlation_id=eq.${encodeURIComponent(task.correlation_id)}&select=id`);
  const keep = new Set((task.calendar_events || []).map(event => event.event_id));
  for (const row of existing || []) if (!keep.has(row.id)) await request(`campaign_calendar_events?id=eq.${encodeURIComponent(row.id)}&workspace_id=eq.${encodeURIComponent(task.workspace_id)}`, { method: 'DELETE', prefer: 'return=minimal' });
  const rows = (task.calendar_events || []).map(event => ({ id: event.event_id, workspace_id: task.workspace_id, correlation_id: task.correlation_id, title: event.title, channel: event.channel, scheduled_for: event.scheduled_for, timezone: event.timezone, status: event.status, draft_version_id: null, updated_at: event.updated_at }));
  if (rows.length) await request('campaign_calendar_events?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rows) });
}

async function loadTask(workspaceId, correlationId) {
  if (!enabled()) return null;
  const rows = await request(`marketing_campaigns?workspace_id=eq.${encodeURIComponent(workspaceId)}&correlation_id=eq.${encodeURIComponent(correlationId)}&select=context&limit=1`);
  return rows?.[0]?.context || null;
}

async function loadTaskByIdempotency(workspaceId, idempotencyKey) {
  if (!enabled()) return null;
  const rows = await request(`marketing_campaigns?workspace_id=eq.${encodeURIComponent(workspaceId)}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=context&limit=1`);
  return rows?.[0]?.context || null;
}

async function listTasks(workspaceId) {
  if (!enabled()) return [];
  const rows = await request(`marketing_campaigns?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=context&order=updated_at.desc&limit=100`);
  return (rows || []).map(row => row.context).filter(Boolean);
}

async function loadTaskEvents(workspaceId, correlationId, afterSequence = 0) {
  if (!enabled()) return null;
  return request(`marketing_task_events?workspace_id=eq.${encodeURIComponent(workspaceId)}&correlation_id=eq.${encodeURIComponent(correlationId)}&sequence=gt.${Math.max(0, Number(afterSequence) || 0)}&select=sequence,event_type,detail,created_at&order=sequence.asc`);
}

async function saveConversation(conversation) {
  if (!enabled()) return { status: 'disabled', durable: false };
  await request('marketing_conversations?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: conversation.conversation_id, workspace_id: conversation.workspace_id, correlation_id: conversation.correlation_id, parent_task_id: conversation.parent_task_id, status: conversation.status, execution_mode: conversation.execution_mode, created_at: conversation.created_at, updated_at: conversation.updated_at }) });
  const messages = conversation.messages.map(message => ({ id: message.message_id, conversation_id: conversation.conversation_id, workspace_id: conversation.workspace_id, role: message.role, content: message.content, sequence: message.sequence, created_at: message.created_at }));
  if (messages.length) await request('marketing_conversation_messages?on_conflict=conversation_id,sequence', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(messages) });
  return { status: 'verified_durable_store', durable: true };
}

async function loadConversation(workspaceId, conversationId) {
  if (!enabled()) return null;
  const rows = await request(`marketing_conversations?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(conversationId)}&select=*&limit=1`);
  if (!rows?.[0]) return null;
  const messages = await request(`marketing_conversation_messages?workspace_id=eq.${encodeURIComponent(workspaceId)}&conversation_id=eq.${encodeURIComponent(conversationId)}&select=id,role,content,sequence,created_at&order=sequence.asc`);
  const row = rows[0];
  return { schema_version: '1.0', conversation_id: row.id, correlation_id: row.correlation_id, parent_task_id: row.parent_task_id, workspace_id: row.workspace_id, status: row.status, execution_mode: row.execution_mode, messages: (messages || []).map(message => ({ message_id: message.id, role: message.role, content: message.content, sequence: message.sequence, created_at: message.created_at })), created_at: row.created_at, updated_at: row.updated_at };
}

async function recordBrevoEvent(payload) {
  if (!enabled()) throw Object.assign(new Error('Durable provider event storage is disabled.'), { code: 'DURABLE_STORE_REQUIRED' });
  const messageId = String(payload?.['message-id'] || '').trim(), eventType = String(payload?.event || '').trim();
  if (!messageId || !eventType) throw Object.assign(new Error('Brevo webhook payload is missing its message identifier or event.'), { code: 'INVALID_PROVIDER_EVENT' });
  const executions = await request(`campaign_executions?provider_ack_id=eq.${encodeURIComponent(messageId)}&select=id,workspace_id,correlation_id&limit=1`);
  if (!executions?.[0]) throw Object.assign(new Error('Provider event does not match a stored execution.'), { code: 'EXECUTION_NOT_FOUND' });
  const execution = executions[0], providerEventId = String(payload.id || `${messageId}:${eventType}:${payload.ts_event || payload.ts || ''}`);
  await request('provider_delivery_events?on_conflict=workspace_id,provider_event_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace_id: execution.workspace_id, execution_id: execution.id, provider_event_id: providerEventId, event_type: eventType, verified: true, occurred_at: new Date(Number(payload.ts_event || payload.ts || Date.now() / 1000) * 1000).toISOString(), payload: { message_id: messageId, event: eventType, tags: payload.tags || [] } }) });
  return { execution_id: execution.id, workspace_id: execution.workspace_id, correlation_id: execution.correlation_id, provider_event_id: providerEventId, event_type: eventType };
}

async function loadVerifiedDeliveryEvents(workspaceId,correlationId){
  if(!enabled())return [];
  const filter='workspace_id=eq.'+encodeURIComponent(workspaceId);
  const executions=await request('campaign_executions?'+filter+'&correlation_id=eq.'+encodeURIComponent(correlationId)+'&select=id&order=created_at.desc&limit=200');
  const ids=(executions||[]).map(row=>row.id).filter(id=>/^[0-9a-f-]{36}$/i.test(id));
  const events=[];
  for(let offset=0;offset<ids.length;offset+=40){
    const group=ids.slice(offset,offset+40).join(',');
    const rows=await request('provider_delivery_events?'+filter+'&execution_id=in.('+group+')&verified=eq.true&select=event_type,occurred_at&order=occurred_at.desc&limit=100');
    events.push(...(rows||[]));
  }
  return events.sort((a,b)=>Date.parse(b.occurred_at)-Date.parse(a.occurred_at)).slice(0,100);
}

module.exports = { loadVerifiedDeliveryEvents, enabled, readiness, saveTask, loadTask, loadTaskByIdempotency, listTasks, loadTaskEvents, saveConversation, loadConversation, recordBrevoEvent };
