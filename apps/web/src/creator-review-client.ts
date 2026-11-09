import { INVOICE_RECOVERY_CLIENT_COMMON } from "./invoice-recovery-client-common";
import { FORM_ACCESSIBILITY_CLIENT } from "./form-accessibility-client";
import { REQUEST_DEADLINE_CLIENT } from "./request-deadline-client";

/** Access owns the session cookie. Every command is explicit and bound to a fresh server view. */
export const CREATOR_REVIEW_CLIENT = String.raw`"use strict";
(() => {` + INVOICE_RECOVERY_CLIENT_COMMON + FORM_ACCESSIBILITY_CLIENT + REQUEST_DEADLINE_CLIENT + String.raw`
  const form = document.getElementById("decision-form"), status = document.getElementById("status"), content = document.getElementById("offer"),
    check = document.getElementById("confirm"), select = document.getElementById("decision"), reason = document.getElementById("reason"),
    submit = document.getElementById("submit"), reload = document.getElementById("reload"), copy = document.getElementById("consent-copy"),
    panel = document.getElementById("invoice-panel"), invoiceInfo = document.getElementById("invoice-info"), invoiceStatus = document.getElementById("invoice-status"),
    createForm = document.getElementById("create-form"), createCheck = document.getElementById("create-confirm"), createButton = document.getElementById("create-invoice"),
    sendForm = document.getElementById("send-form"), sendCheck = document.getElementById("send-confirm"), sendButton = document.getElementById("send-invoice"),
    recoveryPanel = document.getElementById("recovery-panel"), recoveryInfo = document.getElementById("recovery-info"), recoveryStatus = document.getElementById("recovery-status"),
    recoveryForm = document.getElementById("recovery-form"), recoveryCheck = document.getElementById("recovery-confirm"), recoveryButton = document.getElementById("recovery-command"),
    recoveryCopy = document.getElementById("recovery-copy"),
    caseId = document.body.dataset.caseId;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const INV = /^INV2-[A-Za-z0-9-]{3,100}$/;
  const labels = {use_purpose:"Use purpose",channels:"Channels",paid_advertising:"Paid advertising",territories:"Territory",start_date:"Start date",duration_days:"Duration (days)",max_impressions:"Maximum impressions",exclusivity:"Exclusivity",modification_scope:"Modifications",attribution:"Attribution",sublicensing:"Sublicensing",ai_use:"AI use"};
  const names = {commercial:"Commercial",instagram_paid:"Instagram paid ads",facebook_paid:"Facebook paid ads",US:"United States",CA:"Canada",non_exclusive:"Non-exclusive",crop_only:"Crop only",none:"No modifications",required:"Required",not_required:"Not required",prohibited:"Prohibited",awaiting_creator:"Awaiting creator decision",awaiting_buyer:"Awaiting buyer acceptance",accepted_awaiting_invoice:"Accepted, invoice not yet created",billing_started:"Billing started",rejected:"Rejected",canceled:"Canceled",clarification_required:"Revised terms required",create_pending:"Draft outcome pending reconciliation",draft:"Draft created; not sent",send_pending:"Delivery outcome pending reconciliation",sent:"Invoice sent; payment verified separately",paid:"Payment recorded; verify the current rights receipt",fully_refunded:"Refund recorded; verify the current rights receipt",reconciliation_required:"Reconciliation required"};
  const CONSENT = "I confirm this decision applies to the exact displayed licensing rights and USD quote. Approval alone does not grant permission or confirm payment.";
  const decisionErrors = formErrors(document.getElementById("decision-errors"),document.getElementById("decision-error-list"),{decision:select,reason},"creator-decision");
  let view = null, invoice = null, recovery = null, pending = null, timer = null, epoch = 0, busy = false, deadline = 0, controller = null, pendingFocus = null;
  function message(text) { status.textContent = text; }
  function clear() {
    decisionErrors.clear(); reason.value = ""; select.value = "approved";
    view = null; invoice = null; recovery = null; deadline = 0; content.replaceChildren(); copy.textContent = "";
    invoiceInfo.replaceChildren(); invoiceStatus.textContent = ""; panel.hidden = true;
    recoveryInfo.replaceChildren(); recoveryStatus.textContent = ""; recoveryCopy.textContent = ""; recoveryPanel.hidden = true;
    form.hidden = true; createForm.hidden = true; sendForm.hidden = true; recoveryForm.hidden = true;
    check.checked = false; createCheck.checked = false; sendCheck.checked = false; recoveryCheck.checked = false;
    check.disabled = true; createCheck.disabled = true; sendCheck.disabled = true; recoveryCheck.disabled = true; select.disabled = true; reason.disabled = true;
    submit.disabled = true; createButton.disabled = true; sendButton.disabled = true; recoveryButton.disabled = true;
    for (const element of [form,createForm,sendForm,recoveryForm]) element.setAttribute?.("aria-busy","false");
    clearTimeout(timer); timer = null;
  }
  function lock(text = "Private review cleared. Reload to check your session and the current offer.",interaction = null) {
    const focus = interaction ?? pendingFocus ?? captureFocusWithin(form,panel,content);
    epoch++; controller?.abort(); controller = null; pending = null; busy = false; clear(); message(text);
    reload.disabled = false; pendingFocus = null; focusAfterInteraction(focus,reload);
  }
  function active(mine) { return mine === epoch && !document.hidden && Date.now() < deadline; }
  function enabled() {
    const locked = busy || !view || Date.now() >= deadline;
    submit.disabled = locked || form.hidden || !check.checked || (pending && pending.kind !== "decision");
    createButton.disabled = locked || !invoice || !invoice.canCreate || !createCheck.checked || (pending && pending.kind !== "create");
    sendButton.disabled = locked || !invoice || !invoice.canSend || !sendCheck.checked || (pending && pending.kind !== "send");
    recoveryButton.disabled = locked || !recovery || !recovery.action || recoveryForm.hidden || !recoveryCheck.checked || (pending && pending.kind !== "recovery");
    select.disabled = locked || !!pending; reason.disabled = locked || !!pending; check.disabled = locked || !!pending;
    createCheck.disabled = locked || !invoice?.canCreate || !!pending; sendCheck.disabled = locked || !invoice?.canSend || !!pending;
    recoveryCheck.disabled = locked || !recovery?.action || !!pending; reload.disabled = busy;
    reason.required = select.value !== "approved"; reason.setAttribute?.("aria-required",String(reason.required));
    for (const element of [form,createForm,sendForm,recoveryForm]) element.setAttribute?.("aria-busy",String(busy));
  }
  async function read(url,init = {}) {
    return readJsonWithDeadline(url,{credentials:"same-origin",mode:"same-origin",redirect:"error",cache:"no-store",signal:controller?.signal,...init,
      headers:{Accept:"application/json","X-Requested-With":"XMLHttpRequest",...init.headers}}, {
      timeoutMessage:init.method === "POST"
        ? "The confirmed command timed out. Its outcome is uncertain and may already be recorded. Retry this exact command or reload its saved state. No further action starts automatically."
        : "Loading the creator review timed out. Reload to check the current offer and saved invoice state.",
      checkResponse(response) {
        if (!response.ok) {
          const error = new Error(response.status === 401 || response.status === 403 ? "Session unavailable. Sign in again, then reload."
            : response.status === 409 ? "The offer changed or is locked. Reload the current record."
            : response.status === 429 ? "Too many requests. Wait before trying again."
            : "The request could not be completed. No payment or permission is implied.");
          error.status = response.status; throw error;
        }
        if (!(response.headers.get("content-type") || "").includes("application/json")) throw new Error("An authenticated JSON response is required.");
      }
    });
  }
  function safeText(value,max) { return typeof value === "string" && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value); }
  function isoDate(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value; }
  function subset(value,allowed) { return Array.isArray(value) && value.length > 0 && value.length <= allowed.length && new Set(value).size === value.length && value.every(x => allowed.includes(x)); }
  function validate(v) {
    const r = v?.rights;
    if (v?.schemaVersion !== "human-consent-view-v1" || v.environment !== "sandbox" || v.caseId !== caseId || !UUID.test(v.caseId) || !UUID.test(v.termsVersionId) || !UUID.test(v.quoteId)
      || !Number.isSafeInteger(v.caseVersion) || v.caseVersion < 1 || !/^[0-9a-f]{64}$/.test(v.reviewHash)
      || !["awaiting_creator","awaiting_buyer","accepted_awaiting_invoice","billing_started","rejected","canceled","clarification_required"].includes(v.stage)
      || (v.creatorDecisionId !== null && !UUID.test(v.creatorDecisionId))
      || (["awaiting_buyer","accepted_awaiting_invoice","billing_started"].includes(v.stage) && !UUID.test(v.creatorDecisionId))
      || v.currency !== "USD" || !Number.isSafeInteger(v.amountCents) || v.amountCents < 1 || v.amountCents > 1000000000
      || v.paymentConfirmed !== false || v.permissionGranted !== false || v.creatorCopyVersion !== "creator-rights-decision-v1" || v.creatorCopy !== CONSENT
      || !safeText(v.asset?.title,200) || !safeText(v.asset?.creator,120) || !/^[0-9a-f]{64}$/.test(v.asset?.fingerprint)
      || !r || Object.keys(r).sort().join() !== Object.keys(labels).sort().join() || r.use_purpose !== "commercial" || r.paid_advertising !== true
      || !subset(r.channels,["instagram_paid","facebook_paid"]) || !subset(r.territories,["US","CA"]) || !isoDate(r.start_date)
      || !Number.isSafeInteger(r.duration_days) || r.duration_days < 1 || !Number.isSafeInteger(r.max_impressions) || r.max_impressions < 1
      || r.exclusivity !== "non_exclusive" || !["crop_only","none"].includes(r.modification_scope) || !["required","not_required"].includes(r.attribution)
      || r.sublicensing !== "prohibited" || r.ai_use !== "prohibited" || v.period?.startDate !== r.start_date
      || !isoDate(v.period?.endDateExclusive) || !isoDate(v.period?.lastPermittedDate)
      || Date.parse(v.period.endDateExclusive) - Date.parse(r.start_date) !== r.duration_days * 86400000
      || Date.parse(v.period.endDateExclusive) - Date.parse(v.period.lastPermittedDate) !== 86400000
      || !Array.isArray(v.lineItems) || v.lineItems.length < 1 || v.lineItems.length > 32
      || v.lineItems.some(l => !safeText(l.description,240) || !Number.isSafeInteger(l.amountCents) || l.amountCents < 0)
      || v.lineItems.reduce((sum,l) => sum + l.amountCents,0) !== v.amountCents) throw new Error("The complete licensing offer could not be validated. Reload the current record.");
  }
  function row(label,value,target = content) {
    const box = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd");
    dt.textContent = label; dd.textContent = String(value); box.append(dt,dd); target.append(box);
  }
  const readable = value => typeof value === "number" ? value.toLocaleString("en-US") : names[value] ?? value;
  const money = value => (value/100).toLocaleString("en-US",{style:"currency",currency:"USD"});
  function render(v) {
    validate(v); view = v; content.replaceChildren(); row("Asset",v.asset.title); row("Stage",readable(v.stage)); row("Price",money(v.amountCents) + " (Sandbox)");
    for (const [field,label] of Object.entries(labels)) {
      const value = v.rights[field]; row(label,Array.isArray(value) ? value.map(readable).join(", ") : typeof value === "boolean" ? (value ? "Yes" : "No") : readable(value));
    }
    row("End date (exclusive, UTC)",v.period.endDateExclusive);
    for (const line of v.lineItems) row(line.description,money(line.amountCents));
    copy.textContent = v.creatorCopy; form.hidden = !["awaiting_creator","awaiting_buyer"].includes(v.stage);
    check.checked = false; select.disabled = false; reason.disabled = false; submit.textContent = "Save explicit decision"; enabled();
  }
  function renderInvoice(v) {
    panel.hidden = false; invoiceInfo.replaceChildren(); createForm.hidden = true; sendForm.hidden = true;
    if (!v) { invoiceStatus.textContent = "Sandbox invoice controls are unavailable. You can still review the current offer and record an eligible decision."; return; }
    if (v.schemaVersion !== "invoice-controls-v1" || v.environment !== "sandbox" || v.caseId !== caseId
      || v.caseVersion !== view.caseVersion || v.stage !== view.stage || typeof v.canCreate !== "boolean" || typeof v.canSend !== "boolean"
      || (v.invoiceId !== null && !INV.test(v.invoiceId))
      || (v.invoiceStatus !== null && !["create_pending","draft","send_pending","sent","paid","canceled","fully_refunded","reconciliation_required"].includes(v.invoiceStatus))
      || v.paymentConfirmed !== false || v.permissionGranted !== false || (v.canCreate && v.canSend)
      || (v.canCreate && (v.invoiceId !== null || v.invoiceStatus !== null || v.stage !== "accepted_awaiting_invoice"))
      || (v.canSend && (!INV.test(v.invoiceId) || v.invoiceStatus !== "draft" || v.stage !== "billing_started"))) {
      invoiceStatus.textContent = "Invoice controls do not match the current offer. Reload to check the latest state."; return;
    }
    invoice = v; row("Invoice state",v.invoiceStatus ? readable(v.invoiceStatus) : "No Sandbox draft created",invoiceInfo);
    if (v.invoiceId) row("Sandbox invoice reference",v.invoiceId,invoiceInfo);
    row("Accepted price",money(view.amountCents) + " USD",invoiceInfo);
    createForm.hidden = !v.canCreate; sendForm.hidden = !v.canSend;
    createCheck.checked = false; sendCheck.checked = false; createButton.textContent = "Create Sandbox draft"; sendButton.textContent = "Send this Sandbox invoice";
    invoiceStatus.textContent = v.canCreate ? "Both parties accepted this exact offer. Creating a draft does not send it."
      : v.canSend ? "The recorded Sandbox draft is ready. Sending is a separate confirmed action."
      : ["create_pending","send_pending","reconciliation_required"].includes(v.invoiceStatus) ? "The recorded invoice attempt requires reconciliation. Reload checks saved state without creating or sending another invoice."
      : v.invoiceStatus ? "Invoice state is recorded. Payment and permission require independent verification."
      : "A matching creator approval and buyer acceptance are required before invoicing.";
  }
  function renderRecovery(v) {
    recovery = null; recoveryPanel.hidden = true; recoveryForm.hidden = true; recoveryCheck.checked = false;
    recoveryInfo.replaceChildren(); recoveryStatus.textContent = ""; recoveryCopy.textContent = "";
    if (!v) return;
    try { validateRecoveryView(v,view,invoice); }
    catch (error) {
      invoice = null; createForm.hidden = true; sendForm.hidden = true; recoveryPanel.hidden = false;
      recoveryStatus.textContent = error.message; return;
    }
    if (["none","complete"].includes(v.state)) return;
    recovery = v; recoveryPanel.hidden = false;
    const action = v.action === null ? null : RECOVERY_ACTIONS[v.action];
    row("Attempt",v.state === "creation_unresolved" ? "Draft result unconfirmed" : action.label,recoveryInfo);
    if (v.invoiceId || v.observedDraftId) row("Sandbox invoice reference",v.invoiceId || v.observedDraftId,recoveryInfo);
    if (!action) {
      recoveryStatus.textContent = "The draft request may have reached PayPal, but its invoice reference was not recorded. Another draft cannot be started while this outcome is unconfirmed. Reload checks the saved record.";
      return;
    }
    recoveryStatus.textContent = action.status; recoveryCopy.textContent = action.copy;
    recoveryButton.textContent = action.label; recoveryForm.hidden = false;
  }
  async function load(note = "",interaction = null,destination = "offer") {
    if (document.hidden) { lock(); return; }
    pendingFocus = interaction;
    const mine = ++epoch; controller?.abort(); controller = new AbortController(); clear(); pending = null; busy = true;
    reload.disabled = true;
    message("Checking creator session and exact licensing offer."); const started = Date.now();
    try {
      const session = await read("/api/creator/session"); if (mine !== epoch || document.hidden) return;
      if (session.authenticated !== true || session.environment !== "sandbox" || !Number.isFinite(session.expiresInMs) || session.expiresInMs <= 0 || session.expiresInMs > 3600000) throw new Error("Creator session unavailable.");
      const remaining = Math.min(300000,session.expiresInMs - (Date.now() - started)); if (remaining <= 0) throw new Error("Session expired during review. Reload to sign in again.");
      deadline = Date.now() + remaining;
      timer = setTimeout(() => lock((note ? note + " " : "") + "Review expired. Reload the current offer before taking another action."),remaining);
      const current = await read("/api/consent/creator/cases/" + caseId + "/review"); if (!active(mine)) return;
      render(current);
      let invoiceView = null;
      try { invoiceView = await read("/api/invoices/creator/cases/" + caseId); }
      catch (error) { if ([401,403].includes(error.status) || ["request_timeout","request_aborted"].includes(error.code)) throw error; }
      if (!active(mine)) return;
      renderInvoice(invoiceView);
      let recoveryView = null;
      try { recoveryView = await read("/api/invoices/creator/cases/" + caseId + "/recovery"); }
      catch (error) { if ([401,403].includes(error.status) || ["request_timeout","request_aborted"].includes(error.code)) throw error; }
      if (!active(mine)) return;
      renderRecovery(recoveryView); busy = false; enabled();
      message((note ? note + " " : "") + "Current offer. Approval, invoice delivery, payment and permission are separate steps.");
      focusAfterInteraction(interaction,document.getElementById(destination === "invoice" ? (recoveryPanel.hidden ? "invoice-title" : "recovery-title") : "offer-title"));
      pendingFocus = null;
    } catch (error) { if (mine !== epoch) return; lock((note ? note + " " : "") + (error.message || "Creator review unavailable."),interaction); }
  }
  function failure(error,mine,kind,interaction) {
    if (!active(mine)) return;
    busy = false;
    if ([400,401,403,404,409].includes(error.status)) {
      lock(kind === "recovery" && error.status === 409 ? "The invoice recovery state changed. Reload the current offer to view the saved outcome before confirming any further action." : error.message,interaction); return;
    }
    const button = kind === "decision" ? submit : kind === "create" ? createButton : kind === "send" ? sendButton : recoveryButton;
    button.textContent = kind === "decision" ? "Retry the same decision" : kind === "create" ? "Check or retry this draft command"
      : kind === "send" ? "Check or retry this send command" : "Retry this recovery command";
    enabled(); message(error.code === "request_timeout" ? error.message : kind === "recovery" ? "The recovery outcome is uncertain. Retry this same recovery command or reload its saved state. No further action starts automatically."
      : error.message || "Outcome uncertain. Retry the same command or reload its recorded state. No new command is started automatically.");
    focusAfterInteraction(interaction,button); pendingFocus = null;
  }
  form.addEventListener("submit",async event => {
    event.preventDefault(); if (busy || !view || form.hidden || !check.checked || Date.now() >= deadline || document.hidden || (pending && pending.kind !== "decision")) return;
    if (!pending) {
      const issues = [], enteredReason = reason.value.trim();
      if (!["approved","rejected","clarification_requested"].includes(select.value)) issues.push({field:"decision",message:"Choose approval, revised terms, or rejection before confirming."});
      if ((!enteredReason && select.value !== "approved") || enteredReason.length > 500 || /[\x00-\x1f\x7f]/.test(enteredReason)) {
        issues.push({field:"reason",message:"Enter a reason of 1 to 500 characters on one line. A reason is required for rejection or revised terms."});
      }
      if (issues.length) { check.checked = false; enabled(); decisionErrors.show(issues); message("Check the highlighted decision details, then confirm again."); return; }
      decisionErrors.clear(); pending = {kind:"decision",command:{requestId:crypto.randomUUID(),expectedCaseVersion:view.caseVersion,termsVersionId:view.termsVersionId,
        quoteId:view.quoteId,reviewHash:view.reviewHash,decision:select.value,reason:enteredReason || null,confirmed:true,copyVersion:view.creatorCopyVersion}};
    }
    const mine = epoch, body = JSON.stringify(pending.command), interaction = captureFocus(); pendingFocus = interaction;
    busy = true; enabled(); message("Saving the confirmed decision. Wait for its recorded outcome.");
    try {
      const result = await read("/api/consent/creator/cases/" + caseId + "/decision",{method:"POST",headers:{"Content-Type":"application/json"},body});
      if (!active(mine)) return;
      if (!["recorded","replayed"].includes(result?.outcome) || !UUID.test(result.resultId) || result.paymentConfirmed !== false || result.permissionGranted !== false) throw new Error("The decision outcome is uncertain. Retry the same decision or reload its recorded state.");
      pending = null; await load("Decision recorded by the server.",interaction);
    } catch (error) { failure(error,mine,"decision",interaction); }
  });
  async function invoiceCommand(event,kind) {
    event.preventDefault(); const confirmation = kind === "create" ? createCheck : sendCheck;
    if (busy || !view || !invoice || !confirmation.checked || Date.now() >= deadline || document.hidden || (pending && pending.kind !== kind)
      || !(kind === "create" ? invoice.canCreate : invoice.canSend)) return;
    if (!pending) pending = {kind,command:kind === "create" ? {expectedCaseVersion:invoice.caseVersion,confirmed:true}
      : {expectedCaseVersion:invoice.caseVersion,invoiceId:invoice.invoiceId,confirmed:true}};
    const mine = epoch, body = JSON.stringify(pending.command), interaction = captureFocus(); pendingFocus = interaction; busy = true; enabled();
    message(kind === "create" ? "Creating the confirmed Sandbox draft. This does not send the invoice." : "Sending the confirmed Sandbox invoice. This does not confirm payment.");
    try {
      const result = await read("/api/invoices/creator/cases/" + caseId + "/" + kind,{method:"POST",headers:{"Content-Type":"application/json"},body});
      if (!active(mine)) return;
      const outcomes = kind === "create" ? ["reserved","draft_bound","already_bound","awaiting_reconciliation","retry_pending"]
        : ["reserved","already_recorded","delivery_observed","awaiting_reconciliation","retry_pending"];
      if (result?.environment !== "sandbox" || !outcomes.includes(result.outcome) || result.paymentConfirmed !== false || result.permissionGranted !== false) throw new Error("The invoice outcome is uncertain. Retry the same command or reload its recorded state.");
      pending = null;
      const note = ["awaiting_reconciliation","retry_pending","reserved"].includes(result.outcome)
        ? "The invoice attempt requires a current-state check or reconciliation. No repeat provider action is started automatically."
        : kind === "create" ? "The Sandbox draft is recorded. Confirm sending separately." : "Sandbox delivery is recorded. Payment and permission remain independently verified.";
      await load(note,interaction,"invoice");
    } catch (error) { failure(error,mine,kind,interaction); }
  }
  recoveryForm.addEventListener("submit",async event => {
    event.preventDefault();
    if (busy || !view || !recovery || !recovery.action || recoveryForm.hidden || !recoveryCheck.checked || Date.now() >= deadline || document.hidden
      || (pending && pending.kind !== "recovery")) return;
    if (!pending) pending = Object.freeze({kind:"recovery",prior:Object.freeze({...recovery}),command:Object.freeze({
      expectedCaseVersion:recovery.caseVersion,operationId:recovery.operationId,sourceHash:recovery.sourceHash,action:recovery.action,confirmed:true})});
    const mine = epoch, command = pending.command, prior = pending.prior, body = JSON.stringify(command), interaction = captureFocus(); pendingFocus = interaction;
    busy = true; enabled(); message("Applying the confirmed recovery action to this exact invoice attempt. Wait for its recorded outcome.");
    try {
      const result = await read("/api/invoices/creator/cases/" + caseId + "/recover",{method:"POST",headers:{"Content-Type":"application/json"},body});
      if (!active(mine)) return;
      validateRecoveryResult(result,prior,command); pending = null;
      const note = ["awaiting_reconciliation","retry_pending"].includes(result.outcome)
        ? "The invoice outcome remains unconfirmed. Review the saved state before confirming any further recovery action."
        : ["draft_bound","already_bound"].includes(result.outcome) ? "The existing Sandbox draft is recorded. Review and confirm sending separately."
        : "Sandbox delivery is recorded. Payment and permission remain independently verified.";
      await load(note,interaction,"invoice");
    } catch (error) { failure(error,mine,"recovery",interaction); }
  });
  createForm.addEventListener("submit",event => invoiceCommand(event,"create")); sendForm.addEventListener("submit",event => invoiceCommand(event,"send"));
  check.addEventListener("change",enabled);
  select.addEventListener("change",() => { if (!pending) { check.checked = false; decisionErrors.clear(); } enabled(); });
  reason.addEventListener("input",() => { if (!pending) { check.checked = false; decisionErrors.clear("reason"); } enabled(); });
  createCheck.addEventListener("change",enabled); sendCheck.addEventListener("change",enabled); recoveryCheck.addEventListener("change",enabled); reload.addEventListener("click",() => load("",captureFocus()));
  document.addEventListener("visibilitychange",() => { if (document.hidden) lock(); }); window.addEventListener("pagehide",() => lock());
  window.addEventListener("pageshow",event => { if (event.persisted) lock(); }); load();
})();`;
