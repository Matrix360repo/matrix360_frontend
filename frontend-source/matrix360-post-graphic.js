/* Matrix 360 — deterministic, provider-free designed PNG draft.
   No network requests, no brand claims, no publishing, no secret access.
   This is a designed graphic, not AI-generated photography. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Matrix360PostDraft = api;
})(typeof window === 'undefined' ? {} : window, function () {
  'use strict';
  const SIZES = Object.freeze({
    Instagram: [1080,1080], Facebook: [1200,630],
    LinkedIn: [1200,627], X: [1200,675], YouTube: [1280,720],
    Email: [1200,600], WhatsApp: [1080,1080],
    'Google Business Profile': [1200,900], Website: [1200,630]
  });
  const palettes = [
    ['#092B43','#0B746C','#E8F8D4'],
    ['#142B4E','#6B417B','#FFE5A5'],
    ['#193A35','#1B7774','#FFF3C4'],
    ['#312443','#9C4E5B','#E1F7F1'],
    ['#192B3A','#1F596E','#FBE7AA']
  ];
  function hash(input) {
    let x=2166136261;
    for (const ch of String(input)) { x ^= ch.codePointAt(0); x = Math.imul(x,16777619); }
    return x >>> 0;
  }
  function safeText(input, max=260) {
    return String(input || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
  }
  function hasSensitiveText(s) {
    return /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\d\s().-]{7,}\d))/i.test(s);
  }
  function headlineFromPrompt(p) {
    let t=safeText(p,900).replace(/^(?:please\s+)?(?:create|make|design|prepare|generate|draft|write|promote|highlight|celebrate|invite|announce)\s+(?:(?:a|an|the|three|two|\d+)\s+)?(?:(?:professional|engaging|premium|eye-catching|new|branded)\s+)?(?:(?:instagram|facebook|linkedin|youtube|social(?:\s+media)?)\s+)?(?:(?:post|graphic|visual|campaign|reel|ad|image|content)(?:s)?\s+)?(?:about|on|for|promoting|showcasing|highlighting|that\s+promotes)?\s*/i,'');
    t = t.replace(/\s+(?:with\s+hashtags?|and\s+hashtags?|including\s+hashtags?)\b.*$/i, '').trim();
    t = t.replace(/[.!?]\s.*$/, '').replace(/[.!?]+$/, '').trim();
    return (t || safeText(p,90)).slice(0,118);
  }
  function plan(request) {
    const prompt=safeText(request && request.prompt,901);
    const business=safeText(request && request.business,72);
    const workspace=safeText(request && request.workspace,128);
    const platform=safeText(request && request.platform,40);
    if (prompt.length < 12 || prompt.length > 900) throw Error('Brief must have 12–900 characters.');
    if (!business || !workspace) throw Error('Choose an authorized CRM business.');
    if (!Object.prototype.hasOwnProperty.call(SIZES,platform)) throw Error('Unsupported platform.');
    if (hasSensitiveText(prompt)) throw Error('Remove contact details, email addresses and URLs from the draft brief.');
    const [width,height]=SIZES[platform];
    const pal=palettes[hash(workspace)%palettes.length];
    const headline=safeText(request?.headline,118)||headlineFromPrompt(prompt);
    const cta=safeText(request?.cta,44)||'Explore more';
    return Object.freeze({prompt,business,workspace,platform,width,height,pal,headline,cta,disclosure:'Designed graphic · not AI-generated photography · review before publishing'});
  }
  function rounded(ctx,x,y,w,h,r) {
    r=Math.min(r,w/2,h/2);
    ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
  }
  function wrap(ctx,text,maxWidth,maxLines) {
    const words=text.split(/\s+/),lines=[],current=[];
    for(const word of words){
      const candidate=[...current,word].join(' ');
      if(current.length && ctx.measureText(candidate).width>maxWidth){
        lines.push(current.join(' '));current.length=0;current.push(word);
      }else{current.push(word)}
      if(lines.length>=maxLines) break;
    }
    if(lines.length<maxLines && current.length) lines.push(current.join(' '));
    if(lines.length===maxLines && words.join(' ')!==lines.join(' ')) {
      let last=lines[maxLines-1];
      while(last.length && ctx.measureText(last+'…').width>maxWidth)last=last.slice(0,-1);
      lines[maxLines-1]=last.trimEnd()+'…';
    }
    return lines;
  }
  function draw(ctx,p) {
    const w=p.width,h=p.height,wide=w/h>1.35;
    ctx.canvas.width=w;ctx.canvas.height=h;
    const grad=ctx.createLinearGradient(0,0,w,h);grad.addColorStop(0,p.pal[0]);grad.addColorStop(1,p.pal[1]);ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
    ctx.save();ctx.globalAlpha=.11;ctx.strokeStyle=p.pal[2];ctx.lineWidth=3;
    for(let i=0;i<12;i++){ctx.beginPath();ctx.arc(w*.77,h*.48,65+i*52,0,2*Math.PI);ctx.stroke()}
    ctx.globalAlpha=.14;ctx.fillStyle=p.pal[2];ctx.beginPath();ctx.arc(w*.92,h*.18,h*.34,0,2*Math.PI);ctx.fill();ctx.restore();
    const m=Math.round(Math.min(w,h)*.072),lineWidth=wide?w*.62:w-m*2;
    ctx.fillStyle=p.pal[2];rounded(ctx,m,m,Math.min(w-m*2,Math.max(275, p.business.length*15+70)),59,28);ctx.fill();
    ctx.fillStyle=p.pal[0];ctx.textBaseline='middle';ctx.font='700 24px Arial,sans-serif';
    const badge=p.business.toUpperCase();let badgeText=badge;
    while(badgeText.length>6 && ctx.measureText(badgeText).width>w-m*2-60)badgeText=badgeText.slice(0,-2);
    if(badgeText!==badge)badgeText+='…';
    ctx.fillText(badgeText,m+24,m+30);
    ctx.fillStyle='#FFFFFF';ctx.font='600 23px Arial,sans-serif';ctx.fillText('YOUR STORY, PRESENTED',m,wide?h*.24:h*.255);
    const size=wide?Math.min(66,Math.round(h*.11)):Math.min(83,Math.round(w*.073));ctx.textBaseline='alphabetic';ctx.font=`800 ${size}px Arial,sans-serif`;
    const lines=wrap(ctx,p.headline,lineWidth,wide?4:5);
    let lineHeight=size*1.2,start=wide?h*.36:h*.39;
    while(start+lines.length*lineHeight>h*.79 && lineHeight>44){lineHeight*=.94;ctx.font=`800 ${Math.round(lineHeight/1.2)}px Arial,sans-serif`}
    lines.forEach((line,i)=>ctx.fillText(line,m,start+i*lineHeight));
    const fy=h-m-48;
    ctx.fillStyle=p.pal[2];rounded(ctx,m,fy-35,Math.min(w*.50,420),66,22);ctx.fill();
    ctx.fillStyle=p.pal[0];ctx.font='700 24px Arial,sans-serif';ctx.textBaseline='middle';ctx.fillText('EXPLORE MORE  →',m+23,fy-3);
    ctx.fillStyle='#FFFFFF';ctx.globalAlpha=.85;ctx.font='18px Arial,sans-serif';ctx.fillText('DRAFT  •  REVIEW REQUIRED',m,h-18);ctx.globalAlpha=1;
    return {width:w,height:h,lines:lines.length};
  }
  return Object.freeze({SIZES,plan,draw,headlineFromPrompt,hasSensitiveText,safeText});
});
