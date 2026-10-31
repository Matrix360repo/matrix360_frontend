const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');

const orchestrator = require('../lib/m360-leads-orchestrator-server.js');

function mockReq({ method = 'GET', query = {}, body = null, headers = {} } = {}) {
  const req = new EventEmitter();
  req.method = method;
  const workspace=headers['x-m360-client-scope']||'test-workspace';
  req.query = {workspace_id:workspace,...query};
  req.body = body?{workspace_id:workspace,...body}:body;
  req.headers = {authorization:'Bearer synthetic-session-for-tests-12345',...headers};
  return req;
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(c) {
      this.statusCode = c;
      return this;
    },
    end(payload = '') {
      this.body = String(payload);
    },
    json() {
      return this.body ? JSON.parse(this.body) : {};
    }
  };
}

function jsonResp(status, obj, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] || null },
    json: async () => obj,
    text: async () => JSON.stringify(obj)
  };
}

function createTestHandler(fetchImpl){
 return orchestrator.createUnifiedLeadsHandler(async(url,options)=>{
  if(url.endsWith('/me/workspaces'))return jsonResp(200,['test-workspace','client_alpha','client_beta'].map(id=>({id,name:'Synthetic '+id,role:'client_admin',website_client_id:'approved_test_client'})));
  if(url.endsWith('/api/campaign/profile/approved_test_client'))return jsonResp(200,{id:'approved_test_client'});
  return fetchImpl(url,options);
 });
}
function textResp(status, rawText) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => String(rawText)
  };
}

test('1. Both engines start and complete', async () => {
  orchestrator.resetOrchestratorStateForTests();
  const handler = createTestHandler(async (url) => {
    if (url.endsWith('/api/scraper/run')) {
      return jsonResp(200, { status: 'started', job_id: 'maps_job_1' });
    }
    if (url.endsWith('/api/v1/auth/bootstrap')) {
      return jsonResp(200, { token: 'secret_jwt_token_123' });
    }
    if (url.endsWith('/api/campaign/start')) {
      return jsonResp(200, { status: 'running', job_id: 'web_job_1' });
    }
    if (url.endsWith('/api/scraper/status')) {
      return jsonResp(200, { running: false });
    }
    if (url.includes('/api/scraper/leads')) {
      return jsonResp(200, {
        leads: [{ company_name: 'Howrah Steel Pvt Ltd', phone: '09830011111', location: 'Howrah' }]
      });
    }
    if (url.endsWith('/api/campaign/status/web_job_1')) {
      return jsonResp(200, {
        status: 'completed',
        leads: [{ company_name: 'Kolkata Foundry Ltd', email: 'info@kolkatafoundry.in', location: 'Kolkata' }]
      });
    }
    throw new Error('Unexpected URL: ' + url);
  });

  const startRes = mockRes();
  await handler(
    mockReq({ method: 'POST', body: { prompt: 'Find steel plants in Kolkata' } }),
    startRes
  );
  assert.equal(startRes.statusCode, 202);
  const started = startRes.json();
  assert.equal(started.ui_state, 'Both engines running');
  assert.equal(started.engines.maps.status, 'running');
  assert.equal(started.engines.website.status, 'running');

  const pollRes = mockRes();
  await handler(
    mockReq({
      method: 'GET',
      query: {
        campaign_id: started.campaign_id,
        maps_job_id: started.maps_job_id,
        website_job_id: started.website_job_id
      }
    }),
    pollRes
  );
  const polled = pollRes.json();
  assert.equal(polled.overall_status, 'completed');
  assert.equal(polled.ui_state, 'Completed successfully');
  assert.equal(polled.running, false);
  assert.equal(polled.counts.total, 2);
});

