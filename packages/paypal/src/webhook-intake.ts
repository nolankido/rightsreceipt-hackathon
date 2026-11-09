/** Authenticated Sandbox inbox intake only. Never activates a permission. */
import { inspectPaymentConfiguration, PAYPAL_SANDBOX_BASE_URL } from "./adapter";
import type { PaymentConfigurationInput } from "./contract";

export const WEBHOOK_VERIFY_URL = `${PAYPAL_SANDBOX_BASE_URL}/v1/notifications/verify-webhook-signature`;
export const WEBHOOK_BODY_LIMIT = 131_072;
const TOKEN_URL = `${PAYPAL_SANDBOX_BASE_URL}/v1/oauth2/token`;
const EVENTS = new Set([
  "INVOICING.INVOICE.CREATED", "INVOICING.INVOICE.SENT", "INVOICING.INVOICE.PAID",
  "INVOICING.INVOICE.CANCELLED", "INVOICING.INVOICE.REFUNDED",
  "INVOICING.INVOICE.UPDATED", "INVOICING.INVOICE.SCHEDULED",
]);
const ID = /^[A-Za-z0-9-]{1,200}$/u;
const INV = /^INV2-[A-Za-z0-9-]{3,100}$/u;
const STATUSES = new Set(["DRAFT", "SENT", "SCHEDULED", "UNPAID", "PAID", "CANCELLED",
  "REFUNDED", "PARTIALLY_PAID", "PARTIALLY_REFUNDED", "PAYMENT_PENDING", "MARKED_AS_PAID",
  "MARKED_AS_REFUNDED", "UNPAID_UNCREDITED", "PAID_UNCREDITED"]);

export type WebhookFailure = "method_not_allowed" | "unsupported_content_type" | "invalid_headers"
  | "invalid_body" | "body_too_large" | "invalid_event" | "invalid_signature"
  | "verification_unavailable" | "event_conflict" | "inbox_unavailable";
const HTTP_STATUS: Readonly<Record<WebhookFailure, number>> = {
  method_not_allowed: 405, unsupported_content_type: 415, invalid_headers: 400,
  invalid_body: 400, body_too_large: 413, invalid_event: 400, invalid_signature: 401,
  verification_unavailable: 503, event_conflict: 409, inbox_unavailable: 503,
};
export class WebhookIntakeError extends Error {
  readonly code: WebhookFailure;
  constructor(code: WebhookFailure) { super("Webhook intake failed."); this.name = "WebhookIntakeError"; this.code = code; }
}
function fail(code: WebhookFailure): never { throw new WebhookIntakeError(code); }
function record(v: unknown): v is Record<string, unknown> { return v !== null && typeof v === "object" && !Array.isArray(v); }
export interface VerifiedWebhookEntry {
  readonly inboxId: string;
  readonly provider: "paypal";
  readonly environment: "sandbox";
  readonly providerEventId: string;
  readonly transmissionId: string;
  readonly providerInvoiceId: string;
  readonly eventType: string;
  readonly eventCreatedAt: string;
  readonly resourceStatus: string | null;
  readonly verificationStatus: "verified";
  readonly processingStatus: "pending";
  readonly payloadSha256: string;
  readonly verifiedHeadersJson: string;
  readonly receivedAt: string;
}
export interface WebhookInbox {
  /** Trusted verifier only. Never accept this record from a client or model. */
  putVerified(entry: VerifiedWebhookEntry): Promise<"inserted" | "duplicate" | "conflict">;
}
export interface WebhookDependencies {
  readonly sandboxWebhookIntakeEnabled: true;
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  readonly inbox: WebhookInbox;
  readonly now?: () => number;
  readonly createId?: () => string;
}

