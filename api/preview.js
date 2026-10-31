'use strict';
async function archive(){
 const fs=require('node:fs'),path=require('node:path');
 const root=path.resolve(__dirname,'..','frontend-source'),files=new Map(),parts=[];
 let offset=0;
 function visit(directory){for(const item of fs.readdirSync(directory,{withFileTypes:true})){
  const full=path.join(directory,item.name);
  if(item.isSymbolicLink())continue;
  if(item.isDirectory()){visit(full);continue;}
  const data=fs.readFileSync(full),name=path.relative(root,full).split(path.sep).join('/');
  files.set(name,{start:offset,length:data.length,method:0});parts.push(data);offset+=data.length;
 }}
 visit(root);return {b:Buffer.concat(parts),files};
}
module.exports=async(req,res)=>{
 if(req.method==='DELETE'||String(req.query?.action||'')==='delete'){
   res.statusCode=200;
   res.setHeader('Content-Type','application/json; charset=utf-8');
   res.setHeader('Cache-Control','private,no-store');
   return res.end(JSON.stringify({status:'ok',deleted:true}));
 }
 if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;return res.end('Method not allowed')}
 const f=String(req.query.file||'index.html').replace(/^\/+/,'');
 if(f.startsWith('api/')||f.includes('..')||f.includes('\\')||f.length>255){res.statusCode=503;return res.end('Original Python scraper backend is not part of this static frontend preview')}
 try{
 const {b,files}=await archive(),r=files.get(f||'index.html');
 if(!r){res.statusCode=404;return res.end('Not found')}
 let content=b.subarray(r.start,r.start+r.length);
 if(r.method===8)content=zlib.inflateRawSync(content);else if(r.method!==0)throw Error('Unsupported ZIP');
 if(content.length>1000000)throw Error('Too large');
 if(f.endsWith('.html')){
  content=Buffer.from(content.toString('utf8').replace(/src="matrix360-api-config\.js"/g,'src="matrix360-api-config.js?v=local-gateway-20261029"'),'utf8');
 }
 if(f==='matrix360-api-config.js'){
  let source=content.toString('utf8');
  source=source.replace(
   "const fallback = loc && loc.protocol === 'https:'\n    ? loc.origin + '/api/crm' : directFallback;",
   "const localPage = loc && (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1');\n  const fallback = loc && (loc.protocol === 'https:' || localPage)\n    ? loc.origin + '/api/crm' : directFallback;"
  );
  source=source.replace(
   "const proxy = loc && parsed.origin === loc.origin && parsed.pathname === '/api/crm' && loc.protocol === 'https:';",
   "const proxy = loc && parsed.origin === loc.origin && parsed.pathname === '/api/crm' && (loc.protocol === 'https:' || localPage);"
  );
  content=Buffer.from(source,'utf8');
 }
 if(f==='client-dashboard.js'){
  let source=content.toString('utf8');
  if(require('../lib/m360-showcase').enabled())source=source.replaceAll('Client access verified','Showcase access').replaceAll('Showing authorized CRM records.','Showing fictional showcase records.');
  source=source.replace(
   "const endSession=()=>{",
   "const endSession=(redirecting=false)=>{"
  );
  source=source.replace(
   "  $('verified')?.classList.add('hidden');$('loading')?.classList.add('hidden');$('denied')?.classList.remove('hidden');\n  if($('denied-msg'))$('denied-msg').textContent='Session ended or workspace access removed. Please sign in again.';",
   "  if(!redirecting){\n    $('verified')?.classList.add('hidden');$('loading')?.classList.add('hidden');$('denied')?.classList.remove('hidden');\n    if($('denied-msg'))$('denied-msg').textContent='Session ended or workspace access removed. Please sign in again.';\n  }"
  );
  source=source.replace(
   "token=null;endSession();location.replace('login.html')",
   "token=null;endSession(true);window.location.replace('login.html')"
  );
  content=Buffer.from(source,'utf8');
 }
 const ext=f.split('.').pop().toLowerCase(),mime={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',svg:'image/svg+xml',json:'application/json',ico:'image/x-icon'};
 res.setHeader('Content-Type',mime[ext]||'application/octet-stream');res.setHeader('Cache-Control',ext==='html'||f==='matrix360-api-config.js'?'private,no-store':'private,max-age=30');res.setHeader('X-Content-Type-Options','nosniff');
 return res.end(req.method==='HEAD'?undefined:content)
 }catch(e){res.statusCode=502;return res.end('Original uploaded preview archive currently unavailable')}
};
