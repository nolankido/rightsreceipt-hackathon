/** Native intake uses a managed creator session and a buyer bearer header, never a secret URL path. */
import { createRequestIntakeService, RequestIntakeError } from "../../../packages/application/src/request-intake";
import type { RequestIntakePrincipal } from "../../../packages/application/src/request-intake-contract";
import { createD1RequestIntakeStore } from "../../../packages/persistence/src/request-intake";
import type { HumanConsentBindings } from "./human-consent-routes";
import { strictSecurityJson } from "./security/strict-json";
export interface RequestIntakeBindings extends HumanConsentBindings {
  readonly REQUEST_INTAKE_ENABLED?: string; readonly CLARIFICATION_ENABLED?: string;
}
const CREATOR = /^\/api\/intake\/creator\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(review|links)$/u;
const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "X-Robots-Tag": "noindex, nofollow" };
function reply(status: number, value: unknown, extra?: Record<string, string>) {
  return new Response(JSON.stringify(value), { status, headers: { ...HEADERS, ...extra } });
}
async function body(request: Request) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers.get("content-type") ?? "")
    || request.headers.has("content-encoding")) throw new RequestIntakeError("invalid_command");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > 32768)) throw new RequestIntakeError("invalid_command");
  const stream = request.body?.getReader(); if (!stream) throw new RequestIntakeError("invalid_command");
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await stream.read(); if (part.done) break;
      size += part.value.byteLength; if (size > 32768) { await stream.cancel(); throw new Error(); } chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return strictSecurityJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes), 32768);
  } catch { throw new RequestIntakeError("invalid_command"); }
  finally { stream.releaseLock(); }
}
function configuration(env: RequestIntakeBindings | undefined, creator: boolean) {
  if (!env?.DB || env.REQUEST_INTAKE_ENABLED !== "true" || env.HUMAN_CONSENT_ENABLED !== "true" || env.CLARIFICATION_ENABLED !== "true"
    || env.PAYPAL_MODE !== "paypal_sandbox" || !["sandbox", "judge"].includes(env.APP_MODE ?? "")) throw new Error();
  const origin = new URL(env.HUMAN_CONSENT_ORIGIN ?? "");
  if (origin.origin !== env.HUMAN_CONSENT_ORIGIN || origin.protocol !== "https:" || origin.username || origin.password
    || (creator && env.CREATOR_ACCESS_ORIGIN !== origin.origin)) throw new Error();
  return { origin: origin.origin, db: env.DB, signature: JSON.stringify([env.APP_MODE, env.PAYPAL_MODE, env.REQUEST_INTAKE_ENABLED,
    env.HUMAN_CONSENT_ENABLED, env.CLARIFICATION_ENABLED, env.HUMAN_CONSENT_ORIGIN, env.CREATOR_ACCESS_ENABLED, env.CREATOR_ACCESS_ORIGIN,
    env.CREATOR_ACCESS_ISSUER, env.CREATOR_ACCESS_AUDIENCE, env.CREATOR_ACCESS_PRINCIPALS]) };
}
export function createRequestIntakeRoutes(deps: {
  readonly authorizeCreatorAsset?: (request: Request, assetId: string, env: RequestIntakeBindings) => Promise<RequestIntakePrincipal | null>;
  readonly now?: () => Date; readonly limit?: (request: Request) => boolean;
} = {}) {
  let window = 0, used = 0;
  function allowed(request: Request) {
    if (deps.limit) return deps.limit(request);
    const minute = Math.floor((deps.now?.() ?? new Date()).getTime() / 60000);
    if (minute !== window) { window = minute; used = 0; } return ++used <= 60;
  }
  return async (request: Request, env: RequestIntakeBindings | undefined): Promise<Response | null> => {
    const url = new URL(request.url); if (!url.pathname.startsWith("/api/intake/")) return null;
    const creator = CREATOR.exec(url.pathname), buyerReview = url.pathname === "/api/intake/buyer/review", buyerRequest = url.pathname === "/api/intake/buyer/request";
    let config: ReturnType<typeof configuration>;
    try { config = configuration(env, !!creator); } catch { return reply(503, { error: "request_intake_unavailable" }); }
    if (url.origin !== config.origin || url.search) return reply(400, { error: "invalid_request" });
    if (!creator && !buyerReview && !buyerRequest) return reply(404, { error: "not_found" });
    const write = buyerRequest || creator?.[2] === "links", method = write ? "POST" : "GET";
    if (request.method !== method) return reply(405, { error: "method_not_allowed" }, { Allow: method });
    if ((write && request.headers.get("origin") !== config.origin)
      || (request.headers.has("origin") && request.headers.get("origin") !== config.origin)
      || (request.headers.has("sec-fetch-site") && !(write ? ["same-origin"] : ["same-origin", "none"]).includes(request.headers.get("sec-fetch-site")!))) return reply(403, { error: "not_authorized" });
    if (!allowed(request)) return reply(429, { error: "rate_limited" }, { "Retry-After": "60" });
    function checkActive() {
      try {
        const fresh = configuration(env, !!creator);
        if (request.signal.aborted || fresh.db !== config.db || fresh.signature !== config.signature) throw new Error();
      } catch { throw new RequestIntakeError("not_authorized"); }
    }
    const service = createRequestIntakeService({ store: createD1RequestIntakeStore(config.db),
      authorizeCreatorAsset: assetId => deps.authorizeCreatorAsset?.(request, assetId, env!) ?? Promise.resolve(null),
      ...(deps.now ? { now: deps.now } : {}), checkActive });
    try {
      let result: unknown;
      if (creator) result = write ? await service.issueLink(creator[1]!, await body(request)) : await service.reviewCreator(creator[1]!);
      else {
        const token = /^Bearer ([A-Za-z0-9_-]{43})$/u.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!token) return reply(403, { error: "not_authorized" });
        result = write ? await service.submitRequest(token, await body(request)) : await service.reviewBuyer(token);
      }
      checkActive(); return reply(200, result);
    } catch (error) {
      const code = error instanceof RequestIntakeError ? error.code : "storage_unavailable";
      return reply(code === "not_authorized" ? 403 : code === "not_found" ? 404 : code === "invalid_command" ? 400
        : code === "storage_unavailable" ? 503 : 409, { error: code });
    }
  };
}
