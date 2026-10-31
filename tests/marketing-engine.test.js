'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const affinityEngine = require('../lib/m360-affinity-engine');
const channelVersioner = require('../lib/m360-channel-versioner');
const budgetEstimator = require('../lib/m360-budget-estimator');
const channelReadiness = require('../lib/m360-channel-readiness');
const orchestrator = require('../lib/m360-marketing-orchestrator');
const marketingApi = require('../api/marketing');

// ============================================================================
// 1. DYNAMIC B2B VS B2C AFFINITY LOGIC
// ============================================================================

test('Affinity Engine: B2B Industrial vs B2C Residential Classification', () => {
  // Northstar Industrial Park -> B2B
  const northstarType = affinityEngine.classifyProfile({ businessName: 'Northstar Industrial Park', project: 'northstar' });
  assert.equal(northstarType, 'b2b_industrial');

  const northstarStrategy = affinityEngine.getAffinityStrategy({ businessName: 'Northstar Industrial Park', project: 'northstar' });
  assert.equal(northstarStrategy.profile_type, 'b2b_industrial');
  assert.ok(northstarStrategy.pitch_framing.value_proposition.includes('industrial infrastructure'));

  // Example Heights -> B2C
  const shreeType = affinityEngine.classifyProfile({ businessName: 'Example Heights Chandannagar', project: 'example_heights' });
  assert.equal(shreeType, 'b2c_affinity');

  const shreeStrategy = affinityEngine.getAffinityStrategy({ businessName: 'Example Heights Chandannagar', project: 'example_heights' });
  assert.equal(shreeStrategy.profile_type, 'b2c_affinity');
  assert.ok(shreeStrategy.pitch_framing.value_proposition.includes('riverine living') || shreeStrategy.pitch_framing.emotional_hook.includes('home'));

  // Verify B2C segments include Chandannagar locals, Hooghly upgraders, Kolkata diaspora
  const segmentIds = shreeStrategy.core_segments.map(s => s.id);
  assert.ok(segmentIds.includes('chandannagar_locals'), 'Must include Chandannagar locals');
  assert.ok(segmentIds.includes('hooghly_upgraders'), 'Must include Hooghly upgraders');
  assert.ok(segmentIds.includes('metro_diaspora'), 'Must include Kolkata diaspora');

  // Example Gardens -> B2C
  const examplegardensType = affinityEngine.classifyProfile({ businessName: 'Example Gardens', project: 'example_gardens' });
  assert.equal(examplegardensType, 'b2c_affinity');

  // Verified profile fields may classify; free-form prompts alone may not.
  const autoB2B = affinityEngine.classifyProfile({ industry: 'Heavy machinery and warehouse park' });
  assert.equal(autoB2B, 'b2b_industrial');

  const autoB2C = affinityEngine.classifyProfile({ productType: 'Residential apartments', marketModel: 'B2C' });
  assert.equal(autoB2C, 'b2c_affinity');
  assert.equal(affinityEngine.classifyProfile({ prompt: 'Luxury flats in Chandannagar' }), 'unclassified');
});

// ============================================================================
// 2. HANDOVER ENVELOPE SCHEMA & ORCHESTRATOR PIPELINE
// ============================================================================

