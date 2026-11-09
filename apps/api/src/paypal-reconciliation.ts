/** Server composition only. No route, cron, payment action or real HTTP is enabled. */
import { createD1ReconciliationStore, type ReconciliationDatabase } from "../../../packages/paypal/src/reconciliation-store";
import { queueStaleInvoices, runReconciliationBatch, type ReconciliationProviderView } from "../../../packages/paypal/src/reconciliation";
import { createSandboxPermissionLifecycle } from "../../../packages/paypal/src/permission-lifecycle";
import { createD1PermissionLifecycleStore } from "../../../packages/paypal/src/permission-lifecycle-store";
import { isLocallyAssessedSettlement } from "../../../packages/paypal/src/settlement";
export interface PayPalReconciliationBindings {
  readonly APP_MODE?: string; readonly PAYPAL_MODE?: string;
  readonly PAYPAL_RECONCILIATION_ENABLED?: string;
  readonly PAYPAL_PERMISSION_LIFECYCLE_ENABLED?: string;
  readonly DB?: ReconciliationDatabase;
}
/** Select exactly one outbox consumer. A status-only completion must not consume
 * the generation needed for a financial permission transition. Both stores below
 * use this same DB; the caller cannot accidentally supply another database's lease.
 */
export async function runPayPalReconciliation(
  bindings: PayPalReconciliationBindings | undefined,
  readInvoice: (id: string) => Promise<ReconciliationProviderView>,
  now: () => Date = () => new Date(),
) {
  if (!bindings?.DB || bindings.PAYPAL_RECONCILIATION_ENABLED !== "true"
    || bindings.PAYPAL_MODE !== "paypal_sandbox" || !["sandbox", "judge"].includes(bindings.APP_MODE ?? "")) {
    return Object.freeze({ enabled: false, examined: 0 });
  }
  if (typeof readInvoice !== "function") throw new Error("A trusted Sandbox invoice reader is required.");
  if (bindings.PAYPAL_PERMISSION_LIFECYCLE_ENABLED !== undefined
    && !["true", "false"].includes(bindings.PAYPAL_PERMISSION_LIFECYCLE_ENABLED)) {
    throw new Error("Invalid lifecycle configuration.");
  }
  const store = createD1ReconciliationStore(bindings.DB);
  const at = now();
  await queueStaleInvoices(store, at.toISOString(), new Date(at.getTime() - 900_000).toISOString(), 10);
  if (bindings.PAYPAL_PERMISSION_LIFECYCLE_ENABLED !== "true") {
    return Object.freeze({ enabled: true, consumer: "status_only" as const,
      ...await runReconciliationBatch({ store, readInvoice, now }, 10) });
  }
  const worker = createSandboxPermissionLifecycle({
    recovery: store, store: createD1PermissionLifecycleStore(bindings.DB), now,
    async readInvoice(id) {
      const view = await readInvoice(id);
      if (!view || typeof view !== "object" || !("settlement" in view)
        || !isLocallyAssessedSettlement(view.settlement)) {
        // Never fall back to a status-only completion in financial mode.
        throw Object.freeze({ code: "invalid_provider_response" });
      }
      return { ...view, settlement: view.settlement };
    },
  });
  const ids = await store.listReady(at.toISOString(), 10);
  if (ids.length > 10) throw new Error("Financial recovery batch exceeded its bound.");
  const outcomes: Record<string, number> = {};
  for (const id of ids) {
    const item = await worker.reconcile(id);
    outcomes[item.outcome] = (outcomes[item.outcome] ?? 0) + 1;
  }
  return Object.freeze({ enabled: true, consumer: "financial_lifecycle" as const,
    examined: ids.length, outcomes: Object.freeze(outcomes), sandboxOnly: true, publicReceiptReady: false });
}
