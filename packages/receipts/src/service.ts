import { canonicalHash, canonicalJson, parseCanonical, sha256Hex, type Json } from "./canonical";
import { anchorAudit, id, instant, integer, items, prepareReceipt, row } from "./material";
import { RECEIPT_SCHEMA, ReceiptError, type PreparedReceipt, type ReceiptMaterial, type ReceiptPayload,
  type ReceiptSnapshot, type ReceiptStore, type StoredReceipt } from "./contract";
const MATERIAL_KEYS = ["case_id", "asset", "creator", "buyer", "terms", "period", "quote", "consent", "ai_provenance", "payment", "permission"] as const;
const PAYLOAD_KEYS = [...MATERIAL_KEYS, "schema_version", "receipt_chain_id", "revision_number", "previous_revision_hash",
  "verification_public_id", "material_sha256", "audit_anchor", "created_at"];
function integrity(): never { throw new ReceiptError("integrity_failed"); }
function materialOf(payload: Record<string, unknown>): ReceiptMaterial {
  return Object.fromEntries(MATERIAL_KEYS.map(k => [k, payload[k]])) as unknown as ReceiptMaterial;
}
function identity(material: ReceiptMaterial) {
  // These are frozen licensed deal facts, not mutable display or payment state.
  return { case_id: material.case_id, asset: material.asset, creator: material.creator, buyer: material.buyer,
    terms: material.terms, period: material.period, quote: material.quote, consent: material.consent,
    ai_provenance: material.ai_provenance, permission_id: material.permission.permission_id };
}
/** Integrity is not authenticity: a party able to rewrite all history can recompute
 * an unsigned chain. Current source records and historical audit anchors are also checked.
 */