test('Handover Envelope: Schema Validation and 6-Step Lifecycle Progression', async () => {
  orchestrator.resetTaskStoreForTests();

  const envelope = orchestrator.createHandoverEnvelope({
    origin_module: 'control_center',
    target_engine: 'marketing',
    workspace_id: 'ws-test-northstar',
    user_id: 'user-001',
    task_title: 'Q4 Industrial Outreach',
    payload: {
      business_name: 'Northstar Logistics Hub',
      project: 'northstar',
      profile_type: 'b2b_industrial',
      goal: 'Generate 20 qualified warehousing inquiries',
      channels: ['WhatsApp', 'LinkedIn', 'Email']
    }
  });

  // Verify canonical envelope fields
  assert.ok(envelope.envelope_id);
  assert.ok(envelope.correlation_id);
  assert.equal(envelope.origin_module, 'control_center');
  assert.equal(envelope.target_engine, 'marketing');
  assert.equal(envelope.workspace_id, 'ws-test-northstar');
  assert.equal(envelope.status, 'accepted');

  // Dispatch task in orchestrator with minimal async delay for testing
  const task = await orchestrator.dispatchMarketingTask(envelope, { delay: 10 });
  assert.equal(task.workspace_id, 'ws-test-northstar');

  // Wait for the pipeline to finish step progression
  await new Promise(r => setTimeout(r, 80));

  const finalized = orchestrator.getMarketingTask('ws-test-northstar', envelope.correlation_id);
  assert.ok(finalized);
  assert.equal(finalized.status, 'draft_ready');

  // Check that all 6 lifecycle stages were traversed
  const recordedSteps = finalized.step_history.map(s => s.step);
  assert.ok(recordedSteps.includes('accepted'), 'Must traverse accepted');
  assert.ok(recordedSteps.includes('requesting_leads'), 'Must traverse requesting_leads');
  assert.ok(recordedSteps.includes('audience_empty'), 'Must preserve an honest empty audience');
  assert.ok(recordedSteps.includes('requesting_content'), 'Must traverse requesting_content');
  assert.ok(recordedSteps.includes('content_blocked'), 'Must report missing verified content task');
  assert.ok(recordedSteps.includes('draft_ready'), 'Must traverse draft_ready');

  // Tenant boundary: querying with mismatched workspace must return null
  assert.equal(orchestrator.getMarketingTask('ws-unauthorized', envelope.correlation_id), null);
  assert.equal(finalized.audience_snapshot.total_count, 0);
  assert.equal(finalized.content_dependency.status, 'blocked_verified_content_task_required');
});

// ============================================================================
// 3. SURGICAL PER-CHANNEL VERSIONING & VISUAL DIFF
// ============================================================================

test('Channel Versioner: 10-Channel Tree, Targeted Revisions & Visual Diff', () => {
  const tree = channelVersioner.initChannelVersionTree({
    business: 'Example Heights'
  });

  // Verify all 10 channels initialized at v1
  const channels = ['WhatsApp', 'Email', 'Facebook', 'Instagram', 'LinkedIn', 'X', 'YouTube', 'Google Business Profile', 'SMS', 'Website'];
  channels.forEach(ch => {
    assert.ok(tree[ch], `Channel ${ch} must exist in tree`);
    assert.equal(tree[ch].current_version, 1);
    assert.equal(tree[ch].versions.length, 1);
    assert.ok(tree[ch].versions[0].body.length > 0);
  });

  const originalInstagramBody = tree['Instagram'].versions[0].body;
  const originalWhatsAppBody = tree['WhatsApp'].versions[0].body;
  const originalLinkedInBody = tree['LinkedIn'].versions[0].body;

  // Target detection test
  const targets = channelVersioner.parseRevisionTargets(
    'Shorten WhatsApp and make LinkedIn more formal, keep Instagram unchanged'
  );
  assert.deepEqual(targets.targeted.sort(), ['LinkedIn', 'WhatsApp'].sort());
  assert.deepEqual(targets.excluded, ['Instagram']);

  // Surgical revision of WhatsApp and LinkedIn only
  const revisionResult = channelVersioner.applySurgicalRevision(
    tree,
    'Shorten WhatsApp and make LinkedIn more formal, keep Instagram unchanged'
  );

  assert.deepEqual(revisionResult.targeted_channels.sort(), ['LinkedIn', 'WhatsApp'].sort());
  assert.ok(revisionResult.preserved_channels.includes('Instagram'));

  // WhatsApp and LinkedIn bumped to v2
  assert.equal(tree['WhatsApp'].current_version, 2);
  assert.equal(tree['WhatsApp'].versions.length, 2);
  assert.notEqual(tree['WhatsApp'].versions[1].body, originalWhatsAppBody);

  assert.equal(tree['LinkedIn'].current_version, 2);
  assert.equal(tree['LinkedIn'].versions.length, 2);
  assert.notEqual(tree['LinkedIn'].versions[1].body, originalLinkedInBody);

  // Untargeted channels MUST remain strictly at v1 and byte-exact
  assert.equal(tree['Instagram'].current_version, 1);
  assert.equal(tree['Instagram'].versions.length, 1);
  assert.equal(tree['Instagram'].versions[0].body, originalInstagramBody);

  assert.equal(tree['Facebook'].current_version, 1);
  assert.equal(tree['X'].current_version, 1);

  // Visual diff generation
  const diff = channelVersioner.computeVisualDiff(originalWhatsAppBody, tree['WhatsApp'].versions[1].body);
  assert.ok(Array.isArray(diff));
  assert.ok(diff.some(d => d.type === 'removed' || d.type === 'added'));
});

