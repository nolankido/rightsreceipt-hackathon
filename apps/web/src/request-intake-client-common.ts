/** Exact response validation and text-only rendering for the native request intake. */
export const REQUEST_INTAKE_CLIENT_COMMON = String.raw`
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const HASH = /^[0-9a-f]{64}$/;
  const TOKEN = /^[A-Za-z0-9_-]{43}$/;
  const ACTIONS = ["submit_request","clarify","review","receipt"];
  const CREATOR_COPY = "I confirm this asset may receive a private licensing request. This link lets its holder submit a request, answer clarification questions, review an offer, and view a receipt. Creating or sharing it does not approve use, confirm payment, or grant permission.";
  const BUYER_COPY = "I confirm that this is a request for licensing terms. Submission does not grant permission, approve use, or confirm payment.";
  function text(value,max,multiline = false,trimmed = true) {
    return typeof value === "string" && value.length > 0 && [...value].length <= max && (!trimmed || value.trim() === value)
      && ![...value].some(char => char.length === 1 && char.charCodeAt(0) >= 0xd800 && char.charCodeAt(0) <= 0xdfff)
      && !(multiline ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/).test(value);
  }
  function timestamp(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
      && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
  }
  function scopes(value) { return Array.isArray(value) && value.length === ACTIONS.length && value.every((item,index) => item === ACTIONS[index]); }
  function base(v) { return v?.version === "request-intake-v1" && timestamp(v.checkedAt) && v.paymentConfirmed === false && v.permissionGranted === false; }
  function asset(v) {
    return UUID.test(v?.assetId) && text(v.title,200) && ["photograph","illustration"].includes(v.assetType)
      && text(v.creatorDisplayName,120) && text(v.provenanceNote,2000,true) && v.fingerprintAlgorithm === "sha256" && HASH.test(v.fingerprintValue);
  }
  function validateCreatorReview(v,assetId) {
    if (!base(v) || !asset(v.asset) || v.asset.assetId !== assetId || !Number.isSafeInteger(v.assetVersion) || v.assetVersion < 1
      || !HASH.test(v.reviewHash) || v.copyVersion !== "creator-request-link-v1" || v.copy !== CREATOR_COPY
      || v.capabilityLifetimeSeconds !== 604800 || !scopes(v.allowedActions)) throw new Error("The complete asset review could not be validated. Reload before creating a link.");
    return v;
  }
  function validateIssued(v,prior,command) {
    if (!base(v) || v.outcome !== "issued" || v.requestId !== command.requestId || !UUID.test(v.requestId)
      || !UUID.test(v.caseId) || !UUID.test(v.buyerCapabilityId) || v.assetId !== prior.asset.assetId || v.assetVersion !== prior.assetVersion
      || v.caseVersion !== 1 || !timestamp(v.issuedAt) || !timestamp(v.expiresAt) || Date.parse(v.issuedAt) > Date.parse(v.checkedAt)
      || Date.parse(v.expiresAt) <= Date.parse(v.checkedAt) || Date.parse(v.expiresAt) - Date.parse(v.issuedAt) !== 604800000
      || typeof v.replayed !== "boolean" || v.requestPath !== "/buyer/request"
      || v.creatorReviewPath !== "/creator/clarification/" + v.caseId || !scopes(v.allowedActions)) throw new Error("The issued outcome is uncertain. Retry issuing this same link before sharing it.");
    return v;
  }
  function unsafe(value) {
    return /<\s*\/?\s*(?:script|iframe|object|embed|style|link|meta|svg|math)\b/i.test(value) || /\bon[a-z]+\s*=/i.test(value)
      || /javascript\s*:/i.test(value) || /\{\{[\s\S]*?\}\}/.test(value) || /<%[\s\S]*?%>/.test(value) || /\$\{[\s\S]*?\}/.test(value);
  }
  function inputIssues(input) {
    const issues = [];
    for (const [key,label,max] of [["buyerName","Your name",100],["buyerOrganization","Organization",120]]) {
      const value = typeof input[key] === "string" ? input[key].trim() : "";
      if (!text(value,max) || [...value].length < 2 || unsafe(value)) issues.push({field:key,message:label + " must contain 2 to " + max + " plain-text characters."});
    }
    const email = typeof input.buyerEmail === "string" ? input.buyerEmail.trim() : "";
    if (!text(email,254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || unsafe(email)) issues.push({field:"buyerEmail",message:"Enter a valid email address of no more than 254 characters."});
    if (!text(input.intendedUseText,4000,true,false) || [...input.intendedUseText].length < 40 || !input.intendedUseText.trim() || unsafe(input.intendedUseText)) issues.push({field:"intendedUseText",message:"Describe the intended use in 40 to 4,000 plain-text characters, without executable markup or templates."});
    if (input.consentAcknowledged !== true) issues.push({field:"consentAcknowledged",message:"Read and confirm the request acknowledgement before submitting."});
    return issues;
  }
  function validateBuyerReview(v) {
    if (!base(v) || !UUID.test(v.caseId) || !Number.isSafeInteger(v.caseVersion) || v.caseVersion < 1 || !HASH.test(v.reviewHash) || !asset(v.asset)
      || !timestamp(v.accessExpiresAt) || Date.parse(v.accessExpiresAt) <= Date.parse(v.checkedAt) || typeof v.alreadySubmitted !== "boolean"
      || v.copyVersion !== "buyer-request-v1" || v.copy !== BUYER_COPY || !["/buyer/clarification","/buyer/review",null].includes(v.nextPath)
      || (v.nextPath !== "/buyer/clarification" && !v.alreadySubmitted)
      || v.alreadySubmitted !== (v.originalRequest !== null)) throw new Error("The complete request context could not be validated. Reopen your private link.");
    const r = v.originalRequest;
    if (r !== null && (!UUID.test(r?.requestSubmissionId) || !timestamp(r.submittedAt) || Date.parse(r.submittedAt) > Date.parse(v.checkedAt)
      || r.consentCopyVersion !== "buyer-request-v1" || inputIssues({...r,consentAcknowledged:true}).length)) throw new Error("The recorded request could not be validated. Reopen your private link.");
    return v;
  }
  function validateSubmitted(v,prior,command) {
    if (!base(v) || v.outcome !== "submitted" || v.requestId !== command.requestId || !UUID.test(v.requestId) || !UUID.test(v.requestSubmissionId)
      || v.caseId !== prior.caseId || v.caseVersion !== prior.caseVersion + 1 || !timestamp(v.submittedAt) || Date.parse(v.submittedAt) > Date.parse(v.checkedAt)
      || !timestamp(v.accessExpiresAt) || Date.parse(v.accessExpiresAt) <= Date.parse(v.checkedAt) || v.accessExpiresAt !== prior.accessExpiresAt
      || typeof v.replayed !== "boolean" || v.nextPath !== "/buyer/clarification") throw new Error("The saved outcome is uncertain. Retry this same request or reload its recorded state.");
    return v;
  }
  function row(target,label,value) {
    const box = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd");
    dt.textContent = label; dd.textContent = String(value); box.append(dt,dd); target.append(box);
  }
  function assetRows(target,v) {
    row(target,"Image",v.title); row(target,"Creator",v.creatorDisplayName); row(target,"Asset type",v.assetType);
    row(target,"Provenance note",v.provenanceNote); row(target,"SHA-256 fingerprint",v.fingerprintValue);
  }
`;
