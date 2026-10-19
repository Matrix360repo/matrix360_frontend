/** Synthetic-only browser contract. No live credentials, user data or provider calls. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const repo = path.resolve(import.meta.dirname, '..');
const appUrl = pathToFileURL(path.join(repo, 'app.html')).href;
const artifacts = path.join(repo, 'artifacts', 'copilot-acceptance');
fs.mkdirSync(artifacts, {recursive:true});
const apiBase = 'https://matrix360-crm-backend-p9os.onrender.com';
const cases = [];

function syntheticPlan(workspace, goal) {
  return {
    workspace_id: workspace, goal, mode: 'RULE_BASED_PREVIEW_ONLY',
    executed: false, persisted: false, approved: false, domain_hint: 'industrial_business',
    steps: [
      {id:'scope', title:'Confirm objective',status:'REVIEW_REQUIRED',
       detail:'Agree on geography and target firms.',evidence:['Verified business offer']},
      {id:'audience',title:'Review prospective audience',status:'CONFIG_REQUIRED',
       detail:'Audience size not established.',evidence:['Dataset source','Qualification rationale']},
      {id:'outreach',title:'Approve campaign separately',status:'UNAVAILABLE',
       detail:'No real messages can be sent.',evidence:['Consent','Suppression review']}
    ],
    limitations: ['No leads identified or verified.', 'No AI model was called.', 'No campaign was sent or approved.']
  };
}
const fixtures = {
  client: [{id:'vrindavan',name:'Vrindavan Greens',role:'client_admin'}],
  director: [
    {id:'lakhotia',name:'Lakhotia Industrial Complex',role:'platform_owner'},
    {id:'shree',name:'Shree Heights',role:'platform_owner'},
    {id:'vrindavan',name:'Vrindavan Greens',role:'platform_owner'}
  ],
  ambiguous: [
    {id:'vrindavan',name:'Vrindavan Greens',role:'client_admin'},
    {id:'shree',name:'Shree Heights',role:'client_admin'}
  ],
  dynamic: [{id:'biz_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',name:'New Synthetic Business',role:'client_admin'}]
};

async function session(browser, identity, mobile=false) {
  const profile=fixtures[identity];
  const context=await browser.newContext({
    viewport: mobile ? {width:390,height:844} : {width:1366,height:900},
    isMobile:mobile,hasTouch:mobile,
    deviceScaleFactor:1,
    recordVideo:{dir:path.join(artifacts,'video'),size:mobile?{width:390,height:844}:{width:1000,height:660}}
  });
  const page=await context.newPage();
  let authenticated=false, leadPatchCount=0, leadCreateCount=0, previewCount=0, forbiddenTraffic=0;
  const leads={};
  for (const m of profile) leads[m.id]=[{id:101,name:'Synthetic Prospect',source:'synthetic',stage:'enquiry'}];
  await page.route('**/*',async route=>{
    const req=route.request();const url=req.url();
    if (url.startsWith('file://')) return route.continue();
    if (!url.startsWith(apiBase)) {
      // Abort fonts and ALL unrelated network calls, ensuring no external data transfer.
      forbiddenTraffic++;
      return route.abort();
    }
    const endpoint = new URL(url).pathname;
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type',
      'Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS','Content-Type':'application/json'};
    if (req.method()==='OPTIONS') return route.fulfill({status:204,headers,body:''});
    const hasToken=req.headers()['authorization']==='Bearer synthetic-token';
    let body=null,status=200;
    if (endpoint==='/auth/login'&&req.method()==='POST') {
      authenticated=true;body={access_token:'synthetic-token'};
    } else if (!authenticated || !hasToken) {
      status=401;body={detail:'Authentication required'};
    } else if (endpoint==='/auth/logout') {
      authenticated=false;body={status:'signed_out'};
    } else if (endpoint==='/me/workspaces') {
      body=profile;
    } else {
      const match=endpoint.match(/^\/workspaces\/([^/]+)\/(.+)$/);
      if (!match || !profile.some(m=>m.id===match[1])) {
        status=403;body={detail:'Workspace access denied'};
      } else {
        const tenant=match[1],rest=match[2];
        if(rest==='stages')body=['enquiry','qualified','won','lost'];
        else if(rest==='leads'&&req.method()==='GET')body=leads[tenant];
        else if(rest==='leads'&&req.method()==='POST'){
          leadCreateCount++;
          const incoming=JSON.parse(req.postData()||'{}');
          leads[tenant].push({id:100+leadCreateCount+leads[tenant].length,name:incoming.name,source:incoming.source,stage:incoming.stage});
          body={id:leads[tenant].at(-1).id,name:incoming.name};
        } else if(rest.startsWith('leads/')&&req.method()==='PATCH'){
          leadPatchCount++;
          const id=Number(rest.slice(6));const lead=leads[tenant].find(l=>l.id===id);
          if(!lead){status=404;body={detail:'Lead not found'};}
          else {lead.stage=JSON.parse(req.postData()||'{}').stage;body={ok:true,id,stage:lead.stage};}
        } else if(rest==='audience/status') {
          status=404;body={detail:'Audience gateway unavailable in this synthetic preview'};
        } else if(rest==='assistant/capabilities'){
          body={workspace_id:tenant,capabilities:[
            {id:'business_plan_preview',status:'AVAILABLE_PREVIEW_ONLY',reason:'Rule-based guidance'},
            {id:'audience_engine',status:'CONFIG_REQUIRED',reason:'No verified gateway'},
            {id:'campaign_execution',status:'NOT_INTEGRATED',reason:'Simulation not linked'}]};
        }else if(rest==='assistant/preview'&&req.method()==='POST'){
          previewCount++;
          body=syntheticPlan(tenant,JSON.parse(req.postData()||'{}').objective);
        } else {status=404;body={detail:'Unavailable in synthetic fixture'};}
      }
    }
    return route.fulfill({status,headers,body:JSON.stringify(body)});
  });
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(appUrl,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>openApp('crm'));
  await page.locator('#m360-login-form').waitFor({state:'visible'});
  await page.locator('#m360-username').fill(identity+'@synthetic.invalid');
  await page.locator('#m360-password').fill('synthetic-no-secret');
  await page.locator('#m360-login-form button[type=submit]').click();
  return {page,context,profile,errors,
    stats:()=>({leadPatchCount,leadCreateCount,previewCount,forbiddenTraffic})};
}