function instant(value: unknown): number {
  // Keep the original timestamp bytes for PayPal signature verification. JS
  // Date resolves milliseconds, but RFC 3339 allows finer fractional seconds.
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(value)) return NaN;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0,19) !== value.slice(0,19)) return NaN;
  return ms;
}
async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2,"0")).join("");
}
/** Stream limit is enforced even with an absent or dishonest Content-Length. */
async function boundedBody(message: Request | Response, limit: number, code: WebhookFailure): Promise<Uint8Array> {
  const declared = message.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > limit)) fail(code);
  if (!message.body) fail(code);
  const reader = message.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  // Avoid a slow body occupying the listener indefinitely.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { void reader.cancel().catch(() => undefined); reject(new WebhookIntakeError(code)); }, 8_000);
  });
  try {
    while (true) {
      const next = await Promise.race([reader.read(), timeout]);
      if (next.done) break;
      total += next.value.byteLength;
      if (total > limit) { void reader.cancel().catch(() => undefined); fail(code); }
      chunks.push(next.value);
    }
  } catch (error) { if (error instanceof WebhookIntakeError) throw error; fail(code); }
  finally { clearTimeout(timer); reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
/** Reject ambiguous duplicate JSON keys, including escaped names and nested keys. */
function parseUniqueJson(text: string): unknown {
  let i = 0; let nodes = 0;
  const ws = () => { while (/[ \t\r\n]/u.test(text[i] ?? "x")) i++; };
  const string = (): string => {
    const start = i++;
    while (i < text.length) {
      const c = text[i++];
      if (c === "\\") i++;
      else if (c === '"') return JSON.parse(text.slice(start,i)) as string;
    }
    fail("invalid_body");
  };
  const value = (depth: number): void => {
    ws(); if (depth > 32 || ++nodes > 10_000) fail("invalid_body");
    if (text[i] === "{") {
      i++; ws(); const keys = new Set<string>();
      if (text[i] === "}") { i++; return; }
      while (true) {
        ws(); if (text[i] !== '"') fail("invalid_body");
        const key = string(); if (keys.has(key)) fail("invalid_body"); keys.add(key);
        ws(); if (text[i++] !== ":") fail("invalid_body"); value(depth+1); ws();
        if (text[i] === "}") { i++; return; }
        if (text[i++] !== ",") fail("invalid_body");
      }
    }
    if (text[i] === "[") {
      i++; ws(); if (text[i] === "]") { i++; return; }
      while (true) { value(depth+1); ws(); if (text[i] === "]") { i++; return; } if (text[i++] !== ",") fail("invalid_body"); }
    }
    if (text[i] === '"') { string(); return; }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(text.slice(i));
    if (!token) fail("invalid_body");
    if (/^[-0-9]/u.test(token[0]) && !Number.isFinite(Number(token[0]))) fail("invalid_body");
    i += token[0].length;
  };
  try { value(0); ws(); if (i !== text.length) fail("invalid_body"); return JSON.parse(text) as unknown; }
  catch { fail("invalid_body"); }
}
function certificateUrl(value: string): boolean {
  return /^https:\/\/api(?:-m)?\.sandbox\.paypal\.com\/v1\/notifications\/certs\/CERT-[A-Za-z0-9-]{1,160}$/u.test(value);
}
function headersChecked(headers: Headers, now: number) {
  const transmissionId = headers.get("paypal-transmission-id") ?? "";
  const transmissionTime = headers.get("paypal-transmission-time") ?? "";
  const certUrl = headers.get("paypal-cert-url") ?? "";
  const signature = headers.get("paypal-transmission-sig") ?? "";
  const algorithm = headers.get("paypal-auth-algo") ?? "";
  const sent = instant(transmissionTime);
  if (!ID.test(transmissionId) || !Number.isFinite(sent) || sent > now + 300_000
    || now - sent > 259_500_000 || !certificateUrl(certUrl) || algorithm !== "SHA256withRSA"
    || signature.length < 64 || signature.length > 2048 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(signature)) fail("invalid_headers");
  try { if (btoa(atob(signature)) !== signature) fail("invalid_headers"); } catch { fail("invalid_headers"); }
  return { transmissionId, transmissionTime, certUrl, signature, algorithm };
}
function result(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff", ...(status === 405 ? { Allow: "POST" } : {}),
    ...(status === 503 ? { "Retry-After": "30" } : {}),
  } });
}

