# Turn 096: Repair Sandbox acceptance-evidence fixture compatibility

**Date:** November 4, 2026
**Priority:** P0 release regression repair
**Previous issue:** Turn 095 exact current Sandbox callback preflight

## Confirmed regression

Turn 095 strengthened genuine PayPal Sandbox webhook preflight and cross-stage evidence by requiring `exactCallbackChecked: true`. However, the older synthetic fixtures in `scripts/support/sandbox-acceptance-linkage.test.mjs` and `scripts/paypal-acceptance-evidence-check-local.test.mjs` still omitted the new required field. They consequently would fail their previous passing-case assertions, preventing a clean release verification even in offline mode.

The fix is to align **synthetic test records only** with the new output contract. It does not produce evidence that an actual PayPal webhook was registered or received.

## Changes committed

- Updated `scripts/support/sandbox-acceptance-linkage.test.mjs` so the complete test fixture explicitly records `exactCallbackChecked: true`.
- Updated `scripts/paypal-acceptance-evidence-check-local.test.mjs` in the same way, retaining its original invoice, paid-status and webhook-linkage assertions.
- Added negative tests to both suites that require missing or false callback attestation to produce the existing `webhook_registration_not_proven` blocker. This ensures the change does not weaken the release evidence contract.
- Updated `.dev.vars.example` with a commented `PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL` template and a warning that the current one-shot callback route must remain private.

## Executed verification

Node **22.16.0** was used locally to execute the exact GitHub blob source and test files for two dependency-free suites:

```bash
node --test scripts/support/sandbox-webhook-callback.test.mjs \
  scripts/support/sandbox-acceptance-linkage.test.mjs
```

Result: **17 tests passed, 0 failed, 0 skipped**. The four tested local source/test files were checked with `git hash-object` and matched the GitHub content blobs:

| Source or test | Verified Git blob SHA |
| --- | --- |
| `scripts/support/sandbox-webhook-callback.mjs` | `3275d69395a46b3778533b6b30e095409826360f` |
| `scripts/support/sandbox-webhook-callback.test.mjs` | `f257f6ddad8ce06df926e499c72bb78740fc7a02` |
| `scripts/support/sandbox-acceptance-linkage.mjs` | `4891f124c0a418e6a1485c4040af11494dd781a4` |
| `scripts/support/sandbox-acceptance-linkage.test.mjs` | `c1f2ab9c2ff189b8bab08de7dbd18e55f5580db9` |

The pure `evaluateAcceptanceEvidence` and `acceptanceLinkageErrors` logic was also replayed from the current private GitHub source using isolated JavaScript stubs for Node-only utilities. Valid synthetic acceptance evidence reported `passed`; missing or false callback attestation resulted in `webhook_registration_not_proven`. The actual `scripts/paypal-acceptance-evidence-check-local.test.mjs` Node suite has **not** been executed in the complete private checkout.

## What remains unverified

The full private working tree and pinned pnpm dependency toolchain are unavailable to this execution environment. Therefore, these commands have not yet passed on the latest clean commit:

```bash
pnpm sandbox:acceptance:evidence:verify
pnpm sandbox:acceptance:webhook:preflight:verify
pnpm sandbox:acceptance:verify
pnpm release:verify
```

The expected webhook URL is matched against authenticated registration metadata only. That does not establish listener reachability, PayPal-origin event delivery, authentic settlement or legal rights. No provider credentials, production payments, paid APIs or public endpoints were used in this turn.

## Next P0 sequence

1. Run the full offline PayPal regression, local acceptance and clean release suite on a clean Node 22 / pnpm 12.8.2 checkout of final private `main`.
2. Establish a real same-app HTTPS registered callback and execute the separate Sandbox business-to-personal account invoice/payment flow with authenticated PAID GET and a verified same-invoice webhook.
3. Publish the sanitized one-commit public source and check anonymous judge reproducibility, release the publicly visible under-three-minute YouTube demonstration, and submit Devpost with its actual URLs.

**Internal target:** November 9, 2026 at 3:00 p.m. Eastern. **Official deadline:** November 12, 2026 at 3:00 p.m. Eastern. Do not claim submission readiness until the external checks and Devpost confirmation exist.
