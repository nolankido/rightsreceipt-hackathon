/** Explicit recovery of an existing operation. Unknown provider writes are never reset. */
import { canonicalHash, canonicalJson } from "../../receipts/src/canonical";
import { consentId, consentRow } from "./consent-contract";
import type { createHumanConsentService } from "./human-consent";
import type { createInvoiceCreationService } from "./invoice-creation";
import type { createInvoiceSendingService, InvoiceSendingSnapshot, InvoiceSendingStore } from "./invoice-sending";
import { InvoiceRecoveryError, type InvoiceRecoveryAction, type InvoiceRecoveryCommand,
  type InvoiceRecoveryFailure, type InvoiceRecoveryPrincipal, type InvoiceRecoveryState } from "./invoice-recovery-contract";

function fail(code: InvoiceRecoveryFailure): never { throw new InvoiceRecoveryError(code); }
const INVOICE = /^INV2-[A-Za-z0-9-]{3,100}$/u;
const ACTIONS: readonly string[] = ["resume_creation", "record_draft", "resume_sending", "check_delivery"];
export function parseInvoiceRecoveryCommand(raw: unknown): InvoiceRecoveryCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("invalid_command");
  const c = raw as Record<string, unknown>;
  if (Object.keys(c).sort().join() !== "action,confirmed,expectedCaseVersion,operationId,sourceHash"
    || c.confirmed !== true || !Number.isSafeInteger(c.expectedCaseVersion) || Number(c.expectedCaseVersion) < 1
    || Number(c.expectedCaseVersion) >= Number.MAX_SAFE_INTEGER || typeof c.sourceHash !== "string"
    || !/^[a-f0-9]{64}$/u.test(c.sourceHash) || typeof c.action !== "string" || !ACTIONS.includes(c.action)) fail("invalid_command");
  try { consentId(c.operationId); } catch { fail("invalid_command"); }
  return Object.freeze({ ...c }) as unknown as InvoiceRecoveryCommand;
}

/** Remove only the fields this existing operation may advance before completion. */
function executionSource(s: InvoiceSendingSnapshot, action: InvoiceRecoveryAction) {
  const value = JSON.parse(s.stateJson) as {
    creation: { operations: Record<string, unknown>[] };
    operations: Record<string, unknown>[]; journal: Record<string, unknown> | null;
  };
  const creation = action === "resume_creation" || action === "record_draft";
  const op = (creation ? value.creation.operations : value.operations)[0]!;
  if (action === "resume_creation" || action === "resume_sending")
    for (const field of ["status", "attempt_count", "error_code", "updated_at", "row_version"]) delete op[field];
  if (action === "resume_creation") delete op.provider_reference;
  if (!creation && value.journal) value.journal.send_state = "operation_owned_transition";
  return canonicalJson(value);
}

