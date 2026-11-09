/** Adapter-private delivery journal. Never stores OAuth tokens or grants rights. */
import type { PaymentInvoiceView } from "./contract";

export interface SandboxInvoiceBinding {
  readonly draft: PaymentInvoiceView;
  readonly assetId: string;
  readonly creatorDecisionId: string;
  readonly recipientHash: string;
  readonly merchantEmailHash: string;
  readonly noteHash: string;
  readonly summaryHash: string;
  readonly invoiceNumber: string;
}
export interface DeliveryReservation {
  readonly requestId: string;
  readonly caseId: string;
  readonly snapshotHash: string;
  readonly merchantHash: string;
}
export interface DeliveryEntry extends DeliveryReservation {
  readonly binding: SandboxInvoiceBinding | null;
  readonly sendState: "not_started" | "started" | "confirmed";
}
export interface SandboxDeliveryJournal {
  reserve(input: DeliveryReservation): Promise<{ acquired: boolean; entry: DeliveryEntry }>;
  byInvoice(invoiceId: string): Promise<DeliveryEntry | null>;
  complete(requestId: string, binding: SandboxInvoiceBinding): Promise<void>;
  claimSend(invoiceId: string): Promise<boolean>;
  confirmSend(invoiceId: string): Promise<void>;
}
function equal(a: DeliveryReservation, b: DeliveryReservation): boolean {
  return a.requestId === b.requestId && a.caseId === b.caseId
    && a.snapshotHash === b.snapshotHash && a.merchantHash === b.merchantHash;
}
function conflict(): never { throw new Error("Sandbox delivery journal conflict."); }

export function createMemoryDeliveryJournal(): SandboxDeliveryJournal {
  const records = new Map<string, DeliveryEntry>();
  const find = (id: string) => [...records.values()].find(e => e.binding?.draft.invoiceId === id);
  return {
    async reserve(input) {
      const prior = records.get(input.requestId)
        ?? [...records.values()].find(e => e.caseId === input.caseId);
      if (prior) { if (!equal(prior, input)) conflict(); return { acquired: false, entry: structuredClone(prior) }; }
      const entry: DeliveryEntry = { ...input, binding: null, sendState: "not_started" };
      records.set(input.requestId, structuredClone(entry));
      return { acquired: true, entry: structuredClone(entry) };
    },
    async byInvoice(id) { return structuredClone(find(id) ?? null); },
    async complete(requestId, binding) {
      const entry = records.get(requestId);
      if (!entry || entry.caseId !== binding.draft.caseId) conflict();
      if (entry.binding) {
        if (JSON.stringify(entry.binding) !== JSON.stringify(binding)) conflict();
        return;
      }
      if (find(binding.draft.invoiceId)) conflict();
      records.set(requestId, { ...entry, binding: structuredClone(binding) });
    },
    async claimSend(id) {
      const entry = find(id);
      if (!entry || entry.sendState !== "not_started") return false;
      records.set(entry.requestId, { ...entry, sendState: "started" });
      return true;
    },
    async confirmSend(id) {
      const entry = find(id); if (!entry) conflict();
      records.set(entry.requestId, { ...entry, sendState: "confirmed" });
    },
  };
}

/** Structurally compatible with D1. Native SQLite tests exercise the exact SQL. */
export interface DeliveryDatabase {
  prepare(sql: string): {
    bind(...values: readonly (string | number | null)[]): {
      first<T>(): Promise<T | null>;
      run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
    };
  };
}
interface Row {
  request_id: string; case_id: string; snapshot_hash: string; merchant_hash: string;
  binding_json: string | null; send_state: DeliveryEntry["sendState"];
}
function mapped(row: Row): DeliveryEntry {
  return { requestId: row.request_id, caseId: row.case_id,
    snapshotHash: row.snapshot_hash, merchantHash: row.merchant_hash,
    binding: row.binding_json ? JSON.parse(row.binding_json) as SandboxInvoiceBinding : null,
    sendState: row.send_state };
}
export function createD1DeliveryJournal(db: DeliveryDatabase): SandboxDeliveryJournal {
  const query = async (where: string, id: string) => {
    const row = await db.prepare(`SELECT * FROM paypal_delivery_journal WHERE ${where} = ?`)
      .bind(id).first<Row>();
    return row ? mapped(row) : null;
  };
  return {
    async reserve(input) {
      const result = await db.prepare(`INSERT INTO paypal_delivery_journal
        (request_id, case_id, snapshot_hash, merchant_hash)
        VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`)
        .bind(input.requestId, input.caseId, input.snapshotHash, input.merchantHash).run();
      if (!result.success) conflict();
      const entry = await query("case_id", input.caseId);
      if (!entry || !equal(entry, input)) conflict();
      return { acquired: result.meta?.changes === 1, entry };
    },
    async byInvoice(id) { return query("invoice_id", id); },
    async complete(id, binding) {
      const body = JSON.stringify(binding);
      const result = await db.prepare(`UPDATE paypal_delivery_journal SET invoice_id = ?, binding_json = ?
        WHERE request_id = ? AND case_id = ? AND binding_json IS NULL`)
        .bind(binding.draft.invoiceId, body, id, binding.draft.caseId).run();
      if (!result.success) conflict();
      const entry = await query("request_id", id);
      if (!entry?.binding || JSON.stringify(entry.binding) !== body) conflict();
    },
    async claimSend(id) {
      const result = await db.prepare(`UPDATE paypal_delivery_journal SET send_state = 'started'
        WHERE invoice_id = ? AND binding_json IS NOT NULL AND send_state = 'not_started'`)
        .bind(id).run();
      if (!result.success) conflict();
      return result.meta?.changes === 1;
    },
    async confirmSend(id) {
      const result = await db.prepare(`UPDATE paypal_delivery_journal SET send_state = 'confirmed'
        WHERE invoice_id = ? AND binding_json IS NOT NULL`).bind(id).run();
      if (!result.success || result.meta?.changes !== 1) conflict();
    },
  };
}