test('Channel Versioner: final copy replacement recomputes immutable approval hash', () => {
  const tree = channelVersioner.initChannelVersionTree({ business: 'Matrix 360' });
  const version = tree.WhatsApp.versions[0];
  const oldHash = version.version_hash;

  channelVersioner.finalizeDraftVersion(version, 'Final model-authored copy', { ai_generated: true });

  assert.equal(version.body, 'Final model-authored copy');
  assert.equal(version.characters, 25);
  assert.equal(version.ai_generated, true);
  assert.notEqual(version.version_hash, oldHash);
  assert.equal(version.version_hash, createHash('sha256').update(version.body).digest('hex'));
});

// ============================================================================
// 4. 3-GATE CHANNEL READINESS & EMAIL-TO-CTWA OPT-IN BRIDGE
// ============================================================================

test('Channel Readiness: 3-Gate Verification and CTWA Bridge Generation', () => {
  const audience = [
    { id: '1', email: 'arindam@example.com', phone: '+919830111111', whatsapp_opt_in_status: 'granted', email_opt_in_status: 'granted', sms_opt_in_status: 'opted_in', consent_evidence: { whatsapp: true, email: true, sms: true } },
    { id: '2', email: 'subhash@example.com', phone: '+919830222222', whatsapp_opt_in_status: 'pending', email_opt_in_status: 'granted', sms_opt_in_status: 'opted_out', consent_evidence: { email: true } },
    { id: '3', email: 'koyel@example.com', phone: '', whatsapp_opt_in_status: 'unspecified', email_opt_in_status: 'granted', sms_opt_in_status: 'none', consent_evidence: { email: true } },
    { id: '4', email: '', phone: '+919830333333', whatsapp_opt_in_status: 'granted', sms_opt_in_status: 'opted_in', consent_evidence: { whatsapp: true, sms: true } }
  ];

  const connections = {
    whatsapp: true,
    email: true,
    linkedin: false
  };

  // WhatsApp readiness check: draft not yet approved
  const waCheck = channelReadiness.evaluateChannelReadiness('WhatsApp', {
    draft: { status: 'draft_for_review', version: 1 },
    audience,
    connections,
    business: 'Example Heights'
  });

  assert.equal(waCheck.gates.gate1_draft.status, 'draft_for_review');
  assert.equal(waCheck.gates.gate1_draft.passed, false);

  assert.equal(waCheck.gates.gate2_audience.eligible_count, 2); // id 1 and 4 have phone + granted
  assert.equal(waCheck.gates.gate2_audience.ineligible_count, 2);
  assert.equal(waCheck.gates.gate2_audience.passed, true);

  assert.equal(waCheck.gates.gate3_provider.status, 'connected');
  assert.equal(waCheck.gates.gate3_provider.passed, true);
  assert.equal(waCheck.all_gates_passed, false); // gate1 is draft_for_review

  // LinkedIn readiness check: disconnected provider
  const liCheck = channelReadiness.evaluateChannelReadiness('LinkedIn', {
    draft: { status: 'approved', version: 1 },
    audience,
    connections,
    business: 'Example Heights'
  });
  assert.equal(liCheck.gates.gate1_draft.passed, true);
  assert.equal(liCheck.gates.gate3_provider.status, 'disconnected_connection_required');
  assert.equal(liCheck.gates.gate3_provider.passed, false);
  assert.equal(liCheck.all_gates_passed, false);

  // Email-to-CTWA Opt-In Bridge Generation
  const ctwaBridge = channelReadiness.createEmailToCTWABridgeDraft({
    audience,
    businessName: 'Example Heights',
    projectName: 'Example Heights Towers',
    whatsappNumber: '919830099999'
  });

  // Contacts 2 and 3 have valid emails but lack WhatsApp opt-in
  assert.equal(ctwaBridge.target_contacts_count, 2);
  assert.ok(ctwaBridge.subject.includes('Prefer WhatsApp?'));
  assert.ok(ctwaBridge.body.includes('https://wa.me/919830099999?text='));
  assert.ok(ctwaBridge.compliance_notes.length > 0);
});

