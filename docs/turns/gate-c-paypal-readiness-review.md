# Gate C management-turn receipt

**Date:** October 27, 2026 HST
**Base:** 84326e396b762dc7e8d72a71d971eac7c0d54a52
**Work status:** Audit, integration harness and repairs completed locally.
**Release gate:** BLOCKED pending genuine Sandbox, deployed D1 and authenticated browser evidence.

## Completed work

- Reproduced GC-01: a status-only reconciliation could consume the generation required for the permission lifecycle.
- Repaired the server recovery entry point to select one consumer explicitly, using the same database for leases and lifecycle persistence. Missing assessed financial detail cannot fall back to status-only completion.
- Reproduced GC-02: permanent provider errors were incorrectly retried as network errors, and rate limits used the generic shorter delay.
- Preserved sanitized error classifications, blocked permanent errors and retained bounded exponential retries for transient failures.
- Added a complete-schema integration harness using all seven original migrations, real seed/reset, real recovery store and real lifecycle modules. No simplified parent schema or test recovery port is substituted.
- Added a readiness matrix, evidence limitations and the next implementation decision. No public route, feature flag, deployment or schedule was enabled.

## Executed verification

```text
Original lifecycle implementation: 9 targeted error-policy regressions failed as expected.
Repaired Gate C suite: 48 passed, 0 failed.
Gate C plus earlier fake/configuration/OAuth/draft suites: 97 passed, 0 failed.
Full migration sequence: 7 applied; 31 domain tables; second application skipped all 7.
Integrity and foreign-key checks: clean.
Original seed reset after completed financial work: passed, repeatable.
Strict standalone TypeScript 5.8.3: passed, no external-package type stubs.
Changed JavaScript syntax, formatting and no-em-dash checks: passed.
```

The integrated scenarios include UTC periods, cancellation, refund-first ordering, partial-refund review, revocation, duplicate evidence, concurrent leases, newer generations during reads, stale consent, nine rollback points, lost acknowledgements, file restart, five-attempt exhaustion and explicit recovery. The test hash-checks the seven original SQL files and seed against the audited repository blobs.

No full pnpm install/build, project-pinned TypeScript/Vitest, Hono/browser, genuine PayPal authentication/signature/transaction, or deployed D1 test is claimed. The historical delivery/intake/processing/reconciliation/lifecycle suites were not all rerun. `scripts/db-local.mjs` itself was not executed; its original migration and seed inputs were exercised by the new harness.

## Acceptance and scope

RR-P0-049 through RR-P0-052 gain integrated full-schema recovery/lifecycle evidence, not live acceptance. RR-P0-001 and Gates A/B/C remain open. Receipt issuance/public validation remain Turns 028-029. Learned automatic rights resolution remains prohibited.

Next independent implementation: **Turn 028, canonical receipt hashing and audit linkage**.

See [Gate C readiness report](../paypal/GATE_C_READINESS.md). No user handoff, paid API, real credentials, external payment, email, GitHub Actions or scheduling was used.
