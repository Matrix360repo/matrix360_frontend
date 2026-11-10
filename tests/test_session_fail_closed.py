"""Executable Chromium checks against recovered frontend JS and mocked HTTP responses.
No claim of real JWT/RLS testing or latest Render backend integration.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
from test_api_origin_contract import launch,load,DEFAULT

ROOT=Path(__file__).resolve().parents[1]


def session(page,delay_ms=120000):
    page.evaluate('''(delay)=>{
      sessionStorage.setItem('matrix360_pilot_token','SYNTHETIC_ONLY');
      sessionStorage.setItem('matrix360_pilot_expires_at',String(Date.now()+delay));
    }''', delay_ms)


def active(page):
    load(page,'client-dashboard.html')
    page.locator('#verified').wait_for(state='visible',timeout=9000)
    assert 'Synthetic example' in page.locator('#lead-list').inner_text()


def clean(page):
    assert page.locator('#verified').is_hidden()
    assert page.locator('#denied').is_visible()
    assert page.locator('#lead-list').inner_text()==''
    assert page.locator('#ai-goal-brief').input_value()==''
    assert page.locator('#engagement-goal-text').inner_text()==''
    assert page.locator('#workspace-single-name').inner_text()==''
    assert 'Waiting for authorized workspace records' in page.locator('#plan-live-count').inner_text()
    assert page.evaluate("sessionStorage.getItem('matrix360_pilot_token')") is None
    assert page.evaluate("sessionStorage.getItem('matrix360_engagement_goal_v1')") is None


def main():
    checks=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        try:
            # Idle expiry must remove all business information without any network operation.
            page=launch(browser)
            page.clock.install()
            session(page,3500)
            page.evaluate('''()=>sessionStorage.setItem('matrix360_engagement_goal_v1', JSON.stringify({
              v:1,createdAt:Date.now(),goal:'I want to find qualified customers in a nearby state and plan new outreach',
              businessType:'Manufacturing / B2B',targetMarket:'West Bengal'}))''')
            active(page)
            page.locator('#ai-goal-brief').fill('Synthetic sensitive business objective 1')
            page.clock.fast_forward(4100)
            page.locator('#denied').wait_for(state='visible')
            clean(page)
            checks.append('PASS idle token expiry proactively clears lead table, counts, business identity, AI brief and public goal')
            page.close()

            # GET denial is a signal that the currently displayed business cannot be shown.
            page=launch(browser)
            session(page)
            page.evaluate('''()=>{
              sessionStorage.setItem('matrix360_engagement_goal_v1',JSON.stringify({v:1,createdAt:Date.now(),
                goal:'I want a marketing plan to improve qualified buyer enquiries in a new region',
                businessType:'Manufacturing / B2B',targetMarket:'West Bengal'}));
              const original=window.fetch;window.__revoked=false;
              window.fetch=async(url,opts={})=>{
                if(window.__revoked && /\\/(stages|leads)$/.test(String(url)) && (!opts.method || opts.method==='GET'))
                  return {ok:false,status:403,json:async()=>({detail:'Revoked access'})};
                return original(url,opts);
              };
            }''')
            active(page)
            page.locator('#engagement-continuation').wait_for(state='visible')
            page.locator('#ai-goal-brief').fill('Business objective that must be cleared')
            page.evaluate('window.__revoked=true')
            page.locator('#refresh').click()
            page.locator('#denied').wait_for(state='visible')
            clean(page)
            checks.append('PASS workspace GET 403 clears business data, ends session and discards pending public objective')
            page.close()

            # Service-specific 403 should not falsely revoke a valid CRM membership.
            page=launch(browser)
            session(page)
            page.evaluate('''()=>{const original=window.fetch;window.fetch=async(url,opts={})=>{
              if(String(url).endsWith('/ai/capabilities'))return {ok:false,status:403,json:async()=>({detail:'AI unavailable'})};
              return original(url,opts);
            }}''')
            active(page)
            page.locator('#ai-plan-status').wait_for(state='visible')
            assert page.locator('#verified').is_visible()
            assert page.locator('#ai-plan-generate').is_disabled()
            checks.append('PASS AI capability 403 degrades feature but retains otherwise authorized CRM session')
            page.close()

            # Switching businesses must not keep the previous business' editable AI brief.
            page=launch(browser)
            session(page)
            page.evaluate("window.__workspaces=[{id:'biz_first',name:'Business One'},{id:'biz_fourth_independent',name:'Business Two'}]")
            active(page)
            page.locator('#ai-goal-brief').fill('Previously entered company A marketing objective')
            page.locator('#workspace').select_option('biz_fourth_independent')
            page.wait_for_function("document.querySelector('#workspace').value==='biz_fourth_independent'")
            assert page.locator('#ai-goal-brief').input_value()==''
            page.wait_for_function("document.querySelector('#workspace-single-name').textContent==='Business Two'")
            checks.append('PASS switching to fourth dynamic workspace clears previous business AI brief')
            page.close()

            # A delayed 403 for a previously selected business must NOT log out an
            # independently authorized current business (workspace-switch race).
            page=launch(browser)
            session(page)
            page.evaluate("window.__workspaces=[{id:'biz_first',name:'Business One'},{id:'biz_second',name:'Business Two'}]")
            active(page)
            page.evaluate('''()=>{
              const normal=window.fetch;window.__delayPrevious=false;window.__releasePrevious=null;
              window.fetch=async(url,opts={})=>{
                if(window.__delayPrevious && String(url).endsWith('/workspaces/biz_first/leads') && (!opts.method||opts.method==='GET')){
                  return new Promise(resolve=>window.__releasePrevious=()=>resolve({ok:false,status:403,json:async()=>({detail:'Old workspace revoked'})}));
                }
                return normal(url,opts);
              }
            }''')
            page.evaluate('window.__delayPrevious=true')
            page.locator('#refresh').click()
            page.wait_for_function('typeof window.__releasePrevious === "function"')
            page.locator('#workspace').select_option('biz_second')
            page.wait_for_function("document.querySelector('#workspace-single-name').textContent==='Business Two'")
            page.evaluate('window.__releasePrevious()')
            page.wait_for_timeout(200)
            assert page.locator('#verified').is_visible()
            assert page.locator('#workspace').input_value()=='biz_second'
            assert page.evaluate("sessionStorage.getItem('matrix360_pilot_token')")=='SYNTHETIC_ONLY'
            checks.append('PASS delayed 403 from previous workspace does not revoke current authorized workspace')
            page.close()
        finally:browser.close()
    out=ROOT/'evidence'/'SESSION_REVOCATION_AND_IDLE_EXPIRY.txt'
    out.write_text('\n'.join(checks)+'\n')
    print('\n'.join(checks))

if __name__=='__main__':main()
