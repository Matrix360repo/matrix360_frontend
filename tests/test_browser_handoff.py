"""Chromium DOM / storage integration tests. Navigation and backend network intercepted because
this sandbox blocks browser navigation to localhost, file:// and arbitrary domains.
Nothing here is a live authenticated E2E test.
"""
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
FRONT=ROOT
EVIDENCE=ROOT/'evidence';EVIDENCE.mkdir(exist_ok=True)
GOAL='I manufacture industrial equipment and want qualified buyers in West Bengal with reviewed marketing plans.'

MOCK_STORAGE=r'''(() => {
const contents=new Map();
Object.defineProperty(window,'sessionStorage',{configurable:true,value:{
getItem:key=>contents.has(key)?contents.get(key):null,
setItem:(key,value)=>contents.set(key,String(value)),removeItem:key=>contents.delete(key),
clear:()=>contents.clear()}});
window.__calls=[];window.__nav='';window.__respond401=false;window.__rows=[{id:1,name:'Example lead',source:'synthetic',stage:'enquiry'}];
window.__workspaces=[{id:'biz_test_fourth',name:'Fourth Synthetic Business',role:'client_admin'}];
window.fetch=async(url,opts={})=>{
 const path=String(url).replace('https://matrix360-crm-backend-p9os.onrender.com','');
 const method=opts.method||'GET';window.__calls.push([path,method]);
 let data={},status=200;
 if(window.__respond401){status=401;data={detail:'Synthetic session expiry'}}
 else if(path==='/auth/login')data={access_token:'SYNTHETIC_TOKEN_ONLY',expires_in:3600};
 else if(path==='/me/workspaces')data=window.__workspaces;
 else if(path==='/auth/logout')data={ok:true};
 else if(path.endsWith('/ai/capabilities'))data={mode:'disabled',drafting_available:false};
 else if(path.startsWith('/workspaces/')){
  const workspace=path.split('/')[2];
  if(!window.__workspaces.some(x=>x.id===workspace)){status=403;data={detail:'Not authorized'}}
  else if(path.endsWith('/stages'))data=['enquiry','qualified','follow_up'];
  else if(path.endsWith('/leads')&&method==='GET')data=window.__rows;
  else if(path.endsWith('/leads')&&method==='POST'){
   const request=JSON.parse(opts.body);data={id:window.__rows.length+1,name:request.name,source:request.source,stage:request.stage};window.__rows.push(data);
  }else{status=404;data={detail:'Not configured'}}
 }else{status=404;data={detail:'Not configured'}}
 return {ok:status===200,status,json:async()=>data};
};
})()'''

def load(page, name):
    print("LOAD",name,flush=True)
    text=(FRONT/name).read_text()
    if name=='index.html':
        text=text.replace('<script src="matrix360-engagement.js" defer></script>','')
    if name=='login.html':
        text=text.replace("location.replace('client-dashboard.html')", "window.__nav='client-dashboard.html'")
    if name=='login.html':text=text.replace('<script src="matrix360-login-handoff.js" defer></script>','')
    if name=='client-dashboard.html':
        for f in ['matrix360-growth-brief.js','matrix360-ai-plan.js','matrix360-goal-handoff.js','client-dashboard.js']:
            text=text.replace('<script src="'+f+'" defer></script>','').replace('<script src="'+f+'"></script>','')
    text = text.replace('<script src="matrix360-api-config.js"></script>', '<script>'+(FRONT/'matrix360-api-config.js').read_text()+'</script>')
    text = __import__('re').sub(r'<link[^>]*fonts\.googleapis\.com[^>]*>', '', text)  # sandbox-only: external stylesheets blocked
    page.set_content(text,wait_until='domcontentloaded',timeout=8000)
    if name=='login.html':page.add_script_tag(content=(FRONT/'matrix360-login-handoff.js').read_text())
    if name=='index.html':
        public_js=(FRONT/'matrix360-engagement.js').read_text().replace("window.location.assign('login.html');","window.__nav='login.html';")
        page.add_script_tag(content=public_js)
    if name=='client-dashboard.html':
        for f in ['matrix360-growth-brief.js','matrix360-ai-plan.js','matrix360-goal-handoff.js','client-dashboard.js']:
            content=(FRONT/f).read_text()
            if f=='client-dashboard.js': content=content.replace("location.replace('login.html')","window.__nav='login.html'")
            page.add_script_tag(content=content)

def auth_flow(page,goal=GOAL):
    print("FLOW start",flush=True)
    load(page,'index.html')
    page.locator('#growth-goal').fill(goal)
    page.locator('#preview-button').click()
    page.locator('#plan-result').wait_for(state='visible')
    print('CONTINUE click',flush=True);page.locator('#continue-workspace').click()
    assert page.evaluate('window.__nav')=='login.html'
    assert page.evaluate("JSON.parse(sessionStorage.getItem('matrix360_engagement_goal_v1')).goal")==goal
    print("BEFORE LOGIN",flush=True);load(page,'login.html')
    assert page.locator('#engagement-resume-hint').is_visible()
    page.locator('#username').fill('synthetic@example.invalid')
    page.locator('#password').fill('synthetic password')
    page.locator('#submit-login').click()
    page.wait_for_function("window.__nav==='client-dashboard.html'")
    assert page.evaluate("sessionStorage.getItem('matrix360_pilot_token')")=='SYNTHETIC_TOKEN_ONLY'
    print("BEFORE DASH",flush=True);load(page,'client-dashboard.html')
    page.locator('#verified').wait_for(state='visible',timeout=7000)
    page.locator('#engagement-continuation').wait_for(state='visible',timeout=7000)
    assert page.locator('#engagement-goal-text').inner_text()==goal
    assert page.locator('#workspace').input_value()==page.evaluate('window.__workspaces[0].id')
    assert page.locator('#ai-plan-generate').is_disabled()
    return page