test('2. Maps completes while Website fails to start', async () => {
  orchestrator.resetOrchestratorStateForTests();
  const handler = createTestHandler(async (url) => {
    if (url.endsWith('/api/scraper/run')) {
      return jsonResp(200, { status: 'started' });
    }
    if (url.endsWith('/api/v1/auth/bootstrap')) {
      return jsonResp(200, { token: 'boot_tok' });
    }
    if (url.endsWith('/api/campaign/start')) {
      return jsonResp(500, { detail: 'Website worker failed to initialize' });
    }
    if (url.endsWith('/api/scraper/status')) {
      return jsonResp(200, { running: false });
    }
    if (url.includes('/api/scraper/leads')) {
      return jsonResp(200, {
        leads: [{ company_name: 'Eastern Castings Pvt Ltd', phone: '09830022222', location: 'Howrah' }]
      });
    }
    throw new Error('Unexpected URL: ' + url);
  });

  const startRes = mockRes();
  await handler(
    mockReq({ method: 'POST', body: { prompt: 'Castings in Howrah' } }),
    startRes
  );
  assert.equal(startRes.statusCode, 202);
  const started = startRes.json();
  assert.equal(started.ui_state, 'Maps running; Website failed');
  assert.ok(started.maps_job_id);
  assert.equal(started.website_job_id, null);
  assert.equal(started.engines.website.error_code, 'HTTP_500_SERVER_ERROR');

  const pollRes = mockRes();
  await handler(
    mockReq({
      method: 'GET',
      query: { campaign_id: started.campaign_id, maps_job_id: started.maps_job_id }
    }),
    pollRes
  );
  const polled = pollRes.json();
  assert.equal(polled.overall_status, 'partial_success');
  assert.equal(polled.ui_state, 'Completed with partial results');
  assert.equal(polled.partial_results, true);
  assert.equal(polled.leads.length, 1);
  assert.equal(polled.leads[0].company_name, 'Eastern Castings Pvt Ltd');
});

test('3. Website completes while Maps fails to start', async () => {
  orchestrator.resetOrchestratorStateForTests();
  const handler = createTestHandler(async (url) => {
    if (url.endsWith('/api/scraper/run')) {
      return jsonResp(503, { message: 'Maps service unavailable' });
    }
    if (url.endsWith('/api/v1/auth/bootstrap')) {
      return jsonResp(200, { token: 'boot_tok' });
    }
    if (url.endsWith('/api/campaign/start')) {
      return jsonResp(200, { job_id: 'web_only_99' });
    }
    if (url.endsWith('/api/campaign/status/web_only_99')) {
      return jsonResp(200, {
        status: 'completed',
        leads: [{ company_name: 'Apex Heart Clinic', email: 'contact@apexheart.org', location: 'Kolkata' }]
      });
    }
    throw new Error('Unexpected URL: ' + url);
  });

  const startRes = mockRes();
  await handler(
    mockReq({ method: 'POST', body: { prompt: 'Cardiology clinics in Kolkata' } }),
    startRes
  );
  assert.equal(startRes.statusCode, 202);
  const started = startRes.json();
  assert.equal(started.ui_state, 'Website running; Maps failed');
  assert.equal(started.maps_job_id, null);
  assert.equal(started.website_job_id, 'web_only_99');

  const pollRes = mockRes();
  await handler(
    mockReq({
      method: 'GET',
      query: { campaign_id: started.campaign_id, website_job_id: 'web_only_99' }
    }),
    pollRes
  );
  const polled = pollRes.json();
  assert.equal(polled.overall_status, 'partial_success');
  assert.equal(polled.ui_state, 'Completed with partial results');
  assert.equal(polled.leads.length, 1);
});

test('4. Both engines fail to start', async () => {
  orchestrator.resetOrchestratorStateForTests();
  const handler = createTestHandler(async (url) => {
    if (url.endsWith('/api/scraper/run')) {
      return jsonResp(500, { message: 'Maps crashed' });
    }
    if (url.endsWith('/api/v1/auth/bootstrap')) {
      return jsonResp(500, { message: 'Bootstrap crashed' });
    }
    if (url.endsWith('/api/campaign/start')) {
      return jsonResp(500, { message: 'Website crashed' });
    }
    throw new Error('Unexpected URL: ' + url);
  });

  const startRes = mockRes();
  await handler(
    mockReq({ method: 'POST', body: { prompt: 'Logistics in Durgapur' } }),
    startRes
  );
  assert.equal(startRes.statusCode, 502);
  const started = startRes.json();
  assert.equal(started.overall_status, 'failed');
  assert.equal(started.ui_state, 'Both engines failed');
  assert.equal(started.running, false);
});

