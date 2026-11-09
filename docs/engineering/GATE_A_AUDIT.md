# Gate A: Mock Vertical Slice Readiness Audit

**Review date:** October 26, 2026 HST
**Verdict:** Local defects repaired and regressions passed. Gate A exit BLOCKED by missing installed dependencies and browser acceptance.
**Scope:** P0 simulated demonstration only. No paid AI API, GitHub Actions, production payments, or secrets.

## Workflow review

| Step | Authority | Local verification |
| --- | --- | --- |
| Creator asset and request link | Creator plus buyer capability | Turn 010 SQLite and service tests |
| Buyer intended-use submission | Buyer | Original text and consent version preserved, Turn 010 |
| Twelve-field terms review | Creator | Immutable manual versions with human provenance, Turn 011 |
| Policy and quote | Deterministic code | $425 regression and policy hash, Turn 012 |
| Creator approval/rejection | Creator | Exact quote and terms binding, Turn 013 |
| Buyer acceptance | Capability-scoped buyer | Exact approval and current version required, Turn 013 |
| Fake paid event | Local simulator | Requires both people, never claims PayPal, Turn 013 |
| Simulated verification | Local verifier | Canonical SHA plus source-record agreement, Gate A |

The full application has not been executed end to end in a browser. The existing Hono integration test is not passing evidence while npm dependencies cannot be installed.

## Fixed findings

### GA-01: Forgeable creator header on public origins

The prior `x-rightsreceipt-demo-role: creator` header was not a real authorization mechanism. It now works only if all conditions hold: approved HTTP loopback or reserved fixture host, local mode, no D1 binding, and exact header value. Public hosts, sandbox mode, and judge mode reject it. Simulated payment and public fake verification API routes also reject public origins.

This is a local-development safeguard, **not secure creator authentication**. A client on the developer machine can still supply the header. Exposing local development over a public tunnel or proxy remains unsafe. Real signed creator sessions are mandatory before public deployment.

### GA-02: Cross-role navigation and capability URL leakage

The buyer simulation no longer includes a link directly to creator controls. The root HTML declares `Referrer-Policy: no-referrer` to reduce accidental transmission of bearer-capability paths. Browser HTTP-header and navigation checks are still pending.

### GA-03: Mutable records and forged receipt consistency

Memory-store reads now return deep isolated copies. Verification requires canonical JSON, valid date intervals, a matching SHA-256 hash, explicit fake/simulated markers, and agreement with the current deterministic quote, stored creator decision, buyer acceptance, and fake payment reference. Recomputing the checksum after changing an amount or payment reference no longer makes the record verify.

This is not a signature or malicious-administrator protection. A hash is not evidence of creator identity or copyright ownership.

### GA-04: Stale browser data

React mock loaders now clear previous transaction data and errors at refresh. A failed reload cannot silently retain prior action controls; receipt verification clears an old result before checking a different identifier. Actual browser execution is required to close this UI finding.

## Commands and results

```bash
node --no-warnings --experimental-strip-types --test scripts/gate-a-local.test.mjs
node --no-warnings --experimental-strip-types --test scripts/mock-transaction-local.test.mjs
```

The source workspace ran **32 tests, 32 passed, 0 failed**, comprising seven Gate A access/role tests and 25 simulated service/integrity tests. The expanded tests cover tampering even when a new SHA-256 is computed, malformed dates, isolated store copies, mode and origin restrictions, and no-referrer markup. They use Node built-ins and no external API.

## Open release blockers

| Issue | Severity | Exit owner |
| --- | --- | --- |
| npm registry DNS and no pnpm lockfile | Release blocker | Turn 007 |
| Hono full-chain test not executed | Gate A blocker | Turn 013 / Gate A |
| Browser walkthrough, keyboard and responsive checks absent | Gate A blocker | Gate A / Turn 033 |
| Secure creator sessions absent | Public deployment blocker | Authentication/security turn |
| Live D1 and migrations not exercised | Deployment blocker | D1 handoff |
| PayPal Sandbox and verified webhooks absent | Submission blocker | PayPal integration turns |
| Learned model inference absent | Submission blocker | Local AI turns |

## Decision

**DO NOT MARK GATE A PASSED.** The core local services and boundary checks are improved, but the defined acceptance criterion requires the browser product story to work without narration. Node-only evidence is not equivalent.

Independent Phase C Turn 014 can proceed without claiming a release. Reopen Gate A as soon as the dependency installation and browser environment become available.
