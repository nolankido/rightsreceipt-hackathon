/** Optional authenticated recovery. Opening a review never calls the provider. */
import { createInvoiceRecoveryService } from "../../../packages/application/src/invoice-recovery";
import { InvoiceRecoveryError, type InvoiceRecoveryPrincipal } from "../../../packages/application/src/invoice-recovery-contract";
import { createInvoiceCreationService, InvoiceCreationError } from "../../../packages/application/src/invoice-creation";
import { createInvoiceSendingService, InvoiceSendingError } from "../../../packages/application/src/invoice-sending";
import { createHumanConsentService } from "../../../packages/application/src/human-consent";
import { ConsentError, CONSENT_UUID } from "../../../packages/application/src/consent-contract";
import { createD1InvoiceRecoveryPersistence } from "../../../packages/persistence/src/invoice-recovery";
import { createD1HumanConsentStore } from "../../../packages/persistence/src/human-consent";
import { canonicalHash } from "../../../packages/receipts/src/canonical";
import { createPayPalSandboxDraftAdapter, type SandboxDraftDependencies } from "../../../packages/paypal/src/sandbox-draft";
import { createPayPalSandboxInvoiceAdapter } from "../../../packages/paypal/src/sandbox-invoice";
import type { InvoiceControlBindings } from "./invoice-control-routes";
import { strictSecurityJson } from "./security/strict-json";

export interface InvoiceRecoveryBindings extends InvoiceControlBindings { readonly INVOICE_RECOVERY_ENABLED?: string }
const PATH = /^\/api\/invoices\/creator\/cases\/([0-9a-f-]{36})\/(recovery|recover)$/u;
const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "X-Robots-Tag": "noindex, nofollow" };
function reply(status: number, value: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), { status, headers: { ...HEADERS, ...extra } });
}
function configuration(env: InvoiceRecoveryBindings | undefined) {
  if (!env?.DB || env.INVOICE_RECOVERY_ENABLED !== "true" || env.RIGHTS_INVOICE_CONTROLS_ENABLED !== "true"
    || env.HUMAN_CONSENT_ENABLED !== "true" || env.CREATOR_ACCESS_ENABLED !== "true" || env.PAYPAL_MODE !== "paypal_sandbox"
    || !["sandbox", "judge"].includes(env.APP_MODE ?? "")) throw new Error();
  const origin = new URL(env.CREATOR_ACCESS_ORIGIN ?? "");
  if (origin.origin !== env.CREATOR_ACCESS_ORIGIN || origin.origin !== env.HUMAN_CONSENT_ORIGIN
    || origin.protocol !== "https:" || origin.username || origin.password) throw new Error();
  // Retain configuration privately, including merchant/access identity and operation switches.
  // No value from this signature is serialized or logged.
  const signature = JSON.stringify(Object.entries(env).filter(([, v]) => typeof v === "string").sort(([a], [b]) => a.localeCompare(b)));
  return { origin: origin.origin, db: env.DB, signature };
}
async function body(request: Request) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers.get("content-type") ?? "")
    || request.headers.has("content-encoding")) throw new InvoiceRecoveryError("invalid_command");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > 4096)) throw new InvoiceRecoveryError("invalid_command");
  const reader = request.body?.getReader(); if (!reader) throw new InvoiceRecoveryError("invalid_command");
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength; if (size > 4096) { await reader.cancel(); throw new Error(); } chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return strictSecurityJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes), 4096);
  } catch { throw new InvoiceRecoveryError("invalid_command"); }
  finally { reader.releaseLock(); }
}

