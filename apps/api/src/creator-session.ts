/** Request-bound authorizers. Case and asset ownership come from SQL, never request JSON. */
import { createCreatorAccessVerifier, type CreatorAccessBindings } from "./security/creator-access";
import type { CreatorPrincipal } from "../../../packages/application/src/consent-contract";
export interface CreatorSessionPrincipal extends CreatorPrincipal { readonly expiresAt: number }
export interface CreatorSessionDatabase {
  prepare(sql: string): { bind(...values: readonly (string | number | null)[]): { first<T>(): Promise<T | null> } };
}
export interface CreatorSessionBindings extends CreatorAccessBindings { readonly DB?: CreatorSessionDatabase }
const CASE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export function createCreatorSessionAuthorization(deps: Parameters<typeof createCreatorAccessVerifier>[0]) {
  const verifier = createCreatorAccessVerifier(deps);
  return Object.freeze({
    session: verifier.authenticate,
    async authorize(request: Request, caseId: string, env: CreatorSessionBindings | undefined): Promise<CreatorPrincipal | null> {
      try {
        if (!env?.DB || !CASE.test(caseId)) return null;
        const before = await verifier.authenticate(request, env); if (!before) return null;
        const owner = await env.DB.prepare("SELECT workspace_id AS workspaceId FROM licensing_cases WHERE case_id=? AND workspace_id=?")
          .bind(caseId, before.workspaceId).first<{ workspaceId: string }>();
        if (!owner || owner.workspaceId !== before.workspaceId) return null;
        const after = await verifier.authenticate(request, env);
        if (!after || after.workspaceId !== before.workspaceId || after.actorReference !== before.actorReference) return null;
        return Object.freeze({ workspaceId: after.workspaceId, actorReference: after.actorReference });
      } catch { return null; }
    },
    async authorizeRecovery(request: Request, caseId: string, env: CreatorSessionBindings | undefined): Promise<CreatorSessionPrincipal | null> {
      try {
        if (!env?.DB || !CASE.test(caseId)) return null;
        const database = env.DB;
        const before = await verifier.authenticate(request, env); if (!before) return null;
        const owner = await database.prepare("SELECT workspace_id AS workspaceId FROM licensing_cases WHERE case_id=? AND workspace_id=?")
          .bind(caseId, before.workspaceId).first<{ workspaceId: string }>();
        if (!owner || owner.workspaceId !== before.workspaceId) return null;
        const after = await verifier.authenticate(request, env);
        if (!after || env.DB !== database || after.workspaceId !== before.workspaceId || after.actorReference !== before.actorReference) return null;
        return Object.freeze({ workspaceId: after.workspaceId, actorReference: after.actorReference, expiresAt: after.expiresAt });
      } catch { return null; }
    },
    async authorizeAsset(request: Request, assetId: string, env: CreatorSessionBindings | undefined): Promise<CreatorSessionPrincipal | null> {
      try {
        if (!env?.DB || !CASE.test(assetId)) return null;
        const database = env.DB;
        const before = await verifier.authenticate(request, env); if (!before) return null;
        const owner = await database.prepare("SELECT workspace_id AS workspaceId FROM assets WHERE asset_id=? AND workspace_id=?")
          .bind(assetId, before.workspaceId).first<{ workspaceId: string }>();
        if (!owner || owner.workspaceId !== before.workspaceId) return null;
        const after = await verifier.authenticate(request, env);
        if (!after || env.DB !== database || after.workspaceId !== before.workspaceId || after.actorReference !== before.actorReference) return null;
        return Object.freeze({ workspaceId: after.workspaceId, actorReference: after.actorReference, expiresAt: after.expiresAt });
      } catch { return null; }
    },
  });
}
