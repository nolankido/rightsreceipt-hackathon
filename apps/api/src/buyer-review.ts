/** Public shell for capability-authorized review. Creator login does not gate buyer access. */
import { BUYER_REVIEW_CLIENT } from "../../web/src/buyer-review-client";
export interface BuyerReviewBindings {
  readonly BUYER_REVIEW_ENABLED?: string;
  readonly HUMAN_CONSENT_ENABLED?: string;
  readonly HUMAN_CONSENT_ORIGIN?: string;
  readonly APP_MODE?: string;
  readonly PAYPAL_MODE?: string;
}
const HEADERS = {
  "Cache-Control": "no-store, private", "Pragma": "no-cache", "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "X-Robots-Tag": "noindex, nofollow",
};
function response(body: string, status: number, type: string, nonce = "", extra?: Record<string, string>) {
  return new Response(body, { status, headers: { ...HEADERS, ...extra, "Content-Type": type,
    "Content-Security-Policy": `default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'` } });
}
export function renderBuyerReview(nonce: string): string {
  if (!/^[a-f0-9]{32}$/u.test(nonce)) throw new Error("Invalid review page.");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Review your license | RightsReceipt</title><style nonce="${nonce}">
:root{font-family:system-ui,sans-serif;color:#17272d;background:#f5f7f7;line-height:1.55}*{box-sizing:border-box}.skip-link{position:absolute;left:16px;top:8px;transform:translateY(-200%);padding:10px 16px;background:#17272d;color:#fff;border-radius:6px;z-index:10}.skip-link:focus{transform:none}[tabindex="-1"]:focus{outline:3px solid #b04912;outline-offset:4px}.field-error{color:#8a2915;font-weight:600;overflow-wrap:anywhere}.errors{border-left:4px solid #a33018;background:#fff1ed;padding:16px;overflow-wrap:anywhere}[aria-invalid="true"]{border-color:#a33018!important}form[aria-busy="true"]{border-color:#687f80}body{margin:0}main{max-width:920px;margin:auto;padding:32px 20px 80px}header{border-bottom:2px solid #12605c;margin-bottom:24px}h1{font-size:clamp(1.8rem,5vw,2.7rem);line-height:1.15}h2{font-size:1.2rem}.notice{background:#e5f1ef;border-left:4px solid #12605c;padding:16px}dl{display:grid;grid-template-columns:1fr 1fr;gap:12px}dl>div{background:white;border:1px solid #cad6d5;border-radius:8px;padding:14px;min-width:0}dt{font-size:.85rem;color:#405a60}dd{margin:4px 0 0;font-weight:600;overflow-wrap:anywhere}form{background:white;padding:24px;border:1px solid #cad6d5;border-radius:12px;margin:24px 0}label{display:block;margin-top:16px}input,button{font:inherit}input[type=password]{width:100%;max-width:38rem;padding:12px;border:1px solid #687f80;border-radius:6px}button{padding:12px 18px;border:1px solid #12605c;border-radius:8px;min-height:44px;background:#12605c;color:white;cursor:pointer}button:disabled{background:#637778;cursor:not-allowed}a{color:#075752;overflow-wrap:anywhere}a.button{display:inline-block;padding:12px 18px;border:1px solid #12605c;border-radius:8px;background:#12605c;color:white;text-decoration:none;min-height:44px}button:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid #b04912;outline-offset:3px}.actions{display:flex;align-items:center;gap:20px;margin:20px 0;flex-wrap:wrap}[hidden]{display:none!important}@media(max-width:600px){dl{grid-template-columns:1fr}form{padding:16px}}@media print{form,button,script,#payment-handoff{display:none}body{background:white}}
</style><script src="/assets/buyer-review.js" defer></script></head><body><a id="skip-link" class="skip-link" href="#main-content">Skip to main content</a><main id="main-content" tabindex="-1"><header><p>RIGHTSRECEIPT / BUYER REVIEW</p><h1>Know exactly what you are accepting.</h1><p>Review the creator-approved rights, restrictions, dates and price.</p></header><p class="notice" id="status" tabindex="-1" role="status" aria-live="polite">Open your private review link or enter your review code.</p><form id="access-form"><h2>Open your private offer</h2><p>Your review code grants access to this offer. Keep it private.</p><label for="access-code">Private review code</label><input id="access-code" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="43" aria-describedby="access-help access-error"><p id="access-help">Use the 43-character code after the # in your creator's review link.</p><p id="access-error" class="field-error" hidden></p><div class="actions"><button type="submit">Open offer</button></div></form><div class="actions"><button id="reload" type="button" disabled>Reload current offer</button><button id="open-clarification" type="button" disabled>Answer clarification questions</button></div><p>If your offer is still being prepared, <a href="/buyer/clarification">open clarification questions</a> and enter your private request code.</p><section aria-labelledby="offer-title"><h2 id="offer-title" tabindex="-1">Your exact licensing offer</h2><dl id="offer"></dl></section><form id="acceptance-form" hidden><h2>Accept this exact version</h2><p id="consent-copy"></p><label><input type="checkbox" id="acknowledge"> I have reviewed these exact rights, dates and price and agree to the displayed statement.</label><div class="actions"><button id="accept" type="submit" disabled>Accept these exact terms</button></div></form><section id="buyer-status-panel" hidden aria-labelledby="buyer-status-title"><h2 id="buyer-status-title" tabindex="-1">Payment and permission</h2><p id="buyer-status" role="status" aria-live="polite"></p><dl id="status-details"></dl><h3>Current permission record</h3><p id="permission-status" role="status" aria-live="polite"></p><p id="receipt-status"></p><div class="actions"><a id="verification-link" hidden rel="noreferrer">Open current public verification</a><button id="read-receipt" type="button" hidden disabled>Read current private receipt</button></div><h3>PayPal Sandbox payment</h3><p id="payment-status" tabindex="-1" role="status" aria-live="polite"></p><div class="actions"><button id="refresh-payment" type="button" disabled>Check PayPal Sandbox payment link</button><a id="payment-handoff" class="button" hidden target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Open PayPal Sandbox</a></div><p>Checking a payment link does not pay an invoice or grant permission. After using PayPal Sandbox, reopen your original private review link and reload the verified record. A PayPal return page alone is not a rights receipt.</p></section><p>Sandbox demonstration. Acceptance does not send an invoice, confirm payment, verify ownership, or grant permission. A creator sends a Sandbox invoice separately. Payment and licensing dates are checked independently.</p><p>Your review clears after five minutes or when you leave or hide this page. Reopen your private link to continue. This page does not save your review code.</p></main></body></html>`;
}
export function createBuyerReviewRoutes(now = Date.now) {
  let minute = 0, count = 0;
  return async (request: Request, env: BuyerReviewBindings | undefined): Promise<Response | null> => {
    const url = new URL(request.url);
    if (url.pathname !== "/buyer/review" && url.pathname !== "/assets/buyer-review.js") return null;
    const error = (status: number, code: string, extra?: Record<string, string>) => response(JSON.stringify({ error: code }), status, "application/json; charset=utf-8", "", extra);
    if (!env || env.BUYER_REVIEW_ENABLED !== "true" || env.HUMAN_CONSENT_ENABLED !== "true"
      || env.PAYPAL_MODE !== "paypal_sandbox" || !["sandbox", "judge"].includes(env.APP_MODE ?? "")) return error(503, "buyer_review_unavailable");
    let origin: URL;
    try {
      origin = new URL(env.HUMAN_CONSENT_ORIGIN ?? "");
      if (origin.protocol !== "https:" || origin.origin !== env.HUMAN_CONSENT_ORIGIN || origin.username || origin.password) throw new Error();
    } catch { return error(503, "buyer_review_unavailable"); }
    if (url.origin !== origin.origin || url.search || url.hash) return error(400, "invalid_request");
    if (request.method !== "GET") return error(405, "method_not_allowed", { Allow: "GET" });
    const next = Math.floor(now() / 60000); if (next !== minute) { minute = next; count = 0; }
    if (++count > 120) return error(429, "rate_limited", { "Retry-After": "60" });
    if (url.pathname === "/assets/buyer-review.js") return response(BUYER_REVIEW_CLIENT, 200, "text/javascript; charset=utf-8");
    const nonce = crypto.randomUUID().replace(/-/gu, "");
    return response(renderBuyerReview(nonce), 200, "text/html; charset=utf-8", nonce);
  };
}