test('5. Maps times out while Website completes', async () => {
  orchestrator.resetOrchestratorStateForTests();
  const handler = createTestHandler(async (url) => {
    if (url.endsWith('/api/scraper/run')) {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    }
    if (url.endsWith('/api/v1/auth/bootstrap')) {
      return jsonResp(200, { token: 'tok' });
    }
    if (url.endsWith('/api/campaign/start')) {
      return jsonResp(200, { job_id: 'web_t5' });
    }
    if (url.endsWith('/api/campaign/status/web_t5')) {
      return jsonResp(200, {
        status: 'completed',
        leads: [{ company_name: 'Dankuni 3PL Pvt Ltd', phone: '09831100000' }]
      });
    }
    throw new Error('Unexpected URL: ' + url);
  });

  const startRes = mockRes();
  await handler(mockReq({ method: 'POST', body: { prompt: '3PL in Dankuni' } }), startRes);
  const started = startRes.json();
  assert.equal(started.engines.maps.status, 'timed_out');
  assert.equal(started.engines.maps.error_code, 'ENGINE_TIMEOUT');
  assert.equal(started.ui_state, 'Website running; Maps failed');

  const pollRes = mockRes();
  await handler(
    mockReq({ method: 'GET', query: { campaign_id: started.campaign_id } }),
    pollRes
  );
  const polled = pollRes.json();
  assert.equal(polled.overall_status, 'partial_success');
  assert.equal(polled.ui_state, 'Completed with partial results');
  assert.equal(polled.leads.length, 1);
});

test('6. Website times out while Maps completes', async () => {
  orchestrator.resetOrchestratorStateForTests();
  const handler = createTestHandler(async (url) => {
    if (url.endsWith('/api/scraper/run')) {
      return jsonResp(200, { status: 'started' });
    }
    if (url.endsWith('/api/v1/auth/bootstrap')) {
      return jsonResp(200, { token: 'tok' });
    }
    if (url.endsWith('/api/campaign/start')) {
      const err = new Error('Request timed out');
      err.name = 'AbortError';
      throw err;
    }
    if (url.endsWith('/api/scraper/status')) {
      return jsonResp(200, { running: false });
    }
    if (url.includes('/api/scraper/leads')) {
      return jsonResp(200, {
        leads: [{ company_name: 'Haldia Petro Logistics', phone: '09830099999' }]
      });
    }
    throw new Error('Unexpected URL: ' + url);
  });

  const startRes = mockRes();
  await handler(mockReq({ method: 'POST', body: { prompt: 'Logistics in Haldia' } }), startRes);
  const started = startRes.json();
  assert.equal(started.engines.website.status, 'timed_out');
  assert.equal(started.ui_state, 'Maps running; Website failed');

  const pollRes = mockRes();
  await handler(
    mockReq({ method: 'GET', query: { campaign_id: started.campaign_id } }),
    pollRes
  );
  const polled = pollRes.json();
  assert.equal(polled.overall_status, 'partial_success');
  assert.equal(polled.ui_state, 'Completed with partial results');
  assert.equal(polled.leads.length, 1);
});

test('7. One engine returns malformed JSON', async () => {
  orchestrator.resetOrchestratorStateForTests();
  const handler = createTestHandler(async (url) => {
    if (url.endsWith('/api/scraper/run')) {
      return jsonResp(200, { status: 'started' });
    }
    if (url.endsWith('/api/v1/auth/bootstrap')) {
      return jsonResp(200, { token: 'tok' });
    }
    if (url.endsWith('/api/campaign/start')) {
      return textResp(200, '{invalid_json_payload:');
    }
    throw new Error('Unexpected URL: ' + url);
  });

  const startRes = mockRes();
  await handler(mockReq({ method: 'POST', body: { prompt: 'Foundries in Howrah' } }), startRes);
  const started = startRes.json();
  assert.equal(started.engines.website.status, 'failed');
  assert.equal(started.engines.website.error_code, 'MALFORMED_JSON');
  assert.equal(started.ui_state, 'Maps running; Website failed');
});

