/** Fenced canonical financial transitions. Caller supplies the existing recovery
 * lease; every human version and permission revision is rechecked inside SQL.
 */
import type { LifecycleClaim, LifecycleCompletion, LifecycleContext, LifecyclePermission, PermissionLifecycleStore } from "./permission-lifecycle";
export interface LifecycleStatement {
  bind(...values: readonly (string | number | null)[]): LifecycleStatement;
  first<T>(): Promise<T | null>;
}
export interface LifecycleDatabase {
  prepare(sql: string): LifecycleStatement;
  batch(statements: readonly LifecycleStatement[]): Promise<readonly { readonly success: boolean; readonly meta?: { readonly changes?: number } }[]>;
}
const FROM = `FROM invoice_bindings b JOIN licensing_cases c ON c.case_id=b.case_id
 JOIN terms_versions t ON t.terms_version_id=b.terms_version_id
 JOIN quotes q ON q.quote_id=b.quote_id
 JOIN buyer_acceptances a ON a.buyer_acceptance_id=b.buyer_acceptance_id
 JOIN creator_decisions d ON d.creator_decision_id=a.creator_decision_id
 JOIN paypal_reconciliation_outbox o ON o.invoice_binding_id=b.invoice_binding_id`;
const CONSENT = `b.provider='paypal' AND b.environment='sandbox' AND c.case_outcome='open'
 AND c.invoice_binding_id=b.invoice_binding_id AND c.latest_terms_version_id=b.terms_version_id
 AND c.latest_quote_id=b.quote_id AND c.latest_buyer_acceptance_id=b.buyer_acceptance_id
 AND c.latest_creator_decision_id=d.creator_decision_id
 AND t.case_id=b.case_id AND t.resolution_status='complete' AND t.source_kind='human_corrected' AND t.created_by_actor='creator'
 AND q.case_id=b.case_id AND q.terms_version_id=b.terms_version_id AND q.status='current' AND q.currency='USD'
 AND a.case_id=b.case_id AND a.terms_version_id=b.terms_version_id AND a.quote_id=b.quote_id
 AND length(a.acceptance_copy_version)>0 AND length(a.accepted_at)>=20
 AND d.case_id=b.case_id AND d.terms_version_id=b.terms_version_id AND d.quote_id=b.quote_id AND d.decision='approved'`;
