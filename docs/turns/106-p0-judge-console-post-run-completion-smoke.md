# Turn 106: Judge-console post-run completion smoke

**Date:** November 5, 2026 UTC

**Purpose:** Make the automated judge-console acceptance smoke check the same visible success state and evidence links a judge must see after submitting the local form.

## Previously unverified condition

`scripts/judge-console-real-smoke.mjs` already started the local console, submitted its CSRF-protected form, required HTTP 303, and validated the subsequent HTML report and JSON evidence. It did not fetch the console page after the form submission. A fixture or faulty handler that returned 303 with a failed or stale console page, yet exposed valid-looking report endpoints, could pass this part of the smoke. This was a missing end-to-end UI assertion, not evidence that the production application had actually done so.

## Changes

1. `scripts/judge-console-real-smoke.mjs` now performs a fresh `GET /` after the run redirect and before inspecting artifact endpoints. It requires HTTP 200 and HTML content type.
2. New `verifyJudgeConsoleCompletion` requires `Local rehearsal passed.`, both report and JSON evidence links, exactly `Runs this session: 1 of 5`, the visible simulation label and an explicit statement that the report is not genuine Sandbox acceptance evidence.
3. The completion response must have a nonce-bearing style element whose nonce matches the restrictive HTTP Content-Security-Policy exactly. It also requires denied framing and `no-store` caching. Mismatch fails with the fixed error code `judge_smoke_completion_invalid`.
4. `scripts/judge-console-real-smoke.test.mjs` now exercises the actual HTTP post-run page in its injected server fixture and rejects missing status, links, first-run marker, disclaimer or response protections.
5. `scripts/support/judge-console-page.test.mjs` now expects the current, more explicit *generated transaction report* disclosure and separately checks the existing genuine-Sandbox reminder in the footer. Production copy was not weakened.

## Verification performed

Command from a focused reconstruction of the exact private repository source files:

```sh
node --test --test-reporter=spec \
  scripts/judge-console-real-smoke.test.mjs \
  scripts/support/judge-console-page.test.mjs \
  scripts/judge-rehearsal-report-local.test.mjs
```

**Result:** 77 passed, 0 failed on Node 24.22.1. Includes one actual localhost HTTP submission against the test fixture. The smoke's production-default worker was not launched by this test.

Attempting `scripts/judge-local-console-local.test.mjs` on this runtime fails before the HTTP tests begin because `requireRehearsalRuntime` intentionally rejects Node 24 with `node_22_required`. That guard remains unchanged. This environment did not have an executable Node 22.13+ installation or the complete dependency-backed private checkout. Do not count the blocked suite as a passing Node 22 test.

## Submission release impact

The smoke is already wired into `judge:console:verify` and hence the full `release:verify` gate. On the exact pinned private Node 22 checkout, the enhanced smoke must now demonstrate a coherent browser-visible completion rather than accepting only endpoint artifacts.

**No claim of release readiness:** A clean pinned full release run, genuine buyer-paid PayPal Sandbox invoice plus matching signature-verified webhook, sanitized public one-commit repository, public demo video shorter than three minutes and Devpost submission remain uncompleted. Simulated evidence must never be submitted as proof of actual payment.
