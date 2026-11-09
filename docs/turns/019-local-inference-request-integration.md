# Turn 019 Receipt: Integrate local inference into request flow

- **Status:** Completed locally; full installed dependency and browser acceptance pending.
- **Priority:** P0
- **Date:** October 26, 2026 HST
- **Objective:** Creator-initiated, evidence-grounded extraction with separate, unapproved model diagnostics and lossless persistence.

## Changes delivered

1. Added one read-only deterministic observation bridge, enforcing field order, exact source offsets, null calibrated confidence, unsupported/contradictory states, and all-12-field coverage.
2. Added `CreatorExtractionService`, with case binding, concurrency guards, SHA-256 source checks, replay integrity, no quote eligibility, and optional learned diagnostics.
3. Added D1-shaped atomic persistence for extraction attempt, all observation spans, audit event, and case pointer, plus local-memory equivalent.
4. Linked automated and manual extraction attempt sequencing in the shared memory store.
5. Added a verified SHA-256 artifact and frozen margin-policy loader; model rankings cannot resolve rights even when their margin exceeds a selected threshold.
6. Added creator GET/POST extraction routes, guarded by the existing localhost-only demo role gate.
7. Added creator extraction and evidence screen, source offsets, separate read-only model hints, and navigation to human terms editor.
8. Added twenty-one native Node and SQLite tests and root `extraction:verify` command.
9. Documented safety, limitations and follow-up Turn 020.

## Evidence

```
node --no-warnings --experimental-strip-types --test scripts/observation-bridge-local.test.mjs scripts/extraction-sqlite-local.test.mjs
21 tests, 21 passed, 0 failed
node --no-warnings --experimental-strip-types --test scripts/portable-model-local.test.mjs
8 tests, 8 passed, 0 failed
```

The adapter's SQL shape ran against Node SQLite, not live D1. Installed Hono and React tests, full Vite build, Wrangler deploy dry-run and browser walkthrough remain blocked by the preexisting Turn 007 package-installation blocker. No GitHub Actions, paid AI service, real PayPal payment or autonomous human decision was introduced.

## Release posture

`quoteEligible=false`, `reviewRequired=true`, `permittedActions=[]` for every extraction response. Model-only labels have no source spans or numerical calibrated confidence. Human review remains mandatory.
