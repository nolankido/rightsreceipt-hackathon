# Turn 097: derive Sandbox webhook callback from the current private capture file

**Date:** November 4, 2026
**Priority:** P0, reduce operational risk before genuine PayPal Sandbox acceptance
**Baseline:** private `main` after Turn 096

## Why this matters

The exact-webhook preflight added in Turn 095 correctly blocks a registered URL that does not match the current callback. However, one-shot local capture generates an unguessable 192-bit private route each run, while the preflight previously required the full route-bearing HTTPS URL in `PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL`. Manually copying this URL into commands or environment setup increases the likelihood of human error and accidental disclosure. A stale or miscopied route stops authentic paid-webhook collection even when OAuth and invoice creation succeed.

## Implemented improvement

Added `scripts/support/sandbox-webhook-target.mjs` with two mutually exclusive configuration modes:

1. **Existing hosted/explicit mode:** `PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL` continues to require the exact current registered HTTPS callback.
2. **New one-shot collector mode:** supply `PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN` and `PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE`, pointing to the existing `private-route.txt` created by `sandbox:acceptance:webhook:capture`. The helper securely reads the fixed-shape route, joins it to the approved HTTPS origin, and validates the result with the existing callback verifier. The combined URL is used internally and never printed.

The helper fails closed on missing or ambiguous configuration, unapproved/non-HTTPS origins, a private route outside the expected one-shot shape, symlinked or nonregular files, unexpected file locations, and malformed route contents. Both configuration modes cannot be enabled at once.

`scripts/support/sandbox-webhook-readiness.mjs` now uses this helper in the read-only Stage 0 preflight and again in Stage 1 before any invoice creation. It still checks the same registered PayPal Sandbox REST app and paid-invoice event subscription. The genuine PayPal flow, secrets and financial-authority boundaries were not loosened.

Added ten standalone Node regression tests in `scripts/support/sandbox-webhook-target.test.mjs`, two integration regressions in `scripts/support/sandbox-webhook-readiness.test.mjs`, and included the new suite in `paypal:verify` and `sandbox:acceptance:webhook:preflight:verify`. Updated the preflight CLI help, real acceptance CLI help, `.dev.vars.example`, Sandbox runbook and submission cutover checklist.

## Actual verification performed

On Node **22.16.0**, an isolated subset was assembled from exact GitHub source blobs, verified with `git hash-object`, and tested with `node --test`.

**Result:** 30 tests passed, 0 failed, 0 skipped, across the new route helper, existing callback contract, existing cross-stage evidence linkage, and three local HTTP-injection integration cases against the actual current readiness module. The integration cases checked a matching registered route, a stale route and an invalid private file before OAuth.

See [Turn 097 validation record](../evidence/turn097/callback-route-validation.json) for the exact test counts, module blob hashes and limitations.

The updated full repository `sandbox-webhook-readiness.test.mjs` fixture and the complete pnpm suite are committed but have not been run in this environment, which cannot clone the full private source tree or retrieve the pinned pnpm 12.8.2. The local integration smoke copied the real source modules but was not itself committed as a repository test file.

## Remaining hard release gates

A correctly configured callback is **not evidence that PayPal can reach it or that a genuine webhook was delivered**. The following must still pass on one clean final commit:

- `pnpm sandbox:acceptance:webhook:preflight:verify`, `pnpm sandbox:acceptance:evidence:verify`, `pnpm sandbox:acceptance:verify` and `pnpm release:verify`.
- A genuine Sandbox merchant invoice, a different personal Sandbox buyer payment, authenticated PAID invoice GET, and an exact-invoice signature-verified webhook.
- A sanitized one-commit public repository, a working public under-three-minute YouTube video, and a confirmed Devpost submission.

The private development repository remains private. No production PayPal activity, paid APIs, live Sandbox payment, GitHub Actions, remote deployment or external publication happened in Turn 097.

**Internal submission target:** November 9, 2026 at 3:00 p.m. Eastern. **Official deadline:** November 12, 2026 at 3:00 p.m. Eastern.
