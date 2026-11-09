# Turn 095: Exact current webhook callback preflight for genuine PayPal Sandbox acceptance

**Date:** November 4, 2026  
**Priority:** P0, prevent a paid Sandbox invoice without the intended webhook listener  
**Current readiness:** PARTIAL, not a verified release

## Concrete defect

The old read-only registered-webhook preflight verified the webhook ID belonged to the invoicing REST app, accepted an HTTPS URL, and required an `INVOICING.INVOICE.PAID` subscription. It did **not** compare the registered URL with the intended **current** public callback URL. The one-shot local collector generates a different private route each run, so a stale but otherwise valid webhook could pass preflight. A buyer could then pay the real Sandbox invoice while the fresh collector received no matching event.

PayPal's [Webhooks integration](https://developer.paypal.com/api/rest/webhooks/rest/) and [Invoicing webhook troubleshooting](https://developer.paypal.com/invoicing/troubleshooting) explain the importance of the callback and same-app registration.

## Changes saved to private main

1. Added `scripts/support/sandbox-webhook-callback.mjs` and focused Node tests. It validates an intended public HTTPS URL, forbids credentials, fragments and query strings, and compares the registered URL with the exact current expected callback. It returns only `exactCallbackChecked: true`, not the URL or secret one-time route.
2. Updated `scripts/support/sandbox-webhook-readiness.mjs`. Both Stage 0 and Stage 1 now require `PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL`. Bad operator intent fails before OAuth. A valid but different registered URL fails before invoice creation with `webhook_preflight_callback_mismatch`. The read-only successful result includes `exactCallbackChecked: true`.
3. Updated the real `scripts/paypal-sandbox-acceptance.mjs` creation evidence to record that callback preflight was performed, and updated the receipt linkage validator to require this field for an internal acceptance claim.
4. Added stale-route and malformed-configuration regressions to `scripts/support/sandbox-webhook-readiness.test.mjs`, updated the acceptance-harness test's expected callback configuration, and included the standalone callback tests in the standard `sandbox:acceptance:webhook:preflight:verify` package script.
5. Updated `docs/paypal/SANDBOX_ACCEPTANCE.md` to require the full current private callback URL in the environment without printing or committing it.

**November 4 follow-up:** The synthetic fixture compatibility blocker described below was corrected in [Turn 096](096-p0-sandbox-evidence-fixture-repair.md). Both fixtures now carry the expected callback attestation, and 17 matching-blob focused Node 22 tests passed. The complete offline evidence and full release suites remain unexecuted, so this is not a full release acceptance.

## Verification and known integration blocker

**Executed locally:** `node --test scripts/support/sandbox-webhook-callback.test.mjs` on Node 22.16.0: **7 passed, 0 failed**. The two tested files' Git blob SHA values exactly match the versions committed to GitHub:

- callback module: `3275d69395a46b3778533b6b30e095409826360f`
- callback tests: `f257f6ddad8ce06df926e499c72bb78740fc7a02`

All edited JavaScript files passed static syntax checks. **Not executed:** the integrated PayPal preflight/harness tests, real PayPal OAuth or invoice operations, and the full `pnpm release:verify` suite. The container cannot clone the private checkout.

**Important outstanding regression:** The internal cross-stage acceptance linkage validator now requires `exactCallbackChecked: true`, but two older, locally fabricated acceptance-evidence test fixtures have not yet been updated to reflect the new contract. Updates to those fixture files were not accepted by the connected write tool. Those suites should be considered **likely failing** until reviewed and corrected on an authorized checkout. Do not mark the release or this improvement fully green. Never manufacture a genuine provider attestation from synthetic data; test fixtures must remain explicitly artificial, and actual acceptance evidence must come from the fresh preflight and genuine provider calls.

## Next P0 actions

1. Reconcile the two synthetic acceptance test fixtures against the new contract and rerun `pnpm sandbox:acceptance:evidence:verify`, `pnpm sandbox:acceptance:webhook:preflight:verify`, and `pnpm sandbox:acceptance:verify`.
2. In a clean pinned Node 22 / pnpm 12.8.2 checkout, run `pnpm release:verify` and preserve the generated evidence for that exact commit.
3. Run the one-shot collector with an approved private-to-public HTTPS forwarding route, register that **exact** route under the same Sandbox REST app, and securely set `PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL` to the identical URL before starting Stage 0 or sending an invoice.
4. Capture genuine separate-buyer payment, authenticated PAID GET, signature-verified same-invoice webhook and reconciliation. An exact callback match still does not prove reachability or signed delivery.
5. Complete the separate sanitized public repository, real functioning public YouTube demo under three minutes, and Devpost submission by the internal **November 9, 2026 3:00 p.m. Eastern** target, before the official **November 12, 2026 3:00 p.m. Eastern** cutoff.

No account credentials, paid provider APIs, real payments, public repository publication, video upload or Devpost submission were used in this turn.
