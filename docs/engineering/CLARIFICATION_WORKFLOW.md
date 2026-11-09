# Persisted Clarification and Human Re-review

**Owning turn:** 037
**Status:** Implemented and locally verified; external release gates remain open.
**Date:** October 27, 2026 HST.

## Purpose and authority

An unanswered licensing question must be able to become durable buyer evidence and then an explicit creator decision. The earlier clarification planner only displayed questions. The new workflow stores the exact answers without treating them as resolved terms, and gives the creator a protected page for reviewing all twelve material rights fields.

The workflow is available only for an open case before any invoice binding, reserved payment operation, permission or receipt exists. It has no provider transport and cannot create or send an invoice, confirm a payment or issue a permission.

## Routes and configuration

| Entry point | Authority and behavior |
| --- | --- |
| `/buyer/clarification#<capability>` | Public shell, fragment erased before requests; private capability stays in memory |
| `/creator/clarification/:caseId` | Verified managed creator session and workspace ownership |
| `GET /api/clarification/buyer/review` | `clarify`-scoped Bearer capability; local reads only |
| `POST /api/clarification/buyer/answers` | Exact version, review hash, question/answer list and explicit confirmation |
| `GET /api/clarification/creator/cases/:caseId/review` | Authenticated original request, saved evidence and current human fields |
| `POST /api/clarification/creator/cases/:caseId/terms` | Exact source/version and pending submission, all twelve fields, explicit human confirmation |

`CLARIFICATION_ENABLED=false` is the checked-in default. The APIs additionally require the consent flag, a migrated database, Sandbox/judge mode, Sandbox payment configuration mode and a fixed HTTPS consent origin. No PayPal credentials or transport are needed to clarify or review terms. Creator Access must use the same application origin. `/api/creator/session` can expose the authenticated session lifetime when clarification is enabled without enabling the separate offer-review page.

Protect the creator page, `/assets/creator-clarification.js` and `/api/clarification/creator/*` at the managed gateway. Keep buyer pages and buyer APIs outside creator login. A creator session cannot replace a buyer capability. A `review` or `receipt` scope alone cannot read or submit clarification answers.

## Evidence and state transitions

The deterministic clarification planner supplies questions from the original request or current human terms. It does not invent answers or resolve missing rights. If a creator explicitly requests clarification of an otherwise complete offer, the saved reason becomes an additional-context question.

A buyer command records an immutable round, its exact questions and one answer per question. The submission metadata binds the source case revision, terms, creator follow-up, canonical question plan, capability identity, consent copy, command fingerprint and answer hash. The original request remains unchanged. The atomic write advances the case revision, supersedes the current quote and clears creator approval and buyer acceptance pointers. A pending answer round therefore cannot be accepted or invoiced through the existing consent routes.

A creator command binds the exact pending submission and all twelve chosen fields. Unsupported and conflicting fields require a note. Unresolved fields carry no invented value. The domain validator determines the resulting terms status. Complete supported terms receive an integer-cent quote using the assigned active pricing policy; the policy hash, resulting lines and calculation hash are verified. Other statuses remain unpriced.

The terms review is separate from approval. After it is saved, the creator must approve the exact offer and the buyer must accept that approved version. Earlier approval, acceptance and command replays cannot regain authority simply because the amount or rights happen to match.

### Unchanged rights after clarification

An answer can confirm that the existing rights are correct. The existing schema makes terms and quote calculation hashes unique within a case. Re-review therefore reuses verified immutable terms and an exactly recomputed matching quote when appropriate, instead of manufacturing duplicate content. It creates a new clarification review, advances the case version and clears previous consent. Fresh approval and acceptance are mandatory.

Previously reviewed answers remain visible as history. Only the current unreviewed submission is sent as the pending submission in a new creator command. An incomplete review can be followed by further clarification or another explicit human review.

## Persistence and concurrency

Migration 9 reuses `clarification_rounds`, `clarification_questions` and `clarification_answers`, adds `clarification_submissions` and `clarification_reviews`, and protects their historical content with update-rejection triggers. The domain manifest now has 33 tables. The first eight migrations are unchanged. The explicit local judge reset deletes the new metadata first; there is no application deletion endpoint.

Commands include a UUID request ID, expected case revision and exact source hash. A bounded aggregate includes consent, original request, current human observations, assigned policy, prior clarification evidence and quotes. The first statement of every write transaction inserts an audit record only if this source snapshot and the current capability still match. A failed fence aborts the whole batch. It cannot leave a round without answers, a terms revision without observations, or a quote without its lines and review record.

