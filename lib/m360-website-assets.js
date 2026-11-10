'use strict';
const https=require('node:https'),dns=require('node:dns/promises'),net=require('node:net');
function publicIPv4(ip){
 if(net.isIP(ip)!==4)return false;const [a,b]=ip.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19));
}
function publicURL(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!u.hostname.includes('.')||net.isIP(u.hostname)||/\.(?:local|localhost|internal)$/i.test(u.hostname))throw Error('Use a public HTTPS website.');u.hash='';return u;}
async function download(value,max=1000000,redirects=0){
 const url=publicURL(value);let dnsTimer;
 const resolved=await Promise.race([dns.lookup(url.hostname,{family:4,all:true}),new Promise((resolve,reject)=>{dnsTimer=setTimeout(()=>reject(Error('Website DNS lookup timed out.')),5000);})]).finally(()=>clearTimeout(dnsTimer));
 const addresses=resolved.map(entry=>entry.address);
 if(!addresses.length||addresses.some(ip=>!publicIPv4(ip)))throw Error('Website resolves to a restricted address.');
 return new Promise((resolve,reject)=>{
  const req=https.get(url,{headers:{'User-Agent':'Matrix360-Website-Assets/1.0',Accept:'text/html,image/png,image/jpeg,image/webp'},lookup:(host,options,cb)=>cb(null,options.all?[{address:addresses[0],family:4}]:addresses[0],4)},res=>{
   if([301,302,303,307,308].includes(res.statusCode)){
    res.resume();if(redirects>=3)return reject(Error('Too many website redirects.'));
    let target;try{target=new URL(res.headers.location,url).href;}catch{return reject(Error('Invalid redirect.'));}
    download(target,max,redirects+1).then(resolve,reject);return;
   }
   if(res.statusCode!==200){res.resume();return reject(Error('Website HTTP '+res.statusCode));}
   const chunks=[];let size=0;
   res.on('data',chunk=>{size+=chunk.length;if(size>max)res.destroy(Error('Website response exceeds size limit.'));else chunks.push(chunk);});
   res.on('error',reject);res.on('end',()=>resolve({url:url.href,mime:String(res.headers['content-type']||'').split(';')[0].trim().toLowerCase(),bytes:Buffer.concat(chunks)}));
  });
  const deadline=setTimeout(()=>req.destroy(Error('Website request timed out.')),8000);req.once('close',()=>clearTimeout(deadline));req.on('error',reject);
 });
}
function attributes(tag){const values={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))values[m[1].toLowerCase()]=(m[2]??m[3]??m[4]).replace(/&amp;/g,'&');return values;}
function extract(html,page,origin){
 const pages=[],assets=[];
 for(const m of html.matchAll(/<(img|meta|link|a)\b[^>]*>/gi)){
  const kind=m[1].toLowerCase(),a=attributes(m[0]);
  let value=kind==='img'?(a.src||a['data-src']):kind==='meta'&&/^(og:image|twitter:image)$/.test(a.property||a.name||'')?a.content:kind==='link'&&/icon/i.test(a.rel||'')?a.href:null;
  if(value){try{const u=publicURL(new URL(value,page).href);if(u.origin!==origin||/\.(svg|gif|ico)(?:\?|$)/i.test(u.href))continue;assets.push({url:u.href,role:/logo|brand|icon/i.test((a.alt||'')+' '+u.pathname+' '+(a.rel||''))?'primary_logo':'photograph',label:(a.alt||u.pathname.split('/').pop()||'Website image').slice(0,120),source_page:page});}catch{}}
  if(kind==='a'&&a.href){try{const u=publicURL(new URL(a.href,page).href);if(u.origin===origin&&!/\.(pdf|zip|png|jpe?g|webp|svg|mp4)$/i.test(u.pathname)&&!u.search)pages.push(u.href);}catch{}}
 }
 return {pages,assets};
}
async function discover(website){
 const start=publicURL(website),queue=[start.href],visited=new Set(),found=new Map(),errors=[];let origin=start.origin,bundlesChecked=0;const deadline=Date.now()+20000;
 while(queue.length&&visited.size<8&&Date.now()<deadline){
  const page=queue.shift();if(visited.has(page))continue;visited.add(page);
  try{const doc=await download(page);if(doc.mime!=='text/html')continue;const actual=publicURL(doc.url);if(visited.size===1)origin=actual.origin;if(actual.origin!==origin)continue;
   const result=extract(doc.bytes.toString('utf8'),actual.href,actual.origin);
   // Inspect referenced static bundles as text; never execute website scripts on the server.
   const resources=[...doc.bytes.toString('utf8').matchAll(/<(?:script|link)\b[^>]*>/gi)].map(m=>attributes(m[0])).map(a=>a.src||a.href).filter(Boolean);
   for(const resource of resources){
    if(bundlesChecked>=3||Date.now()>=deadline)break;
    try{const u=publicURL(new URL(resource,actual).href);if(u.origin!==origin||! /\.(js|css)$/.test(u.pathname))continue;bundlesChecked++;
     const bundle=await download(u.href,2000000);if(new URL(bundle.url).origin!==origin)continue;
     for(const m of bundle.bytes.toString('utf8').matchAll(/["'`]([^"'`\s]+\.(?:png|jpe?g|webp)(?:\?[^"'`\s]*)?)["'`]/gi)){
      try{const image=publicURL(new URL(m[1],bundle.url).href);if(image.origin===origin)result.assets.push({url:image.href,role:/logo|brand/i.test(image.pathname)?'primary_logo':'photograph',label:image.pathname.split('/').pop().slice(0,120),source_page:actual.href});}catch{}
     }
    }catch{}
   }
   for(const asset of result.assets)if(!found.has(asset.url)&&found.size<30)found.set(asset.url,asset);
   for(const next of result.pages)if(!visited.has(next)&&queue.length<50)queue.push(next);
  }catch{errors.push(page);}
 }
 return {assets:[...found.values()].sort((a,b)=>(a.role==='primary_logo'?-1:0)-(b.role==='primary_logo'?-1:0)),pages_checked:visited.size,bundles_checked:bundlesChecked,pages_unavailable:errors.length,coverage:'Checked up to 8 public pages and 3 static bundles in a bounded crawl. Same-site PNG/JPEG/WebP candidates only; SVGs and dynamically computed galleries need manual upload. Review ownership and relevance before importing.'};
}
module.exports={discover,download,publicURL,publicIPv4,extract};
