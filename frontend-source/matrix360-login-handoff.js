/* On the public→existing-login journey, confirm only that a short-lived objective exists. */
(() => { 'use strict';
  const signin=document.getElementById('signin'),signup=document.getElementById('signup');
  signin?.querySelectorAll('.notice').forEach(node=>node.remove());
  if(signin){const note=document.createElement('p');note.className='security-note';note.textContent='Secure access to your assigned business workspace.';signin.append(note);}
  if(signup){
    signup.innerHTML='<form id="onboarding-form"><div class="onboarding-grid"><label>Your name<input id="signup-name" required maxlength="120" autocomplete="name" placeholder="Full name"></label><label>Business email<input id="signup-email" required maxlength="255" type="email" autocomplete="email" placeholder="name@business.com"></label><label>Company or brand<input id="signup-company" required maxlength="160" placeholder="Your business name"></label><label>Website <span aria-hidden="true">·</span> optional<input id="signup-website" maxlength="240" type="url" placeholder="https://"></label><label class="wide">What would you like Matrix 360 to help with? <span aria-hidden="true">·</span> optional<textarea id="signup-objective" maxlength="700" rows="3" placeholder="Your main growth objective"></textarea></label></div><button class="btn primary" id="submit-onboarding" type="submit">Request client access →</button><p id="onboarding-status" role="status" aria-live="polite"></p></form>';
    signup.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const button=document.getElementById('submit-onboarding'),status=document.getElementById('onboarding-status');button.disabled=true;status.className='';status.textContent='Sending your access request…';try{const response=await fetch('/api/onboarding',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.getElementById('signup-name').value.trim(),email:document.getElementById('signup-email').value.trim(),company:document.getElementById('signup-company').value.trim(),website:document.getElementById('signup-website').value.trim(),objective:document.getElementById('signup-objective').value.trim()}),cache:'no-store'});const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.message||'Access request could not be sent.');status.textContent=result.message;status.className='success';event.target.reset();}catch(error){status.textContent=error.message;status.className='error';}finally{button.disabled=false;}});
  }
  const originalSwitch=window.switchTab;
  if(typeof originalSwitch==='function')window.switchTab=which=>{originalSwitch(which);if(which==='signup'){document.getElementById('form-title').textContent='Set up your client workspace.';document.getElementById('form-desc').textContent='Tell us the essentials. We will email your sign-in link and notify the onboarding team.';}};
  if(new URLSearchParams(location.search).get('mode')==='signup')window.switchTab?.('signup');
  try {
    const raw=sessionStorage.getItem('matrix360_engagement_goal_v1');
    if(!raw||raw.length>1600)return;
    const o=JSON.parse(raw),age=Date.now()-o.createdAt;
    if(o.v===1 && typeof o.goal==='string' && o.goal.length>=18 && o.goal.length<=900 &&
       Number.isFinite(o.createdAt) && age>=-60000 && age<=30*60*1000) {
      document.getElementById('engagement-resume-hint')?.removeAttribute('hidden');
    }
  } catch { /* Browser session storage may be unavailable. Login remains functional. */ }
})();