Durable command hashes support an exact retry after an uncertain response or lost database acknowledgement. A changed command using the same ID is rejected. An old command cannot be replayed after its result has ceased to be the current revision. Current reads perform a combined SQL source/capability check after the last awaited authorization call, with runtime configuration and expiry checks around asynchronous work.

History is bounded to 16 answer rounds and 64 human reviews, terms records and quote records. The last allowed records remain readable and replayable; limits block new insertion before it occurs. The native suite covers the 64th-record boundary.

## HTTP and browser behavior

The API rejects duplicate decoded JSON keys at every depth, unknown command fields, unsupported encodings, malformed UTF-8, excessive depth and bodies above 96 KiB. Individual answers are limited to 2,000 UTF-16 units, and the aggregate byte bound accommodates supported multibyte text. Origin and Fetch Metadata checks prevent cross-origin commands. Responses are private, uncached and excluded from indexing. Per-isolate limits remain a local defense; distributed deployment limits still need verification.

Buyer requests omit cookies and send the capability only in `Authorization`. The capability never becomes a DOM link or storage value. A deliberate navigation into offer review uses a same-origin fragment that the destination immediately removes. Creator requests use the existing managed session and cap the private view by its verified lifetime.

Both clients retain an uncertain command exactly for a deliberate retry, freeze its fields while pending, and clear private state on expiry, hiding, page exit or restored history. Late responses cannot restore cleared information. All request text, questions, answers and notes render as text. Changing a field to resolved presents an empty control until the creator explicitly chooses the supported value. Unicode, time boundaries, state combinations and result identities are independently checked in the browser.

## Receipt provenance compatibility

The established `manual-review-v1` extraction contract hashes the original request. Canonical receipt validation checks that hash for every completed extraction record. Clarification answers are separately bound by their submission, creator review and audit records.

An integration test exposed a mismatch when the new workflow initially stored a combined request/answer hash in the extraction record. Three payment-to-receipt paths failed with `source_invalid`. Restoring `sha256(originalRequest)` fixed those paths without weakening the receipt verifier or claiming that the model resolved buyer answers. The final tests run real invoice creation/sending handlers, reconciliation and receipt issuance against injected Sandbox HTTP, then verify scheduled permission, receipt integrity, privacy and a linked full-refund revision.

## Executed verification

- 1,716 native tests passed across 42 files, including 80 backend, 75 clarification UI/validation and three new financial/receipt integration tests.
- The clarification browser journey passed 57 checks across eight scenarios, starting from a submitted request with no prepared terms or quote.
- The existing transaction/receipt browser journey passed 127 checks across 19 scenarios, and its adversarial buyer collection passed 51 checks.
- Strict TypeScript 5.8.3 passed the transaction/receipt and invoice-sending scopes against actual sources. All 160 TypeScript files parsed successfully. Formatting, workspace and diff checks passed.
- Desktop and mobile screenshots were inspected. The new browser suite checks three mobile states for horizontal overflow.

Run the focused native gate under the supported Node 22 runtime:

```bash
pnpm clarification:workflow:verify
pnpm clarification:browser
pnpm transaction:typecheck
```

The browser command accepts `RR_PLAYWRIGHT_MODULE`, `RR_CHROMIUM` and `RR_CLARIFICATION_ARTIFACTS` to use an existing local Playwright/browser installation and an explicit evidence directory. It is also possible to run the scripts directly with the same strip-types and consent loader flags recorded in `package.json`.

Evidence: [verification summary](../evidence/turn037/verification.json), [native results](../evidence/turn037/native-regression.json), [clarification browser](../evidence/turn037/clarification-browser.json), [receipt integration regression](../evidence/turn037/receipt-integration-regression.json).

## Limits and next integration

The browser starts with a synthetic submitted request. Creating its link and submitting initial buyer intake are not part of this browser evidence. Requests are intercepted into native handlers, Access assertions and JWKS are generated, and provider HTTP is injected. No actual managed login, listening server, deployed Worker/D1 or genuine PayPal transaction was exercised. Native tests cover Fetch Metadata because the browser interception does not expose those headers. Expiry and hidden/history events are injected.

The full pinned installation, installed-library lint/Vitest/Vite build and Wrangler dry run remain open. TypeScript 5.8.3 source checks do not replace the pinned 5.9.3 toolchain. The learned model remains diagnostic only. No deployment, real credentials, paid service, production payment or GitHub Action was used. All runtime flags remain off.

Turn 038 now connects authenticated asset-bound link creation and private buyer intake to this workflow. Its separate browser journey begins with only a workspace, asset and pricing policy, and reaches the canonical receipt. See [authenticated request intake](AUTHENTICATED_REQUEST_INTAKE.md) for the new evidence and original-link continuation behavior. The Turn 037 results above retain their original prepared-request scope.
