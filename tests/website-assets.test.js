'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {publicURL,publicIPv4,extract}=require('../lib/m360-website-assets');
test('served company form mounts every website asset control before attaching handlers',()=>{
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../frontend-source/matrix360-brand.js'),'utf8');
 const markup=source.slice(source.indexOf('panel.innerHTML='),source.indexOf("services.before(panel)"));
 for(const id of ['m360-find-website-assets','m360-website-assets-status','m360-website-assets-list'])assert.ok(markup.includes('id="'+id+'"'),id);
 new(require('node:vm').Script)(source);
});
test('website fetches reject credentials, non-HTTPS and private network targets',()=>{
 for(const url of ['http://example.com','https://user:pass@example.com','https://127.0.0.1','https://192.168.1.1','https://example.local','https://example.com:8443'])assert.throws(()=>publicURL(url));
 for(const ip of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.1.1','0.0.0.0','::1','224.0.0.1'])assert.equal(publicIPv4(ip),false,ip);
 assert.equal(publicIPv4('8.8.8.8'),true);assert.equal(publicURL('https://example.com/logo.png#x').href,'https://example.com/logo.png');
});
test('asset extraction finds same-site logos and images and excludes external or active image formats',()=>{
 const result=extract('<img src="/logo.png" alt="Company logo"><img src="/site.jpg"><img src="https://other.example/image.png"><img src="/unsafe.svg"><a href="/about">About</a><meta property="og:image" content="/social.webp">','https://example.com/','https://example.com');
 assert.equal(result.assets.length,3);assert.equal(result.assets[0].role,'primary_logo');assert.equal(result.assets[0].source_page,'https://example.com/');assert.deepEqual(result.pages,['https://example.com/about']);
});
