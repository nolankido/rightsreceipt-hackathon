# Turn 104: Repair clean-checkout release preflight test fixtures

**Date:** November 4, 2026
**Priority:** P0, unblock release regression verification
**Status:** Completed for targeted tests; full Node 22 release execution remains open
**Baseline:** Private main at `0d55ea93fc8e94d3f89fbe8f073fedbfa20104cd` (Turn 103)

## Verified problem

The release preflight test's `fixture()` function copied three current support modules into its synthetic checkout:

- `scripts/support/release-judge-evidence.mjs`
- `scripts/support/judge-console-evidence.mjs`
- `scripts/support/judge-rehearsal-report.mjs`

However, its `git add` step staged only the top-level scripts and package files. The entire `scripts/support/` directory remained **untracked**. Six release-preflight tests that correctly require a clean checkout failed their preparatory `git status --porcelain=v1` assertion with `?? scripts/support/` before evaluating the intended missing-lockfile, dotenv or hidden-source behavior.

This was a genuine test-fixture defect in the committed suite, independent of any genuine PayPal transaction. It could block `pnpm release:preflight:verify` and the broader `pnpm release:verify` even when production code was correct.

## Fix

The fixture now stages `scripts/support` in the synthetic repository along with the other runtime files and asserts immediately after committing that `git status --porcelain=v1` is empty. This makes fixture cleanliness an explicit test invariant and prevents unrelated untracked helper drift from masking the failure codes under test.

No production payment, licensing, receipt or publication behavior changed.

## Verification

- **Before fix:** six of the release-preflight tests failed because support files were untracked. The submission and judge-evidence tests continued to pass.
- **After fix:** targeted release, source-identity, submission-candidate and judge-evidence suites: **50 passed, 0 failed**.
- **Combined regression:** all nine public-audit, public-export, release-preflight, tracked-source, submission and judge-evidence test files: **125 passed, 0 failed, 0 skipped**. Total duration approximately 8.4 seconds on **Node v24.22.1**.
- Tested exact fetched source files and the modified test file in a focused local source reconstruction with synthetic Git repositories. No PayPal credentials, network payment operations, or GitHub Actions were used.

The combined 125-test result is intentionally a **targeted regression result**, not a full `pnpm verify` or exact-commit Node 22 `pnpm release:verify`. The entire private source checkout, full build and judge worker were not available here.

## Remaining P0 cutover

1. Run a clean full-source release verification under pinned Node 22.13+ and pnpm 12.8.2; resolve actual application failures, not only test-fixture failures.
2. Obtain genuine Sandbox create/send, separate test-buyer payment, authenticated PAID invoice GET and exact-invoice signature-verified webhook evidence.
3. Perform the sanitized one-commit public export, verify the runnable judge path from that source, record a real functioning public YouTube demo under three minutes and submit Devpost.

The development repository and historical Git metadata remain private. A passing synthetic fixture does not prove external provider events or final submission readiness.