export function createInvoiceRecoveryRoutes(deps: {
  readonly authorizeCreator?: (request: Request, caseId: string, env: InvoiceRecoveryBindings) => Promise<InvoiceRecoveryPrincipal | null>;
  readonly transport?: (env: InvoiceRecoveryBindings) => SandboxDraftDependencies | null;
  readonly now?: () => Date;
  readonly limit?: (request: Request) => boolean;
} = {}) {
  const now = () => deps.now?.() ?? new Date();
  let minute = -1, used = 0;
  function allowed(request: Request) {
    if (deps.limit) return deps.limit(request);
    const next = Math.floor(now().getTime() / 60000);
    if (next !== minute) { minute = next; used = 0; } return ++used <= 60;
  }
  return async (request: Request, env: InvoiceRecoveryBindings | undefined): Promise<Response | null> => {
    const url = new URL(request.url), match = PATH.exec(url.pathname);
    if (!match) return null;
    let config: ReturnType<typeof configuration>;
    try { config = configuration(env); } catch { return reply(503, { error: "invoice_recovery_unavailable" }); }
    if (!CONSENT_UUID.test(match[1]!)) return reply(404, { error: "not_found" });
    if (url.origin !== config.origin || url.search) return reply(400, { error: "invalid_request" });
    const write = match[2] === "recover", method = write ? "POST" : "GET", caseId = match[1]!;
    if (request.method !== method) return reply(405, { error: "method_not_allowed" }, { Allow: method });
    if ((write && request.headers.get("origin") !== config.origin)
      || (request.headers.has("origin") && request.headers.get("origin") !== config.origin)
      || (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")) return reply(403, { error: "not_authorized" });
    if (!allowed(request)) return reply(429, { error: "rate_limited" }, { "Retry-After": "60" });
    let principal: InvoiceRecoveryPrincipal | null = null;
    function activeConfiguration() {
      try {
        const fresh = configuration(env);
        if (request.signal.aborted || fresh.db !== config.db || fresh.signature !== config.signature) throw new Error();
      } catch { throw new InvoiceRecoveryError("not_authorized"); }
    }
    function checkActive() {
      activeConfiguration();
      if (!principal || !Number.isSafeInteger(principal.expiresAt) || principal.expiresAt <= Math.floor(now().getTime() / 1000)) throw new InvoiceRecoveryError("not_authorized");
    }
    const authorize = async (id: string) => {
      activeConfiguration(); if (id !== caseId) throw new InvoiceRecoveryError("not_authorized");
      const next = await deps.authorizeCreator?.(request, id, env!); activeConfiguration();
      if (!next || !CONSENT_UUID.test(next.workspaceId) || !/^[A-Za-z0-9._:-]{1,120}$/u.test(next.actorReference)
        || !Number.isSafeInteger(next.expiresAt) || next.expiresAt <= Math.floor(now().getTime() / 1000)
        || (principal && (next.workspaceId !== principal.workspaceId || next.actorReference !== principal.actorReference))) throw new InvoiceRecoveryError("not_authorized");
      principal = Object.freeze({ workspaceId: next.workspaceId, actorReference: next.actorReference, expiresAt: next.expiresAt });
      return principal;
    };
    try {
      await authorize(caseId);
      const input = write ? await body(request) : null;
      checkActive();
      const configured = deps.transport?.(env!); if (!configured) return reply(503, { error: "transport_unavailable" });
      const persistence = createD1InvoiceRecoveryPersistence(config.db, () => service.guardWrite(), checkActive,
        (op, id) => service.guardObservation(op, id));
      const transport: SandboxDraftDependencies = { ...configured, merchant: Object.freeze({ ...configured.merchant }),
        fetch: async (url, init) => { await service.guardTransport(); checkActive(); return configured.fetch(url, init); } };
      const accountFingerprint = await canonicalHash({ provider: "paypal", environment: "sandbox",
        client_id: env!.PAYPAL_SANDBOX_CLIENT_ID, merchant: transport.merchant });
      checkActive();
      const draft = createPayPalSandboxDraftAdapter(env!, { ...transport, authorizeCreate: r => creation.authorizeTransport(r) });
      const invoice = createPayPalSandboxInvoiceAdapter(env!, { ...transport, sandboxInvoiceTransportEnabled: true,
        journal: persistence.journal, authorize: context => sending.authorizeTransport(context) });
      const creation = createInvoiceCreationService({ store: persistence.creation, accountFingerprint, authorizeCreator: authorize,
        createDraft: r => draft.createDraftInvoice(r), now, checkActive });
      const sending = createInvoiceSendingService({ store: persistence.sending, accountFingerprint, authorizeCreator: authorize,
        clientId: env!.PAYPAL_SANDBOX_CLIENT_ID!, merchant: transport.merchant, sendInvoice: id => invoice.sendInvoice(id),
        getInvoice: id => invoice.getInvoice(id), now, checkActive });
      const service = createInvoiceRecoveryService({ store: persistence.read, creation, sending,
        consent: createHumanConsentService({ store: createD1HumanConsentStore(config.db), authorizeCreator: authorize, now }),
        authorizeCreator: authorize, checkActive, canCreate: () => env!.RIGHTS_INVOICE_CREATION_ENABLED === "true",
        canSend: () => env!.RIGHTS_INVOICE_SENDING_ENABLED === "true", now });
      const result = write ? await service.recover(caseId, input) : await service.review(caseId);
      checkActive(); return reply(200, result);
    } catch (error) {
      const code = error instanceof InvoiceRecoveryError || error instanceof InvoiceCreationError || error instanceof InvoiceSendingError
        || error instanceof ConsentError ? error.code : "storage_unavailable";
      const status = code === "not_authorized" ? 403 : code === "not_found" ? 404 : code === "invalid_command" ? 400
        : ["storage_unavailable", "transport_unavailable", "recovery_unavailable"].includes(code) ? 503 : 409;
      return reply(status, { error: code });
    }
  };
}
