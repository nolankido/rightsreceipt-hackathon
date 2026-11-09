/** Minimal canonical creator review, not the optional portfolio dashboard.
 * Access owns login/logout cookies. This application never creates or exposes one.
 */
import type { CreatorSessionBindings } from "./creator-session";
import { CREATOR_REVIEW_CLIENT } from "../../web/src/creator-review-client";
import type { createCreatorSessionAuthorization } from "./creator-session";
const PATH = /^\/creator\/review\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/u;
export interface CreatorReviewBindings extends CreatorSessionBindings {
  readonly CREATOR_REVIEW_ENABLED?: string;
  readonly CLARIFICATION_ENABLED?: string;
  readonly REQUEST_INTAKE_ENABLED?: string;
  readonly PAYPAL_MODE?: string;
}
const common = { "Cache-Control": "no-store, private", "Pragma": "no-cache", "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "X-Robots-Tag": "noindex, nofollow" };
function response(body: string, status: number, type: string, nonce = "") {
  return new Response(body, { status, headers: { ...common, "Content-Type": type,
    "Content-Security-Policy": `default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'` } });
}
export function renderCreatorReview(caseId: string, nonce: string): string {
  if (!PATH.test(`/creator/review/${caseId}`) || !/^[a-f0-9]{32}$/u.test(nonce)) throw new Error("Invalid review page.");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Creator review | RightsReceipt</title><style nonce="${nonce}">
:root{font-family:system-ui,sans-serif;color:#17272d;background:#f5f7f7;line-height:1.55}*{box-sizing:border-box}.skip-link{position:absolute;left:16px;top:8px;transform:translateY(-200%);padding:10px 16px;background:#17272d;color:#fff;border-radius:6px;z-index:10}.skip-link:focus{transform:none}[tabindex="-1"]:focus{outline:3px solid #b04912;outline-offset:4px}.field-error{color:#8a2915;font-weight:600;overflow-wrap:anywhere}.errors{border-left:4px solid #a33018;background:#fff1ed;padding:16px;overflow-wrap:anywhere}[aria-invalid="true"]{border-color:#a33018!important}form[aria-busy="true"]{border-color:#687f80}body{margin:0}main{max-width:920px;margin:auto;padding:32px 20px 80px}header{border-bottom:2px solid #12605c;margin-bottom:24px}h1{font-size:clamp(1.8rem,5vw,2.7rem);line-height:1.15}h2{font-size:1.2rem}.notice{background:#e5f1ef;border-left:4px solid #12605c;padding:16px}dl{display:grid;grid-template-columns:1fr 1fr;gap:12px}dl>div{background:white;border:1px solid #cad6d5;border-radius:8px;padding:14px;min-width:0}dt{font-size:.85rem;color:#405a60}dd{margin:4px 0 0;font-weight:600;overflow-wrap:anywhere}form{background:white;margin:24px 0;padding:24px;border:1px solid #cad6d5;border-radius:12px}label{display:block;margin-top:16px}input,select,textarea,button{font:inherit}select,textarea{width:100%;padding:10px}button{padding:12px 18px;border:1px solid #12605c;border-radius:8px;min-height:44px;background:#12605c;color:white;cursor:pointer}button:disabled{background:#637778;cursor:not-allowed}a{color:#075752}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #b04912;outline-offset:3px}.actions{display:flex;align-items:center;gap:20px;margin:20px 0;flex-wrap:wrap}.recovery{border-left:4px solid #b04912;padding:4px 0 4px 20px;margin:24px 0}.recovery form{margin-bottom:0}[hidden]{display:none!important}@media(max-width:600px){dl{grid-template-columns:1fr}form{padding:16px}}@media print{form,button,script{display:none}body{background:white}}
</style><script src="/assets/creator-review.js" defer></script></head><body data-case-id="${caseId}"><a id="skip-link" class="skip-link" href="#main-content">Skip to main content</a><main id="main-content" tabindex="-1"><header><p>RIGHTSRECEIPT / CREATOR REVIEW</p><h1>Review the exact licensing offer.</h1><p>Sandbox workflow. Human decisions remain separate from payment and permission.</p></header><p class="notice" id="status" tabindex="-1" role="status" aria-live="polite">Checking your creator session.</p><div class="actions"><button id="reload" type="button">Reload current offer</button><a href="/creator/clarification/${caseId}">Review buyer answers and rights terms</a><a href="/creator/review/${caseId}">Sign in or refresh session</a><a href="/cdn-cgi/access/logout">Sign out of Access apps</a></div><section aria-labelledby="offer-title"><h2 id="offer-title" tabindex="-1">Rights and price</h2><dl id="offer"></dl></section><form id="decision-form" hidden novalidate><h2>Record an explicit decision</h2><div id="decision-errors" class="errors" hidden role="alert" tabindex="-1"><h3>Check your decision before saving</h3><ul id="decision-error-list"></ul></div><label for="decision">Decision</label><select id="decision"><option value="approved">Approve this offer</option><option value="clarification_requested">Request revised terms</option><option value="rejected">Reject this case</option></select><label for="reason">Reason (required for rejection or revised terms)</label><textarea id="reason" maxlength="500" rows="3" aria-describedby="reason-help"></textarea><p id="reason-help">Explain your decision when requesting revised terms or rejecting this case. Use no more than 500 characters.</p><p id="consent-copy"></p><label><input type="checkbox" id="confirm"> I have reviewed these exact rights and price and confirm the displayed statement.</label><div class="actions"><button id="submit" type="submit" disabled>Save explicit decision</button></div></form><section id="invoice-panel" hidden aria-labelledby="invoice-title"><h2 id="invoice-title" tabindex="-1">Sandbox invoice controls</h2><p id="invoice-status" role="status" aria-live="polite"></p><dl id="invoice-info"></dl><form id="create-form" hidden><h2>Create the accepted offer as a draft</h2><p>A draft records the exact accepted rights and USD price in PayPal Sandbox. Sending requires a separate action.</p><label><input type="checkbox" id="create-confirm"> I confirm creation of one Sandbox draft for this exact accepted offer.</label><div class="actions"><button id="create-invoice" type="submit" disabled>Create Sandbox draft</button></div></form><form id="send-form" hidden><h2>Send the recorded Sandbox invoice</h2><p>This sends the displayed Sandbox invoice to the buyer recorded with the accepted offer. Check the invoice reference and accepted price before confirming.</p><label><input type="checkbox" id="send-confirm"> I confirm sending this exact Sandbox invoice to the recorded buyer.</label><div class="actions"><button id="send-invoice" type="submit" disabled>Send this Sandbox invoice</button></div></form><section id="recovery-panel" hidden aria-labelledby="recovery-title" class="recovery"><h2 id="recovery-title" tabindex="-1">Resolve an unfinished invoice attempt</h2><p id="recovery-status" role="status" aria-live="polite"></p><dl id="recovery-info"></dl><form id="recovery-form" hidden><p id="recovery-copy"></p><label><input type="checkbox" id="recovery-confirm"> I have reviewed this invoice attempt and confirm the action described above.</label><div class="actions"><button id="recovery-command" type="submit" disabled>Continue the recorded invoice attempt</button></div></form></section></section><p>Approval, buyer acceptance, draft creation and invoice sending are separate actions. No payment, ownership guarantee, or permission is inferred from these actions. Review expires after five minutes or when the session ends. Every command rechecks the current offer and session.</p></main></body></html>`;
}
export function createCreatorReviewRoutes(auth: ReturnType<typeof createCreatorSessionAuthorization>, now = Date.now) {
  let minute = 0, count = 0;
  return async (request: Request, env: CreatorReviewBindings | undefined): Promise<Response | null> => {
    const url = new URL(request.url), match = PATH.exec(url.pathname);
    if (!url.pathname.startsWith("/creator/review/") && url.pathname !== "/api/creator/session" && url.pathname !== "/assets/creator-review.js") return null;
    const error = (status: number, code: string) => response(JSON.stringify({ error: code }), status, "application/json; charset=utf-8");
    const sessionOnly = url.pathname === "/api/creator/session"
      && (env?.CLARIFICATION_ENABLED === "true" || env?.REQUEST_INTAKE_ENABLED === "true");
    if (!env || (env.CREATOR_REVIEW_ENABLED !== "true" && !sessionOnly) || env.PAYPAL_MODE !== "paypal_sandbox" || !env.DB
      || env.CREATOR_ACCESS_ENABLED !== "true" || !["sandbox", "judge"].includes(env.APP_MODE ?? "")) return error(503, "creator_review_unavailable");
    if (url.origin !== env.CREATOR_ACCESS_ORIGIN || url.search) return error(400, "invalid_request");
    if (request.method !== "GET") return error(405, "method_not_allowed");
    const next = Math.floor(now() / 60000); if (next !== minute) { minute = next; count = 0; }
    if (++count > 120) return error(429, "rate_limited");
    if (url.pathname.startsWith("/creator/review/") && !match) return error(404, "not_found");
    const session = await auth.session(request, env); if (!session) return error(403, "not_authorized");
    if (url.pathname === "/api/creator/session") {
      const expiresInMs = session.expiresAt * 1000 - now(); if (expiresInMs <= 0) return error(403, "not_authorized");
      return response(JSON.stringify({ authenticated: true, environment: "sandbox", expiresInMs }), 200, "application/json; charset=utf-8");
    }
    if (url.pathname === "/assets/creator-review.js") return response(CREATOR_REVIEW_CLIENT, 200, "text/javascript; charset=utf-8");
    if (!match || !await auth.authorize(request, match[1]!, env)) return error(403, "not_authorized");
    const nonce = crypto.randomUUID().replace(/-/gu, "");
    return response(renderCreatorReview(match[1]!, nonce), 200, "text/html; charset=utf-8", nonce);
  };
}
