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
 if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;return res.end('Method not allowed')}
 const f=String(req.query.file||'index.html').replace(/^\/+/,'');
 if(f.startsWith('api/')||f.includes('..')||f.includes('\\')||f.length>255){res.statusCode=503;return res.end('Original Python scraper backend is not part of this static frontend preview')}
 try{
 const {b,files}=await archive(),r=files.get(f||'index.html');
 if(!r){res.statusCode=404;return res.end('Not found')}
 let content=b.subarray(r.start,r.start+r.length);
 if(r.method===8)content=zlib.inflateRawSync(content);else if(r.method!==0)throw Error('Unsupported ZIP');
 if(content.length>1000000)throw Error('Too large');
 const ext=f.split('.').pop().toLowerCase(),mime={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',svg:'image/svg+xml',json:'application/json',ico:'image/x-icon',mp4:'video/mp4'};
 res.setHeader('Content-Type',mime[ext]||'application/octet-stream');res.setHeader('Cache-Control','private,max-age=30');res.setHeader('X-Content-Type-Options','nosniff');
 return res.end(req.method==='HEAD'?undefined:content)
 }catch(e){res.statusCode=502;return res.end('Original uploaded preview archive currently unavailable')}
};
