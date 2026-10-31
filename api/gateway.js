'use strict';
const crypto=require('node:crypto');
const CRM='https://matrix360-crm-backend-p9os.onrender.com';
const SCRAPER='https://matrix360-romit-maps-v4-tenant-preview.onrender.com';
const SESSION='m360_scraper_auth_v2';
const WORKSPACE='m360_scraper_ws_v2';
const secret=()=>process.env.M360_ROMIT_ORIGINAL_SCRAPER_PREVIEW_KEY||'';
const key=()=>crypto.createHash('sha256').update(secret()).digest();
const sha=text=>crypto.createHash('sha256').update(String(text)).digest('hex');
const fail=(res,status,message)=>{res.statusCode=status;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:'error',message}));};
const cookiePath=name=>name===SESSION?'/api/':'/api/scraper';
const setCookie=(name,value)=>name+'='+value+'; Secure; HttpOnly; SameSite=Lax; Path='+cookiePath(name)+'; Max-Age=3300';
const clearCookie=name=>name+'=; Secure; HttpOnly; SameSite=Lax; Path='+cookiePath(name)+'; Max-Age=0';
const cookieValue=(req,name)=>{const v=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));return v?v.slice(name.length+1):'';};
function seal(value){const iv=crypto.randomBytes(12),aes=crypto.createCipheriv('aes-256-gcm',key(),iv);
 const buffer=Buffer.from(JSON.stringify({...value,expiry:Date.now()+3300000}));
 return Buffer.concat([iv,aes.update(buffer),aes.final(),aes.getAuthTag()]).toString('base64url');}
function open(value){try{if(!value)return null;const raw=Buffer.from(value,'base64url');
 if(raw.length<29)return null;const aes=crypto.createDecipheriv('aes-256-gcm',key(),raw.subarray(0,12));
 aes.setAuthTag(raw.subarray(raw.length-16));
 const data=JSON.parse(Buffer.concat([aes.update(raw.subarray(12,-16)),aes.final()]).toString());
 return data.expiry>Date.now()?data:null;}catch{return null;}}
const fetcher=async(url,method,headers={},body,timeout=55000)=>fetch(url,{method,headers,body,redirect:'manual',signal:AbortSignal.timeout(timeout)});
function bodyOf(req){if(['GET','HEAD'].includes(req.method))return undefined;
 if(Buffer.isBuffer(req.body))return req.body;
 if(req.body==null)return undefined;return typeof req.body==='string'?req.body:JSON.stringify(req.body);}
async function membership(token,workspace){
 const r=await fetcher(CRM+'/me/workspaces','GET',{authorization:'Bearer '+token,accept:'application/json'},undefined,10000);
 if(!r.ok)return null;const data=await r.json().catch(()=>null);
 return Array.isArray(data)?data.find(x=>x&&x.id===workspace&&typeof x.role==='string')||null:null;}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','private,no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(secret().length<32)return fail(res,503,'Preview gateway has no secure configuration.');
 const kind=String(req.query.kind||''),path=String(req.query.path||'').replace(/^\/+|\/+$/g,'');
 if(!['crm','scraper'].includes(kind)||!path||path.length>240||path.includes('..')||!/^[A-Za-z0-9_./-]+$/.test(path))return fail(res,404,'Route unavailable');
 const args=new URLSearchParams();
 for(const [k,v] of Object.entries(req.query)){if(['kind','path','file'].includes(k))continue;for(const item of Array.isArray(v)?v:[v])args.append(k,String(item));}
 const qs=args.size?'?'+args.toString():'';
 const method=req.method||'GET',body=bodyOf(req);
 try{
 if(kind==='crm'){
  const headers={accept:req.headers.accept||'application/json'};
  if(req.headers.authorization)headers.authorization=req.headers.authorization;
  if(body!==undefined)headers['content-type']=req.headers['content-type']||'application/json';
  const upstream=await fetcher(CRM+'/'+path+qs,method,headers,body,path==='auth/login'?20000:15000);
  const output=Buffer.from(await upstream.arrayBuffer());
  if(path==='auth/login'&&method==='POST'&&upstream.status===200){
   try{const data=JSON.parse(output.toString('utf8'));if(typeof data.access_token==='string'&&data.access_token.length>20)
    res.setHeader('Set-Cookie',[setCookie(SESSION,seal({token:data.access_token})),clearCookie(WORKSPACE)]);}catch{}
  }else if(path==='auth/logout'){
   res.setHeader('Set-Cookie',[clearCookie(SESSION),clearCookie(WORKSPACE)]);
  }else{
   const m=/^workspaces\/([A-Za-z0-9][A-Za-z0-9_-]{0,127})\/(?:stages|leads)$/.exec(path);
   if(m&&method==='GET'&&upstream.status===200&&headers.authorization?.startsWith('Bearer ')){
    const token=headers.authorization.slice(7);
    const session=open(cookieValue(req,SESSION));
    if(session&&session.token===token){
     res.setHeader('Set-Cookie',setCookie(WORKSPACE,seal({workspace:m[1],fingerprint:sha(token)})));
    }
   }
  }
  res.statusCode=upstream.status;
  res.setHeader('Content-Type',upstream.headers.get('content-type')||'application/json');
  return res.end(output);
 }
 const session=open(cookieValue(req,SESSION)),selected=open(cookieValue(req,WORKSPACE));
 if(!session||!selected||typeof session.token!=='string'||typeof selected.workspace!=='string'||selected.fingerprint!==sha(session.token))
  return fail(res,401,'Sign in to this preview and select your business before using Maps Scraper.');
 const user=await membership(session.token,selected.workspace);
 if(!user)return fail(res,403,'Your CRM account is not authorized for the selected business.');
 const writers=new Set(['platform_owner','agency_admin','client_admin','marketing_operator','sales_operator']);
 const viewer=user.role==='viewer';
 if(!writers.has(user.role)&&!viewer)return fail(res,403,'Your role does not permit Maps research.');
 if(viewer&&!['GET','HEAD'].includes(method))return fail(res,403,'You can view research, but cannot start or change discovery in this workspace.');
 const headers={accept:req.headers.accept||'application/json',
   'x-m360-preview-proxy-key':secret(),
   'x-m360-workspace-id':selected.workspace};
 if(body!==undefined)headers['content-type']=req.headers['content-type']||'application/json';
 const upstream=await fetcher(SCRAPER+'/api/scraper/'+path+qs,method,headers,body);
 const output=Buffer.from(await upstream.arrayBuffer());
 res.statusCode=upstream.status;
 res.setHeader('Content-Type',upstream.headers.get('content-type')||'application/json');
 const disposition=upstream.headers.get('content-disposition');
 if(disposition)res.setHeader('Content-Disposition',disposition);
 return res.end(output);
 }catch(e){
  return fail(res,503,'The CRM or Maps Scraper backend is temporarily unavailable.');
 }
};
