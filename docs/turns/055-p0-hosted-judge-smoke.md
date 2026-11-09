# Turn 055 Receipt: Signed-Out Hosted Judge Smoke Gate

- **Status:** Implemented a read-only hosted-judge smoke command and local regressions; actual Cloudflare deployment and PayPal Sandbox evidence remain open.
- **Date:** October 31, 2026 UTC.
- **Priority:** P0.
- **Objective:** Give the release operator a safe, repeatable way to determine whether the public judge path is reachable without exposing creator data, relying on mocks or making payment calls.
- **Exit criteria:** A dependency-free HTTPS-only checker fails closed on broken public pages, insecure modes, unintended redirects, creator disclosure, enabled local mocks and oversized or sensitive responses.

## Scope completed

1. Added `scripts/hosted-judge-smoke.mjs` with strict exact-HTTPS-origin validation, nine signed-out GET probes, no redirects or credentials, eight-second request deadlines and 64 KiB decoded response limits.
2. Required a valid RightsReceipt `/api/health` response in `sandbox` or `judge` mode and real landing, buyer intake and receipt entry pages plus their native client scripts.
3. Required unknown public receipt lookup to return the exact six-field minimized `not_found` structure and required private read responses to include `Cache-Control: no-store`.
4. Required the legacy creator workspace API to return `creator_session_required` (403) and the local mock verification API to return `mock_mode_unavailable` (503).
5. Returned only check identifiers, statuses, HTTP codes and safe diagnostic codes. Evidence is written under ignored `.data/hosted-judge-smoke`. No response bodies, credentials, private links or webhook contents are recorded.
6. Added eleven isolated regression tests and wired them into both `pnpm verify` and `pnpm verify:static` through `judge:hosted:smoke:verify`.
7. Updated the judge quick start, submission index, README and project status. Corrected an escaped newline that had joined two links in the submission index.

## Files changed

- `scripts/hosted-judge-smoke.mjs`: new read-only external deployment checker.
- `scripts/hosted-judge-smoke-local.test.mjs`: eleven synthetic-response regressions.
- `package.json`: hosted smoke and regression scripts, plus verification-chain integration.
- `docs/submission/JUDGE_QUICKSTART.md`: invocation and limitations.
- `docs/submission/README.md`: updated submission index and formatting correction.
- `README.md`, `PROJECT_STATUS.md`: current release truth.
- This receipt.

## Operator command

After a safe Sandbox/judge build is deployed:

```bash
pnpm judge:hosted:smoke -- --origin https://YOUR-APPROVED-JUDGE-HOST
```

Only an exact HTTPS origin is permitted. The command uses no cookie jar, OAuth token or payment credentials and makes GET requests only. A pass means the defined HTTP boundary checks passed at that time, not that the full interactive creator/buyer scenario or a genuine PayPal payment succeeded.

## Verification

The final candidate module and test module passed Node module syntax checks. Then, using Node 24.22.1, the exact staged scripts were run in a disposable temporary directory with synthetic `Response` objects:

```text
node --input-type=module --check < hosted-judge-smoke.mjs
node --input-type=module --check < hosted-judge-smoke-local.test.mjs
node --test scripts/hosted-judge-smoke-local.test.mjs
```

Result: **11 passed, 0 failed, 0 skipped** in approximately 0.12 seconds. The existing public-release snapshot audit also passed with zero findings against the two staged scripts and minimal release-documentation fixtures. It was not a full repository history audit.

Coverage includes healthy hosted flow; local-mode health rejection; public creator data leakage; enabled mock verification; disabled buyer/receipt pages; cross-origin redirects; unsafe origins; oversized bodies; sanitized transport failures; broken receipt lookup; extra private receipt fields; and missing no-store cache controls.

The entire `pnpm verify` and clean-commit Node 22 `pnpm release:verify` gates were not rerun. No hosted URL existed to probe in this turn. Neither PayPal nor Cloudflare deployment APIs were called.

## Why the full release gate is still open

This runtime has Node 24.22.1 and no authenticated Git checkout for the private repository, although the connected GitHub service can read and update its files. A synthetic checkout or injected provider response is not valid evidence of an exact-commit Node 22 release pass.

The smoke command itself is deliberately not an integration or payment test. A green result cannot establish D1 migration state, human login, end-to-end buyer actions, webhook authenticity or paid settlement.

## Remaining gates and next turn

1. Run `pnpm release:verify` in an authenticated clean checkout of the merged release commit under Node 22 with pnpm 12.8.2.
2. Complete genuine Sandbox invoice creation/send, hosted buyer payment, independent paid-status GET and verified signed webhook.
3. Deploy a restricted Cloudflare/D1 judge build and run this new smoke command against its real HTTPS origin, then verify the interactive journey in a browser.
4. Export the sanitized public one-commit repository, verify its public links, publish the sub-three-minute video and complete Devpost.

**Recommended Turn 056:** Close the clean Node 22 release gate and genuine Sandbox acceptance as soon as the necessary private checkout and Sandbox accounts are available. Do not label synthetic fixtures as provider or deployment evidence.

## Commit

This receipt is part of the Turn 055 implementation commit. The pull request merge record identifies the exact SHA.
