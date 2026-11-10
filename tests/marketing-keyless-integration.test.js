'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { importCsv } = require('../lib/m360-csv-import');
const { buildCampaignCalendar, campaignCalendarSummary } = require('../lib/m360-marketing-calendar');
const orchestrator = require('../lib/m360-marketing-orchestrator');
const durableStore = require('../lib/m360-marketing-durable-store');
const { createBrevoAdapter, createBrevoSmtpAdapter, createWhatsAppAdapter, createMetaAdapter, createLinkedInAdapter } = require('../lib/m360-provider-adapters');
const { requestSpecialistTask } = require('../lib/m360-specialist-clients');
const { importIntoCrm } = require('../lib/m360-crm-import-client');
const { loadSavedContentAssets } = require('../lib/m360-content-assets-client');

test.beforeEach(() => orchestrator.resetTaskStoreForTests());

test('CSV import preserves leading zeroes, rejects duplicates, and blocks synthetic outbound', () => {
  const csv = [
    'name,company,email,phone,source,consent_email',
    'Test One,Example A,one@example.invalid,0012345678,synthetic_fixture,no',
    'Duplicate,Example A,one@example.invalid,0099999999,synthetic_fixture,no',
    'Test Two,Example B,two@example.invalid,0000000002,synthetic_fixture,no'
  ].join('\n');
  const result = importCsv(csv, { workspaceId: 'workspace-a', testData: true });
  assert.equal(result.accepted_count, 2);
  assert.equal(result.rejected_count, 1);
  assert.equal(result.records[0].phone, '0012345678');
  assert.ok(result.records.every(row => row.test_data && row.outbound_blocked));
  assert.equal(result.external_sending_blocked, true);
});