test('8. One engine returns HTTP 401, 403, 404, 429, and 500', async () => {
  const statusCodes = [
    [401, 'HTTP_401_UNAUTHORIZED'],
    [403, 'HTTP_403_FORBIDDEN'],
    [404, 'HTTP_404_NOT_FOUND'],
    [429, 'HTTP_429_RATE_LIMITED'],
    [500, 'HTTP_500_SERVER_ERROR']
  ];

  for (const [httpCode, expectedCode] of statusCodes) {
    orchestrator.resetOrchestratorStateForTests();
    const handler = createTestHandler(async (url) => {
      if (url.endsWith('/api/scraper/run')) {
        return jsonResp(200, { status: 'started' });
      }
      if (url.endsWith('/api/v1/auth/bootstrap')) {
        return jsonResp(200, { token: 'tok' });
      }
      if (url.endsWith('/api/campaign/start')) {
        return jsonResp(httpCode, { detail: `Simulated ${httpCode} error` });
      }
      throw new Error('Unexpected URL: ' + url);
    });

    const res = mockRes();
    await handler(mockReq({ method: 'POST', body: { prompt: 'Steel in Kolkata' } }), res);
    const body = res.json();
    assert.equal(body.engines.website.error_code, expectedCode);
    assert.equal(body.engines.website.status, 'failed');
    assert.equal(body.engines.maps.status, 'running');
  }
});

test('9. Website succeeds and returns its identifier under nested or alternate response fields', async () => {
  const variants = [
    { job_id: 'jb_direct_1' },
    { campaign_id: 'jb_campaign_2' },
    { data: { job_id: 'jb_nested_3' } },
    { job: { id: 'jb_obj_4' } }
  ];

  for (const payload of variants) {
    orchestrator.resetOrchestratorStateForTests();
    const handler = createTestHandler(async (url) => {
      if (url.endsWith('/api/scraper/run')) {
        return jsonResp(200, { status: 'started' });
      }
      if (url.endsWith('/api/v1/auth/bootstrap')) {
        return jsonResp(200, { token: 'tok' });
      }
      if (url.endsWith('/api/campaign/start')) {
        return jsonResp(200, payload);
      }
      throw new Error('Unexpected URL: ' + url);
    });

    const res = mockRes();
    await handler(mockReq({ method: 'POST', body: { prompt: 'Polymers in Kalyani' } }), res);
    const body = res.json();
    assert.ok(body.website_job_id);
    assert.equal(body.engines.website.status, 'running');
  }
});

test('10. Partial results remain available across polls even if one engine later errors', async () => {
  orchestrator.resetOrchestratorStateForTests();
  let pollCount = 0;
  const handler = createTestHandler(async (url) => {
    if (url.endsWith('/api/scraper/run')) return jsonResp(200, { status: 'started' });
    if (url.endsWith('/api/v1/auth/bootstrap')) return jsonResp(200, { token: 'tok' });
    if (url.endsWith('/api/campaign/start')) return jsonResp(200, { job_id: 'web_p10' });
    if (url.endsWith('/api/scraper/status')) {
      pollCount++;
      return jsonResp(200, { running: pollCount === 1 });
    }
    if (url.includes('/api/scraper/leads')) {
      return jsonResp(200, {
        leads: [{ company_name: 'Preserved Maps Co', phone: '09830077777' }]
      });
    }
    if (url.endsWith('/api/campaign/status/web_p10')) {
      return jsonResp(500, { detail: 'Website poll crashed mid-run' });
    }
    throw new Error('Unexpected URL: ' + url);
  });

  const startRes = mockRes();
  await handler(mockReq({ method: 'POST', body: { prompt: 'Packaging in Kolkata' } }), startRes);
  const started = startRes.json();

  const poll1 = mockRes();
  await handler(mockReq({ method: 'GET', query: { campaign_id: started.campaign_id } }), poll1);
  assert.equal(poll1.json().leads.length, 1);

  const poll2 = mockRes();
  await handler(mockReq({ method: 'GET', query: { campaign_id: started.campaign_id } }), poll2);
  const finalData = poll2.json();
  assert.equal(finalData.overall_status, 'partial_success');
  assert.equal(finalData.leads.length, 1);
  assert.equal(finalData.leads[0].company_name, 'Preserved Maps Co');
});

test('11. Duplicate leads are removed during aggregation while preserving phone leading zeroes', () => {
  const mapsLeads = [
    orchestrator.normalizeLead(
      {
        company_name: 'Eastern Forgings Pvt Ltd',
        decision_maker: 'Rajeshwar Northstar',
        phone: '09830041289',
        email: 'md@easternforgings.in',
        website: 'https://www.easternforgings.in/'
      },
      'Google Maps'
    )
  ];
  const websiteLeads = [
    orchestrator.normalizeLead(
      {
        company_name: 'eastern forgings pvt ltd',
        decision_maker: 'rajeshwar northstar',
        phone: '+91 09830041289'.replace('+91 ', ''),
        email: 'MD@EASTERNFORGINGS.IN',
        website: 'http://easternforgings.in'
      },
      'Website Search'
    )
  ];
  const merged = orchestrator.mergeLeads(mapsLeads, websiteLeads);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].phone, '09830041289');
});