// ============================================================================
// 5. BAYESIAN BUDGET ESTIMATOR & A/B SAMPLE SIZE MATH
// ============================================================================

test('Budget Estimator: Diminishing Returns Curve, A/B Math, & Mandatory Disclaimer', () => {
  const estimates = budgetEstimator.estimateBudgetScenarios({
    budget: 35000,
    profileType: 'b2c_affinity',
    durationDays: 30
  });

  // Mandatory zero-fabrication badge
  assert.equal(estimates.badge, 'ESTIMATE_ONLY_NOT_HISTORICAL_RESULT');

  // Verify saturation curve monotonic progression
  const low10k = budgetEstimator.estimateBudgetScenarios({ budget: 10000, profileType: 'b2c_affinity' });
  const med35k = budgetEstimator.estimateBudgetScenarios({ budget: 35000, profileType: 'b2c_affinity' });
  const high70k = budgetEstimator.estimateBudgetScenarios({ budget: 70000, profileType: 'b2c_affinity' });

  const imp1 = low10k.scenarios.expected_median.impressions;
  const imp2 = med35k.scenarios.expected_median.impressions;
  const imp3 = high70k.scenarios.expected_median.impressions;

  assert.ok(imp2 > imp1, 'Higher budget must yield higher impressions');
  assert.ok(imp3 > imp2, 'Higher budget must yield higher impressions');

  // Check diminishing marginal returns: (35k - 10k) marginal gain per rupee > (70k - 35k) marginal gain per rupee
  const marginalGain1 = (imp2 - imp1) / 25000;
  const marginalGain2 = (imp3 - imp2) / 35000;
  assert.ok(marginalGain1 > marginalGain2, 'Marginal gain must diminish as budget increases');

  // A/B test sample size math
  const ab = budgetEstimator.calculateABSampleSize({
    baselineConversion: 0.04,
    expectedLiftPercent: 25,
    significance: 0.05,
    power: 0.80
  });

  assert.equal(ab.badge, 'ESTIMATE_ONLY_NOT_HISTORICAL_RESULT');
  assert.ok(ab.sample_size_per_variant > 1000, 'Statistically valid sample size should exceed 1000 for 4% baseline');
  assert.equal(ab.total_required_sample_size, ab.sample_size_per_variant * 2);
  assert.ok(ab.methodology.includes('Two-proportion'));
});

// ============================================================================
// 6. MARKETING API ENDPOINTS INTEGRATION
// ============================================================================

const originalFetch = global.fetch;
const memberships = [
  { id: 'ws-e2e-test', name: 'Example Heights', role: 'client_admin', profile_type: 'b2c_affinity', project_slug: 'example_heights' },
  { id: 'ws-exec-test', name: 'Example Heights', role: 'client_admin', profile_type: 'b2c_affinity', project_slug: 'example_heights' },
  { id: 'ws-viewer-test', name: 'Viewer Workspace', role: 'viewer', profile_type: 'b2b_industrial', project_slug: 'northstar' }
];
function installCrmFetch(leads = []) {
  global.fetch = async url => {
    if (String(url).endsWith('/me/workspaces')) return { status: 200, ok: true, json: async () => memberships };
    if (String(url).includes('/workspaces/') && String(url).endsWith('/leads')) return { status: 200, ok: true, json: async () => leads };
    throw new Error('Unexpected fetch: ' + url);
  };
}

