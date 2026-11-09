import { REQUEST_INTAKE_CLIENT_COMMON } from "./request-intake-client-common";
import { FORM_ACCESSIBILITY_CLIENT } from "./form-accessibility-client";
import { REQUEST_DEADLINE_CLIENT } from "./request-deadline-client";

/** A browser-generated private code stays in this closure; issuance sends only its digest. */
export const CREATOR_REQUEST_INTAKE_CLIENT = String.raw`"use strict";
(() => {` + REQUEST_INTAKE_CLIENT_COMMON + FORM_ACCESSIBILITY_CLIENT + REQUEST_DEADLINE_CLIENT + String.raw`
  const status = document.getElementById("status"), reload = document.getElementById("reload"), panel = document.getElementById("asset-panel"),
    details = document.getElementById("asset-details"), form = document.getElementById("issue-form"), confirmation = document.getElementById("issue-confirm"),
    save = document.getElementById("issue-link"), copy = document.getElementById("issue-copy"), issuedPanel = document.getElementById("issued-panel"),
    issuedDetails = document.getElementById("issued-details"), copyLink = document.getElementById("copy-link"), showLink = document.getElementById("show-link"),
    manualPanel = document.getElementById("manual-link-panel"), privateLink = document.getElementById("private-link"),
    openReview = document.getElementById("open-clarification"), assetId = document.body.dataset.assetId;
  let view = null, pending = null, token = null, issued = null, busy = false, epoch = 0, deadline = 0, timer = null, controller = null, pendingFocus = null;
  function message(value,state = "ready") { status.textContent = value; status.dataset.state = state; }
  function hideLink() { privateLink.value = ""; manualPanel.hidden = true; showLink.textContent = "Show link for manual copy"; showLink.setAttribute("aria-expanded","false"); }
  function clear() {
    view = null; pending = null; token = null; issued = null; deadline = 0; clearTimeout(timer); timer = null;
    panel.hidden = true; form.hidden = true; issuedPanel.hidden = true; details.replaceChildren(); issuedDetails.replaceChildren(); copy.textContent = "";
    confirmation.checked = false; confirmation.disabled = true; save.disabled = true; copyLink.disabled = true; showLink.disabled = true; openReview.disabled = true;
    save.textContent = "Create private request link"; reload.textContent = "Reload asset review"; hideLink();
  }
  function lock(value = "Private request link cleared. Reload the asset review to create a new request.",state = "cleared",interaction = null) {
    const focus = interaction ?? pendingFocus ?? captureFocusWithin(panel,issuedPanel);
    epoch++; controller?.abort(); controller = null; busy = false; clear(); reload.disabled = false; message(value,state);
    pendingFocus = null;
    form.setAttribute?.("aria-busy","false"); focusAfterInteraction(focus,reload);
  }
  function active(mine) { return mine === epoch && !document.hidden && Date.now() < deadline; }
  function enabled() {
    const locked = busy || !view || Date.now() >= deadline;
    confirmation.disabled = locked || !!pending || !!issued; save.disabled = locked || !!issued || !confirmation.checked;
    copyLink.disabled = locked || !issued || !token; showLink.disabled = copyLink.disabled; openReview.disabled = locked || !issued;
    reload.disabled = busy; reload.textContent = token ? "Clear private link and reload" : "Reload asset review";
    form.setAttribute?.("aria-busy",String(busy));
  }
  async function read(path,init = {}) {
    return readJsonWithDeadline(path,{credentials:"same-origin",mode:"same-origin",redirect:"error",cache:"no-store",referrerPolicy:"no-referrer",signal:controller?.signal,...init,
      headers:{Accept:"application/json","X-Requested-With":"XMLHttpRequest",...init.headers}}, {
      timeoutMessage:init.method === "POST"
        ? "Creating the private request link timed out. The link may already exist. Retry issuing this same link while this page is open. Nothing retries automatically."
        : "Loading the creator asset review timed out. Reload the asset review to try again.",
      checkResponse(response) {
        if (!response.ok) {
          const error = new Error([401,403].includes(response.status) ? "Creator access is unavailable. Sign in again, then reload the asset review."
            : response.status === 404 ? "This asset is unavailable for the current creator."
            : response.status === 409 ? "The asset or issuance command changed. Reload its current review before creating a new request."
            : response.status === 400 || response.status === 422 ? "The request-link command was not accepted. Reload the asset review before trying again."
            : response.status === 429 ? "Too many requests. Wait, then retry issuing this same link."
            : "The issued outcome is uncertain. Retry issuing this same link while this page is open.");
          error.status = response.status; throw error;
        }
        if (!(response.headers.get("content-type") || "").includes("application/json")) throw new Error("The issued outcome is uncertain because the response was not valid JSON. Retry the same link.");
      }
    });
  }
  async function load(interaction = null) {
    if (document.hidden) { lock(); return; }
    pendingFocus = interaction;
    const mine = ++epoch; controller?.abort(); controller = new AbortController(); clear(); busy = true; reload.disabled = true;
    message("Checking your session and the current asset.","loading"); const started = Date.now();
    try {
      const session = await read("/api/creator/session"); if (mine !== epoch || document.hidden) return;
      if (session.authenticated !== true || session.environment !== "sandbox" || !Number.isFinite(session.expiresInMs) || session.expiresInMs <= 0 || session.expiresInMs > 3600000) throw new Error("Creator session unavailable.");
      const remaining = Math.min(300000,session.expiresInMs) - (Date.now() - started);
      if (remaining <= 0) { lock("The creator session expired while loading. Sign in again, then reload.","error",interaction); return; }
      deadline = Date.now() + remaining; timer = setTimeout(() => lock("Private asset review expired. Reload before creating a request."),remaining);
      const current = await read("/api/intake/creator/assets/" + assetId + "/review"); if (!active(mine)) return;
      validateCreatorReview(current,assetId); view = current; assetRows(details,current.asset); copy.textContent = current.copy;
      panel.hidden = false; form.hidden = false; confirmation.checked = false; busy = false; enabled();
      message("Review this image, then confirm to create one private request link.");
      focusAfterInteraction(interaction,document.getElementById("asset-title")); pendingFocus = null;
    } catch (error) { if (mine === epoch) lock(error.message || "Creator asset review unavailable.","error",interaction); }
  }
  form.addEventListener("submit",async event => {
    event.preventDefault();
    if (busy || !view || issued || !confirmation.checked || Date.now() >= deadline || document.hidden) return;
    const mine = epoch, prior = view, interaction = captureFocus(); pendingFocus = interaction; busy = true; enabled(); message("Creating one private request link.","issuing");
    try {
      if (!pending) {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        let generated = btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
        bytes.fill(0);
        const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(generated));
        if (!active(mine)) { generated = ""; return; }
        token = generated; generated = "";
        const tokenDigestSha256 = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2,"0")).join("");
        pending = Object.freeze({requestId:crypto.randomUUID(),expectedAssetVersion:prior.assetVersion,reviewHash:prior.reviewHash,tokenDigestSha256,confirmed:true,copyVersion:prior.copyVersion});
      }
      const command = pending, started = Date.now();
      const result = await read("/api/intake/creator/assets/" + assetId + "/links",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(command)});
      if (!active(mine)) return;
      validateIssued(result,prior,command);
      const remaining = Math.min(deadline - Date.now(),Date.parse(result.expiresAt) - Date.parse(result.checkedAt) - (Date.now() - started));
      if (remaining <= 0) { lock("The private link expired before it could be shown. Reload to create a new request.","error",interaction); return; }
      clearTimeout(timer); deadline = Date.now() + remaining; timer = setTimeout(() => lock("Private request link cleared after the review expired."),remaining);
      pending = null; issued = result; busy = false; form.hidden = true; issuedPanel.hidden = false;
      row(issuedDetails,"Request reference",result.caseId); row(issuedDetails,"Link expires",result.expiresAt.replace("T"," ").replace(".000Z"," UTC"));
      enabled(); message("Your private link is ready. Copy it and share it with your intended buyer.","issued");
      focusAfterInteraction(interaction,document.getElementById("issued-title")); pendingFocus = null;
    } catch (error) {
      if (!active(mine)) return;
      if (!pending || [400,401,403,404,409,422].includes(error.status)) { lock(error.message || "The private link could not be created.","error",interaction); return; }
      busy = false; save.textContent = "Retry issuing this link"; enabled();
      message(error.message || "The issued outcome is uncertain. Retry issuing this same link before sharing it.","uncertain");
      focusAfterInteraction(interaction,save); pendingFocus = null;
    }
  });
  function privateUrl() { return window.location.origin + "/buyer/request#" + token; }
  copyLink.addEventListener("click",async () => {
    const mine = epoch; if (!active(mine) || busy || !issued || !token) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(privateUrl());
      if (active(mine)) message("Private link copied to your clipboard. Share it only with the intended buyer.","issued");
    } catch { if (active(mine)) message("Copy could not complete. Choose Show link for manual copy, then copy the complete link.","issued"); }
  });
  showLink.addEventListener("click",() => {
    if (!active(epoch) || busy || !issued || !token) return;
    if (!manualPanel.hidden) { hideLink(); focusNow(showLink); return; }
    privateLink.value = privateUrl(); manualPanel.hidden = false; showLink.textContent = "Hide private link"; showLink.setAttribute("aria-expanded","true");
    privateLink.focus(); privateLink.select();
  });
  openReview.addEventListener("click",() => {
    if (!active(epoch) || busy || !issued) return;
    const destination = "/creator/clarification/" + issued.caseId; lock(); window.location.assign(destination);
  });
  confirmation.addEventListener("change",enabled); reload.addEventListener("click",() => load(captureFocus()));
  document.addEventListener("visibilitychange",() => { if (document.hidden) lock(); });
  window.addEventListener("pagehide",() => lock()); window.addEventListener("pageshow",event => { if (event.persisted) lock(); });
  if (!UUID.test(assetId) || !window.isSecureContext || window.location.protocol !== "https:") lock("This secure creator asset page is unavailable.","error"); else load();
})();`;