test('12. One client cannot receive another client’s Maps results (cross-client isolation)', async () => {
  orchestrator.resetOrchestratorStateForTests();
  const handler = createTestHandler(async (url) => {
    if (url.endsWith('/api/scraper/run')) return jsonResp(200, { status: 'started' });
    if (url.endsWith('/api/v1/auth/bootstrap')) return jsonResp(200, { token: 'tok' });
    if (url.endsWith('/api/campaign/start')) return jsonResp(200, { job_id: 'web_c1' });
    throw new Error('Unexpected URL: ' + url);
  });

  // Client A starts a campaign
  const startA = mockRes();
  await handler(
    mockReq({
      method: 'POST',
      headers: { 'x-m360-client-scope': 'client_alpha' },
      body: { prompt: 'Steel in Howrah' }
    }),
    startA
  );
  const campaignA = startA.json();

  // Client B attempts to poll Client A's campaign -> must receive 403 Forbidden
  const pollB = mockRes();
  await handler(
    mockReq({
      method: 'GET',
      headers: { 'x-m360-client-scope': 'client_beta' },
      query: { campaign_id: campaignA.campaign_id }
    }),
    pollB
  );
  assert.equal(pollB.statusCode, 403);
  assert.equal(pollB.json().error_code, 'CROSS_CLIENT_FORBIDDEN');

  // Client B starts a concurrent campaign while Client A holds the Maps lease -> Maps is isolated from collision
  const startB = mockRes();
  await handler(
    mockReq({
      method: 'POST',
      headers: { 'x-m360-client-scope': 'client_beta' },
      body: { prompt: 'Clinics in Salt Lake' }
    }),
    startB
  );
  const campaignB = startB.json();
  assert.equal(campaignB.engines.maps.error_code, 'MAPS_BUSY_OTHER_CAMPAIGN');
  assert.equal(campaignB.engines.website.status, 'running');
});

test('13. A stale job cannot contaminate a new campaign', async () => {
  orchestrator.resetOrchestratorStateForTests();
  const handler = createTestHandler(async (url) => {
    if (url.endsWith('/api/scraper/run')) return jsonResp(200, { status: 'started' });
    if (url.endsWith('/api/v1/auth/bootstrap')) return jsonResp(200, { token: 'tok' });
    if (url.endsWith('/api/campaign/start')) return jsonResp(200, { job_id: 'fresh_web_job' });
    throw new Error('Unexpected URL: ' + url);
  });

  const startRes = mockRes();
  await handler(mockReq({ method: 'POST', body: { prompt: 'Steel in Kolkata' } }), startRes);
  const fresh = startRes.json();

  const stalePoll = mockRes();
  await handler(
    mockReq({
      method: 'GET',
      query: {
        campaign_id: fresh.campaign_id,
        website_job_id: 'stale_old_job_id'
      }
    }),
    stalePoll
  );
  assert.equal(stalePoll.statusCode, 409);
  assert.equal(stalePoll.json().error_code, 'STALE_JOB_MISMATCH');
});

test('14. Aggregate state model displays partial success instead of total failure', () => {
  const state = orchestrator.computeAggregateOrchestrationState(
    { status: 'completed', error_code: null },
    { status: 'failed', error_code: 'HTTP_500_SERVER_ERROR' },
    4,
    false
  );
  assert.equal(state.overall_status, 'partial_success');
  assert.equal(state.ui_state, 'Completed with partial results');
  assert.equal(state.running, false);
  assert.equal(state.partial_results, true);
});

test('15. Sanitized diagnostics contain no keys, tokens, cookies, or credentials', () => {
  const dirty =
    'Error with Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.secret and api_key="sk-proj-1234567890abcdef" password=mySecretPass123 cookie=session_id_xyz';
  const cleaned = orchestrator.sanitizeDiagnosticText(dirty);
  assert.ok(!cleaned.includes('eyJhbGciOiJIUzI1NiJ9'));
  assert.ok(!cleaned.includes('sk-proj-1234567890abcdef'));
  assert.ok(!cleaned.includes('mySecretPass123'));
  assert.ok(!cleaned.includes('session_id_xyz'));
  assert.ok(cleaned.includes('[REDACTED]'));
});

