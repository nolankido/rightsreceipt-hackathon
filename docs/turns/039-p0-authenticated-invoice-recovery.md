# Turn 039 Receipt: Authenticated Invoice Recovery

- **Status:** Completed and locally verified.
- **Date:** October 27, 2026 HST.
- **Objective:** Expose and safely continue existing uncertain invoice operations through the authenticated creator journey, without duplicate provider writes or an account-owner dependency.
- **Scope completed:** Recovery contracts, native API/composition, request-bound creator expiry, canonical execution fences, guarded persistence, explicit browser controls, adversarial native and browser verification, project records and next-unit selection.
- **Schema/dependencies:** No new migration, table, package or dependency. All external runtime flags remain off.
- **Release status:** NOT READY; external and pinned-toolchain gates remain open.

## Shipped behavior

The creator offer page distinguishes four actionable states: an undispatched draft reservation, a retained provider draft awaiting local binding, an undispatched send reservation, and uncertain invoice delivery. Each action uses its own unchecked confirmation and freezes the exact operation, case version, source hash and action before dispatch.

An undispatched reservation can perform its first provider write. A retained draft binds locally without HTTP. An unknown send can retrieve the same invoice and record validated delivery without sending again. An unknown create without a retained ID remains paused. Completed delivery has no recovery action, including after payment reconciliation and receipt issuance.

The recovery routes are `GET /api/invoices/creator/cases/:caseId/recovery` and `POST /api/invoices/creator/cases/:caseId/recover`, behind the new default-off `INVOICE_RECOVERY_ENABLED` flag and existing creator/Sandbox gates. The shared composition dispatches them before ordinary invoice controls. Their contracts are separate; normal invoice controls continue to work with recovery disabled.

Opening or reloading reads local metadata only. A lost successful response leaves the exact original command frozen in the browser. Replaying it after its source changes returns stale `409`, clears private data and requires an explicit reload. It cannot allocate a new operation, change the requested action or increment reconciliation work again.

## Authority and failure boundaries

The actual managed-session verifier supplies the signed JWT expiry, and SQL supplies case/workspace ownership. Final source reads follow asynchronous authorization and end with synchronous expiry/configuration checks. Provider requests, including OAuth refresh retries, recheck the source and authority immediately before dispatch. Binding, sending and journal writes use atomic snapshot fences.

A valid returned draft ID may be retained privately for the original already-dispatched operation after session, configuration or source loss. Its original operation identity, fingerprint and row version fence that evidence write. Binding, sending and private response disclosure still fail until fresh authorization and valid current consent exist. No financial authority comes from evidence retention.

Recovery never confirms payment, activates permission or issues a receipt. Delivery recovery can enqueue the normal reconciliation job. A provider `PAID` status is insufficient until the financial processor verifies transaction evidence; the dedicated browser journey proves this distinction before continuing through canonical receipt issuance.

## Review corrections

1. **A source guard must run inside execution.** Creation and sending receive exact internal snapshot fences; validating only at the route would allow changes during awaited work.
2. **The adapter journal needs the same protection.** Recovery wraps its claim and confirmation with request guards and atomic aggregate comparisons, including the path after provider I/O.
3. **The confirmed draft identity cannot drift.** `record_draft` preserves its retained reference. `resume_creation` tracks the reference observed by its own dispatch and accepts only exact operation-version transitions.
4. **Canonical retries must not swallow an authorization failure.** Recovery latches guard failures and rejects final responses whose confirmed invoice identity changed.
5. **Returned evidence should not be discarded on expiry.** A narrowly scoped private retention path preserves the validated draft ID while blocking binding and disclosure.
6. **Action values must be strings.** Strict parsing rejects arrays and objects before an action can be considered.

## Files changed

The implementation adds the recovery API, application contract/coordinator, persistence wrapper and browser contract validator. It extends the existing creator page/client, session authorizer, transaction composition and canonical creation/sending execution boundaries. It adds focused native/backend/UI tests and a dedicated browser harness, registers verification commands, and updates default-off configuration and project documentation.

The complete file list and exact source hashes are in [verification.json](../evidence/turn039/verification.json). The [engineering record](../engineering/AUTHENTICATED_INVOICE_RECOVERY.md) describes routes, commands, operation transitions, evidence retention and limits.

