/* User-selected appearance; no workspace data is stored here. */
(() => {
  'use strict';
  const root = document.documentElement;
  const system = matchMedia('(prefers-color-scheme: dark)');
  let chosen = null, update = () => {};
  try { const saved=localStorage.getItem('m360-theme'); if(['light','dark'].includes(saved))chosen=saved; } catch {}
  const apply = () => { root.dataset.m360Theme = chosen || (system.matches ? 'dark' : 'light'); update(); };
  system.addEventListener?.('change', apply);
  if(typeof addEventListener==='function')addEventListener('storage', event => {
    if(event.key!=='m360-theme')return;
    chosen=['light','dark'].includes(event.newValue)?event.newValue:null;apply();
  });
  apply();
  function boot() {
    const button = document.createElement('button');
    button.id = 'm360-theme-toggle'; button.type = 'button'; button.className = 'btn';
    button.setAttribute('role', 'switch');
    update = () => {
      const dark = root.dataset.m360Theme === 'dark';
      button.textContent = 'Dark mode';
      button.setAttribute('aria-label', 'Dark mode');
      button.setAttribute('aria-checked', String(dark));
    };
    button.addEventListener('click', () => {
      chosen=root.dataset.m360Theme === 'dark' ? 'light' : 'dark';apply();
      try { localStorage.setItem('m360-theme', root.dataset.m360Theme); } catch {}
      update();
    });
    (document.querySelector('.side') || document.querySelector('.formside .topline') || document.body).append(button); update();
    if(document.body?.classList?.contains('m360-matched-auth'))return;
    // Keep historical CRM rows readable without exposing implementation-specific provider labels.
    const leadList=document.getElementById('lead-list');
    function cleanLeadLabels(){
      if(!leadList)return;
      const walker=document.createTreeWalker(leadList,NodeFilter.SHOW_TEXT),nodes=[];
      while(walker.nextNode())nodes.push(walker.currentNode);
      for(const node of nodes){const cleaned=node.nodeValue.replace(/Google Maps(?:\\s*V4|\\s*\\([^)]*\\))?\\s*(?:[|+·:]\\s*)?/gi,'').replace(/Website Search\\s*(?:[|+·:]\\s*)?/gi,'');if(cleaned!==node.nodeValue)node.nodeValue=cleaned;}
      for(const th of document.querySelectorAll('#leads th'))if(th.textContent.trim()==='Source')th.textContent='Contact details';
    }
    if(leadList){cleanLeadLabels();new MutationObserver(cleanLeadLabels).observe(leadList,{childList:true,subtree:true,characterData:true});}
    // Supplementary tools stay available without dominating the main workflow.
    for (const id of ['m360-transparency-tool', 'm360-extra-logos', 'm360-demo-campaign', 'm360-budget-section']) {
      const panel = document.getElementById(id);
      if (!panel) continue;
      const details = document.createElement('details'), summary = document.createElement('summary');
      summary.textContent = panel.querySelector('h2,h3')?.textContent || 'More options';
      panel.before(details); details.append(summary, panel);
    }
    const coordination = document.querySelector('#marketing-centre .m360-mesh-head')?.parentElement;
    if (coordination) {
      const details = document.createElement('details'), summary = document.createElement('summary');
      summary.textContent = 'Workflow tools & activity'; coordination.before(details); details.append(summary, coordination);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0), {once:true});
  else boot();
})();
