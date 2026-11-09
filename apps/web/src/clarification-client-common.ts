/** Shared browser validation and text-only evidence rendering for clarification. */
export const CLARIFICATION_CLIENT_COMMON = String.raw`
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const HASH = /^[0-9a-f]{64}$/;
  const FIELD_LABELS = {use_purpose:"Use purpose",channels:"Channels",paid_advertising:"Paid advertising",territories:"Territory",start_date:"Start date",duration_days:"Duration (days)",max_impressions:"Maximum impressions",exclusivity:"Exclusivity",modification_scope:"Modifications",attribution:"Attribution",sublicensing:"Sublicensing",ai_use:"AI use"};
  const FIELD_NAMES = Object.keys(FIELD_LABELS), QUESTION_NAMES = [...FIELD_NAMES,"additional_context"];
  const STATES = ["resolved","unresolved","unsupported","contradictory"];
  const ANSWER_COPY = "I confirm these answers describe my requested use. They are evidence for creator review, not approved terms, payment confirmation, or permission.";
  const REVIEW_COPY = "I reviewed the original request and saved buyer answers, and confirm every displayed rights field. Saving creates or reuses human-confirmed terms and a deterministic quote when complete. Separate creator approval and buyer acceptance are still required.";
  function text(value,max,multiline = false) {
    return typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value
      && ![...value].some(char => char.length === 1 && char.charCodeAt(0) >= 0xd800 && char.charCodeAt(0) <= 0xdfff)
      && !(multiline ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/).test(value);
  }
  function timestamp(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
      && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
  }
  function calendarDate(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
      && new Date(value).toISOString().slice(0,10) === value;
  }
  function supported(field,value) {
    if (field === "channels" || field === "territories") {
      const allowed = field === "channels" ? ["instagram_paid","facebook_paid"] : ["US","CA"];
      return Array.isArray(value) && value.length > 0 && value.length <= allowed.length
        && new Set(value).size === value.length && value.every(item => allowed.includes(item));
    }
    if (field === "start_date") return calendarDate(value);
    if (field === "duration_days" || field === "max_impressions") return Number.isSafeInteger(value) && value >= 1 && value <= (field === "duration_days" ? 365 : 500000);
    if (field === "paid_advertising") return value === true;
    return ({use_purpose:["commercial"],exclusivity:["non_exclusive"],modification_scope:["none","crop_only"],attribution:["required","not_required"],sublicensing:["prohibited"],ai_use:["prohibited"]}[field] || []).includes(value);
  }
  function validateReview(v,role,caseId = null) {
    const failure = () => { throw new Error("The complete clarification record could not be validated. Reload its current version."); };
    if (v?.schemaVersion !== "clarification-review-v1" || v.environment !== "sandbox" || !UUID.test(v.caseId)
      || (caseId && v.caseId !== caseId) || !Number.isSafeInteger(v.caseVersion) || v.caseVersion < 1 || !HASH.test(v.reviewHash)
      || !text(v.asset?.title,200) || !text(v.asset?.creator,120) || !text(v.originalRequest,8000,true)
      || [...v.originalRequest].length < 40 || [...v.originalRequest].length > 4000
      || (v.termsVersionId !== null && !UUID.test(v.termsVersionId))
      || (v.termsVersionNumber !== null && (!Number.isSafeInteger(v.termsVersionNumber) || v.termsVersionNumber < 1))
      || ((v.termsVersionId === null) !== (v.termsVersionNumber === null))
      || typeof v.canSubmitAnswers !== "boolean" || typeof v.canSaveTerms !== "boolean"
      || (role === "buyer" ? v.canSaveTerms !== false : v.canSubmitAnswers !== false)
      || !timestamp(v.checkedAt) || (role === "buyer" ? !timestamp(v.accessExpiresAt) || Date.parse(v.accessExpiresAt) <= Date.parse(v.checkedAt) : v.accessExpiresAt !== null)
      || v.paymentConfirmed !== false || v.permissionGranted !== false
      || v.answerCopyVersion !== "buyer-clarification-answers-v1" || v.answerCopy !== ANSWER_COPY
      || v.reviewCopyVersion !== "creator-clarification-review-v1" || v.reviewCopy !== REVIEW_COPY
      || !Array.isArray(v.fields) || v.fields.length !== 12 || new Set(v.fields.map(f => f?.fieldName)).size !== 12
      || v.fields.some(f => !FIELD_NAMES.includes(f?.fieldName) || !text(f.label,120) || !STATES.includes(f.resolutionState)
        || (f.note !== null && !text(f.note,500,true)) || (f.resolutionState === "resolved" ? !supported(f.fieldName,f.value) : f.value !== null)
        || (["unsupported","contradictory"].includes(f.resolutionState) && !text(f.note,500,true)))
      || !Array.isArray(v.questions) || v.questions.length > 13 || new Set(v.questions.map(q => q?.fieldName)).size !== v.questions.length
      || v.questions.some(q => !QUESTION_NAMES.includes(q?.fieldName) || !text(q.label,120) || !text(q.question,2000,true) || !["missing","ambiguous","low_confidence","contradictory"].includes(q.reason))
      || !Array.isArray(v.unsupported) || v.unsupported.length > 12 || new Set(v.unsupported.map(q => q?.fieldName)).size !== v.unsupported.length
      || v.unsupported.some(q => !FIELD_NAMES.includes(q?.fieldName) || !text(q.label,120) || !text(q.explanation,2000,true))
      || (v.canSubmitAnswers && v.questions.length === 0)
      || (v.termsVersionId === null && v.fields.some(f => f.resolutionState !== "unresolved"))) failure();
    const s = v.latestSubmission;
    if (s !== null && (!UUID.test(s?.submissionId) || !Number.isSafeInteger(s.roundNumber) || s.roundNumber < 1 || !timestamp(s.submittedAt) || Date.parse(s.submittedAt) > Date.parse(v.checkedAt)
      || !Number.isSafeInteger(s.sourceCaseVersion) || s.sourceCaseVersion < 1 || s.sourceCaseVersion >= v.caseVersion
      || (s.sourceTermsVersionId !== null && !UUID.test(s.sourceTermsVersionId))
      || (s.reviewedTermsVersionId !== null && !UUID.test(s.reviewedTermsVersionId))
      || !Array.isArray(s.answers) || s.answers.length < 1 || s.answers.length > 13
      || new Set(s.answers.map(a => a?.fieldName)).size !== s.answers.length
      || s.answers.some(a => !QUESTION_NAMES.includes(a?.fieldName) || !text(a.answerText,2000,true)))) failure();
    if (v.canSubmitAnswers && s && s.reviewedTermsVersionId === null) failure();
    return v;
  }
  function validateResult(v,prior,kind) {
    if (v?.schemaVersion !== "clarification-command-result-v1" || !["recorded","replayed"].includes(v.outcome) || !UUID.test(v.resultId)
      || !Number.isSafeInteger(v.caseVersion) || v.caseVersion !== prior.caseVersion + 1
      || (v.submissionId !== null && !UUID.test(v.submissionId)) || (kind === "answers" && !UUID.test(v.submissionId))
      || (v.termsVersionId !== null && !UUID.test(v.termsVersionId)) || (kind === "terms" && !UUID.test(v.termsVersionId))
      || (v.quoteId !== null && !UUID.test(v.quoteId))
      || (v.resolutionStatus !== null && !["complete","incomplete","unsupported","contradictory"].includes(v.resolutionStatus))
      || (kind === "answers" && (v.submissionId !== v.resultId || v.termsVersionId !== null || v.quoteId !== null || v.resolutionStatus !== null))
      || (kind === "terms" && (v.resolutionStatus === null || ((v.resolutionStatus === "complete") !== (v.quoteId !== null))
        || v.submissionId !== (prior.latestSubmission?.reviewedTermsVersionId === null ? prior.latestSubmission.submissionId : null)))
      || v.paymentConfirmed !== false || v.permissionGranted !== false) throw new Error("The saved outcome is uncertain. Retry the same command or reload its recorded state.");
  }
  function row(target,label,value) {
    const box = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd");
    dt.textContent = label; dd.textContent = String(value); box.append(dt,dd); target.append(box);
  }
  function renderAnswers(v,list,summary,panel) {
    list.replaceChildren(); summary.textContent = ""; panel.hidden = !v.latestSubmission;
    if (!v.latestSubmission) return;
    const s = v.latestSubmission;
    summary.textContent = "Answer round " + s.roundNumber + ", saved " + s.submittedAt.replace("T"," ").replace(".000Z"," UTC")
      + (s.reviewedTermsVersionId ? ". Included in a creator review. Further approval and exact buyer acceptance remain separate." : ". Waiting for the creator to review these answers.");
    for (const answer of s.answers) {
      const li = document.createElement("li"), heading = document.createElement("strong"), body = document.createElement("p");
      heading.textContent = FIELD_LABELS[answer.fieldName] || "Additional context"; body.textContent = answer.answerText; body.className = "evidence";
      li.append(heading,body); list.append(li);
    }
  }
  function renderUnsupported(v,list,panel) {
    list.replaceChildren(); panel.hidden = !v.unsupported.length;
    for (const blocker of v.unsupported) {
      const li = document.createElement("li"), strong = document.createElement("strong"); strong.textContent = blocker.label + ": ";
      li.append(strong,document.createTextNode(blocker.explanation)); list.append(li);
    }
  }
`;