test('16. Requested lead count accepts digits and words, then defaults to ten', () => {
  assert.equal(orchestrator.parsePrompt('Get 1 manufacturer in Kolkata').limit,1);
  assert.equal(orchestrator.parsePrompt('Find 6000 manufacturers in Kolkata').limit,6000);
  const clarified=orchestrator.parsePrompt('Find 10 prospects for my business. Business industry or sector: dental Target location for prospect search: kolkata');
  assert.equal(clarified.query,'dental');
  assert.equal(clarified.location,'kolkata');
  assert.equal(orchestrator.parsePrompt('Find 3 verified leads in Pune').limit, 3);
  assert.equal(orchestrator.parsePrompt('Find three leads in Pune').limit, 3);
  assert.equal(orchestrator.parsePrompt('Find twenty-five prospects in Pune').limit, 25);
  assert.equal(orchestrator.parsePrompt('Find dentists in Pune').limit, 10);
});

test('17. Both engines receive the requested count and polling stops at that count', async () => {
  orchestrator.resetOrchestratorStateForTests();
  let mapsStartBody;
  let websiteStartBody;
  let websiteStartHeaders;
  let mapsStopped = false;
  const handler = createTestHandler(async (url, options = {}) => {
    if (url.endsWith('/api/scraper/run')) {
      mapsStartBody = JSON.parse(options.body);
      return jsonResp(200, { status: 'started', job_id: 'maps_limit_3' });
    }
    if (url.endsWith('/api/v1/auth/bootstrap')) return jsonResp(200, { token: 'tok' }, { 'set-cookie': 'session=test-session; HttpOnly; Secure' });
    if (url.endsWith('/api/campaign/start')) {
      websiteStartBody = JSON.parse(options.body);
      websiteStartHeaders = options.headers;
      return jsonResp(200, { job_id: 'web_limit_3' });
    }
    if (url.endsWith('/api/scraper/status')) return jsonResp(200, { running: true });
    if (url.includes('/api/scraper/leads?limit=5')) {
      return jsonResp(200, { leads: [
        { company_name: 'Lead One', phone: '1001' },
        { company_name: 'Lead Two', phone: '1002' },
        { company_name: 'Lead Three', phone: '1003' },
        { company_name: 'Lead Four', phone: '1004' },
        { company_name:'Lead Five',phone:'1005' },
        { company_name:'Lead Six',phone:'1006' }
      ] });
    }
    if (url.endsWith('/api/campaign/status/web_limit_3')) {
      return jsonResp(200, { status: 'running', leads: [
        { company_name: 'Website One', email: 'one@example.com' },
        { company_name: 'Website Two', email: 'two@example.com' }
      ] });
    }
    if (url.endsWith('/api/scraper/stop')) {
      mapsStopped = true;
      return jsonResp(200, { status: 'stopped' });
    }
    throw new Error('Unexpected URL: ' + url);
  });

  const startRes = mockRes();
  await handler(mockReq({ method: 'POST', body: { prompt: 'Find five dentists in Pune' } }), startRes);
  const started = startRes.json();
  assert.equal(started.target_limit, 5);
  assert.equal(mapsStartBody.max_results, 5);
  assert.equal(websiteStartBody.target_count, 5);
  assert.equal(websiteStartBody.client_id,'approved_test_client');
  assert.equal(websiteStartBody.filters.max_results, 5);
  assert.equal(websiteStartHeaders.Authorization, 'Bearer tok');
  assert.equal(websiteStartHeaders.Cookie, 'session=test-session');

  const pollRes = mockRes();
  await handler(mockReq({ method: 'GET', query: { campaign_id: started.campaign_id } }), pollRes);
  const result = pollRes.json();
  assert.equal(result.target_reached, true);
  assert.equal(result.running, false);
  assert.equal(result.leads.length, 5);
  assert.equal(mapsStopped, true);
});

