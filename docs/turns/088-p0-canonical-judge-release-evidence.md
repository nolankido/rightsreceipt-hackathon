# Turn 088: canonical judge-report validation at the release boundary

**Date:** November 4, 2026  
**Priority:** P0, fail-closed release and submission evidence  
**Baseline:** private `main` after Turn 087

## Defect reproduced

The prior `releaseJudgeEvidenceValid` used `judgeConsoleEvidenceValid` as its semantic gate. That contract is deliberately a **minimum browser-console indicator**. It required three named scenarios and at least one step per scenario but did not require the true ordered 17/20/17 trace, exact provider-state transitions, all 33 named database tables, consistent durable rows, or a recomputed repeatability digest.

The Turn 086/087 positive regression fixture itself used invented `table0` through `table32` names, a single `{id: 'complete'}` step per scenario and a placeholder repeatability hash. The old release verifier accepted this fixture as a passing run. This is a concrete local-evidence false positive. It is **not** evidence of actual malicious use or a failed payment.

## Implementation

1. `scripts/support/release-judge-evidence.mjs` now passes the decoded evidence through the already-existing `projectJudgeRehearsalReport` from `judge-rehearsal-report.mjs`. The canonical projection validates the fixed schema, exact ordered steps, expected outcome and provider counters, permission and receipt sequencing, 33 table counts and resets, and independently recomputed ordinary/repeat result hash.
2. The release gate additionally requires `evidence.json` bytes to equal `serializeJudgeRehearsalReport(projected)`, the exact pretty JSON format produced by the genuine local rehearsal. Unknown keys, shortened traces and noncanonical records fail closed. Existing commit, Node, clean-source, evidence-directory, filename and honest PayPal-simulation checks remain.
3. Added `scripts/support/release-judge-fixture.mjs`, generating a **complete but explicitly synthetic** 17/20/17-step fixture using the actual canonical report catalog rather than the misleading abbreviated fixture.
4. Updated the standalone evidence tests and the isolated submission-candidate CLI test to use this canonical synthetic fixture. Added rejection cases for incomplete or reordered traces, forged row counts, invented baseline names, unexpected fields, premature permission attribution, mismatch in repeat hash and noncanonical JSON bytes. Added a direct regression demonstrating the older minimal console contract accepts an abbreviated record while the stricter release boundary rejects it.
5. Updated the release preflight test fixture to copy the canonical report module imported by the release gate.

## What was actually verified

- Re-ran the **existing pre-change** focused Node 22.16.0 test suite before the modifications: 13 passed, 0 failed.
- After the code change, parsed the five edited/added JavaScript modules and tests from the private GitHub branch with a static JS syntax check.
- Executed the **actual canonical projection and actual release validator logic** in an isolated V8 source replay with filesystem and hash primitives substituted only for that replay. The generated complete fixture had three journeys with 17, 20, and 17 steps and 33 named table counters. A valid canonical record passed, while abbreviated traces, fabricated table counters, premature permission attribution, an incorrect source commit, and unknown fields were rejected. This confirms the structural behavior but **does not execute Node's actual crypto or filesystem modules**.
- The new full Node 22 regression suite, pinned `pnpm release:verify` and all provider/Devpost steps remain **unexecuted**. Do not record a green clean-source release based on this turn alone.

## Follow-up verification

In a complete clean checkout of the final committed `main` using Node 22.13+ (<23) and pnpm 12.8.2:

```bash
pnpm submission:candidate:verify
pnpm release:preflight:verify
pnpm release:verify
```

The full release must record `judgeEvidence: { root: 'judge' }` only after the canonical semantics pass. Preserve the private `.data/release-candidate/run-*/` logs and report; stop and repair any P0 failure.

Proceed next to genuine PayPal Sandbox transaction and same-invoice signature-verified webhook evidence, safe one-commit public repository, publicly visible functioning video under three minutes, and Devpost submission. The internal deadline remains **November 9 at 3 p.m. Eastern**, before the November 12 official cutoff.

**Truth boundary:** Canonical local simulation is still not real PayPal settlement, ownership verification, production Cloudflare behavior, or a submitted hackathon entry. No live payments, deployment, paid API calls or repository visibility change occurred in this turn.
