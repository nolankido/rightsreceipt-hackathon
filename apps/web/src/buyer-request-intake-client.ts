import { REQUEST_INTAKE_CLIENT_COMMON } from "./request-intake-client-common";
import { FORM_ACCESSIBILITY_CLIENT } from "./form-accessibility-client";
import { REQUEST_DEADLINE_CLIENT } from "./request-deadline-client";

/** The private code, original form input, and frozen pending command live only in this closure. */
export const BUYER_REQUEST_INTAKE_CLIENT = String.raw`"use strict";
(() => {` + REQUEST_INTAKE_CLIENT_COMMON + FORM_ACCESSIBILITY_CLIENT + REQUEST_DEADLINE_CLIENT + String.raw`
  const status = document.getElementById("status"), accessForm = document.getElementById("access-form"), code = document.getElementById("access-code"),
    reload = document.getElementById("reload"), openClarification = document.getElementById("open-clarification"), panel = document.getElementById("asset-panel"),
    details = document.getElementById("asset-details"), form = document.getElementById("intake-form"), confirmation = document.getElementById("consent-confirm"),
    save = document.getElementById("submit-request"), copy = document.getElementById("request-copy"), counter = document.getElementById("intended-use-count"),
    errors = document.getElementById("form-errors"), errorList = document.getElementById("error-list"), submittedPanel = document.getElementById("submitted-panel"),
    submittedDetails = document.getElementById("submitted-details"), originalRequest = document.getElementById("original-request"), resumeHelp = document.getElementById("resume-help");
  const inputs = {buyerName:document.getElementById("buyer-name"),buyerOrganization:document.getElementById("buyer-organization"),
    buyerEmail:document.getElementById("buyer-email"),intendedUseText:document.getElementById("intended-use"),consentAcknowledged:confirmation};
  const issues = formErrors(errors,errorList,inputs,"intake"), accessError = document.getElementById("access-error");
  let token = null, view = null, pending = null, busy = false, epoch = 0, deadline = 0, timer = null, controller = null, pendingFocus = null;
  function message(value,state = "ready") { status.textContent = value; status.dataset.state = state; }
  function clearErrors() { issues.clear(); }
  function clearAccessError() { code.removeAttribute("aria-invalid"); if (accessError) { accessError.textContent = ""; accessError.hidden = true; } }
  function accessIssue(value,interaction) {
    code.setAttribute("aria-invalid","true"); if (accessError) { accessError.textContent = value; accessError.hidden = false; }
    message(value,"error"); focusAfterInteraction(interaction,code);
  }
  function privateFocus() {
    return captureFocusWithin(panel,form,submittedPanel,reload,openClarification);
  }
  function clear() {
    view = null; deadline = 0; clearTimeout(timer); timer = null; panel.hidden = true; form.hidden = true; submittedPanel.hidden = true;
    details.replaceChildren(); submittedDetails.replaceChildren(); originalRequest.textContent = ""; copy.textContent = ""; resumeHelp.textContent = "";
    for (const [key,field] of Object.entries(inputs)) { if (key !== "consentAcknowledged") field.value = ""; field.disabled = true; }
    confirmation.checked = false; save.disabled = true; openClarification.disabled = true; save.textContent = "Submit my request";
    counter.textContent = "0 of 4,000 characters"; openClarification.textContent = "Continue to clarification"; clearErrors();
  }
  function lock(value = "Private request cleared. Reopen your original link or enter your code again.",state = "cleared",interaction = null) {
    const focus = interaction ?? privateFocus() ?? pendingFocus;
    epoch++; controller?.abort(); controller = null; token = null; pending = null; busy = false; code.value = ""; clear();
    pendingFocus = null; clearAccessError(); reload.disabled = true; accessForm.hidden = false; message(value,state); focusAfterInteraction(focus,code);
  }
  function active(mine) { return mine === epoch && !document.hidden && !!token && Date.now() < deadline; }
  function enabled() {
    const locked = busy || !view || !token || Date.now() >= deadline;
    for (const field of Object.values(inputs)) field.disabled = locked || !!pending || !!view?.alreadySubmitted;
    save.disabled = locked || form.hidden || !!view?.alreadySubmitted || !confirmation.checked;
    openClarification.disabled = locked || !view?.alreadySubmitted || !view?.nextPath; reload.disabled = !token || busy;
  }
  async function read(path,init = {}) {
    return readJsonWithDeadline(path,{credentials:"omit",mode:"same-origin",redirect:"error",cache:"no-store",referrerPolicy:"no-referrer",signal:controller?.signal,...init,
      headers:{Accept:"application/json",Authorization:"Bearer " + token,"X-Requested-With":"XMLHttpRequest",...init.headers}},{
      timeoutMessage:init.method === "POST"
        ? "The request timed out before its saved outcome could be confirmed. Retry this same request or reload its recorded state."
        : "The private request check timed out. Reopen your original link or enter your code again to check the current record.",
      checkResponse(response) {
        if (!response.ok) {
          const error = new Error([401,403,404].includes(response.status) ? "This private request link is unavailable. Ask the creator for a current link."
            : response.status === 409 ? "This request changed or was already submitted. Reopen your private link to load its recorded state."
            : response.status === 400 || response.status === 422 ? "The request could not be accepted. Reopen your link and check the original request details."
            : response.status === 429 ? "Too many requests. Wait before retrying this same request."
            : "The saved outcome is uncertain. Retry this same request or reload its recorded state.");
          error.status = response.status; throw error;
        }
        if (!(response.headers.get("content-type") || "").includes("application/json")) throw new Error("A private JSON response is required. Retry the same request or reload its recorded state.");
      }
    });
  }
  function render(v) {
    validateBuyerReview(v); view = v; panel.hidden = false; assetRows(details,v.asset); copy.textContent = v.copy;
    form.hidden = v.alreadySubmitted; submittedPanel.hidden = !v.alreadySubmitted; confirmation.checked = false;
    openClarification.textContent = v.nextPath === null ? "Further review unavailable" : v.nextPath === "/buyer/review" ? "Continue to current offer and status" : "Continue to clarification";
    resumeHelp.textContent = v.nextPath === null ? "This image is no longer available for new rights review. Your original request remains recorded."
      : v.nextPath === "/buyer/review" ? "Continue to review the current offer, invoice, payment, or receipt status. Each action still requires its own checks and confirmation."
      : "Continue to clarification to provide any open details. The creator separately reviews the evidence and all twelve rights fields.";
    if (v.originalRequest) {
      const r = v.originalRequest;
      row(submittedDetails,"Your name",r.buyerName); row(submittedDetails,"Organization",r.buyerOrganization); row(submittedDetails,"Email address",r.buyerEmail);
      row(submittedDetails,"Submitted",r.submittedAt.replace("T"," ").replace(".000Z"," UTC")); originalRequest.textContent = r.intendedUseText;
    }
  }
  async function load(note = "",interaction = null) {
    if (!token || document.hidden) { lock(); return; }
    pendingFocus = interaction;
    const mine = ++epoch; controller?.abort(); controller = new AbortController(); clear(); pending = null; busy = true; reload.disabled = true;
    message("Checking your private link and the current request.","loading"); const started = Date.now();
    try {
      const current = await read("/api/intake/buyer/review");
      if (mine !== epoch || document.hidden || !token) return;
      validateBuyerReview(current);
      const remaining = Math.min(300000,Date.parse(current.accessExpiresAt) - Date.parse(current.checkedAt)) - (Date.now() - started);
      if (remaining <= 0) { lock("This private link expired while loading. Ask the creator for a current link.","error",interaction); return; }
      deadline = Date.now() + remaining; timer = setTimeout(() => lock("Private request view expired. Reopen your original link before continuing."),remaining);
      render(current); accessForm.hidden = true; busy = false; enabled();
      message((note ? note + " " : "") + (current.alreadySubmitted ? current.nextPath === null ? "This image is no longer available for new rights review. Your original request remains recorded."
        : current.nextPath === "/buyer/review" ? "Your original request is recorded. Continue to the current offer and status when you are ready." : "Your original request is recorded. Continue to clarification when you are ready."
        : "Enter your details and intended use, then read and confirm the request statement."),current.alreadySubmitted ? "submitted" : "ready");
      focusAfterInteraction(interaction,current.alreadySubmitted ? document.getElementById("submitted-title") : inputs.buyerName);
    } catch (error) { if (mine === epoch) lock((note ? note + " " : "") + (error.message || "Private request unavailable."),"error",interaction); }
    finally { if (!busy && pendingFocus === interaction) pendingFocus = null; }
  }
  function open(value,interaction) {
    lock("");
    if (!TOKEN.test(value)) { accessIssue("Enter the complete 43-character private code from your link.",interaction); return; }
    token = value; accessForm.hidden = true; load("",interaction);
  }
  function entered() { return {buyerName:inputs.buyerName.value.trim(),buyerOrganization:inputs.buyerOrganization.value.trim(),buyerEmail:inputs.buyerEmail.value.trim(),
    intendedUseText:inputs.intendedUseText.value,consentAcknowledged:confirmation.checked}; }
  function displayIssues(found) {
    issues.show(found); message("Check the highlighted request details before submitting.","error");
  }
  form.addEventListener("submit",async event => {
    event.preventDefault();
    if (busy || !view || !token || form.hidden || view.alreadySubmitted || !confirmation.checked || Date.now() >= deadline || document.hidden) return;
    if (!pending) {
      const input = entered(), issues = inputIssues(input);
      if (issues.length) { displayIssues(issues); return; }
      clearErrors(); pending = Object.freeze({requestId:crypto.randomUUID(),expectedCaseVersion:view.caseVersion,reviewHash:view.reviewHash,...input,copyVersion:view.copyVersion});
    }
    const interaction = captureFocus(), mine = epoch, prior = view, command = pending; pendingFocus = interaction; busy = true; enabled(); message("Recording your original licensing request.","submitting");
    try {
      const result = await read("/api/intake/buyer/request",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(command)});
      if (!active(mine)) return;
      validateSubmitted(result,prior,command); pending = null; await load("Your request was recorded by the server.",interaction);
    } catch (error) {
      if (!active(mine)) return;
      if ([400,401,403,404,409,422].includes(error.status)) { lock(error.message,"error",interaction); return; }
      busy = false; save.textContent = "Retry this same request"; enabled();
      message(error.message || "The saved outcome is uncertain. Retry this same request or reload its recorded state.","uncertain");
      focusAfterInteraction(interaction,save);
    } finally { if (!busy && pendingFocus === interaction) pendingFocus = null; }
  });
  for (const [key,field] of Object.entries(inputs)) {
    if (key === "consentAcknowledged") continue;
    field.addEventListener("input",() => {
      confirmation.checked = false; issues.clear(key); counter.textContent = [...inputs.intendedUseText.value].length.toLocaleString("en-US") + " of 4,000 characters"; enabled();
    });
  }
  confirmation.addEventListener("change",enabled); reload.addEventListener("click",() => load("",captureFocus()));
  code.addEventListener("input",clearAccessError);
  accessForm.addEventListener("submit",event => { event.preventDefault(); const interaction = captureFocus(), value = code.value.trim(); code.value = ""; open(value,interaction); });
  openClarification.addEventListener("click",() => {
    if (!active(epoch) || busy || !view?.alreadySubmitted || !view.nextPath || !token) return;
    const destination = view.nextPath + "#" + token; lock(); window.location.assign(destination);
  });
  document.addEventListener("visibilitychange",() => { if (document.hidden) lock(); });
  window.addEventListener("pagehide",() => lock()); window.addEventListener("pageshow",event => { if (event.persisted) lock(); });
  let fragment = window.location.hash.slice(1);
  try { if (window.location.hash) history.replaceState(null,"",window.location.pathname); }
  catch { fragment = ""; lock("The private link could not be cleared safely. Open this page without a link and enter your code.","error"); return; }
  if (TOKEN.test(fragment) && !document.hidden) { token = fragment; fragment = ""; accessForm.hidden = true; load(); }
  else { const invalid = !!fragment; fragment = ""; lock(invalid ? "This private request link is invalid. Ask the creator for a current link." : "Open your private request link or enter its code.",invalid ? "error" : "ready"); }
})();`;