def main():
  results=[]
  with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    try:
      # Scenario 1 and 3: manufacturing and arbitrary 4th client, login preserved.
      page=browser.new_page(viewport={'width':1440,'height':900});page.set_content('<div>Sandbox</div>');page.set_default_timeout(6500);page.evaluate(MOCK_STORAGE)
      errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
      auth_flow(page)
      assert page.locator('#workspace-single-name').inner_text()=='Fourth Synthetic Business'
      prev=page.evaluate('window.__calls.length')
      page.locator('#engagement-use-goal').click()
      assert page.evaluate('window.__calls.length')==prev
      assert not page.evaluate('window.__calls.some(x=>x[0].includes("plan-draft"))')
      assert page.locator('#ai-goal-brief').input_value()==GOAL
      assert not errors,errors
      page.screenshot(path=str(EVIDENCE/'authenticated_desktop_mock.png'),full_page=False)
      results.append('Scenario 1 + 3: manufacturing/fourth business, goal→sign-in→authorized CRM: PASS (mocked API & navigation)')
      # CRM lead add preserved.
      page.locator('#lead-name').fill('Synthetic second lead')
      page.locator('#add-form button[type=submit]').click()
      page.wait_for_function("document.querySelector('#count').textContent.includes('2 leads')")
      results.append('Scenario 7: CRM lead creation path: PASS (mocked API)')
      # Late session denial removes all goal/CRM views.
      page.evaluate('window.__respond401=true')
      page.locator('#refresh').click()
      page.wait_for_function("document.querySelector('#verified').classList.contains('hidden')")
      assert page.locator('#engagement-continuation').is_hidden()
      assert page.locator('#lead-list').inner_text()==''
      assert page.evaluate("sessionStorage.getItem('matrix360_engagement_goal_v1')") is None
      results.append('Scenario 4: simulated API 401 clears goal and CRM data: PASS')
      page.close()

      # Scenario 2: property customer, synthetic.
      page=browser.new_page(viewport={'width':768,'height':1024});page.set_content('<div>Sandbox</div>');page.set_default_timeout(6500);page.evaluate(MOCK_STORAGE)
      page.evaluate("window.__workspaces=[{id:'biz_real_estate_synthetic',name:'Real Estate Example',role:'client_admin'}]")
      auth_flow(page,'I market residential properties and want higher quality property enquiries and more site visits.')
      assert page.locator('#workspace-single-name').inner_text()=='Real Estate Example'
      results.append('Scenario 2: real-estate workspace context: PASS (mocked API)')
      page.close()

      # Multi-business never auto-sends; goal only shows after authorized workspace resolves.
      page=browser.new_page();page.set_content('<div>Sandbox</div>');page.set_default_timeout(6500);page.evaluate(MOCK_STORAGE)
      page.evaluate("window.__workspaces=[{id:'biz_one',name:'Business One'},{id:'biz_two',name:'Business Two'}]")
      auth_flow(page)
      assert page.locator('#workspace-selector-row').is_visible()
      page.locator('#workspace').select_option('biz_two')
      page.wait_for_function("document.querySelector('#workspace-single-name').textContent==='Business Two'")
      assert page.locator('#engagement-continuation').is_visible()
      assert page.locator('#workspace').input_value()=='biz_two'
      results.append('Scenario 4 supplement: multi-tenant selection and goal rerender: PASS (mocked API)')
      page.close()

      # Sensitive details never stored by public page.
      page=browser.new_page();page.set_content('<div>Sandbox</div>');page.set_default_timeout(6500);page.evaluate(MOCK_STORAGE)
      load(page,'index.html')
      page.locator('#growth-goal').fill('Please contact test@example.com and prepare my marketing campaign.')
      page.locator('#preview-button').click()
      print('CONTINUE click',flush=True);page.locator('#continue-workspace').click()
      assert page.evaluate('window.__nav')==''
      assert page.evaluate("sessionStorage.getItem('matrix360_engagement_goal_v1')") is None
      results.append('Scenario 5: contact details excluded from handoff: PASS')
      page.close()

      # Director scenario 6: responsive engagement and auth dashboard.
      for width,height in [(390,844),(768,1024),(1440,900)]:
        page=browser.new_page(viewport={'width':width,'height':height});page.set_content('<div>Sandbox</div>');page.set_default_timeout(6500);page.evaluate(MOCK_STORAGE)
        load(page,'index.html')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+2'), f'public overflow at {width}'
        if width==390:page.screenshot(path=str(EVIDENCE/'engagement_mobile.png'),full_page=False)
        if width==1440:page.screenshot(path=str(EVIDENCE/'engagement_desktop.png'),full_page=False)
        auth_flow(page)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+2'),f'dashboard overflow at {width}'
        if width==390:page.screenshot(path=str(EVIDENCE/'authenticated_mobile_mock.png'),full_page=False)
        page.close()
      results.append('Scenario 6: 390/768/1440px public and CRM responsive layout: PASS (Chromium)')

      # Unauthenticated private dashboard: fail closed.
      page=browser.new_page();page.set_content('<div>Sandbox</div>');page.set_default_timeout(6500);page.evaluate(MOCK_STORAGE)
      print("BEFORE DASH",flush=True);load(page,'client-dashboard.html')
      page.locator('#denied').wait_for(state='visible',timeout=3000)
      assert page.locator('#verified').is_hidden()
      results.append('Scenario 7 supplement: unauthenticated dashboard blocked: PASS')
      page.close()
    finally:
      browser.close()
  (EVIDENCE/'BROWSER_RESULTS.txt').write_text('\n'.join(results)+'\n')
  print('\n'.join(results))
if __name__=='__main__':main()
