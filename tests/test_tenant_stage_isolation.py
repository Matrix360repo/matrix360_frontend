"""Real Chromium JS + synthetic HTTP fixtures. No hosted authentication or CRM access."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from test_api_origin_contract import launch,load
ROOT=Path(__file__).resolve().parents[1]

def ready(browser):
    page=launch(browser)
    page.evaluate("""()=>{
      sessionStorage.setItem('matrix360_pilot_token','SYNTHETIC_ONLY');
      sessionStorage.setItem('matrix360_pilot_expires_at',String(Date.now()+100000));
      window.__workspaces=[{id:'biz_alpha',name:'Alpha Client'},{id:'biz_beta',name:'Beta Client'}];
      const original=window.fetch;
      window.__failBeta=false;window.__extraPosts=0;
      window.fetch=async (url,opts={})=>{
        const u=String(url), method=opts.method||'GET';
        if (method==='POST'&&u.endsWith('/leads'))window.__extraPosts++;
        if (u.includes('/workspaces/biz_beta/')&&window.__failBeta&&method==='GET')
          return {ok:false,status:503,json:async()=>({detail:'Beta temporarily unavailable'})};
        if (u.endsWith('/stages')&&method==='GET')
          return {ok:true,status:200,json:async()=>u.includes('/biz_beta/')?['prospecting','won']:['enquiry','qualified']};
        return original(url,opts);
      }
    }""")
    load(page,'client-dashboard.html')
    page.locator('#verified').wait_for(state='visible')
    page.wait_for_function("document.querySelector('#lead-stage')?.options.length===2")
    return page

def main():
    results=[]
    with sync_playwright() as p:
      browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox'])
      try:
        # Business B unavailable: no A stage choices, no A derived lead data, no create API request.
        page=ready(browser)
        assert page.locator('#lead-stage').locator('option').all_text_contents()==['enquiry','qualified']
        page.locator('#lead-name').fill('Must never create')
        page.evaluate('window.__failBeta=true')
        page.locator('#workspace').select_option('biz_beta')
        page.wait_for_function("document.querySelector('#status').textContent.includes('Beta temporarily unavailable')")
        assert page.locator('#lead-stage').locator('option').count()==0
        assert 'No previous business records' in page.locator('#lead-list').inner_text()
        assert page.locator('#summary-lead-count').inner_text()=='—'
        assert 'Waiting for authorized workspace records' in page.locator('#plan-live-count').inner_text()
        assert page.locator('#ai-plan-generate').is_disabled()
        assert page.locator('#add-form button[type=submit]').is_disabled()
        page.evaluate("document.querySelector('#add-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))")
        page.wait_for_function("document.querySelector('#status').textContent.includes('Wait for the authorized workspace')")
        assert page.evaluate('window.__extraPosts')==0
        results.append('PASS unavailable Beta clears Alpha stage choices, lead counts and form; no create call permitted')
        page.evaluate('window.__failBeta=false')
        page.locator('#refresh').click()
        page.wait_for_function("document.querySelector('#lead-stage')?.options[0]?.value==='prospecting'")
        assert page.locator('#lead-stage').locator('option').all_text_contents()==['prospecting','won']
        assert page.locator('#add-form button[type=submit]').is_enabled()
        results.append('PASS authorized Beta recovery loads only Beta pipeline stages and reenables lead form')
        # Even a refresh of the SAME business must not leave unverified old lead data/AI evidence onscreen.
        page.evaluate('window.__failBeta=true')
        page.locator('#refresh').click()
        page.wait_for_function("document.querySelector('#status').textContent.includes('Beta temporarily unavailable')")
        assert 'No previous business records' in page.locator('#lead-list').inner_text()
        assert page.locator('#add-form button[type=submit]').is_disabled()
        assert page.locator('#count').inner_text()=='—'
        assert 'Waiting for authorized workspace records' in page.locator('#plan-live-count').inner_text()
        assert page.locator('#ai-plan-generate').is_disabled()
        results.append('PASS failed same-business refresh clears formerly verified lead and AI evidence and disables mutations')
        page.close()
        # Delayed Alpha stage response cannot override the new Beta business.
        page=ready(browser)
        page.evaluate("""()=>{
          const original=window.fetch;window.__delayA=true;window.__releaseA=null;
          window.fetch=async (url,opts={})=>{
            if (window.__delayA&&String(url).endsWith('/biz_alpha/stages'))
              return new Promise(resolve=>{window.__releaseA=()=>resolve({ok:true,status:200,json:async()=>['alpha_only']})});
            return original(url,opts);
          }
        }""")
        page.locator('#refresh').click()
        page.wait_for_function('typeof window.__releaseA === "function"')
        page.locator('#workspace').select_option('biz_beta')
        page.wait_for_function("document.querySelector('#lead-stage')?.options[0]?.value==='prospecting'")
        page.evaluate('window.__releaseA()')
        page.wait_for_timeout(200)
        assert page.locator('#lead-stage').locator('option').all_text_contents()==['prospecting','won']
        assert page.locator('#workspace').input_value()=='biz_beta'
        assert page.locator('#verified').is_visible()
        results.append('PASS delayed Alpha response cannot overwrite loaded Beta pipeline stages')
        page.close()
      finally:browser.close()
    (ROOT/'evidence'/'TENANT_STAGE_ISOLATION.txt').write_text('\n'.join(results)+'\n')
    print('\n'.join(results))
if __name__=='__main__':main()
