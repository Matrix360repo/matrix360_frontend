const {workspaceContext,leadSearchContext}=require('./m360-workspace-context');
const LEGACY_MAPS =
  process.env.M360_MAPS_SCRAPER_URL ||
  'https://matrix360-romit-maps-v4-lowram-no-guard.onrender.com';
const WEBSITE =
  process.env.M360_WEBSITE_ENGINE_URL ||
  'https://matrix360-engine-v4-and-exports.onrender.com';

// Campaign isolation registry to prevent cross-client Maps leakage and stale job contamination
const CAMPAIGN_REGISTRY = new Map();
let ACTIVE_MAPS_LEASE = null;

function resetOrchestratorStateForTests() {
  CAMPAIGN_REGISTRY.clear();
  ACTIVE_MAPS_LEASE = null;
}

function reply(res, code, body) {
  res.statusCode = code;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch (_) {
      return Promise.resolve({});
    }
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 100000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function cleanText(value, max = 300) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.slice(0, max);
}

const NUMBER_WORDS = Object.freeze({
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  thousand: 1000
});

function parseNumberWords(value) {
  let total = 0;
  let current = 0;
  for (const word of value.toLowerCase().replace(/-/g, ' ').split(/\s+/)) {
    const number = NUMBER_WORDS[word];
    if (!number) return null;
    if (number === 100) current = Math.max(1, current) * number;
    else if (number === 1000) {
      total += Math.max(1, current) * number;
      current = 0;
    } else current += number;
  }
  return total + current || null;
}

function requestedLeadLimit(text) {
  const numeric = text.match(/\b(\d{1,9})\s+(?:verified\s+)?(?:leads?|prospects?|results?)\b/i) || text.match(/\b(?:find|get|generate)\s+(\d{1,9})\b/i);
  const words = text.match(
    /\b((?:(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)[ -]?){1,4})\s+(?:verified\s+)?(?:leads?|prospects?|results?)\b/i
  );
  const directWords=text.match(new RegExp('\\b(?:find|get|generate)\\s+((?:(?:'+Object.keys(NUMBER_WORDS).join('|')+')[ -]?){1,4})\\b','i'));
  const value = numeric ? Number(numeric[1]) : words ? parseNumberWords(words[1]) : directWords ? parseNumberWords(directWords[1].trim()) : 10;
  return Math.max(1, Number.isSafeInteger(value) ? value : 10);
}

/**
 * Strips any API keys, Bearer tokens, Basic auth, cookies, passwords, secrets, or session tokens
 * from diagnostic strings before logging or returning to the client.
 */
