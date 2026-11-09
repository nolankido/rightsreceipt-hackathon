import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createSandboxWebhookHandler, WEBHOOK_BODY_LIMIT, WEBHOOK_VERIFY_URL } from "../packages/paypal/src/webhook-intake.ts";
import { createMemoryWebhookInbox, createD1WebhookInbox } from "../packages/paypal/src/webhook-inbox.ts";

const NOW = Date.parse("2026-10-27T12:00:00.000Z");
const stamp = new Date(NOW).toISOString();
const tokenUrl = "https://api-m.sandbox.paypal.com/v1/oauth2/token";
const config = () => ({ APP_MODE:"sandbox", PAYPAL_MODE:"paypal_sandbox", PAYPAL_BASE_URL:"https://api-m.sandbox.paypal.com",
  PAYPAL_SANDBOX_CLIENT_ID:"synthetic-client-0123", PAYPAL_SANDBOX_CLIENT_SECRET:"synthetic-secret-4567",
  PAYPAL_SANDBOX_WEBHOOK_ID:"8PT59711-RIGHTS-TEST" });
const keys = generateKeyPairSync("rsa", { modulusLength:2048 });
function crc32(text) {
  let c = 0xffffffff;
  for (const b of Buffer.from(text,"utf8")) { c ^= b; for (let i=0;i<8;i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); }
  return (c ^ 0xffffffff) >>> 0;
}
const event = (changes={}) => ({ id:"WH-TEST-0001", event_type:"INVOICING.INVOICE.PAID", create_time:stamp,
  resource:{ id:"INV2-TEST-0001", status:"PAID", payer_email:"private-buyer@example.test", note:"Private raw evidence", amount:{currency_code:"USD",value:"425.00"}}, ...changes });
function rawEvent(changes={}) { return JSON.stringify(event(changes)); }
function request(raw=rawEvent(), changes={}) {
  const time = changes.time ?? stamp;
  const transmission = changes.transmission ?? "transmission-001";
  const signature = sign("RSA-SHA256",Buffer.from(`${transmission}|${time}|${config().PAYPAL_SANDBOX_WEBHOOK_ID}|${crc32(raw)}`),keys.privateKey).toString("base64");
  const headers = { "content-type":"application/json", "paypal-transmission-id":transmission,
    "paypal-transmission-time":time,"paypal-auth-algo":"SHA256withRSA",
    "paypal-cert-url":"https://api.sandbox.paypal.com/v1/notifications/certs/CERT-TEST-123", "paypal-transmission-sig":signature,...changes.headers };
  for (const k of changes.remove ?? []) delete headers[k];
  return new Request("https://rightsreceipt.example.test/webhooks/paypal/sandbox",{
    method:changes.method??"POST",headers,...(changes.method==="GET" ? {} : {body:changes.body ?? raw}),
    ...(changes.body instanceof ReadableStream ? {duplex:"half"} : {}),
  });
}
const response = (body,status=200,headers={}) => new Response(JSON.stringify(body), {status,headers:{"content-type":"application/json",...headers}});
function fixture(options={}) {
  const inbox = options.inbox ?? createMemoryWebhookInbox(); const calls=[];
  let now=NOW; let counter=0;
  const fetch = async (url,init) => {
    calls.push({url,init});
    assert.equal(init.redirect,"error"); assert.equal(init.credentials,"omit"); assert.equal(init.cache,"no-store");
    assert.ok(init.signal instanceof AbortSignal);
    if (options.transport) return options.transport(url,init,calls);
    if (url===tokenUrl) return response({access_token:"synthetic-access-token",token_type:"Bearer",expires_in:3600});
    assert.equal(url,WEBHOOK_VERIFY_URL);
    const p=JSON.parse(init.body);
    const marker=',"webhook_event":';
    const preserved=init.body.slice(init.body.indexOf(marker)+marker.length,-1);
    const signed=`${p.transmission_id}|${p.transmission_time}|${p.webhook_id}|${crc32(preserved)}`;
    const ok=verify("RSA-SHA256",Buffer.from(signed),keys.publicKey,Buffer.from(p.transmission_sig,"base64"));
    return response({verification_status:ok?"SUCCESS":"FAILURE"});
  };
  const handler=createSandboxWebhookHandler(config(),{sandboxWebhookIntakeEnabled:true,fetch,inbox,now:()=>now,
    createId:()=>`00000000-0000-4000-8000-${String(++counter).padStart(12,"0")}`});
  return {handler,inbox,calls,setNow:v=>{now=v;}};
}
async function assertRejected(f,req,status,code,noHttp=false) {
  const r=await f.handler(req);assert.equal(r.status,status);assert.equal((await r.json()).code,code);
  if (f.inbox.snapshot) assert.equal(f.inbox.snapshot().length,0);
  if(noHttp) assert.equal(f.calls.length,0);
}