/** An opt-in Web Request/Response handler. Nothing is publicly mounted by this factory. */
export function createSandboxWebhookHandler(config: PaymentConfigurationInput, deps: WebhookDependencies): (request: Request) => Promise<Response> {
  const inspected = inspectPaymentConfiguration(config);
  if (inspected.mode !== "paypal_sandbox" || (config.APP_MODE !== "sandbox" && config.APP_MODE !== "judge")
    || deps?.sandboxWebhookIntakeEnabled !== true || typeof deps.fetch !== "function"
    || typeof deps.inbox?.putVerified !== "function" || !config.PAYPAL_SANDBOX_WEBHOOK_ID
    || !/^[A-Za-z0-9-]{8,100}$/u.test(config.PAYPAL_SANDBOX_WEBHOOK_ID)
    || /^(?:WEBHOOK_ID|YOUR|REPLACE|EXAMPLE|PLACEHOLDER)/iu.test(config.PAYPAL_SANDBOX_WEBHOOK_ID)
    || config.PAYPAL_SANDBOX_CLIENT_ID!.includes(":")) throw new Error("Sandbox webhook configuration is incomplete.");
  const webhookId = config.PAYPAL_SANDBOX_WEBHOOK_ID;
  const clientId = config.PAYPAL_SANDBOX_CLIENT_ID!;
  const secret = config.PAYPAL_SANDBOX_CLIENT_SECRET!;
  const clock = deps.now ?? Date.now;
  const createId = deps.createId ?? (() => crypto.randomUUID());
  let cache: { value: string; until: number } | null = null;
  let acquiring: Promise<string> | null = null;
  async function http(url: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try { response = await deps.fetch(url, { ...init, redirect: "error", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(8_000) }); }
    catch { fail("verification_unavailable"); }
    if (response.redirected || (response.url && response.url !== url)) fail("verification_unavailable");
    return response;
  }
  async function json(response: Response): Promise<Record<string, unknown>> {
    if (!/^application\/json(?:\s*;.*)?$/iu.test(response.headers.get("content-type") ?? "")) fail("verification_unavailable");
    try {
      const data = parseUniqueJson(new TextDecoder("utf-8", { fatal: true }).decode(await boundedBody(response, 16_384, "verification_unavailable")));
      if (!record(data)) fail("verification_unavailable"); return data;
    } catch { fail("verification_unavailable"); }
  }
  async function token(): Promise<string> {
    if (cache && clock() < cache.until) return cache.value;
    if (acquiring) return acquiring;
    const promise = (async () => {
      const credentials = btoa(String.fromCharCode(...new TextEncoder().encode(`${clientId}:${secret}`)));
      const response = await http(TOKEN_URL, { method: "POST", headers: {
        Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json",
      }, body: "grant_type=client_credentials" });
      if (response.status !== 200) fail("verification_unavailable");
      const data = await json(response);
      if (data.token_type !== "Bearer" || typeof data.access_token !== "string"
        || !/^[\x21-\x7e]{1,8192}$/u.test(data.access_token) || typeof data.expires_in !== "number"
        || !Number.isSafeInteger(data.expires_in) || data.expires_in < 1 || data.expires_in > 86400) fail("verification_unavailable");
      const lifetime = data.expires_in * 1000;
      cache = { value: data.access_token, until: clock() + Math.max(0, lifetime - Math.min(60000, Math.max(5000,lifetime/10))) };
      return data.access_token;
    })();
    acquiring = promise;
    try { return await promise; } finally { if (acquiring === promise) acquiring = null; }
  }
  return async (request: Request): Promise<Response> => {
    try {
      if (request.method !== "POST") fail("method_not_allowed");
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers.get("content-type") ?? "")
        || (request.headers.has("content-encoding") && request.headers.get("content-encoding") !== "identity")) fail("unsupported_content_type");
      const received = clock(); if (!Number.isFinite(received)) fail("verification_unavailable");
      const headers = headersChecked(request.headers, received);
      const bytes = await boundedBody(request, WEBHOOK_BODY_LIMIT, "body_too_large");
      let raw: string;
      try { raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
      catch { fail("invalid_body"); }
      const event = parseUniqueJson(raw);
      if (!record(event) || typeof event.id !== "string" || !ID.test(event.id)
        || typeof event.event_type !== "string" || !/^[A-Z][A-Z0-9_.]{1,159}$/u.test(event.event_type)
        || !Number.isFinite(instant(event.create_time)) || instant(event.create_time) > received + 300_000
        || !record(event.resource)) fail("invalid_event");
      // Embed the ORIGINAL JSON, not JSON.stringify(parsedEvent), in the postback.
      const prefix = JSON.stringify({ transmission_id: headers.transmissionId,
        transmission_time: headers.transmissionTime, transmission_sig: headers.signature,
        cert_url: headers.certUrl, auth_algo: headers.algorithm, webhook_id: webhookId });
      const body = `${prefix.slice(0,-1)},"webhook_event":${raw}}`;
      const verify = async (bearer: string) => http(WEBHOOK_VERIFY_URL, { method: "POST", headers: {
        Authorization: `Bearer ${bearer}`, "Content-Type": "application/json", Accept: "application/json",
      }, body });
      let response = await verify(await token());
      if (response.status === 401) { cache = null; response = await verify(await token()); }
      if (response.status !== 200) fail("verification_unavailable");
      const verified = await json(response);
      if (verified.verification_status === "FAILURE") fail("invalid_signature");
      if (verified.verification_status !== "SUCCESS") fail("verification_unavailable");
      if (!EVENTS.has(event.event_type)) return result(200, { status: "ignored", reason: "unsubscribed_event" });
      const invoice = record(event.resource.invoice) ? event.resource.invoice : event.resource;
      if (typeof invoice.id !== "string" || !INV.test(invoice.id)
        || (event.resource.id !== undefined && record(event.resource.invoice) && event.resource.id !== invoice.id)) fail("invalid_event");
      const status = typeof invoice.status === "string" && STATUSES.has(invoice.status) ? invoice.status : null;
      const entry: VerifiedWebhookEntry = Object.freeze({
        inboxId: createId(), provider: "paypal", environment: "sandbox", providerEventId: event.id,
        transmissionId: headers.transmissionId, providerInvoiceId: invoice.id,
        eventType: event.event_type, eventCreatedAt: event.create_time as string, resourceStatus: status,
        verificationStatus: "verified", processingStatus: "pending", payloadSha256: await digest(bytes),
        verifiedHeadersJson: JSON.stringify({ transmission_time: headers.transmissionTime,
          auth_algo: headers.algorithm, method: "paypal_postback_v1",
          webhook_id_sha256: await digest(new TextEncoder().encode(webhookId)) }),
        receivedAt: new Date(received).toISOString(),
      });
      let stored: Awaited<ReturnType<WebhookInbox["putVerified"]>>;
      try { stored = await deps.inbox.putVerified(entry); } catch { fail("inbox_unavailable"); }
      if (stored === "conflict") fail("event_conflict");
      if (stored !== "inserted" && stored !== "duplicate") fail("inbox_unavailable");
      return result(200, { status: stored === "inserted" ? "accepted" : "duplicate", processing: "queued_only" });
    } catch (error) {
      const code = error instanceof WebhookIntakeError ? error.code : "verification_unavailable";
      return result(HTTP_STATUS[code], { status: "rejected", code });
    }
  };
}
