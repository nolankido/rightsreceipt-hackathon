# Turn 098: Live local collector liveness before PayPal Sandbox invoice creation

**Date:** November 4, 2026
**Priority:** P0, reduce genuine Sandbox acceptance failure risk
**Baseline:** private `main` after Turn 097

## Problem reproduced

Turn 097 introduced an exact current callback derivation from the private route file, but a **saved route file and matching PayPal registration do not establish that the localhost collector process is still listening**. A stopped, timed-out or replaced collector can leave its route files behind. The prior Stage 0 preflight could pass and let Stage 1 create a Sandbox invoice, while the callback listener was already unavailable.

This is particularly consequential for the time-limited one-shot collector and the requirement to capture a genuine same-invoice `INVOICING.INVOICE.PAID` webhook.

## Implementation

- `scripts/sandbox-webhook-capture.mjs` responds to a `HEAD` request at **its exact private route** with HTTP 204 and a fixed `X-RightsReceipt-Capture-Ready: unverified-local-v1` marker. It does not accept a POST, consume its one-shot slot, create an invoice or claim financial evidence. After binding to 127.0.0.1, it writes a private owner-only `private-local-origin.txt` beside its existing `private-route.txt`. The origin file contains only the loopback address and port, not the combined public callback URL.
- Added `scripts/support/sandbox-webhook-local-health.mjs`. It validates the local metadata and private route structure, rejects symlinks, malformed ports and non-loopback origins, sends one time-limited `HEAD` request **only to 127.0.0.1**, and requires the exact expected response header. Errors use a fixed `webhook_preflight_collector_unavailable` code without exposing paths or route contents.
- `scripts/support/sandbox-webhook-readiness.mjs` automatically invokes the local probe in private-route-file mode **before PayPal OAuth**. A stopped collector now blocks both the Stage 0 preflight and the repeated Stage 1 preflight. The successful sanitized result includes `localCollectorReady: true`; hosted/explicit callback mode leaves this field `null` and does not attempt a localhost probe.
- Added `scripts/support/sandbox-webhook-local-health.test.mjs` and updated `sandbox-webhook-readiness.test.mjs` and `sandbox-webhook-capture.test.mjs` to check liveness, stale routes and side-effect-free HEAD semantics. The standard `paypal:verify` and `sandbox:acceptance:webhook:preflight:verify` suites now include the new tests.
- Updated CLI help, Sandbox acceptance runbook, final cutover checklist, and environment example. There are **no additional operator configuration variables** when using the existing private-route-file mode.

## Executed verification

An isolated Node **22.16.0** workspace assembled exact-source GitHub blob copies of four dependency-free modules: callback matching, current-route derivation, registered-webhook preflight and the new localhost liveness check.

Two local Node test files made real HTTP requests to test loopback servers and injected PayPal registration replies. They tested a live route, a stale route, a stopped listener, a fake local listener, invalid private-origin metadata, symlinks, HTTP redirects and hosted-callback behavior.

**Result:** 15 tests passed, 0 failed, 0 skipped. All four source modules were compared with their corresponding GitHub blob SHAs via `git hash-object`. See [validation record](../evidence/turn098/collector-live-preflight-validation.json) for checks and hashes.

**Verification boundary:** Those two isolated test files are not the same files as the newly committed full-repository regression suites. The modified `sandbox-webhook-capture.mjs`, its regression test, the new health test and the main readiness test all passed static JavaScript syntax checks, but the **full current Node regression suites and complete pinned `pnpm release:verify` have not yet been executed**. No actual PayPal provider or public HTTPS forwarding request was made.

A passing localhost HEAD still does **not** establish external HTTPS reachability, a successfully registered webhook under a real PayPal account, authentic event delivery or settled funds. The collector must also be bound to the exact invoice **after Stage 1 and before the buyer pays**.

**Follow-up on November 4:** [Turn 099](099-p0-real-webhook-collector-integration.md) subsequently executed the actual collector's 19 official regressions, added and ran five real collector-to-preflight integration tests, fixed the missing test-file import and obtained 51/51 focused passing Node 22 tests. The full private-repo release and real Sandbox transaction remain outstanding.

## Remaining P0 submission actions

1. Run `pnpm sandbox:acceptance:webhook:preflight:verify`, `pnpm sandbox:acceptance:verify` and `pnpm release:verify` on a complete clean private checkout with pinned Node 22 / pnpm 12.8.2.
2. Configure an approved public HTTPS forwarding destination and the **same** registered Sandbox app webhook. Confirm real endpoint reachability separately. Leave the fresh local collector running throughout real invoice creation, exact-invoice binding and separate buyer payment.
3. Record genuine PayPal Sandbox PAID invoice GET and signature-verified matching webhook. Do not treat locally injected mock responses as equivalent.
4. Publish a separate sanitized one-commit public source repo; record and publish the real functioning demo under three minutes; submit Devpost and keep confirmation.

**Internal submission target:** November 9, 2026 at 3:00 p.m. Eastern.
**Official cutoff:** November 12, 2026 at 3:00 p.m. Eastern.

No paid APIs, production payments, actual Sandbox invoice, GitHub Actions, deployment, public repository change, YouTube upload or Devpost submission took place in this turn.
