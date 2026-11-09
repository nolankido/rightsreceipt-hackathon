# Turn 076: Cross-stage integrity for genuine PayPal Sandbox acceptance evidence

## Release problem

The final `sandbox:acceptance:evidence:check` accepted internally consistent-looking create/send, paid-status and verified webhook JSON without requiring the same-app paid-webhook registration evidence introduced in Turn 071, or proving that the paid read used the exact `state.json` saved after invoice creation. A record for a different private state or a different registered webhook could therefore pass if its invoice IDs and expected status fields agreed. Since this checker is an offline consistency tool, the gap was especially easy to miss.

## Implementation

1. Added `scripts/support/sandbox-acceptance-linkage.mjs`, a small dependency-free validator that reports only sanitized fixed failure codes. It requires a passing `INVOICING.INVOICE.PAID` same-app registration record and its SHA-256 webhook ID, matching 64-hex-character state SHA-256s from the create and later paid stages, and the same webhook ID SHA-256 in the verified webhook stage.
2. The real Sandbox harness `scripts/paypal-sandbox-acceptance.mjs` now records `stateSha256: digest(readFileSync(statePath))` in the successful create/send evidence immediately after writing its confirmed, sent invoice state. Its existing `runCheck` already records the exact saved file SHA-256.
3. The genuine `runWebhook` handler now records `webhookIdSha256` inside the sanitized verified-event evidence, computed from the configured Sandbox webhook ID. The original raw event, transmission signature, OAuth tokens, buyer email and private URLs remain excluded from published evidence.
4. Integrated the new validator into `scripts/paypal-acceptance-evidence-check.mjs`. A missing webhook registration, mismatched state hash or mismatched webhook registration fails the final reconciliation instead of yielding `passed`.
5. Updated the acceptance fixture and evidence-checker tests. Added negative test cases for omitted historical records, wrong subscription, wrong webhook ID, changed state hash and legacy v1 files. Registered the nine-test standalone suite in `sandbox:acceptance:evidence:verify` and consequently the existing PayPal verification chain.
6. Updated the authentic Sandbox acceptance runbook, README and project status.

## Verification

Nine exact-byte isolated linkage tests passed under Node 22.16.0 using temporary local files. The staged Git blob SHA-1s of the new module and tests match those locally executed bytes.

Six additional direct evaluations of the **updated real evidence-reconciliation function** passed in an isolated V8 environment: one valid three-stage fixture and five negative cases for missing registration, mismatched saved state, mismatched webhook ID, mixed invoice ID and unsettled financial details. The updated source parsed successfully. The normal offline evidence-checker integration test suite was extended but not run as a complete Node 22 private repository checkout in this session. The clean exact-commit `pnpm release:verify` remains unexecuted.

These checks demonstrate internal linkage of locally supplied JSON records, not independent PayPal provider origin. Genuine Sandbox OAuth, buyer-hosted payment, authenticated paid-amount GET and signature-verified webhook evidence remain required.

## Remaining acceptance and submission work

Run the exact full Node 22 release verification, an actual Sandbox invoice and paid buyer flow, registered HTTPS webhook callback plus genuine postback verification, sanitized one-commit public repository export, public functioning-demo YouTube video under three minutes and Devpost submission by the contest deadline. Keep private development history and raw payment/webhook files out of the public release. No PayPal API call, provider transaction, paid API, remote deployment or GitHub Actions were used in this turn.
