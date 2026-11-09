# Turn 038 Receipt: Authenticated request links and private buyer intake

- **Status:** Completed implementation and local verification; external release gates remain open.
- **Date:** October 27, 2026 HST.
- **Base:** `08c405209ecdbbbe421a58212e741acc043eca5f`.
- **Objective:** Connect managed creator link issuance and immutable buyer intake to canonical clarification, consent, invoicing and receipt verification.
- **Autonomy:** Complete the full improvement turn without credentials, deployment or account-owner tasks. Product creator approval and exact buyer acceptance remain mandatory and are exercised by explicit test actors.

## Scope completed

- Authenticated asset-level creator authorization before a case exists, plus signed session expiry carried to the final source/write boundary.
- A native creator request-link page and digest-only issuance API, fixed scopes and expiry, explicit copy/manual reveal, and exact recovery after uncertain responses.
- A native private buyer intake page and API with Unicode-aware validation, immutable original evidence, separate normalization and versioned acknowledgement.
- Atomic creation/submission, global command deduplication through the immutable audit primary key, source/capability fences and exact replay validation without a new migration.
- Original asset/workspace snapshot evidence, read-only submitted context and deliberate continuation into clarification or the current offer/status page.
- Original-link continuation after approval, invoicing and asset archival. Archived pre-offer requests remain readable with an explicit unavailable continuation.
- Local-memory-only boundaries for legacy path-token APIs and shells, including encoded prefixes, so they cannot bypass canonical intake in database/public runtimes.
- Shared production route composition, default-off runtime configuration, native regression commands and documentation.

## Verification executed

| Check | Final result |
| --- | --- |
| Full native regression, Node 22.18.0 | **1,916 passed**, 0 failed, 0 skipped, 45 files |
| New intake backend, included above | **90 passed** |
| New intake UI and response validation, included above | **94 passed** |
| New full transaction and real authorization boundary integration, included above | **8 passed** |
| Creator session / shared composition, included above | **96 / 25 passed** |
| New intake Chromium journey | **119 checks**, 8 scenarios |
| Existing transaction/receipt Chromium journey | **127 checks**, 19 scenarios |
| Existing clarification Chromium journey | **57 checks**, 8 scenarios |
| Existing adversarial buyer Chromium checks | **51 passed** |
| Combined browser checks | **354 passed** |
| Strict source TypeScript 5.8.3 | Transaction/receipt and invoice-sending scopes passed |
| All-source syntax / workspace | 169 TypeScript files; 13 packages, 24 internal edges, no cycles |
| Formatting / diff whitespace | Passed; exact file count in verification summary |

The new browser fixture starts with only one workspace, asset and policy. Its actual UI actions create the case, capability and original request, save clarification answers, record human terms and calculate the $425 policy quote. Separate approval and acceptance precede invoice creation and sending. Production financial and receipt services process injected provider detail into scheduled permission, a canonical receipt, protected JSON export and minimized public verification. The original link is reopened at the offer, sent invoice and archived receipt stages.

The two full native journeys additionally produce a linked full-refund receipt revision. One deliberately loses the database acknowledgement for both link issuance and original-request submission. Six more tests use real signed gateway assertions and interrupt the final SQL read with session expiry or mapping revocation. Review, issuance and replay return authorization denial without new rows or private output.

The final full native run was executed after the fixes below. The intake browser collection was refreshed after the final authorization change. The existing three browser regression collections passed after the shared fixture and composition changes; later fixes were confined to intake and its legacy boundary. Evidence: [verification summary](../evidence/turn038/verification.json), [native results](../evidence/turn038/native-regression.json), [intake browser](../evidence/turn038/intake-browser.json), [transaction browser](../evidence/turn038/transaction-browser.json), [clarification browser](../evidence/turn038/clarification-browser.json), [adversarial buyer](../evidence/turn038/buyer-validation-browser.json).

## Defects found and corrected before completion

1. **Original link stopped after financial progression.** Read-only submitted intake now leads to the existing current-offer/status route while keeping all intake mutations locked. Stored asset evidence permits later archival without losing the recorded request.
2. **Archived pre-offer request led to a blocked clarification page.** The API now returns an explicit unavailable continuation, and the UI disables navigation while retaining original evidence.
3. **Encoded legacy paths could evade the initial boundary.** Native matching normalizes encoded ASCII. Once Hono matches the legacy route family, its middleware enforces the runtime gate without relying on a second raw-path comparison.
4. **Creator JWT could expire during the final SQL wait.** A verified, operation-local expiry is checked synchronously after the final SQL source check and immediately before return/write. Mapping/configuration changes and aborts remain synchronously fenced. No additional asynchronous authorization is placed after the source check.
5. **Event time could drift during asynchronous hashing.** Immutable request/audit timestamps now use the same event time while the capability fence uses a fresh time. An advancing-clock regression verifies the result.
6. **Some names passed the old domain parser but failed the canonical reader.** Canonical intake rejects those unsupported controls before persistence, preventing a committed request followed by an unreadable success response.

The receipt provenance contract remains unchanged: manual review hashes the original request, while saved answers have separate evidence bindings. The new asset-only journey passes the existing receipt validator without directly inserting financial truth.

## Reproduction and limits

```bash
pnpm request:intake:verify
pnpm request:intake:browser
pnpm transaction:verify
pnpm transaction:typecheck
```

The browser command accepts `RR_PLAYWRIGHT_MODULE`, `RR_CHROMIUM` and `RR_INTAKE_ARTIFACTS`. Local execution used Node 22.18.0 and Chromium 140.0.7339.16. Desktop and mobile screenshots were inspected; mobile overflow checks passed.

All nine production migrations run against SQLite with D1-shaped atomic batches. Browser HTTPS, managed gateway/JWKS and PayPal HTTP are injected. No listening/deployed Worker, deployed D1, actual managed login or genuine PayPal payment/refund/webhook was exercised. Native tests cover Fetch Metadata; browser time and lifecycle events are injected. No payment evidence or permission row is manufactured in the complete journeys.

Pinned clean installation, installed-library lint/typecheck/Vitest/Vite build and Wrangler dry run remain unverified. TypeScript 5.8.3 source checks do not replace the pinned 5.9.3 toolchain. The learned model remains diagnostic only, and signed assertion verification is not live provider-revocation introspection.

No migration, dependency, real credential, customer message, payment, paid service, deployment, external schedule or GitHub Action was added. All runtime flags remain off. Receipt hashes remain unsigned integrity checks rather than ownership guarantees.

## Commit and next turn

Source, evidence and records are committed together as `feat: connect authenticated request intake to canonical licensing (turn 038)`. The final commit identifier is in repository history and the work handoff rather than embedded in its own future content.

**Next independent P0, Turn 039:** Implement authenticated recovery for uncertain invoice outcomes using the existing journals and injected provider evidence. Expose the recorded operation state and support deliberate, evidence-based reconciliation or safe retry without duplicate creation or sending. Complete it locally without waiting on credentials, deployment or account-owner tasks. Genuine external acceptance and the pinned build remain separate release gates; optional dashboard and sponsor work remains deferred.