test("verified original bytes are queued with SHA-256, safe metadata and no payment authority",async()=>{
  const f=fixture();const raw=JSON.stringify(event(),null,2)+"\n";const r=await f.handler(request(raw));
  assert.equal(r.status,200);assert.deepEqual(await r.json(),{status:"accepted",processing:"queued_only"});
  const row=f.inbox.snapshot()[0];assert.equal(row.payloadSha256,createHash("sha256").update(raw).digest("hex"));
  assert.equal(row.processingStatus,"pending");assert.equal(row.verificationStatus,"verified");
  const persisted=JSON.stringify(row);for(const secret of ["private-buyer","Private raw evidence","synthetic-secret","synthetic-access","transmission_sig","cert_url"]){assert.ok(!persisted.includes(secret),secret);}
  assert.equal(row.providerInvoiceId,"INV2-TEST-0001");assert.ok(!("authoritativePaymentEvidence" in row));
  assert.equal(r.headers.get("cache-control"),"no-store");assert.equal(r.headers.get("referrer-policy"),"no-referrer");
  assert.ok(f.calls[1].init.body.endsWith(`"webhook_event":${raw}}`));
});
test("the registered webhook ID is server configuration, never a body claim",async()=>{
  const f=fixture();await f.handler(request(rawEvent({webhook_id:"ATTACKER-ID",verification_status:"SUCCESS"})));
  assert.equal(JSON.parse(f.calls[1].init.body).webhook_id,config().PAYPAL_SANDBOX_WEBHOOK_ID);
});
test("an altered byte after signing fails simulated provider verification and creates no row",async()=>{
  const f=fixture();const raw=rawEvent();await assertRejected(f,request(raw,{body:raw.replace("425.00","0.01")}),401,"invalid_signature");
});
test("a forged signature cannot authorize intake",async()=>{
  const f=fixture();await assertRejected(f,request(rawEvent(),{headers:{"paypal-transmission-sig":Buffer.alloc(256).toString("base64")}}),401,"invalid_signature");
});
for(const header of ["paypal-transmission-id","paypal-transmission-time","paypal-auth-algo","paypal-cert-url","paypal-transmission-sig"]){
  test(`missing ${header} fails before network or persistence`,async()=>{const f=fixture();await assertRejected(f,request(rawEvent(),{remove:[header]}),400,"invalid_headers",true);});
}
for(const cert of ["http://api.sandbox.paypal.com/v1/notifications/certs/CERT-A","https://api.paypal.com/v1/notifications/certs/CERT-A",
  "https://127.0.0.1/cert","https://api.sandbox.paypal.com.evil.test/v1/notifications/certs/CERT-A",
  "https://user:pass@api.sandbox.paypal.com/v1/notifications/certs/CERT-A","https://api.sandbox.paypal.com/v1/notifications/certs/CERT-A?redirect=evil",
  "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-A#x","https://api.sandbox.paypal.com:443/v1/notifications/certs/CERT-A",
  "https://api.sandbox.paypal.com/v1/notifications/certs/%2e%2e/CERT-A"]){
  test(`certificate URL rejected: ${cert}`,async()=>{const f=fixture();await assertRejected(f,request(rawEvent(),{headers:{"paypal-cert-url":cert}}),400,"invalid_headers",true);});
}
test("no certificate URL is fetched locally",async()=>{const f=fixture();await f.handler(request());assert.deepEqual(f.calls.map(x=>x.url),[tokenUrl,WEBHOOK_VERIFY_URL]);});
test("combined duplicate security headers fail closed",async()=>{const f=fixture();await assertRejected(f,request(rawEvent(),{headers:{"paypal-transmission-id":"one, two"}}),400,"invalid_headers",true);});
test("unsupported signing algorithm fails before network",async()=>{const f=fixture();await assertRejected(f,request(rawEvent(),{headers:{"paypal-auth-algo":"SHA1withRSA"}}),400,"invalid_headers",true);});
for(const time of ["2026-02-30T12:00:00Z",new Date(NOW+301000).toISOString(),new Date(NOW-259501000).toISOString(),"yesterday"]){
  test(`invalid transmission time ${time}`,async()=>{const f=fixture();await assertRejected(f,request(rawEvent(),{time}),400,"invalid_headers",true);});
}
test("authentic two-day retry is not rejected by a five-minute freshness rule",async()=>{const f=fixture();assert.equal((await f.handler(request(rawEvent(),{time:new Date(NOW-2*86400000).toISOString()}))).status,200);});
test("sub-millisecond UTC transmission headers are sent unchanged for independent signature verification",async()=>{
  for (const time of ["2026-10-27T12:00:00.123456Z", "2026-10-27T12:00:00.123456789Z"]) {
    const f=fixture();
    const r=await f.handler(request(rawEvent(),{time}));
    assert.equal(r.status,200,time);
    assert.equal(JSON.parse(f.calls[1].init.body).transmission_time,time);
    assert.equal(f.inbox.snapshot()[0].transmissionId,"transmission-001");
  }
});
test("precision beyond nine decimal digits fails before PayPal calls",async()=>{
  const f=fixture();
  await assertRejected(f,request(rawEvent(),{time:"2026-10-27T12:00:00.1234567890Z"}),400,"invalid_headers",true);
});
test("higher precision provider event creation time is preserved in the verified inbox",async()=>{
  const created="2026-10-27T12:00:00.123456789Z";
  const f=fixture();
  const r=await f.handler(request(rawEvent({create_time:created})));
  assert.equal(r.status,200);
  assert.equal(f.inbox.snapshot()[0].eventCreatedAt,created);
  const invalid=fixture();
  await assertRejected(invalid,request(rawEvent({create_time:"2026-10-27T12:00:00.1234567890Z"})),400,"invalid_event");
});
test("GET does not consume a body, contact PayPal or write inbox",async()=>{const f=fixture();await assertRejected(f,request(rawEvent(),{method:"GET"}),405,"method_not_allowed",true);});
for(const h of [{"content-type":"text/plain"},{"content-type":"application/json;charset=latin1"},{"content-encoding":"gzip"}]){
  test(`unsupported body encoding ${JSON.stringify(h)}`,async()=>{const f=fixture();await assertRejected(f,request(rawEvent(),{headers:h}),415,"unsupported_content_type",true);});
}
for(const raw of ["{", "null", "[]", '{"id":"A","id":"B"}', '{"id":"A","\\u0069d":"B"}',
  rawEvent().replace('"status":"PAID"','"status":"UNPAID","status":"PAID"'), '{"n":1e309}',"[".repeat(34)+"0"+"]".repeat(34)]){
  test(`malformed/ambiguous JSON is rejected: ${raw.slice(0,35)}`,async()=>{const f=fixture();const r=await f.handler(request(raw));assert.equal(r.status,400);assert.equal(f.calls.length,0);assert.equal(f.inbox.snapshot().length,0);});
}
test("invalid UTF-8 is rejected without replacement characters",async()=>{const f=fixture();await assertRejected(f,request(rawEvent(),{body:new Uint8Array([0xff,0xfe])}),400,"invalid_body",true);});
test("overlong declared body is rejected without reading",async()=>{const f=fixture();await assertRejected(f,request(rawEvent(),{headers:{"content-length":String(WEBHOOK_BODY_LIMIT+1)}}),413,"body_too_large",true);});
test("chunked overlong body cannot bypass the byte limit",async()=>{const f=fixture();const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(WEBHOOK_BODY_LIMIT));c.enqueue(new Uint8Array(1));c.close();}});await assertRejected(f,request(rawEvent(),{body}),413,"body_too_large",true);});
test("Unicode and whitespace remain exact through signing and verification",async()=>{const f=fixture();const raw=rawEvent({summary:"🎨 Café ＡＢＣ"});assert.equal((await f.handler(request(raw))).status,200);assert.equal(f.inbox.snapshot()[0].payloadSha256,createHash("sha256").update(raw).digest("hex"));});
for(const status of ["PAID","PARTIALLY_PAID","PAYMENT_PENDING","MARKED_AS_PAID","REFUNDED","PARTIALLY_REFUNDED","UNKNOWN_NEW_STATUS"]){
  test(`${status} is only an unprocessed provider observation`,async()=>{const f=fixture();assert.equal((await f.handler(request(rawEvent({resource:{id:"INV2-TEST-0001",status}})))).status,200);const row=f.inbox.snapshot()[0];assert.equal(row.processingStatus,"pending");assert.equal(row.resourceStatus,status==="UNKNOWN_NEW_STATUS"?null:status);});
}
test("nested invoice shape is accepted without following any payload links",async()=>{const f=fixture();assert.equal((await f.handler(request(rawEvent({resource:{invoice:{id:"INV2-TEST-0001",status:"PAID"}},links:[{href:"https://evil.test/steal"}]})))).status,200);assert.equal(f.calls.length,2);});
test("conflicting nested and direct invoice identity is rejected",async()=>{const f=fixture();await assertRejected(f,request(rawEvent({resource:{id:"INV2-OTHER-ID",invoice:{id:"INV2-TEST-0001"}}})),400,"invalid_event");});
test("unknown event type is acknowledged only after signature verification",async()=>{const f=fixture();const r=await f.handler(request(rawEvent({event_type:"PAYMENT.CAPTURE.COMPLETED",resource:{id:"capture-id"}})));assert.equal(r.status,200);assert.equal((await r.json()).status,"ignored");assert.equal(f.calls.length,2);assert.equal(f.inbox.snapshot().length,0);});
test("invoice events cannot omit invoice identity",async()=>{const f=fixture();await assertRejected(f,request(rawEvent({resource:{status:"PAID"}})),400,"invalid_event");});
test("repeated verified event yields one row and verifies again before deduplication",async()=>{const f=fixture();await f.handler(request());const second=await f.handler(request(rawEvent(),{transmission:"transmission-002"}));assert.equal((await second.json()).status,"duplicate");assert.equal(f.inbox.snapshot().length,1);assert.equal(f.calls.filter(x=>x.url===WEBHOOK_VERIFY_URL).length,2);});
test("same event ID with different signed payload conflicts without overwrite",async()=>{const f=fixture();await f.handler(request());const r=await f.handler(request(rawEvent({resource:{id:"INV2-TEST-0001",status:"UNPAID"}})));assert.equal(r.status,409);assert.equal(f.inbox.snapshot()[0].resourceStatus,"PAID");});
test("unverified duplicate is not silently acknowledged",async()=>{const f=fixture();await f.handler(request());const r=await f.handler(request(rawEvent(),{headers:{"paypal-transmission-sig":Buffer.alloc(256).toString("base64")}}));assert.equal(r.status,401);assert.equal(f.inbox.snapshot().length,1);});
test("storage failure gives retryable 503 rather than accepting and losing an event",async()=>{const f=fixture({inbox:{async putVerified(){throw new Error("private database password");}}});const r=await f.handler(request());assert.equal(r.status,503);assert.equal(r.headers.get("retry-after"),"30");assert.ok(!(await r.text()).includes("password"));});
test("acknowledgement waits for durable put",async()=>{let finish;const gate=new Promise(r=>{finish=r;});let started=false;let returned=false;const f=fixture({inbox:{async putVerified(){started=true;await gate;return "inserted";}}});const pending=f.handler(request()).then(r=>{returned=true;return r;});while(!started)await new Promise(r=>setTimeout(r,1));assert.equal(returned,false);finish();assert.equal((await pending).status,200);});
for(const status of [401,403,429,500]){
  test(`provider verification HTTP ${status} writes no accepted event`,async()=>{const f=fixture({transport:async url=>url===tokenUrl?response({access_token:"test-token",token_type:"Bearer",expires_in:3600}):response({secret:"not-for-logs"},status)});await assertRejected(f,request(),503,"verification_unavailable");});
}
for(const body of [{verification_status:"success"},{}, {verification_status:true}, {verification_status:"SUCCESS",verification_status_wrong:"FAILURE"}]){
  test(`verification result shape: ${JSON.stringify(body)}`,async()=>{const f=fixture({transport:async url=>url===tokenUrl?response({access_token:"test-token",token_type:"Bearer",expires_in:3600}):response(body)});const r=await f.handler(request());if(body.verification_status==="SUCCESS")assert.equal(r.status,200);else {assert.equal(r.status,503);assert.equal(f.inbox.snapshot().length,0);}});
}
test("one authentication refresh is allowed and the original verification body is reused",async()=>{let auth=0,verification=0;const f=fixture({transport:async url=>url===tokenUrl?(auth++,response({access_token:`token-${auth}`,token_type:"Bearer",expires_in:3600})):(++verification===1?response({},401):response({verification_status:"SUCCESS"}))});assert.equal((await f.handler(request())).status,200);assert.equal(auth,2);assert.equal(f.calls[1].init.body,f.calls[3].init.body);});
test("tokens are cached, expire early, and never appear in persisted records",async()=>{const f=fixture();await f.handler(request());await f.handler(request(rawEvent({id:"WH-TEST-0002"})));assert.equal(f.calls.filter(c=>c.url===tokenUrl).length,1);f.setNow(NOW+3600000);await f.handler(request(rawEvent({id:"WH-TEST-0003"})));assert.equal(f.calls.filter(c=>c.url===tokenUrl).length,2);assert.ok(!JSON.stringify(f.inbox.snapshot()).includes("synthetic-access"));});
test("concurrent webhook verification shares one OAuth acquisition",async()=>{const f=fixture();const r=await Promise.all([f.handler(request()),f.handler(request(rawEvent({id:"WH-TEST-0002"})))]);assert.ok(r.every(x=>x.status===200));assert.equal(f.calls.filter(c=>c.url===tokenUrl).length,1);assert.equal(f.inbox.snapshot().length,2);});
test("redirected provider response fails closed",async()=>{const f=fixture({transport:async()=>{const r=response({access_token:"test-token",token_type:"Bearer",expires_in:3600});Object.defineProperty(r,"redirected",{value:true});return r;}});await assertRejected(f,request(),503,"verification_unavailable");});
test("provider response size is bounded without trusting Content-Length",async()=>{const f=fixture({transport:async()=>new Response(" ".repeat(16385),{headers:{"content-type":"application/json"}})});await assertRejected(f,request(),503,"verification_unavailable");});
test("network errors never leak credentials or raw bodies",async()=>{const f=fixture({transport:async()=>{throw new Error("synthetic-secret-4567 private-buyer@example.test");}});const r=await f.handler(request());assert.equal(r.status,503);assert.deepEqual(await r.json(),{status:"rejected",code:"verification_unavailable"});});
test("fake/live/missing credentials, simulator webhook IDs and disabled flag fail at construction",()=>{
  for(const delta of [{PAYPAL_MODE:"fake"},{PAYPAL_BASE_URL:"https://api-m.paypal.com"},{PAYPAL_SANDBOX_CLIENT_SECRET:undefined},{PAYPAL_SANDBOX_WEBHOOK_ID:undefined},{PAYPAL_SANDBOX_WEBHOOK_ID:"WEBHOOK_ID"},{APP_MODE:"local"}])assert.throws(()=>createSandboxWebhookHandler({...config(),...delta},{sandboxWebhookIntakeEnabled:true,fetch:async()=>response({}),inbox:createMemoryWebhookInbox()}));
  assert.throws(()=>createSandboxWebhookHandler(config(),{sandboxWebhookIntakeEnabled:false,fetch:async()=>response({}),inbox:createMemoryWebhookInbox()}));
});

