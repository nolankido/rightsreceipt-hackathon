# Turn 037 Receipt: Persisted clarification and versioned human re-review

- **Status:** Completed implementation and local verification; external release gates remain open.
- **Date:** October 27, 2026 HST.
- **Base:** `49113d46a6c3c8d75e851a19dda8f85900aa4b8b`.
- **Objective:** Persist buyer clarification answers as versioned evidence and connect explicit creator re-review to deterministic pricing and renewed exact consent.
- **Scope decision:** Close the next unblocked P0 integration gap. Original dashboards, full UX/security audits and external release gates remain incomplete.

## Scope completed

- Immutable buyer answer rounds, question/answer records, exact source metadata and audit fingerprints.
- Separate clarify-scoped buyer API and managed-session creator API with strict nested command parsing, trusted origins and bounded input.
- Exact version/source checks, atomic rollback, durable retries, final read authorization/source checks and default-off runtime configuration.
- Native buyer and creator pages, text-only evidence, explicit all-twelve-field human editing, private state clearing and current-offer navigation.
- New complete human terms produce deterministic quotes; incomplete, unsupported or conflicting terms stay blocked.
- New answers and reviews invalidate earlier offer/consent pointers. Approval and exact buyer acceptance remain separate.
- Creator follow-up questions work for already-complete terms. Confirming unchanged rights records new review evidence while reusing verified immutable content and requiring fresh consent.
- Migration 9, 33-table manifest, clarification-aware deterministic reset and updated schema regression expectations. The first eight migrations and dependency versions are unchanged.
- Receipt-compatible manual-review provenance, with new payment/receipt/refund integration regressions.

## Files changed

Runtime: new clarification API/page composition, browser clients, application contract/workflow and D1 persistence; narrow navigation and creator-session integration in the existing buyer/creator transaction paths.

Persistence/configuration: `migrations/0009_clarification_evidence.sql`, schema manifest and its test, `scripts/db-local.mjs`, `seed/demo-reset.sql`, `.dev.vars.example`, `wrangler.jsonc` and `package.json`.

Verification: new backend, UI/validation, transaction/receipt and browser clarification scripts; shared fixtures can start without terms or a quote; existing migration/count and composition assertions were updated.

Records: `README.md`, `PROJECT_STATUS.md`, `DEVELOPMENT_PLAN.md`, the engineering index, `CLARIFICATION_WORKFLOW.md`, persistence/consent follow-up notes, this receipt and JSON evidence under `docs/evidence/turn037/`.

## Executed verification

| Check | Final result |
| --- | --- |
| Native regression aggregate, Node 22.18.0 | **1,716 passed**, 0 failed, 0 skipped, 42 files |
| New backend, included above | **80 passed** |
| New clarification UI/validation, included above | **75 passed** |
| New clarification through payment/receipt/refund, included above | **3 passed** |
| New clarification Chromium journey | **57 checks**, 8 scenarios |
| Existing transaction/receipt Chromium journey | **127 checks**, 19 scenarios |
| Existing adversarial buyer Chromium checks | **51 passed** |
| Strict source TypeScript 5.8.3 | Transaction/receipt and invoice-sending scopes passed |
| Syntax / formatting / workspace | 160 TypeScript files; 290 formatted files; 13 packages and 24 edges, no cycles |

The full 41-file run passed 1,713 tests. A later three-case integration regression caught receipt rejection from the new manual-review input hash. After correcting the hash to the established original-request contract, the 80-test backend collection was rerun and all three added integration tests passed. Those final results form the 42-file aggregate. The clarification browser collection was rerun after the fix. See [native execution notes](../evidence/turn037/native-regression.json) and [receipt regression witness](../evidence/turn037/receipt-integration-regression.json).

The new browser journey begins with zero terms or quotes. Actual native routes persist the answers, save explicit human terms, calculate the $425 quote, record creator approval and require the buyer to accept the exact approved offer. Additional scenarios cover uncertain responses, stale revisions, old acceptance, scopes, workspace ownership, inert markup, expiry and hidden-page clearing. Six clarification desktop/mobile screenshots and ten existing transaction/receipt screenshots were produced and inspected; no screenshot claims a live provider session.

Focused reproduction commands:

```bash
pnpm clarification:workflow:verify
pnpm clarification:browser
pnpm transaction:verify
pnpm transaction:browser
pnpm buyer:review:browser
pnpm transaction:typecheck
```

The direct native scripts use Node 22 with `--no-warnings --experimental-strip-types --experimental-loader ./scripts/consent-ts-test-loader.mjs`. Browser checks additionally use an existing Playwright/Chromium installation. The complete evidence is linked from [verification summary](../evidence/turn037/verification.json).

## Risks and limitations

- Initial request-link creation and buyer intake are not exercised by the new browser journey; its request is synthetic setup.
- Browser HTTPS is intercepted into native handlers. Generated Access assertions and injected provider HTTP do not demonstrate a live gateway, deployed Worker/D1 or genuine PayPal payment/refund/webhook.
- Financial regressions use production handlers, reconciliation and receipt issuance with synthetic provider detail. They do not insert payment evidence or permission rows directly.
- Browser Fetch Metadata is unavailable through this interception; native tests cover it. Expiry and lifecycle events are injected.
- Pinned clean installation, installed-library lint/typecheck/Vitest/Vite and Wrangler dry run remain unverified. Available strict TypeScript 5.8.3 is not the pinned 5.9.3 toolchain.
- No deployment, real credential, paid service, production payment, external schedule or GitHub Action was used. All runtime flags remain off. Receipt hashes remain unsigned integrity checks.

## Commit and next turn

Source, evidence and records are committed together as `feat: persist clarification and versioned human re-review (turn 037)`. The final commit identifier is in repository history and the work handoff rather than embedded in its own future content.

**Next independent P0, Turn 038:** Connect authenticated request-link creation and private buyer intake to canonical clarification. Reuse the existing seeded asset and repositories, preserve the immutable original request and scoped capability model, and keep private codes out of URL paths/query strings. Unknown provider-outcome recovery, the pinned build, genuine managed-session/PayPal acceptance and deployed D1 remain parallel release work. Optional dashboard and sponsor work remains deferred.
