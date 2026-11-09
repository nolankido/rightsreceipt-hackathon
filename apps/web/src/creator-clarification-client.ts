import { CLARIFICATION_CLIENT_COMMON } from "./clarification-client-common";
import { FORM_ACCESSIBILITY_CLIENT } from "./form-accessibility-client";
import { REQUEST_DEADLINE_CLIENT } from "./request-deadline-client";

/** Human edits never adopt buyer text or AI suggestions as resolved values. */
export const CREATOR_CLARIFICATION_CLIENT = String.raw`"use strict";
(() => {` + CLARIFICATION_CLIENT_COMMON + FORM_ACCESSIBILITY_CLIENT + REQUEST_DEADLINE_CLIENT + String.raw`
  const status = document.getElementById("status"), reload = document.getElementById("reload"), panel = document.getElementById("review-panel"),
    details = document.getElementById("review-details"), original = document.getElementById("original-request"),
    answerHistory = document.getElementById("answer-history"), answerSummary = document.getElementById("answer-summary"), savedPanel = document.getElementById("saved-answers-panel"),
    questions = document.getElementById("questions"), questionsPanel = document.getElementById("questions-panel"),
    unsupported = document.getElementById("unsupported"), unsupportedPanel = document.getElementById("unsupported-panel"),
    form = document.getElementById("revision-form"), fields = document.getElementById("fields"), confirmation = document.getElementById("revision-confirm"),
    save = document.getElementById("save-revision"), copy = document.getElementById("review-copy"), caseId = document.body.dataset.caseId;
  const CHOICES = {use_purpose:[["commercial","Commercial use"]],paid_advertising:[["true","Yes, paid advertising"]],
    exclusivity:[["non_exclusive","Non-exclusive"]],modification_scope:[["none","No modifications"],["crop_only","Crop only"]],
    attribution:[["required","Attribution required"],["not_required","Attribution not required"]],
    sublicensing:[["prohibited","Sublicensing prohibited"]],ai_use:[["prohibited","AI training and evaluation prohibited"]]};
  const STATE_LABELS = {unresolved:"Unresolved",resolved:"Supported value",unsupported:"Unsupported scope",contradictory:"Conflicting evidence"};
  const errorFields = {}, errors = formErrors(document.getElementById("form-errors"),document.getElementById("error-list"),errorFields,"creator-terms");
  let view = null, pending = null, busy = false, epoch = 0, deadline = 0, timer = null, controller = null, pendingFocus = null;
  function message(value) { status.textContent = value; }
  function clear() {
    errors.clear(); for (const key of Object.keys(errorFields)) delete errorFields[key];
    view = null; deadline = 0; clearTimeout(timer); timer = null; panel.hidden = true; form.hidden = true; savedPanel.hidden = true; questionsPanel.hidden = true; unsupportedPanel.hidden = true;
    details.replaceChildren(); original.textContent = ""; answerHistory.replaceChildren(); answerSummary.textContent = ""; questions.replaceChildren(); unsupported.replaceChildren(); fields.replaceChildren(); copy.textContent = "";
    confirmation.checked = false; confirmation.disabled = true; save.disabled = true; form.setAttribute?.("aria-busy","false");
  }
  function lock(value = "Private review cleared. Reload to check your session and the current request.",interaction = null) {
    const focus = interaction ?? pendingFocus ?? captureFocusWithin(panel);
    epoch++; controller?.abort(); controller = null; pending = null; busy = false; clear(); reload.disabled = false; message(value);
    pendingFocus = null; focusAfterInteraction(focus,reload);
  }
  function active(mine) { return mine === epoch && !document.hidden && Date.now() < deadline; }
  function enabled() {
    const locked = busy || !view || Date.now() >= deadline;
    save.disabled = locked || form.hidden || !view.canSaveTerms || !confirmation.checked;
    for (const control of fields.querySelectorAll("input,select,textarea")) control.disabled = locked || !!pending;
    confirmation.disabled = locked || !!pending; reload.disabled = busy; form.setAttribute?.("aria-busy",String(busy));
  }
  async function read(path,init = {}) {
    return readJsonWithDeadline(path,{credentials:"same-origin",mode:"same-origin",redirect:"error",cache:"no-store",referrerPolicy:"no-referrer",signal:controller?.signal,...init,
      headers:{Accept:"application/json","X-Requested-With":"XMLHttpRequest",...init.headers}}, {
      timeoutMessage:init.method === "POST"
        ? "Saving the human review timed out. It may already be recorded. Retry this exact review or reload its recorded state. Nothing retries automatically."
        : "Loading the creator review timed out. Reload to check the current request and saved state.",
      checkResponse(response) {
        if (!response.ok) {
          const error = new Error([401,403].includes(response.status) ? "Creator session unavailable. Sign in again, then reload."
            : response.status === 409 ? "The request, buyer answers, or terms changed. Reload the current record before reviewing."
            : response.status === 400 || response.status === 422 ? "The human review could not be accepted. Reload and check all rights fields."
            : response.status === 404 ? "This request is unavailable for the current creator."
            : response.status === 429 ? "Too many requests. Wait before trying again."
            : "The review could not be completed. Retry the same review or reload its recorded state.");
          error.status = response.status; throw error;
        }
        if (!(response.headers.get("content-type") || "").includes("application/json")) throw new Error("An authenticated JSON response is required.");
      }
    });
  }
  function option(select,value,label) { const entry = document.createElement("option"); entry.value = value; entry.textContent = label; select.append(entry); return entry; }
  function labeled(host,labelText,id,control) {
    const label = document.createElement("label"); label.htmlFor = id; label.textContent = labelText; control.id = id; host.append(label,control);
  }
  function values(host,field,state,value = null,note = null) {
    errors.clear(field); delete errorFields[field]; host.replaceChildren();
    if (state === "unresolved") {
      const hint = document.createElement("p"); hint.className = "muted"; hint.textContent = "This field remains open. No supported value has been chosen."; host.append(hint); return;
    }
    if (state === "unsupported" || state === "contradictory") {
      const input = document.createElement("textarea"); input.rows = 3; input.maxLength = 500; input.required = true; input.value = note ?? "";
      labeled(host,"Explain the unresolved scope or conflicting evidence","note-" + field,input); errorFields[field] = input; return;
    }
    if (field === "channels" || field === "territories") {
      const options = field === "channels" ? [["instagram_paid","Paid Instagram"],["facebook_paid","Paid Facebook"]] : [["US","United States"],["CA","Canada"]];
      const hint = document.createElement("p"); hint.textContent = "Choose each supported value you have independently reviewed."; host.append(hint);
      errorFields[field] = [];
      for (const [item,labelText] of options) {
        const label = document.createElement("label"), input = document.createElement("input"), span = document.createElement("span");
        label.className = "choice"; input.type = "checkbox"; input.id = "value-" + field + "-" + item; input.name = field; input.value = item;
        input.checked = Array.isArray(value) && value.includes(item); span.textContent = labelText; label.append(input,span); host.append(label); errorFields[field].push(input);
      }
      return;
    }
    if (CHOICES[field]) {
      const select = document.createElement("select"); select.required = true; const empty = option(select,"","Choose and confirm"); empty.disabled = true;
      for (const [item,label] of CHOICES[field]) option(select,item,label);
      select.value = value === null ? "" : String(value); labeled(host,"Supported value","value-" + field,select); errorFields[field] = select; return;
    }
    const input = document.createElement("input"); input.required = true; input.value = value === null ? "" : String(value);
    if (field === "start_date") input.type = "date";
    else { input.type = "number"; input.min = "1"; input.max = field === "duration_days" ? "365" : "500000"; input.step = "1"; }
    labeled(host,field === "start_date" ? "Start date, evaluated in UTC" : field === "duration_days" ? "Days, 1 through 365" : "Impressions, 1 through 500,000","value-" + field,input);
    errorFields[field] = input;
  }
  function renderField(f) {
    const field = document.createElement("fieldset"), legend = document.createElement("legend"), state = document.createElement("select"), choices = document.createElement("div");
    legend.textContent = FIELD_LABELS[f.fieldName]; field.append(legend);
    for (const [value,label] of Object.entries(STATE_LABELS)) option(state,value,label);
    state.value = f.resolutionState; labeled(field,"Review state","state-" + f.fieldName,state); field.append(choices);
    values(choices,f.fieldName,f.resolutionState,f.value,f.note);
    state.addEventListener("change",() => { values(choices,f.fieldName,state.value); confirmation.checked = false; enabled(); });
    fields.append(field);
  }
  function render(v) {
    validateReview(v,"creator",caseId); view = v; panel.hidden = false; details.replaceChildren(); fields.replaceChildren(); questions.replaceChildren();
    row(details,"Image",v.asset.title); row(details,"Creator",v.asset.creator); row(details,"Request revision",v.caseVersion);
    row(details,"Terms version",v.termsVersionNumber ?? "Not yet reviewed"); original.textContent = v.originalRequest;
    renderAnswers(v,answerHistory,answerSummary,savedPanel); renderUnsupported(v,unsupported,unsupportedPanel);
    questionsPanel.hidden = !v.questions.length;
    for (const question of v.questions) {
      const li = document.createElement("li"), label = document.createElement("strong"), body = document.createElement("p");
      label.textContent = question.label; body.textContent = question.question; li.append(label,body); questions.append(li);
    }
    for (const name of FIELD_NAMES) renderField(v.fields.find(field => field.fieldName === name));
    form.hidden = !v.canSaveTerms; copy.textContent = v.reviewCopy; confirmation.checked = false; save.textContent = "Save reviewed terms";
  }
  function selectedFields() {
    const selected = {}, issues = [];
    for (const field of FIELD_NAMES) {
      const state = document.getElementById("state-" + field).value;
      if (state === "unresolved") { selected[field] = {state}; continue; }
      if (state === "unsupported" || state === "contradictory") {
        const note = document.getElementById("note-" + field).value.trim();
        if (!text(note,500,true)) issues.push({field,message:"Explain " + FIELD_LABELS[field].toLowerCase() + " using 1 to 500 characters before saving the review."});
        selected[field] = {state,note}; continue;
      }
      let value;
      if (field === "channels" || field === "territories") value = [...fields.querySelectorAll('input[name="' + field + '"]:checked')].map(input => input.value);
      else {
        const raw = document.getElementById("value-" + field).value;
        value = field === "paid_advertising" ? raw === "true" : field === "duration_days" || field === "max_impressions" ? (raw === "" ? null : Number(raw)) : raw;
      }
      if (state !== "resolved" || !supported(field,value)) issues.push({field,message:"Choose and confirm a supported value for " + FIELD_LABELS[field].toLowerCase() + " before saving the review."});
      selected[field] = {state,value};
    }
    return {fields:selected,issues};
  }
  async function load(note = "",interaction = null) {
    if (document.hidden) { lock(); return; }
    pendingFocus = interaction;
    const mine = ++epoch; controller?.abort(); controller = new AbortController(); clear(); pending = null; busy = true; reload.disabled = true;
    message("Checking your session, current buyer answers, and rights terms."); const started = Date.now();
    try {
      const session = await read("/api/creator/session"); if (mine !== epoch || document.hidden) return;
      if (session.authenticated !== true || session.environment !== "sandbox" || !Number.isFinite(session.expiresInMs) || session.expiresInMs <= 0 || session.expiresInMs > 3600000) throw new Error("Creator session unavailable.");
      const remaining = Math.min(300000,session.expiresInMs) - (Date.now() - started);
      if (remaining <= 0) { lock((note ? note + " " : "") + "The creator session expired during review. Sign in again, then reload.",interaction); return; }
      deadline = Date.now() + remaining; timer = setTimeout(() => lock((note ? note + " " : "") + "Private review expired. Reload the current request before continuing."),remaining);
      const current = await read("/api/clarification/creator/cases/" + caseId + "/review"); if (!active(mine)) return;
      render(current); busy = false; enabled();
      message((note ? note + " " : "") + (current.canSaveTerms ? "Review the saved evidence and explicitly choose all material rights fields."
        : "This request cannot receive a new terms review. Check its current offer or invoice state."));
      focusAfterInteraction(interaction,document.getElementById("review-title")); pendingFocus = null;
    } catch (error) { if (mine === epoch) lock((note ? note + " " : "") + (error.message || "Creator clarification unavailable."),interaction); }
  }
  form.addEventListener("submit",async event => {
    event.preventDefault();
    if (busy || !view || form.hidden || !view.canSaveTerms || !confirmation.checked || Date.now() >= deadline || document.hidden) return;
    if (!pending) {
      const selected = selectedFields();
      if (selected.issues.length) {
        confirmation.checked = false; enabled(); errors.show(selected.issues); message("Check the highlighted rights fields before saving the review."); return;
      }
      errors.clear(); pending = Object.freeze({requestId:crypto.randomUUID(),expectedCaseVersion:view.caseVersion,reviewHash:view.reviewHash,
        submissionId:view.latestSubmission?.reviewedTermsVersionId === null ? view.latestSubmission.submissionId : null,
        fields:selected.fields,confirmed:true,copyVersion:view.reviewCopyVersion});
    }
    const mine = epoch, prior = view, body = JSON.stringify(pending), interaction = captureFocus(); pendingFocus = interaction;
    busy = true; enabled(); message("Saving the confirmed human review and calculating a quote when all terms are supported.");
    try {
      const result = await read("/api/clarification/creator/cases/" + caseId + "/terms",{method:"POST",headers:{"Content-Type":"application/json"},body});
      if (!active(mine)) return;
      validateResult(result,prior,"terms"); pending = null;
      await load(result.quoteId ? "Human terms and the deterministic quote are recorded. Open offer approval to review and approve this exact version."
        : "The human review is recorded. Unresolved, conflicting, or unsupported fields still prevent a quote.",interaction);
    } catch (error) {
      if (!active(mine)) return;
      if ([400,401,403,404,409,422].includes(error.status)) { lock(error.message,interaction); return; }
      busy = false; save.textContent = "Retry the same review"; enabled();
      message(error.message || "The saved outcome is uncertain. Retry this exact review or reload its recorded state.");
      focusAfterInteraction(interaction,save); pendingFocus = null;
    }
  });
  function edited(event) {
    for (const [name,controls] of Object.entries(errorFields)) if ((Array.isArray(controls) ? controls : [controls]).includes(event.target)) errors.clear(name);
    confirmation.checked = false; enabled();
  }
  fields.addEventListener("input",edited); fields.addEventListener("change",edited);
  confirmation.addEventListener("change",enabled); reload.addEventListener("click",() => load("",captureFocus()));
  document.addEventListener("visibilitychange",() => { if (document.hidden) lock(); });
  window.addEventListener("pagehide",() => lock()); window.addEventListener("pageshow",event => { if (event.persisted) lock(); });
  if (!UUID.test(caseId)) lock("The creator request could not be identified."); else load();
})();`;
