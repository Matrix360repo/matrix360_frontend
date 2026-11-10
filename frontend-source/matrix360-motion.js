/* Brand motion is decorative. Navigation, forms and service requests remain independent. */
(() => {
 'use strict';
 const hero=document.querySelector('.hero:has(.hero-art)'),story=document.querySelector('body.m360-matched-auth .story');
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 let paused=false;try{paused=localStorage.getItem('m360-motion-paused')==='true';}catch{}
 function chooseChapter(centers,middle,current){let closest=0;for(let index=1;index<centers.length;index++)if(Math.abs(centers[index]-middle)<Math.abs(centers[closest]-middle))closest=index;return current<0||Math.abs(centers[closest]-middle)+24<Math.abs(centers[current]-middle)?closest:current;}
 const backdrop=host=>{
  let video=null;
  if(host===hero){video=document.createElement('video');video.className='m360-hero-video';video.muted=true;video.loop=true;video.playsInline=true;video.preload='metadata';video.poster='/matrix360-brand-poster.jpg';video.setAttribute('aria-hidden','true');video.setAttribute('tabindex','-1');host.prepend(video);}
  const layer=document.createElement('div');layer.className='m360-ambient';layer.setAttribute('aria-hidden','true');
  layer.innerHTML='<div class="m360-ambient-grid"></div><div class="m360-orbit m360-orbit-one"></div><div class="m360-orbit m360-orbit-two"></div><div class="m360-light m360-light-one"></div><div class="m360-light m360-light-two"></div><div class="m360-signal-trail"></div>';
  host.prepend(layer);host.classList.add('m360-motion-host');
  const toggle=document.createElement('button');toggle.type='button';toggle.className='m360-motion-toggle';toggle.textContent='Pause motion';toggle.setAttribute('aria-pressed','false');host.append(toggle);
  const sync=()=>{const stop=paused||reduce.matches||document.hidden;host.classList.toggle('m360-motion-paused',stop);toggle.textContent=reduce.matches?'Motion reduced':paused?'Play motion':'Pause motion';toggle.disabled=reduce.matches;toggle.setAttribute('aria-pressed',String(paused));if(video){if(stop)video.pause?.();else{if(!video.src)video.src='/matrix360-brand-loop.mp4';const playing=video.play?.();playing?.catch(()=>{});}}};
  toggle.addEventListener('click',()=>{paused=!paused;try{localStorage.setItem('m360-motion-paused',String(paused));}catch{}sync();});reduce.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);sync();
 };
 if(hero)backdrop(hero);
 if(story)backdrop(story);
 const decorations=[...document.querySelectorAll('.audience-shape,.float-note,.story .m360-ambient')];decorations.forEach(item=>item.classList.add('m360-decor-parallax'));
 let decorFrame=0;const updateDecor=()=>{decorFrame=0;const positions=decorations.map(item=>({item,offset:reduce.matches||paused||innerWidth<900?0:Math.max(-16,Math.min(16,(innerHeight/2-item.getBoundingClientRect().top)*.025))}));for(const {item,offset}of positions)item.style.setProperty('--m360-decor-y',offset+'px');};const scheduleDecor=()=>{if(!decorFrame)decorFrame=requestAnimationFrame(updateDecor);};if(decorations.length){addEventListener('scroll',scheduleDecor,{passive:true});addEventListener('resize',scheduleDecor);reduce.addEventListener('change',scheduleDecor);scheduleDecor();}
 const process=document.querySelector('#how-it-works .process');
 if(process){
  const steps=[...process.querySelectorAll('.process-step')],stage=document.createElement('aside');stage.className='m360-story-stage';stage.setAttribute('aria-label','Growth workflow illustration');
  stage.innerHTML='<div class="m360-stage-top"><span>MATRIX360 / GROWTH WORKFLOW</span><span class="m360-stage-number">01 / 04</span></div><div class="m360-stage-graphic" aria-hidden="true"><div class="m360-stage-core">360</div><span class="m360-stage-node">Research</span><span class="m360-stage-node">Audience</span><span class="m360-stage-node">Creative</span><span class="m360-stage-node">Review</span></div><div class="m360-stage-copy"><small>01 / EXPLORE</small><h3>Start with a clearer view.</h3><p>Understand the market before deciding what to do next.</p></div><div class="m360-story-controls" aria-label="Workflow chapters"></div>';
  const chapters=[['EXPLORE','Start with a clearer view.','See how market intelligence, audiences and creative fit your business.'],['DEFINE','Make your goal the brief.','Give the plan a commercial objective, a market and a clear constraint.'],['PLAN','Bring the work together.','Review research, audience direction and campaign ideas in one proposed plan.'],['REVIEW','You decide what happens next.','Refine the proposal and approve each connected action when you are ready.']];
  const copy=stage.querySelector('.m360-stage-copy'),controls=stage.querySelector('.m360-story-controls');let current=-1,manualTarget=null,scrollFrame=0;
  const select=index=>{if(index===current)return;current=index;stage.dataset.chapter=String(index);stage.querySelector('.m360-stage-number').textContent=String(index+1).padStart(2,'0')+' / 04';copy.querySelector('small').textContent=String(index+1).padStart(2,'0')+' / '+chapters[index][0];copy.querySelector('h3').textContent=chapters[index][1];copy.querySelector('p').textContent=chapters[index][2];for(const [i,button]of [...controls.children].entries())button.setAttribute('aria-pressed',String(i===index));for(const [i,step]of steps.entries())step.classList.toggle('m360-story-current',i===index);};
  steps.forEach((step,index)=>{const button=document.createElement('button');button.type='button';button.textContent=String(index+1).padStart(2,'0');button.setAttribute('aria-label',chapters[index][0]);button.addEventListener('click',()=>{select(index);if(innerWidth>=900&&!reduce.matches){manualTarget=index;step.scrollIntoView({behavior:'smooth',block:'center'});}});controls.append(button);});
  const rail=document.createElement('div');rail.className='m360-story-rail';steps.forEach(step=>rail.append(step));process.replaceChildren(stage,rail);process.classList.add('m360-scroll-story');select(0);
  // One complete geometry snapshot controls both the caption and highlighted atom node.
  // Observer callbacks contain only changed entries and could alternate adjacent chapters.
  function updateChapter(){scrollFrame=0;if(innerWidth<900||reduce.matches)return;const centers=steps.map(step=>{const box=step.getBoundingClientRect();return box.top+box.height/2;});const middle=innerHeight/2;if(manualTarget!==null){if(Math.abs(centers[manualTarget]-middle)<32)manualTarget=null;else return;}select(chooseChapter(centers,middle,current));}
  const schedule=()=>{if(!scrollFrame)scrollFrame=requestAnimationFrame(updateChapter);};
  addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);reduce.addEventListener('change',schedule);addEventListener('wheel',()=>{manualTarget=null;},{passive:true});addEventListener('touchstart',()=>{manualTarget=null;},{passive:true});addEventListener('keydown',event=>{if(['PageDown','PageUp','ArrowDown','ArrowUp','Home','End',' '].includes(event.key))manualTarget=null;});schedule();
 }
 if(document.body.classList.contains('m360-matched-crm')){
  document.addEventListener('click',event=>{const source=event.target.closest('.m360-action-map button,.m360-message-selector,[data-m360-goto],#m360-polish-navigation button');if(!source||reduce.matches)return;requestAnimationFrame(()=>{const panel=source.matches('.m360-message-selector')?source.closest('.m360-strategy-visuals')?.querySelector('.m360-message-detail'):source.matches('.m360-action-map button')?source.closest('section')?.querySelector('.m360-action-detail'):document.querySelector('#m360-mp-topbar');if(panel?.animate)panel.animate([{opacity:.55,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:'ease-out'});});});
 }
})();