function sanitizeDiagnosticText(input, max = 240) {
  if (input === null || input === undefined) return '';
  let text = typeof input === 'string' ? input : JSON.stringify(input);
  text = text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/Basic\s+[A-Za-z0-9._~+/=-]+/gi, 'Basic [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_KEY]')
    .replace(
      /(["']?(?:api[_-]?key|openai[_-]?api[_-]?key|authorization|password|secret|token|cookie|set-cookie|service[_-]?role[_-]?key)["']?\s*[:=]\s*["']?)([^"',;\s}&]+)(["']?)/gi,
      '$1[REDACTED]$3'
    )
    .replace(/([?&](?:api_key|key|token|password|secret|auth)=)[^&#\s]+/gi, '$1[REDACTED]');
  return cleanText(text, max);
}

function classifyHttpErrorCode(status) {
  const code = Number(status) || 0;
  if (code === 400) return 'HTTP_400_BAD_REQUEST';
  if (code === 401) return 'HTTP_401_UNAUTHORIZED';
  if (code === 403) return 'HTTP_403_FORBIDDEN';
  if (code === 404) return 'HTTP_404_NOT_FOUND';
  if (code === 408 || code === 504) return 'ENGINE_TIMEOUT';
  if (code === 422) return 'HTTP_422_UNPROCESSABLE';
  if (code === 429) return 'HTTP_429_RATE_LIMITED';
  if (code >= 500) return `HTTP_${code}_SERVER_ERROR`;
  if (code >= 400) return `HTTP_${code}_ERROR`;
  return 'UNKNOWN_HTTP_ERROR';
}

function extractRemoteErrorDetail(data, rawText, status) {
  if (data && typeof data === 'object') {
    const detail =
      data.detail ||
      data.message ||
      data.error?.message ||
      data.error ||
      data.reason ||
      '';
    if (detail) return sanitizeDiagnosticText(detail);
  }
  if (rawText && String(rawText).trim()) {
    const trimmed = String(rawText).trim();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
      return `Remote service returned HTML error page (HTTP ${status || 'unknown'}).`;
    }
    return sanitizeDiagnosticText(trimmed);
  }
  return status ? `Remote service returned HTTP ${status}.` : 'Remote request failed.';
}

async function requestMaps(fetchImpl, path, workspace, options, timeoutMs) {
  const v5Url = process.env.M360_LEADS_PIPELINE_MAPS_URL?.trim();
  let baseUrl = LEGACY_MAPS;
  let proxyKey = process.env.M360_MAPS_V4_THREE_WORKER_KEY || process.env.M360_ROMIT_ORIGINAL_SCRAPER_PREVIEW_KEY || '';
  if (v5Url) {
    const parsed = URL.parse(v5Url);
    proxyKey = process.env.M360_MAPS_V5_PROXY_KEY?.trim() || '';
    if (!parsed || parsed.protocol !== 'https:' || parsed.username || parsed.password ||
        parsed.pathname !== '/' || parsed.search || parsed.hash || proxyKey.length < 32) {
      return { ok: false, status: 503, error_code: 'MAPS_NOT_CONFIGURED',
        error_message: 'The Leads & Pipeline Maps service needs an HTTPS origin and its gateway key.' };
    }
    baseUrl = parsed.origin;
  }
  const headers = {
    ...options.headers,
    ...(proxyKey ? { 'x-m360-preview-proxy-key': proxyKey } : {}),
    'x-m360-workspace-id': workspace || 'default_isolated_workspace'
  };
  return requestJsonDetailed(fetchImpl, `${baseUrl}/api/scraper/${path}`,
    { ...options, headers, ...(v5Url ? { redirect: 'error' } : {}) }, timeoutMs);
}

async function requestJsonDetailed(fetchImpl, url, options = {}, timeoutMs = 25000, captureSetCookie = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let data = null;
    let parseError = false;
    if (text && text.trim()) {
      try {
        data = JSON.parse(text);
      } catch (_) {
        parseError = true;
      }
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error_code: classifyHttpErrorCode(res.status),
        error_message: extractRemoteErrorDetail(data, text, res.status),
        data,
        raw_text: sanitizeDiagnosticText(text, 200)
      };
    }
    if (parseError) {
      return {
        ok: false,
        status: res.status,
        error_code: 'MALFORMED_JSON',
        error_message: 'Engine returned malformed non-JSON response payload.',
        data: null,
        raw_text: sanitizeDiagnosticText(text, 200)
      };
    }
    return {
      ok: true,
      status: res.status,
      error_code: null,
      error_message: null,
      data: data ?? {},
      set_cookie: captureSetCookie && res.headers?.get ? cleanText(res.headers.get('set-cookie'), 4000) : ''
    };
  } catch (err) {
    const isAbort =
      err &&
      (err.name === 'AbortError' ||
        /abort|timed?\s*out/i.test(String(err.message || '')));
    return {
      ok: false,
      status: 0,
      error_code: isAbort ? 'ENGINE_TIMEOUT' : 'NETWORK_ERROR',
      error_message: isAbort
        ? `Request timed out after ${timeoutMs}ms.`
        : sanitizeDiagnosticText(err?.message || 'Network request failed.'),
      data: null
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extracts a job identifier across all known and nested response schemas:
 * job_id, website_job_id, campaign_id, id, run_id, task_id, data.job_id, job.id, result.job_id
 */
function extractEngineJobId(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const candidates = [
    payload.job_id,
    payload.website_job_id,
    payload.maps_job_id,
    payload.campaign_id,
    payload.run_id,
    payload.task_id,
    payload.id,
    payload.data?.job_id,
    payload.data?.campaign_id,
    payload.data?.id,
    payload.job?.job_id,
    payload.job?.id,
    payload.result?.job_id,
    payload.result?.id
  ];
  for (const cand of candidates) {
    if (cand !== null && cand !== undefined) {
      const str = String(cand).trim();
      if (/^[A-Za-z0-9_.:-]{1,128}$/.test(str)) {
        return str;
      }
    }
  }
  return null;
}

function makeCampaignId() {
  return 'cmp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function resolveClientScope(req, body = {}) {
  const headerScope =
    req.verifiedWorkspace ||
    req.headers?.['x-m360-client-scope'] ||
    req.headers?.['x-client-id'] ||
    req.query?.client_scope ||
    body?.client_scope ||
    body?.workspace_id ||
    '';
  if (headerScope && String(headerScope).trim()) {
    return cleanText(headerScope, 64);
  }
  return 'default_isolated_workspace';
}

function parsePrompt(prompt) {
  const text = cleanText(prompt, 500);
  const search=leadSearchContext(prompt);
  const parts = text.split(/\s+\bin\b\s+/i);
  const industry = text.match(/Business industry or sector:\s*(.*?)(?=Target location for prospect search:|$)/i);
  const target = text.match(/Target location for prospect search:\s*(.+)$/i);
  const query = search.query || cleanText(industry?.[1] || parts[0] || text, 160);
  const location = search.location || cleanText(target?.[1] || parts[1] || '', 120);
  const lower = text.toLowerCase();
  const leadMode =
    /\b(doctor|ca|chartered|lawyer|advocate|founder|director|ceo|cfo|owner|partner|people|person|decision maker)\b/.test(
      lower
    )
      ? 'people'
      : 'organization';
  return { prompt: text, query, location, leadMode, limit: requestedLeadLimit(text) };
}

function normalizePhone(value) {
  const raw = cleanText(value, 80);
  if (!raw || /^\d+\.\d+e\+\d+$/i.test(raw)) return '';
  return raw;
}

function normalizeLead(raw, origin) {
  const company = cleanText(
    raw.company_name || raw.business_name || raw.organization || raw.name || raw.company || '',
    160
  );
  const contact = cleanText(
    raw.decision_maker || raw.person_name || raw.contact_name || raw.director_name || '',
    140
  );
  const role = cleanText(raw.role || raw.designation || raw.title || raw.category || '', 120);
  const phone = normalizePhone(raw.phone || raw.primary_phone || raw.mobile || raw.contact_phone || '');
  const email = cleanText(raw.email || raw.primary_email || raw.verified_email || '', 160);
  const website = cleanText(raw.website || raw.domain || raw.url || raw.source_url || '', 220);
  const location = cleanText(raw.location || raw.district || raw.address || raw.city || '', 160);
  const source = cleanText(raw.source_origin || raw.source || origin, 80);
  const fit = cleanText(raw.fit_reasoning || raw.reason || raw.ai_fit_reasoning || '', 220);
  if (!company && !contact) return null;
  if (!phone && !email && !website) return null;
  return {
    id: cleanText(raw.id || `${origin}-${company || contact}-${phone || email || website}`, 140),
    name: company || contact,
    company_name: company || contact,
    decision_maker: contact || 'Verified business listing',
    role: role || 'Business inquiry target',
    phone,
    email,
    website,
    location,
    source,
    stage: 'enquiry',
    fit_reasoning: fit || 'Verified public business or website contact signal.'
  };
}

function mergeLeads(mapsLeads, websiteLeads, limit = 50) {
  const seen = new Set();
  const out = [];
  for (const item of [...mapsLeads, ...websiteLeads]) {
    if (!item) continue;
    const key = [
      item.company_name.toLowerCase(),
      item.decision_maker.toLowerCase(),
      item.phone.replace(/\D+/g, ''),
      item.email.toLowerCase(),
      item.website.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '')
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(0, Math.max(1, Math.min(2000, Number(limit) || 50)));
}

function createEngineState(overrides = {}) {
  return {
    status: 'pending', // 'pending' | 'running' | 'completed' | 'failed' | 'timed_out' | 'cancelled'
    job_id: null,
    error_code: null,
    error_message: null,
    result_count: 0,
    completion_state: false,
    ...overrides
  };
}

/**
 * Computes overall workflow status and explicit UI state label from the two symmetric engine states.
 */
function computeAggregateOrchestrationState(mapsEngine, websiteEngine, totalLeadsCount, isCancelled = false) {
  if (isCancelled || mapsEngine.status === 'cancelled' || websiteEngine.status === 'cancelled') {
    return {
      overall_status: 'cancelled',
      ui_state: 'Cancelled',
      running: false,
      partial_results: totalLeadsCount > 0,
      message: 'Lead discovery was cancelled.'
    };
  }

  const mStatus = mapsEngine.status;
  const wStatus = websiteEngine.status;
  const mActive = mStatus === 'pending' || mStatus === 'running';
  const wActive = wStatus === 'pending' || wStatus === 'running';
  const mDone = mStatus === 'completed';
  const wDone = wStatus === 'completed';
  const mFailed = mStatus === 'failed' || mStatus === 'timed_out';
  const wFailed = wStatus === 'failed' || wStatus === 'timed_out';
  const anyTimedOut = mStatus === 'timed_out' || wStatus === 'timed_out';

  // Active states
  if (mActive && wActive) {
    return {
      overall_status: 'running',
      ui_state: 'Both engines running',
      running: true,
      partial_results: false,
      message: 'Both Maps and Website lead engines are actively running.'
    };
  }
  if (mActive && (wFailed || wDone)) {
    return {
      overall_status: 'running_partial',
      ui_state: wFailed ? 'Maps running; Website failed' : 'Both engines running',
      running: true,
      partial_results: true,
      message: wFailed
        ? `Maps engine is running; Website engine failed (${websiteEngine.error_code || 'ERROR'}). Preserving Maps results.`
        : 'Maps engine is still running; Website engine completed.'
    };
  }
  if (wActive && (mFailed || mDone)) {
    return {
      overall_status: 'running_partial',
      ui_state: mFailed ? 'Website running; Maps failed' : 'Both engines running',
      running: true,
      partial_results: true,
      message: mFailed
        ? `Website engine is running; Maps engine failed (${mapsEngine.error_code || 'ERROR'}). Preserving Website results.`
        : 'Website engine is still running; Maps engine completed.'
    };
  }

  // Terminal states (neither engine remains active)
  if (mDone && wDone) {
    return {
      overall_status: 'completed',
      ui_state: 'Completed successfully',
      running: false,
      partial_results: false,
      message: `Completed successfully with ${totalLeadsCount} verified lead(s).`
    };
  }

  if ((mDone && wFailed) || (wDone && mFailed)) {
    const failedName = mFailed ? 'Maps' : 'Website';
    const succeededName = mDone ? 'Maps' : 'Website';
    const failedEngine = mFailed ? mapsEngine : websiteEngine;
    return {
      overall_status: 'partial_success',
      ui_state: 'Completed with partial results',
      running: false,
      partial_results: true,
      message: `${succeededName} completed (${totalLeadsCount} lead(s) preserved); ${failedName} ${
        failedEngine.status === 'timed_out' ? 'timed out' : 'failed'
      } (${failedEngine.error_code || 'ERROR'}).`
    };
  }

  if (anyTimedOut && totalLeadsCount === 0) {
    return {
      overall_status: 'timed_out',
      ui_state: 'Timed out',
      running: false,
      partial_results: false,
      message: 'Lead engines timed out before returning verified leads.'
    };
  }

  return {
    overall_status: 'failed',
    ui_state: 'Both engines failed',
    running: false,
    partial_results: false,
    message: 'Both lead engines failed to start or complete.'
  };
}

async function websiteFetchDetailed(fetchImpl, path, options = {}, timeoutMs = 25000) {
  // A rejected session can be refreshed once; never retry a successful campaign start.
  for (let attempt = 0; attempt < 2; attempt++) {
    const boot = await requestJsonDetailed(fetchImpl, `${WEBSITE}/api/v1/auth/bootstrap`, { method: 'POST' }, 45000, true);
    if (!boot.ok) return boot;
    const token = boot.data?.token;
    if (typeof token !== 'string' || !token) return {ok:false,status:401,error_code:'WEBSITE_SESSION_UNAVAILABLE',error_message:'Website research could not establish a session.'};
    const headers = {...(options.headers || {}), Authorization:'Bearer '+token};
    if (boot.set_cookie) headers.Cookie = boot.set_cookie.split(';', 1)[0];
    const result = await requestJsonDetailed(fetchImpl, WEBSITE+path, {...options,headers}, timeoutMs);
    if (result.status !== 401 || attempt === 1) return result;
  }
}

async function approvedWebsiteClient(req,fetchImpl){
  let mapping={};try{mapping=JSON.parse(process.env.M360_WEBSITE_WORKSPACE_MAP||'{}');}catch{}
  const approved=require('./m360-approved-website-links.json')[req.verifiedWorkspace];
  const verifiedLink=approved&&String(req.workspaceMembership?.name||'').trim().toLowerCase()===approved.workspace_name.toLowerCase()?approved.client_id:undefined;
  const configured=mapping&&Object.hasOwn(mapping,req.verifiedWorkspace)?mapping[req.verifiedWorkspace]:req.workspaceMembership?.website_client_id||verifiedLink;
  if(configured!==undefined){
    if(typeof configured!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(configured))return null;
    const check=await websiteFetchDetailed(fetchImpl,'/api/campaign/profile/'+encodeURIComponent(configured));
    return check.ok?configured:null;
  }
  // Company names are not tenant identity. A CRM field or owner-approved map must bind the profile.
  return null;
}

async function startDiscovery(req, res, fetchImpl) {
  const body = await readBody(req);
  const parsed = parsePrompt(body.prompt || body.command || body.query || '');
  const search=leadSearchContext(body.prompt||body.command||body.query||'');
  if(search.missing)return reply(res,422,{status:'error',missing_information:[search.missing],message:search.missing==='Target location for prospect search'?'Choose a city, region or area before starting discovery.':'Choose a prospect type or industry before starting discovery.'});
  if (!parsed.query) {
    return reply(res, 400, {
      status: 'error',
      overall_status: 'failed',
      ui_state: 'Both engines failed',
      message: 'Please describe the leads you want to find before starting discovery.'
    });
  }

  if(!parsed.location)return reply(res,422,{status:'error',missing_information:['Target location for prospect search'],message:'Choose a city, region or area before starting discovery.'});
  const context=await workspaceContext(req.verifiedWorkspace,req.workspaceMembership,fetchImpl);
  const campaignId = makeCampaignId();
  const clientScope = resolveClientScope(req, body);
  const nowMs = Date.now();

  // Check if Maps is already leased to another active client campaign to prevent cross-client collision
  const mapsBusyForOtherClient =
    ACTIVE_MAPS_LEASE &&
    ACTIVE_MAPS_LEASE.campaign_id !== campaignId &&
    nowMs - ACTIVE_MAPS_LEASE.started_at_ms < 120000;

  const mapsDispatchPromise = mapsBusyForOtherClient
    ? Promise.resolve({
        ok: false,
        status: 409,
        error_code: 'MAPS_BUSY_OTHER_CAMPAIGN',
        error_message: 'Maps engine is currently leased to another active campaign; isolated to prevent cross-client data leakage.',
        data: null
      })
    : requestMaps(
        fetchImpl,
        'run',
        clientScope,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: parsed.query,
            location: parsed.location,
            max_results: Math.min(2000,parsed.limit),
            contact_filter: 'all',
            pvt_ltd_only: false,
            target_titles: 'Founder, Owner, MD, CEO, Director, Partner',
            exclusions: 'junior roles',
            company_size: '11-50 to 1,001-5,000',
            apply_suppression: true,
            campaign_id: campaignId
          })
        },
        55000
      );

  let websiteClientId=null;
  const websiteDispatchPromise = (async()=>{
   const client=await approvedWebsiteClient(req,fetchImpl);
   if(!client)return {ok:false,status:409,error_code:'WEBSITE_PROFILE_NOT_LINKED',error_message:'Website discovery needs an approved client profile linked to this workspace. No default client was used. Maps can continue.'};
   websiteClientId=client;
   return websiteFetchDetailed(
    fetchImpl,
    '/api/campaign/start',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: client,
        target_count: Math.max(5,Math.min(500,parsed.limit)),
        prompt: parsed.prompt+'\nSearch industry: '+parsed.query+'\nSearch area: '+parsed.location,
        lead_mode: parsed.leadMode,
        max_results: parsed.limit,
        filters: { max_results: parsed.limit }
      })
    },
    30000
  );
  })();

  const [mapsRes, websiteRes] = await Promise.all([mapsDispatchPromise, websiteDispatchPromise]);

  // 1. Evaluate Maps start result
  let mapsEngine;
  if (mapsRes.ok && mapsRes.data?.status !== 'error') {
    const remoteMapsJobId = extractEngineJobId(mapsRes.data);
    const mapsJobId = remoteMapsJobId || `maps_${campaignId}`;
    ACTIVE_MAPS_LEASE = {
      campaign_id: campaignId,
      maps_job_id: mapsJobId,
      client_scope: clientScope,
      started_at_ms: nowMs
    };
    mapsEngine = createEngineState({
      status: 'running',
      job_id: mapsJobId,
      error_code: null,
      error_message: null,
      result_count: 0,
      completion_state: false
    });
  } else {
    mapsEngine = createEngineState({
      status: mapsRes.error_code === 'ENGINE_TIMEOUT' ? 'timed_out' : 'failed',
      job_id: null,
      error_code: mapsRes.error_code || 'MAPS_START_FAILED',
      error_message: sanitizeDiagnosticText(
        mapsRes.error_message || mapsRes.data?.message || 'Maps scraper failed to start.'
      ),
      result_count: 0,
      completion_state: true
    });
  }

  // 2. Evaluate Website start result (check all possible job ID fields)
  let websiteEngine;
  const websiteJobId = websiteRes.ok ? extractEngineJobId(websiteRes.data) : null;
  if (websiteRes.ok && websiteJobId) {
    websiteEngine = createEngineState({
      status: 'running',
      job_id: websiteJobId,
      error_code: null,
      error_message: null,
      result_count: 0,
      completion_state: false
    });
  } else if (websiteRes.ok && !websiteJobId) {
    // Response was 2xx JSON, but contained no recognizable job ID field
    const keysSeen =
      websiteRes.data && typeof websiteRes.data === 'object'
        ? Object.keys(websiteRes.data).slice(0, 8).join(',')
        : 'none';
    websiteEngine = createEngineState({
      status: 'failed',
      job_id: null,
      error_code: 'MISSING_JOB_ID_IN_RESPONSE',
      error_message: sanitizeDiagnosticText(
        websiteRes.data?.message ||
          websiteRes.data?.detail ||
          `Website service returned HTTP ${websiteRes.status} without a job ID (keys: ${keysSeen}).`
      ),
      result_count: 0,
      completion_state: true
    });
  } else {
    websiteEngine = createEngineState({
      status: websiteRes.error_code === 'ENGINE_TIMEOUT' ? 'timed_out' : 'failed',
      job_id: null,
      error_code: websiteRes.error_code || 'WEBSITE_START_FAILED',
      error_message: sanitizeDiagnosticText(
        websiteRes.error_message || 'Website scraper failed to start.'
      ),
      result_count: 0,
      completion_state: true
    });
  }

  const campaignState = {
    campaign_id: campaignId,
    client_scope: clientScope,
    workspace_context:context,
    website_client_id:websiteClientId,
    website_batches:1,
    website_previous_count:0,
    created_at_ms: nowMs,
    prompt: parsed.prompt,
    query: parsed.query,
    location: parsed.location,
    limit: parsed.limit,
    cancelled: false,
    engines: {
      maps: mapsEngine,
      website: websiteEngine
    },
    maps_leads: [],
    website_leads: []
  };

  CAMPAIGN_REGISTRY.set(campaignId, campaignState);

  const agg = computeAggregateOrchestrationState(mapsEngine, websiteEngine, 0, false);
  const httpCode = mapsEngine.status === 'running' || websiteEngine.status === 'running' ? 202 : 502;

  return reply(res, httpCode, {
    status: agg.overall_status === 'failed' ? 'error' : 'accepted',
    overall_status: agg.overall_status,
    ui_state: agg.ui_state,
    running: agg.running,
    partial_results: agg.partial_results,
    campaign_id: campaignId,
    maps_job_id: mapsEngine.job_id,
    website_job_id: websiteEngine.job_id,
    query: parsed.query,
    location: parsed.location,
    target_limit: parsed.limit,
    workspace_context:context,
    engines: {
      maps: mapsEngine,
      website: websiteEngine
    },
    message: agg.message
  });
}