function mockHttp(method, path, body = {}, auth = 'Bearer test-session-token-long-enough-123') {
  const parsedUrl = new URL(path, 'http://127.0.0.1');
  const query = Object.fromEntries(parsedUrl.searchParams);
  const req = {
    method,
    url: path,
    query,
    headers: { authorization: auth, 'content-type': 'application/json' },
    body
  };

  let resData = null;
  const res = {
    statusCode: 200,
    setHeader() {},
    end(data) {
      if (data) {
        try {
          resData = JSON.parse(data);
        } catch {
          resData = data;
        }
      }
    }
  };

  return { req, res, get: () => ({ status: res.statusCode, data: resData }) };
}

test('Marketing API: Endpoints Dispatch, Tasks Query, Revise, Approve, and Handoff', async () => {
  orchestrator.resetTaskStoreForTests();
  installCrmFetch([]);

  // Dispatch a new task (returns 202 Accepted)
  const dispatchMock = mockHttp('POST', '/api/marketing/dispatch', {
    workspace_id: 'ws-e2e-test',
    business_name: 'Example Heights',
    project: 'example_heights',
    goal: 'Launch residential tower booking'
  });
  await marketingApi(dispatchMock.req, dispatchMock.res);
  const dispatchRes = dispatchMock.get();
  assert.equal(dispatchRes.status, 202);
  assert.ok(dispatchRes.data.correlation_id);

  const corrId = dispatchRes.data.correlation_id;

  // Allow short delay for task pipeline to complete
  await new Promise(r => setTimeout(r, 80));

  // Query tasks by correlation_id
  const queryMock = mockHttp('GET', `/api/marketing/tasks?workspace_id=ws-e2e-test&correlation_id=${corrId}`);
  await marketingApi(queryMock.req, queryMock.res);
  const queryRes = queryMock.get();
  assert.equal(queryRes.status, 200);
  assert.equal(queryRes.data.task.correlation_id, corrId);
  assert.equal(queryRes.data.task.affinity_strategy.profile_type, 'b2c_affinity');
  assert.equal(queryRes.data.task.audience_snapshot.total_count, 0);

  // Surgical Revise
  const reviseMock = mockHttp('POST', '/api/marketing/revise', {
    workspace_id: 'ws-e2e-test',
    correlation_id: corrId,
    revision_prompt: 'Shorten WhatsApp and make LinkedIn more formal, keep Instagram unchanged'
  });
  await marketingApi(reviseMock.req, reviseMock.res);
  const reviseRes = reviseMock.get();
  assert.equal(reviseRes.status, 200);
  assert.equal(reviseRes.data.channel_draft_versions['WhatsApp'].current_version, 2);
  assert.equal(reviseRes.data.channel_draft_versions['Instagram'].current_version, 1); // Unchanged!

  // Approve channel
  const approveMock = mockHttp('POST', '/api/marketing/approve', {
    workspace_id: 'ws-e2e-test',
    correlation_id: corrId,
    channel: 'WhatsApp',
    version_hash: reviseRes.data.channel_draft_versions['WhatsApp'].versions.at(-1).version_hash
  });
  await marketingApi(approveMock.req, approveMock.res);
  const approveRes = approveMock.get();
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.data.readiness.gates.gate1_draft.status, 'approved');

  // Inbound handoff from Leads ("Push to Marketing")
  const handoffLeadsMock = mockHttp('POST', '/api/marketing/handoff', {
    workspace_id: 'ws-e2e-test',
    from: 'leads',
    prompt: 'Launch outreach campaign for 25 qualified Hooghly prospects',
    leads: [{ id: 'lead_new_1', name: 'Prospect 1', email: 'p1@test.com' }]
  });
  await marketingApi(handoffLeadsMock.req, handoffLeadsMock.res);
  const handoffLeadsRes = handoffLeadsMock.get();
  assert.equal(handoffLeadsRes.status, 501);
  assert.equal(handoffLeadsRes.data.code, 'VERIFIED_ENGINE_HANDOFF_REQUIRED');

  // Inbound handoff from Content Studio ("Use in Marketing")
  const handoffContentMock = mockHttp('POST', '/api/marketing/handoff', {
    workspace_id: 'ws-e2e-test',
    from: 'content',
    prompt: 'Incorporate new verified rooftop elevation render into campaign',
    artifacts: [{ kind: 'poster', id: 'post_01', url: 'https://cdn.example.com/poster.jpg' }]
  });
  await marketingApi(handoffContentMock.req, handoffContentMock.res);
  const handoffContentRes = handoffContentMock.get();
  assert.equal(handoffContentRes.status, 501);

  // Unauthorized workspace rejection
  const unauthorizedMock = mockHttp('GET', `/api/marketing/tasks?workspace_id=ws-other-tenant&correlation_id=${corrId}`);
  await marketingApi(unauthorizedMock.req, unauthorizedMock.res);
  assert.equal(unauthorizedMock.get().status, 403);
});

