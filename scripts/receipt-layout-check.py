"""Offline DOM/layout checks only. No HTTP navigation or network-policy bypass.
Requires optional Playwright Python and Chromium. Does not prove authentication,
HTTP integration, real browser bearer transport, or the full Vite/Worker build.
"""
from pathlib import Path
import json, os, subprocess, tempfile
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('RR_BROWSER_ARTIFACTS',str(Path(tempfile.gettempdir())/'rightsreceipt-browser-checks')))
subprocess.run(['node','--no-warnings','--experimental-strip-types','--experimental-loader','./scripts/receipt-ts-test-loader.mjs','scripts/render-receipt-fixtures.mjs'],cwd=ROOT,check=True,capture_output=True)
checks=[]
def check(name,condition):
    assert condition,name
    checks.append(name)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('RR_CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':1280,'height':900},java_script_enabled=False)
    page=ctx.new_page()
    for state,label in [('active','Active in Sandbox (at check time)'),('scheduled','Scheduled in Sandbox'),('expired','Expired'),('refunded','Refunded'),('revoked','Revoked')]:
        page.set_content((OUT/f'public-{state}.html').read_text(),wait_until='domcontentloaded')
        check('offline public status '+state,page.get_by_text(label,exact=True).count()==1)
        check('public privacy '+state,'Private Buyer Organization' not in page.locator('body').inner_text() and '425.00' not in page.locator('body').inner_text())
        if state=='active':
            page.screenshot(path=str(OUT/'public-desktop.png'),full_page=True)
            page.set_viewport_size({'width':390,'height':844})
            check('public mobile no horizontal overflow',page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
            page.screenshot(path=str(OUT/'public-mobile.png'),full_page=True)
            page.set_viewport_size({'width':1280,'height':900})
    page.set_content((OUT/'buyer-receipt.html').read_text())
    check('private receipt title',page.get_by_role('heading',name='Harbor After Rain',exact=True).count()==1)
    check('private buyer identity visible',page.get_by_text('Private Buyer Organization',exact=True).count()==1)
    check('accepted total visible',page.get_by_text('$425.00 USD',exact=True).count()==1)
    check('one main landmark',page.locator('main').count()==1)
    check('accessible QR name',page.get_by_role('img',name='QR code for public receipt verification').count()==1)
    page.screenshot(path=str(OUT/'buyer-desktop.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    check('private mobile no horizontal overflow',page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
    page.screenshot(path=str(OUT/'buyer-mobile.png'),full_page=True)
    page.emulate_media(media='print')
    check('print instructions hidden',not page.locator('.no-print').first.is_visible())
    check('print retains scope',page.get_by_role('heading',name='Scope and restrictions').is_visible())
    check('print retains QR',page.get_by_role('img',name='QR code for public receipt verification').is_visible())
    page.emulate_media(media='screen')
    page.set_content((OUT/'buyer-access.html').read_text())
    check('labeled private password input',page.get_by_label('Buyer access token').get_attribute('type')=='password')
    check('export hidden until authorization',not page.locator('#rr-export').is_visible())
    check('JavaScript-off instruction visible',page.locator('noscript').is_visible() and 'JavaScript is required' in page.locator('noscript').inner_text())
    # Interactive DOM unit checks only. No HTTP fetch/navigation is attempted.
    dom_context=browser.new_context(viewport={'width':1280,'height':900})
    dom=dom_context.new_page();errors=[]
    dom.on('pageerror',lambda e:errors.append(str(e)))
    markup=(OUT/'buyer-access.html').read_text().replace('<script src="/assets/receipt-access.js" defer></script>','')
    dom.set_content(markup)
    dom.evaluate('''html=>{window.offlineReceipt=html;window.offlineCalls=[];window.offlineDenied=false;window.offlinePrints=0;
      history.replaceState=()=>{};
      window.print=()=>{window.offlinePrints++;};
      window.fetch=async(url,options)=>{window.offlineCalls.push({url,options});return new Response(window.offlineDenied?'denied':window.offlineReceipt,{status:window.offlineDenied?404:200,headers:{'Content-Type':'text/html'}});};
    }''',(OUT/'buyer-receipt.html').read_text())
    dom.add_script_tag(content=(OUT/'receipt-client.js').read_text())
    token='aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789_-ABCDE'
    dom.get_by_label('Buyer access token').fill(token)
    dom.get_by_role('button',name='Open protected receipt').click()
    dom.get_by_text('Current Sandbox receipt loaded. Status is rechecked within 60 seconds.',exact=True).wait_for()
    check('DOM client renders private receipt',dom.locator('#rr-document').is_visible())
    check('DOM client retains one main landmark',dom.locator('main').count()==1)
    check('DOM client clears token input',dom.get_by_label('Buyer access token').input_value()=='')
    check('DOM fetch uses bearer not URL',dom.evaluate('window.offlineCalls[0].options.headers.Authorization')=='Bearer '+token and token not in dom.evaluate('window.offlineCalls[0].url'))
    check('DOM client sets no-store',dom.evaluate('window.offlineCalls[0].options.cache')=='no-store')
    dom.get_by_role('button',name='Print receipt').click()
    dom.wait_for_function('window.offlinePrints === 1')
    check('DOM print refreshes before printing',dom.evaluate('window.offlineCalls.length')==2)
    dom.evaluate('window.offlineDenied=true')
    dom.get_by_role('button',name='Refresh status').click()
    dom.get_by_text('Receipt access denied or no record is available.',exact=True).wait_for()
    check('DOM access denial clears private record',dom.locator('#rr-document').count()==0)
    check('DOM access denial hides export',not dom.locator('#rr-export').is_visible())
    check('DOM client has no script exceptions',not errors)
    dom_context.close()
    browser.close()
report={'passed':len(checks),'failed':0,'checks':checks,'method':'Chromium offline HTML layout plus DOM unit checks with in-memory fetch responses; no navigation','httpNavigation':'not exercised by this offline check','fullBrowserAcceptance':False,'syntheticOnly':True}
(OUT/'layout-checks.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'passed':len(checks),'failed':0,'method':'offline layout only'}))
