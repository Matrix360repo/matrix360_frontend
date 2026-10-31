/* Recovery access navigation: inject only the missing account links into the approved public layout.
   The original index.html markup/styles/copy stay byte-identical to their approved counterpart. */
(() => {
  'use strict';
  const nav = document.querySelector('.nav-wrap .nav');
  const links = document.getElementById('nav-links');
  const cta = nav?.querySelector('.nav-cta');
  if (!nav || !links || !cta || document.getElementById('m360-login-link')) return;

  const login = document.createElement('a');
  login.id = 'm360-login-link';
  login.className = 'btn btn-outline m360-login-link';
  login.href = 'login.html';
  login.textContent = 'Log in';
  login.setAttribute('aria-label', 'Log in to Matrix 360');
  nav.insertBefore(login, cta);

  const dashboard = document.createElement('a');
  dashboard.id = 'm360-dashboard-link';
  dashboard.href = 'client-dashboard.html';
  dashboard.textContent = 'Client dashboard';
  dashboard.setAttribute('aria-label', 'Open your authenticated client dashboard');
  links.append(dashboard);

  const footerLinks = document.querySelector('.footer-columns > div:last-child');
  if (footerLinks) {
    const footerLogin = document.createElement('a');
    footerLogin.href = 'login.html';
    footerLogin.textContent = 'Client log in';
    const footerDashboard = document.createElement('a');
    footerDashboard.href = 'client-dashboard.html';
    footerDashboard.textContent = 'Client dashboard';
    footerLinks.append(footerLogin, footerDashboard);
  }

  const style = document.createElement('style');
  style.id = 'm360-access-nav-style';
  style.textContent = `
    .nav-wrap .m360-login-link{
      min-height:42px;padding:0 14px;font-size:12px;border-radius:10px;
      background:var(--paper);border-color:#bcd8c8;color:var(--green-dark);
      flex:none;white-space:nowrap
    }
    .nav-wrap .m360-login-link:hover{background:#e8f4ea;color:var(--green-dark)}
    @media (max-width:1250px) and (min-width:921px){
      .nav-wrap .nav{gap:13px}
      .nav-wrap .nav-links{gap:13px}
      .nav-wrap .nav-links a{font-size:11px}
      .nav-wrap .nav-cta{padding:0 12px}
    }
    @media (max-width:1080px) and (min-width:921px){
      .nav-wrap .nav-links a[href="#for-you"]{display:none}
    }
    @media (max-width:640px){
      .nav-wrap .m360-login-link{margin-left:auto;min-height:39px;padding:0 12px;font-size:11px}
    }
  `;
  document.head.append(style);
})();

/* Inject a contextual CRM handoff ONLY inside the original result panel.
   The approved hero/navigation/sections/styles remain untouched. */
(() => {
 'use strict';
 const key='matrix360_engagement_goal_v1', ttl=30*60*1000;
 const actions=document.querySelector('#plan-result .result-actions');
 if(!actions || document.getElementById('continue-workspace'))return;
 const button=document.createElement('button');
 button.id='continue-workspace';button.type='button';button.textContent='Continue in my workspace →';
 // Reuse the same control dimensions and colors as the approved design, not a new CTA style.
 button.style.cssText='background:#0b786b;color:#fff;border-color:#0b786b;font-size:11px;padding:10px 14px;min-height:40px';
 const status=document.createElement('p');status.id='engagement-handoff-status';status.setAttribute('role','status');
 status.style.cssText='color:#687a7e;font-size:11px;line-height:1.65;margin:10px 0 0';
 status.textContent='Client access uses your existing Matrix 360 login. Only a short, non-sensitive draft is carried into your workspace.';
 actions.append(button);actions.after(status);
 const sensitive=(text)=>/(?:https?:\/\/|www\.|\b[\w.+-]+@[\w.-]+\.[a-z]{2,})/i.test(text) || /(?:\+?\d[\d\s().-]{7,}\d)/.test(text);
 button.addEventListener('click',()=>{
  const goal=document.getElementById('growth-goal').value.trim();
  const type=document.getElementById('business-type').value.trim();
  const market=document.getElementById('target-market').value.trim();
  const allowed=['','Manufacturing / B2B','Real estate / property','Professional services','Retail / consumer brand','Other'];
  if(goal.length<18||goal.length>900||market.length>110||!allowed.includes(type)||sensitive(goal)||sensitive(market)){
   status.textContent='Please enter a non-sensitive objective (18–900 characters), without phone numbers, emails or links.';
   status.setAttribute('role','alert');return;
  }
  try{sessionStorage.setItem(key,JSON.stringify({v:1,createdAt:Date.now(),goal,businessType:type,targetMarket:market}));}
  catch{status.textContent='Your browser could not retain the draft. You may copy the outline and sign in separately.';return;}
  window.location.assign('login.html');
 });
})();

