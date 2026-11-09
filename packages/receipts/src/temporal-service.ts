/** Server-only clock transitions for ALREADY issued, fully paid permissions.
 * No PayPal I/O, invoice creation, payment evidence, renewal or implicit consent.
 */
import { canonicalJson } from "./canonical";
import { ReceiptError, type ReceiptSnapshot, type ReceiptStore, type ReceiptState } from "./contract";
import { id, instant, integer, prepareReceipt, row } from "./material";
import { createReceiptService, verifyStoredReceiptChain } from "./service";
import { effectivePermissionState, licenseInterval } from "./temporal";
export interface TemporalTransition {
  readonly caseId: string; readonly snapshot: ReceiptSnapshot; readonly from: "scheduled" | "active";
  readonly to: "active" | "expired"; readonly effectiveAt: string; readonly recordedAt: string;
}
export interface TemporalStore {
  readonly receipts: ReceiptStore;
  transition(command: TemporalTransition): Promise<void>;
  listDue(at: string, limit: number): Promise<readonly string[]>;
}
export function createPermissionClock(store: TemporalStore, clock: () => Date = () => new Date()) {
  const issuer = createReceiptService(store.receipts, clock);
  return Object.freeze({
    async refresh(caseId: string) {
      try { id(caseId); } catch { return Object.freeze({ outcome: "blocked", code: "invalid_case" }); }
      for (let attempt = 0; attempt < 3; attempt++) {
        let snapshot: ReceiptSnapshot | null;
        try { snapshot = await store.receipts.load(caseId); }
        catch { return Object.freeze({ outcome: "retry_pending", code: "storage_unavailable" }); }
        if (!snapshot) return Object.freeze({ outcome: "blocked", code: "not_found" });
        let command: TemporalTransition | null = null;
        let next: ReceiptState;
        try {
          const at = instant(clock().toISOString()), p = row(snapshot.root.permission), c = row(snapshot.root.case);
          if (id(c.case_id) !== caseId) throw new ReceiptError("source_invalid");
          id(p.permission_id); integer(p.row_version);
          if (instant(p.state_effective_at) > at || snapshot.chain.some(r => r.createdAt > at)) throw new ReceiptError("source_invalid");
          if (["refunded", "revoked"].includes(String(p.permission_state))) {
            return Object.freeze({ outcome: "unchanged", status: String(p.permission_state), receiptReady: false });
          }
          const chain = await verifyStoredReceiptChain(snapshot);
          const prepared = await prepareReceipt(snapshot, at, true);
          const prior = chain.at(-1);
          // Compare only material fields, excluding revision/audit envelope metadata.
          if (prior) {
            const keys = ["case_id","asset","creator","buyer","terms","period","quote","consent","ai_provenance","payment"];
            const select = (value: object) => Object.fromEntries(keys.map(k => [k, (value as Record<string, unknown>)[k]]));
            if (canonicalJson(select(prior)) !== canonicalJson(select(prepared.material))) throw new ReceiptError("integrity_failed");
          }
          next = effectivePermissionState(prepared.state, String(p.start_date), String(p.end_date_exclusive), at);
          if (next !== prepared.state) {
            if (prior && snapshot.chain.at(-1)!.materialHash !== prepared.materialHash) throw new ReceiptError("integrity_failed");
            if (!["scheduled", "active"].includes(prepared.state) || !["active", "expired"].includes(next)) throw new ReceiptError("source_invalid");
            const period = licenseInterval(String(p.start_date), String(p.end_date_exclusive));
            const effective = next === "active" ? period.startsAt : period.expiresAt;
            if (effective < instant(p.state_effective_at)) throw new ReceiptError("source_invalid");
            command = { caseId, snapshot, from: prepared.state as "scheduled" | "active", to: next as "active" | "expired",
              effectiveAt: next === "active" ? period.startsAt : period.expiresAt, recordedAt: at };
          } else {
            // An unchanged read must not restore corrupted or independently invalidated
            // verification. Only retry publication after this worker's own transition.
            const reason = p.state_reason_code;
            if (!["utc_start_reached", "utc_end_reached"].includes(String(reason))) {
              return Object.freeze({ outcome: "unchanged", status: next, receiptReady: !!prior
                && snapshot.chain.at(-1)!.materialHash === prepared.materialHash
                && prepared.verificationStatus === next });
            }
          }
        } catch (error) {
          return Object.freeze({ outcome: "blocked", code: error instanceof ReceiptError ? error.code : "source_invalid" });
        }
        if (command) {
          try {
            // If hashing crossed a UTC day or the clock moved backward, recompute.
            const current = instant(clock().toISOString());
            if (current < command.recordedAt || current.slice(0,10) !== command.recordedAt.slice(0,10)) continue;
            await store.transition(command);
          } catch { continue; }
        }
        try {
          const receipt = await issuer.issue(caseId);
          const ready = receipt.outcome === "issued" || receipt.outcome === "unchanged";
          return Object.freeze({ outcome: ready ? command ? "refreshed" : "unchanged" : "receipt_pending",
            status: next!, receiptReady: ready, receiptOutcome: receipt.outcome });
        } catch { return Object.freeze({ outcome: "receipt_pending", status: next!, receiptReady: false }); }
      }
      return Object.freeze({ outcome: "retry_pending", code: "state_changed" });
    },
  });
}
export async function runPermissionClockBatch(store: TemporalStore, clock: () => Date = () => new Date(), limit = 25) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid clock batch limit.");
  const at = instant(clock().toISOString()), ids = await store.listDue(at, limit);
  if (ids.length > limit || new Set(ids).size !== ids.length) throw new Error("Invalid clock candidate batch.");
  const worker = createPermissionClock(store, clock), outcomes: Record<string, number> = {};
  for (const caseId of ids) { const result = await worker.refresh(caseId); outcomes[result.outcome] = (outcomes[result.outcome] ?? 0) + 1; }
  return Object.freeze({ examined: ids.length, outcomes: Object.freeze(outcomes), checkedAt: at, paymentOperations: 0 });
}