export async function verifyStoredReceiptChain(snapshot: ReceiptSnapshot): Promise<readonly ReceiptPayload[]> {
  try {
    if (snapshot.chain.length > 256) integrity();
    const c = row(snapshot.root.case), v = row(snapshot.root.verification);
    if (!snapshot.chain.length) {
      if (v.current_receipt_revision_id !== null) integrity();
      return Object.freeze([]);
    }
    const p = row(snapshot.root.permission);
    const audit = await anchorAudit(items(snapshot.root.audit), id(c.case_id));
    const auditById = new Map(audit.events.map(e => [e.audit_event_id, e.sha256]));
    const result: ReceiptPayload[] = []; const receiptIds = new Set<string>();
    for (let i = 0; i < snapshot.chain.length; i++) {
      const stored = snapshot.chain[i]!;
      const data = row(parseCanonical(stored.canonical));
      if (Object.keys(data).sort().join() !== [...PAYLOAD_KEYS].sort().join()) integrity();
      id(stored.id); if (receiptIds.has(stored.id)) integrity(); receiptIds.add(stored.id);
      const before = snapshot.chain[i - 1];
      if (stored.schema !== RECEIPT_SCHEMA || data.schema_version !== RECEIPT_SCHEMA
        || stored.verificationId !== v.verification_record_id || data.receipt_chain_id !== stored.verificationId
        || stored.permissionId !== p.permission_id || row(data.permission).permission_id !== stored.permissionId
        || data.case_id !== c.case_id || data.verification_public_id !== v.public_verification_id
        || stored.revision !== i + 1 || data.revision_number !== i + 1
        || stored.previousHash !== (before?.hash ?? null) || data.previous_revision_hash !== stored.previousHash
        || stored.createdAt !== data.created_at || (before && stored.createdAt < before.createdAt)
        || await sha256Hex(stored.canonical) !== stored.hash) integrity();
      instant(stored.createdAt);
      const material = materialOf(data);
      if (data.material_sha256 !== stored.materialHash || await canonicalHash(material) !== stored.materialHash) integrity();
      if (result.length && canonicalJson(identity(material)) !== canonicalJson(identity(result[0]!))) integrity();
      const anchor = row(data.audit_anchor);
      const events = items(anchor.events);
      if (integer(anchor.event_count, 0, 1024) !== events.length || anchor.root_sha256 !== stored.auditRootHash
        || await canonicalHash(events) !== anchor.root_sha256) integrity();
      const ids = new Set<string>();
      for (const event of events) {
        if (Object.keys(event).sort().join() !== "audit_event_id,sha256" || ids.has(String(event.audit_event_id))
          || auditById.get(String(event.audit_event_id)) !== event.sha256) integrity();
        ids.add(String(event.audit_event_id));
      }
      const state = row(data.permission).state;
      if (!["scheduled", "active", "expired", "refunded", "revoked"].includes(String(state))) integrity();
      if (i > 0) {
        const prior = row(result[i - 1]!.permission).state;
        const allowed: Record<string, readonly unknown[]> = { scheduled: ["scheduled", "active", "expired", "refunded", "revoked"],
          active: ["active", "expired", "refunded", "revoked"], expired: ["expired", "refunded"], refunded: ["refunded"], revoked: ["revoked"] };
        if (!allowed[String(prior)]?.includes(state) || stored.materialHash === before!.materialHash) integrity();
      }
      result.push(data as unknown as ReceiptPayload);
    }
    if (!snapshot.chain.length && v.current_receipt_revision_id !== null) integrity();
    if (snapshot.chain.length && v.current_receipt_revision_id !== snapshot.chain.at(-1)!.id) integrity();
    return Object.freeze(result);
  } catch { integrity(); }
}
export function createReceiptService(store: ReceiptStore, clock: () => Date = () => new Date()) {
  async function invalidate(caseId: string, snapshot: ReceiptSnapshot, code: string, at: string) {
    try { await store.invalidate(caseId, snapshot, code, at); }
    catch { throw new ReceiptError("stale_source"); }
  }
  return Object.freeze({
    async issue(caseId: string) {
      id(caseId);
      for (let attempt = 0; attempt < 3; attempt++) {
        const snapshot = await store.load(caseId);
        if (!snapshot) return Object.freeze({ outcome: "blocked", code: "not_found" });
        const at = instant(clock().toISOString());
        let prepared: PreparedReceipt;
        let chain: readonly ReceiptPayload[];
        try {
          equalCase(snapshot, caseId);
          chain = await verifyStoredReceiptChain(snapshot);
          prepared = await prepareReceipt(snapshot, at);
          if (chain.length && canonicalJson(identity(chain[0]!)) !== canonicalJson(identity(prepared.material))) integrity();
        } catch (error) {
          const code = error instanceof ReceiptError ? error.code : "source_invalid";
          if (code === "not_eligible" && unissued(snapshot)) return Object.freeze({ outcome: "blocked", code });
          try { await invalidate(caseId, snapshot, code, at); }
          catch { if (attempt < 2) continue; return Object.freeze({ outcome: "retry_pending", code: "stale_source" }); }
          return Object.freeze({ outcome: "blocked", code });
        }
        const last = snapshot.chain.at(-1);
        if (last?.materialHash === prepared.materialHash) {
          try {
            // Even a reuse must compare the exact source snapshot after async hashing.
            await store.restore(caseId, snapshot, last, prepared.state, at);
            return Object.freeze({ outcome: "unchanged", revision: last.revision, hash: last.hash, environment: "sandbox" });
          } catch { continue; }
        }
        if (last && at < last.createdAt) return Object.freeze({ outcome: "blocked", code: "source_invalid" });
        const payload: ReceiptPayload = { schema_version: RECEIPT_SCHEMA,
          receipt_chain_id: prepared.verificationId, revision_number: (last?.revision ?? 0) + 1,
          previous_revision_hash: last?.hash ?? null, verification_public_id: prepared.publicId,
          ...prepared.material, material_sha256: prepared.materialHash, audit_anchor: prepared.anchor, created_at: at };
        const canonical = canonicalJson(payload);
        const record: StoredReceipt = { id: crypto.randomUUID(), verificationId: prepared.verificationId,
          permissionId: prepared.permissionId, revision: payload.revision_number, schema: RECEIPT_SCHEMA,
          previousHash: payload.previous_revision_hash, canonical, hash: await sha256Hex(canonical),
          materialHash: prepared.materialHash, auditRootHash: prepared.anchor.root_sha256, createdAt: at };
        try {
          await store.commit({ caseId, sourceJson: snapshot.sourceJson, expectedChainJson: snapshot.chainJson,
            record, state: prepared.state, auditId: crypto.randomUUID(), publicId: prepared.publicId });
          return Object.freeze({ outcome: "issued", revision: record.revision, hash: record.hash, environment: "sandbox" });
        } catch { /* Reload a committed-but-unacknowledged or concurrently changed snapshot. */ }
      }
      return Object.freeze({ outcome: "retry_pending", code: "stale_source" });
    },
    /** Internal read, not a public endpoint. It does not repair an invalid pointer. */
    async verifyCurrent(caseId: string) {
      id(caseId); const snapshot = await store.load(caseId);
      if (!snapshot) return Object.freeze({ valid: false, status: "not_found" });
      const at = instant(clock().toISOString());
      try {
        equalCase(snapshot, caseId); await verifyStoredReceiptChain(snapshot);
        const prepared = await prepareReceipt(snapshot, at), last = snapshot.chain.at(-1);
        if (!last || last.materialHash !== prepared.materialHash || prepared.currentReceiptId !== last.id
          || prepared.verificationStatus !== prepared.state) integrity();
        // Ensure no current source/chain race occurred during hashing.
        const fresh = await store.load(caseId);
        if (!fresh || fresh.sourceJson !== snapshot.sourceJson || fresh.chainJson !== snapshot.chainJson) throw new ReceiptError("stale_source");
        return Object.freeze({ valid: true, status: prepared.state, revision: last.revision, hash: last.hash, environment: "sandbox" });
      } catch (error) {
        const code = error instanceof ReceiptError ? error.code : "source_invalid";
        if (code === "not_eligible" && unissued(snapshot)) return Object.freeze({ valid: false, status: "not_issued" });
        try { await invalidate(caseId, snapshot, code, at); } catch { /* Read still fails closed. */ }
        return Object.freeze({ valid: false, status: "invalid", code });
      }
    },
  });
}
function equalCase(snapshot: ReceiptSnapshot, caseId: string) {
  if (row(snapshot.root.case).case_id !== caseId) throw new ReceiptError("source_invalid");
}
export function receiptMaterialFromPayload(value: Json): ReceiptMaterial { return materialOf(row(value)); }

function unissued(snapshot: ReceiptSnapshot): boolean {
  if (snapshot.root.permission !== null || snapshot.chain.length) return false;
  const v = row(snapshot.root.verification);
  return v.current_receipt_revision_id === null && ["pending", "canceled", "rejected"].includes(String(v.current_status));
}