/* Public plan preview uses the same INDICATIVE tiers already present in pricing.html.
   It neither charges users nor activates subscriptions. Original approved HTML remains unchanged. */
(() => {
  'use strict';
  const start=document.getElementById('start');
  if(!start||document.getElementById('m360-pricing-section'))return;
  const section=document.createElement('section');
  section.id='m360-pricing-section';
  section.className='section m360-public-pricing';
  section.setAttribute('aria-labelledby','m360-pricing-title');
  section.innerHTML=`
    <div class="container">
      <span class="tag">PLANS & PRICING</span>
      <h2 class="section-title" id="m360-pricing-title">Start with what your business needs.</h2>
      <p class="section-lede">Indicative plans for the Matrix 360 product concept. Final inclusions, service availability, AI usage and implementation costs require approval.</p>
      <div class="m360-plan-grid">
        <article class="m360-plan-card"><h3>Starter</h3><p class="m360-plan-price">₹4,999 <small>/ month</small></p><p>One business workspace, a guided growth brief and core CRM views.</p><a class="btn btn-outline" href="pricing.html#plans">View plan details →</a></article>
        <article class="m360-plan-card m360-plan-highlight"><h3>Growth</h3><p class="m360-plan-price">₹19,999 <small>/ month</small></p><p>Multi-channel planning, creative review and growing-team workflows.</p><a class="btn btn-primary" href="pricing.html#plans">View plan details →</a></article>
        <article class="m360-plan-card"><h3>Agency</h3><p class="m360-plan-price">₹49,999 <small>/ month</small></p><p>Multiple client workspaces, approval journeys and client reporting.</p><a class="btn btn-outline" href="pricing.html#plans">View plan details →</a></article>
        <article class="m360-plan-card"><h3>Enterprise</h3><p class="m360-plan-price">Custom</p><p>Access controls, custom integrations and tailored implementation.</p><a class="btn btn-outline" href="pricing.html#plans">View plan details →</a></article>
      </div>
      <p class="m360-price-disclaimer"><strong>Pricing is indicative, not a public offer.</strong> No payment or subscription activation is connected. AI credits, media-provider fees and implementation costs are separate and subject to agreement.</p>
      <a class="m360-price-signin" href="login.html">Already a Matrix 360 client? Log in →</a>
    </div>
  `;
  const styles=document.createElement('style');
  styles.textContent=`
    .m360-public-pricing{background:#f0f6f1;border-top:1px solid #dce8de;border-bottom:1px solid #dce8de}
    .m360-plan-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin:32px 0 17px}
    .m360-plan-card{background:#fffefa;border:1px solid #d6e4da;padding:25px 22px;border-radius:20px;display:flex;flex-direction:column;gap:10px;box-shadow:var(--shadow)}
    .m360-plan-card h3{font:800 20px Manrope,sans-serif;letter-spacing:-.035em;margin:0}
    .m360-plan-card>p:not(.m360-plan-price){font-size:13px;line-height:1.65;color:var(--muted);flex:1;margin:0 0 13px}
    .m360-plan-card .btn{min-height:43px;padding:8px 11px;font-size:11px;white-space:normal;text-align:center}
    .m360-plan-price{font:800 clamp(23px,2.2vw,29px) Manrope,sans-serif;color:var(--green);margin:0}
    .m360-plan-price small{font:600 12px 'DM Sans',sans-serif;color:var(--muted)}
    .m360-plan-highlight{border:2px solid var(--green)}
    .m360-price-disclaimer{font-size:12px;line-height:1.65;color:#586c62;margin:12px 0}
    .m360-price-signin{display:inline-block;font-size:13px;font-weight:800;color:var(--green);padding:12px 0}
    @media(max-width:1030px){.m360-plan-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:640px){.m360-plan-grid{grid-template-columns:1fr}.m360-plan-card{padding:21px}}
  `;
  document.head.append(styles);
  start.before(section);
  const links=document.getElementById('nav-links');
  if(links&&!links.querySelector('a[href="#m360-pricing-section"]')){
    const pricing=document.createElement('a');pricing.href='#m360-pricing-section';pricing.textContent='Pricing';
    links.append(pricing);
  }
})();
