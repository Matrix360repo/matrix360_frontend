/* Progressive presentation enhancements; existing forms and workflows remain authoritative. */
(() => {
 'use strict';
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const publicNav=document.querySelector('body:not(.m360-matched-crm):not(.m360-matched-auth) .nav-links');
 if(publicNav){
  publicNav.replaceChildren();
  for(const [label,href] of [['Home','index.html'],['Platform','platform.html'],['Solutions','solutions.html'],['Pricing','index.html#m360-new-plans'],['Product preview','app.html']]){
   const link=document.createElement('a');link.textContent=label;link.href=href;
   const active=()=>{const match=href.includes('#')?location.hash==='#'+href.split('#')[1]:location.pathname.endsWith(href)&&!(href==='index.html'&&location.hash==='#m360-new-plans');if(match)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');};active();addEventListener('hashchange',active);publicNav.append(link);
  }
  for(const [label,href] of [['Sign in','login.html'],['Request access','login.html#request-access']]){
   const link=document.createElement('a');link.textContent=label;link.href=href;link.className='m360-mobile-account';publicNav.append(link);
  }
  document.querySelectorAll('a[href="pricing.html#faq"]').forEach(link=>link.href='index.html#faq');
  const actions=document.querySelector('.nav-actions');
  if(actions)for(const link of actions.querySelectorAll('a')){if(/sign in/i.test(link.textContent))link.href='login.html';else{link.href='login.html#request-access';link.textContent='Request access';}}
  const guest=document.querySelector('.m-guest-bar');if(guest)guest.textContent=location.pathname.endsWith('app.html')?'Fictional product example · Explore the browser-only preview. Sign in for your authorized client workspace.':'Explore Matrix 360. Sign in for your authorized client workspace.';
  const guidance=document.querySelector('main > .container > .g-rail'),hero=document.querySelector('.page-hero');
  if(hero&&!hero.querySelector('a.btn')){const action=document.createElement('a');action.className='btn primary';action.href='login.html#request-access';action.textContent='Request access';hero.append(action);}
  if(guidance&&hero){const previous=guidance.parentElement;hero.after(guidance);if(!previous.children.length)previous.remove();}
 }
 const sidebar=document.querySelector('body.m360-matched-crm .side');
 if(sidebar){const navigation=document.createElement('nav');navigation.id='m360-polish-navigation';navigation.setAttribute('aria-label','Workspace sections');for(const source of document.querySelectorAll('#m360-mp-topbar [data-m360-goto]')){const button=document.createElement('button');button.type='button';button.textContent=source.textContent;button.dataset.destination=source.dataset.m360Goto;button.addEventListener('click',()=>{if(window.Matrix360Router)window.Matrix360Router.navigateToPage(button.dataset.destination);else source.click();});navigation.append(button);}sidebar.querySelector('.brand')?.after(navigation);const update=()=>{const page=window.Matrix360Router?.resolveInitialPage()||'dashboard';for(const button of navigation.children)button.setAttribute('aria-current',button.dataset.destination===page?'page':'false');};document.addEventListener('m360:page-changed',update);addEventListener('popstate',update);update();}
 const workspaceNav=document.getElementById('m360-sidebar-mp-nav');
 if(workspaceNav&&!workspaceNav.querySelector('[data-m360-sidebar-page="research"]')){const link=document.createElement('a');link.href='?page=research#market-research';link.className='m360-sidebar-mp-link';link.dataset.m360SidebarPage='research';link.textContent='Market Research';link.addEventListener('click',event=>{if(window.Matrix360Router){event.preventDefault();window.Matrix360Router.navigateToPage('research');}});workspaceNav.append(link);}
 const password=document.getElementById('password');
 if(password){
  const wrap=document.createElement('div');wrap.className='m360-password-field';password.before(wrap);wrap.append(password);
  const toggle=document.createElement('button');toggle.type='button';toggle.className='m360-password-toggle';toggle.textContent='Show';toggle.setAttribute('aria-label','Show password');toggle.setAttribute('aria-controls','password');toggle.setAttribute('aria-pressed','false');
  toggle.addEventListener('click',()=>{const show=password.type==='password';password.type=show?'text':'password';toggle.textContent=show?'Hide':'Show';toggle.setAttribute('aria-label',show?'Hide password':'Show password');toggle.setAttribute('aria-pressed',String(show));});wrap.append(toggle);
  const title=document.getElementById('form-title');
  document.getElementById('tab-login')?.addEventListener('click',()=>{if(title)title.textContent='Sign in to your workspace';});
  const tabs=[...document.querySelectorAll('[role=tab]')];
  const syncTabs=()=>tabs.forEach(tab=>{tab.tabIndex=tab.getAttribute('aria-selected')==='true'?0:-1;});
  tabs.forEach(tab=>{const panel=document.getElementById(tab.id==='tab-login'?'signin':'signup');if(panel){tab.setAttribute('aria-controls',panel.id);panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);}tab.addEventListener('click',syncTabs);tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const index=tabs.indexOf(tab),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].click();tabs[next].focus();});});syncTabs();
 }
 // The provider inserts the canonical pricing section after the original nav is created.
 const repairPricing=()=>{if(document.getElementById('m360-new-plans'))document.querySelectorAll('a[href="#m360-pricing-section"]').forEach(link=>link.setAttribute('href','#m360-new-plans'));};repairPricing();
 if(document.querySelector('.hero-art')){
  const observer=new MutationObserver(repairPricing);observer.observe(document.body,{childList:true,subtree:true});
  if('IntersectionObserver' in window){const reveal=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('m360-in-view');reveal.unobserve(entry.target);}}),{threshold:.08});document.querySelectorAll('.pillar,.process-step,.audience-card').forEach(item=>reveal.observe(item));}
  const art=document.querySelector('.hero-art');let scheduled=false;
  const move=()=>{scheduled=false;if(!reduced.matches&&innerWidth>=1024)art.style.setProperty('--m360-parallax',Math.min(14,scrollY*.025)+'px');else art.style.setProperty('--m360-parallax','0px');};
  addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(move);}},{passive:true});reduced.addEventListener('change',move);addEventListener('resize',move);move();
 }
})();
