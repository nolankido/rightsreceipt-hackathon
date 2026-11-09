/** Web-standard handler used by the Worker and executable without a framework.
 * Read-only routes. Creator authorization is injected and denied when absent.
 */
import type { ReceiptStore } from "./contract";
import { createReceiptReader, emptyVerification, validPublicReceiptId } from "./experience";
import { validReceiptCaseId, type ReceiptDirectory } from "./access";
import { RECEIPT_CLIENT_JS } from "./client";
import { renderAccessShell, renderPrivateReceipt, renderPublicVerification, renderUnavailable } from "./presentation";
import { sha256Hex } from "./canonical";

export interface ReceiptHttpDependencies {
  readonly store: Pick<ReceiptStore, "load">;
  readonly directory: ReceiptDirectory;
  readonly publicOrigin: string;
  readonly now?: () => Date;
  readonly authorizeCreator?: (request: Request, caseId: string) => Promise<boolean>;
  /** Must be supplied by the runtime. Throwing denies access; no fail-open path. */
  readonly allowRead: (request: Request) => Promise<boolean>;
}
export function isReceiptExperiencePath(path: string): boolean {
  return path === "/receipts/buyer" || path === "/assets/receipt-access.js" || path.startsWith("/verify/receipt/")
    || path.startsWith("/api/receipt-verification/") || path === "/api/receipts/buyer" || path.startsWith("/api/receipts/creator/");
}
export function checkedReceiptOrigin(value: string): string {
  const u = new URL(value);
  const local = u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if ((!local && u.protocol !== "https:") || u.username || u.password || u.search || u.hash
    || u.pathname !== "/" || u.origin !== value || value.length > 80 || !/^[\x21-\x7e]+$/u.test(value)) {
    throw new Error("Invalid trusted receipt origin.");
  }
  return u.origin;
}
const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "Expires": "0",
  "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow, noarchive", "Vary": "Authorization, Cookie",
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()", "Cross-Origin-Resource-Policy": "same-origin",
};
export function receiptHttpResponse(body: string, status: number, contentType = "application/json; charset=utf-8", extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { ...HEADERS, "Content-Type": contentType, ...extra } });
}
function errorResponse(status: number, code: string, html: boolean): Response {
  const title = status === 404 ? "Receipt unavailable" : status === 429 ? "Too many requests" : "Receipt not ready";
  const message = status === 404 ? "Access was not authorized or no matching receipt is available."
    : status === 429 ? "Wait before retrying this read. No payment action is needed."
      : "A current valid receipt could not be provided. Refresh the record or review its status.";
  return receiptHttpResponse(html ? renderUnavailable(title, message) : JSON.stringify({ status: code }), status,
    html ? "text/html; charset=utf-8" : undefined, status === 429 ? { "Retry-After": "60" } : {});
}
export function createReceiptExperienceHandler(deps: ReceiptHttpDependencies) {
  const origin = checkedReceiptOrigin(deps.publicOrigin), now = deps.now ?? (() => new Date());
  const reader = createReceiptReader(deps.store, now);
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url), path = url.pathname;
    if (!isReceiptExperiencePath(path)) return null;
    const page = path.startsWith("/verify/") || path === "/receipts/buyer";
    if (request.method !== "GET") return receiptHttpResponse(JSON.stringify({ status: "method_not_allowed" }), 405, undefined, { Allow: "GET" });
    if (url.origin !== origin || path.length > 200 || request.headers.get("Origin") && request.headers.get("Origin") !== origin) {
      return errorResponse(404, "not_found", page);
    }
    try {
      if (await deps.allowRead(request) !== true) return errorResponse(429, "rate_limited", page);
      if (path === "/assets/receipt-access.js") return receiptHttpResponse(RECEIPT_CLIENT_JS, 200, "text/javascript; charset=utf-8");
      if (path === "/receipts/buyer") {
        if (url.search) return errorResponse(404, "not_found", true);
        return receiptHttpResponse(renderAccessShell(), 200, "text/html; charset=utf-8");
      }
      if (path.startsWith("/verify/receipt/") || path.startsWith("/api/receipt-verification/")) {
        const prefix = path.startsWith("/verify/") ? "/verify/receipt/" : "/api/receipt-verification/";
        const publicId = path.slice(prefix.length);
        // No query parameters, encoded identifiers, sequential IDs or export mode.
        const caseId = !url.search && validPublicReceiptId(publicId) ? await deps.directory.byPublicId(publicId) : null;
        let view = emptyVerification("not_found", now().toISOString());
        if (caseId) {
          const result = await reader.read(caseId, publicId);
          view = await reader.unchanged(result) ? result.publicView : emptyVerification("review_required", now().toISOString());
        }
        const code = view.status === "not_found" ? 404 : 200;
        return receiptHttpResponse(page ? renderPublicVerification(view) : JSON.stringify(view), code,
          page ? "text/html; charset=utf-8" : "application/json; charset=utf-8");
      }
      const format = url.searchParams.get("format") ?? "html";
      if (!["html", "print", "json"].includes(format) || [...url.searchParams.keys()].some(k => k !== "format")
        || url.searchParams.getAll("format").length > 1 || request.headers.get("Sec-Fetch-Site") === "cross-site") {
        return errorResponse(404, "not_found", format !== "json");
      }
      const buyer = path === "/api/receipts/buyer";
      const token = /^Bearer ([A-Za-z0-9_-]{43})$/u.exec(request.headers.get("Authorization") ?? "")?.[1];
      let caseId: string | null = null;
      if (buyer) caseId = token ? await deps.directory.byBuyerToken(token, now().toISOString()) : null;
      else {
        const target = path.slice("/api/receipts/creator/".length);
        if (validReceiptCaseId(target) && await deps.authorizeCreator?.(request, target) === true) caseId = target;
      }
      if (!caseId) return errorResponse(404, "not_found", format !== "json");
      const result = await reader.read(caseId);
      // A capability/session can expire or be revoked during asynchronous hashing.
      const authorized = buyer ? token && await deps.directory.byBuyerToken(token, now().toISOString()) === caseId
        : await deps.authorizeCreator?.(request, caseId) === true;
      if (!authorized) return errorResponse(404, "not_found", format !== "json");
      if (!result.payload || !result.record || !await reader.unchanged(result)) return errorResponse(409, "receipt_not_current", format !== "json");
      // The final source read also yields. A revocation during that read must
      // not release private receipt data under an earlier authorization result.
      const stillAuthorized = buyer ? token && await deps.directory.byBuyerToken(token, now().toISOString()) === caseId
        : await deps.authorizeCreator?.(request, caseId) === true;
      if (!stillAuthorized) return errorResponse(404, "not_found", format !== "json");
      if (now().toISOString().slice(0, 10) !== result.publicView.checkedAt.slice(0, 10)) {
        return errorResponse(409, "receipt_not_current", format !== "json");
      }
      if (format === "json") return receiptHttpResponse(result.record.canonical, 200, "application/json; charset=utf-8", {
        "Content-Disposition": `attachment; filename="rightsreceipt-sandbox-revision-${result.record.revision}.json"`,
        "X-Receipt-SHA256": result.record.hash,
      });
      return receiptHttpResponse(renderPrivateReceipt(result.payload, result.publicView,
        `${origin}/verify/receipt/${result.payload.verification_public_id}`), 200, "text/html; charset=utf-8",
      { "X-Receipt-SHA256": result.record.hash });
    } catch { return errorResponse(503, "temporarily_unavailable", page); }
  };
}
/** Bounded, per-isolate defense only. Deployment must add edge rate limiting.
 * Stores a salted digest of the platform-provided IP, never tokens or raw IPs.
 */
export function createReceiptReadLimiter(clock: () => number = Date.now, maximum = 60) {
  const salt = crypto.randomUUID(), entries = new Map<string, { start: number; count: number }>();
  return async (request: Request): Promise<boolean> => {
    const key = await sha256Hex(`${salt}:${request.headers.get("CF-Connecting-IP") ?? "unknown-client"}`);
    const at = clock();
    for (const [k, v] of entries) if (at - v.start >= 60_000 || at < v.start) entries.delete(k);
    let entry = entries.get(key);
    if (!entry) { if (entries.size >= 2048) return false; entry = { start: at, count: 0 }; entries.set(key, entry); }
    entry.count++; return entry.count <= maximum;
  };
}
