"""Optional local Chromium checks. Requires Playwright Python and Chromium.
No user account, production origin or real buyer data is accessed.
"""
from pathlib import Path
import hashlib
import json
import os
import tempfile
import subprocess
import urllib.request
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('RR_BROWSER_ARTIFACTS', str(Path(tempfile.gettempdir())/'rightsreceipt-browser-checks')))
OUT.mkdir(parents=True, exist_ok=True)
port = os.environ.get('RR_RECEIPT_TEST_PORT', '8789')
server = subprocess.Popen(['node','--no-warnings','--experimental-strip-types','--experimental-loader','./scripts/receipt-ts-test-loader.mjs','scripts/serve-receipt-experience-fixture.mjs'], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
checks=[]
def check(name, condition):
    assert condition, name
    checks.append(name)
try:
    ready=json.loads(server.stdout.readline())
    origin, public_id, token=ready['origin'],ready['publicId'],ready['buyerToken']
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get('RR_CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':1280,'height':900},accept_downloads=True)
        page=context.new_page();errors=[];requests=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('request',lambda req:requests.append(req.url))
        page.goto(origin+'/verify/receipt/'+public_id,wait_until='networkidle')
        check('public active status',page.get_by_text('Active in Sandbox (at check time)',exact=True).count()==1)
        check('public excludes private buyer', 'Private Buyer Organization' not in page.locator('body').inner_text())
        check('public excludes price','425.00' not in page.locator('body').inner_text())
        page.screenshot(path=str(OUT/'public-desktop.png'),full_page=True)
        page.set_viewport_size({'width':390,'height':844})
        page.screenshot(path=str(OUT/'public-mobile.png'),full_page=True)
        check('mobile has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
        page.goto(origin+'/receipts/buyer#'+token,wait_until='networkidle')
        page.get_by_text('Current Sandbox receipt loaded. Status is rechecked within 60 seconds.',exact=True).wait_for()
        check('fragment erased',page.url==origin+'/receipts/buyer')
        check('private organization visible',page.get_by_text('Private Buyer Organization',exact=True).count()==1)
        check('exact total visible',page.get_by_text('$425.00 USD',exact=True).count()==1)
        check('one main landmark',page.locator('main').count()==1)
        check('token cleared from password input',page.locator('#rr-token').input_value()=='')
        check('no persistent browser token',page.evaluate('localStorage.length===0 && sessionStorage.length===0'))
        check('private mobile has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
        page.screenshot(path=str(OUT/'buyer-mobile.png'),full_page=True)
        page.set_viewport_size({'width':1280,'height':900})
        page.screenshot(path=str(OUT/'buyer-desktop.png'),full_page=True)
        check('QR accessible label',page.get_by_role('img',name='QR code for public receipt verification').count()==1)
        with page.expect_download() as pending:
            page.get_by_role('button',name='Export canonical JSON').click()
        download=pending.value; path=OUT/'browser-export.json';download.save_as(path)
        data=path.read_bytes();receipt=json.loads(data)
        check('export schema matches',receipt['schema_version']=='rightsreceipt-receipt-v1')
        public=context.request.get(origin+'/api/receipt-verification/'+public_id).json()
        check('download bytes match public hash',hashlib.sha256(data).hexdigest()==public['receipt']['sha256'])
        page.emulate_media(media='print')
        check('print hides controls',not page.locator('#rr-actions').is_visible() and not page.locator('#rr-access').is_visible())
        check('print preserves receipt content',page.locator('#rr-document').is_visible())
        page.emulate_media(media='screen')
        context.request.get(origin+'/__fixture/revoke')
        page.get_by_role('button',name='Refresh status').click()
        page.get_by_text('Receipt access denied or no record is available.',exact=True).wait_for()
        check('revoked access clears private DOM',page.locator('#rr-document').count()==0)
        check('revoked access hides export',not page.get_by_role('button',name='Export canonical JSON').is_visible())
        for state,label in [('scheduled','Scheduled in Sandbox'),('expired','Expired'),('refunded','Refunded'),('revoked','Revoked')]:
            context.request.get(origin+'/__fixture/state/'+state)
            page.goto(origin+'/verify/receipt/'+public_id,wait_until='networkidle')
            check('browser public status '+state,page.get_by_text(label,exact=True).count()==1)
        page.goto(origin+'/verify/receipt/'+'z'*32,wait_until='networkidle')
        check('not-found browser state',page.get_by_text('Record not found',exact=True).count()==1)
        check('no cross-origin page requests',all(url.startswith(origin+'/') for url in requests))
        check('no capability in HTTP request URLs',all(token not in url for url in requests))
        check('no browser script exceptions',not errors)
        context.close()
        js_disabled=browser.new_context(java_script_enabled=False)
        public_page=js_disabled.new_page();public_page.goto(origin+'/verify/receipt/'+public_id)
        check('public verification works without JavaScript',public_page.get_by_text('Revoked',exact=True).count()==1)
        browser.close()
    (OUT/'browser-checks.json').write_text(json.dumps({'checks':len(checks),'passed':checks,'errors':errors,'syntheticOnly':True,'frameworkBuildExecuted':False},indent=2)+'\n')
    print(json.dumps({'passed':len(checks),'failed':0,'artifacts':str(OUT)}))
finally:
    server.terminate()
    try:server.wait(timeout=5)
    except subprocess.TimeoutExpired:server.kill()
