"""Execute production API config, login and dashboard JS in Chromium with intercepted requests.
Chromium page navigation is blocked in this sandbox, so page transitions use DOM replacement.
No live API credentials or requests are used.
"""
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT
CONFIG=(WEB/'matrix360-api-config.js').read_text()
DEFAULT='https://matrix360-crm-backend-p9os.onrender.com'
CUSTOM='https://staging.example.invalid'

STORAGE='''(()=>{let items = new Map();Object.defineProperty(window,'sessionStorage',{configurable:true,value:{getItem:k=>items.get(k)??null,setItem:(k,v)=>items.set(k,String(v)),removeItem:k=>items.delete(k),clear:()=>items.clear()}});window.__nav='';window.__requests=[];window.__workspaces=[{id:'biz_dynamic_fourth',name:'Independent Fourth Business',role:'client_admin'}];window.__sessionDenied=false;window.fetch=async(u,o={})=>{window.__requests.push({url:String(u),method:o.method||'GET',token:o.headers?.Authorization||null});const url=String(u),base=window.__expectedBase;let data,status=200;if(!url.startsWith(base+'/')){status=409;data={detail:'Wrong backend used'}}else if(url.endsWith('/auth/login')){data={access_token:'SYNTHETIC_ONLY',expires_in:3600}}else if(url.endsWith('/me/workspaces')){data=window.__sessionDenied?[]:window.__workspaces}else if(url.endsWith('/stages')){data=['enquiry','qualified']}else if(url.endsWith('/leads')){data=[{id:1,name:'Synthetic example',source:'test',stage:'enquiry'}]}else if(url.endsWith('/ai/capabilities')){data={mode:'disabled',drafting_available:false}}else {status=404;data={detail:'Not enabled'}}return{ok:status===200,status,json:async()=>data}};})()'''

def load(page,what,config=None):
    text=(WEB/what).read_text()
    if what=='login.html':
        text=text.replace("location.replace('client-dashboard.html')","window.__nav='client-dashboard.html'")
        text=text.replace('<script src="matrix360-login-handoff.js" defer></script>','')
    if what=='client-dashboard.html':
        for f in ['matrix360-growth-brief.js','matrix360-ai-plan.js','matrix360-goal-handoff.js','client-dashboard.js']:
            text=text.replace('<script src="'+f+'" defer></script>','').replace('<script src="'+f+'"></script>','')
    prefix='<script>window.MATRIX360_CRM_CONFIG='+json.dumps({'apiBase':config} if config is not None else {})+';</script>'
    text=text.replace('<script src="matrix360-api-config.js"></script>',prefix+'<script>'+CONFIG+'</script>')
    text=re.sub(r'<link[^>]*fonts\.googleapis\.com[^>]*>', '',text)
    page.set_content(text,wait_until='domcontentloaded',timeout=9000)
    if what=='client-dashboard.html':
        for name in ['matrix360-growth-brief.js','matrix360-ai-plan.js','matrix360-goal-handoff.js','client-dashboard.js']:
            page.add_script_tag(content=(WEB/name).read_text().replace("location.replace('login.html')","window.__nav='login.html'"))


def launch(browser,expected=DEFAULT):
    page=browser.new_page();page.set_default_timeout(8000);page.set_content('<div>Test</div>');page.evaluate(STORAGE)
    page.evaluate('(x)=>window.__expectedBase=x',expected)
    return page

def sign_in(page):
    page.locator('#username').fill('synthetic@example.invalid');page.locator('#password').fill('NOT_A_REAL_PASSWORD');page.locator('#submit-login').click()


def main():
  lines=[]
  with sync_playwright() as playwright:
    browser=playwright.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    try:
      page=launch(browser)
      load(page,'login.html')
      assert page.evaluate('window.Matrix360ApiBase')==DEFAULT
      sign_in(page);page.wait_for_function("window.__nav==='client-dashboard.html'")
      assert page.evaluate('window.__requests.every(r=>r.url.startsWith(window.__expectedBase+"/"))')
      lines.append('PASS default Render API origin used by login')
      load(page,'client-dashboard.html');page.locator('#verified').wait_for(state='visible')
      assert page.evaluate('window.__requests.every(r=>r.url.startsWith(window.__expectedBase+"/"))')
      assert page.evaluate('window.__requests.some(r=>r.url.endsWith("/workspaces/biz_dynamic_fourth/leads"))')
      lines.append('PASS same API origin used by authenticated CRM after login');page.close()

      page=launch(browser,CUSTOM)
      load(page,'login.html',CUSTOM)
      assert page.evaluate('window.Matrix360ApiBase')==CUSTOM
      sign_in(page);page.wait_for_function("window.__nav==='client-dashboard.html'")
      load(page,'client-dashboard.html',CUSTOM);page.locator('#verified').wait_for(state='visible')
      assert page.evaluate('window.__requests.every(r=>r.url.startsWith(window.__expectedBase+"/"))')
      lines.append('PASS alternate HTTPS staging backend reused by login AND CRM');page.close()

      for bad in ['http://notlocalhost.example','https://user:pass@example.com','https://service.example/api','javascript:alert(1)','//service.example','']:
        page=launch(browser)
        load(page,'login.html',bad)
        assert page.evaluate('window.Matrix360ApiBase') is None, bad
        sign_in(page)
        assert page.evaluate('window.__requests.length')==0,bad
        assert 'configured safely' in page.locator('#login-status').inner_text()
        lines.append('PASS invalid endpoint rejected before credentials transmitted: '+repr(bad))
        page.close()

      page=launch(browser)
      page.evaluate("sessionStorage.setItem('matrix360_pilot_token','SYNTHETIC_ONLY');sessionStorage.setItem('matrix360_pilot_expires_at',String(Date.now()+100000))")
      load(page,'client-dashboard.html','http://unsafe.example')
      page.locator('#denied').wait_for(state='visible')
      assert page.evaluate('window.__requests.length')==0
      lines.append('PASS CRM fails closed with an invalid API origin even if session token is present');page.close()

      page=launch(browser,CUSTOM)
      page.evaluate('window.__sessionDenied=true')
      load(page,'login.html',CUSTOM);sign_in(page)
      page.wait_for_function("document.getElementById('login-status').textContent.includes('no client workspace')")
      assert page.evaluate("sessionStorage.getItem('matrix360_pilot_token')") is None
      assert page.evaluate('window.__nav')==''
      lines.append('PASS login refuses membership-less account and stores no access token');page.close()

      page=launch(browser)
      load(page,'login.html','http://127.0.0.1:8000')
      assert page.evaluate('window.Matrix360ApiBase')=='http://127.0.0.1:8000'
      lines.append('PASS explicitly configured local HTTP permitted for offline development');page.close()
    finally:browser.close()
  (ROOT/'evidence'/'20261021_api_origin_contract.txt').write_text('\n'.join(lines)+'\n')
  print('\n'.join(lines))
if __name__=='__main__':main()