export function createD1PermissionLifecycleStore(db: LifecycleDatabase): PermissionLifecycleStore {
  return {
    async context(c: LifecycleClaim): Promise<LifecycleContext | null> {
      const row = await db.prepare(`SELECT t.start_date AS startDate,t.duration_days AS durationDays,
        (SELECT MAX(observed_at) FROM paypal_lifecycle_observations WHERE invoice_binding_id=b.invoice_binding_id) AS lastObservedAt,
        COALESCE((SELECT MAX(refunded_cents) FROM paypal_lifecycle_observations WHERE invoice_binding_id=b.invoice_binding_id),0) AS highestRefundCents,
        EXISTS(SELECT 1 FROM payment_evidence WHERE invoice_binding_id=b.invoice_binding_id AND payment_status='paid'
          AND evidence_source='reconciliation') AS paidPreviously ${FROM}
        WHERE b.invoice_binding_id=? AND b.row_version=? AND c.row_version=? AND ${CONSENT}`)
        .bind(c.bindingId,c.bindingVersion,c.caseVersion).first<{
          startDate:string;durationDays:number;lastObservedAt:string|null;highestRefundCents:number;paidPreviously:number;
        }>();
      if (!row) return null;
      const permission = await db.prepare(`SELECT permission_id AS id,permission_state AS state,row_version AS version,
        start_date AS startDate,end_date_exclusive AS endDateExclusive,review_required AS reviewRequired
        FROM permissions WHERE case_id=? AND invoice_binding_id=? AND terms_version_id=?`)
        .bind(c.caseId,c.bindingId,c.termsVersionId).first<LifecyclePermission>();
      return { ...row, paidPreviously: row.paidPreviously === 1, permission };
    },
    async completed(bindingId,generation) {
      return !!await db.prepare(`SELECT observation_id FROM paypal_lifecycle_observations WHERE invoice_binding_id=? AND generation=?`)
        .bind(bindingId,generation).first();
    },
    async commit(input: LifecycleCompletion) {
      const { claim:c,context:x,financial:f,decision:v,now:at } = input;
      const observationId=crypto.randomUUID(), permissionId=x.permission?.id ?? crypto.randomUUID();
      const statements: LifecycleStatement[] = [];
      const exact = new Set<number>();
      const add = (statement:LifecycleStatement, one=true) => { if(one)exact.add(statements.length);statements.push(statement); };
      // NOT NULL subquery failure aborts the entire batch. Never use INSERT OR IGNORE here.
      add(db.prepare(`INSERT INTO paypal_lifecycle_observations(observation_id,invoice_binding_id,generation,
        provider_status,conclusion,reason_code,paid_cents,refunded_cents,detail_sha256,observed_at,recorded_at)
        VALUES (?,(SELECT b.invoice_binding_id ${FROM} WHERE b.invoice_binding_id=? AND ${CONSENT}
          AND b.provider_invoice_id=? AND b.quote_id=? AND b.terms_version_id=? AND b.buyer_acceptance_id=?
          AND b.row_version=? AND c.row_version=? AND q.amount_cents=? AND t.start_date=? AND t.duration_days=?
          AND o.lease_token=? AND o.lease_expires_at>? AND o.attempt_generation=?
          AND o.completed_generation<? AND o.requested_generation=?
          AND COALESCE((SELECT row_version FROM permissions WHERE case_id=c.case_id),0)=?
          AND COALESCE((SELECT permission_id FROM permissions WHERE case_id=c.case_id),'')=?
        ),?,?,?,?,?,?,?,?,?)`).bind(observationId,c.bindingId,c.invoiceId,c.quoteId,c.termsVersionId,c.buyerAcceptanceId,
          c.bindingVersion,c.caseVersion,c.amountCents,x.startDate,x.durationDays,c.token,at,c.generation,c.generation,c.generation,
          x.permission?.version??0,x.permission?.id??"",c.generation,f.providerStatus,f.conclusion,v.reason,
          f.paidCents,f.refundedCents,input.observationHash,f.observedAt,at));
      add(db.prepare(`INSERT INTO paypal_reconciliation_receipts(reconciliation_receipt_id,invoice_binding_id,generation,
        provider_invoice_id,provider_status,local_invoice_status,reason_code,amount_cents,currency,safe_payment_url,observed_at,recorded_at)
        VALUES (?,?,?,?,?,?,?,?, 'USD',NULL,?,?)`).bind(crypto.randomUUID(),c.bindingId,c.generation,c.invoiceId,
          f.providerStatus,v.invoiceState,v.reviewRequired?"financial_review_required":"current_provider_state",c.amountCents,f.observedAt,at));
      for(const e of input.evidence) add(db.prepare(`INSERT INTO payment_evidence(payment_evidence_id,invoice_binding_id,
        evidence_source,source_reference,payment_status,amount_cents,currency,observed_at,evidence_hash,created_at)
        VALUES (?,?,'reconciliation',?,?,?,'USD',?,?,?) ON CONFLICT(evidence_hash) DO NOTHING`)
        .bind(crypto.randomUUID(),c.bindingId,`invoice-financial:${c.invoiceId}`,e.kind,e.kind==="canceled"?0:c.amountCents,
          f.observedAt,e.hash,at),false);
      if(v.permissionState && v.permissionChanged) {
        add(db.prepare(`INSERT INTO permissions(permission_id,case_id,invoice_binding_id,terms_version_id,
          permission_state,state_reason_code,start_date,end_date_exclusive,state_effective_at,created_at,updated_at,row_version,review_required)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?) ON CONFLICT(case_id) DO UPDATE SET
          permission_state=excluded.permission_state,state_reason_code=excluded.state_reason_code,
          state_effective_at=excluded.state_effective_at,updated_at=excluded.updated_at,
          review_required=excluded.review_required,row_version=permissions.row_version+1`)
          .bind(permissionId,c.caseId,c.bindingId,c.termsVersionId,v.permissionState,v.reason,x.startDate,
            v.endDateExclusive,at,at,at,v.reviewRequired?1:0));
      }
      add(db.prepare(`UPDATE invoice_bindings SET invoice_status=?,updated_at=?,row_version=row_version+1
        WHERE invoice_binding_id=? AND row_version=?`).bind(v.invoiceState,at,c.bindingId,c.bindingVersion));
      add(db.prepare(`UPDATE licensing_cases SET permission_id=?,updated_at=?,row_version=row_version+1
        WHERE case_id=? AND row_version=?`).bind(v.permissionState?permissionId:null,at,c.caseId,c.caseVersion));
      // No public active claim with an old or nonexistent receipt revision. Turn 028
      // must publish a matching hashed revision before verification may become valid.
      if(v.permissionChanged || v.reviewRequired || v.invoiceState!==c.invoiceState) add(db.prepare(`UPDATE verification_records
        SET current_status='invalid',updated_at=?,row_version=row_version+1
        WHERE case_id=? AND current_status!='invalid'`).bind(at,c.caseId),false);
      const eventType = v.permissionChanged && !v.reviewRequired && v.permissionState
        ? `permission.${v.permissionState === "active" ? "activated" : v.permissionState}`
        : v.reviewRequired ? "payment.review_required"
          : v.invoiceState==="canceled" && c.invoiceState!=="canceled" ? "invoice.canceled_confirmed" : "paypal.financial_snapshot_checked";
      add(db.prepare(`INSERT INTO audit_events(audit_event_id,case_id,aggregate_type,aggregate_id,aggregate_sequence,
        event_type,actor_type,actor_reference,payload_json,correlation_id,idempotency_key,created_at)
        VALUES (?,?,'permission_lifecycle',?,?,?,'system','sandbox-financial-lifecycle',?,?,?,?)`)
        .bind(crypto.randomUUID(),c.caseId,c.bindingId,c.generation,eventType,JSON.stringify({
          invoice_binding_id:c.bindingId,terms_version_id:c.termsVersionId,quote_id:c.quoteId,buyer_acceptance_id:c.buyerAcceptanceId,
          observation_sha256:input.observationHash,invoice_status:v.invoiceState,permission_state:v.permissionState,
          review_required:v.reviewRequired,permission_changed:v.permissionChanged,sandbox_only:true,public_receipt_ready:false,
        }),observationId,`lifecycle:${c.bindingId}:${c.generation}`,at));
      add(db.prepare(`UPDATE paypal_reconciliation_outbox SET completed_generation=?,lease_token=NULL,lease_expires_at=NULL,
        attempt_count=0,attempt_generation=0,next_attempt_at=NULL,last_error_code=NULL,blocked_code=NULL,last_success_at=?,updated_at=?
        WHERE invoice_binding_id=? AND lease_token=?`).bind(c.generation,f.observedAt,at,c.bindingId,c.token));
      const results=await db.batch(statements);
      if(results.length!==statements.length || results.some((r,i)=>!r.success || (exact.has(i)?r.meta?.changes!==1:![0,1].includes(r.meta?.changes??-1)))) {
        throw new Error("Financial lifecycle transaction unavailable.");
      }
    },
  };
}

