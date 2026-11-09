import { FORM_ACCESSIBILITY_CLIENT } from "./form-accessibility-client";
import { REQUEST_DEADLINE_CLIENT } from "./request-deadline-client";

/** A review capability lives only in this closure. The URL fragment is erased before I/O. */
export const BUYER_REVIEW_CLIENT = String.raw`"use strict";
(() => {` + FORM_ACCESSIBILITY_CLIENT + REQUEST_DEADLINE_CLIENT + String.raw`
  const status = document.getElementById("status"), content = document.getElementById("offer"),
    accessForm = document.getElementById("access-form"), code = document.getElementById("access-code"),
    form = document.getElementById("acceptance-form"), check = document.getElementById("acknowledge"),
    submit = document.getElementById("accept"), reload = document.getElementById("reload"),
    copy = document.getElementById("consent-copy"), panel = document.getElementById("buyer-status-panel"),
    buyerStatus = document.getElementById("buyer-status"), paymentStatus = document.getElementById("payment-status"),
    permissionStatus = document.getElementById("permission-status"), receiptStatus = document.getElementById("receipt-status"),
    statusDetails = document.getElementById("status-details"), refreshPayment = document.getElementById("refresh-payment"),
    paymentHandoff = document.getElementById("payment-handoff"), verificationLink = document.getElementById("verification-link"),
    privateReceipt = document.getElementById("read-receipt"), openClarification = document.getElementById("open-clarification"),
    accessError = document.getElementById("access-error");
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const CAP = /^[A-Za-z0-9_-]{43}$/;
  const INVOICE = /^INV2-[A-Za-z0-9-]{3,100}$/;
  const receiptStates = ["active","scheduled","expired","refunded","revoked","pending_payment","pending_receipt","canceled","rejected","review_required","invalid","not_found","unavailable"];
  const verifiedStates = ["active","scheduled","expired","refunded","revoked"];
  const invoiceStates = ["create_pending","draft","send_pending","sent","paid","canceled","fully_refunded","reconciliation_required"];
  const providerStates = ["DRAFT","SENT","SCHEDULED","UNPAID","PAID","MARKED_AS_PAID","CANCELLED","REFUNDED","PARTIALLY_PAID","PARTIALLY_REFUNDED","MARKED_AS_REFUNDED","PAYMENT_PENDING","AUTO_CANCELLED","PAID_EXTERNAL","REFUNDED_EXTERNAL","SHARED","UNKNOWN"];
  const labels = {use_purpose:"Use purpose",channels:"Channels",paid_advertising:"Paid advertising",territories:"Territory",start_date:"Start date",duration_days:"Duration (days)",max_impressions:"Maximum impressions",exclusivity:"Exclusivity",modification_scope:"Modifications",attribution:"Attribution",sublicensing:"Sublicensing",ai_use:"AI use"};
  const names = {commercial:"Commercial",instagram_paid:"Instagram paid ads",facebook_paid:"Facebook paid ads",US:"United States",CA:"Canada",non_exclusive:"Non-exclusive",crop_only:"Crop only",none:"No modifications",required:"Required",not_required:"Not required",prohibited:"Prohibited",awaiting_creator:"Awaiting creator decision",awaiting_buyer:"Ready for your acceptance",accepted_awaiting_invoice:"Acceptance recorded; invoice not yet created",billing_started:"Acceptance recorded; billing started",rejected:"Rejected",canceled:"Canceled",clarification_required:"Revised terms required"};
  const CONSENT = "I accept the exact displayed licensing rights, restrictions, dates, and USD price approved by the creator. This Sandbox acceptance does not confirm payment or grant permission. Permission requires independently verified payment and an eligible licensing period.";
  const REOPEN = "Reopen your original review link or enter your private review code to check the current record.";
  let token = "", view = null, pending = null, controller = null, timer = null, epoch = 0, deadline = 0, busy = false, pendingFocus = null;
  let currentStatus = null, statusDeadline = 0, statusTimer = null, statusEpoch = 0,
    handoffDeadline = 0, handoffTimer = null, pendingHandoff = null, handoffUrl = null;
  function message(text) { status.textContent = text; }
  function clearAccessError() { code.removeAttribute("aria-invalid"); if (accessError) { accessError.textContent = ""; accessError.hidden = true; } }
  function accessIssue(text,interaction) {
    code.setAttribute("aria-invalid","true"); if (accessError) { accessError.textContent = text; accessError.hidden = false; }
    message(text); focusAfterInteraction(interaction,code);
  }
  function clear() {
    clearStatus();
    view = null; deadline = 0; content.replaceChildren(); copy.textContent = "";
    form.hidden = true; check.checked = false; check.disabled = true; submit.disabled = true; openClarification.disabled = true;
    clearTimeout(timer); timer = null;
  }
  function lock(text = "Private review cleared. Reopen your original review link or enter your private review code.",interaction = null) {
    const focus = interaction ?? captureFocusWithin(content,form,panel,reload,openClarification,document.getElementById("offer-title")) ?? pendingFocus;
    epoch++; controller?.abort(); controller = null; token = ""; pending = null; busy = false;
    clear(); pendingFocus = null; clearAccessError(); code.value = ""; accessForm.hidden = false; reload.disabled = true; message(text); focusAfterInteraction(focus,code);
  }
  function active(mine) { return mine === epoch && !document.hidden && Date.now() < deadline; }
  function enabled() {
    submit.disabled = busy || !view || view.stage !== "awaiting_buyer" || !check.checked || Date.now() >= deadline;
    check.disabled = busy || !!pending || !view || view.stage !== "awaiting_buyer" || Date.now() >= deadline;
    reload.disabled = busy || !token;
    openClarification.disabled = busy || !token || Date.now() >= deadline;
    refreshPayment.disabled = busy || !view || !currentStatus || !currentStatus.canRequestPaymentLink || Date.now() >= statusDeadline || Date.now() >= deadline;
    privateReceipt.disabled = busy || !currentStatus?.receipt.canReadPrivate || Date.now() >= statusDeadline || Date.now() >= deadline;
  }
  async function read(path, init = {}) {
    return readJsonWithDeadline(path, {credentials:"omit",mode:"same-origin",redirect:"error",cache:"no-store",referrerPolicy:"no-referrer",signal:controller?.signal,...init,
      headers:{Accept:"application/json",Authorization:"Bearer " + token,...init.headers}},{
      timeoutMessage:path === "/api/invoices/buyer/handoff"
        ? "The payment check timed out. Its outcome is uncertain. Retry this payment check or reload the current record. No payment or permission is confirmed by this check."
        : init.method === "POST"
        ? "The acceptance timed out before its saved outcome could be confirmed. Retry the same acceptance or reload its recorded state."
        : path === "/api/invoices/buyer/status"
        ? "The payment and receipt status check timed out. Reload to check the current record."
        : "The offer check timed out. Reopen your original review link or enter your private review code to check the current record.",
      checkResponse(response) {
        if (!response.ok) {
          const error = new Error(response.status === 401 || response.status === 403 || response.status === 404
            ? "This private review link is unavailable or expired. Request a current link from the creator."
            : response.status === 409 ? "The offer changed or is locked. Reload the current offer before accepting."
            : response.status === 429 ? "Too many requests. Wait before trying again."
            : "The request could not be completed. Its recorded outcome must be checked before continuing.");
          error.status = response.status; throw error;
        }
        if (!(response.headers.get("content-type") || "").includes("application/json")) throw new Error("A valid offer response is required.");
      }
    });
  }
  function safeText(value, max) { return typeof value === "string" && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value); }
  function isoDate(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value; }
  function subset(value, allowed) { return Array.isArray(value) && value.length > 0 && value.length <= allowed.length && new Set(value).size === value.length && value.every(x => allowed.includes(x)); }
  function validate(v) {
    const r = v?.rights;
    if (v?.schemaVersion !== "human-consent-view-v1" || v.environment !== "sandbox" || !UUID.test(v.caseId) || !UUID.test(v.termsVersionId) || !UUID.test(v.quoteId)
      || !Number.isSafeInteger(v.caseVersion) || v.caseVersion < 1 || !/^[0-9a-f]{64}$/.test(v.reviewHash)
      || !Object.prototype.hasOwnProperty.call(names,v.stage) || !["awaiting_creator","awaiting_buyer","accepted_awaiting_invoice","billing_started","rejected","canceled","clarification_required"].includes(v.stage)
      || (v.creatorDecisionId !== null && !UUID.test(v.creatorDecisionId))
      || (["awaiting_buyer","accepted_awaiting_invoice","billing_started"].includes(v.stage) && !UUID.test(v.creatorDecisionId))
      || v.currency !== "USD" || !Number.isSafeInteger(v.amountCents) || v.amountCents < 1 || v.amountCents > 1000000000
      || v.paymentConfirmed !== false || v.permissionGranted !== false || v.buyerCopyVersion !== "buyer-license-acceptance-v1" || v.buyerCopy !== CONSENT
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
      || v.lineItems.reduce((sum,l) => sum + l.amountCents,0) !== v.amountCents) throw new Error("The complete licensing offer could not be validated. Request a current review from the creator.");
  }
  const readable = value => typeof value === "number" ? value.toLocaleString("en-US") : names[value] ?? value;
  const money = value => (value/100).toLocaleString("en-US",{style:"currency",currency:"USD"});
  function row(label,value,target = content) {
    const box = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd");
    dt.textContent = label; dd.textContent = String(value); box.append(dt,dd); target.append(box);
  }
  function render(v) {
    validate(v); view = v; content.replaceChildren();
    row("Asset",v.asset.title); row("Creator",v.asset.creator); row("Stage",readable(v.stage)); row("Price",money(v.amountCents) + " (Sandbox)");
    for (const [field,label] of Object.entries(labels)) {
      const value = v.rights[field]; row(label,Array.isArray(value) ? value.map(readable).join(", ") : typeof value === "boolean" ? (value ? "Yes" : "No") : readable(value));
    }
    row("Last permitted date (UTC)",v.period.lastPermittedDate); row("End date (exclusive, UTC)",v.period.endDateExclusive);
    for (const line of v.lineItems) row(line.description,money(line.amountCents));
    copy.textContent = v.buyerCopy; check.checked = false; form.hidden = v.stage !== "awaiting_buyer"; submit.textContent = "Accept these exact terms"; enabled();
  }
  function instant(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
      || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error("Current status time could not be validated.");
    return Date.parse(value);
  }
  function clearPayment(text = "") {
    clearTimeout(handoffTimer); handoffTimer = null; handoffDeadline = 0; handoffUrl = null;
    paymentHandoff.hidden = true; paymentHandoff.removeAttribute("href");
    if (text) paymentStatus.textContent = text;
  }
  function clearStatus() {
    statusEpoch++; clearTimeout(statusTimer); statusTimer = null; statusDeadline = 0; currentStatus = null; pendingHandoff = null;
    clearPayment(); panel.hidden = true; buyerStatus.textContent = ""; paymentStatus.textContent = "";
    permissionStatus.textContent = ""; receiptStatus.textContent = ""; statusDetails.replaceChildren();
    verificationLink.hidden = true; verificationLink.removeAttribute("href"); privateReceipt.hidden = true;
    refreshPayment.disabled = true; privateReceipt.disabled = true;
  }
  function staleStatus(text = "Status expired. Reload the current offer to check payment and permission again.",interaction = null) {
    const focus = interaction || captureFocusWithin(panel);
    clearStatus(); panel.hidden = false; buyerStatus.textContent = text;
    permissionStatus.textContent = "No current permission status is being asserted."; enabled(); focusAfterInteraction(focus,reload);
  }
  function publicPath(value) {
    return typeof value === "string" && /^\/verify\/receipt\/[A-Za-z0-9_-]{32}$/.test(value)
      && !/^\d+$/.test(value.slice("/verify/receipt/".length));
  }
  function validateStatus(v) {
    const r = v?.receipt;
    if (v?.schemaVersion !== "buyer-invoice-status-v1" || v.environment !== "sandbox" || !UUID.test(v.caseId) || !Number.isSafeInteger(v.caseVersion) || v.caseVersion < 1
      || !["awaiting_creator","awaiting_buyer","accepted_awaiting_invoice","billing_started","rejected","canceled","clarification_required"].includes(v.stage)
      || (view && (v.caseId !== view.caseId || v.caseVersion !== view.caseVersion || v.stage !== view.stage))
      || (v.invoiceId !== null && !INVOICE.test(v.invoiceId)) || (v.invoiceStatus !== null && !invoiceStates.includes(v.invoiceStatus))
      || (v.invoiceStatus === null && v.invoiceId !== null) || (v.invoiceStatus === "create_pending" && v.invoiceId !== null)
      || (v.invoiceStatus !== null && v.invoiceStatus !== "create_pending" && !INVOICE.test(v.invoiceId))
      || typeof v.canRequestPaymentLink !== "boolean" || !r || !receiptStates.includes(r.status)
      || !["verified","not_verified"].includes(r.integrity) || typeof r.canReadPrivate !== "boolean"
      || r.privatePath !== (r.canReadPrivate ? "/receipts/buyer" : null)
      || (r.publicVerificationPath !== null && !publicPath(r.publicVerificationPath))
      || (verifiedStates.includes(r.status) !== (r.integrity === "verified"))
      || (["active","scheduled","expired"].includes(r.status) && v.invoiceStatus !== "paid")
      || (r.status === "refunded" && v.invoiceStatus !== "fully_refunded")
      || (r.integrity !== "verified" && (r.record !== null || r.canReadPrivate))
      || (v.canRequestPaymentLink && (v.stage !== "billing_started" || v.invoiceStatus !== "sent" || !INVOICE.test(v.invoiceId)
        || r.integrity !== "not_verified" || !["pending_payment","unavailable"].includes(r.status)))) throw new Error("The payment status does not match the current offer. Reload to check its current record.");
    const checked = instant(v.checkedAt), receiptChecked = instant(r.checkedAt);
    if (receiptChecked > checked || checked - receiptChecked > 60000) throw new Error("Receipt status is stale. Reload to check the current record.");
    const nextUtcDay = (Math.floor(receiptChecked / 86400000) + 1) * 86400000;
    let lifetime = Math.min(60000 - (checked - receiptChecked),nextUtcDay - checked);
    if (r.integrity === "verified") {
      const record = r.record, timing = record?.timing, period = record?.period;
      if (!record || !Number.isSafeInteger(record.revision) || record.revision < 1 || !/^[0-9a-f]{64}$/.test(record.sha256)
        || !safeText(record.asset?.title,200) || !safeText(record.asset?.type,40) || !/^[0-9a-f]{64}$/.test(record.asset?.fingerprint)
        || !timing || timing.phase !== r.status || !["starts_later","in_effect","expires_soon","last_day","ended","not_active"].includes(timing.notice)
        || !period || !isoDate(period.startDate) || !isoDate(period.endDateExclusive) || !isoDate(period.lastPermittedDate)
        || Date.parse(period.endDateExclusive) - Date.parse(period.startDate) < 86400000
        || Date.parse(period.endDateExclusive) - Date.parse(period.startDate) > 365 * 86400000
        || Date.parse(period.endDateExclusive) - Date.parse(period.lastPermittedDate) !== 86400000
        || (view && (period.startDate !== view.period.startDate || period.endDateExclusive !== view.period.endDateExclusive || period.lastPermittedDate !== view.period.lastPermittedDate))
        || timing.lastPermittedDate !== period.lastPermittedDate
        || timing.startsAt !== period.startDate + "T00:00:00.000Z" || timing.expiresAt !== period.endDateExclusive + "T00:00:00.000Z"
        || instant(timing.checkedAt) !== receiptChecked || (timing.daysRemaining !== null && (!Number.isSafeInteger(timing.daysRemaining) || timing.daysRemaining < 0))) throw new Error("The verified receipt does not match the displayed licensing offer.");
      const start = instant(timing.startsAt), end = instant(timing.expiresAt);
      if ((r.status === "active" && !(receiptChecked >= start && receiptChecked < end))
        || (r.status === "scheduled" && !(receiptChecked < start)) || (r.status === "expired" && receiptChecked < end)) throw new Error("The licensing time state is inconsistent. Refresh the record.");
      if (timing.nextBoundaryAt !== null) {
        const next = instant(timing.nextBoundaryAt);
        if ((r.status === "active" && next !== end) || (r.status === "scheduled" && next !== start)
          || !["active","scheduled"].includes(r.status)) throw new Error("The licensing boundary could not be validated.");
        lifetime = Math.min(lifetime,next - checked);
      } else if (["active","scheduled"].includes(r.status)) throw new Error("The licensing boundary is missing.");
    }
    return lifetime;
  }
  const permissionCopy = {
    active:"Active in Sandbox at the displayed check time. Refresh before relying on this record.",
    scheduled:"Scheduled in Sandbox. The recorded permission is not active yet.",
    expired:"Expired. The recorded licensing period has ended and does not permit continued use.",
    refunded:"Refunded. A full refund is recorded and the associated permission is not active.",
    revoked:"Revoked. This permission is not active. Revocation does not itself establish a refund.",
    pending_payment:"Payment is not confirmed. An approval or invoice does not grant permission.",
    pending_receipt:"Receipt pending. No current verified permission receipt is available.",
    canceled:"Canceled. No active permission is verified.", rejected:"Rejected. No permission is verified.",
    review_required:"Review required. Current payment or licensing records need reconciliation; no active permission is verified.",
    invalid:"Record could not be verified. Do not rely on an earlier receipt.",
    not_found:"No verification record is available for this offer.", unavailable:"Receipt verification is unavailable. No current permission is verified."
  };
  function renderStatus(v,started) {
    const lifetime = validateStatus(v), remaining = Math.min(lifetime - (Date.now() - started),deadline - Date.now());
    clearStatus(); panel.hidden = false;
    if (remaining <= 0) { staleStatus(); return; }
    currentStatus = v; statusDeadline = Date.now() + remaining;
    const r = v.receipt, descriptions = {create_pending:"Draft creation needs reconciliation",draft:"Sandbox draft created; not sent",send_pending:"Sandbox delivery needs reconciliation",sent:"Sandbox invoice sent; current payment options require a fresh check",paid:"Payment recorded; permission is checked separately",canceled:"Invoice canceled",fully_refunded:"Full refund recorded",reconciliation_required:"Invoice reconciliation required"};
    buyerStatus.textContent = "Current saved record. Reload refreshes this record without contacting PayPal.";
    row("Invoice state",v.invoiceStatus ? descriptions[v.invoiceStatus] : "No Sandbox invoice created",statusDetails);
    if (v.invoiceId) row("Sandbox invoice reference",v.invoiceId,statusDetails);
    row("Checked at (UTC)",v.checkedAt,statusDetails);
    permissionStatus.textContent = permissionCopy[r.status];
    receiptStatus.textContent = r.integrity === "verified" ? "Receipt integrity is verified against the current record."
      : "No current verified receipt is available.";
    if (r.record) {
      row("Receipt revision",r.record.revision,statusDetails); row("Receipt SHA-256",r.record.sha256,statusDetails);
      row("Licensing period (UTC)",r.record.period.startDate + " through " + r.record.period.lastPermittedDate,statusDetails);
    }
    if (r.publicVerificationPath) { verificationLink.href = r.publicVerificationPath; verificationLink.hidden = false; }
    privateReceipt.hidden = !r.canReadPrivate;
    paymentStatus.textContent = !view ? "The exact offer is unavailable for a payment check. Current receipt access remains separate." : v.canRequestPaymentLink ? "Choose Check PayPal Sandbox payment link for a fresh, short-lived handoff. Checking does not pay the invoice."
      : "A payment link is not available from this saved state. Check the invoice and permission status above.";
    refreshPayment.textContent = "Check PayPal Sandbox payment link";
    statusTimer = setTimeout(() => staleStatus(),remaining); enabled();
  }
  async function loadStatus(mine) {
    const started = Date.now();
    try {
      const value = await read("/api/invoices/buyer/status"); if (!active(mine)) return;
      renderStatus(value,started);
    } catch (error) {
      if (!active(mine)) return;
      if ([401,403,404].includes(error.status) || error.code === "request_aborted") throw error;
      staleStatus(error.status === 503 ? "Payment and receipt status are unavailable in this environment. Eligible offer acceptance remains available."
        : error.message || "Current payment and permission status could not be checked. Reload the offer.");
    }
  }
  function checkedPaymentUrl(value) {
    if (typeof value !== "string" || value.length > 2048 || /[\s\\\x00-\x1f%]/.test(value)) throw new Error("The Sandbox payment link could not be validated.");
    const u = new URL(value);
    if (u.origin !== "https://www.sandbox.paypal.com" || u.username || u.password || u.search
      || !/^https:\/\/www\.sandbox\.paypal\.com\//.test(value)
      || !/^\/invoice\/(?:p\/|payerView\/details\/)[A-Za-z0-9/_-]*$/.test(u.pathname)
      || !/^(?:#[A-Za-z0-9_-]+)?$/.test(u.hash) || (u.pathname.endsWith("/") && !u.hash)) throw new Error("The Sandbox payment link could not be validated.");
    return u.href;
  }
  refreshPayment.addEventListener("click",async () => {
    if (busy || !view || !currentStatus?.canRequestPaymentLink || !active(epoch) || Date.now() >= statusDeadline) return;
    if (!pendingHandoff) pendingHandoff = {expectedCaseVersion:currentStatus.caseVersion,invoiceId:currentStatus.invoiceId,confirmed:true};
    const interaction = captureFocus(), mine = epoch, stamp = statusEpoch, identity = currentStatus, body = JSON.stringify(pendingHandoff), started = Date.now();
    pendingFocus = interaction;
    clearPayment("Checking the current Sandbox invoice. No payment or permission is confirmed by this check.");
    busy = true; enabled();
    try {
      const value = await read("/api/invoices/buyer/handoff",{method:"POST",headers:{"Content-Type":"application/json"},body});
      if (!active(mine)) return;
      if (stamp !== statusEpoch || Date.now() >= statusDeadline) { busy = false; enabled(); focusAfterInteraction(interaction,reload); return; }
      if (value?.schemaVersion !== "buyer-payment-handoff-v1" || value.environment !== "sandbox" || value.caseId !== view.caseId
        || value.caseVersion !== identity.caseVersion || value.invoiceId !== identity.invoiceId || !providerStates.includes(value.providerStatus)
        || typeof value.requiresReconciliation !== "boolean" || value.paymentConfirmed !== false || value.permissionGranted !== false
        || !Number.isFinite(value.expiresInMs) || value.expiresInMs < 0 || value.expiresInMs > 30000
        || (value.paymentUrl !== null && typeof value.paymentUrl !== "string")) throw new Error("The payment check did not match this exact invoice. Reload the current offer.");
      if (instant(value.observedAt) < instant(identity.checkedAt)) throw new Error("The payment observation predates the current record. Refresh the Sandbox check.");
      pendingHandoff = null; busy = false; enabled();
      if (!value.paymentUrl) {
        const detail = value.providerStatus === "PAID" ? "PayPal reports a paid invoice. A current verified receipt is still required before permission can be confirmed."
          : value.providerStatus === "REFUNDED" ? "PayPal reports a refund. The current refund and permission record must still be verified."
          : ["CANCELLED","AUTO_CANCELLED"].includes(value.providerStatus) ? "PayPal reports a canceled invoice. No payment link is offered."
          : "No payment link is currently available. Reload the saved record or wait for reconciliation.";
        clearPayment(detail); focusAfterInteraction(interaction,paymentStatus); return;
      }
      if (value.requiresReconciliation || !["SENT","UNPAID","SHARED"].includes(value.providerStatus)) throw new Error("The invoice requires reconciliation. A payment link cannot be offered.");
      const url = checkedPaymentUrl(value.paymentUrl);
      const remaining = Math.min(value.expiresInMs - (Date.now() - started),statusDeadline - Date.now(),deadline - Date.now());
      if (remaining <= 0) { clearPayment("The payment check expired before it could be displayed. Check the Sandbox invoice again."); focusAfterInteraction(interaction,refreshPayment); return; }
      handoffUrl = url; handoffDeadline = Date.now() + remaining; paymentHandoff.href = url; paymentHandoff.hidden = false;
      paymentStatus.textContent = "PayPal Sandbox currently reports this invoice as payable. Open PayPal only when ready. The link expires within 30 seconds; payment and permission are verified separately.";
      focusAfterInteraction(interaction,paymentHandoff);
      handoffTimer = setTimeout(() => {
        const focus = captureFocusWithin(paymentHandoff); clearPayment("Payment link expired. Check the Sandbox invoice again for a current link.");
        enabled(); focusAfterInteraction(focus,refreshPayment.disabled ? reload : refreshPayment);
      },remaining);
    } catch (error) {
      if (!active(mine)) return;
      busy = false;
      if ([401,403,404].includes(error.status)) { lock(error.message,interaction); return; }
      if ([400,409].includes(error.status)) staleStatus(error.message,interaction);
      else { clearPayment(error.message || "Payment check unavailable. Retry the same check or reload the current record."); refreshPayment.textContent = "Retry this payment check"; }
      enabled(); focusAfterInteraction(interaction,refreshPayment.disabled ? reload : refreshPayment);
    } finally { if (!busy && pendingFocus === interaction) pendingFocus = null; }
  });
  paymentHandoff.addEventListener("click",event => {
    if (busy || !active(epoch) || !currentStatus?.canRequestPaymentLink || Date.now() >= statusDeadline || Date.now() >= handoffDeadline || !handoffUrl
      || paymentHandoff.href !== handoffUrl) {
      event.preventDefault(); const interaction = captureFocus(); clearPayment("The payment link is no longer current. Check the Sandbox invoice again.");
      enabled(); focusAfterInteraction(interaction,refreshPayment.disabled ? reload : refreshPayment);
    }
  });
  verificationLink.addEventListener("click",event => {
    if (!active(epoch) || Date.now() >= statusDeadline || !currentStatus || !publicPath(currentStatus.receipt.publicVerificationPath)) event.preventDefault();
  });
  privateReceipt.addEventListener("click",() => {
    if (busy || !active(epoch) || Date.now() >= statusDeadline || !currentStatus?.receipt.canReadPrivate
      || currentStatus.receipt.privatePath !== "/receipts/buyer" || !CAP.test(token)) return;
    // Deliberate same-origin fragment transfer. Never retain a token-bearing href.
    location.assign("/receipts/buyer#" + token);
  });
  openClarification.addEventListener("click",() => {
    if (busy || !active(epoch) || !CAP.test(token) || document.hidden) return;
    location.assign("/buyer/clarification#" + token);
  });
  async function load(note = "",interaction = null) {
    if (!CAP.test(token) || document.hidden) { lock(); return; }
    pendingFocus = interaction;
    const mine = ++epoch; controller?.abort(); controller = new AbortController(); clear(); pending = null; busy = true;
    code.value = ""; accessForm.hidden = true; deadline = Date.now() + 300000; enabled();
    timer = setTimeout(() => lock("Review expired. Reopen your private link to check the latest offer."),300000);
    message("Loading the creator-approved rights and exact price.");
    try {
      let current = null;
      try {
        current = await read("/api/consent/buyer/review"); if (!active(mine)) return;
        render(current);
      } catch (error) {
        if (!active(mine)) return;
        if ([401,403,404].includes(error.status) || ["request_timeout","request_aborted"].includes(error.code)) throw error;
        // Archived assets or changed policy can block prepayment review while a
        // current canonical receipt remains independently readable.
        current = null; view = null; content.replaceChildren(); form.hidden = true; copy.textContent = "";
      }
      await loadStatus(mine); if (!active(mine)) return; busy = false; enabled();
      if (!current) { message((note ? note + " " : "") + "The exact offer is unavailable for acceptance. Current payment and receipt checks appear below."); focusAfterInteraction(interaction,document.getElementById("buyer-status-title")); return; }
      const state = current.stage === "awaiting_buyer" ? "Review every right, date and price before checking the acceptance statement."
        : ["accepted_awaiting_invoice","billing_started"].includes(current.stage) ? "Your acceptance is recorded. Payment and permission are still separate steps."
        : "This offer is not available for acceptance. The creator must resolve its current state.";
      message(note ? note + " " + state : state);
      focusAfterInteraction(interaction,["accepted_awaiting_invoice","billing_started"].includes(current.stage)
        ? document.getElementById("buyer-status-title") : document.getElementById("offer-title"));
    } catch (error) {
      if (mine !== epoch) return;
      const detail = [401,403,404].includes(error?.status) || ["request_timeout","request_aborted"].includes(error?.code)
        ? error.message : "The private review could not be completed. " + REOPEN;
      lock((note ? note + " " : "") + (detail || "Private review cleared. " + REOPEN),interaction);
    } finally { if (!busy && pendingFocus === interaction) pendingFocus = null; }
  }
  accessForm.addEventListener("submit",event => {
    event.preventDefault(); const interaction = captureFocus(), entered = code.value.trim(); code.value = ""; clearAccessError();
    if (!CAP.test(entered)) { accessIssue("Enter the 43-character private review code from your creator link.",interaction); return; }
    token = entered; load("",interaction);
  });
  form.addEventListener("submit",async event => {
    event.preventDefault(); if (busy || !view || view.stage !== "awaiting_buyer" || !check.checked || Date.now() >= deadline || document.hidden) return;
    if (!pending) pending = {requestId:crypto.randomUUID(),expectedCaseVersion:view.caseVersion,termsVersionId:view.termsVersionId,
      quoteId:view.quoteId,reviewHash:view.reviewHash,creatorDecisionId:view.creatorDecisionId,acknowledged:true,copyVersion:view.buyerCopyVersion};
    const interaction = captureFocus(), mine = epoch, body = JSON.stringify(pending); pendingFocus = interaction; busy = true; enabled(); message("Recording your explicit acceptance. Wait for the current record before continuing.");
    try {
      const result = await read("/api/consent/buyer/accept",{method:"POST",headers:{"Content-Type":"application/json"},body});
      if (!active(mine)) return;
      if (!["recorded","replayed"].includes(result?.outcome) || !UUID.test(result.resultId) || result.paymentConfirmed !== false || result.permissionGranted !== false) throw new Error("The acceptance outcome is uncertain. Retry the same acceptance or reload its recorded state.");
      pending = null; await load("Acceptance recorded by the server.",interaction);
    } catch (error) {
      if (!active(mine)) return;
      busy = false;
      if ([401,403,404].includes(error.status)) { lock(error.message,interaction); return; }
      if ([400,409].includes(error.status)) {
        lock((error.status === 409 ? "The offer changed or is locked. " : "This acceptance could not be confirmed. ") + REOPEN,interaction); return;
      }
      submit.textContent = "Retry the same acceptance";
      enabled(); message(error.message || "Outcome uncertain. Retry the same acceptance or reload its recorded state.");
      focusAfterInteraction(interaction,pending ? submit : reload);
    } finally { if (!busy && pendingFocus === interaction) pendingFocus = null; }
  });
  check.addEventListener("change",enabled); reload.addEventListener("click",() => load("",captureFocus()));
  code.addEventListener("input",clearAccessError);
  document.addEventListener("visibilitychange",() => { if (document.hidden) lock(); });
  window.addEventListener("pagehide",() => lock()); window.addEventListener("pageshow",event => { if (event.persisted) lock(); });
  let fragment = location.hash.slice(1);
  try { if (location.hash) history.replaceState(null,"",location.pathname); }
  catch { lock("The private link could not be cleared safely. Reopen this page without a link and enter your review code."); return; }
  if (CAP.test(fragment) && !document.hidden) { token = fragment; fragment = ""; load(); }
  else { const invalid = !!fragment; fragment = ""; lock(invalid ? "This review link is invalid. Request a current private link from the creator." : undefined); }
})();`;
