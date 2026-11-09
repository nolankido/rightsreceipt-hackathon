# Turn 081: Require semantic evidence before the local judge console announces success

## Failure reproduced

Turn 080 prevented malformed report/JSON files and mixed execution directories from being displayed as success. However, it still accepted a top-level `status: passed` with exactly three `scenarios` and three `resets`, regardless of their contents. A run where a licensing journey had failed, an old receipt remained accessible, the original database seed was not restored, or the offline worker attempted network access could still render `Local rehearsal passed`.

On exact Turn 080 source from private main `2d2c3c791f11fc1acafc903183d19a79b6e8116d`, the existing **17 console HTTP tests passed**. I added six targeted negative HTTP test cases for failed journeys, incomplete revocation, nonzero external requests, wrong seed reset counts, incorrect quote or receipt integrity, and incorrect scenario order/create/send counts. **All six failed on the unchanged source**, reproducing the defect.

## Implemented correction

- Added `scripts/support/judge-console-evidence.mjs`, a minimum semantic validator of the simulated canonical judge output. A top-level passed flag is insufficient.
- It requires the three ordered `ordinary`, `recovery`, `repeat` journeys to individually pass with steps, deterministic USD 425.00 quote, scheduled permission, verified receipt integrity, revision 1, correct SQLite integrity/foreign keys, exactly one provider create/send per journey, and at least one provider read.
- Requires source fingerprint and 9-migration/33-table baseline markers, in-memory database, zero external network requests, no credentials used, repeatability hash, and all three reset flags including denial of previous capability, receipt and creator access. Reset row counts must match the baseline.
- The existing `scripts/judge-local-console.mjs` now requires the semantic check **before** it displays passing status or exposes accepted artifacts. The smoke validator in `scripts/judge-console-real-smoke.mjs` uses the same rule, preventing drift between browser and smoke verdicts.
- Added the synthetic `judge-console-evidence-fixture.mjs` solely for tests, 10 focused semantic-unit tests, six new console HTTP regressions and two smoke regressions. Updated the existing console and smoke fixtures to include enough correctly structured simulated evidence.
- Registered the new semantic-unit test in `judge:console:verify`, which remains required by `judge:verify` and `release:verify`. No new runtime dependency or external service.
- Added validation receipt and updated README, project status and judge instructions.

## Executed verification

Node **22.16.0** using a private, exact-source module subset reconstructed from GitHub, with actual localhost HTTP server and controlled injected rehearsal artifacts:

- Before correction: 17 existing console tests passed, **6 new HTTP regression tests failed**.
- After correction: **23 console HTTP tests passed, 9 page-renderer tests passed, 10 smoke-validator tests passed, 10 semantic-validator tests passed. Total 52 passed, 0 failed.**
- Repeated the full 52-test suite **three additional times**, all passed.
- Git blob SHA-1 identities of all seven source/test files match the exact locally executed bytes. See `docs/evidence/turn081/validation.json`.

The **default canonical licensing worker** was not executed in this focused module suite, and the full pinned `pnpm release:verify` has not run from a complete private checkout. The validator is a minimum consistency contract, not an independent check of PayPal provider origin, transaction settlement, cryptographic signatures or the report's entire semantic projection.

## Remaining submission gates

Genuine PayPal Sandbox create/send/buyer payment/authenticated paid GET/signature-verified webhook, exact full clean Node 22 release verification including the real-worker smoke, sanitized public one-commit repository, under-three-minute public functional YouTube demo and Devpost submission remain open. Cloudflare judge hosting is optional under contest rules. No paid API, external deployment, GitHub Actions, production payment or live PayPal request occurred in this turn.
