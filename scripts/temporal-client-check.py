"""Offline Chromium tests of actual receipt-client timers with synthetic responses.
No network navigation, credentials, PayPal, deployed Worker or D1 is exercised.
"""
from pathlib import Path
import os,json
from playwright.sync_api import sync_playwright
OUT=Path(os.environ.get('RR_BROWSER_ARTIFACTS','/mnt/data/rr030-browser'))
checks=[]
def check(name,value):
    assert value,name
    checks.append(name)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('RR_CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    context=browser.new_context()
    shell=(OUT/'buyer-access.html').read_text().replace('<script src="/assets/receipt-access.js" defer></script>','')
    source=(OUT/'receipt-client.js').read_text()
    html=(OUT/'buyer-receipt.html').read_text()
    token='aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789_-ABCDE'
    def setup(boundary_ms=10000,slow=False):
        page=context.new_page();page.set_content(shell)
        page.evaluate('''({html,remaining,slow})=>{
          history.replaceState=()=>{};window.calls=[];window.denied=false;window.slow=slow;
          const doc=new DOMParser().parseFromString(html,'text/html');const main=doc.querySelector('#rr-document');
          main.dataset.checkedAt='2026-10-27T20:00:00.000Z';main.dataset.nextBoundary=new Date(Date.parse(main.dataset.checkedAt)+remaining).toISOString();
          window.fixture=doc.documentElement.outerHTML;window.timer=null;window.realTimer=setTimeout;
          window.setTimeout=(fn,ms)=>{window.timer={fn,ms};return 42;};window.clearTimeout=()=>{window.timer=null;};
          window.fetch=async(url,options)=>{window.calls.push({url,options});if(window.slow)await new Promise(r=>window.realTimer(r,40));return new Response(window.denied?'denied':window.fixture,{status:window.denied?409:200});};
        }''',{'html':html,'remaining':boundary_ms,'slow':slow})
        page.add_script_tag(content=source)
        page.get_by_label('Buyer access token').fill(token)
        page.get_by_role('button',name='Open protected receipt').click()
        return page
    page=setup();page.locator('#rr-result #rr-document').wait_for()
    check('deadline timer uses server interval minus request time',0<page.evaluate('window.timer.ms')<=10000)
    check('private presentation appears only after verified response',page.locator('#rr-result #rr-document').is_visible())
    page.evaluate('window.denied=true;window.timer.fn()')
    page.get_by_text('The current receipt requires review or is not ready.',exact=True).wait_for()
    check('deadline fetch clears stale private content',page.locator('#rr-result #rr-document').count()==0)
    check('deadline denial hides export and print',not page.locator('#rr-actions').is_visible())
    check('deadline retry preserves header-only bearer',page.evaluate('window.calls.length')==2 and token not in page.evaluate('window.calls[1].url'))
    page.close()
    page=setup(3600000);page.locator('#rr-result #rr-document').wait_for()
    check('long deadlines cap periodic recheck at one minute',page.evaluate('window.timer.ms')==60000)
    page.get_by_role('button',name='Close receipt').click()
    check('closing cancels the scheduled check',page.evaluate('window.timer') is None)
    check('closing clears protected content',page.locator('#rr-result #rr-document').count()==0)
    page.close()
    page=setup(1,True)
    page.get_by_text('The licensing time boundary has been reached. Reopen to verify current status.',exact=True).wait_for()
    check('response arriving beyond deadline is never displayed',page.locator('#rr-result #rr-document').count()==0)
    check('expired-in-flight response cannot be printed',not page.locator('#rr-actions').is_visible())
    page.close()
    page=setup();page.locator('#rr-result #rr-document').wait_for()
    page.evaluate("Object.defineProperty(document,'visibilityState',{get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))")
    check('hidden tab clears private record',page.locator('#rr-result #rr-document').count()==0)
    check('hidden tab cancels stale recheck',page.evaluate('window.timer') is None)
    page.close();browser.close()
report={'passed':len(checks),'failed':0,'checks':checks,'method':'Offline Chromium with injected response and timer; no network acceptance'}
(OUT/'temporal-client-checks.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
