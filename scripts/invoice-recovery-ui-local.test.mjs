/** Source-bound recovery validation and actual native client command behavior. */
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { INVOICE_RECOVERY_CLIENT_COMMON } from "../apps/web/src/invoice-recovery-client-common.ts";
import { CREATOR_REVIEW_CLIENT } from "../apps/web/src/creator-review-client.ts";
import { renderCreatorReview } from "../apps/api/src/creator-review.ts";

const validators = vm.runInNewContext(`(() => { ${INVOICE_RECOVERY_CLIENT_COMMON}; return {validateRecoveryView,validateRecoveryResult}; })()`, { URL });
const id = n => `80000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const invoiceId = "INV2-RECOVERY-EXACT-001";
const consentCopy = "I confirm this decision applies to the exact displayed licensing rights and USD quote. Approval alone does not grant permission or confirm payment.";
function fixture(state = "creation_reserved") {
  const offer = { schemaVersion:"human-consent-view-v1",environment:"sandbox",caseId:id(1),caseVersion:6,stage:"billing_started",
    termsVersionId:id(2),quoteId:id(3),creatorDecisionId:id(4),reviewHash:"b".repeat(64),currency:"USD",amountCents:20000,
    creatorCopyVersion:"creator-rights-decision-v1",creatorCopy:consentCopy,paymentConfirmed:false,permissionGranted:false,
    asset:{title:"Coastal light",creator:"Fixture Creator",fingerprint:"c".repeat(64)},
    rights:{use_purpose:"commercial",channels:["instagram_paid"],paid_advertising:true,territories:["US"],start_date:"2026-11-01",duration_days:30,
      max_impressions:100000,exclusivity:"non_exclusive",modification_scope:"crop_only",attribution:"required",sublicensing:"prohibited",ai_use:"prohibited"},
    period:{startDate:"2026-11-01",endDateExclusive:"2026-12-01",lastPermittedDate:"2026-11-30"},lineItems:[{description:"Accepted campaign",amountCents:20000}] };
  const creation = ["creation_reserved","draft_observed","creation_unresolved"].includes(state);
  const action = {creation_reserved:"resume_creation",draft_observed:"record_draft",sending_reserved:"resume_sending",delivery_unresolved:"check_delivery"}[state] ?? null;
  const status = creation ? "create_pending" : state === "none" ? "draft" : state === "complete" ? "sent" : "send_pending";
  const invoice = {schemaVersion:"invoice-controls-v1",environment:"sandbox",caseId:offer.caseId,caseVersion:offer.caseVersion,stage:offer.stage,
    invoiceId:creation ? null : invoiceId,invoiceStatus:status,canCreate:false,canSend:state === "none",paymentConfirmed:false,permissionGranted:false};
  const recovery = {schemaVersion:"invoice-recovery-v1",environment:"sandbox",caseId:offer.caseId,caseVersion:offer.caseVersion,stage:offer.stage,
    termsVersionId:offer.termsVersionId,quoteId:offer.quoteId,creatorDecisionId:offer.creatorDecisionId,buyerAcceptanceId:id(5),
    invoiceId:invoice.invoiceId,invoiceStatus:invoice.invoiceStatus,observedDraftId:state === "draft_observed" ? invoiceId : null,
    operationId:id(6),operationStatus:["none","complete"].includes(state) ? "succeeded" : ["creation_reserved","sending_reserved"].includes(state) ? "pending" : "unknown",
    state,action,sourceHash:"d".repeat(64),paymentConfirmed:false,permissionGranted:false};
  return {offer,invoice,recovery};
}
function command(f) {
  return {expectedCaseVersion:f.recovery.caseVersion,operationId:f.recovery.operationId,sourceHash:f.recovery.sourceHash,action:f.recovery.action,confirmed:true};
}
function result(f,uncertain = false) {
  const create = ["resume_creation","record_draft"].includes(f.recovery.action);
  return {schemaVersion:"invoice-recovery-result-v1",environment:"sandbox",caseId:f.offer.caseId,
    expectedCaseVersion:f.recovery.caseVersion,operationId:f.recovery.operationId,sourceHash:f.recovery.sourceHash,action:f.recovery.action,
    outcome:uncertain ? "awaiting_reconciliation" : create ? "draft_bound" : "delivery_observed",invoiceId:create && uncertain ? null : invoiceId,
    paymentUrl:create || uncertain ? null : "https://www.sandbox.paypal.com/invoice/p/recovery-fixture",
    providerStatus:create ? null : uncertain ? "DRAFT" : "SENT",paymentConfirmed:false,permissionGranted:false};
}

test("shipped creator review compiles with the same recovery validator exercised here", () => {
  new vm.Script(CREATOR_REVIEW_CLIENT);
  assert.ok(CREATOR_REVIEW_CLIENT.includes(INVOICE_RECOVERY_CLIENT_COMMON));
});
test("recovery shell starts hidden, with an unchecked confirmation and no provider reference input", () => {
  const page = renderCreatorReview(id(1),"a".repeat(32));
  assert.match(page,/<section id="recovery-panel" hidden aria-labelledby="recovery-title"/u);
  assert.match(page,/<form id="recovery-form" hidden>/u);
  assert.match(page,/<input type="checkbox" id="recovery-confirm">/u);
  assert.match(page,/<button id="recovery-command" type="submit" disabled>/u);
  assert.doesNotMatch(page,/<input[^>]+(?:invoiceId|providerStatus|paymentUrl|sourceHash)/u);
});
for (const state of ["none","creation_reserved","draft_observed","creation_unresolved","sending_reserved","delivery_unresolved","complete"]) {
  test(`recovery view accepts exact local ${state} state`, () => {
    const f = fixture(state); validators.validateRecoveryView(f.recovery,f.offer,f.invoice);
  });
}
test("pre-invoice review exposes no recovery operation or acceptance authority", () => {
  const f = fixture("none");
  f.offer.stage = f.invoice.stage = f.recovery.stage = "awaiting_creator";
  f.offer.creatorDecisionId = f.recovery.creatorDecisionId = f.recovery.buyerAcceptanceId = null;
  f.invoice.invoiceId = f.invoice.invoiceStatus = f.recovery.invoiceId = f.recovery.invoiceStatus = null;
  f.invoice.canSend = false; f.recovery.operationId = f.recovery.operationStatus = null;
  validators.validateRecoveryView(f.recovery,f.offer,f.invoice);
});
const badViews = [
  ["schema",v => {v.schemaVersion = "invoice-recovery-v2";}],
  ["environment",v => {v.environment = "production";}],
  ["extra provider material",v => {v.providerResponse = {token:"private"};}],
  ["case identity",v => {v.caseId = id(90);}],
  ["case revision",v => {v.caseVersion++;}],
  ["fractional case revision",v => {v.caseVersion = 6.5;}],
  ["stage",v => {v.stage = "accepted_awaiting_invoice";}],
  ["terms identity",v => {v.termsVersionId = id(90);}],
  ["quote identity",v => {v.quoteId = id(90);}],
  ["creator decision identity",v => {v.creatorDecisionId = id(90);}],
  ["missing accepted buyer",v => {v.buyerAcceptanceId = null;}],
  ["malformed accepted buyer",v => {v.buyerAcceptanceId = [id(5)];}],
  ["missing operation",v => {v.operationId = null;}],
  ["non-string operation",v => {v.operationId = [id(6)];}],
  ["operation status",v => {v.operationStatus = "unknown";}],
  ["partial source hash",v => {v.sourceHash = "d";}],
  ["non-string source hash",v => {v.sourceHash = ["d".repeat(64)];}],
  ["uppercase source hash",v => {v.sourceHash = "D".repeat(64);}],
  ["canonical invoice reference",v => {v.invoiceId = invoiceId;}],
  ["canonical invoice status",v => {v.invoiceStatus = "draft";}],
  ["unsolicited observed draft",v => {v.observedDraftId = invoiceId;}],
  ["state/action mismatch",v => {v.state = "draft_observed";}],
  ["missing safe action",v => {v.action = null;}],
  ["unsupported action",v => {v.action = "send_again";}],
  ["inherited action name",v => {v.action = "constructor";}],
  ["non-string action",v => {v.action = ["resume_creation"];}],
  ["claimed payment",v => {v.paymentConfirmed = true;}],
  ["claimed permission",v => {v.permissionGranted = true;}],
];
for (const [name,mutate] of badViews) test(`recovery view rejects ${name}`, () => {
  const f = fixture(); mutate(f.recovery); assert.throws(() => validators.validateRecoveryView(f.recovery,f.offer,f.invoice),/does not match/u);
});
test("recovery never promotes an unknown creation to a repeat provider action", () => {
  const f = fixture("creation_unresolved"); f.recovery.action = "resume_creation";
  assert.throws(() => validators.validateRecoveryView(f.recovery,f.offer,f.invoice),/does not match/u);
});
test("observed draft recovery requires the retained server invoice reference", () => {
  for (const ref of [null,"invalid",[invoiceId]]) {
    const f = fixture("draft_observed"); f.recovery.observedDraftId = ref;
    assert.throws(() => validators.validateRecoveryView(f.recovery,f.offer,f.invoice),/does not match/u);
  }
});
test("recovery cannot act without the matching current invoice-controls view", () => {
  const f = fixture(); assert.throws(() => validators.validateRecoveryView(f.recovery,f.offer,null),/does not match/u);
  f.invoice.caseVersion++; assert.throws(() => validators.validateRecoveryView(f.recovery,f.offer,f.invoice),/does not match/u);
});
test("recovery rejects a contradictory invoice-reference and status pair", () => {
  const f = fixture("none"); f.recovery.invoiceStatus = f.invoice.invoiceStatus = null;
  assert.throws(() => validators.validateRecoveryView(f.recovery,f.offer,f.invoice),/does not match/u);
});
for (const state of ["creation_reserved","draft_observed","sending_reserved","delivery_unresolved"]) {
  test(`recovery result binds the exact ${state} command for completed and uncertain outcomes`, () => {
    const f = fixture(state); validators.validateRecoveryResult(result(f),f.recovery,command(f));
    validators.validateRecoveryResult(result(f,true),f.recovery,command(f));
  });
}
const badResults = [
  ["schema",v => {v.schemaVersion = "invoice-recovery-result-v2";}],
  ["environment",v => {v.environment = "production";}],
  ["unexpected authority field",v => {v.receiptId = id(90);}],
  ["case identity",v => {v.caseId = id(90);}],
  ["source revision",v => {v.expectedCaseVersion++;}],
  ["operation identity",v => {v.operationId = id(90);}],
  ["source hash",v => {v.sourceHash = "e".repeat(64);}],
  ["action identity",v => {v.action = "resume_sending";}],
  ["cross-action outcome",v => {v.outcome = "draft_bound";}],
  ["invoice identity",v => {v.invoiceId = "INV2-OTHER-001";}],
  ["missing invoice",v => {v.invoiceId = null;}],
  ["unconfirmed delivery status",v => {v.providerStatus = "DRAFT";}],
  ["unknown provider status",v => {v.providerStatus = "GRANTED";}],
  ["payment URL origin",v => {v.paymentUrl = "https://evil.example/invoice/p/fixture";}],
  ["payment URL credentials",v => {v.paymentUrl = "https://name:password@www.sandbox.paypal.com/invoice/p/fixture";}],
  ["payment URL query",v => {v.paymentUrl += "?token=private";}],
  ["payment URL path escape",v => {v.paymentUrl = "https://www.sandbox.paypal.com/invoice/p/../private";}],
  ["paid status with a payment link",v => {v.providerStatus = "PAID";}],
  ["claimed payment",v => {v.paymentConfirmed = true;}],
  ["claimed permission",v => {v.permissionGranted = true;}],
];
for (const [name,mutate] of badResults) test(`recovery result rejects ${name}`, () => {
  const f = fixture("delivery_unresolved"), v = result(f); mutate(v);
  assert.throws(() => validators.validateRecoveryResult(v,f.recovery,command(f)),/uncertain/u);
});
test("draft result can only bind the exact retained provider reference", () => {
  const f = fixture("draft_observed"), v = result(f); v.invoiceId = "INV2-OTHER-001";
  assert.throws(() => validators.validateRecoveryResult(v,f.recovery,command(f)),/uncertain/u);
  v.invoiceId = invoiceId; v.paymentUrl = "https://www.sandbox.paypal.com/invoice/p/fixture";
  assert.throws(() => validators.validateRecoveryResult(v,f.recovery,command(f)),/uncertain/u);
});
test("result validation cannot replace the confirmed command with a new source", () => {
  const f = fixture("delivery_unresolved"), changed = command(f); changed.sourceHash = "e".repeat(64);
  assert.throws(() => validators.validateRecoveryResult({...result(f),sourceHash:changed.sourceHash},f.recovery,changed),/uncertain/u);
  const unconfirmed = {...command(f),confirmed:false};
  assert.throws(() => validators.validateRecoveryResult(result(f),f.recovery,unconfirmed),/uncertain/u);
});

class Element {
  constructor() { this.children = []; this.listeners = new Map(); this.textContent = ""; this.hidden = false; this.disabled = false; this.checked = false; this.value = ""; }
  get disabled() { return this._disabled; }
  set disabled(value) { this._disabled = !!value; }
  replaceChildren(...items) { this.children = [...items]; this.textContent = ""; }
  append(...items) { this.children.push(...items); }
  addEventListener(name,handler) { this.listeners.set(name,handler); }
  async emit(name,event = {}) { return this.listeners.get(name)?.({preventDefault() {},...event}); }
}
async function flush() { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); }
function browser(f = fixture(),options = {}) {
  const ids = ["decision-form","status","offer","confirm","decision","reason","submit","reload","consent-copy","invoice-panel","invoice-info","invoice-status",
    "create-form","create-confirm","create-invoice","send-form","send-confirm","send-invoice","recovery-panel","recovery-info","recovery-status","recovery-form","recovery-confirm","recovery-command","recovery-copy"];
  const elements = Object.fromEntries(ids.map(key => [key,new Element()])); elements.decision.value = "approved";
  const listeners = new Map(), windowListeners = new Map(), timers = new Map(), calls = [];
  let now = Date.parse("2026-10-28T10:00:00.000Z"), timerId = 0;
  const document = {body:{dataset:{caseId:id(1)}},hidden:false,getElementById:key => elements[key],createElement:() => new Element(),
    addEventListener:(name,handler) => listeners.set(name,handler)};
  const fetch = async (url,init) => {
    calls.push({url,method:init.method || "GET",body:init.body,init});
    if (url === "/api/creator/session") return Response.json({authenticated:true,environment:"sandbox",expiresInMs:options.expiresInMs ?? 300000});
    if (url.endsWith("/review")) return Response.json(f.offer);
    if (url.endsWith("/recovery")) return options.metadata ? options.metadata(f,calls) : Response.json(f.recovery);
    if (url.endsWith("/recover")) return options.recover ? options.recover(f,init,calls) : Response.json(result(f,true));
    if (url === "/api/invoices/creator/cases/" + id(1)) return Response.json(f.invoice);
    throw new Error("Unexpected native client request");
  };
  const context = {document,window:{addEventListener:(name,handler) => windowListeners.set(name,handler)},fetch,URL,AbortController,Uint8Array,TextDecoder,
    crypto:{randomUUID:() => id(50)},Date:class extends Date {static now() {return now;}},
    setTimeout:(handler,delay) => {const value = ++timerId; timers.set(value,{handler,at:now+delay});return value;},clearTimeout:value => timers.delete(value)};
  vm.runInNewContext(CREATOR_REVIEW_CLIENT,context);
  return {elements,calls,document,async ready() {await flush(); assert.match(elements.status.textContent,/Current offer\./u);},
    async confirm() {elements["recovery-confirm"].checked = true;await elements["recovery-confirm"].emit("change");},
    async submit() {await elements["recovery-form"].emit("submit");await flush();},
    async reload() {await elements.reload.emit("click");await flush();},
    async hide() {document.hidden = true;listeners.get("visibilitychange")();await flush();},
    async pagehide() {windowListeners.get("pagehide")();await flush();},
    async persisted() {windowListeners.get("pageshow")({persisted:true});await flush();},
    async expire() {now += 300001;for (const timer of [...timers.values()]) if (timer.at <= now) timer.handler();await flush();},
    posts:() => calls.filter(call => call.method === "POST")};
}
test("opening and reloading recovery reads local metadata and needs unchecked explicit confirmation", async () => {
  const b = browser(); await b.ready();
  assert.equal(b.elements["recovery-panel"].hidden,false);assert.equal(b.elements["recovery-form"].hidden,false);
  assert.equal(b.elements["recovery-confirm"].checked,false);assert.equal(b.elements["recovery-command"].disabled,true);
  await b.submit();await b.reload();assert.equal(b.posts().length,0);
  assert.ok(b.calls.every(call => call.method === "GET" && call.init.credentials === "same-origin" && call.init.redirect === "error" && call.init.cache === "no-store"));
});
test("the actual recovery client sends one exact explicit source-bound command", async () => {
  const f = fixture("sending_reserved"), b = browser(f);await b.ready();await b.confirm();
  assert.equal(b.elements["recovery-command"].disabled,false);await b.submit();
  assert.equal(b.posts().length,1);assert.deepEqual(JSON.parse(b.posts()[0].body),command(f));
  assert.equal(b.posts()[0].url,"/api/invoices/creator/cases/" + id(1) + "/recover");
  assert.equal(b.elements["recovery-confirm"].checked,false);assert.equal(b.elements["recovery-command"].disabled,true);
});
test("transport uncertainty retains the original frozen command and never retries automatically", async () => {
  const f = fixture("delivery_unresolved"), b = browser(f,{recover:async () => {throw new Error("lost acknowledgement");}});
  await b.ready();await b.confirm();await b.submit();
  assert.equal(b.posts().length,1);assert.equal(b.elements["recovery-command"].textContent,"Retry this recovery command");
  const frozen = b.posts()[0].body;f.recovery.sourceHash = "e".repeat(64);f.recovery.operationId = id(99);await flush();
  assert.equal(b.posts().length,1);await b.submit();assert.equal(b.posts().length,2);assert.equal(b.posts()[1].body,frozen);
});
test("a stale recovery reply clears the frozen command and waits for an explicit reload", async () => {
  let attempts = 0;
  const b = browser(fixture("draft_observed"),{recover:async () => {
    if (++attempts === 1) throw new Error("lost acknowledgement");
    return Response.json({error:"stale_revision"},{status:409});
  }});
  await b.ready();await b.confirm();await b.submit();await b.submit();
  assert.equal(b.posts().length,2);assert.equal(b.posts()[0].body,b.posts()[1].body);
  assert.equal(b.elements["recovery-panel"].hidden,true);assert.equal(b.elements["recovery-info"].children.length,0);
  assert.match(b.elements.status.textContent,/state changed.*Reload/u);
  const reads = b.calls.length;await flush();assert.equal(b.calls.length,reads);
  await b.reload();assert.equal(b.elements["recovery-confirm"].checked,false);assert.equal(b.posts().length,2);
});
test("a mismatched successful reply retains only the same recovery command", async () => {
  const f = fixture("delivery_unresolved"), b = browser(f,{recover:async () => Response.json({...result(f),operationId:id(99)})});
  await b.ready();await b.confirm();await b.submit();
  assert.equal(b.elements["recovery-command"].textContent,"Retry this recovery command");
  assert.match(b.elements.status.textContent,/outcome is uncertain/u);assert.equal(b.posts().length,1);
});
test("an unresolved creation without a retained reference has no executable recovery form", async () => {
  const b = browser(fixture("creation_unresolved"));await b.ready();
  assert.equal(b.elements["recovery-panel"].hidden,false);assert.equal(b.elements["recovery-form"].hidden,true);
  assert.match(b.elements["recovery-status"].textContent,/invoice reference was not recorded/u);
  await b.confirm();await b.submit();assert.equal(b.posts().length,0);
});
test("disabled optional recovery preserves the original explicit send controls", async () => {
  const b = browser(fixture("none"),{metadata:async () => Response.json({error:"invoice_recovery_unavailable"},{status:503})});
  await b.ready();assert.equal(b.elements["recovery-panel"].hidden,true);assert.equal(b.elements["send-form"].hidden,false);
  b.elements["send-confirm"].checked = true;await b.elements["send-confirm"].emit("change");assert.equal(b.elements["send-invoice"].disabled,false);
  assert.equal(b.posts().length,0);
});
test("contradictory recovery metadata cannot leave invoice write controls enabled", async () => {
  const f = fixture("none"), b = browser(f,{metadata:async () => Response.json({...f.recovery,quoteId:id(99)})});
  await b.ready();assert.equal(b.elements["send-form"].hidden,true);assert.equal(b.elements["send-invoice"].disabled,true);
  assert.match(b.elements["recovery-status"].textContent,/does not match/u);assert.equal(b.posts().length,0);
});
test("recovery metadata authorization loss clears all private offer and invoice content", async () => {
  const b = browser(fixture(),{metadata:async () => Response.json({error:"not_authorized"},{status:403})});await flush();
  assert.equal(b.elements.offer.children.length,0);assert.equal(b.elements["invoice-panel"].hidden,true);
  assert.equal(b.elements["recovery-panel"].hidden,true);assert.match(b.elements.status.textContent,/Session unavailable/u);
});
for (const boundary of ["expire","hide","pagehide","persisted"]) test(`${boundary} clears pending recovery and rejects a late reply`, async () => {
  let resolve;
  const f = fixture("delivery_unresolved"), b = browser(f,{recover:() => new Promise(done => {resolve = done;})});
  await b.ready();await b.confirm();const submitting = b.submit();await flush();
  assert.equal(b.posts().length,1);await b[boundary]();resolve(Response.json(result(f)));await submitting;
  assert.equal(b.elements["recovery-panel"].hidden,true);assert.equal(b.elements["recovery-info"].children.length,0);
  assert.equal(b.elements["recovery-copy"].textContent,"");assert.equal(b.elements["recovery-confirm"].checked,false);
  assert.equal(b.elements["recovery-command"].disabled,true);assert.equal(b.elements.offer.children.length,0);
  assert.equal(b.posts().length,1);
});
