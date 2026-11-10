/* Shared, local-only logo preparation. No image-generation or third-party calls. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.M360LogoTools=factory();})(typeof window==='object'?window:this,function(){
 'use strict';
 function pixels(data,w,h){
  const at=i=>Array.from(data.slice(i*4,i*4+4));
  const corners=[at(0),at(w-1),at((h-1)*w),at(w*h-1)];
  const opaque=corners.filter(c=>c[3]>240);
  const base=opaque.find(c=>opaque.filter(b=>Math.max(...c.slice(0,3).map((v,j)=>Math.abs(v-b[j])))<24).length>=3);
  const eligible=i=>{const p=i*4;return data[p+3]<8||base&&Math.max(Math.abs(data[p]-base[0]),Math.abs(data[p+1]-base[1]),Math.abs(data[p+2]-base[2]))<42;};
  const seen=new Uint8Array(w*h),queue=[];
  const add=i=>{if(!seen[i]&&eligible(i)){seen[i]=1;queue.push(i);}};
  for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=1;y<h-1;y++){add(y*w);add(y*w+w-1);}
  for(let n=0;n<queue.length;n++){const i=queue[n],x=i%w,y=Math.floor(i/w);data[i*4+3]=0;if(x)add(i-1);if(x<w-1)add(i+1);if(y)add(i-w);if(y<h-1)add(i+w);}
  let left=w,top=h,right=-1,bottom=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>8){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  if(right<left)throw Error('This logo has no visible artwork after background removal. Choose a clearer original.');
  return {left,top,width:right-left+1,height:bottom-top+1};
 }
 function prepare(image,doc=document){
  const canvas=doc.createElement('canvas'),scale=Math.min(1,1000/Math.max(image.naturalWidth,image.naturalHeight));
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Logo preparation is unavailable.');
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const rgba=ctx.getImageData(0,0,canvas.width,canvas.height),box=pixels(rgba.data,canvas.width,canvas.height);ctx.putImageData(rgba,0,0);
  const cropped=doc.createElement('canvas');cropped.width=box.width;cropped.height=box.height;
  cropped.getContext('2d').drawImage(canvas,box.left,box.top,box.width,box.height,0,0,box.width,box.height);
  return cropped;
 }
 return {pixels,prepare};
});
