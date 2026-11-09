import { CLARIFICATION_CLIENT_COMMON } from "./clarification-client-common";
import { FORM_ACCESSIBILITY_CLIENT } from "./form-accessibility-client";
import { REQUEST_DEADLINE_CLIENT } from "./request-deadline-client";

/** The capability and pending answers live only in this closure. */
export const BUYER_CLARIFICATION_CLIENT = String.raw`"use strict";
(() => {` + CLARIFICATION_CLIENT_COMMON + FORM_ACCESSIBILITY_CLIENT + REQUEST_DEADLINE_CLIENT + String.raw`
  const status = document.getElementById("status"), accessForm = document.getElementById("access-form"), code = document.getElementById("access-code"),
    reload = document.getElementById("reload"), openOffer = document.getElementById("open-offer"), panel = document.getElementById("clarification-panel"),
    details = document.getElementById("clarification-details"), questions = document.getElementById("questions"), form = document.getElementById("answer-form"),
    confirmation = document.getElementById("answers-confirm"), save = document.getElementById("save-answers"), copy = document.getElementById("answer-copy"),
    answerHistory = document.getElementById("answer-history"), answerSummary = document.getElementById("answer-summary"), savedPanel = document.getElementById("saved-answers-panel"),
    unsupported = document.getElementById("unsupported"), unsupportedPanel = document.getElementById("unsupported-panel"),
    accessError = document.getElementById("access-error"), errorSummary = document.getElementById("answer-errors"), errorList = document.getElementById("answer-error-list");
  const TOKEN = /^[A-Za-z0-9_-]{43}$/;
  let token = null, view = null, pending = null, busy = false, epoch = 0, deadline = 0, timer = null, controller = null, pendingFocus = null;
  let answerIssues = null;
  function message(value) { status.textContent = value; }
  function clearAccessError() { code.removeAttribute("aria-invalid"); if (accessError) { accessError.textContent = ""; accessError.hidden = true; } }
  function accessIssue(value,interaction) {
    code.setAttribute("aria-invalid","true"); if (accessError) { accessError.textContent = value; accessError.hidden = false; }
    message(value); focusAfterInteraction(interaction,code);
  }
  function clear() {
    answerIssues?.clear(); answerIssues = null;
    view = null; deadline = 0; clearTimeout(timer); timer = null; panel.hidden = true; form.hidden = true; savedPanel.hidden = true; unsupportedPanel.hidden = true;
    details.replaceChildren(); questions.replaceChildren(); answerHistory.replaceChildren(); unsupported.replaceChildren(); answerSummary.textContent = ""; copy.textContent = "";
    confirmation.checked = false; confirmation.disabled = true; save.disabled = true; openOffer.disabled = true;
  }
  function lock(value = "Private clarification cleared. Reopen your original link or enter your code again.",interaction = null) {
    const focus = interaction ?? captureFocusWithin(panel,form,savedPanel,unsupportedPanel,reload,openOffer) ?? pendingFocus;
    epoch++; controller?.abort(); controller = null; token = null; pending = null; busy = false; code.value = ""; clear(); reload.disabled = true; accessForm.hidden = false; message(value);
    pendingFocus = null; clearAccessError(); focusAfterInteraction(focus,code);
  }
  function active(mine) { return mine === epoch && !document.hidden && !!token && Date.now() < deadline; }
  function enabled() {
    const locked = busy || !view || !token || Date.now() >= deadline;
    save.disabled = locked || form.hidden || !view.canSubmitAnswers || !confirmation.checked;
    confirmation.disabled = locked || !!pending || form.hidden;
    for (const field of questions.querySelectorAll("textarea")) field.disabled = busy || !!pending;
    openOffer.disabled = locked; reload.disabled = !token || busy;
  }
  async function read(path,init = {}) {
    return readJsonWithDeadline(path,{credentials:"omit",mode:"same-origin",redirect:"error",cache:"no-store",referrerPolicy:"no-referrer",signal:controller?.signal,...init,
      headers:{Accept:"application/json",Authorization:"Bearer " + token,"X-Requested-With":"XMLHttpRequest",...init.headers}},{
      timeoutMessage:init.method === "POST"
        ? "The answer save timed out before its outcome could be confirmed. Retry the same answers or reload their recorded state."
        : "The clarification check timed out. Reopen your original link or enter your code again to load the current questions.",
      checkResponse(response) {
        if (!response.ok) {
          const error = new Error([401,403,404].includes(response.status) ? "This private clarification link is unavailable. Ask the creator for current access."
            : response.status === 409 ? "The request changed or these answers were already reviewed. Reopen your link and load the current questions."
            : response.status === 400 || response.status === 422 ? "The answers could not be accepted. Reload the current questions and review each answer."
            : response.status === 429 ? "Too many requests. Wait before trying again."
            : "The request could not be completed. Retry the same answers or reload their recorded state.");
          error.status = response.status; throw error;
        }
        if (!(response.headers.get("content-type") || "").includes("application/json")) throw new Error("A private JSON response is required.");
      }
    });
  }
  function render(v) {
    validateReview(v,"buyer"); view = v; panel.hidden = false; details.replaceChildren(); questions.replaceChildren();
    row(details,"Image",v.asset.title); row(details,"Creator",v.asset.creator); row(details,"Request revision",v.caseVersion);
    row(details,"Terms version",v.termsVersionNumber ?? "Awaiting creator review");
    renderAnswers(v,answerHistory,answerSummary,savedPanel); renderUnsupported(v,unsupported,unsupportedPanel);
    const answerFields = {};
    for (const question of v.questions) {
      const field = document.createElement("fieldset"), legend = document.createElement("legend"), label = document.createElement("label"), input = document.createElement("textarea"), hint = document.createElement("p");
      legend.textContent = question.label; label.htmlFor = "answer-" + question.fieldName; label.textContent = question.question;
      input.id = label.htmlFor; input.name = question.fieldName; input.rows = 3; input.maxLength = 2000; input.required = true;
      input.autocomplete = "off"; input.setAttribute("aria-describedby","answer-help-" + question.fieldName);
      hint.id = "answer-help-" + question.fieldName; hint.className = "muted"; hint.textContent = "Up to 2,000 characters. Only save details you want the creator to review.";
      input.addEventListener("input",() => { confirmation.checked = false; answerIssues?.clear(question.fieldName); enabled(); });
      field.append(legend,label,input,hint); questions.append(field);
      answerFields[question.fieldName] = input;
    }
    answerIssues = formErrors(errorSummary,errorList,answerFields,"answers");
    copy.textContent = v.answerCopy; form.hidden = !v.canSubmitAnswers; confirmation.checked = false; save.textContent = "Save my answers";
  }
  async function load(note = "",interaction = null) {
    if (!token || document.hidden) { lock(); return; }
    pendingFocus = interaction;
    const mine = ++epoch; controller?.abort(); controller = new AbortController(); clear(); pending = null; busy = true; reload.disabled = true;
    message("Checking access and the current clarification questions."); const started = Date.now();
    try {
      const current = await read("/api/clarification/buyer/review");
      if (mine !== epoch || document.hidden || !token) return;
      validateReview(current,"buyer");
      const remaining = Math.min(300000,Date.parse(current.accessExpiresAt) - Date.parse(current.checkedAt)) - (Date.now() - started);
      if (remaining <= 0) { lock("Clarification access expired while loading. Request a current link.",interaction); return; }
      deadline = Date.now() + remaining; timer = setTimeout(() => lock("Private clarification expired. Reopen your link before continuing."),remaining);
      render(current); accessForm.hidden = true; busy = false; enabled();
      message((note ? note + " " : "") + (current.canSubmitAnswers ? "Answer every displayed question, then confirm and save your answers."
        : current.latestSubmission?.reviewedTermsVersionId === null ? "Your answers are recorded and waiting for the creator's review."
        : "No answers are requested for this revision. The creator still reviews and approves the exact offer separately."));
      focusAfterInteraction(interaction,current.canSubmitAnswers ? document.getElementById("answer-" + current.questions[0].fieldName)
        : current.latestSubmission ? document.getElementById("saved-answers-title") : document.getElementById("clarification-title"));
    } catch (error) { if (mine === epoch) lock((note ? note + " " : "") + (error.message || "Clarification unavailable."),interaction); }
    finally { if (!busy && pendingFocus === interaction) pendingFocus = null; }
  }
  function open(value,interaction) {
    lock("");
    if (!TOKEN.test(value)) { accessIssue("Enter the complete 43-character private code from your link.",interaction); return; }
    token = value; accessForm.hidden = true; load("",interaction);
  }
  form.addEventListener("submit",async event => {
    event.preventDefault();
    if (busy || !view || !token || form.hidden || !view.canSubmitAnswers || !confirmation.checked || Date.now() >= deadline || document.hidden) return;
    if (!pending) {
      const answers = view.questions.map(q => ({fieldName:q.fieldName,answerText:document.getElementById("answer-" + q.fieldName).value.trim()}));
      const issues = answers.filter(answer => !text(answer.answerText,2000,true)).map(answer => ({field:answer.fieldName,
        message:!answer.answerText ? "Enter an answer for " + view.questions.find(q => q.fieldName === answer.fieldName).label.toLowerCase() + "."
          : "Use up to 2,000 characters without unsupported control characters for this answer."}));
      if (issues.length) { answerIssues.show(issues); message("Check the highlighted answers before saving them for creator review."); return; }
      answerIssues.clear();
      pending = {requestId:crypto.randomUUID(),expectedCaseVersion:view.caseVersion,reviewHash:view.reviewHash,answers,confirmed:true,copyVersion:view.answerCopyVersion};
    }
    const interaction = captureFocus(), mine = epoch, prior = view, body = JSON.stringify(pending); pendingFocus = interaction; busy = true; enabled(); message("Saving these answers for creator review.");
    try {
      const result = await read("/api/clarification/buyer/answers",{method:"POST",headers:{"Content-Type":"application/json"},body});
      if (!active(mine)) return;
      validateResult(result,prior,"answers"); pending = null; await load("Your answers were recorded by the server.",interaction);
    } catch (error) {
      if (!active(mine)) return;
      if ([400,401,403,404,409,422].includes(error.status)) { lock(error.message,interaction); return; }
      busy = false; save.textContent = "Retry the same answers"; enabled();
      message(error.message || "The saved outcome is uncertain. Retry these exact answers or reload their recorded state.");
      focusAfterInteraction(interaction,save);
    } finally { if (!busy && pendingFocus === interaction) pendingFocus = null; }
  });
  confirmation.addEventListener("change",enabled); reload.addEventListener("click",() => load("",captureFocus()));
  code.addEventListener("input",clearAccessError);
  accessForm.addEventListener("submit",event => { event.preventDefault(); const interaction = captureFocus(), value = code.value.trim(); code.value = ""; open(value,interaction); });
  openOffer.addEventListener("click",() => {
    if (busy || !view || !token || Date.now() >= deadline || document.hidden) return;
    const destination = "/buyer/review#" + token; lock(); window.location.assign(destination);
  });
  document.addEventListener("visibilitychange",() => { if (document.hidden) lock(); });
  window.addEventListener("pagehide",() => lock()); window.addEventListener("pageshow",event => { if (event.persisted) lock(); });
  let fragment = window.location.hash.slice(1);
  try { if (window.location.hash) history.replaceState(null,"",window.location.pathname); }
  catch { fragment = ""; lock("The private link could not be cleared safely. Open this page without a link and enter your code."); return; }
  if (TOKEN.test(fragment) && !document.hidden) { token = fragment; fragment = ""; accessForm.hidden = true; load(); }
  else { const invalid = !!fragment; fragment = ""; lock(invalid ? "This clarification link is invalid. Ask the creator for a current private link." : undefined); }
})();`;