export function createInvoiceRecoveryService(deps: {
  readonly store: Pick<InvoiceSendingStore, "load">;
  readonly creation: Pick<ReturnType<typeof createInvoiceCreationService>, "inspect" | "execute">;
  readonly sending: Pick<ReturnType<typeof createInvoiceSendingService>, "inspect" | "execute">;
  readonly consent: Pick<ReturnType<typeof createHumanConsentService>, "reviewCreator">;
  readonly authorizeCreator: (caseId: string) => Promise<InvoiceRecoveryPrincipal | null>;
  readonly checkActive: () => void;
  readonly canCreate: () => boolean;
  readonly canSend: () => boolean;
  readonly now?: () => Date;
}) {
  let active: { caseId: string; command: InvoiceRecoveryCommand; principal: InvoiceRecoveryPrincipal;
    source: string; initial: InvoiceSendingSnapshot; observedDraftId: string | null; failure: InvoiceRecoveryFailure | null } | null = null;
  let principal: InvoiceRecoveryPrincipal | null = null;
  function live(p: InvoiceRecoveryPrincipal) {
    deps.checkActive();
    if (!Number.isSafeInteger(p.expiresAt) || p.expiresAt <= Math.floor((deps.now?.() ?? new Date()).getTime() / 1000)) fail("not_authorized");
  }
  async function owner(caseId: string) {
    let p: InvoiceRecoveryPrincipal | null;
    try { p = await deps.authorizeCreator(caseId); } catch { return fail("not_authorized"); }
    if (!p || !/^[A-Za-z0-9._:-]{1,120}$/u.test(p.actorReference)) fail("not_authorized");
    try { consentId(p.workspaceId); } catch { fail("not_authorized"); }
    if (principal && (p.workspaceId !== principal.workspaceId || p.actorReference !== principal.actorReference)) fail("not_authorized");
    live(p); principal = Object.freeze({ ...p }); return principal;
  }
  async function load(caseId: string) {
    let s: InvoiceSendingSnapshot | null;
    try { s = await deps.store.load(caseId); } catch { return fail("storage_unavailable"); }
    if (!s) fail("not_found");
    if (consentRow(s.creation.consent.root.case).case_id !== caseId) fail("source_invalid");
    return s;
  }
  async function inspect(caseId: string) {
    try { consentId(caseId); } catch { fail("invalid_command"); }
    const p = await owner(caseId), s = await load(caseId), c = consentRow(s.creation.consent.root.case);
    if (c.workspace_id !== p.workspaceId) fail("not_authorized");
    const offer = await deps.consent.reviewCreator(caseId);
    if (offer.caseVersion !== c.row_version) fail("stale_revision");
    const create = s.creation.operations[0], send = s.operations[0], binding = s.creation.binding;
    if (s.creation.operations.length > 1 || s.operations.length > 1) fail("source_invalid");
    let state: InvoiceRecoveryState = "none", action: InvoiceRecoveryAction | null = null;
    let observedDraftId: string | null = null;
    if (!create) {
      if (binding || send || s.journal || c.invoice_binding_id !== null || s.creation.consent.root.invoiceCount !== 0
        || s.creation.consent.root.operationCount !== 0) fail("source_invalid");
    } else {
      const checked = await deps.creation.inspect(caseId);
      if (checked.s.stateJson !== s.creation.stateJson) fail("stale_revision");
      if (create.status === "pending") { state = "creation_reserved"; action = "resume_creation"; }
      else if (create.status === "unknown" && create.error_code === "draft_observed") {
        state = "draft_observed"; action = "record_draft"; observedDraftId = String(create.provider_reference);
      } else if (create.status === "unknown") state = "creation_unresolved";
      else {
        const sent = await deps.sending.inspect(caseId);
        if (sent.s.stateJson !== s.stateJson) fail("stale_revision");
        if (!send && s.journal) fail("source_invalid");
        if (send?.status === "pending") {
          if (s.journal?.sendState !== "not_started") fail("source_invalid");
          state = "sending_reserved"; action = "resume_sending";
        } else if (send?.status === "unknown") { state = "delivery_unresolved"; action = "check_delivery"; }
        else if (send?.status === "succeeded") state = "complete";
      }
      if (create.status !== "succeeded" && (send || s.journal)) fail("source_invalid");
    }
    if (action && !((action === "resume_creation" || action === "record_draft") ? deps.canCreate() : deps.canSend())) fail("recovery_unavailable");
    const op = send ?? create;
    const invoiceId = binding?.provider_invoice_id ?? null;
    if (invoiceId !== null && (typeof invoiceId !== "string" || !INVOICE.test(invoiceId))) fail("source_invalid");
    const sourceHash = await canonicalHash({ schema: "invoice-recovery-source-v1", state: s.stateJson });
    const view = Object.freeze({ schemaVersion: "invoice-recovery-v1" as const, environment: "sandbox" as const,
      caseId, caseVersion: offer.caseVersion, stage: offer.stage, termsVersionId: offer.termsVersionId, quoteId: offer.quoteId,
      creatorDecisionId: c.latest_creator_decision_id as string | null, buyerAcceptanceId: c.latest_buyer_acceptance_id as string | null,
      invoiceId: invoiceId as string | null, invoiceStatus: (binding?.invoice_status ?? null) as string | null, observedDraftId,
      operationId: (op?.payment_operation_id ?? null) as string | null,
      operationStatus: (op?.status ?? null) as "pending" | "unknown" | "succeeded" | null,
      state, action, sourceHash, paymentConfirmed: false as const, permissionGranted: false as const });
    const fresh = await owner(caseId);
    if ((await load(caseId)).stateJson !== s.stateJson) fail("stale_revision");
    live(fresh); return { s, view, principal: fresh };
  }
  /** Called after the last async authority check, before each external dispatch or write. */
  async function guard() {
    const execution = active; if (!execution) fail("not_authorized");
    try {
      const p = await owner(execution.caseId), s = await load(execution.caseId);
      if (active !== execution || executionSource(s, execution.command.action) !== execution.source) fail("stale_revision");
      const creation = execution.command.action === "resume_creation" || execution.command.action === "record_draft";
      const op = (creation ? s.creation.operations : s.operations)[0];
      if (!op || op.payment_operation_id !== execution.command.operationId) fail("stale_revision");
      const initial = (creation ? execution.initial.creation.operations : execution.initial.operations)[0]!;
      if (execution.command.action === "resume_creation") {
        const pending = op.status === "pending" && op.attempt_count === 0 && op.error_code === null
          && op.provider_reference === null && op.row_version === initial.row_version;
        const claimed = op.status === "unknown" && op.attempt_count === 1 && op.error_code === "creation_dispatch_claimed"
          && op.provider_reference === null && op.row_version === Number(initial.row_version) + 1;
        const observed = op.status === "unknown" && op.attempt_count === 1 && op.error_code === "draft_observed"
          && execution.observedDraftId !== null && op.provider_reference === execution.observedDraftId
          && op.row_version === Number(initial.row_version) + 2;
        if (!pending && !claimed && !observed) fail("stale_revision");
      } else if (execution.command.action === "resume_sending") {
        const pending = op.status === "pending" && op.attempt_count === 0 && op.error_code === null && op.row_version === initial.row_version;
        const claimed = op.status === "unknown" && op.attempt_count === 1 && op.error_code === "send_dispatch_claimed"
          && op.row_version === Number(initial.row_version) + 1;
        if (!pending && !claimed) fail("stale_revision");
      }
      live(p); return s;
    } catch (error) {
      execution.failure = error instanceof InvoiceRecoveryError ? error.code : "not_authorized";
      throw error;
    }
  }
  return Object.freeze({
    async review(caseId: string) { return (await inspect(caseId)).view; },
    /** Internal write fence. The persistence transaction additionally compares its exact source. */
    guardWrite: guard,
    /** Preserve a validated response from this exact dispatch even if authority expires.
     * This can retain an identifier only; it cannot bind an invoice or authorize I/O. */
    guardObservation(op: Readonly<Record<string, unknown>>, invoiceId: string) {
      const execution = active, initial = execution?.initial.creation.operations[0];
      if (!execution || execution.command.action !== "resume_creation" || !initial || !INVOICE.test(invoiceId)
        || op.payment_operation_id !== execution.command.operationId || op.command_fingerprint !== initial.command_fingerprint
        || op.provider_request_id !== initial.provider_request_id || op.operation_key !== initial.operation_key
        || op.case_id !== execution.caseId || op.row_version !== Number(initial.row_version) + 1
        || op.status !== "unknown" || op.attempt_count !== 1 || op.error_code !== "creation_dispatch_claimed"
        || op.provider_reference !== null) fail("source_invalid");
      if (execution.observedDraftId !== null && execution.observedDraftId !== invoiceId) fail("source_invalid");
      execution.observedDraftId = invoiceId;
    },
    async guardTransport() {
      const s = await guard(), execution = active!;
      const creation = execution.command.action === "resume_creation";
      const op = (creation ? s.creation.operations : s.operations)[0];
      if (execution.command.action === "record_draft" || !op || op.status !== "unknown" || op.attempt_count !== 1
        || (creation && (op.error_code !== "creation_dispatch_claimed" || op.provider_reference !== null))
        || (!creation && op.error_code !== "send_dispatch_claimed")) fail("not_authorized");
      live(principal!);
    },
    async recover(caseId: string, raw: unknown) {
      const command = parseInvoiceRecoveryCommand(raw), before = await inspect(caseId);
      if (before.view.caseVersion !== command.expectedCaseVersion || before.view.operationId !== command.operationId
        || before.view.sourceHash !== command.sourceHash || before.view.action !== command.action) fail("stale_revision");
      if (active) fail("stale_revision");
      const execution = { caseId, command, principal: before.principal, initial: before.s, observedDraftId: null,
        failure: null as InvoiceRecoveryFailure | null,
        source: executionSource(before.s, command.action) };
      active = execution;
      let result: Awaited<ReturnType<typeof deps.creation.execute>> | Awaited<ReturnType<typeof deps.sending.execute>>;
      try {
        const creation = command.action === "resume_creation" || command.action === "record_draft";
        result = creation ? await deps.creation.execute(caseId, { stateJson: before.s.creation.stateJson, operationId: command.operationId, action: command.action })
          : await deps.sending.execute(caseId, { stateJson: before.s.stateJson, operationId: command.operationId, action: command.action });
      } finally { active = null; }
      if (execution.failure) fail(execution.failure);
      const after = await inspect(caseId);
      if (after.view.operationId !== command.operationId || after.view.termsVersionId !== before.view.termsVersionId
        || after.view.quoteId !== before.view.quoteId || after.view.creatorDecisionId !== before.view.creatorDecisionId
        || after.view.buyerAcceptanceId !== before.view.buyerAcceptanceId) fail("stale_revision");
      if ((command.action === "record_draft" && (after.view.invoiceId ?? after.view.observedDraftId) !== before.view.observedDraftId)
        || ((command.action === "resume_sending" || command.action === "check_delivery") && after.view.invoiceId !== before.view.invoiceId)
        || (command.action === "resume_creation" && after.view.invoiceId !== null && after.view.invoiceId !== execution.observedDraftId)
        || (execution.observedDraftId !== null && after.view.observedDraftId !== null && after.view.observedDraftId !== execution.observedDraftId)) fail("stale_revision");
      const paymentUrl = "paymentUrl" in result ? result.paymentUrl : null;
      const providerStatus = "providerStatus" in result ? result.providerStatus : null;
      const response = Object.freeze({ schemaVersion: "invoice-recovery-result-v1" as const, environment: "sandbox" as const,
        caseId, expectedCaseVersion: command.expectedCaseVersion, operationId: command.operationId, sourceHash: command.sourceHash,
        action: command.action, outcome: result.outcome, invoiceId: after.view.invoiceId,
        paymentUrl, providerStatus,
        paymentConfirmed: false as const, permissionGranted: false as const });
      live(principal!); return response;
    },
  });
}

export type InvoiceRecoveryView = Awaited<ReturnType<ReturnType<typeof createInvoiceRecoveryService>["review"]>>;
export type InvoiceRecoveryResult = Awaited<ReturnType<ReturnType<typeof createInvoiceRecoveryService>["recover"]>>;