test('keyless Overview-to-Marketing preparation assembles ten drafts, dated calendar and reviewable approval', async () => {
  const fixture = importCsv('name,company,email,phone\nSynthetic Person,Example Test,test@example.invalid,0012345678', { workspaceId: 'workspace-a', testData: true });
  const envelope = orchestrator.createHandoverEnvelope({
    workspace_id: 'workspace-a', origin_module: 'overview', target_engine: 'marketing',
    payload: { prompt: 'I want to launch a marketing campaign for our approved service', business_name: 'Example Test Business', workspace_context: { profile: { industry: 'Industrial land development', products_services: ['Industrial plots'], approved_claims: [] } } }
  });
  const task = await orchestrator.dispatchMarketingTask(envelope, {
    keylessTestMode: true,
    audienceFixture: fixture.records,
    creativePlan: { test_data: true, subject: 'Approved service campaign', caption: 'Review this factual draft.', headlines: ['Approved service'], cta: 'Request information' },
    startDate: '2026-11-03T03:30:00.000Z', timezone: 'Asia/Kolkata', skip_ai: true
  });
  for (let i = 0; i < 20 && task.status !== 'draft_ready'; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(task.status, 'draft_ready');
  assert.equal(task.affinity_strategy.profile_type, 'b2b_industrial');
  assert.equal(task.audience_snapshot.source, 'isolated_synthetic_test_fixture');
  assert.equal(Object.keys(task.channel_draft_versions).length, 10);
  assert.equal(task.calendar_events.length, 10);
  assert.equal(task.calendar_events[0].scheduled_for, '2026-11-03T03:30:00.000Z');
  const whatsapp = task.channel_draft_versions.WhatsApp.versions.at(-1);
  orchestrator.approveChannelDraft('workspace-a', task.correlation_id, 'WhatsApp', whatsapp.version_hash, 'marketing_operator');
  assert.equal(task.channel_draft_versions.WhatsApp.versions.at(-1).status, 'approved');
  await assert.rejects(() => orchestrator.executeMarketingChannel('workspace-a', task.correlation_id, 'WhatsApp'), /No eligible contacts/);
});

test('calendar uses real ISO dates and never claims dispatch', () => {
  const tree = { Email: { versions: [{ version: 1, status: 'approved', version_hash: 'abc' }] }, LinkedIn: { versions: [{ version: 1, status: 'draft_for_review', version_hash: 'def' }] } };
  const events = buildCampaignCalendar(tree, { startDate: '2026-11-01T00:00:00.000Z', timezone: 'Asia/Kolkata' });
  assert.deepEqual(events.map(event => event.channel), ['Email', 'LinkedIn']);
  assert.ok(events.every(event => event.dispatched === false && event.scheduled_for.startsWith('2026-11-')));
  assert.ok(events.every(event => /^[0-9a-f-]{36}$/.test(event.event_id)));
  const summary = campaignCalendarSummary([{ ...events[0], status: 'pending_approval', scheduled_for: '2026-10-01T00:00:00.000Z' }], new Date('2026-11-01T12:00:00.000Z'));
  assert.equal(summary.past_count, 1);
  assert.equal(summary.completed_count, 0);
});

test('campaign calendar events can be added, updated and removed without changing task lifecycle', async () => {
  const envelope = orchestrator.createHandoverEnvelope({ workspace_id: 'workspace-a', payload: { prompt: 'Prepare a campaign for approved services', business_name: 'Example', profile_type: 'b2b_industrial', project: 'service' } });
  const task = await orchestrator.dispatchMarketingTask(envelope, { skip_ai: true });
  for (let i = 0; i < 20 && task.status !== 'draft_ready'; i++) await new Promise(resolve => setTimeout(resolve, 5));
  const lifecycle = task.status;
  const created = orchestrator.mutateCampaignCalendar('workspace-a', task.correlation_id, 'create', { title: 'Launch email', channel: 'Email', scheduled_for: '2026-11-20T03:30:00.000Z', timezone: 'Asia/Kolkata', status: 'scheduled' });
  assert.equal(created.event.title, 'Launch email'); assert.equal(task.status, lifecycle);
  const updated = orchestrator.mutateCampaignCalendar('workspace-a', task.correlation_id, 'update', { event_id: created.event.event_id, title: 'Updated launch email', status: 'completed' });
  assert.equal(updated.event.status, 'completed');
  const removed = orchestrator.mutateCampaignCalendar('workspace-a', task.correlation_id, 'remove', { event_id: created.event.event_id });
  assert.equal(removed.event.event_id, created.event.event_id); assert.equal(task.status, lifecycle);
});

test('journey rules are bounded drafts and never imply provider execution', async () => {
  const envelope = orchestrator.createHandoverEnvelope({ workspace_id: 'workspace-a', payload: { prompt: 'Prepare journey campaign for approved service' } });
  const task = await orchestrator.dispatchMarketingTask(envelope, { skip_ai: true });
  for (let i = 0; i < 20 && task.status !== 'draft_ready'; i++) await new Promise(resolve => setTimeout(resolve, 5));
  const created = orchestrator.mutateCampaignJourney('workspace-a', task.correlation_id, 'create', { name: 'Notify on reply', trigger_event: 'lead_replied', action: 'notify_owner', delay_hours: 0, max_executions: 1, status: 'draft' });
  assert.equal(created.rule.execution_count, 0);
  assert.equal(created.rule.status, 'draft');
  assert.throws(() => orchestrator.mutateCampaignJourney('workspace-a', task.correlation_id, 'create', { name: 'Invalid blast', trigger_event: 'timer', action: 'send_email', delay_hours: 0 }), /supported journey/);
  const removed = orchestrator.mutateCampaignJourney('workspace-a', task.correlation_id, 'remove', { rule_id: created.rule.rule_id });
  assert.equal(removed.rules.length, 0);
});

test('Marketing UI renders an accessible navigable month grid without static Day labels', () => {
  const source = fs.readFileSync(path.join(__dirname, '../lib/m360-marketing-client.browser.js'), 'utf8');
  assert.match(source, /id="m360-calendar-grid" role="grid"/);
  assert.match(source, /id="m360-calendar-prev"/);
  assert.match(source, /id="m360-calendar-next"/);
  assert.match(source, /todayStyle/);
  assert.match(source, /border-radius:50%/);
  assert.match(source, /saveCalendarEvent/);
  assert.match(source, /removeCalendarEvent/);
  assert.doesNotMatch(source, />Day 1</);
});

test('durable store readiness is disabled by default and sanitizes credential failures', async () => {
  const previousEnabled = process.env.M360_MARKETING_DURABLE_ENABLED;
  const previousKey = process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY;
  const previousFetch = global.fetch;
  try {
    delete process.env.M360_MARKETING_DURABLE_ENABLED;
    assert.deepEqual(await durableStore.readiness(), { enabled: false, status: 'disabled', durable: false });
    process.env.M360_MARKETING_DURABLE_ENABLED = 'true';
    process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY = 'sb_secret_test_value_long_enough_for_validation';
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: 'secret detail' }) });
    assert.deepEqual(await durableStore.readiness(), { enabled: true, status: 'DURABLE_STORE_AUTH_REJECTED', durable: false });
  } finally {
    if (previousEnabled === undefined) delete process.env.M360_MARKETING_DURABLE_ENABLED; else process.env.M360_MARKETING_DURABLE_ENABLED = previousEnabled;
    if (previousKey === undefined) delete process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY; else process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY = previousKey;
    global.fetch = previousFetch;
  }
});

