'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const integration=require('../api/creative-integrated');
function response(){return {statusCode:200,headers:{},body:'',setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},removeHeader(k){delete this.headers[k];},end(value){this.body=String(value||'');}};}
test('release fits the existing twelve-function budget and bundles public assets',()=>{
 assert.equal(fs.readdirSync(require('node:path').join(__dirname,'../api')).filter(x=>x.endsWith('.js')).length,12);
 const config=require('../vercel.json');assert.equal(config.functions['api/*.js'].includeFiles,'frontend-source/**');
 assert.deepEqual(require('../lib/m360-approved-website-links.json'),{});
});
test('showcase public routes render with no server provider calls',async()=>{
 const old=process.env.M360_SHOWCASE_ENABLED,fetcher=global.fetch;let calls=0;
 process.env.M360_SHOWCASE_ENABLED='true';global.fetch=async()=>{calls++;throw Error('No provider calls allowed');};
 try{
  for(const file of ['index.html','app.html','platform.html','solutions.html']){const res=response();await integration({method:'GET',headers:{},query:{mode:'page',file}},res);assert.equal(res.statusCode,200);assert.match(res.body,/<html/i);}
  const res=response();await integration({method:'GET',headers:{},query:{mode:'dashboard'}},res);assert.equal(res.statusCode,200);assert.match(res.body,/Fictional data/);assert.match(res.body,/window.fetch=/);assert.equal(calls,0);
 }finally{global.fetch=fetcher;if(old===undefined)delete process.env.M360_SHOWCASE_ENABLED;else process.env.M360_SHOWCASE_ENABLED=old;}
});
test('anonymous direct brand and control APIs retain authentication',async()=>{
 const old=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw Error('No authentication fallback');};
 try{for(const name of ['brand','control-center']){const res=response();await require('../api/'+name)({method:'POST',headers:{},query:{},body:{workspace_id:'showcase',message:'Show me data'}},res);assert.equal(res.statusCode,401);}assert.equal(calls,0);}finally{global.fetch=old;}
});
