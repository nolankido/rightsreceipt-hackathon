/** Recovery responses can offer only a source-bound continuation or status check. */
export const INVOICE_RECOVERY_CLIENT_COMMON = String.raw`
  const RECOVERY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const RECOVERY_HASH = /^[0-9a-f]{64}$/;
  const RECOVERY_INVOICE = /^INV2-[A-Za-z0-9-]{3,100}$/;
  const RECOVERY_STATUSES = ["create_pending","draft","send_pending","sent","paid","canceled","fully_refunded","reconciliation_required"];
  const RECOVERY_PROVIDER_STATUSES = ["DRAFT","UNPAID","PAID","CANCELLED","REFUNDED","SENT","SCHEDULED","MARKED_AS_PAID","PARTIALLY_PAID","PARTIALLY_REFUNDED","MARKED_AS_REFUNDED","PAYMENT_PENDING","AUTO_CANCELLED","PAID_EXTERNAL","REFUNDED_EXTERNAL","SHARED","UNKNOWN"];
  const RECOVERY_ACTIONS = {
    resume_creation: {state:"creation_reserved",operationStatus:"pending",label:"Continue this draft request",
      status:"Your confirmed draft request is saved and is ready to continue for this accepted offer.",
      copy:"Continue the saved request to create one Sandbox draft for this exact accepted offer. Sending remains a separate action."},
    record_draft: {state:"draft_observed",operationStatus:"unknown",label:"Record the existing draft",
      status:"PayPal returned a draft for this accepted offer. Its reference is saved, and the draft can now be recorded here.",
      copy:"Record the existing Sandbox draft shown here for this exact accepted offer. This action does not create or send another invoice."},
    resume_sending: {state:"sending_reserved",operationStatus:"pending",label:"Continue this send request",
      status:"Your confirmed send request is saved and is ready to continue for this invoice.",
      copy:"Continue the saved request to send this exact Sandbox invoice to the buyer recorded with the accepted offer. Sending does not confirm payment."},
    check_delivery: {state:"delivery_unresolved",operationStatus:"unknown",label:"Check invoice delivery",
      status:"An earlier send request has an unconfirmed result. Check the current delivery state of this same invoice.",
      copy:"Check this Sandbox invoice with PayPal and record a matching delivery result if available. This check does not send the invoice again or confirm payment."}
  };
  const recoveryId = value => typeof value === "string" && RECOVERY_UUID.test(value);
  const recoveryInvoiceId = value => typeof value === "string" && RECOVERY_INVOICE.test(value);
  const recoveryHash = value => typeof value === "string" && RECOVERY_HASH.test(value);
  function recoveryKeys(value,keys) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      && Object.keys(value).sort().join() === keys.split(",").sort().join();
  }
  function validateRecoveryView(v,offer,invoice) {
    const fields = "schemaVersion,environment,caseId,caseVersion,stage,termsVersionId,quoteId,creatorDecisionId,buyerAcceptanceId,invoiceId,invoiceStatus,observedDraftId,operationId,operationStatus,state,action,sourceHash,paymentConfirmed,permissionGranted";
    const nullableId = value => value === null || (typeof value === "string" && recoveryId(value));
    const pair = v?.operationId === null ? v.operationStatus === null : recoveryId(v?.operationId) && ["pending","unknown","succeeded"].includes(v.operationStatus);
    if (!recoveryKeys(v,fields) || v.schemaVersion !== "invoice-recovery-v1" || v.environment !== "sandbox" || !offer || !invoice
      || !recoveryId(v.caseId) || v.caseId !== offer.caseId || v.caseId !== invoice.caseId
      || !Number.isSafeInteger(v.caseVersion) || v.caseVersion < 1 || v.caseVersion !== offer.caseVersion || v.caseVersion !== invoice.caseVersion
      || v.stage !== offer.stage || v.stage !== invoice.stage || !recoveryId(v.termsVersionId) || v.termsVersionId !== offer.termsVersionId
      || !recoveryId(v.quoteId) || v.quoteId !== offer.quoteId || !nullableId(v.creatorDecisionId) || v.creatorDecisionId !== offer.creatorDecisionId
      || !nullableId(v.buyerAcceptanceId) || !pair || !recoveryHash(v.sourceHash)
      || (v.invoiceId !== null && !recoveryInvoiceId(v.invoiceId)) || v.invoiceId !== invoice.invoiceId
      || (v.invoiceStatus !== null && !RECOVERY_STATUSES.includes(v.invoiceStatus)) || v.invoiceStatus !== invoice.invoiceStatus
      || (v.invoiceId === null ? ![null,"create_pending"].includes(v.invoiceStatus) : [null,"create_pending"].includes(v.invoiceStatus))
      || (v.observedDraftId !== null && !recoveryInvoiceId(v.observedDraftId))
      || !["none","creation_reserved","draft_observed","creation_unresolved","sending_reserved","delivery_unresolved","complete"].includes(v.state)
      || (v.action !== null && (typeof v.action !== "string" || !Object.hasOwn(RECOVERY_ACTIONS,v.action))) || v.paymentConfirmed !== false || v.permissionGranted !== false
      || (["accepted_awaiting_invoice","billing_started"].includes(v.stage) && (!recoveryId(v.creatorDecisionId) || !recoveryId(v.buyerAcceptanceId)))) {
      throw new Error("The invoice recovery state does not match the current offer. Reload before continuing.");
    }
    const action = v.action === null ? null : RECOVERY_ACTIONS[v.action];
    const create = ["creation_reserved","draft_observed","creation_unresolved"].includes(v.state);
    const send = ["sending_reserved","delivery_unresolved"].includes(v.state);
    if ((action && (action.state !== v.state || action.operationStatus !== v.operationStatus))
      || ((create || send) && (v.stage !== "billing_started" || !recoveryId(v.operationId)
        || !recoveryId(v.creatorDecisionId) || !recoveryId(v.buyerAcceptanceId)))
      || (create && (v.invoiceId !== null || v.invoiceStatus !== "create_pending"))
      || (send && (!recoveryInvoiceId(v.invoiceId) || v.invoiceStatus !== "send_pending"))
      || (v.state === "creation_unresolved" && (v.action !== null || v.operationStatus !== "unknown" || v.observedDraftId !== null))
      || (["creation_reserved","draft_observed","sending_reserved","delivery_unresolved"].includes(v.state) && action === null)
      || (v.state === "draft_observed" ? !recoveryInvoiceId(v.observedDraftId) : v.observedDraftId !== null)
      || (v.state === "none" && (v.action !== null || ![null,"succeeded"].includes(v.operationStatus)
        || ["create_pending","send_pending"].includes(v.invoiceStatus)))
      || (v.state === "complete" && (v.action !== null || v.operationStatus !== "succeeded" || !recoveryInvoiceId(v.invoiceId)
        || [null,"create_pending","draft","send_pending"].includes(v.invoiceStatus)))) {
      throw new Error("The invoice recovery state does not match the current offer. Reload before continuing.");
    }
    return v;
  }
  function recoveryPaymentUrl(value) {
    if (typeof value !== "string" || value.length > 2048 || /[\s\\\x00-\x1f%]/.test(value)) return false;
    try {
      const url = new URL(value);
      return url.origin === "https://www.sandbox.paypal.com" && !url.username && !url.password && !url.search
        && /^https:\/\/www\.sandbox\.paypal\.com\//.test(value)
        && /^\/invoice\/(?:p\/|payerView\/details\/)[A-Za-z0-9/_-]*$/.test(url.pathname)
        && /^(?:#[A-Za-z0-9_-]+)?$/.test(url.hash) && (!url.pathname.endsWith("/") || !!url.hash) && url.href === value;
    } catch { return false; }
  }
  function validateRecoveryResult(v,prior,command) {
    const fields = "schemaVersion,environment,caseId,expectedCaseVersion,operationId,sourceHash,action,outcome,invoiceId,paymentUrl,providerStatus,paymentConfirmed,permissionGranted";
    const create = ["resume_creation","record_draft"].includes(command?.action);
    const outcomes = create ? ["draft_bound","already_bound","awaiting_reconciliation","retry_pending"]
      : ["delivery_observed","already_recorded","awaiting_reconciliation","retry_pending"];
    if (!recoveryKeys(v,fields) || v.schemaVersion !== "invoice-recovery-result-v1" || v.environment !== "sandbox" || !prior || !command
      || typeof command.action !== "string" || !Object.hasOwn(RECOVERY_ACTIONS,command.action) || command.confirmed !== true
      || v.caseId !== prior.caseId || !recoveryId(v.caseId) || v.expectedCaseVersion !== command.expectedCaseVersion || v.expectedCaseVersion !== prior.caseVersion
      || v.operationId !== command.operationId || v.operationId !== prior.operationId || !recoveryId(v.operationId)
      || v.sourceHash !== command.sourceHash || v.sourceHash !== prior.sourceHash || !recoveryHash(v.sourceHash)
      || v.action !== command.action || v.action !== prior.action || !outcomes.includes(v.outcome)
      || (v.invoiceId !== null && !recoveryInvoiceId(v.invoiceId))
      || (create && (["draft_bound","already_bound"].includes(v.outcome) && !recoveryInvoiceId(v.invoiceId)))
      || (command.action === "record_draft" && v.invoiceId !== null && v.invoiceId !== prior.observedDraftId)
      || (!create && v.invoiceId !== prior.invoiceId)
      || (v.providerStatus !== null && !RECOVERY_PROVIDER_STATUSES.includes(v.providerStatus))
      || (create && (v.paymentUrl !== null || v.providerStatus !== null))
      || (v.outcome === "delivery_observed" && [null,"DRAFT","UNKNOWN"].includes(v.providerStatus))
      || (v.paymentUrl !== null && (!recoveryPaymentUrl(v.paymentUrl) || v.outcome !== "delivery_observed" || !["SENT","UNPAID","SHARED"].includes(v.providerStatus)))
      || v.paymentConfirmed !== false || v.permissionGranted !== false) {
      throw new Error("The recovery outcome is uncertain. Retry this same recovery command or reload its recorded state.");
    }
    return v;
  }
`;