test('durable store upserts a campaign and its editable calendar with mocked responses', async () => {
  const previousEnabled = process.env.M360_MARKETING_DURABLE_ENABLED;
  const previousKey = process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY;
  const previousFetch = global.fetch;
  const calls = [];
  try {
    process.env.M360_MARKETING_DURABLE_ENABLED = 'true';
    process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY = 'sb_secret_test_value_long_enough_for_validation';
    global.fetch = async (url, options = {}) => {
      calls.push({ url, options });
      return options.method === 'POST' ? { ok: true, status: 204, json: async () => null } : { ok: true, status: 200, json: async () => [] };
    };
    const task = { workspace_id: 'workspace-a', correlation_id: '11111111-1111-4111-8111-111111111111', idempotency_key: 'test-idempotency', prompt: 'Prepare approved campaign', status: 'draft_ready', calendar_events: [{ event_id: '22222222-2222-4222-8222-222222222222', title: 'Email launch', channel: 'Email', scheduled_for: '2026-11-20T03:30:00.000Z', timezone: 'Asia/Kolkata', status: 'scheduled', updated_at: '2026-11-01T00:00:00.000Z' }] };
    const result = await durableStore.saveTask(task);
    assert.equal(result.durable, true);
    assert.ok(calls.some(call => call.url.includes('/marketing_campaigns?on_conflict=')));
    assert.ok(calls.some(call => call.url.includes('/marketing_tasks?on_conflict=')));
    const calendarWrite = calls.find(call => call.url.includes('/campaign_calendar_events?on_conflict='));
    assert.equal(JSON.parse(calendarWrite.options.body)[0].title, 'Email launch');
  } finally {
    if (previousEnabled === undefined) delete process.env.M360_MARKETING_DURABLE_ENABLED; else process.env.M360_MARKETING_DURABLE_ENABLED = previousEnabled;
    if (previousKey === undefined) delete process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY; else process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY = previousKey;
    global.fetch = previousFetch;
  }
});

test('specialist and CRM adapters use configured authenticated contracts and reject shape drift', async () => {
  const oldLeads = process.env.M360_LEADS_TASK_API_URL, oldSecret = process.env.MATRIX360_ENGINE_SERVICE_AUTH_SECRET, oldImport = process.env.M360_CRM_CSV_IMPORT_URL;
  try {
    process.env.M360_LEADS_TASK_API_URL = 'https://leads.example.invalid';
    process.env.MATRIX360_ENGINE_SERVICE_AUTH_SECRET = 'test-specialist-secret-that-is-long-enough';
    process.env.M360_CRM_CSV_IMPORT_URL = 'https://crm.example.invalid/import';
    const corr = '11111111-1111-4111-8111-111111111111';
    const specialist = await requestSpecialistTask('leads', { workspace_id: 'workspace-a', correlation_id: corr, objective: 'Find approved prospects' }, async (_url, options) => ({ ok: true, status: 202, json: async () => ({ schema_version: '1.0', task_id: 'lead-task-1', correlation_id: corr, workspace_id: 'workspace-a', task_type: 'audience_discovery', status: 'accepted', artifact_refs: [], signed: Boolean(options.headers['X-Matrix-Signature']) }) }));
    assert.equal(specialist.task_id, 'lead-task-1');
    const imported = await importIntoCrm({ import_batch_id: 'batch-1', workspace_id: 'workspace-a', records: [] }, 'Bearer authorized-test-token', async (_url, options) => ({ ok: true, status: 201, json: async () => ({ import_batch_id: 'batch-1', accepted_count: 0, rejected_count: 0, auth_forwarded: options.headers.Authorization.startsWith('Bearer ') }) }));
    assert.equal(imported.status, 'completed');
  } finally {
    if (oldLeads === undefined) delete process.env.M360_LEADS_TASK_API_URL; else process.env.M360_LEADS_TASK_API_URL = oldLeads;
    if (oldSecret === undefined) delete process.env.MATRIX360_ENGINE_SERVICE_AUTH_SECRET; else process.env.MATRIX360_ENGINE_SERVICE_AUTH_SECRET = oldSecret;
    if (oldImport === undefined) delete process.env.M360_CRM_CSV_IMPORT_URL; else process.env.M360_CRM_CSV_IMPORT_URL = oldImport;
  }
});

