/** Server composition only. No HTTP route, credentials or timer is enabled here. */
import { createSandboxPermissionLifecycle, type LifecycleRecovery, type LifecycleProviderView } from "../../../packages/paypal/src/permission-lifecycle";
import { createD1PermissionLifecycleStore, type LifecycleDatabase } from "../../../packages/paypal/src/permission-lifecycle-store";
export interface PermissionLifecycleBindings {
  readonly APP_MODE?: string;
  readonly PAYPAL_MODE?: string;
  readonly PAYPAL_PERMISSION_LIFECYCLE_ENABLED?: string;
  readonly DB?: LifecycleDatabase;
}
/** Inject the existing D1 recovery store for this SAME DB and the authenticated,
 * content-validating Sandbox adapter's getInvoice method. Never browser JSON.
 */
export async function runPayPalPermissionLifecycle(bindings: PermissionLifecycleBindings | undefined,
  bindingId: string, dependencies: {
    readonly recovery: LifecycleRecovery;
    readonly readInvoice: (id: string) => Promise<LifecycleProviderView>;
  }) {
  if (!bindings?.DB || bindings.PAYPAL_PERMISSION_LIFECYCLE_ENABLED !== "true"
    || bindings.PAYPAL_MODE !== "paypal_sandbox" || !["sandbox", "judge"].includes(bindings.APP_MODE ?? "")) {
    return Object.freeze({ enabled: false });
  }
  const lifecycle = createSandboxPermissionLifecycle({ recovery: dependencies.recovery,
    store: createD1PermissionLifecycleStore(bindings.DB), readInvoice: dependencies.readInvoice });
  return Object.freeze({ enabled: true, ...(await lifecycle.reconcile(bindingId)) });
}
