# Turn 136: paid-stage acceptance must prove settled financials

**Date:** November 7, 2026 UTC  
**Scope:** P0 genuine PayPal Sandbox acceptance handoff, local code only  
**Submission status:** NOT READY

## Reproduced risk

The Stage 2 `runCheck` command previously reported `status: "passed"` whenever the authenticated PayPal invoice GET returned successfully. That included two materially different situations:

1. The invoice was still `UNPAID`. The command correctly generated a new private buyer payment link, but its top-level and saved evidence statuses were both `passed`.
2. The response labeled the invoice `PAID` but omitted the financial transaction details needed to prove USD 425.00 settled with zero remaining due and no refund. Again, the intermediate stage reported `passed`.

The final cross-stage reconciler already rejected both cases, so this issue did **not** prove that the final submission gate could be bypassed. It did create a false-green intermediate signal for an operator following the Sandbox runbook.

## Implemented behavior

- A valid unpaid invoice with a safe private recipient link now reports `status: "payment_pending"` and `errorCode: "buyer_payment_pending"`. It retains the ignored, private `handoffPath` so the buyer can complete the same invoice without a new creation or resend.
- An invoice may report `passed` from Stage 2 only when the authenticated adapter returns status `PAID`, the exact USD 425.00 amount, a settled paid conclusion, zero refunds, zero due and no reconciliation requirement.
- A `PAID` status label with incomplete or conflicting financials reports `status: "failed"` with `errorCode: "settlement_not_proven"`. Unknown or partial states also cannot report passed.
- The CLI's existing exit behavior now returns nonzero for pending and failed paid checks, and zero only for a verified settled result.
- The strict final three-record checker remains mandatory. It independently requires same-invoice state hashes, verified matching webhook registration and provider-trace metadata; it is still only an internal consistency check.

## Evidence and verification

- Before the fix, the existing unpaid workflow regression failed because the command returned `passed` instead of `payment_pending`.
- A new regression removed transaction detail from a mock `PAID` PayPal response. It failed against the old code because the Stage 2 command returned `passed` instead of `failed`.
- After the fix, the combined acceptance-harness, final evidence checker and state/webhook linkage suites passed **35/35** tests on Node 24.22.1 with the existing TypeScript test loader.
- The tests used mock PayPal responses and local, ignored fixture files. They did not charge or contact a buyer, verify a live PayPal webhook, publish code, or submit Devpost.

## Next action and limits

On the complete private Node 22 checkout, finish the pinned release plus sanitized export. For genuine provider acceptance, use a separately funded Sandbox personal buyer and an already registered, exact matching public HTTPS callback before payment. Preserve the real authenticated PAID result and signed event verification in private evidence. Do not claim the hackathon submission is ready until those and the independent public GitHub, video and Devpost checks pass.
