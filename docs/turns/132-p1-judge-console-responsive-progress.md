# Turn 132: immediate judge feedback for long-running local rehearsals

**Date:** November 6, 2026  
**Scope:** P1 functional judge experience, no external payment or publication  
**Submission status:** NOT READY

## Problem and acceptance criterion

The browser's `POST /run` awaited the full handler rehearsal before returning a redirect. The underlying worker has a two-minute timeout, so an evaluator could click the run button and see no apparent progress while the HTTP request remained open. The server-side page already contained a running state, but the ordinary browser could not display it because the POST had not completed. The real-worker smoke also assumed the redirect meant the complete run had already finished.

The desired behavior is a prompt redirect, visible progress and automatic transition to a validated result, without scripts, secrets, payments or premature success links.

## Implementation

- `scripts/judge-local-console.mjs` now marks the run as active, starts the existing worker as a guarded background promise and immediately returns the unchanged 303 redirect. Concurrent form posts still return 409, and the five-run limit, CSRF/origin check and credential-stripped worker remain intact.
- `scripts/support/judge-console-page.mjs` includes a two-second same-page meta refresh **only while** the rehearsal is running. The page continues to show the simulated-payment warning, run count and disabled form. After a success or failure, auto-refresh disappears.
- The complete report/JSON pair remains inaccessible until the existing path, CSP, UTF-8, schema and semantic validations succeed. A rejected or thrown worker produces a failed status with no links, and reruns erase any earlier accepted evidence before work begins.
- `scripts/judge-console-real-smoke.mjs` now recognizes and validates the honest intermediate state, boundedly polls until completion, and refuses unsafe or premature progress pages. Its actual-worker command still requires the full checkout and real Node 22; neither that smoke nor a real Sandbox payment is represented as completed here.
- Refreshed the main README, judge guide and quick start to explain the running state and failure boundaries.

## Verification

1. `node --test scripts/judge-console-real-smoke.test.mjs scripts/support/judge-console-page.test.mjs scripts/support/judge-console-evidence.test.mjs`: **32/32 passed** using Node 24.22.1 with no runtime override. The fake HTTP smoke served two pending responses before completion.
2. `node --import ../node22-guard-test-hook.mjs --test scripts/judge-local-console-local.test.mjs scripts/judge-console-real-smoke.test.mjs scripts/support/judge-console-page.test.mjs scripts/support/judge-console-evidence.test.mjs`: **57/57 passed** using Node 24.22.1 with a **temporary test-only shim** that makes the local mocked console tests see a Node 22 version string. Production source and shipped runtime guard are unchanged. This test-only condition is not evidence of Node 22 compatibility.
3. The adversarial delayed-run regression confirms that the POST returns 303 **before** the injected worker is released, the intermediate page shows timed refresh and no artifact links, a second submission returns 409, and validated evidence links appear only after the worker resolves.
4. `node --check` passed for both modified production scripts.

The full handler rehearsal, exact pinned Node 22 test suite, complete clean release, buyer-paid PayPal Sandbox flow, sanitized public repository, public sub-three-minute YouTube demonstration and Devpost submission were **not** executed or completed in this environment.

## Next required gates

Run the complete private checkout under Node 22.13+ within major 22, including `node scripts/judge-console-real-smoke.mjs` and `node scripts/clean-release-checkout.mjs --shareable --export-public`. Independently collect authentic separate-buyer Sandbox paid-status and signed exact-invoice webhook evidence, then publish only the audited one-commit source, verify the actual short video signed out and submit Devpost before the official deadline. Do not call the project submitted until those independent gates are evidenced.