async function pollStatus(req, res, fetchImpl) {
  const campaignId = cleanText(req.query?.campaign_id || '', 128);
  const mapsJobParam = cleanText(req.query?.maps_job_id || '', 128);
  const websiteJobParam = cleanText(req.query?.website_job_id || '', 128);
  const clientScope = resolveClientScope(req, {});

  let record = campaignId ? CAMPAIGN_REGISTRY.get(campaignId) : null;

  // Allow lookup by website_job_id or maps_job_id if campaign_id was omitted, provided at least one valid job ref exists
  if (!record && (websiteJobParam || mapsJobParam)) {
    for (const candidate of CAMPAIGN_REGISTRY.values()) {
      if (
        (websiteJobParam && candidate.engines.website.job_id === websiteJobParam) ||
        (mapsJobParam && candidate.engines.maps.job_id === mapsJobParam)
      ) {
        record = candidate;
        break;
      }
    }
  }

  // Unknown jobs cannot be adopted from browser-supplied provider identifiers.
  if(!record)return reply(res,404,{status:'error',message:'Campaign is unavailable in this server session. Start a new authorized search.'});

  // Enforce strict tenant/client scope isolation so one client can never receive another client's Maps/Website results
  if (
    record.client_scope &&
    clientScope !== 'default_isolated_workspace' &&
    record.client_scope !== 'default_isolated_workspace' &&
    record.client_scope !== clientScope
  ) {
    return reply(res, 403, {
      status: 'error',
      overall_status: 'failed',
      ui_state: 'Both engines failed',
      error_code: 'CROSS_CLIENT_FORBIDDEN',
      message: 'Access denied: campaign belongs to a different isolated client workspace.'
    });
  }

  // Reject stale job pollution if caller passes a mismatched campaign_id + job_id pair
  if (
    websiteJobParam &&
    record.engines.website.job_id &&
    websiteJobParam !== record.engines.website.job_id
  ) {
    return reply(res, 409, {
      status: 'error',
      overall_status: 'failed',
      error_code: 'STALE_JOB_MISMATCH',
      message: 'Stale website_job_id does not match the active campaign.'
    });
  }

  if (
    mapsJobParam &&
    record.engines.maps.job_id &&
    mapsJobParam !== record.engines.maps.job_id
  ) {
    return reply(res, 409, {
      status: 'error',
      overall_status: 'failed',
      error_code: 'STALE_JOB_MISMATCH',
      message: 'Stale maps_job_id does not match the active campaign.'
    });
  }

  const mapsEngine = record.engines.maps;
  const websiteEngine = record.engines.website;

  // Poll Maps ONLY if Maps actually started with a job_id AND holds the matching lease (or is stateless with explicit maps_job_id)
  const canPollMaps =
    !record.cancelled &&
    mapsEngine.job_id &&
    !mapsEngine.completion_state &&
    (!ACTIVE_MAPS_LEASE || ACTIVE_MAPS_LEASE.maps_job_id === mapsEngine.job_id);

  // Poll Website ONLY if Website actually started with a job_id
  const canPollWebsite = !record.cancelled && websiteEngine.job_id && !websiteEngine.completion_state;

  const pollTasks = [];

  if (canPollMaps) {
    pollTasks.push(
      (async () => {
        const options = { headers: { Accept: 'application/json' } };
        const [mStatusRes, mLeadsRes] = await Promise.all([
          requestMaps(fetchImpl, 'status', record.client_scope, options, 15000),
          requestMaps(fetchImpl, `leads?limit=${encodeURIComponent(record.limit)}`,
            record.client_scope, options, 15000)
        ]);

        if (mLeadsRes.ok && Array.isArray(mLeadsRes.data?.leads)) {
          const normalized = mLeadsRes.data.leads
            .map((item) => normalizeLead(item, 'Google Maps'))
            .filter(Boolean);
          if (normalized.length > 0) {
            record.maps_leads = mergeLeads(record.maps_leads, normalized, record.limit);
          }
          mapsEngine.result_count = record.maps_leads.length;
        }

        if (!mStatusRes.ok) {
          mapsEngine.status =
            mStatusRes.error_code === 'ENGINE_TIMEOUT' ? 'timed_out' : 'failed';
          mapsEngine.error_code = mStatusRes.error_code || 'MAPS_POLL_FAILED';
          mapsEngine.error_message = sanitizeDiagnosticText(
            mStatusRes.error_message || 'Failed to poll Maps status.'
          );
          mapsEngine.completion_state = true;
          if (ACTIVE_MAPS_LEASE && ACTIVE_MAPS_LEASE.maps_job_id === mapsEngine.job_id) {
            ACTIVE_MAPS_LEASE = null;
          }
          return;
        }

        const sData = mStatusRes.data || {};
        const stillRunning = Boolean(sData.running);
        if (stillRunning) {
          mapsEngine.status = 'running';
          mapsEngine.completion_state = false;
        } else {
          mapsEngine.status = 'completed';
          mapsEngine.completion_state = true;
          if (ACTIVE_MAPS_LEASE && ACTIVE_MAPS_LEASE.maps_job_id === mapsEngine.job_id) {
            ACTIVE_MAPS_LEASE = null;
          }
        }
      })()
    );
  }

  if (canPollWebsite) {
    pollTasks.push(
      (async () => {
        const wRes = await websiteFetchDetailed(
          fetchImpl,
          `/api/campaign/status/${encodeURIComponent(websiteEngine.job_id)}`,
          {},
          15000
        );

        if (!wRes.ok) {
          websiteEngine.status =
            wRes.error_code === 'ENGINE_TIMEOUT' ? 'timed_out' : 'failed';
          websiteEngine.error_code = wRes.error_code || 'WEBSITE_POLL_FAILED';
          websiteEngine.error_message = sanitizeDiagnosticText(
            wRes.error_message || 'Failed to poll Website scraper status.'
          );
          websiteEngine.completion_state = true;
          return;
        }

        const wData = wRes.data || {};
        if (Array.isArray(wData.leads)) {
          const normalized = wData.leads
            .map((item) => normalizeLead(item, 'Website Search'))
            .filter(Boolean);
          if (normalized.length > 0) {
            record.website_leads = mergeLeads(record.website_leads, normalized, record.limit);
          }
          websiteEngine.result_count = record.website_leads.length;
        }

        const rawStatus = String(wData.status || '').toLowerCase();
        if (rawStatus === 'failed' || rawStatus === 'error') {
          websiteEngine.status = 'failed';
          websiteEngine.error_code = 'WEBSITE_JOB_FAILED';
          websiteEngine.error_message = sanitizeDiagnosticText(
            wData.error || wData.message || 'Website campaign job reported failure.'
          );
          websiteEngine.completion_state = true;
        } else if (rawStatus === 'completed' || rawStatus === 'done' || rawStatus === 'success') {
          websiteEngine.status = 'completed';
          websiteEngine.completion_state = true;
        } else {
          websiteEngine.status = 'running';
          websiteEngine.completion_state = false;
        }
      })()
    );
  }

  await Promise.all(pollTasks);

  const combinedLeads = mergeLeads(record.maps_leads, record.website_leads, record.limit);
  const targetReached = combinedLeads.length >= record.limit;
  // Bounded batches satisfy one logical request without changing the provider's API limits.
  if(!targetReached&&!record.cancelled&&record.limit>500&&websiteEngine.status==='completed'&&record.website_client_id&&record.website_leads.length-record.website_previous_count>=500&&record.website_batches<20){
    record.website_previous_count=record.website_leads.length;record.website_batches++;
    const next=await websiteFetchDetailed(fetchImpl,'/api/campaign/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:record.website_client_id,target_count:Math.max(5,Math.min(500,record.limit-combinedLeads.length)),prompt:record.prompt+' Search industry: '+record.query+' Search area: '+record.location})},30000);
    const job=next.ok?extractEngineJobId(next.data):null;
    if(job){websiteEngine.job_id=job;websiteEngine.status='running';websiteEngine.completion_state=false;}
  }
  if (targetReached) {
    if(websiteEngine.job_id&&!websiteEngine.completion_state){
      const stopped=await websiteFetchDetailed(fetchImpl,'/api/campaign/cancel/'+encodeURIComponent(websiteEngine.job_id),{method:'POST'},8000);
      websiteEngine.stop_confirmed=stopped.ok;
    }
    if (mapsEngine.job_id && !mapsEngine.completion_state) {
      await requestMaps(fetchImpl, 'stop', record.client_scope, { method: 'POST' }, 8000);
      if (ACTIVE_MAPS_LEASE?.maps_job_id === mapsEngine.job_id) ACTIVE_MAPS_LEASE = null;
    }
    for (const engine of [mapsEngine, websiteEngine]) {
      if (!engine.completion_state) {
        engine.status = 'completed';
        engine.completion_state = true;
      }
    }
  }
  const agg = computeAggregateOrchestrationState(
    mapsEngine,
    websiteEngine,
    combinedLeads.length,
    record.cancelled
  );

  return reply(res, 200, {
    status: 'ok',
    overall_status: agg.overall_status,
    ui_state: agg.ui_state,
    running: agg.running,
    partial_results: agg.partial_results,
    campaign_id: record.campaign_id,
    maps_job_id: mapsEngine.job_id,
    website_job_id: websiteEngine.job_id,
    target_limit: record.limit,
    target_reached: targetReached,
    engines: {
      maps: mapsEngine,
      website: websiteEngine
    },
    counts: {
      maps: record.maps_leads.length,
      website: record.website_leads.length,
      total: combinedLeads.length
    },
    leads: combinedLeads,
    message: targetReached
      ? `Target reached: ${combinedLeads.length} verified lead(s) are ready.`
      : agg.message
  });
}

async function cancelDiscovery(req, res, fetchImpl) {
  const body = await readBody(req);
  const campaignId = cleanText(body.campaign_id || req.query?.campaign_id || '', 128);
  const record = campaignId ? CAMPAIGN_REGISTRY.get(campaignId) : null;

  if(record&&record.client_scope!==req.verifiedWorkspace)return reply(res,403,{status:'error',message:'Campaign belongs to a different workspace.'});
  if(record)record.cancelled=true;

  // Attempt to stop Maps if it was running for this campaign
  if (
    record &&
    record.engines.maps.job_id &&
    !record.engines.maps.completion_state
  ) {
    await requestMaps(fetchImpl, 'stop', record.client_scope, { method: 'POST' }, 8000);
    record.engines.maps.status = 'cancelled';
    record.engines.maps.completion_state = true;
    if (ACTIVE_MAPS_LEASE && ACTIVE_MAPS_LEASE.maps_job_id === record.engines.maps.job_id) {
      ACTIVE_MAPS_LEASE = null;
    }
  }

  if (record) {
    if(record.engines.website.job_id&&!record.engines.website.completion_state){
      const stopped=await websiteFetchDetailed(fetchImpl,'/api/campaign/cancel/'+encodeURIComponent(record.engines.website.job_id),{method:'POST'},8000);
      record.engines.website.stop_confirmed=stopped.ok;
    }
    record.cancelled = true;
    if (!record.engines.website.completion_state) {
      record.engines.website.status = 'cancelled';
      record.engines.website.completion_state = true;
    }
    const combinedLeads = mergeLeads(record.maps_leads, record.website_leads, record.limit);
    return reply(res, 200, {
      status: 'ok',
      overall_status: 'cancelled',
      ui_state: 'Cancelled',
      running: false,
      partial_results: combinedLeads.length > 0,
      campaign_id: record.campaign_id,
      target_limit: record.limit,
      engines: record.engines,
      counts: {
        maps: record.maps_leads.length,
        website: record.website_leads.length,
        total: combinedLeads.length
      },
      leads: combinedLeads,
      message: 'Lead discovery cancelled. Any partial results collected so far have been preserved.'
    });
  }

  return reply(res, 200, {
    status: 'ok',
    overall_status: 'cancelled',
    ui_state: 'Cancelled',
    running: false,
    partial_results: false,
    message: 'Lead discovery cancelled.'
  });
}

function createUnifiedLeadsHandler(fetchImpl = fetch) {
  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-M360-Client-Scope');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const input=req.method==='POST'?await readBody(req):req.query||{};
    const workspace=String(input.workspace_id||req.query?.workspace_id||'');
    const bearer=String(req.headers?.authorization||'');
    if(!/^Bearer [A-Za-z0-9_.-]{20,8000}$/.test(bearer))return reply(res,401,{status:'error',message:'Sign in before using lead discovery.'});
    if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(workspace))return reply(res,400,{status:'error',message:'Select a valid workspace.'});
    let access;try{
      const r=await fetchImpl('https://matrix360-crm-backend-p9os.onrender.com/me/workspaces',{headers:{Authorization:bearer,Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!r.ok)return reply(res,r.status===401?401:503,{status:'error',message:'CRM session could not be verified.'});
      const rows=await r.json();access=Array.isArray(rows)?rows.find(row=>String(row?.id)===workspace):null;
    }catch{return reply(res,503,{status:'error',message:'CRM permissions are unavailable.'});}
    if(!access)return reply(res,403,{status:'error',message:'This workspace is not authorized.'});
    if(req.method==='POST'&&!['platform_owner','agency_admin','client_admin','marketing_operator','sales_operator'].includes(access.role))return reply(res,403,{status:'error',message:'Your role cannot start or change discovery.'});
    req.verifiedWorkspace=workspace;req.workspaceMembership=access;req.body=input;
    const action = cleanText(req.query?.action || '', 40).toLowerCase();
    if (req.method === 'POST' && action === 'cancel') {
      return cancelDiscovery(req, res, fetchImpl);
    }
    if (req.method === 'POST') return startDiscovery(req, res, fetchImpl);
    if (req.method === 'GET') return pollStatus(req, res, fetchImpl);
    return reply(res, 405, { status: 'error', message: 'Method not allowed.' });
  };
}

const handler = createUnifiedLeadsHandler();
handler.createUnifiedLeadsHandler = createUnifiedLeadsHandler;
handler.normalizeLead = normalizeLead;
handler.mergeLeads = mergeLeads;
handler.sanitizeDiagnosticText = sanitizeDiagnosticText;
handler.extractEngineJobId = extractEngineJobId;
handler.computeAggregateOrchestrationState = computeAggregateOrchestrationState;
handler.parsePrompt = parsePrompt;
handler.resetOrchestratorStateForTests = resetOrchestratorStateForTests;
module.exports = handler;
