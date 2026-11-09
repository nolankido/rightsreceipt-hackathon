/** Durable, redacted receipt storage. No payment/lifecycle writes occur here. */
import type { VerifiedWebhookEntry, WebhookInbox } from "./webhook-intake";

export interface WebhookStatement {
  bind(...values: readonly (string | null)[]): WebhookStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ readonly success: boolean; readonly meta?: { readonly changes?: number } }>;
}
export interface WebhookDatabase { prepare(sql: string): WebhookStatement; }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
function checked(entry: VerifiedWebhookEntry): VerifiedWebhookEntry {
  const keys = ["inboxId","provider","environment","providerEventId","transmissionId","providerInvoiceId",
    "eventType","eventCreatedAt","resourceStatus","verificationStatus","processingStatus","payloadSha256",
    "verifiedHeadersJson","receivedAt"];
  if (Object.keys(entry).length !== keys.length || keys.some(key=>!Object.hasOwn(entry,key))
    || !UUID.test(entry.inboxId) || entry.provider !== "paypal" || entry.environment !== "sandbox"
    || entry.verificationStatus !== "verified" || entry.processingStatus !== "pending"
    || !/^[A-Za-z0-9-]{1,200}$/u.test(entry.providerEventId) || !/^[A-Za-z0-9-]{1,200}$/u.test(entry.transmissionId)
    || !/^INV2-[A-Za-z0-9-]{3,100}$/u.test(entry.providerInvoiceId)
    || !/^INVOICING\.INVOICE\.(?:CREATED|SENT|PAID|CANCELLED|REFUNDED|UPDATED|SCHEDULED)$/u.test(entry.eventType)
    || !/^[0-9a-f]{64}$/u.test(entry.payloadSha256)
    || !Number.isFinite(Date.parse(entry.receivedAt)) || !Number.isFinite(Date.parse(entry.eventCreatedAt))
    || (entry.resourceStatus !== null && !/^[A-Z_]{1,40}$/u.test(entry.resourceStatus))) throw new Error("Invalid verified inbox record.");
  const headers: unknown = JSON.parse(entry.verifiedHeadersJson);
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) throw new Error("Invalid inbox metadata.");
  const h = headers as Record<string,unknown>;
  if (Object.keys(h).sort().join(",") !== "auth_algo,method,transmission_time,webhook_id_sha256"
    || h.auth_algo !== "SHA256withRSA" || h.method !== "paypal_postback_v1"
    || typeof h.transmission_time !== "string" || !Number.isFinite(Date.parse(h.transmission_time))
    || typeof h.webhook_id_sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(h.webhook_id_sha256)) throw new Error("Invalid inbox metadata.");
  return Object.freeze({ ...entry });
}
function same(a: VerifiedWebhookEntry, b: VerifiedWebhookEntry): boolean {
  return a.providerEventId === b.providerEventId && a.payloadSha256 === b.payloadSha256
    && a.providerInvoiceId === b.providerInvoiceId && a.eventType === b.eventType
    && a.eventCreatedAt === b.eventCreatedAt && a.resourceStatus === b.resourceStatus;
}
/** Test-only volatile store. Authenticity must still be established by the handler. */
export function createMemoryWebhookInbox(): WebhookInbox & { snapshot(): readonly VerifiedWebhookEntry[] } {
  const rows = new Map<string,VerifiedWebhookEntry>();
  return {
    async putVerified(raw) {
      const entry = checked(raw); const previous = rows.get(entry.providerEventId);
      if (previous) return same(previous,entry) ? "duplicate" : "conflict";
      rows.set(entry.providerEventId,entry); return "inserted";
    },
    snapshot() { return Object.freeze([...rows.values()].map(row=>Object.freeze({...row}))); },
  };
}
export function createD1WebhookInbox(database: WebhookDatabase): WebhookInbox {
  return {
    async putVerified(raw) {
      const e = checked(raw);
      const write = await database.prepare(`INSERT INTO webhook_inbox_events (
        webhook_inbox_event_id, provider, environment, provider_event_id, transmission_id,
        invoice_binding_id, event_type, verification_status, processing_status, payload_sha256,
        verified_headers_json, received_at, provider_invoice_id, event_created_at, resource_status,
        verification_method
      ) VALUES (?, 'paypal', 'sandbox', ?, ?,
        (SELECT invoice_binding_id FROM invoice_bindings
         WHERE provider='paypal' AND environment='sandbox' AND provider_invoice_id=?),
        ?, 'verified', 'pending', ?, ?, ?, ?, ?, ?, 'paypal_postback_v1')
      ON CONFLICT(provider, environment, provider_event_id) DO NOTHING`).bind(
        e.inboxId,e.providerEventId,e.transmissionId,e.providerInvoiceId,e.eventType,e.payloadSha256,
        e.verifiedHeadersJson,e.receivedAt,e.providerInvoiceId,e.eventCreatedAt,e.resourceStatus,
      ).run();
      if (!write.success) throw new Error("Inbox storage unavailable.");
      const found = await database.prepare(`SELECT verification_status,payload_sha256,provider_invoice_id,event_type,event_created_at,resource_status
        FROM webhook_inbox_events WHERE provider='paypal' AND environment='sandbox' AND provider_event_id=?`)
        .bind(e.providerEventId).first<{verification_status:string;payload_sha256:string;provider_invoice_id:string;event_type:string;event_created_at:string;resource_status:string|null}>();
      if (!found) throw new Error("Inbox receipt unavailable.");
      if (found.verification_status !== "verified" || found.payload_sha256 !== e.payloadSha256 || found.provider_invoice_id !== e.providerInvoiceId
        || found.event_type !== e.eventType || found.event_created_at !== e.eventCreatedAt
        || found.resource_status !== e.resourceStatus) return "conflict";
      if (write.meta?.changes !== 0 && write.meta?.changes !== 1) throw new Error("Inbox write count unavailable.");
      return write.meta.changes === 1 ? "inserted" : "duplicate";
    },
  };
}