function dbPort(db) {
  return {prepare(sql){return {bind(...values){return {async run(){const r=db.prepare(sql).run(...values);return {success:true,meta:{changes:Number(r.changes)}};},async first(){return db.prepare(sql).get(...values)??null;}};}};}};
}
function schema(db) {
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE invoice_bindings(invoice_binding_id TEXT PRIMARY KEY,provider TEXT,environment TEXT,provider_invoice_id TEXT UNIQUE);");
  const original=readFileSync(new URL("../migrations/0001_initial_schema.sql",import.meta.url),"utf8");
  db.exec("CREATE TABLE webhook_inbox_events"+original.split("CREATE TABLE webhook_inbox_events")[1].split("CREATE TABLE payment_evidence")[0]);
  db.exec(readFileSync(new URL("../migrations/0004_verified_webhook_intake.sql",import.meta.url),"utf8"));
}
test("exact D1-shaped SQL survives file close/reopen and keeps receipt immutable",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"rr-webhook-")),file=join(dir,"inbox.sqlite");let db=new DatabaseSync(file);
  try {schema(db);db.prepare("INSERT INTO invoice_bindings VALUES(?, 'paypal','sandbox','INV2-TEST-0001')").run("00000000-0000-4000-8000-999999999999");
    let f=fixture({inbox:createD1WebhookInbox(dbPort(db))});assert.equal((await f.handler(request())).status,200);
    const before=db.prepare("SELECT * FROM webhook_inbox_events").get();assert.equal(before.invoice_binding_id,"00000000-0000-4000-8000-999999999999");
    db.close();db=new DatabaseSync(file);f=fixture({inbox:createD1WebhookInbox(dbPort(db))});assert.equal((await (await f.handler(request())).json()).status,"duplicate");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM webhook_inbox_events").get().n,1);
    assert.throws(()=>db.exec("UPDATE webhook_inbox_events SET payload_sha256='"+"a".repeat(64)+"'"),/immutable/);
    db.exec("UPDATE webhook_inbox_events SET processing_status='processed'");
    assert.equal((await (await f.handler(request())).json()).status,"duplicate");
    assert.equal(db.prepare("SELECT processing_status FROM webhook_inbox_events").get().processing_status,"processed");
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test("concurrent D1-shaped inbox writers store once and a changed event conflicts",async()=>{const db=new DatabaseSync(":memory:");try{schema(db);const a=fixture({inbox:createD1WebhookInbox(dbPort(db))}),b=fixture({inbox:createD1WebhookInbox(dbPort(db))});const results=await Promise.all([a.handler(request()),b.handler(request())]);assert.ok(results.every(x=>x.status===200));assert.equal(db.prepare("SELECT COUNT(*) n FROM webhook_inbox_events").get().n,1);assert.equal((await b.handler(request(rawEvent({resource:{id:"INV2-TEST-0001",status:"UNPAID"}})))).status,409);assert.equal(db.prepare("SELECT resource_status FROM webhook_inbox_events").get().resource_status,"PAID");}finally{db.close();}});
test("D1-shaped persistence failures never produce success acknowledgement",async()=>{const db=new DatabaseSync(":memory:");try{schema(db);db.exec("DROP TABLE webhook_inbox_events");const f=fixture({inbox:createD1WebhookInbox(dbPort(db))});assert.equal((await f.handler(request())).status,503);}finally{db.close();}});
test("inbox rejects extra metadata and snapshot callers cannot mutate stored evidence",async()=>{const f=fixture();await f.handler(request());const row=f.inbox.snapshot()[0];assert.throws(()=>{row.resourceStatus="UNPAID";},TypeError);await assert.rejects(f.inbox.putVerified({...row,secret:"not-allowed"}));await assert.rejects(f.inbox.putVerified({...row,verifiedHeadersJson:JSON.stringify({raw_body:"private"})}));assert.equal(f.inbox.snapshot()[0].resourceStatus,"PAID");});

// These execute the actual route adapter without needing Hono or a Worker account.
import { createPayPalWebhookRoute, PAYPAL_WEBHOOK_ROUTE } from "../apps/api/src/paypal-webhook-route.ts";
test("webhook route has a single explicit sandbox path",()=>{assert.equal(PAYPAL_WEBHOOK_ROUTE,"/webhooks/paypal/sandbox");});
for(const bindings of [undefined,{},config(),{...config(),PAYPAL_WEBHOOK_INTAKE_ENABLED:"true"},
  {...config(),DB:{},PAYPAL_WEBHOOK_INTAKE_ENABLED:"false"},
  {...config(),APP_MODE:"local",DB:{},PAYPAL_WEBHOOK_INTAKE_ENABLED:"true"}]){
  test(`disabled route never initiates HTTP: ${JSON.stringify(Object.keys(bindings??{}))}`,async()=>{let calls=0;const route=createPayPalWebhookRoute(async()=>{calls++;throw Error("no network");});const r=await route(request(),bindings);assert.equal(r.status,503);assert.equal(calls,0);assert.ok(!(await r.text()).includes("synthetic-secret"));});
}
test("configured route writes only inbox using the actual D1-shaped adapter",async()=>{const db=new DatabaseSync(":memory:");try{schema(db);let calls=0;
  const route=createPayPalWebhookRoute(async url=>{calls++;return url===tokenUrl?response({access_token:"test-token",token_type:"Bearer",expires_in:3600}):response({verification_status:"SUCCESS"});});
  const fresh=JSON.stringify(event({create_time:new Date().toISOString()}));
  const r=await route(request(fresh,{time:new Date().toISOString()}),{...config(),DB:dbPort(db),PAYPAL_WEBHOOK_INTAKE_ENABLED:"true"});
  assert.equal(r.status,200);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM webhook_inbox_events").get().n,1);assert.equal(calls,2);
}finally{db.close();}});

test("duplicate verification-status keys in provider response fail closed",async()=>{const f=fixture({transport:async url=>url===tokenUrl?response({access_token:"test-token",token_type:"Bearer",expires_in:3600}):new Response('{"verification_status":"FAILURE","verification_status":"SUCCESS"}',{headers:{"content-type":"application/json"}})});await assertRejected(f,request(),503,"verification_unavailable");});
test("provider certificate URL is accepted only from both documented Sandbox origins",async()=>{const f=fixture();const r=await f.handler(request(rawEvent(),{headers:{"paypal-cert-url":"https://api-m.sandbox.paypal.com/v1/notifications/certs/CERT-ALTERNATE"}}));assert.equal(r.status,200);});
test("malformed OAuth expires/token fields cannot enable event verification",async()=>{for(const delta of [{expires_in:0},{expires_in:86401},{token_type:"bearer"},{access_token:"bad\nheader"}]){const f=fixture({transport:async()=>response({access_token:"test-token",token_type:"Bearer",expires_in:3600,...delta})});await assertRejected(f,request(),503,"verification_unavailable");assert.equal(f.calls.length,1);}});
test("body event timestamps and IDs are validated before provider access",async()=>{for(const delta of [{id:""},{id:"<script>"},{create_time:"tomorrow"},{create_time:"2026-02-30T12:00:00Z"},{create_time:new Date(NOW+301000).toISOString()}]){const f=fixture();await assertRejected(f,request(rawEvent(delta)),400,"invalid_event",true);}});
test("empty, UTF-8 BOM and truncated string bodies are rejected",async()=>{for(const raw of ["","\ufeff"+rawEvent(),'{"note":"unfinished']){const f=fixture();await assertRejected(f,request(raw),400,"invalid_body",true);}});
test("different provider response origin is rejected even when a mock says not redirected",async()=>{const f=fixture({transport:async()=>{const r=response({access_token:"test-token",token_type:"Bearer",expires_in:3600});Object.defineProperty(r,"url",{value:"https://evil.test/steal"});return r;}});await assertRejected(f,request(),503,"verification_unavailable");});
test("a legacy rejected row cannot masquerade as a verified duplicate",async()=>{const memory=fixture();await memory.handler(request());const e=memory.inbox.snapshot()[0];const db=new DatabaseSync(":memory:");try{schema(db);db.prepare(`INSERT INTO webhook_inbox_events(webhook_inbox_event_id,provider,environment,provider_event_id,event_type,verification_status,processing_status,payload_sha256,verified_headers_json,received_at,provider_invoice_id,event_created_at,resource_status) VALUES(?,'paypal','sandbox',?,?,'rejected','pending',?,?,?,?,?,?)`).run(e.inboxId,e.providerEventId,e.eventType,e.payloadSha256,e.verifiedHeadersJson,e.receivedAt,e.providerInvoiceId,e.eventCreatedAt,e.resourceStatus);const f=fixture({inbox:createD1WebhookInbox(dbPort(db))});assert.equal((await f.handler(request())).status,409);assert.equal(db.prepare("SELECT verification_status FROM webhook_inbox_events").get().verification_status,"rejected");}finally{db.close();}});
