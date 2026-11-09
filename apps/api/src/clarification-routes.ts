/** Header-authorized buyer evidence and managed-session creator re-review. */
import { createClarificationWorkflow, ClarificationError } from "../../../packages/application/src/clarification-workflow";
import type { CreatorPrincipal } from "../../../packages/application/src/consent-contract";
import { createD1ClarificationStore } from "../../../packages/persistence/src/clarification-workflow";
import type { HumanConsentBindings } from "./human-consent-routes";
import { strictSecurityJson } from "./security/strict-json";
export interface ClarificationBindings extends HumanConsentBindings { readonly CLARIFICATION_ENABLED?: string }
const CREATOR = /^\/api\/clarification\/creator\/cases\/([0-9a-f-]{36})\/(review|terms)$/u;
const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "X-Robots-Tag": "noindex, nofollow" };
function reply(status: number, data: unknown, extra?: Record<string, string>) { return new Response(JSON.stringify(data), { status, headers: { ...HEADERS, ...extra } }); }
async function body(request: Request) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers.get("content-type") ?? "")
    || request.headers.has("content-encoding")) throw new ClarificationError("invalid_command");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > 98304)) throw new ClarificationError("invalid_command");
  const stream = request.body?.getReader(); if (!stream) throw new ClarificationError("invalid_command");
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await stream.read(); if (part.done) break;
      size += part.value.byteLength; if (size > 98304) { await stream.cancel(); throw new Error(); } chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return strictSecurityJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes), 98304);
  } catch { throw new ClarificationError("invalid_command"); }
  finally { stream.releaseLock(); }
}
function configuration(env: ClarificationBindings | undefined) {
  if (!env?.DB || env.CLARIFICATION_ENABLED !== "true" || env.HUMAN_CONSENT_ENABLED !== "true"
    || env.PAYPAL_MODE !== "paypal_sandbox" || !["sandbox", "judge"].includes(env.APP_MODE ?? "")) throw new Error();
  const origin = new URL(env.HUMAN_CONSENT_ORIGIN ?? "");
  if (origin.origin !== env.HUMAN_CONSENT_ORIGIN || origin.protocol !== "https:" || origin.username || origin.password) throw new Error();
  return { origin: origin.origin, db: env.DB, signature: JSON.stringify([env.APP_MODE, env.PAYPAL_MODE, env.CLARIFICATION_ENABLED,
    env.HUMAN_CONSENT_ENABLED, env.HUMAN_CONSENT_ORIGIN, env.CREATOR_ACCESS_ENABLED, env.CREATOR_ACCESS_ORIGIN,
    env.CREATOR_ACCESS_ISSUER, env.CREATOR_ACCESS_AUDIENCE, env.CREATOR_ACCESS_PRINCIPALS]) };
}
export function createClarificationRoutes(deps: {
  readonly authorizeCreator?: (request: Request, caseId: string, env: ClarificationBindings) => Promise<CreatorPrincipal | null>;
  readonly now?: () => Date; readonly limit?: (request: Request) => boolean;
} = {}) {
  let window = 0, used = 0;
  function allowed(request: Request) {
    if (deps.limit) return deps.limit(request);
    const minute = Math.floor((deps.now?.() ?? new Date()).getTime() / 60000);
    if (minute !== window) { window = minute; used = 0; } return ++used <= 60;
  }
  return async (request: Request, env: ClarificationBindings | undefined): Promise<Response | null> => {
    const url = new URL(request.url); if (!url.pathname.startsWith("/api/clarification/")) return null;
    let config: ReturnType<typeof configuration>;
    try { config = configuration(env); } catch { return reply(503, { error: "clarification_unavailable" }); }
    if (url.origin !== config.origin || url.search) return reply(400, { error: "invalid_request" });
    const creator = CREATOR.exec(url.pathname), buyerReview = url.pathname === "/api/clarification/buyer/review", buyerAnswers = url.pathname === "/api/clarification/buyer/answers";
    if (!creator && !buyerReview && !buyerAnswers) return reply(404, { error: "not_found" });
    const write = buyerAnswers || creator?.[2] === "terms", method = write ? "POST" : "GET";
    if (request.method !== method) return reply(405, { error: "method_not_allowed" }, { Allow: method });
    if ((write && request.headers.get("origin") !== config.origin)
      || (request.headers.has("origin") && request.headers.get("origin") !== config.origin)
      || (request.headers.has("sec-fetch-site") && !(write ? ["same-origin"] : ["same-origin", "none"]).includes(request.headers.get("sec-fetch-site")!))) return reply(403, { error: "not_authorized" });
    if (!allowed(request)) return reply(429, { error: "rate_limited" }, { "Retry-After": "60" });
    function checkActive() {
      try {
        const fresh = configuration(env);
        if (request.signal.aborted || fresh.db !== config.db || fresh.signature !== config.signature) throw new Error();
      } catch { throw new ClarificationError("not_authorized"); }
    }
    const service = createClarificationWorkflow({ store: createD1ClarificationStore(config.db),
      authorizeCreator: caseId => deps.authorizeCreator?.(request, caseId, env!) ?? Promise.resolve(null),
      ...(deps.now ? { now: deps.now } : {}), checkActive });
    try {
      let result: unknown;
      if (creator) result = write ? await service.saveCreatorTerms(creator[1]!, await body(request)) : await service.reviewCreator(creator[1]!);
      else {
        const token = /^Bearer ([A-Za-z0-9_-]{43})$/u.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!token) return reply(403, { error: "not_authorized" });
        result = write ? await service.answerBuyer(token, await body(request)) : await service.reviewBuyer(token);
      }
      checkActive(); return reply(200, result);
    } catch (error) {
      const code = error instanceof ClarificationError ? error.code : "storage_unavailable";
      return reply(code === "not_authorized" ? 403 : code === "not_found" ? 404 : code === "invalid_command" ? 400
        : code === "storage_unavailable" ? 503 : 409, { error: code });
    }
  };
}
