"""Offline Chromium checks of the real creator client and rendered page.
Injected session/offer replies are not a genuine Access login or Worker deployment.
"""
from pathlib import Path
import json, os, re, subprocess, tempfile
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('RR_CREATOR_ARTIFACTS', str(Path(tempfile.gettempdir())/'rightsreceipt-creator-review')))
OUT.mkdir(parents=True,exist_ok=True)
render = '''import {renderCreatorReview} from './apps/api/src/creator-review.ts';
import {CREATOR_REVIEW_CLIENT} from './apps/web/src/creator-review-client.ts';
console.log(JSON.stringify({html:renderCreatorReview('10000000-0000-4000-8000-000000000001','0'.repeat(32)),js:CREATOR_REVIEW_CLIENT}));'''
run = subprocess.run(['node','--no-warnings','--experimental-strip-types','--experimental-loader','./scripts/consent-ts-test-loader.mjs','--input-type=module','-e',render],cwd=ROOT,check=True,capture_output=True,text=True)
assets=json.loads(run.stdout)
checks=[]
def check(name, condition):
    assert condition,name
    checks.append(name)
fixture = '''() => {
if(!crypto.randomUUID)crypto.randomUUID=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);};
window.calls=[];window.postBodies=[];window.failPost=0;window.badSession=false;window.clock=1793127600000;window.timers=[];window.rrHidden=false;window.deferReview=false;window.reviewResolve=null;window.deferDecision=false;window.decisionResolve=null;
Date.now=()=>window.clock;window.setTimeout=(fn,ms)=>{window.timers.push({fn,ms});return window.timers.length;};window.clearTimeout=()=>{};
Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.rrHidden});
window.offer={schemaVersion:'human-consent-view-v1',environment:'sandbox',caseId:'10000000-0000-4000-8000-000000000001',caseVersion:2,
 termsVersionId:'10000000-0000-4000-8000-000000000002',quoteId:'10000000-0000-4000-8000-000000000003',reviewHash:'a'.repeat(64),
 stage:'awaiting_creator',creatorDecisionId:null,currency:'USD',amountCents:42500,creatorCopyVersion:'creator-rights-decision-v1',paymentConfirmed:false,permissionGranted:false,
 creatorCopy:'I confirm this decision applies to the exact displayed licensing rights and USD quote. Approval alone does not grant permission or confirm payment.',
 asset:{title:'Harbor After Rain',creator:'Demo Creator',fingerprint:'b'.repeat(64)},period:{startDate:'2026-11-01',endDateExclusive:'2027-01-30',lastPermittedDate:'2027-01-29'},
 rights:{use_purpose:'commercial',channels:['instagram_paid','facebook_paid'],paid_advertising:true,territories:['US','CA'],start_date:'2026-11-01',duration_days:90,max_impressions:500000,exclusivity:'non_exclusive',modification_scope:'crop_only',attribution:'not_required',sublicensing:'prohibited',ai_use:'prohibited'},
 lineItems:[{description:'Base license',amountCents:20000},{description:'Paid social',amountCents:10000},{description:'Territory',amountCents:5000},{description:'Duration',amountCents:5000},{description:'Crop permission',amountCents:2500}]};
window.fetch=async(url,options)=>{window.calls.push({url,options:{...options,signal:undefined}});
 if(url==='/api/creator/session')return window.badSession?new Response('{}',{status:403}):Response.json({authenticated:true,environment:'sandbox',expiresInMs:600000});
 if(url.startsWith('/api/invoices/creator/cases/'))return new Response('{}',{status:503});
 if(url.endsWith('/decision')){window.postBodies.push(options.body);if(window.failPost){const code=window.failPost;window.failPost=0;return new Response('{}',{status:code});}window.offer.stage='awaiting_buyer';window.offer.caseVersion++;window.offer.creatorDecisionId='10000000-0000-4000-8000-000000000004';const result={outcome:'recorded',resultId:window.offer.creatorDecisionId,caseVersion:window.offer.caseVersion,paymentConfirmed:false,permissionGranted:false};if(window.deferDecision)return new Promise(resolve=>window.decisionResolve=()=>resolve(Response.json(result)));return Response.json(result);}
 if(url.endsWith('/review')&&window.deferReview)return new Promise(resolve=>window.reviewResolve=()=>resolve(Response.json(window.offer)));
 return Response.json(window.offer);};
}'''
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('RR_CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':1000})
    page.set_default_timeout(5000)
    browser_errors=[]
    page.on('pageerror',lambda error: browser_errors.append(str(error)))
    def reset():
        page.set_content(re.sub(r'<script[^>]*src="/assets/creator-review.js"[^>]*></script>','',assets['html']))
        page.evaluate(fixture)
        page.add_script_tag(content=assets['js'])
        page.wait_for_function("document.querySelector('#offer').children.length > 0 && !document.querySelector('#invoice-panel').hidden")
    reset()
    check('all twelve licensing fields rendered',page.locator('#offer dt').count()==21)
    check('current price rendered', '$425.00 (Sandbox)' in page.locator('#offer').inner_text())
    check('exclusive UTC end date rendered','2027-01-30' in page.locator('#offer').inner_text())
    check('one main landmark',page.locator('main').count()==1)
    check('confirmation starts unchecked',not page.locator('#confirm').is_checked())
    check('save initially disabled',page.locator('#submit').is_disabled())
    check('all background reads only',page.evaluate('calls.every(c=>!c.options.method)'))
    check('no-store same-origin cookie fetch',page.evaluate("calls.every(c=>c.options.cache==='no-store'&&c.options.credentials==='same-origin'&&c.options.redirect==='error')"))
    check('AJAX expiry handling requested',page.evaluate("calls.every(c=>c.options.headers['X-Requested-With']==='XMLHttpRequest')"))
    check('no bearer token in requests',page.evaluate("calls.every(c=>!c.options.headers.Authorization&&!c.options.headers['cf-access-jwt-assertion'])"))
    check('fresh deadline at most five minutes',page.evaluate('timers.at(-1).ms===300000'))
    check('optional invoice GET runs without mutation',page.evaluate("calls.some(c=>c.url==='/api/invoices/creator/cases/'+offer.caseId&&!c.options.method)"))
    check('unavailable invoice controls preserve the decision form',page.locator('#decision-form').is_visible() and page.locator('#create-form').is_hidden() and page.locator('#send-form').is_hidden())
    check('invoice confirmations start unchecked',not page.locator('#create-confirm').is_checked() and not page.locator('#send-confirm').is_checked())
    page.screenshot(path=str(OUT/'creator-review-desktop.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    check('mobile has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
    page.screenshot(path=str(OUT/'creator-review-mobile.png'),full_page=True)
    page.set_viewport_size({'width':1280,'height':1000})
    page.locator('#confirm').check()
    check('explicit checkbox enables decision',page.locator('#submit').is_enabled())
    page.locator('#decision').select_option('rejected')
    check('rejection requires reason',page.locator('#submit').is_disabled())
    page.locator('#reason').fill('The proposed scope is not acceptable.')
    check('reason enables rejection',page.locator('#submit').is_enabled())
    page.locator('#decision').select_option('approved');page.locator('#reason').fill('')
    page.locator('#submit').click()
    page.wait_for_function('postBodies.length===1 && document.querySelector("#offer").innerText.includes("Awaiting buyer acceptance")')
    posted=json.loads(page.evaluate('postBodies[0]'))
    check('canonical decision endpoint used',page.evaluate("calls.some(c=>c.url==='/api/consent/creator/cases/'+offer.caseId+'/decision')"))
    check('post binds exact review and versions',posted['expectedCaseVersion']==2 and posted['reviewHash']=='a'*64 and posted['confirmed'] is True)
    check('browser sends no price actor or paid authority',not any(k in posted for k in ['amountCents','actor','workspaceId','paid','permission']))
    check('success re-reads authoritative offer',page.evaluate('calls.filter(c=>c.url.endsWith("/review")).length===2'))
    check('confirmation resets after success',not page.locator('#confirm').is_checked())
    reset();page.evaluate('failPost=503');page.locator('#confirm').check();page.locator('#submit').click()
    page.wait_for_function('postBodies.length===1 && document.querySelector("#submit").textContent.includes("Retry")')
    check('uncertain outcome has no automatic retry',page.evaluate('postBodies.length===1'))
    check('uncertain retry freezes decision fields',page.locator('#decision').is_disabled() and page.locator('#reason').is_disabled())
    page.locator('#submit').click();page.wait_for_function('postBodies.length===2')
    check('explicit retry preserves exact idempotency command',page.evaluate('postBodies[0]===postBodies[1]'))
    reset();page.evaluate('failPost=403');page.locator('#confirm').check();page.locator('#submit').click();page.wait_for_function('postBodies.length===1 && document.querySelector("#decision-form").hidden')
    check('denied response clears private data',page.locator('#offer').inner_text()=='')
    reset();page.evaluate('clock+=300000;timers.at(-1).fn()')
    check('deadline clears offer and disables action',page.locator('#offer').inner_text()=='' and page.locator('#submit').is_disabled())
    check('deadline never submits a decision',page.evaluate('postBodies.length===0'))
    reset();page.evaluate("rrHidden=true;document.dispatchEvent(new Event('visibilitychange'))")
    check('hidden tab clears private review',page.locator('#offer').inner_text()=='' and page.locator('#decision-form').is_hidden())
    reset();page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))")
    check('history-restored tab clears private review',page.locator('#offer').inner_text()=='')
    reset();page.evaluate("offer.asset.title='<img src=x onerror=alert(1)>'");page.locator('#reload').click();page.wait_for_function("document.querySelector('#offer').innerText.includes('<img')")
    check('offer text is escaped without HTML execution',page.locator('#offer img').count()==0)
    page.emulate_media(media='print');check('print hides decision form',page.locator('#decision-form').is_hidden())
    page.emulate_media(media='screen')
    reset();page.evaluate('deferReview=true');page.locator('#reload').click();page.wait_for_function('reviewResolve!==null')
    page.evaluate('clock+=300000;timers.at(-1).fn()')
    page.evaluate('async()=>{reviewResolve();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);}')
    check('late review response after expiry cannot repopulate private data',page.locator('#offer').inner_text()=='' and page.locator('#decision-form').is_hidden() and page.locator('#invoice-panel').is_hidden())
    reset();page.evaluate('deferReview=true');page.locator('#reload').click();page.wait_for_function('reviewResolve!==null')
    page.evaluate("rrHidden=true;document.dispatchEvent(new Event('visibilitychange'))")
    page.evaluate('async()=>{reviewResolve();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);}')
    check('late review response after hide cannot repopulate private data',page.locator('#offer').inner_text()=='' and page.locator('#submit').is_disabled())
    reset();page.evaluate('deferDecision=true');page.locator('#confirm').check();page.locator('#submit').click();page.wait_for_function('decisionResolve!==null')
    reads_before=page.evaluate('calls.filter(c=>c.url.endsWith("/review")).length')
    page.evaluate('clock+=300000;timers.at(-1).fn()')
    page.evaluate('async()=>{decisionResolve();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);}')
    check('late confirmed decision response after expiry cannot restore private data',page.locator('#offer').inner_text()=='' and page.locator('#submit').is_disabled())
    check('late confirmed decision does not reload or retry automatically',page.evaluate('calls.filter(c=>c.url.endsWith("/review")).length')==reads_before and page.evaluate('postBodies.length')==1)
    for name,mutation in [
        ('missing material right','delete offer.rights.ai_use'),
        ('unsupported material right',"offer.rights.sublicensing='allowed'"),
        ('inconsistent licensing date',"offer.period.endDateExclusive='2027-02-01'"),
        ('inconsistent itemized price','offer.lineItems[0].amountCents++'),
        ('missing confirmed consent copy','delete offer.creatorCopyVersion'),
    ]:
        reset();page.evaluate(mutation);page.locator('#reload').click();page.wait_for_function("document.querySelector('#status').textContent.includes('could not be validated')")
        check(name+' cannot enable any command',page.locator('#offer').inner_text()=='' and page.locator('#submit').is_disabled() and page.locator('#create-invoice').is_disabled() and page.locator('#send-invoice').is_disabled() and page.evaluate('postBodies.length')==0)
    check('no browser execution errors',not browser_errors)
    browser.close()
(OUT/'checks.json').write_text(json.dumps({'checks':checks,'passed':len(checks),'mode':'offline injected responses; not Access/browser network acceptance'},indent=2)+'\n')
print(json.dumps({'passed':len(checks),'artifacts':str(OUT)},indent=2))