test('Website refreshes a rejected session once without repeating a successful start',async()=>{
 orchestrator.resetOrchestratorStateForTests();let boots=0,starts=0;
 const handler=createTestHandler(async(url,options={})=>{
  if(url.endsWith('/api/scraper/run'))return jsonResp(200,{job_id:'maps_session_test'});
  if(url.endsWith('/api/v1/auth/bootstrap')){boots++;return jsonResp(200,{token:'session_'+boots},{'set-cookie':'session=cookie_'+boots+'; HttpOnly'});}
  if(url.endsWith('/api/campaign/start')){starts++;if(starts===1)return jsonResp(401,{detail:'Authentication required'});assert.equal(options.headers.Authorization,'Bearer session_3');assert.equal(options.headers.Cookie,'session=cookie_3');return jsonResp(200,{job_id:'website_session_test'});}
  throw Error('Unexpected request');
 });
 const result=mockRes();await handler(mockReq({method:'POST',body:{prompt:'Find 10 dentists in Kolkata'}}),result);
 assert.equal(result.statusCode,202);assert.equal(result.json().engines.website.status,'running');assert.equal(boots,3);assert.equal(starts,2);
});

test('Website refuses a campaign start when bootstrap cannot establish authentication',async()=>{
 orchestrator.resetOrchestratorStateForTests();let starts=0;
 const handler=createTestHandler(async(url)=>{
  if(url.endsWith('/api/scraper/run'))return jsonResp(200,{job_id:'maps_no_session'});
  if(url.endsWith('/api/v1/auth/bootstrap'))return jsonResp(200,{authenticated:false});
  starts++;throw Error('Campaign must not start without a session');
 });
 const result=mockRes();await handler(mockReq({method:'POST',body:{prompt:'Find 10 dentists in Kolkata'}}),result);
 assert.equal(starts,0);assert.equal(result.json().engines.website.error_code,'WEBSITE_PROFILE_NOT_LINKED');
});

test('one requested lead uses a valid provider batch and returns only one result',async()=>{
 orchestrator.resetOrchestratorStateForTests();let target;
 const handler=createTestHandler(async(url,options={})=>{
  if(url.endsWith('/api/v1/auth/bootstrap'))return jsonResp(200,{token:'synthetic'});
  if(url.endsWith('/api/scraper/run'))return jsonResp(503,{message:'unavailable'});
  if(url.endsWith('/api/campaign/start')){target=JSON.parse(options.body).target_count;return jsonResp(200,{job_id:'one_result_job'});}
  if(url.endsWith('/api/campaign/status/one_result_job'))return jsonResp(200,{status:'completed',leads:[{name:'One',email:'one@example.com'},{name:'Two',email:'two@example.com'}]});
  throw Error('Unexpected URL');
 });
 const start=mockRes();await handler(mockReq({method:'POST',body:{prompt:'Get 1 manufacturer in Kolkata'}}),start);assert.equal(start.json().target_limit,1);assert.equal(target,5);
 const poll=mockRes();await handler(mockReq({query:{campaign_id:start.json().campaign_id}}),poll);assert.equal(poll.json().leads.length,1);assert.equal(poll.json().target_reached,true);
});

test('a request larger than the provider maximum continues in bounded batches',async()=>{
 orchestrator.resetOrchestratorStateForTests();const targets=[];let starts=0,cancelled=false;
 const handler=createTestHandler(async(url,options={})=>{
  if(url.endsWith('/api/v1/auth/bootstrap'))return jsonResp(200,{token:'synthetic'});
  if(url.endsWith('/api/scraper/run'))return jsonResp(503,{message:'unavailable'});
  if(url.endsWith('/api/campaign/start')){targets.push(JSON.parse(options.body).target_count);return jsonResp(200,{job_id:'batch_'+(++starts)});}
  if(url.endsWith('/api/campaign/status/batch_1'))return jsonResp(200,{status:'completed',leads:Array.from({length:500},(_,i)=>({name:'Company '+i,email:i+'@example.com'}))});
  if(url.endsWith('/api/campaign/status/batch_2'))return jsonResp(200,{status:'completed',leads:[{name:'Last company',email:'last@example.com'}]});
  if(url.includes('/api/campaign/cancel/')){cancelled=true;return jsonResp(200,{status:'cancelled'});}
  throw Error('Unexpected URL');
 });
 const start=mockRes();await handler(mockReq({method:'POST',body:{prompt:'Find 501 manufacturers in Kolkata'}}),start);
 const poll=mockRes();await handler(mockReq({query:{campaign_id:start.json().campaign_id}}),poll);assert.equal(poll.json().running,true);assert.deepEqual(targets,[500,5]);
 const last=mockRes();await handler(mockReq({query:{campaign_id:start.json().campaign_id}}),last);assert.equal(last.json().target_reached,true);assert.equal(last.json().leads.length,501);
});