async function run(name,fn) {
  try{await fn();cases.push({name,result:'PASS'});console.log('PASS '+name);}
  catch(e){cases.push({name,result:'FAIL',error:e.message});console.error('FAIL '+name,e.stack);throw e;}
}

const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
try {
  await run('desktop client login, goal review, CRM create/stage, logout',async()=>{
    const c=await session(browser,'client');
    try{
      const {page,context}=c;
      await page.locator('#m360-assistant-business').getByText('Vrindavan Greens').waitFor();
      assert(await page.locator('#m360-workspace').isHidden(),'single client must have no tenant dropdown');
      assert(await page.locator('#demo-workspace-container').isHidden(),'fake client selector must not show to authenticated users');
      assert(await page.locator('#m360-goal-nav').isVisible(),'persistent goal shortcut must be available');
      assert(await page.locator('#m360-audience-status').isVisible(),'unavailable audience must be shown');
      assert((await page.locator('#m360-audience-status').textContent()).includes('UNAVAILABLE'));
      await page.locator('#m360-assistant-goal').fill('Find West Bengal industrial prospects and prepare a campaign for our business');
      await page.locator('#m360-assistant-form button[type=submit]').click();
      await page.getByText('Proposed plan — REVIEW ONLY').waitFor();
      assert(await page.getByText('Evidence required:',{exact:false}).count()>=3,'each plan step must explain evidence');
      await page.locator('textarea[aria-label^="Review notes"]').first().fill('Review this goal with sales.');
      await page.screenshot({path:path.join(artifacts,'client-desktop.png'),fullPage:true});
      await page.locator('#m360-name').fill('Synthetic Contact Two');
      await page.locator('#m360-source').fill('synthetic');
      await page.locator('#m360-lead-form button[type=submit]').click();
      await page.getByText('Synthetic Contact Two').waitFor();
      await page.locator('select[aria-label="Stage for Synthetic Prospect"]').selectOption('qualified');
      await page.waitForFunction(()=>document.getElementById('m360-status')?.textContent==='Stage updated');
      assert(c.stats().leadCreateCount===1 && c.stats().leadPatchCount===1);
      await page.locator('#m360-logout').click();
      await page.locator('#m360-login-box').waitFor({state:'visible'});
      assert(await page.locator('#m360-goal-nav').isHidden());
      assert(c.errors.length===0,'browser errors: '+c.errors.join(' / '));
    }finally{await c.context.close();}
  });
  await run('director multi-business selector and context reset',async()=>{
    const c=await session(browser,'director');
    try{
      const {page}=c;
      await page.locator('#m360-assistant-business').getByText('Lakhotia Industrial Complex').waitFor();
      assert(await page.locator('#m360-workspace').isVisible(),'Director retains authorized business list');
      await page.locator('#m360-assistant-goal').fill('Plan manufacturing outreach');
      await page.locator('#m360-assistant-form button[type=submit]').click();
      await page.getByText('Proposed plan — REVIEW ONLY').waitFor();
      await page.locator('#m360-workspace').selectOption('shree');
      await page.locator('#m360-assistant-business').getByText('Shree Heights').waitFor();
      assert(await page.locator('#m360-assistant-preview').isHidden(),'old tenant plan must be cleared');
      await page.screenshot({path:path.join(artifacts,'director-desktop.png'),fullPage:true});
      assert(c.errors.length===0,'browser errors: '+c.errors.join(' / '));
    }finally{await c.context.close();}
  });
  await run('ambiguous multi-client membership fails closed',async()=>{
    const c=await session(browser,'ambiguous');
    try{
      const {page}=c;
      await page.getByText('Multiple client memberships require administrator resolution',{exact:false}).waitFor();
      assert(await page.locator('#m360-data-box').isHidden());
      assert(await page.locator('#m360-goal-nav').isHidden());
    }finally{await c.context.close();}
  });
  await run('mobile isolated dynamic business, reviewed plan and no horizontal overflow',async()=>{
    const c=await session(browser,'dynamic',true);
    try{
      const {page}=c;
      await page.locator('#m360-assistant-business').getByText('New Synthetic Business').waitFor();
      assert(await page.locator('#m360-workspace').isHidden());
      assert(await page.locator('#demo-workspace-container').isHidden());
      await page.locator('#m360-assistant-goal').fill('Help my new business find suitable customers');
      await page.locator('#m360-assistant-form button[type=submit]').click();
      await page.getByText('Proposed plan — REVIEW ONLY').waitFor();
      await page.screenshot({path:path.join(artifacts,'dynamic-client-mobile.png'),fullPage:true});
      const bounds=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
      assert(bounds.scroll<=bounds.width+3,'mobile horizontal overflow: '+JSON.stringify(bounds));
      assert(c.errors.length===0,'browser errors: '+c.errors.join(' / '));
    }finally{await c.context.close();}
  });
}finally{
  await browser.close();
  fs.writeFileSync(path.join(artifacts,'results.json'),JSON.stringify({syntheticOnly:true,cases},null,2));
}
