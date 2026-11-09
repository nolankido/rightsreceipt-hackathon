# Turn 053 Receipt: Sandbox Acceptance Evidence Reconciliation

- **Status:** Completed local evidence-reconciliation improvement; genuine provider acceptance remains open.
- **Date:** October 31, 2026 UTC.
- **Priority:** P0.
- **Objective:** Reduce the risk of treating disconnected, simulated or incomplete payment records as a complete PayPal Sandbox demonstration.
- **Exit criteria:** A read-only command requires a consistent invoice identity and financial/webhook evidence across all three existing sanitized stage artifacts, with regression tests and clear limitations.

## Scope completed

1. Added `scripts/paypal-acceptance-evidence-check.mjs` to read bounded JSON artifacts from the existing create/send, paid-status and webhook stages.
2. Required one exact `INV2-*` invoice identity; the canonical USD 425.00 amount; PayPal Sandbox provenance flags; a genuine payable handoff; exact paid, refunded and due totals; a verified PAID webhook bound to that invoice; and the expected PayPal API call paths.
3. Rejected evidence with obvious raw account material, missing hashes or simulated/provider-mismatched statuses. The result prints only diagnostic codes and a hash of the invoice ID, not raw evidence, account values or input paths.
4. Added nine isolated tests covering valid synthetic evidence, mixed invoices, spoofed payment status, missing webhook proof, missing API calls, sensitive data, malformed JSON and bounded file handling.
5. Wired the standalone regression into `paypal:verify` and added an integration assertion to the existing acceptance harness test, so future changes to the harness cannot silently diverge from the checker.
6. Updated the PayPal acceptance runbook, README and project status. No production PayPal adapter or transaction routes changed.

## Files changed

- `scripts/paypal-acceptance-evidence-check.mjs`: new read-only reconciler.
- `scripts/paypal-acceptance-evidence-check-local.test.mjs`: nine synthetic-stage tests.
- `scripts/paypal-sandbox-acceptance-local.test.mjs`: integration assertion against the actual injected-provider acceptance harness.
- `package.json`: new check/verify commands and integration in `paypal:verify`.
- `docs/paypal/SANDBOX_ACCEPTANCE.md`, `README.md`, `PROJECT_STATUS.md`: operator runbook and release truth.
- This receipt.

## Verification

### Commands or checks

```text
node --input-type=module --check < reconciler source via stdin
node --input-type=module --check < regression source via stdin
node --test scripts/paypal-acceptance-evidence-check-local.test.mjs
```

The test command was run against the exact candidate reconciler and test files in a disposable temporary directory under Node 24.22.1. The fixture inputs were synthetic and required no PayPal access.

### Results

- Both new JavaScript files passed module syntax checks.
- Nine tests passed, zero failed/skipped, in approximately 0.32 seconds.
- The new integrated assertion in the existing PayPal harness was added and syntax-checked, but not executed with the complete dependency tree in this turn.
- The full `pnpm verify`, clean Node 22 release gate, actual PayPal Sandbox and hosted deployment were not executed.

## Manual evidence

The existing Turn 049 harness already emits separate sanitized records with a creation/sent invoice, a later independently assessed paid financial state, and a verified webhook. The new tool connects only those stage records and rejects mismatches. It cannot prove that their JSON contents originated from PayPal.

## Risks or limitations

- This is an internal consistency validator, not independent cryptographic attestation of a PayPal response. A fabricated but internally consistent JSON triplet could pass.
- A result of `passed` is not authorization to issue rights. Only the application provider/session/financial lifecycle may do so.
- In the current environment an authenticated clean private checkout and actual Sandbox test accounts were unavailable.
- The private development Git history is still not suitable for publication. The one-commit sanitized public export remains required.

## External blocker

A real Sandbox merchant and personal buyer account, registered invoicing webhook, secure server-only Sandbox credentials and clean authenticated Node 22 checkout are required to generate and check genuine release evidence.

## Architecture

The tool preserves [ADR 0008](../decisions/0008-separate-payment-permission-verification-lifecycles.md): independent PayPal payment truth, rights permission and receipt status remain separate, and a local evidence report cannot activate permission.

## Commit

This receipt is included in the Turn 053 implementation commit. The pull request and merge record identify the exact SHA.

## Recommended next turn

Turn 054: Execute the frozen full Node 22 release verifier and live PayPal Sandbox create, send, pay, recheck and webhook sequence; then run `pnpm sandbox:acceptance:evidence:check` on those genuine artifacts. Proceed to restricted deployment and judge-access verification only after the real acceptance passes.
