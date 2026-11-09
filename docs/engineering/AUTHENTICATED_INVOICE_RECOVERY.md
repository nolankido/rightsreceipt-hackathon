# Authenticated Recovery for Uncertain Invoice Outcomes

**Owning turn:** 039
**Date:** October 27, 2026 HST.
**Scope:** Let the authenticated creator deliberately continue an existing invoice operation without duplicating an uncertain provider write.

## Product behavior

The existing creator offer page now explains unfinished invoice attempts and offers only the action justified by the durable operation journal. Opening the page or choosing Reload reads local metadata. It does not contact PayPal, reserve another operation or infer delivery, payment or permission.

| Recorded state | Available action | Provider effect |
| --- | --- | --- |
| Creation reserved, attempt count zero | Continue this draft request | Claim the existing operation, then dispatch its first draft request |
| Valid draft ID retained, binding incomplete | Record the existing draft | Bind that exact saved ID locally; no HTTP request |
| Creation dispatched, no returned ID retained | Paused with an explanation | No create retry and no automatic discovery |
| Sending reserved, attempt count zero | Continue this send request | Claim the existing operation, then dispatch its first send request |
| Sending dispatched, result unconfirmed | Check invoice delivery | Retrieve that same invoice; never repeat the send POST |
| No unfinished operation, or delivery recorded | Existing ordinary controls/status | No recovery action |

Every offered action has an explanation, an unchecked confirmation and a disabled submit button until confirmed. Successful draft recovery exposes the ordinary separate send confirmation. Delivery recovery can enqueue the normal reconciliation work, but cannot create payment evidence, activate permission or issue a receipt.

An uncertain draft creation without a trusted returned invoice ID remains unresolved. This turn does not accept a caller-supplied provider ID, reset an operation claim, replace an idempotency key or search the provider account. Those shortcuts could bind the wrong invoice or create a duplicate. The page states the limitation and allows local status reload.

## Routes, configuration and composition

| Endpoint | Contract |
| --- | --- |
| `GET /api/invoices/creator/cases/:caseId/recovery` | Authenticated, local-only `invoice-recovery-v1` metadata |
| `POST /api/invoices/creator/cases/:caseId/recover` | Explicit exact-source command and `invoice-recovery-result-v1` outcome |

`INVOICE_RECOVERY_ENABLED=false` is the checked-in default. Recovery also requires the existing invoice-control, human-consent and creator-access gates, a database binding, Sandbox/judge mode, matching fixed HTTPS origins and valid Sandbox merchant configuration. Creation and sending each retain their existing operation switch. Construction of the transport validates server configuration but performs no HTTP request.

The shared native transaction composition handles these two paths before the ordinary invoice route family. It retains a single route factory so the per-isolate limit survives individual requests. Existing invoice-controls responses and create/send commands remain compatible. A disabled recovery feature does not disable ordinary draft creation or sending.

The existing managed gateway protection for `/api/invoices/creator/*`, the creator page and its script also covers recovery. No additional public page, database migration, dependency or package is introduced. All nine migrations, 33 domain tables and deterministic reset remain unchanged.

## Exact command identity

The command contains only:

```json
{
  "expectedCaseVersion": 7,
  "operationId": "<existing operation UUID>",
  "sourceHash": "<SHA-256 of the exact current recovery aggregate>",
  "action": "check_delivery",
  "confirmed": true
}
```

The example shows the field shape, not a usable command. Case and operation IDs, current version, accepted terms, quote, creator decision and buyer acceptance are derived from and checked against canonical storage. The browser cannot supply price, buyer, merchant, workspace, invoice reference, financial evidence or authority flags.

The coordinator verifies the exact case version, operation, source hash and currently permitted action. The existing creation and sending services also receive an internal exact snapshot fence before they execute. A route precheck alone cannot protect a command whose meaning changes during awaited work.

During execution, the guard permits only the operation's own known transitions: its claim/status bookkeeping, a returned creation reference for `resume_creation`, and the sending journal's progression. All other source fields remain fixed. `record_draft` keeps the selected provider reference fixed throughout binding. A different retained draft cannot silently become the subject of the original confirmation.

The browser freezes the command and reviewed metadata before dispatch. A lost HTTP response permits deliberate retry of those same bytes. If the first request committed a transition, its old source hash is stale and the exact retry returns `409`; the client clears private state and requires an explicit reload. It does not silently replace the command with a newer action. An unchanged unresolved delivery observation can be checked again through the read-only provider path.