// ============================================================================
// 7. EXECUTION DISPATCH & 3-GATE ENFORCEMENT
// ============================================================================

test('Marketing API: Execute Channel Dispatch and 3-Gate Enforcement', async () => {
  orchestrator.resetTaskStoreForTests();
  installCrmFetch([{ id: 'real-1', name: 'Authorized Enquiry', email: 'allowed@example.com', phone: '+919830000001', source: 'CRM enquiry', whatsapp_opt_in_status: 'granted', email_opt_in_status: 'granted', consent_evidence: { whatsapp: true, email: true } }]);

  const dispatchMock = mockHttp('POST', '/api/marketing/dispatch', {
    workspace_id: 'ws-exec-test',
    prompt: 'Launch email and whatsapp outreach for Example Heights',
    connections: { email: true, whatsapp: true },
    leads: [{ id: 'forged', email: 'forged@example.com' }]
  });
  await marketingApi(dispatchMock.req, dispatchMock.res);
  const corrId = dispatchMock.get().data.correlation_id;

  // Wait for draft_ready
  await new Promise(r => setTimeout(r, 40));
  const task = orchestrator.getMarketingTask('ws-exec-test', corrId);
  assert.equal(task.audience_snapshot.total_count, 1);
  assert.equal(task.audience_snapshot.contacts[0].id, 'real-1');
  assert.equal(task.connections.email, false);

  // 1. Try to execute WhatsApp when unapproved (Gate 1 blocked)
  const execUnapprovedMock = mockHttp('POST', '/api/marketing/execute', {
    workspace_id: 'ws-exec-test',
    correlation_id: corrId,
    channel: 'WhatsApp',
    version_hash: task.channel_draft_versions.WhatsApp.versions.at(-1).version_hash
  });
  await marketingApi(execUnapprovedMock.req, execUnapprovedMock.res);
  assert.equal(execUnapprovedMock.get().status, 412);
  assert.equal(execUnapprovedMock.get().data.code, 'GATE_1_BLOCKED');

  // Approve WhatsApp (Pass Gate 1)
  const approveMock = mockHttp('POST', '/api/marketing/approve', {
    workspace_id: 'ws-exec-test',
    correlation_id: corrId,
    channel: 'WhatsApp',
    version_hash: task.channel_draft_versions.WhatsApp.versions.at(-1).version_hash
  });
  await marketingApi(approveMock.req, approveMock.res);
  assert.equal(approveMock.get().status, 200);

  // 2. Try to execute WhatsApp when provider disconnected (Gate 3 blocked)
  const execDisconnectedMock = mockHttp('POST', '/api/marketing/execute', {
    workspace_id: 'ws-exec-test',
    correlation_id: corrId,
    channel: 'WhatsApp'
  });
  await marketingApi(execDisconnectedMock.req, execDisconnectedMock.res);
  assert.equal(execDisconnectedMock.get().status, 412);
  assert.equal(execDisconnectedMock.get().data.code, 'GATE_3_BLOCKED');

  // 3. Credentials/client flags alone cannot create a provider receipt.
  const approveEmailMock = mockHttp('POST', '/api/marketing/approve', {
    workspace_id: 'ws-exec-test',
    correlation_id: corrId,
    channel: 'Email',
    version_hash: task.channel_draft_versions.Email.versions.at(-1).version_hash
  });
  await marketingApi(approveEmailMock.req, approveEmailMock.res);
  assert.equal(approveEmailMock.get().status, 200);

  const execEmailMock = mockHttp('POST', '/api/marketing/execute', {
    workspace_id: 'ws-exec-test',
    correlation_id: corrId,
    channel: 'Email'
  });
  await marketingApi(execEmailMock.req, execEmailMock.res);
  const execEmailRes = execEmailMock.get();
  assert.equal(execEmailRes.status, 412);
  assert.equal(execEmailRes.data.code, 'GATE_3_BLOCKED');
  assert.equal(execEmailRes.data.receipt_id, undefined);
});

