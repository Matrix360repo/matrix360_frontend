'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('decorative motion pauses for user choice, reduced motion and a hidden page',()=>{
 const classes=new Set(),children=[],events={},preference={matches:false,addEventListener(type,fn){this.change=fn;}};
 const host={prepend(item){children.unshift(item);},append(item){children.push(item);},classList:{add(name){classes.add(name);},toggle(name,enabled){if(enabled)classes.add(name);else classes.delete(name);}}};
 const document={hidden:false,body:{classList:{contains(){return false;}}},querySelectorAll(){return [];},querySelector(selector){return selector.startsWith('.hero:')?host:null;},createElement(tag){return {tag,paused:true,play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;},attributes:{},setAttribute(key,value){this.attributes[key]=value;},addEventListener(type,fn){this[type]=fn;}};},addEventListener(type,fn){events[type]=fn;}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../frontend-source/matrix360-motion.js'),'utf8'),{document,matchMedia:()=>preference});
 const control=children.at(-1),video=children.find(child=>child.tag==='video');assert.equal(control.type,'button');assert.equal(classes.has('m360-motion-paused'),false);assert.equal(video.src,'/matrix360-brand-loop.mp4');assert.equal(video.muted,true);assert.equal(video.loop,true);assert.equal(video.paused,false);
 control.click();assert.equal(classes.has('m360-motion-paused'),true);assert.equal(control.textContent,'Play motion');assert.equal(video.paused,true);
 control.click();preference.matches=true;preference.change();assert.equal(control.disabled,true);assert.equal(classes.has('m360-motion-paused'),true);
 preference.matches=false;preference.change();assert.equal(control.disabled,false);
 document.hidden=true;events.visibilitychange();assert.equal(classes.has('m360-motion-paused'),true);assert.equal(video.paused,true);
 document.hidden=false;events.visibilitychange();assert.equal(classes.has('m360-motion-paused'),false);assert.equal(video.paused,false);
});
test('scroll chapters progress monotonically and resist boundary jitter',()=>{
 const code=fs.readFileSync(path.join(__dirname,'../frontend-source/matrix360-motion.js'),'utf8');const context={};vm.runInNewContext(code.match(/function chooseChapter[^\n]+/)[0],context);let current=0;const selected=[];
 for(let scroll=0;scroll<=1400;scroll+=5){current=context.chooseChapter([400,800,1200,1600].map(center=>center-scroll),400,current);selected.push(current);}
 assert.deepEqual([...new Set(selected)],[0,1,2,3]);assert.ok(selected.every((value,index)=>index===0||value>=selected[index-1]));
 const reverse=[];for(let scroll=1400;scroll>=0;scroll-=5){current=context.chooseChapter([400,800,1200,1600].map(center=>center-scroll),400,current);reverse.push(current);}assert.deepEqual([...new Set(reverse)],[3,2,1,0]);assert.ok(reverse.every((value,index)=>index===0||value<=reverse[index-1]));
 assert.equal(context.chooseChapter([195,595,995,1395],400,0),0);assert.equal(context.chooseChapter([180,580,980,1380],400,0),1);assert.equal(context.chooseChapter([205,605,1005,1405],400,1),1);
});

test('a remembered Pause choice prevents video playback on a new page and can be cleared',()=>{
 let stored='true';const children=[];
 const host={prepend(e){children.unshift(e);},append(e){children.push(e);},classList:{add(){},toggle(){}}};
 const document={hidden:false,body:{classList:{contains(){return false;}}},querySelectorAll(){return [];},querySelector:s=>s.startsWith('.hero:')?host:null,createElement:tag=>({tag,paused:true,setAttribute(){},addEventListener(event,fn){this[event]=fn;},play(){this.paused=false;},pause(){this.paused=true;}}),addEventListener(){}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../frontend-source/matrix360-motion.js'),'utf8'),{document,matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem:()=>stored,setItem:(key,value)=>{assert.equal(key,'m360-motion-paused');stored=value;}}});
 const control=children.at(-1),video=children.find(e=>e.tag==='video');assert.equal(control.textContent,'Play motion');assert.equal(video.paused,true);assert.equal(video.src,undefined);
 control.click();assert.equal(stored,'false');assert.equal(video.paused,false);assert.equal(video.src,'/matrix360-brand-loop.mp4');
});
