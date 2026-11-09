# Turn 105: Classify an empty Sandbox webhook callback as missing configuration

**Date:** November 4, 2026
**Priority:** P0, restore the genuine Sandbox webhook preflight regression gate
**Status:** Targeted implementation and tests completed; external acceptance remains outstanding
**Baseline:** Private main at `ba6fb45130c672d06eee10f23913d2bc800c2a40` (Turn 104)

## Confirmed issue

The operator's explicit `PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL` setting may be absent, empty or malformed. The read-only webhook registration preflight correctly rejects all three before OAuth. However, the callback-target helper treated an **explicit empty string** as a malformed URL with code `webhook_preflight_callback_invalid`, while the readiness regression contract and other required configuration fields expected `webhook_preflight_configuration_missing`.

This disagreement caused the existing `missing or malformed expected callback blocks before any network activity` integration test to fail. Its other cases and the Sandbox acceptance harness were passing. A failed regression test blocks `pnpm sandbox:acceptance:webhook:preflight:verify` and, therefore, the broader release verification.

## Fix

- `scripts/support/sandbox-webhook-target.mjs` now classifies a direct callback set to exactly `''` as `webhook_preflight_configuration_missing` before URL parsing or provider contact.
- Missing callback variables continue to receive `webhook_preflight_configuration_missing`.
- A nonempty malformed direct callback still produces `webhook_preflight_callback_invalid`.
- Conflicting direct and derived callback modes continue to fail first as `webhook_preflight_callback_configuration_conflict`.
- `scripts/support/sandbox-webhook-target.test.mjs` now checks the empty direct variable separately from an invalid nonempty HTTP callback.

The change affects **only fail-closed operator diagnostics**. It does not loosen accepted callback hosts, change webhook registrations, contact PayPal, accept unverified payments or alter permissions.

## Verification actually run

- Initially, the complete webhook readiness test reproduced the diagnostic mismatch while the other related tests passed.
- The actual PayPal acceptance harness's **eight** local tests passed using the repository's TypeScript test loader and an injected Sandbox transport.
- After the fix, the acceptance and webhook preflight group passed **57 of 57** tests.
- A combined run across **16 test files** covering evidence reconciliation, exact invoice state linkage, Sandbox-only transport, private payment links, webhook collector, registration, binding, retry windows and one-shot lifecycle passed **142 of 142**, with zero skips or failures.
- The combined run used **Node v24.22.1**, `--experimental-strip-types` and the project's `scripts/paypal-ts-test-loader.mjs`, from a focused local reconstruction of exact fetched source blobs.

These tests use injected PayPal responses and loopback collectors. They are not a genuine PayPal Sandbox buyer payment, authenticated provider PAID retrieval or real signature-verified webhook delivery. The complete pinned Node 22 / pnpm 12.8.2 release gate and full private source checkout remain unverified here.

## Remaining P0 work

1. Run `pnpm release:verify` on the frozen clean private checkout using the pinned toolchain and retain the exact-commit logs.
2. Complete genuine same-app Sandbox create/send, separate-buyer payment, authenticated paid GET and signed matching paid webhook capture and reconciliation.
3. Publish only the sanitized single-commit public export after its full privacy audit. Verify judge run instructions and a publicly visible working YouTube demo under three minutes; then submit on Devpost.

No credentials, paid services, production payments, deployment, public visibility changes, GitHub Actions, YouTube upload or Devpost submission were used in this turn.