test('saved Content Studio versions become immutable Marketing asset references', async () => {
  const oldKey = process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY;
  try {
    process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY = 'sb_secret_test_value_long_enough_for_validation';
    const result = await loadSavedContentAssets('workspace-a', async url => ({ ok: true, json: async () => [{ poster_id: '11111111-1111-4111-8111-111111111111', version: 2, channel: 'Email', plan: { headline: 'Approved headline' }, created_at: '2026-11-01T00:00:00.000Z', requested_url: url }] }));
    assert.equal(result.status, 'completed');
    assert.deepEqual(result.assets[0], { id: '11111111-1111-4111-8111-111111111111:v2', kind: 'poster', approval_state: 'saved_content_studio_version', metadata: { poster_id: '11111111-1111-4111-8111-111111111111', version: 2, channel: 'Email', headline: 'Approved headline', created_at: '2026-11-01T00:00:00.000Z' } });
  } finally { if (oldKey === undefined) delete process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY; else process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY = oldKey; }
});

test('provider adapters use realistic mocked HTTP contracts and remain fail-closed for live calls', async () => {
  const calls = [];
  const mockFetch = async (url, options = {}) => {
    calls.push({ url, options });
    const payload = url.includes('/messages') ? { messages: [{ id: 'mock-wa-id' }] }
      : url.includes('/feed') ? { id: 'mock-meta-id' }
      : url.includes('/rest/posts') ? { id: 'mock-linkedin-id' }
      : url.includes('/smtp/email') ? { messageId: 'mock-email-id' }
      : { id: 'mock-account', tasks: ['CREATE_CONTENT'] };
    return { ok: true, status: 200, json: async () => payload };
  };
  const webhookSecret = 'mock-webhook-secret';
  const brevo = createBrevoAdapter({ apiKey: 'mock-key', senderEmail: 'sender@example.invalid', webhookSecret }, mockFetch);
  await assert.rejects(() => brevo.execute({}, { mode: 'live' }), error => error.code === 'LIVE_SEND_BLOCKED');
  const email = await brevo.execute({ to: [{ email: 'self@example.invalid' }] }, { mode: 'mock', idempotencyKey: 'idem-1' });
  assert.deepEqual({ mock: email.mock, accepted: email.accepted, id: email.provider_message_id }, { mock: true, accepted: true, id: 'mock-email-id' });
  const whatsapp = createWhatsAppAdapter({ accessToken: 'mock', phoneNumberId: '123', graphVersion: 'v99.0' }, mockFetch);
  await assert.rejects(() => whatsapp.execute({ template: { name: 'approved' } }, { mode: 'mock' }), error => error.code === 'WHATSAPP_TEMPLATE_OR_CONSENT_REQUIRED');
  assert.equal((await whatsapp.execute({ template: { name: 'approved' }, consent_verified: true }, { mode: 'mock' })).mock, true);
  assert.equal((await createMetaAdapter({ accessToken: 'mock', graphVersion: 'v99.0', destinationId: 'page' }, mockFetch).execute({ message: 'draft' }, { mode: 'mock' })).mock, true);
  assert.equal((await createLinkedInAdapter({ accessToken: 'mock', organizationUrn: 'urn:li:organization:1', apiVersion: '202610' }, mockFetch).execute({ author: 'urn:li:organization:1' }, { mode: 'mock' })).mock, true);
  assert.ok(calls.some(call => call.url === 'https://api.brevo.com/v3/smtp/email'));
  assert.ok(calls.some(call => call.url.includes('graph.facebook.com/v99.0/123/messages')));
  assert.ok(calls.some(call => call.url === 'https://api.linkedin.com/rest/posts'));
  const rawWebhook = Buffer.from(JSON.stringify({ id: 'mock-event-1', event: 'delivered' }));
  const signature = 'sha256=' + createHmac('sha256', webhookSecret).update(rawWebhook).digest('hex');
  assert.equal(brevo.handleWebhook(rawWebhook, signature).verified, true);
  assert.throws(() => brevo.handleWebhook(rawWebhook, 'sha256=bad'), error => error.code === 'INVALID_WEBHOOK_SIGNATURE');
});