test('Provider Connection Auto-Detection from Runtime Environment', () => {
  const prevWA = process.env.WHATSAPP_API_TOKEN;
  const prevWAPhone = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const prevSMTP = process.env.SMTP_HOST;
  const prevMeta = process.env.META_ACCESS_TOKEN;

  try {
    process.env.WHATSAPP_API_TOKEN = 'test-token-wa';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '919830000000';
    process.env.SMTP_HOST = 'smtp.sendgrid.net';
    process.env.META_ACCESS_TOKEN = 'EAAXtesttoken';

    const conn = orchestrator.detectActiveConnections();
    assert.equal(conn.whatsapp, false);
    assert.equal(conn.email, false);
    assert.equal(conn.meta, false);
    assert.equal(conn.web, false);
  } finally {
    if (prevWA) process.env.WHATSAPP_API_TOKEN = prevWA; else delete process.env.WHATSAPP_API_TOKEN;
    if (prevWAPhone) process.env.WHATSAPP_PHONE_NUMBER_ID = prevWAPhone; else delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (prevSMTP) process.env.SMTP_HOST = prevSMTP; else delete process.env.SMTP_HOST;
    if (prevMeta) process.env.META_ACCESS_TOKEN = prevMeta; else delete process.env.META_ACCESS_TOKEN;
  }
});

test('Marketing API denies anonymous, cross-tenant and viewer mutations; forged inputs are ignored', async () => {
  orchestrator.resetTaskStoreForTests();
  installCrmFetch([]);
  const anonymous = mockHttp('GET', '/api/marketing/tasks?workspace_id=ws-e2e-test', {}, '');
  await marketingApi(anonymous.req, anonymous.res);
  assert.equal(anonymous.get().status, 401);

  const crossTenant = mockHttp('GET', '/api/marketing/tasks?workspace_id=ws-not-a-member');
  await marketingApi(crossTenant.req, crossTenant.res);
  assert.equal(crossTenant.get().status, 403);

  const viewerWrite = mockHttp('POST', '/api/marketing/dispatch', { workspace_id: 'ws-viewer-test', prompt: 'Prepare an industrial campaign review draft.' });
  await marketingApi(viewerWrite.req, viewerWrite.res);
  assert.equal(viewerWrite.get().status, 403);

  const forged = mockHttp('POST', '/api/marketing/dispatch', {
    workspace_id: 'ws-e2e-test', prompt: 'Prepare a residential campaign review draft.',
    origin_module: 'leads', business_name: 'Forged Business', project: 'northstar',
    leads: [{ id: 'fake-contact' }], connections: { email: true },
    artifact_refs: [{ kind: 'image', id: 'fake-asset' }], test_delay: 0
  });
  await marketingApi(forged.req, forged.res);
  assert.equal(forged.get().status, 202);
  await new Promise(resolve => setTimeout(resolve, 40));
  const task = orchestrator.getMarketingTask('ws-e2e-test', forged.get().data.correlation_id);
  assert.equal(task.origin_module, 'marketing');
  assert.equal(task.business_name, 'Example Heights');
  assert.equal(task.project, 'example_heights');
  assert.equal(task.audience_snapshot.total_count, 0);
  assert.deepEqual(task.artifact_refs.filter(ref => ref.kind !== 'audience_snapshot'), []);
  assert.equal(task.connections.email, false);
});

test('Marketing browser client has no production-reachable demo success fallback', () => {
  const source = fs.readFileSync(path.join(__dirname, '../lib/m360-marketing-client.browser.js'), 'utf8');
  assert.doesNotMatch(source, /getDefaultTask|prov_rec_|sample-kv|cmp_.*_default/);
  assert.match(source, /Verified Content Studio task IDs are not connected|Durable shared Marketing storage is not provisioned/);
  assert.doesNotMatch(source, /eligible_count: 24|wa\.me\/919830099999|SPF: Pass|DKIM: Pass/);
});


