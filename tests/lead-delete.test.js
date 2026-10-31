'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../lib/m360-lead-delete');

function response(){
 const state={statusCode:200,headers:{},body:null};
 return {state,get statusCode(){return state.statusCode},set statusCode(value){state.statusCode=value},setHeader(k,v){state.headers[k]=v},end(value){state.body=JSON.parse(value)}};
}

test('lead deletion requires an authenticated client session',async()=>{
 const res=response();
 await handler({method:'POST',headers:{},body:{workspace_id:'demo',ids:[1]}},res);
 assert.equal(res.state.statusCode,401);
 assert.match(res.state.body.message,/valid client session/i);
});

test('lead deletion persists through the CRM owner service',async()=>{
 const original=global.fetch,calls=[];
 global.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,status:204}};
 try{
  const res=response();
  await handler({method:'POST',headers:{authorization:'Bearer abcdefghijklmnopqrstuvwxyz.123456'},body:{workspace_id:'client-a',ids:[11,12]}},res);
  assert.equal(res.state.statusCode,200);
  assert.equal(res.state.body.deleted_count,2);
  assert.equal(calls.length,2);
  assert.ok(calls.every(call=>call.options.method==='DELETE'));
  assert.ok(calls.every(call=>call.url.includes('/workspaces/client-a/leads/')));
 }finally{global.fetch=original}
});