test('Brevo SMTP adapter verifies credentials separately and requires explicit live approval', async () => {
  const calls = [];
  const transport = {
    verify: async config => { calls.push(['verify', config.host]); return { account_verified: true, scopes_valid: true, sender_ready: true }; },
    send: async (_config, message) => { calls.push(['send', message.to]); return { accepted: true, provider_message_id: '<provider-ack@example.invalid>' }; }
  };
  const adapter = createBrevoSmtpAdapter({ host: 'smtp-relay.brevo.com', port: 587, username: 'smtp-login', password: 'smtp-key', senderEmail: 'sender@example.invalid' }, transport);
  assert.equal(adapter.validateConfig().valid, true);
  assert.equal((await adapter.verifyConnection()).account_verified, true);
  await assert.rejects(() => adapter.execute({ to: 'self@example.invalid' }, { mode: 'live', idempotencyKey: 'one' }), error => error.code === 'LIVE_SEND_BLOCKED');
  const result = await adapter.execute({ to: 'self@example.invalid', subject: 'Approved test', text: 'Review' }, { mode: 'live', idempotencyKey: 'one', safety: { liveSendEnabled: true, operatorApproved: true } });
  assert.equal(result.provider_message_id, '<provider-ack@example.invalid>');
  assert.deepEqual(calls, [['verify', 'smtp-relay.brevo.com'], ['send', 'self@example.invalid']]);
});