test('Marketing engine test-preview returns approved content without a recipient or send action while live execute fails closed', async () => {
  const dispatchReq = mockHttp('POST', '/api/marketing/dispatch', {
    workspace_id: 'ws-e2e-test',
    prompt: 'Launch a campaign for Example Heights.'
  });
  await marketingApi(dispatchReq.req, dispatchReq.res);
  assert.equal(dispatchReq.get().status, 202);
  const corrId = dispatchReq.get().data.correlation_id;
  await new Promise(r => setTimeout(r, 60));

  const task = orchestrator.getMarketingTask('ws-e2e-test', corrId);
  assert.ok(task);
  const curVer = task.channel_draft_versions.WhatsApp.versions[0];

  // Gate 1: Approve draft
  orchestrator.approveChannelDraft('ws-e2e-test', corrId, 'WhatsApp', curVer.version_hash, 'client_admin');

  const approvedDraft = task.channel_draft_versions.WhatsApp.versions.at(-1);
  const previewResult = await orchestrator.executeMarketingChannel('ws-e2e-test', corrId, 'WhatsApp', {
    mode: 'test_preview', request_id: 'req-preview-1', actor_id: 'member-1', actor_role: 'client_admin'
  });
  assert.equal(previewResult.status, 'test_preview_ready');
  assert.equal(previewResult.channel, 'WhatsApp');
  assert.equal(previewResult.provider_mode, 'non_sending_test_preview');
  assert.equal(previewResult.sent, false);
  assert.equal(previewResult.body, approvedDraft.body);
  assert.equal(previewResult.approval_hash, approvedDraft.version_hash);
  assert.equal('test_url' in previewResult, false);
  assert.equal('recipient' in previewResult, false);
  assert.deepEqual(task.audit_history.at(-1), {
    request_id: 'req-preview-1', workspace_id: 'ws-e2e-test', actor_id: 'member-1', actor_role: 'client_admin',
    action: 'marketing.test_preview', channel: 'WhatsApp', draft_version: approvedDraft.version,
    approval_state: 'approved', approval_hash: approvedDraft.version_hash,
    timestamp: task.audit_history.at(-1).timestamp, outcome: 'preview_ready', failure_code: null,
    provider_mode: 'non_sending_test_preview', correlation_id: corrId
  });

  task.channel_draft_versions.WhatsApp.versions.at(-1).status = 'draft';
  await assert.rejects(
    orchestrator.executeMarketingChannel('ws-e2e-test', corrId, 'WhatsApp', { mode: 'test_preview' }),
    error => error.code === 'STALE_DRAFT_VERSION'
  );
  assert.equal(task.audit_history.at(-1).outcome, 'blocked');
  assert.equal(task.audit_history.at(-1).failure_code, 'STALE_DRAFT_VERSION');
  assert.match(task.audit_history.at(-1).request_id, /^[0-9a-f-]{36}$/);

  await assert.rejects(
    orchestrator.executeMarketingChannel('ws-e2e-test', corrId, 'Unsupported', { mode: 'test_preview' }),
    error => error.code === 'UNSUPPORTED_CHANNEL'
  );
  assert.equal(task.audit_history.at(-1).failure_code, 'UNSUPPORTED_CHANNEL');
  task.channel_draft_versions.WhatsApp.versions.at(-1).status = 'approved';

  // When all gates pass, live execution without an active outbound adapter still fails closed
  task.channel_readiness.WhatsApp.gates.gate2_audience.passed = true;
  task.channel_readiness.WhatsApp.gates.gate2_audience.eligible_count = 1;
  task.channel_readiness.WhatsApp.gates.gate3_provider.passed = true;

  await assert.rejects(async () => {
    await orchestrator.executeMarketingChannel('ws-e2e-test', corrId, 'WhatsApp', { mode: 'live' });
  }, (err) => {
    assert.strictEqual(err.code, 'PROVIDER_ADAPTER_NOT_IMPLEMENTED');
    return true;
  });
});

test.after(() => { global.fetch = originalFetch; });