## Verification results

| Collection | Result |
| --- | --- |
| Current native tests across 47 files | **2,073 passed**, zero failed/skipped |
| New recovery backend | **68 passed**, included in native total |
| New recovery UI/response validation | **81 passed**, included in native total |
| Creator session / transaction composition | **101 / 28 passed**, included in native total |
| Recovery browser | **88 checks**, 12 scenarios |
| Existing transaction browser | **127 checks**, 19 scenarios |
| Existing intake browser | **119 checks**, 8 scenarios |
| Existing clarification browser | **57 checks**, 8 scenarios |
| Existing adversarial buyer browser | **51 checks** |
| Combined browser | **442 passed** |
| Strict source TypeScript 5.8.3 | Transaction/receipt and sending scopes passed |
| All-source syntax | **174 TypeScript files**, no syntax errors |
| Workspace and whitespace | Passed, 13 packages, 24 internal edges, no cycles |
| Formatting | Passed; checked file count in verification record |

The initial full native collection passed 2,066 tests. The backend then added seven final guard cases and passed the extended 68-test collection. The native evidence record replaces that one file's earlier result, for the 2,073 final current tests above. No production behavior changed during that extension. The dedicated browser suite was rerun after production guards were stable.

The recovery suite uses real operation creation and deliberately interrupts actual transactional claims/bindings or injected provider responses. It verifies all bounded states, no automatic mutations, no duplicate POST after uncertainty, valid retained-ID binding, stale/workspace denials, OAuth expiry/configuration/source fences, exact browser retries and late response clearing. It reaches payment reconciliation and receipt verification without inserting payment evidence, permissions or receipts directly. Completed paid metadata remains readable with recovery hidden.

Three desktop/mobile recovery screenshots were inspected. Long references wrap within the mobile layout and the overflow check passes. Browser engine: Chromium 140.0.7339.16; runtime: Node 22.18.0. Chromium initially could not launch under the restricted sandbox; approved local browser execution completed the unchanged suites.

## Reproduction

```bash
pnpm invoice:recovery:verify
pnpm invoice:recovery:browser
pnpm transaction:verify
pnpm transaction:typecheck
```

Local verification invoked the native scripts directly using Node 22.18.0, experimental type stripping and the existing consent test loader. All `scripts/*.test.mjs` files ran through the bounded parallel native runner. Browser commands used the available Playwright module and Chromium through `RR_PLAYWRIGHT_MODULE` and `RR_CHROMIUM`; recovery output uses `RR_RECOVERY_ARTIFACTS`.

The strict source checks used genuine available TypeScript 5.8.3 and the checked-in transaction and invoice-sending configurations. All-source syntax, workspace rules, formatting and `git diff --check` passed. These checks do not stand in for the unavailable pinned clean installation or installed-library build/lint/Vitest/Wrangler gates.

## Limits and external gates

No account-owner task, real credential, customer message, genuine payment, paid service, deployment, GitHub Action or external schedule was needed. Gateway/JWKS and PayPal HTTP were injected locally. The tests execute actual application services and all nine migrations against SQLite; they do not verify a deployed Worker, Cloudflare D1, actual managed login or genuine Sandbox payment/refund/webhook exchange. Time and browser lifecycle transitions are injected, and native route tests cover Fetch Metadata.

Unknown creation without a trusted returned invoice ID remains unresolved rather than automatically creating another invoice. This turn provides no provider-account discovery or manual invoice-ID adoption. Per-isolate throttling is not a distributed deployment guarantee. Signed assertions do not provide independent live provider-revocation introspection. Receipt hashes remain unsigned integrity checks, and the learned model remains diagnostic only.

## Commit and next turn

Source, tests, evidence and records are committed together as `feat: recover uncertain invoice outcomes safely (turn 039)`. The final commit identifier is recorded in repository history and the handoff rather than embedded in its own content.

**Next independent P0, Turn 040:** Build a repeatable local judge rehearsal and controlled reset around the canonical asset-to-receipt flow and one interrupted invoice recovery. Generate a concise trace from actual handlers, keep injected sessions/provider behavior visibly labeled and isolated, and require no manual setup, credentials or deployment. Genuine external acceptance and the pinned build remain release gates; optional dashboard and sponsor work stays deferred.
