# Gate B: AI readiness and authority audit

**Date:** October 26, 2026 HST
**Decision:** **BLOCKED for release.** Read-only source-grounded assistance is locally testable, but learned auto-resolution and deployment are not approved.

## Demonstrated capabilities

The deterministic extractor identifies explicitly stated rights and retains original UTF-16 source spans. The clarification planner asks neutral, static questions about unresolved or contradictory material terms, and reports unsupported requests separately. Creator-confirmed immutable terms, not AI predictions, are the only inputs accepted by deterministic pricing. Strings from buyers are observations, never instructions. Matching a source substring establishes provenance, not semantic entailment.

The frozen 960/240/240 dataset is project-authored and linguistically repetitive. High synthetic scores do not establish real-world precision, safe handling of novel language, or legal validity.

## GB-01: Material creator-editor defect fixed

Previously, switching any material field to "Supported value" silently populated demonstration licensing values. Those included both US and Canada, November 1, 2026, 90 days, and 500,000 impressions, along with other permissions. A user could inadvertently save invented rights while apparently supplying human consent.

Newly resolved fields now start blank or unchecked. Every dropdown has an explicit disabled "Choose and confirm" placeholder; dates and numbers start empty. Missing selections generate errors before submission. Stored fields display only their actual saved values. The server-side Zod and domain validators retain responsibility for allowed ranges and supported scope. Client-side checks are not authorization.

The new pure helper and regression tests exercise all twelve fields and ensure unsupported and unresolved values are not converted automatically. A full browser test is still required.

## Readiness matrix

| Boundary | Evidence | Decision |
| --- | --- | --- |
| Source-grounded extraction | Verbatim evidence and abstention tested | Local review-only |
| Clarification | 42 prior tests, 13 new Gate B tests | Read-only questions |
| Human editor GB-01 | Six new explicit-choice tests | Fixed in source; browser pending |
| Learned model identity | Pinned SHA-256 and portable-runtime tests | Read-only diagnostics |
| Model calibration | Raw score margins are not probabilities | Automatic resolution BLOCKED |
| Held-out safety | Three contradictory fields were wrongly resolved above selected thresholds | BLOCKED |
| Evidence persistence | Native SQLite adapter checks, not live D1 | Deployment unverified |
| Buyer clarification | Questions shown, answers not yet submitted or stored | Incomplete |
| Web acceptance | Clean install, Hono, Vite, browser, Wrangler not executed | BLOCKED |
| Payment | No authenticated PayPal evidence or verified webhook | Not implemented |

## Latency and failure smoke

The dependency-free script `scripts/gate-b-latency.mjs` verified the pinned model hash and performed 100 measured warm runs plus 10 warmups for each of six synthetic request types. It checked read-only authority on every iteration. Selected p95 times on Node 22.16.0, Linux:

| Case | Deterministic | Clarification | Model diagnostic |
| --- | ---: | ---: | ---: |
| Complete 384-character input | 0.2134 ms | 0.0635 ms | 0.1541 ms |
| Contradictory 413-character input | 0.2491 ms | 0.0612 ms | 0.1453 ms |
| 4,000-character maximum input | 0.4228 ms | 0.1075 ms | 0.4926 ms |

These are local warmed-run smoke results, **not** production latency promises. They exclude network, D1, module startup, download, browser rendering, mobile devices and live Worker load. Do not set release SLAs from this measurement.

Run `node --no-warnings --experimental-strip-types --test scripts/gate-b-readiness.test.mjs scripts/review-draft-local.test.mjs` for new regressions, and `node --no-warnings --experimental-strip-types scripts/gate-b-latency.mjs` for a fresh smoke result.

**Observed verification:** 19 new tests passed, 42 existing clarification/adversarial tests passed, eight existing portable-model tests passed, and strict stand-alone TypeScript checks passed. No full pnpm or browser verification was performed.

## Open blockers and next actions

1. Retain the learned auto-resolution ban. Rework contradiction and semantic-evidence handling and evaluate on independent human-annotated natural requests.
2. Close Turn 007 dependency installation, then run Hono integration and full React browser/keyboard/mobile tests, including GB-01.
3. Implement safely versioned buyer clarification answers and durable provenance before claiming a complete round trip.
4. Secure creator sessions and exercise live D1 before any public deployment.
5. Gate B remains **BLOCKED**. The independent Turn 021 adapter-contract work can proceed without pretending PayPal is integrated or real payments occurred.

No paid API, real invoice, production credential, GitHub Action or external transaction was used.