/** Explicit creator action, independent of payment/refund operations. The server
 * must inject an authenticated authorization function, never a browser boolean.
 */
export async function revokeSandboxPermission(db: LifecycleDatabase, input: {
  readonly permissionId: string; readonly expectedVersion: number; readonly actorReference: string;
}, authorize: (context: Readonly<{ caseId: string; permissionId: string }>) => Promise<boolean>, at: string) {
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
  if(!uuid.test(input.permissionId) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion<1
    || !/^[A-Za-z0-9._:-]{1,120}$/u.test(input.actorReference) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(at)
    || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString()!==at || typeof authorize!=="function") throw new Error("Invalid revocation command.");
  const current=await db.prepare(`SELECT p.permission_id AS id,p.case_id AS caseId,p.permission_state AS state,
    p.row_version AS version,c.row_version AS caseVersion FROM permissions p
    JOIN invoice_bindings b ON b.invoice_binding_id=p.invoice_binding_id JOIN licensing_cases c ON c.case_id=p.case_id
    WHERE p.permission_id=? AND b.provider='paypal' AND b.environment='sandbox'`)
    .bind(input.permissionId).first<{id:string;caseId:string;state:string;version:number;caseVersion:number}>();
  if(!current || await authorize(Object.freeze({caseId:current.caseId,permissionId:current.id}))!==true) throw new Error("Creator authority required.");
  if(current.state==="revoked") return Object.freeze({changed:false,state:"revoked",refundInitiated:false});
  if(current.version!==input.expectedVersion || !["scheduled","active"].includes(current.state)) throw new Error("Permission cannot be revoked from this version.");
  const correlation=crypto.randomUUID();
  const result=await db.batch([
    db.prepare(`INSERT INTO audit_events(audit_event_id,case_id,aggregate_type,aggregate_id,aggregate_sequence,event_type,
      actor_type,actor_reference,payload_json,correlation_id,idempotency_key,created_at)
      VALUES (?,(SELECT c.case_id FROM permissions p JOIN licensing_cases c ON c.case_id=p.case_id
        WHERE p.permission_id=? AND p.row_version=? AND c.row_version=? AND p.permission_state IN ('scheduled','active')),
        'permission_revocation',?,?,'permission.revoked','creator',?,?,?,?,?)`)
      .bind(crypto.randomUUID(),current.id,current.version,current.caseVersion,current.id,current.version+1,
        input.actorReference,JSON.stringify({permission_id:current.id,refund_initiated:false}),correlation,`revoke:${current.id}`,at),
    db.prepare(`UPDATE permissions SET permission_state='revoked',state_reason_code='creator_revoked',review_required=0,
      state_effective_at=?,updated_at=?,row_version=row_version+1 WHERE permission_id=? AND row_version=?`)
      .bind(at,at,current.id,current.version),
    db.prepare(`UPDATE licensing_cases SET updated_at=?,row_version=row_version+1 WHERE case_id=? AND row_version=?`)
      .bind(at,current.caseId,current.caseVersion),
    db.prepare(`UPDATE verification_records SET current_status='invalid',updated_at=?,row_version=row_version+1
      WHERE case_id=? AND current_status!='invalid'`).bind(at,current.caseId),
  ]);
  if(result.length!==4 || result.some((r,i)=>!r.success || (i<3?r.meta?.changes!==1:![0,1].includes(r.meta?.changes??-1)))) throw new Error("Revocation transaction unavailable.");
  return Object.freeze({changed:true,state:"revoked",refundInitiated:false});
}
