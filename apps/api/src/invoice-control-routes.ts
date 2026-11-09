/** Authenticated, explicit Sandbox invoice commands. Reads never call PayPal.
 * Permission and payment evidence remain the separate verified lifecycle's job.
 */
import { createSandboxInvoiceCreation } from "./invoice-creation";
import { createSandboxInvoiceSending } from "./invoice-sending";
import type { CreatorAccessBindings } from "./security/creator-access";
import { strictSecurityJson } from "./security/strict-json";
import { createHumanConsentService, verifyAcceptedInvoiceSnapshot } from "../../../packages/application/src/human-consent";
import { ConsentError, CONSENT_UUID, type CreatorPrincipal } from "../../../packages/application/src/consent-contract";
import { InvoiceCreationError } from "../../../packages/application/src/invoice-creation";
import { InvoiceSendingError, type SendCommand } from "../../../packages/application/src/invoice-sending";
import { createD1HumanConsentStore, type ConsentDatabase } from "../../../packages/persistence/src/human-consent";
import { createD1InvoiceSendingStore } from "../../../packages/persistence/src/invoice-sending";
import type { PaymentConfigurationInput } from "../../../packages/paypal/src/contract";
import { createPayPalSandboxDraftAdapter, type SandboxDraftDependencies } from "../../../packages/paypal/src/sandbox-draft";
import type { DeliveryDatabase } from "../../../packages/paypal/src/delivery-journal";

export interface InvoiceControlBindings extends CreatorAccessBindings, PaymentConfigurationInput {
  readonly DB?: ConsentDatabase & DeliveryDatabase;
  readonly HUMAN_CONSENT_ENABLED?: string;
  readonly HUMAN_CONSENT_ORIGIN?: string;
  readonly RIGHTS_INVOICE_CONTROLS_ENABLED?: string;
  readonly RIGHTS_INVOICE_CREATION_ENABLED?: string;
  readonly RIGHTS_INVOICE_SENDING_ENABLED?: string;
}
const PATH = /^\/api\/invoices\/creator\/cases\/([0-9a-f-]{36})(?:\/(create|send))?$/u;
const INVOICE = /^INV2-[A-Za-z0-9-]{3,100}$/u;
const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private",
  "Pragma": "no-cache", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "X-Robots-Tag": "noindex, nofollow" };
function reply(status: number, value: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), { status, headers: { ...HEADERS, ...extra } });
}
function failure(code: "invalid_command" | "source_invalid" | "not_authorized" | "not_found" | "stale_revision"): never {
  throw new InvoiceCreationError(code);
}
function available(env: InvoiceControlBindings | undefined): env is InvoiceControlBindings & { DB: ConsentDatabase & DeliveryDatabase } {
  if (!env?.DB || env.RIGHTS_INVOICE_CONTROLS_ENABLED !== "true" || env.HUMAN_CONSENT_ENABLED !== "true"
    || env.CREATOR_ACCESS_ENABLED !== "true" || env.PAYPAL_MODE !== "paypal_sandbox"
    || !["sandbox", "judge"].includes(env.APP_MODE ?? "")) return false;
  try {
    const origin = new URL(env.CREATOR_ACCESS_ORIGIN ?? "");
    return origin.origin === env.CREATOR_ACCESS_ORIGIN && origin.origin === env.HUMAN_CONSENT_ORIGIN
      && origin.protocol === "https:" && !origin.username && !origin.password;
  } catch { return false; }
}
async function command(request: Request, action: string): Promise<{ expectedCaseVersion: number; confirmed: true; invoiceId?: string }> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers.get("content-type") ?? "")
    || request.headers.has("content-encoding")) failure("invalid_command");
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > 4096)) failure("invalid_command");
  const reader = request.body?.getReader(); if (!reader) failure("invalid_command");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 4096) { await reader.cancel(); failure("invalid_command"); }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const value = strictSecurityJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes), 4096);
    if (!value || typeof value !== "object" || Array.isArray(value)) failure("invalid_command");
    const c = value as Record<string, unknown>;
    if (Object.keys(c).sort().join() !== (action === "create" ? "confirmed,expectedCaseVersion" : "confirmed,expectedCaseVersion,invoiceId")
      || c.confirmed !== true || !Number.isSafeInteger(c.expectedCaseVersion) || Number(c.expectedCaseVersion) < 1
      || Number(c.expectedCaseVersion) >= Number.MAX_SAFE_INTEGER
      || (action === "send" && (typeof c.invoiceId !== "string" || !INVOICE.test(c.invoiceId)))) failure("invalid_command");
    return c as { expectedCaseVersion: number; confirmed: true; invoiceId?: string };
  } catch { return failure("invalid_command"); }
  finally { reader.releaseLock(); }
}

