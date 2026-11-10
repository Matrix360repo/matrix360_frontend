'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {pixels}=require('../frontend-source/matrix360-logo-tools');
function image(color){const p=new Uint8ClampedArray(7*7*4);for(let i=0;i<49;i++)p.set(color,i*4);return p;}
test('white logo backgrounds are removed and trimmed while enclosed white detail survives',()=>{
 const p=image([245,245,245,255]);for(let y=1;y<6;y++)for(let x=1;x<6;x++)p.set([10,70,55,255],(y*7+x)*4);p.set([255,255,255,255],(3*7+3)*4);
 assert.deepEqual(pixels(p,7,7),{left:1,top:1,width:5,height:5});assert.equal(p[3],0);assert.equal(p[(3*7+3)*4+3],255);
});
test('dark flat backgrounds are removed without deleting white logo artwork',()=>{
 const p=image([12,20,25,255]);p.set([255,255,255,255],(3*7+3)*4);assert.equal(pixels(p,7,7).width,1);assert.equal(p[3],0);assert.equal(p[(3*7+3)*4+3],255);
});
test('existing alpha is preserved and blank conversions fail clearly',()=>{
 const p=image([0,0,0,0]);p.set([255,255,255,255],(3*7+3)*4);assert.equal(pixels(p,7,7).width,1);assert.equal(p[(3*7+3)*4+3],255);assert.throws(()=>pixels(image([255,255,255,255]),7,7),/no visible artwork/);
});
test('private PNG replacement retains its source and never deselects it after a failed upload',async()=>{
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../frontend-source/matrix360-brand.js'),'utf8');
 const start=source.indexOf(' async function transparentAsset('),end=source.indexOf(" transparentButton.addEventListener",start),calls=[];
 let fail=false;const api=async(method,body)=>{calls.push(body);if(body.action==='upload'&&fail)throw Error('Storage unavailable');return {asset_url:'https://example.com/private-logo'};};
 class Image{async decode(){}}
 const run=new Function('api','Image','window','workspace','seq','token','assets',source.slice(start,end)+';return transparentAsset;')(api,Image,{M360LogoTools:{prepare:()=>({toDataURL:()=> 'data:image/png;base64,synthetic'})}},'workspace',1,()=> 'synthetic-session',[]);
 const asset={id:'source',filename:'logo.jpg',role:'primary_logo'};await run(asset,'workspace',1);
 assert.equal(calls[1].mime,'image/png');assert.equal(calls[1].filename,'logo-transparent.png');assert.equal(calls[2].action,'select');assert.equal(calls[2].selected,false);
 calls.length=0;fail=true;await assert.rejects(run(asset,'workspace',1),/Storage unavailable/);assert.equal(calls.some(x=>x.action==='select'),false);
});