## Authorization and write boundaries

Recovery uses the actual managed session verifier and SQL case/workspace ownership. Its request-local principal includes the expiry of the verified signed assertion. Caller role headers or bearer values cannot substitute for a creator session, and another workspace cannot inspect or recover the operation.

The request retains its database binding and private configuration signature. Account switching, mapping changes, database replacement, feature/merchant configuration changes and aborts invalidate the request. The final source read follows asynchronous authorization; a synchronous expiry/configuration check immediately follows that read. A delayed SQL read cannot keep an expired assertion alive.

The same guard runs immediately before every injected provider request, including OAuth acquisition and a request following token refresh. It also surrounds creator-authorized persistence operations. Existing SQL transactions compare exact source snapshots atomically. Recovery wraps the adapter's delivery-journal claim and confirmation with equivalent SQL fences, preventing a late provider result from bypassing the application service's source checks.

There is one deliberate evidence-retention exception. Once this request has legitimately dispatched a create operation and validated the returned draft, it may retain that provider ID against the original operation's identity, fingerprint and row version even if the session or current offer has since changed. This is private `draft_observed` evidence for an already-performed external action. It cannot bind the invoice, send it, disclose a private success response or create payment/permission truth. Keeping the ID avoids converting a recoverable returned draft into an unknown outcome. Later binding still needs fresh authorization and valid current consent.

## Financial boundaries

Recovery preserves the separation between invoice delivery and payment. A validated provider invoice observation can record delivery and enqueue the existing reconciliation task. Even a provider status of `PAID` does not make a recovery response authoritative payment evidence. The response always carries `paymentConfirmed: false` and `permissionGranted: false`.

The financial reconciliation processor must independently obtain and validate transaction details before recording evidence and creating the permission. Canonical receipt issuance and reading remain separate. The browser recovery journey exercises this boundary and then continues through the real financial processor and receipt service using injected provider replies.

No global reconciliation runner executes from this single-case creator command. Unknown creation does not cause a second create POST; unknown delivery does not cause a second send POST. Successful recovery reuses the existing operation and invoice binding rather than allocating another one.

## Browser, HTTP and privacy

Recovery views and results use separate strict schemas. The client checks exact identities, version, action, source hash, legal state/outcome combinations and the false payment/permission authority flags before accepting an outcome. Payment links, when present in a delivery result, must match the existing Sandbox URL policy and are not treated as payment proof.

Commands use strict JSON with a 4 KiB streamed limit. Duplicate decoded keys, malformed UTF-8, unknown fields, content encodings, unsafe versions and invalid action values fail closed. Origin and Fetch Metadata checks prevent cross-origin commands. Responses are private, uncached, not indexed and carry no provider credentials, bearer secrets, buyer email or raw aggregate.

The creator's private review clears on expiry, hiding, navigation and restored history. Epoch checks discard late responses after clearing. Recovery has no timer-driven mutation, automatic provider check or background retry. Form submissions require a fresh explicit confirmation of the displayed action.

## Reproduction and evidence

```bash
pnpm invoice:recovery:verify
pnpm invoice:recovery:browser
pnpm transaction:verify
pnpm transaction:typecheck
```

The browser command accepts `RR_PLAYWRIGHT_MODULE`, `RR_CHROMIUM` and `RR_RECOVERY_ARTIFACTS`. It uses actual creator HTML and scripts, the shared transaction composition, generated RSA assertions verified by the production authorizer, all nine migrations and SQLite. Faults occur in real claim/binding batches or injected provider transport. Recovery operation rows are not manufactured to make the scenarios pass.

The dedicated suite covers all bounded recovery states, committed provider actions with lost responses, frozen browser retries, stale and foreign-workspace commands, expiry and configuration changes during OAuth, source changes during provider I/O, local-only reload, private-state clearing and financial/receipt continuity. The native suite adds malformed inputs, exact execution fences, source/configuration races and evidence retention after authority loss. Desktop and mobile layouts are inspected and mobile overflow is checked.

Final counts and source hashes are recorded in [Turn 039](../turns/039-p0-authenticated-invoice-recovery.md) and its [verification record](../evidence/turn039/verification.json).

These checks use local injected gateway and provider responses. They do not verify an actual managed login, a deployed Worker or D1, genuine Sandbox payment/refund/webhook handling, or the pinned installed-library build. TypeScript 5.8.3 source checks do not replace the pinned 5.9.3 toolchain. Release gates remain open, runtime flags remain off, and this improvement requires no account-owner task.
