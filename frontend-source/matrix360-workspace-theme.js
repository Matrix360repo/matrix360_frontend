/* User-selected appearance; no workspace data is stored here. */
(() => {
  'use strict';
  const root = document.documentElement;
  let theme = 'light';
  try { theme = localStorage.getItem('m360-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch {}
  const apply = value => { root.dataset.m360Theme = value === 'dark' ? 'dark' : 'light'; };
  apply(theme);
  function boot() {
    const button = document.createElement('button');
    button.id = 'm360-theme-toggle'; button.type = 'button'; button.className = 'btn';
    button.setAttribute('role', 'switch');
    const update = () => {
      const dark = root.dataset.m360Theme === 'dark';
      button.textContent = 'Dark mode';
      button.setAttribute('aria-label', 'Dark mode');
      button.setAttribute('aria-checked', String(dark));
    };
    button.addEventListener('click', () => {
      apply(root.dataset.m360Theme === 'dark' ? 'light' : 'dark');
      try { localStorage.setItem('m360-theme', root.dataset.m360Theme); } catch {}
      update();
    });
    (document.querySelector('.side') || document.body).append(button); update();
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
