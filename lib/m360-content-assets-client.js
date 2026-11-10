'use strict';

const { createHash } = require('node:crypto');

const DB = 'https://pmlacujsnnvbrimxbhpu.supabase.co';
const clientId = workspaceId => 'm360-' + createHash('sha256').update('matrix360-crm-tenant-v1:' + workspaceId).digest('hex').slice(0, 28);

async function loadSavedContentAssets(workspaceId, fetchImpl = fetch) {
  const key = process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY || '';
  if (key.length < 30) return { status: 'blocked', code: 'CONTENT_STORAGE_NOT_CONFIGURED', assets: [] };
  const tenant = clientId(workspaceId);
  const url = `${DB}/rest/v1/m360_poster_versions?workspace_id=eq.${encodeURIComponent(tenant)}&select=poster_id,version,channel,plan,created_at&order=created_at.desc&limit=100`;
  let response;
  try {
    response = await fetchImpl(url, { headers: { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }), Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
  } catch { return { status: 'failed', code: 'CONTENT_STORAGE_UNREACHABLE', assets: [] }; }
  if (!response.ok) return { status: 'failed', code: `CONTENT_STORAGE_HTTP_${response.status}`, assets: [] };
  const rows = await response.json().catch(() => null);
  if (!Array.isArray(rows)) return { status: 'failed', code: 'CONTENT_STORAGE_INVALID_RESPONSE', assets: [] };
  const seen = new Set(), assets = [];
  for (const row of rows) {
    const id = `${row.poster_id}:v${row.version}`;
    if (!row.poster_id || !Number.isInteger(row.version) || seen.has(id)) continue;
    seen.add(id);
    assets.push({ id, kind: 'poster', approval_state: 'saved_content_studio_version', metadata: { poster_id: row.poster_id, version: row.version, channel: row.channel || '', headline: String(row.plan?.headline || '').slice(0, 160), created_at: row.created_at } });
  }
  return { status: 'completed', assets };
}

async function loadEmailCreative(workspaceId, posterId, version, fetchImpl=fetch) {
  if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(posterId||'')||!Number.isInteger(version)||version<1||version>250)throw Error('Choose a saved creative version.');
  const key=process.env.M360_AI_TRIAL_SUPABASE_SERVICE_KEY||'';
  if(key.length<30)throw Error('Private creative storage is not configured.');
  const tenant=clientId(workspaceId),headers={apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key})};
  const rowResponse=await fetchImpl(`${DB}/rest/v1/m360_poster_versions?workspace_id=eq.${tenant}&poster_id=eq.${posterId}&version=eq.${version}&select=poster_id,version,image_path,plan`,{headers,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(16000)});
  const rows=rowResponse.ok?await rowResponse.json():null;
  if(!Array.isArray(rows)||rows.length!==1||rows[0].image_path!==`${tenant}/${posterId}/${version}.jpg`)throw Error('Saved creative version is unavailable for this workspace.');
  const response=await fetchImpl(`${DB}/storage/v1/object/authenticated/matrix360-poster-history/${tenant}/${posterId}/${version}-final.jpg`,{headers,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(16000)});
  if(!response.ok)throw Error('The branded creative is not saved yet. Reopen it in Content Creation and retry saving.');
  if(Number(response.headers?.get('content-length'))>2900000)throw Error('Email creative exceeds the image size limit.');
  const image=Buffer.from(await response.arrayBuffer());
  if(image.length<5000||image.length>2900000||image[0]!==255||image[1]!==216||image[2]!==255)throw Error('Saved email creative is not a supported JPEG.');
  const plan=rows[0].plan||{};
  return {image,creative:{poster_id:posterId,version,sha256:createHash('sha256').update(image).digest('hex'),mime:'image/jpeg',filename:'campaign-creative.jpg',headline:String(plan.headline||'Campaign creative').slice(0,160),caption:String(plan.caption||'').slice(0,5000)}};
}

module.exports = { loadSavedContentAssets, loadEmailCreative };
