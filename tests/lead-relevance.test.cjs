'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {evidence,qualifyCandidates}=require('../lib/m360-lead-relevance');
test('requires independent industry AND geographic evidence, ignoring provider-stamped labels',async()=>{
 const record={query:'Manufacturing, Warehousing, Logistics, Distribution',location:'West Bengal, Odisha'};
 const candidates=[{company_name:'Good',website:'https://good.example',location:'Singapore'},
 {company_name:'Bad',website:'https://bad.example',location:'West Bengal',fit_reasoning:'Ideal manufacturing buyer'},
 {company_name:'Other industry',website:'https://other.example',location:'West Bengal'}];
 let calls=0;const load=async url=>{calls++;return {url,mime:'text/html',bytes:Buffer.from(url.includes('good.')?'<h1>Steel manufacturer</h1><p>Factory: Howrah, India.</p>':url.includes('bad.')?'Manufacturing facilities in Singapore':'Healthcare services in West Bengal')};};
 const matched=await qualifyCandidates(candidates,record,load);assert.deepEqual(matched.map(x=>x.company_name),['Good']);
 assert.equal(matched[0].location,'howrah');assert.equal(matched[0].relevance.source_url,'https://good.example/');
 await qualifyCandidates(candidates,record,load);assert.equal(calls,3,'unchanged candidates reuse tenant checkpoint decisions');
});
test('script text, missing evidence and inaccessible websites do not qualify',async()=>{
 assert.equal(evidence('<script>manufacturing West Bengal</script>Health services Singapore','Manufacturing','West Bengal').matched,false);
 assert.equal(evidence('Manufacturing in Howrah','Manufacturing','Odisha').matched,false);
 assert.equal(evidence('Logistics in Bhubaneswar','Manufacturing, Logistics','Odisha').matched,true);
 const record={query:'Manufacturing',location:'West Bengal'};
 assert.deepEqual(await qualifyCandidates([{company_name:'Unknown',website:'https://unknown.example'}],record,async()=>{throw Error('timeout')}),[]);
});
test('bounded batches progress past rejected candidates without counting unchecked rows',async()=>{
 const record={query:'Manufacturing',location:'West Bengal'};
 const candidates=Array.from({length:14},(_,i)=>({company_name:'Candidate '+i,website:'https://business'+i+'.example'}));
 const load=async url=>({url,mime:'text/html',bytes:Buffer.from(url.includes('business13.')?'Manufacturing plant in Howrah':'Healthcare in Singapore')});
 const first=await qualifyCandidates(candidates,record,load);assert.equal(first.length,0);assert.equal(first.pending,true);
 const second=await qualifyCandidates(candidates,record,load);assert.equal(second.length,1);assert.equal(second[0].company_name,'Candidate 13');assert.equal(second.pending,false);
});
