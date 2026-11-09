import type { MockTransactionRecord, MockTransactionStore } from "@rightsreceipt/application";

export interface MemoryMockTransactionStore extends MockTransactionStore {
  reset(): void;
}

export function createMemoryMockTransactionStore(): MemoryMockTransactionStore {
  const byCase = new Map<string, MockTransactionRecord>();
  const caseByPublicId = new Map<string, string>();
  return {
    async get(caseId) {
      const current = byCase.get(caseId);
      return current ? structuredClone(current) : null;
    },
    async getByPublicId(publicId) {
      const caseId = caseByPublicId.get(publicId);
      const current = caseId ? byCase.get(caseId) : null;
      return current ? structuredClone(current) : null;
    },
    async save(caseId, expectedRevision, next) {
      const current = byCase.get(caseId);
      if ((current?.revision ?? 0) !== expectedRevision || next.revision !== expectedRevision + 1
        || next.caseId !== caseId) {
        throw new Error("Mock transaction revision conflict. No state was written.");
      }
      if (current?.payment || current?.receipt) {
        throw new Error("Settled simulated records cannot be overwritten.");
      }
      if (next.payment && (!next.acceptance || next.approval?.decision !== "approved" || !next.receipt)) {
        throw new Error("Simulated payment requires complete approvals and a receipt.");
      }
      if (next.acceptance && next.approval?.decision !== "approved") {
        throw new Error("Buyer acceptance requires creator approval.");
      }
      if (next.receipt) {
        if (caseByPublicId.has(next.receipt.publicId)) {
          throw new Error("Public receipt identifier collision.");
        }
      }
      // Values are immutable at the service boundary and entries are swapped as one operation.
      byCase.set(caseId, structuredClone(next));
      if (next.receipt) caseByPublicId.set(next.receipt.publicId, caseId);
    },
    reset() { byCase.clear(); caseByPublicId.clear(); },
  };
}
