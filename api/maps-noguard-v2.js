'use strict';
const crypto=require('node:crypto');
const CRM='https://matrix360-crm-backend-p9os.onrender.com';
const MAPS='https://matrix360-romit-maps-v4-lowram-no-guard.onrender.com';
const SESSION='m360_scraper_auth_v2',WORKSPACE='m360_scraper_ws_v2';
const ROUTES=new Map([['GET:status','read'],['GET:leads','read'],['GET:export.csv','read'],['GET:suppression','read'],['POST:run','write'],['POST:stop','write'],['POST:suppression','write'],['DELETE:leads','write']]);
const ROLES=new Set(['platform_owner','agency_admin','client_admin','marketing_operator','sales_operator']);
function fail(res,code,message){res.statusCode=code;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');return res.end(JSON.stringify({status:'error',message}));}
function cookie(req,key){let result='';for(const p of String(req.headers.cookie||'').split(';')){const i=p.indexOf('=');if(i>=0&&p.slice(0,i).trim()===key)result=p.slice(i+1).trim();}return result;}
function decrypt(data,secret){try{
 if(!data||secret.length<32||data.length>16384)return null;
 const b=Buffer.from(data,'base64url');if(b.length<=28)return null;
 const aes=crypto.createDecipheriv('aes-256-gcm',crypto.createHash('sha256').update(secret).digest(),b.subarray(0,12));
 aes.setAuthTag(b.subarray(b.length-16));
 const obj=JSON.parse(Buffer.concat([aes.update(b.subarray(12,b.length-16)),aes.final()]).toString('utf8'));
 return Number.isFinite(Number(obj.expiry))&&Number(obj.expiry)>Date.now()?obj:null;
}catch{return null;}}
function idOf(w){return String(w?.id||w?.workspace_id||w?.workspaceId||'');}
function selected(c,m){const id=[c?.workspace,c?.workspace_id,c?.selected_workspace,c?.id,c?.ws].find(x=>typeof x==='string'&&x.length);return id?m.find(w=>idOf(w)===id):(m.length===1?m[0]:null);}
async function payload(req){if(req.body!==undefined&&req.body!==null)return Buffer.isBuffer(req.body)?req.body:(typeof req.body==='string'?req.body:JSON.stringify(req.body));const a=[];for await(const x of req)a.push(Buffer.isBuffer(x)?x:Buffer.from(x));return Buffer.concat(a);}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const path=String(req.query.path||'').split('/').filter(Boolean).join('/');
 const kind=ROUTES.get(req.method+':'+path);if(!kind)return fail(res,404,'Unsupported scraper endpoint.');
 const signingKey=process.env.M360_ROMIT_ORIGINAL_SCRAPER_PREVIEW_KEY||'';
 const proxyKey=process.env.M360_MAPS_V4_THREE_WORKER_KEY||'';
 if(signingKey.length<32)return fail(res,503,'CRM preview session gateway is not configured.');
 if(proxyKey.length<32)return fail(res,503,'Scraper private gateway is not configured.');
 const session=decrypt(cookie(req,SESSION),signingKey);
 const bearer=[session?.token,session?.access_token,session?.accessToken,session?.bearer].find(x=>typeof x==='string'&&x.length>20);
 if(!bearer)return fail(res,401,'Please sign in to your CRM workspace.');
 try{
  const reply=await fetch(CRM+'/me/workspaces',{headers:{Authorization:'Bearer '+bearer,Accept:'application/json'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!reply.ok)return fail(res,401,'CRM session expired or membership invalid.');
  const data=await reply.json();
  const members=Array.isArray(data)?data:(Array.isArray(data?.workspaces)?data.workspaces:[]);
  const ws=selected(decrypt(cookie(req,WORKSPACE),signingKey),members);
  if(!ws)return fail(res,409,'Please select an authorized business workspace.');
  const id=idOf(ws);
  if(!id||id.length>128||id.split('').some(x=>!/[A-Za-z0-9_-]/.test(x)))return fail(res,403,'Invalid workspace.');
  if(kind==='write'&&!ROLES.has(String(ws.role||'')))return fail(res,403,'This workspace has read-only permission.');
  const params=new URLSearchParams();
  for(const [key,v] of Object.entries(req.query||{})){if(key==='path')continue;for(const x of Array.isArray(v)?v:[v])params.append(key,String(x));}
  const headers={'x-m360-preview-proxy-key':proxyKey,'x-m360-workspace-id':id,Accept:req.headers.accept||'application/json'};
  let body;if(req.method!=='GET'&&req.method!=='HEAD'){body=await payload(req);headers['Content-Type']=req.headers['content-type']||'application/json';}
  const url=MAPS+'/api/scraper/'+path+(params.size?'?'+params.toString():'');
  const upstream=await fetch(url,{method:req.method,headers,body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(55000)});
  res.statusCode=upstream.status;res.setHeader('Content-Type',upstream.headers.get('content-type')||'application/json');
  if(path==='export.csv'&&upstream.headers.get('content-disposition'))res.setHeader('Content-Disposition',upstream.headers.get('content-disposition'));
  return res.end(Buffer.from(await upstream.arrayBuffer()));
 }catch(e){return fail(res,503,e?.name==='TimeoutError'?'Scraper request timed out.':'Low-RAM scraper backend unavailable.');}
};