import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createD1ReceiptDirectory } from '../packages/receipts/src/access.ts';
import { createReceiptExperienceHandler,createReceiptReadLimiter,checkedReceiptOrigin } from '../packages/receipts/src/http.ts';
import { htmlEscape } from '../packages/receipts/src/presentation.ts';
import { receiptQrMatrix,receiptQrSvg } from '../packages/receipts/src/qr.ts';
import { canonicalJson,sha256Hex } from '../packages/receipts/src/canonical.ts';
import { createReceiptService } from '../packages/receipts/src/service.ts';
import { receiptExperienceFixture,ids,publicId,buyerToken,NOW,uuid } from './support/receipt-experience-fixture.mjs';
const origin='https://rightsreceipt.example';
async function harness(options={}){
 const f=await receiptExperienceFixture(options);let permitted=true;const directory={async byPublicId(p){return p===publicId?ids.case:null;},async byBuyerToken(t){return permitted&&t===buyerToken?ids.case:null;}};
 const handler=createReceiptExperienceHandler({store:f.store,directory,publicOrigin:origin,now:f.clock,allowRead:async()=>true,
  authorizeCreator:async(req,id)=>req.headers.get('Cookie')==='test-session'&&id===ids.case});
 const req=(path,options={})=>handler(new Request(origin+path,options));
 return {f,handler,req,directory,revoke:()=>{permitted=false;}};
}
const bearer={Authorization:'Bearer '+buyerToken};
for(const state of ['scheduled','active','expired','refunded','revoked'])test(`public ${state} is integrity checked and privacy minimized`,async()=>{
 const {f,req}=await harness({state});const before=f.writes;
 const r=await req('/api/receipt-verification/'+publicId);assert.equal(r.status,200);const v=await r.json();
 assert.equal(v.status,state);assert.equal(v.integrity,'verified');assert.equal(v.environment,'sandbox');assert.equal(v.receipt.sha256,f.chain[0].hash);
 for(const secret of [ids.case,ids.terms,ids.quote,ids.binding,'Private Buyer','INV2-PRIVATE','PRIVATE ORIGINAL','42500','model_id','audit_anchor',buyerToken])assert.ok(!JSON.stringify(v).includes(secret),secret);
 assert.equal(f.writes,before);
});
for(const state of ['pending_payment','canceled','rejected','pending_receipt','review_required'])test(`unissued ${state} is not mislabeled as permission`,async()=>{
 const {f,req}=await harness({issued:false});f.root.permission=null;f.root.case.permission_id=null;f.root.verification.current_status='pending';f.root.binding.invoice_status='sent';
 if(state==='canceled')f.root.binding.invoice_status='canceled';
 if(state==='rejected'){f.root.case.case_outcome='rejected';f.root.verification.current_status='rejected';}
 if(state==='pending_receipt')f.root.binding.invoice_status='paid';
 if(state==='review_required')f.root.binding.invoice_status='reconciliation_required';
 const v=await(await req('/api/receipt-verification/'+publicId)).json();assert.equal(v.status,state);assert.equal(v.receipt,null);assert.equal(v.integrity,'not_verified');
});
for(const change of [f=>{f.root.permission.review_required=1;},f=>{f.root.outbox.requested_generation++;},f=>{f.root.outbox.lease_token=uuid(99);},f=>{f.root.outbox.blocked_code='state_changed';}])test('pending or disputed finances suppress the active receipt',async()=>{
 const {f,req}=await harness();change(f);const v=await(await req('/api/receipt-verification/'+publicId)).json();assert.equal(v.status,'review_required');assert.equal(v.receipt,null);
});
for(const [label,change] of [
 ['payload amount',f=>{f.chain[0].canonical=f.chain[0].canonical.replace('42500','42501');}],
 ['source amount',f=>{f.root.quote.amount_cents++;}],['missing audit',f=>{f.root.audit=[];}],
 ['changed audit',f=>{f.root.audit[0].payload_json='{"tampered":true}';}],['pointer',f=>{f.root.verification.current_receipt_revision_id=uuid(99);}],
 ['receipt hash',f=>{f.chain[0].hash='0'.repeat(64);}],['permission state',f=>{f.root.permission.permission_state='revoked';}],
 ['invalid verification',f=>{f.root.verification.current_status='invalid';}],['wrong case',f=>{f.root.case.case_id=uuid(99);}],
 ['simulated environment',f=>{f.root.binding.environment='simulated';}],['wrong public ID',f=>{f.root.verification.public_verification_id='X'.repeat(32);}],
 ['model provenance',f=>{f.root.extractions[0].artifact_hash='c'.repeat(64);}],['paid evidence missing',f=>{f.root.evidence=[];}],
 ])test(`integrity defect: ${label} never returns licensed details`,async()=>{
 const {f,req}=await harness();change(f);const v=await(await req('/api/receipt-verification/'+publicId)).json();assert.equal(v.status,'invalid');assert.equal(v.receipt,null);
 const p=await req('/api/receipts/buyer?format=json',{headers:bearer});assert.equal(p.status,409);
});
test('a rehashed replacement still fails current source comparison',async()=>{
 const {f,req}=await harness();const data=JSON.parse(f.chain[0].canonical);data.quote.amount_cents=42499;f.chain[0].canonical=canonicalJson(data);f.chain[0].hash=await sha256Hex(f.chain[0].canonical);
 assert.equal((await(await req('/api/receipt-verification/'+publicId)).json()).status,'invalid');
});
test('read-time expiry never continues to display an old active receipt',async()=>{
 const {f,req}=await harness();f.setNow('2027-01-25T00:00:00.000Z');const v=await(await req('/api/receipt-verification/'+publicId)).json();assert.equal(v.status,'review_required');assert.equal(v.receipt,null);
});
test('source change while hashing yields a non-authoritative result',async()=>{
 const {f,req}=await harness();let n=0;f.setOnLoad(()=>{if(++n===2)f.root.permission.review_required=1;});
 const v=await(await req('/api/receipt-verification/'+publicId)).json();assert.equal(v.status,'review_required');assert.equal(v.receipt,null);
});
test('midnight rollover during final check fails closed',async()=>{
 const {f,req}=await harness();let n=0;f.setOnLoad(()=>{if(++n===2)f.setNow('2026-10-28T00:00:00.000Z');});
 const v=await(await req('/api/receipt-verification/'+publicId)).json();assert.equal(v.status,'review_required');
});
test('authorized canonical JSON is byte-identical and carries its receipt hash',async()=>{
 const {f,req}=await harness();const r=await req('/api/receipts/buyer?format=json',{headers:bearer});assert.equal(r.status,200);
 const body=await r.text();assert.equal(body,f.chain[0].canonical);assert.equal(await sha256Hex(body),r.headers.get('X-Receipt-SHA256'));
 assert.match(r.headers.get('Content-Disposition'),/^attachment; filename="rightsreceipt-sandbox-revision-1.json"$/);
 assert.ok(!body.includes('PRIVATE ORIGINAL'));assert.ok(!body.includes('buyer@example'));assert.ok(!body.includes(buyerToken));
});
test('creator record uses the injected case-specific session authorizer',async()=>{
 const {req}=await harness();assert.equal((await req('/api/receipts/creator/'+ids.case+'?format=json',{headers:{Cookie:'test-session'}})).status,200);
 for(const headers of [{},{'x-rightsreceipt-demo-role':'creator'},bearer])assert.equal((await req('/api/receipts/creator/'+ids.case+'?format=json',{headers})).status,404);
 assert.equal((await req('/api/receipts/creator/'+uuid(99),{headers:{Cookie:'test-session'}})).status,404);
});
test('missing creator auth callback denies even valid-looking headers',async()=>{
 const {f,directory}=await harness();const handler=createReceiptExperienceHandler({store:f.store,directory,publicOrigin:origin,now:f.clock,allowRead:async()=>true});
 assert.equal((await handler(new Request(origin+'/api/receipts/creator/'+ids.case,{headers:{Cookie:'test-session'}}))).status,404);
});
for(const supplied of ['',publicId,'Bearer '+publicId,'Bearer '+ids.case,'Bearer '+buyerToken+' EXTRA'])test('public references and malformed credentials do not authorize exports',async()=>{
 const {req}=await harness();assert.equal((await req('/api/receipts/buyer?format=json',{headers:{Authorization:supplied}})).status,404);
});
test('revocation during hashing blocks the private response',async()=>{
 const h=await harness();h.f.setOnLoad(()=>h.revoke());assert.equal((await h.req('/api/receipts/buyer?format=json',{headers:bearer})).status,404);
});
for(const format of ['html','print','json'])test('revocation during the final source read blocks private '+format,async()=>{
 const h=await harness();let loads=0;
 h.f.setOnLoad(()=>{if(++loads===3)h.revoke();});
 const r=await h.req('/api/receipts/buyer?format='+format,{headers:bearer});
 assert.equal(r.status,404);assert.equal(loads,3);assert.ok(!(await r.text()).includes('Harbor After Rain'));
});
test('creator revocation during the final source read blocks export',async()=>{
 const h=await harness();let permitted=true,loads=0;
 h.f.setOnLoad(()=>{if(++loads===3)permitted=false;});
 const handler=createReceiptExperienceHandler({store:h.f.store,directory:h.directory,publicOrigin:origin,now:h.f.clock,
  allowRead:async()=>true,authorizeCreator:async()=>permitted});
 const r=await handler(new Request(origin+'/api/receipts/creator/'+ids.case+'?format=json'));
 assert.equal(r.status,404);assert.equal(loads,3);assert.ok(!(await r.text()).includes('Harbor After Rain'));
});
test('expiry during the final source read is checked using the current clock',async()=>{
 const h=await harness();let loads=0;
 const expires='2026-10-27T20:00:01.000Z';
 const directory={...h.directory,async byBuyerToken(token,at){return token===buyerToken&&at<expires?ids.case:null;}};
 h.f.setOnLoad(()=>{if(++loads===3)h.f.setNow(expires);});
 const handler=createReceiptExperienceHandler({store:h.f.store,directory,publicOrigin:origin,now:h.f.clock,allowRead:async()=>true});
 assert.equal((await handler(new Request(origin+'/api/receipts/buyer?format=json',{headers:bearer}))).status,404);
});
test('a UTC boundary crossed during the final authorization suppresses the receipt',async()=>{
 const h=await harness();let calls=0;
 const directory={...h.directory,async byBuyerToken(token){if(++calls===3)h.f.setNow('2026-10-28T00:00:00.000Z');return token===buyerToken?ids.case:null;}};
 const handler=createReceiptExperienceHandler({store:h.f.store,directory,publicOrigin:origin,now:h.f.clock,allowRead:async()=>true});
 assert.equal((await handler(new Request(origin+'/api/receipts/buyer?format=json',{headers:bearer}))).status,409);
});
test('source mutation in final authorizer cannot leak a stale receipt',async()=>{
 const h=await harness();let n=0;const handler=createReceiptExperienceHandler({store:h.f.store,directory:h.directory,publicOrigin:origin,now:h.f.clock,allowRead:async()=>true,authorizeCreator:async()=>{if(++n===2)h.f.root.permission.review_required=1;return true;}});
 assert.equal((await handler(new Request(origin+'/api/receipts/creator/'+ids.case+'?format=json'))).status,409);
});
for(const reference of [ids.case,'12345678901234567890123456789012','x','../secret','A'.repeat(129),publicId+'?format=json','%41'.repeat(32)])test('invalid and guessed verification IDs return no record',async()=>{
 const {req}=await harness();const r=await req('/api/receipt-verification/'+reference);if(r===null)return;assert.equal(r.status,404);assert.ok(!JSON.stringify(await r.json()).includes(ids.case));
});
test('signed-out public HTML does not require JavaScript or disclose deal details',async()=>{
 const {req}=await harness();const r=await req('/verify/receipt/'+publicId);const body=await r.text();assert.equal(r.status,200);assert.match(body,/Active in Sandbox/);assert.ok(!body.includes('<script'));
 for(const x of ['Private Buyer',ids.case,ids.quote,'INV2-PRIVATE','425.00'])assert.ok(!body.includes(x));
});
test('protected printable HTML includes twelve rights, versions, financial ref and same hash',async()=>{
 const {f,req}=await harness();const r=await req('/api/receipts/buyer?format=print',{headers:bearer});const body=await r.text();assert.equal(r.status,200);
 for(const x of ['Purpose','Channels','Paid advertising','Territory','Start date','Duration','Impression limit','Exclusivity','Modifications','Attribution','Sublicensing','AI use','425.00 USD','INV2-PRIVATE-FIXTURE','review-only-classifier','rules-v1',f.chain[0].hash,'@media print','QR code for public receipt verification'])assert.ok(body.includes(x),x);
 assert.ok(!body.includes(buyerToken));assert.ok(body.includes(origin+'/verify/receipt/'+publicId));
});
// The client has a 128 KiB decoded HTML budget. Exercise the production renderer
// with field-valid source maxima so domain/template growth cannot silently break it.
for(const state of ['active','scheduled','expired','refunded','revoked'])test(`maximal escaped fields fit the private ${state} HTML budget`,async()=>{
 const f=await receiptExperienceFixture({state,issued:false,title:'"'.repeat(200)}),r=f.root;
 r.asset.creator_display_name='"'.repeat(120);r.request.buyer_organization='"'.repeat(120);
 r.acceptance.acceptance_copy_version='"'.repeat(80);
 for(const key of ['extractor_version','model_id','model_version'])r.extractions[0][key]='"'.repeat(120);
 r.policy.version_number=Number.MAX_SAFE_INTEGER-1;r.quote.pricing_policy_version=r.policy.version_number;
 r.quote.amount_cents=1000000000;r.binding.provider_invoice_id='INV2-'+'A'.repeat(100);
 r.financial.paid_cents=r.quote.amount_cents;r.financial.refunded_cents=state==='refunded'?r.quote.amount_cents:0;
 for(const e of r.evidence){e.amount_cents=r.quote.amount_cents;e.source_reference='invoice-financial:'+r.binding.provider_invoice_id;}
 r.lines=Array.from({length:32},(_,i)=>({quote_id:ids.quote,line_position:i+1,line_code:'line-'+i,description:'"'.repeat(300),amount_cents:31250000}));
 r.quote.calculation_hash=await sha256Hex(JSON.stringify({schema_version:'quote-calculation-v1',terms_version_id:ids.terms,
  terms_hash:r.terms.terms_hash,pricing_policy_id:ids.policy,pricing_policy_version:r.policy.version_number,policy_hash:r.policy.policy_hash,
  currency:'USD',license_start_date:r.permission.start_date,license_end_date_exclusive:r.permission.end_date_exclusive,
  line_items:r.lines.map(x=>({code:x.line_code,description:x.description,amount_cents:x.amount_cents})),total_cents:r.quote.amount_cents}));
 const audit=r.audit[0];r.audit=Array.from({length:1024},(_,i)=>({...audit,audit_event_id:uuid(1000+i),aggregate_sequence:i+1}));
 assert.equal((await createReceiptService(f.store,f.clock).issue(ids.case)).outcome,'issued');
 const maxOrigin='https://'+'a'.repeat(60)+'.example.com',before=f.writes;
 assert.equal(maxOrigin.length,80);assert.ok(Buffer.byteLength(f.chain[0].canonical)<=262144);
 const handler=createReceiptExperienceHandler({store:f.store,publicOrigin:maxOrigin,now:f.clock,allowRead:async()=>true,
  directory:{byPublicId:async value=>value===publicId?ids.case:null,byBuyerToken:async value=>value===buyerToken?ids.case:null}});
 const response=await handler(new Request(maxOrigin+'/api/receipts/buyer?format=html',{headers:bearer}));
 assert.equal(response.status,200);assert.equal(response.headers.get('X-Receipt-SHA256'),f.chain[0].hash);
 const html=await response.text();assert.ok(Buffer.byteLength(html)<=131072);
 assert.ok(html.includes('data-checked-at="'+NOW+'"'));assert.match(html,/data-next-boundary="(?:\d{4}-\d{2}-\d{2}T00:00:00\.000Z)?"/u);
 assert.ok(html.includes('&quot;'.repeat(300)));assert.ok(html.includes('1024 linked business events.'));
 assert.equal((html.match(/<tr><td>/gu)||[]).length,32);assert.equal(f.writes,before);
});
test('stored XSS strings are text, never markup or script',async()=>{
 const {req}=await harness({title:'<img src=x onerror="alert(1)">&</script>'});
 const body=await(await req('/api/receipts/buyer?format=html',{headers:bearer})).text();
 assert.ok(body.includes('&lt;img'));assert.ok(!body.includes('<img src=x'));assert.ok(!body.includes('</script>'));
 assert.equal(htmlEscape('<"\'&>'),'&lt;&quot;&#39;&amp;&gt;');
});
for(const path of ['/api/receipts/buyer?format=json','/api/receipt-verification/'+publicId,'/verify/receipt/'+publicId,'/receipts/buyer','/assets/receipt-access.js'])test(`no-store and isolation headers on ${path}`,async()=>{
 const {req}=await harness();const r=await req(path,{headers:bearer});assert.match(r.headers.get('Cache-Control'),/no-store/);assert.equal(r.headers.get('Referrer-Policy'),'no-referrer');assert.equal(r.headers.get('X-Content-Type-Options'),'nosniff');assert.match(r.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);assert.equal(r.headers.get('ETag'),null);
});
for(const method of ['POST','PUT','DELETE','HEAD','OPTIONS'])test(`${method} cannot cause receipt or payment writes`,async()=>{
 const {f,req}=await harness();const n=f.writes;assert.equal((await req('/api/receipts/buyer',{method,headers:bearer})).status,405);assert.equal(f.writes,n);
});
test('bad format, query capabilities and cross-site private reads fail closed',async()=>{
 const {req}=await harness();for(const suffix of ['?token='+buyerToken,'?format=json&format=html','?format=xml'])assert.equal((await req('/api/receipts/buyer'+suffix,{headers:bearer})).status,404);
 assert.equal((await req('/api/receipts/buyer',{headers:{...bearer,'Sec-Fetch-Site':'cross-site'}})).status,404);
 assert.equal((await req('/api/receipts/buyer',{headers:{...bearer,Origin:'https://evil.example'}})).status,404);
});
test('request hostname and forwarded host cannot rewrite QR destination',async()=>{
 const h=await harness();const r=await h.req('/api/receipts/buyer?format=html',{headers:{...bearer,'X-Forwarded-Host':'evil.example'}});const body=await r.text();assert.ok(!body.includes('evil.example'));
 assert.equal((await h.handler(new Request('https://evil.example/verify/receipt/'+publicId))).status,404);
});
for(const bad of ['http://example.com','https://example.com/','https://user:pass@example.com','https://example.com/path','https://example.com?x=1','https://example.com#x','javascript:alert(1)'])test('invalid public origin is rejected: '+bad,()=>assert.throws(()=>checkedReceiptOrigin(bad)));
test('loopback development origin and canonical HTTPS origin are accepted',()=>{
 assert.equal(checkedReceiptOrigin(origin),origin);assert.equal(checkedReceiptOrigin('http://127.0.0.1:5173'),'http://127.0.0.1:5173');
});
test('denied or failed limiter prevents data lookup and returns no provider detail',async()=>{
 const h=await harness();let read=false;const store={async load(){read=true;throw Error('SECRET');}};
 for(const allowRead of [async()=>false,async()=>{throw Error('SECRET');}]){
 const fn=createReceiptExperienceHandler({store,directory:h.directory,publicOrigin:origin,allowRead});const r=await fn(new Request(origin+'/verify/receipt/'+publicId));assert.ok([429,503].includes(r.status));assert.ok(!(await r.text()).includes('SECRET'));}
 assert.equal(read,false);
});
test('per-isolate limiter resets and keeps client buckets separate',async()=>{
 let at=1;const limit=createReceiptReadLimiter(()=>at,2);const r=ip=>new Request(origin,{headers:{'CF-Connecting-IP':ip}});
 assert.equal(await limit(r('192.0.2.1')),true);assert.equal(await limit(r('192.0.2.1')),true);assert.equal(await limit(r('192.0.2.1')),false);
 assert.equal(await limit(r('192.0.2.2')),true);at+=60000;assert.equal(await limit(r('192.0.2.1')),true);
});
test('QR is deterministic, bounded, script-free and contains no encoded bearer',()=>{
 const link=origin+'/verify/receipt/'+publicId;const m=receiptQrMatrix(link);assert.equal(m.length,41);assert.deepEqual(m,receiptQrMatrix(link));assert.ok(Object.isFrozen(m)&&Object.isFrozen(m[0]));
 assert.throws(()=>receiptQrMatrix('x'.repeat(135)));assert.throws(()=>receiptQrMatrix('😀'));assert.throws(()=>receiptQrMatrix(''));
 const svg=receiptQrSvg(link);assert.ok(!svg.includes('script'));assert.ok(!svg.includes('href'));assert.ok(!svg.includes(buyerToken));
});
function accessFixture(){
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE verification_records(verification_record_id TEXT,case_id TEXT,public_verification_id TEXT);CREATE TABLE licensing_cases(case_id TEXT,verification_record_id TEXT,invoice_binding_id TEXT);CREATE TABLE invoice_bindings(invoice_binding_id TEXT,provider TEXT,environment TEXT);CREATE TABLE buyer_capabilities(case_id TEXT,token_digest_sha256 TEXT,allowed_actions_json TEXT,issued_at TEXT,expires_at TEXT,revoked_at TEXT);`);
 db.prepare('INSERT INTO licensing_cases VALUES(?,?,?)').run(ids.case,ids.verification,ids.binding);db.prepare('INSERT INTO verification_records VALUES(?,?,?)').run(ids.verification,ids.case,publicId);db.prepare('INSERT INTO invoice_bindings VALUES(?,?,?)').run(ids.binding,'paypal','sandbox');
 db.prepare('INSERT INTO buyer_capabilities VALUES(?,?,?,?,?,NULL)').run(ids.case,createHash('sha256').update(buyerToken).digest('hex'),'["receipt"]','2026-10-26T00:00:00.000Z','2026-10-28T00:00:00.000Z');
 const adapter={prepare(sql){return {bind(...values){return {async first(){return db.prepare(sql).get(...values)??null;}};}};}};
 return {db,directory:createD1ReceiptDirectory(adapter)};
}
test('actual SQLite access queries scope public lookup to canonical Sandbox binding',async()=>{
 const {db,directory}=accessFixture();try{assert.equal(await directory.byPublicId(publicId),ids.case);assert.equal(await directory.byPublicId(ids.case),null);db.exec("UPDATE invoice_bindings SET environment='simulated'");assert.equal(await directory.byPublicId(publicId),null);}finally{db.close();}
});
for(const [name,sql] of [['expired',"UPDATE buyer_capabilities SET expires_at='2026-10-27T20:00:00.000Z'"],['revoked',"UPDATE buyer_capabilities SET revoked_at='2026-10-27T19:00:00.000Z'"],['not issued yet',"UPDATE buyer_capabilities SET issued_at='2026-10-28T00:00:00.000Z'"],['wrong action',"UPDATE buyer_capabilities SET allowed_actions_json='[\"review\"]'"],['invalid actions',"UPDATE buyer_capabilities SET allowed_actions_json='true'"],['malformed actions',"UPDATE buyer_capabilities SET allowed_actions_json='not-json'"],['invalid time',"UPDATE buyer_capabilities SET expires_at='2026-99-99T00:00:00.000Z'"]])test('SQLite capability rejects '+name,async()=>{
 const {db,directory}=accessFixture();try{db.exec(sql);assert.equal(await directory.byBuyerToken(buyerToken,NOW),null);}finally{db.close();}
});
test('SQLite capability digest matches correct token only and permits receipt action',async()=>{
 const {db,directory}=accessFixture();try{assert.equal(await directory.byBuyerToken(buyerToken,NOW),ids.case);assert.equal(await directory.byBuyerToken('b'.repeat(43),NOW),null);assert.equal(await directory.byBuyerToken(publicId,NOW),null);}finally{db.close();}
});
test('buyer access shell and static client never embed a capability',async()=>{
 const {req}=await harness();const body=await(await req('/receipts/buyer')).text();assert.ok(body.includes('type="password"'));assert.ok(!body.includes(buyerToken));
 const js=await(await req('/assets/receipt-access.js')).text();assert.ok(js.includes('history.replaceState'));assert.ok(js.includes("Authorization:'Bearer '"));assert.ok(!js.includes('localStorage'));assert.ok(!js.includes('sessionStorage'));
});
test('unrelated application routes are not intercepted',async()=>{const {req}=await harness();assert.equal(await req('/creator'),null);assert.equal(await req('/verify/legacy-fake-id'),null);});

test('server composition is disabled without an explicit Sandbox read flag',async()=>{
 const {createReceiptRoutes}=await import('../apps/api/src/receipt-routes.ts');
 let touched=0;const DB={prepare(){touched++;throw Error('must not read');},async batch(){touched++;throw Error('must not write');}};
 const route=createReceiptRoutes();const settings={DB,APP_MODE:'sandbox',PAYPAL_MODE:'paypal_sandbox',RIGHTS_RECEIPT_READ_ENABLED:'true',RIGHTS_RECEIPT_PUBLIC_ORIGIN:origin};
 for(const change of [{RIGHTS_RECEIPT_READ_ENABLED:undefined},{RIGHTS_RECEIPT_READ_ENABLED:'TRUE'},{APP_MODE:'local'},{PAYPAL_MODE:'fake'},{RIGHTS_RECEIPT_PUBLIC_ORIGIN:''},{DB:undefined}]){
  const r=await route(new Request(origin+'/verify/receipt/'+publicId),{...settings,...change});assert.equal(r.status,503);
 }
 assert.equal(touched,0);assert.equal(await route(new Request(origin+'/creator'),settings),null);
});
test('script syntax compiles independently',async()=>{
 const {Script}=await import('node:vm');const {RECEIPT_CLIENT_JS}=await import('../packages/receipts/src/client.ts');assert.doesNotThrow(()=>new Script(RECEIPT_CLIENT_JS));
});

const {readFileSync}=await import('node:fs');
const qrVectors=JSON.parse(readFileSync(new URL('../data/receipts/qr-v6l-vectors.json',import.meta.url),'utf8')).vectors;
for(const [i,vector] of qrVectors.entries())test(`QR independent byte-mode reference ${i+1}`,()=>{
 const text=receiptQrMatrix(vector.text).map(row=>row.map(x=>x?'1':'0').join('')).join('\n');
 assert.equal(createHash('sha256').update(text).digest('hex'),vector.matrixSha256);
});

test('extra path segments cannot alias a valid public receipt',async()=>{
 const {req}=await harness();for(const p of ['/verify/receipt/extra/','/api/receipt-verification/extra/']){
  const r=await req(p+publicId);assert.equal(r.status,404);assert.ok(!(await r.text()).includes('Harbor After Rain'));
 }
});
test('disabled browser routes render a safe readable HTML state',async()=>{
 const {createReceiptRoutes}=await import('../apps/api/src/receipt-routes.ts');
 const route=createReceiptRoutes();const r=await route(new Request(origin+'/receipts/buyer'),undefined);
 assert.equal(r.status,503);assert.match(r.headers.get('Content-Type'),/text\/html/);
 const body=await r.text();assert.ok(body.includes('Receipt service unavailable'));assert.ok(!body.includes(buyerToken));
});