test('approved Email executes once through a verified adapter and records only provider acceptance', async () => {
  const priorEnv = Object.fromEntries(['MARKETING_LIVE_SEND_ENABLED', 'MARKETING_ALLOWED_EMAILS', 'MARKETING_MAX_LIVE_RECIPIENTS', 'MARKETING_MAX_LIVE_MESSAGES', 'BREVO_SENDER_EMAIL'].map(key => [key, process.env[key]]));
  try {
    process.env.MARKETING_LIVE_SEND_ENABLED = 'true';
    process.env.MARKETING_ALLOWED_EMAILS = 'self@example.invalid';
    process.env.MARKETING_MAX_LIVE_RECIPIENTS = '1';
    process.env.MARKETING_MAX_LIVE_MESSAGES = '1';
    process.env.BREVO_SENDER_EMAIL = 'sender@example.invalid';
    const task = await orchestrator.dispatchMarketingTask(orchestrator.createHandoverEnvelope({ workspace_id: 'workspace-a', payload: { prompt: 'Prepare an approved email campaign', business_name: 'Example Business', profile_type: 'b2b_industrial', project: 'approved_service' } }), { skip_ai: true, keylessTestMode: true, audienceFixture: [{ id: 'fixture-1', test_data: true, outbound_blocked: true }], creativePlan: { test_data: true, subject: 'Approved email', caption: 'Approved body' } });
    for (let i = 0; i < 20 && task.status !== 'draft_ready'; i++) await new Promise(resolve => setTimeout(resolve, 5));
    task.audience_snapshot = { test_data: false, outbound_blocked: false, contacts: [{ id: 'lead-1', email: 'self@example.invalid', email_opt_in_status: 'granted', consent_evidence: { email: true } }] };
    task.channel_readiness.Email.gates.gate2_audience = { passed: true, eligible_count: 1 };
    const draft = task.channel_draft_versions.Email.versions.at(-1);
    orchestrator.approveChannelDraft('workspace-a', task.correlation_id, 'Email', draft.version_hash, 'marketing_operator');
    const calls = [];
    const emailAdapter = {
      name: 'controlled_test_adapter',
      verifyConnection: async () => ({ account_verified: true, sender_ready: true }),
      execute: async (message, options) => { calls.push({ message, options }); return { accepted: true, provider_message_id: '<accepted@example.invalid>' }; }
    };
    const result = await orchestrator.executeMarketingChannel('workspace-a', task.correlation_id, 'Email', { mode: 'live', operatorApproved: true, approvalPhrase: 'SEND_APPROVED_EMAIL_CAMPAIGN', emailAdapter });
    assert.equal(result.status, 'provider_accepted');
    assert.equal(result.executions[0].status, 'provider_accepted');
    assert.equal(result.executions[0].provider_message_ids[0], '<accepted@example.invalid>');
    assert.equal(calls.length, 1);
    await assert.rejects(() => orchestrator.executeMarketingChannel('workspace-a', task.correlation_id, 'Email', { mode: 'live', operatorApproved: true, approvalPhrase: 'SEND_APPROVED_EMAIL_CAMPAIGN', emailAdapter }), error => error.code === 'RECIPIENT_ALLOWLIST_BLOCKED');
  } finally {
    for (const [key, value] of Object.entries(priorEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('controlled showcase email uses only the explicit allowlisted recipient and approved template', async () => {
  const keys = ['M360_SHOWCASE_LIVE_ENABLED', 'MARKETING_LIVE_SEND_ENABLED', 'MARKETING_ALLOWED_EMAILS', 'MARKETING_MAX_LIVE_RECIPIENTS', 'MARKETING_MAX_LIVE_MESSAGES', 'BREVO_SENDER_EMAIL'];
  const prior = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, { M360_SHOWCASE_LIVE_ENABLED: 'true', MARKETING_LIVE_SEND_ENABLED: 'true', MARKETING_ALLOWED_EMAILS: 'nikumbhmayur4@gmail.com', MARKETING_MAX_LIVE_RECIPIENTS: '1', MARKETING_MAX_LIVE_MESSAGES: '1', BREVO_SENDER_EMAIL: 'sender@example.invalid' });
    const task = await orchestrator.dispatchMarketingTask(orchestrator.createHandoverEnvelope({ workspace_id: 'showcase', payload: { prompt: 'Prepare a controlled showcase email campaign', business_name: 'Northstar Demo', profile_type: 'b2b_industrial', project: 'facilities' } }), { skip_ai: true, keylessTestMode: true, audienceFixture: [{ id: 'demo-1', name: 'Fictional lead', test_data: true, outbound_blocked: true }], creativePlan: { test_data: true, subject: 'Approved showcase template', caption: 'Approved campaign body' } });
    for (let i = 0; i < 20 && task.status !== 'draft_ready'; i++) await new Promise(resolve => setTimeout(resolve, 5));
    const draft = task.channel_draft_versions.Email.versions.at(-1);
    orchestrator.approveChannelDraft('showcase', task.correlation_id, 'Email', draft.version_hash, 'marketing_operator');
    const sends = [];
    const emailAdapter = { name: 'controlled_test_adapter', verifyConnection: async () => ({ account_verified: true, sender_ready: true }), execute: async message => { sends.push(message); return { accepted: true, provider_message_id: '<controlled-test@example.invalid>' }; } };
    const result = await orchestrator.executeMarketingChannel('showcase', task.correlation_id, 'Email', { mode: 'live', operatorApproved: true, testRecipient: 'nikumbhmayur4@gmail.com', emailAdapter });
    assert.equal(result.status, 'provider_accepted');
    assert.equal(result.executions[0].provider, 'brevo_smtp_controlled_test');
    assert.equal(sends[0].to, 'nikumbhmayur4@gmail.com');
    process.env.MARKETING_MAX_LIVE_MESSAGES = '2';
    await assert.rejects(() => orchestrator.executeMarketingChannel('showcase', task.correlation_id, 'Email', { mode: 'live', operatorApproved: true, testRecipient: 'not-allowlisted@example.com', emailAdapter }), error => error.code === 'RECIPIENT_ALLOWLIST_BLOCKED');
    process.env.MARKETING_ALLOWED_EMAILS = '*';
    await assert.rejects(() => orchestrator.executeMarketingChannel('showcase', task.correlation_id, 'Email', { mode: 'live', operatorApproved: true, allowAnyRecipient:true, testRecipient: 'another@example.com', emailAdapter }), error => error.code === 'RECIPIENT_ALLOWLIST_BLOCKED');
    process.env.MARKETING_ALLOWED_EMAILS='another@example.com';process.env.MARKETING_MAX_LIVE_MESSAGES='0';
    await assert.rejects(() => orchestrator.executeMarketingChannel('showcase', task.correlation_id, 'Email', { mode:'live',operatorApproved:true,allowAnyRecipient:true,testRecipient:'another@example.com',emailAdapter }),error=>error.code==='RECIPIENT_ALLOWLIST_BLOCKED');
    assert.equal(sends.length,1);
  } finally { for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});

test('standalone Marketing asks for one topic and drafts immediately once supplied', async () => {
  const conversation = await orchestrator.createMarketingConversation({ workspaceId: 'workspace-a', message: 'I want to launch a paid marketing campaign for my business.', profile: {} });
  const correlationId = conversation.correlation_id;
  assert.equal(conversation.status,'clarification_required');
  await orchestrator.continueMarketingConversation(conversation,'Please do, get to it.');
  assert.equal(conversation.status,'clarification_required');
  assert.equal(conversation.messages.filter(item=>item.role==='assistant').length,1);
  assert.equal(conversation.messages.at(-2).content,'What should the campaign be about?');
  await orchestrator.continueMarketingConversation(conversation,'Industrial plots for manufacturers');
  assert.equal(conversation.status, 'ready_to_dispatch');
  assert.equal(conversation.correlation_id, correlationId);
  assert.equal((await orchestrator.createMarketingConversation({workspaceId:'workspace-a',message:'Promote industrial plots to manufacturers'})).status,'ready_to_dispatch');
  assert.ok(conversation.messages.every((message, index) => message.sequence === index + 1));
});

test('active-channel AI revision uses grounded output and preserves every other channel', async () => {
  const keys = ['M360_CONTROL_CENTER_ENABLED', 'M360_OPENAI_SPEND_APPROVED', 'OPENAI_API_KEY'];
  const prior = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, { M360_CONTROL_CENTER_ENABLED: 'yes', M360_OPENAI_SPEND_APPROVED: 'yes', OPENAI_API_KEY: 'test-key' });
    const task = await orchestrator.dispatchMarketingTask(orchestrator.createHandoverEnvelope({ workspace_id: 'workspace-a', payload: { prompt: 'Generate industrial enquiries', business_name: 'Example Industries', profile_type: 'b2b_industrial', workspace_context: { profile: { description: 'Approved industrial facilities provider.' } } } }), { skip_ai: true });
    for (let i = 0; i < 20 && task.status !== 'draft_ready'; i++) await new Promise(resolve => setTimeout(resolve, 5));
    const originalEmail = task.channel_draft_versions.Email.versions.at(-1).body;
    const result = await orchestrator.reviseMarketingTaskDraft('workspace-a', task.correlation_id, 'Make it clear for a first-time buyer.', {
      channel: 'WhatsApp',
      aiGenerator: async (_task, instruction, channels) => {
        assert.equal(instruction, 'Make it clear for a first-time buyer.');
        assert.deepEqual(channels, ['WhatsApp']);
        return { revisedBodies: { WhatsApp: 'Example Industries offers approved industrial facilities. Reply to discuss your requirement.' }, revisedSubjects: { WhatsApp: '' }, model: 'mock-grounded-model', tokens: 12 };
      }
    });
    assert.equal(result.targeted_channels[0], 'WhatsApp');
    assert.equal(task.channel_draft_versions.WhatsApp.versions.at(-1).ai_generated, true);
    assert.equal(task.channel_draft_versions.WhatsApp.versions.at(-1).ai_model, 'mock-grounded-model');
    assert.equal(task.channel_draft_versions.Email.versions.at(-1).body, originalEmail);
  } finally { for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