export function createInvoiceControlRoutes(deps: {
  readonly authorizeCreator?: (request: Request, caseId: string, env: InvoiceControlBindings) => Promise<CreatorPrincipal | null>;
  /** Pure server configuration. No implicit network transport or fallback. */
  readonly transport?: (env: InvoiceControlBindings) => SandboxDraftDependencies | null;
  readonly now?: () => Date;
  readonly limit?: (request: Request) => boolean;
} = {}) {
  let minute = -1, used = 0;
  const now = () => deps.now?.() ?? new Date();
  function allowed(request: Request) {
    if (deps.limit) return deps.limit(request);
    const next = Math.floor(now().getTime() / 60000);
    if (next !== minute) { minute = next; used = 0; }
    return ++used <= 60;
  }
  return async (request: Request, env: InvoiceControlBindings | undefined): Promise<Response | null> => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/invoices/")) return null;
    if (!available(env)) return reply(503, { error: "invoice_controls_unavailable" });
    if (url.origin !== env.CREATOR_ACCESS_ORIGIN || url.search) return reply(400, { error: "invalid_request" });
    if (!allowed(request)) return reply(429, { error: "rate_limited" }, { "Retry-After": "60" });
    const match = PATH.exec(url.pathname);
    if (!match || !CONSENT_UUID.test(match[1]!)) return reply(404, { error: "not_found" });
    const caseId = match[1]!, action = match[2], method = action ? "POST" : "GET";
    if (request.method !== method) return reply(405, { error: "method_not_allowed" }, { Allow: method });
    if ((request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")
      || (request.headers.has("origin") && request.headers.get("origin") !== url.origin)
      || (action && request.headers.get("origin") !== url.origin)) return reply(403, { error: "not_authorized" });
    if ((action === "create" && env.RIGHTS_INVOICE_CREATION_ENABLED !== "true")
      || (action === "send" && env.RIGHTS_INVOICE_SENDING_ENABLED !== "true")) return reply(503, { error: "invoice_operation_unavailable" });
    try {
      let principal: CreatorPrincipal | null = null;
      const authorize = async (id: string): Promise<CreatorPrincipal | null> => {
        const active = () => id === caseId && !request.signal.aborted && available(env)
          && env.CREATOR_ACCESS_ORIGIN === url.origin
          && !(action === "create" && env.RIGHTS_INVOICE_CREATION_ENABLED !== "true")
          && !(action === "send" && env.RIGHTS_INVOICE_SENDING_ENABLED !== "true");
        if (!active()) return null;
        const next = await deps.authorizeCreator?.(request, id, env);
        if (!active() || !next || !CONSENT_UUID.test(next.workspaceId) || !/^[A-Za-z0-9._:-]{1,120}$/u.test(next.actorReference)
          || (principal && (next.workspaceId !== principal.workspaceId || next.actorReference !== principal.actorReference))) return null;
        return Object.freeze({ workspaceId: next.workspaceId, actorReference: next.actorReference });
      };
      principal = await authorize(caseId); if (!principal) failure("not_authorized");
      let result: unknown;
      if (!action) {
        const store = createD1InvoiceSendingStore(env.DB);
        const before = await store.load(caseId); if (!before) failure("not_found");
        const service = createHumanConsentService({ store: createD1HumanConsentStore(env.DB), authorizeCreator: authorize, now });
        const offer = await service.reviewCreator(caseId);
        const s = before.creation, c = s.consent.root.case as Record<string, unknown>, b = s.binding, o = s.operations[0];
        if (c.case_id !== caseId || c.workspace_id !== principal.workspaceId || c.row_version !== offer.caseVersion
          || s.operations.length > 1 || before.operations.length > 1) failure("source_invalid");
        let invoiceId: string | null = null, invoiceStatus: string | null = null;
        if (!b) {
          if (c.invoice_binding_id !== null || s.operations.length || before.operations.length || before.journal
            || s.consent.root.invoiceCount !== 0 || s.consent.root.operationCount !== 0) failure("source_invalid");
        } else {
          if (!o || b.case_id !== caseId || b.invoice_binding_id !== c.invoice_binding_id || b.provider !== "paypal"
            || b.environment !== "sandbox" || b.terms_version_id !== offer.termsVersionId || b.quote_id !== offer.quoteId
            || b.buyer_acceptance_id !== c.latest_buyer_acceptance_id || !CONSENT_UUID.test(String(b.invoice_binding_id))
            || !Number.isSafeInteger(b.row_version) || Number(b.row_version) < 1
            || o.case_id !== caseId || o.operation_type !== "create_invoice" || o.provider !== "paypal" || o.environment !== "sandbox"
            || !/^[a-f0-9]{64}$/u.test(String(o.command_fingerprint)) || !["pending", "unknown", "succeeded"].includes(String(o.status))) failure("source_invalid");
          if (!["create_pending", "draft", "send_pending", "sent", "paid", "canceled", "fully_refunded", "reconciliation_required"].includes(String(b.invoice_status))) failure("source_invalid");
          invoiceStatus = String(b.invoice_status);
          if (b.provider_invoice_id !== null) {
            if (typeof b.provider_invoice_id !== "string" || !INVOICE.test(b.provider_invoice_id)
              || b.safe_invoice_reference !== b.provider_invoice_id || o.provider_reference !== b.provider_invoice_id
              || o.status !== "succeeded" || o.attempt_count !== 1 || o.error_code !== null || invoiceStatus === "create_pending") failure("source_invalid");
            invoiceId = b.provider_invoice_id;
          } else if (invoiceStatus !== "create_pending" || b.safe_invoice_reference !== null || o.status === "succeeded") failure("source_invalid");
        }
        // Human consent is still required for either advisory action flag. The
        // command coordinators additionally verify configured merchant identity.
        if (["accepted_awaiting_invoice", "billing_started"].includes(offer.stage)) await verifyAcceptedInvoiceSnapshot(s.consent, now().toISOString());
        if (!await authorize(caseId)) failure("not_authorized");
        if ((await store.load(caseId))?.stateJson !== before.stateJson) failure("stale_revision");
        let transportReady = false;
        try {
          // Construction validates pure server configuration. OAuth and all HTTP
          // remain lazy and are never invoked by this read-only branch.
          const configured = deps.transport?.(env);
          if (configured) { createPayPalSandboxDraftAdapter(env, configured); transportReady = true; }
        } catch { /* Incomplete configuration disables both advisory actions. */ }
        result = { schemaVersion: "invoice-controls-v1", environment: "sandbox", caseId, caseVersion: offer.caseVersion,
          stage: offer.stage, invoiceId, invoiceStatus,
          canCreate: transportReady && env.RIGHTS_INVOICE_CREATION_ENABLED === "true" && offer.stage === "accepted_awaiting_invoice" && !b,
          canSend: transportReady && env.RIGHTS_INVOICE_SENDING_ENABLED === "true" && offer.stage === "billing_started"
            && invoiceStatus === "draft" && !!invoiceId && before.operations.length === 0 && before.journal === null,
          paymentConfirmed: false, permissionGranted: false };
      } else {
        const input = await command(request, action);
        if (!await authorize(caseId)) failure("not_authorized");
        const transport = deps.transport?.(env);
        if (!transport) return reply(503, { error: "transport_unavailable" });
        if (action === "create") {
          const service = await createSandboxInvoiceCreation(env, { authorizeCreator: authorize, transport, now });
          if (!service) return reply(503, { error: "invoice_operation_unavailable" });
          await service.reserve(caseId, input.expectedCaseVersion);
          result = await service.execute(caseId);
        } else {
          const service = await createSandboxInvoiceSending(env, { authorizeCreator: authorize, transport, now });
          if (!service) return reply(503, { error: "invoice_operation_unavailable" });
          await service.reserve(caseId, input as SendCommand);
          result = await service.execute(caseId);
        }
      }
      if (!await authorize(caseId)) failure("not_authorized");
      return reply(200, result);
    } catch (error) {
      const code = error instanceof ConsentError || error instanceof InvoiceCreationError || error instanceof InvoiceSendingError
        ? error.code : "storage_unavailable";
      const status = code === "not_authorized" ? 403 : code === "not_found" ? 404 : code === "invalid_command" ? 400
        : code === "storage_unavailable" || code === "transport_unavailable" ? 503 : 409;
      return reply(status, { error: code });
    }
  };
}
