# Turn 124: strict paid-webhook acceptance gate

**Date:** November 6, 2026  
**Scope:** PayPal Sandbox CLI acceptance, regression tests and release instructions  
**Submission status:** NOT READY

## Why this turn

The genuine Sandbox acceptance CLI independently prints `status: passed` when PayPal's signature verifier accepts a captured event. Before this turn, `runWebhook` did not itself require an `INVOICING.INVOICE.PAID` event, a `PAID` resource status, or a matching saved invoice when `--state` was omitted. A correctly signed `INVOICING.INVOICE.SENT` or partially paid event could therefore produce a green individual stage. The later three-record evidence reconciler correctly rejected those cases, but the earlier green label could mislead an operator into stopping before full settlement proof.

The [PayPal developer documentation](https://developer.paypal.com/platforms/invoicing/reference/invoicing-webhooks/) explicitly describes `INVOICING.INVOICE.PAID` as applying to paid, partially paid and pending-payment states. A webhook event name or validated signature is not independently a paid settlement conclusion.

## Changes

- `scripts/paypal-sandbox-acceptance.mjs`: require the private invoice `--state` for the webhook command, including the directly imported `runWebhook` function. Reject missing state before any provider request with `state_required`.
- `scripts/paypal-sandbox-acceptance.mjs`: only return webhook-stage `passed` after signature postback succeeds, the event refers to the exact invoice in that state, the event type is `INVOICING.INVOICE.PAID`, and its resource status is `PAID`. Return the safe code `webhook_not_paid` for signed but nonpaid and partial events. Preserve `invoice_mismatch` for unrelated invoices. A successful evidence record now always has `matchedStateInvoice: true`.
- `scripts/paypal-sandbox-acceptance-local.test.mjs`: reproduce the false-green behavior on `SENT` and missing-state cases before the fix, then cover sent/unpaid, paid-event/partially-paid, mismatched-invoice and no-state cases, plus the canonical success path.
- `docs/paypal/SANDBOX_ACCEPTANCE.md` and `docs/submission/FINAL_CUTOVER_CHECKLIST.md`: make the exact-invoice paid-webhook rule explicit for the operator. Update the submission index.

## Reproduced failure and focused regression result

The test baseline on the current source passed **8 of 8** acceptance tests. After adding new assertions and before implementing the fix, the mocked suite failed in two intentional places:

1. A correctly signed fixture for `INVOICING.INVOICE.SENT` was reported as passed instead of failed.
2. A webhook check without private invoice state reached capture parsing instead of rejecting immediately with `state_required`.

After the implementation, the acceptance test file passed **9 of 9** tests on Node 24.22.1 with the repository's TypeScript loader. The expanded canonical test covers four rejected and accepted cases under the same fake provider. No real PayPal request, buyer payment or webhook delivery was made.

Command from a complete checkout:

```bash
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/paypal-ts-test-loader.mjs --test scripts/paypal-sandbox-acceptance-local.test.mjs
```

This environment reconstructed only the module dependencies required for focused testing from the current private `main`. It does not have a complete authenticated Git checkout, the pinned Node 22 toolchain, or configured Sandbox merchant/buyer credentials. Thus it cannot attest that a complete `pnpm release:verify` run or any genuine PayPal acceptance has passed.

## Important limits and next required action

This correction makes the Stage 3 CLI result less ambiguous. It does **not** eliminate the need for Stage 2 authenticated PAID status and full financial reconciliation, or for the existing three-record evidence checker. The provider signature remains PayPal's authoritative decision and the real callback must be registered before the buyer pays.

The next turn must prioritize execution, not additional feature work:

1. Run `node scripts/clean-release-checkout.mjs --export-public` from the actual private Windows checkout using Node 22 and the pinned pnpm. Resolve the first failed stage, if any, and retain the original private evidence.
2. Execute the genuine separate-buyer Sandbox invoice, paid-status read and exact-invoice signed webhook acceptance, with callback bound before payment. Do not mark a mock as genuine.
3. Review the verified one-commit public export, publish it as a separate public repository, record a functioning sub-three-minute YouTube demo, and submit Devpost by the internal November 9 target, ahead of the official November 12 noon Pacific cutoff.

The application is **not yet submission-ready**. Neither public publication nor Devpost submission is claimed by this turn.
