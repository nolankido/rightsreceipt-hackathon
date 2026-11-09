/** Native HTTP composition with default-denied creator sessions. No invoice
 * creation, financial action, or permission issuance exists on these routes.
 */
import { createHumanConsentService, ConsentError } from "../../../packages/application/src/human-consent";
import type { CreatorAccessBindings } from "./security/creator-access";
import type { CreatorPrincipal } from "../../../packages/application/src/consent-contract";
import { createD1HumanConsentStore, type ConsentDatabase } from "../../../packages/persistence/src/human-consent";
export interface HumanConsentBindings extends CreatorAccessBindings {
  readonly APP_MODE?: string; readonly PAYPAL_MODE?: string; readonly HUMAN_CONSENT_ENABLED?: string;
  readonly HUMAN_CONSENT_ORIGIN?: string; readonly DB?: ConsentDatabase;
}
const CREATOR = /^\/api\/consent\/creator\/cases\/([0-9a-f-]{36})\/(review|decision)$/u;
export function isHumanConsentPath(path: string): boolean { return path.startsWith("/api/consent/"); }
const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private",
  "Pragma": "no-cache", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "X-Robots-Tag": "noindex, nofollow" };
function reply(status: number, data: unknown, extra?: Record<string, string>) {
  return new Response(JSON.stringify(data), { status, headers: { ...HEADERS, ...extra } });
}
/** Detect duplicate decoded top-level keys, including escaped-key spellings.
 * JSON.parse validates grammar; commands permit scalar fields only.
 */
function parsedBody(raw: string): unknown {
  const parsed: unknown = JSON.parse(raw), keys = new Set<string>();
  let depth = 0, expectsKey = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') {
      const start = i++;
      while (i < raw.length) { if (raw[i] === "\\") i += 2; else if (raw[i] === '"') break; else i++; }
      if (depth === 1 && expectsKey) {
        const key: string = JSON.parse(raw.slice(start, i + 1));
        if (keys.has(key)) throw new Error("Duplicate command key."); keys.add(key); expectsKey = false;
      }
    } else if (c === "{" || c === "[") { depth++; if (depth === 1) expectsKey = true; }
    else if (c === "}" || c === "]") depth--;
    else if (c === "," && depth === 1) expectsKey = true;
  }
  return parsed;
}
async function body(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers.get("content-type") ?? "")) throw new ConsentError("invalid_command");
  if (request.headers.has("content-encoding")) throw new ConsentError("invalid_command");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > 4096)) throw new ConsentError("invalid_command");
  const stream = request.body?.getReader(); if (!stream) throw new ConsentError("invalid_command");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await stream.read(); if (part.done) break;
      size += part.value.byteLength; if (size > 4096) { await stream.cancel(); throw new ConsentError("invalid_command"); }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
    return parsedBody(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { throw new ConsentError("invalid_command"); }
  finally { stream.releaseLock(); }
}
export function createHumanConsentRoutes(deps: {
  readonly authorizeCreator?: (request: Request, caseId: string, env: HumanConsentBindings) => Promise<CreatorPrincipal | null>;
  readonly now?: () => Date;
  readonly limit?: (request: Request) => boolean;
} = {}) {
  // Deliberately coarse per-isolate bound. Deployment still needs distributed edge limits.
  let window = 0, used = 0;
  function allowed(request: Request) {
    if (deps.limit) return deps.limit(request);
    const minute = Math.floor(Date.now() / 60000);
    if (minute !== window) { window = minute; used = 0; }
    return ++used <= 60;
  }
  return async (request: Request, env: HumanConsentBindings | undefined): Promise<Response | null> => {
    const url = new URL(request.url); if (!isHumanConsentPath(url.pathname)) return null;
    if (!env?.DB || env.HUMAN_CONSENT_ENABLED !== "true" || env.PAYPAL_MODE !== "paypal_sandbox"
      || !["sandbox", "judge"].includes(env.APP_MODE ?? "")) return reply(503, { error: "consent_unavailable" });
    let origin: URL;
    try {
      origin = new URL(env.HUMAN_CONSENT_ORIGIN ?? "");
      if (origin.origin !== env.HUMAN_CONSENT_ORIGIN || origin.protocol !== "https:" || origin.username || origin.password) throw new Error();
    } catch { return reply(503, { error: "consent_unavailable" }); }
    if (url.origin !== origin.origin || url.search) return reply(400, { error: "invalid_request" });
    if (!allowed(request)) return reply(429, { error: "rate_limited" }, { "Retry-After": "60" });
    const creator = CREATOR.exec(url.pathname);
    const buyerReview = url.pathname === "/api/consent/buyer/review", buyerAccept = url.pathname === "/api/consent/buyer/accept";
    if (!creator && !buyerReview && !buyerAccept) return reply(404, { error: "not_found" });
    const write = buyerAccept || creator?.[2] === "decision", method = write ? "POST" : "GET";
    if (request.method !== method) return reply(405, { error: "method_not_allowed" }, { Allow: method });
    if (write && (request.headers.get("origin") !== origin.origin
      || (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin"))) return reply(403, { error: "not_authorized" });
    const service = createHumanConsentService({ store: createD1HumanConsentStore(env.DB), ...(deps.now ? { now: deps.now } : {}),
      authorizeCreator: caseId => deps.authorizeCreator?.(request, caseId, env) ?? Promise.resolve(null) });
    try {
      let data: unknown;
      if (creator) {
        data = write ? await service.decideCreator(creator[1]!, await body(request)) : await service.reviewCreator(creator[1]!);
      } else {
        const token = /^Bearer ([A-Za-z0-9_-]{43})$/u.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!token) return reply(403, { error: "not_authorized" });
        data = write ? await service.acceptBuyer(token, await body(request)) : await service.reviewBuyer(token);
      }
      return reply(200, data);
    } catch (error) {
      const code = error instanceof ConsentError ? error.code : error instanceof SyntaxError ? "invalid_command" : "storage_unavailable";
      const status = code === "not_authorized" ? 403 : code === "not_found" ? 404 : code === "invalid_command" ? 400
        : code === "storage_unavailable" ? 503 : 409;
      return reply(status, { error: code });
    }
  };
}
