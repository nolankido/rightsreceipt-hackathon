# Turn 145: credential-safe Sandbox setup handoff

**Date:** November 8, 2026, America/Phoenix
**Priority:** P0, next execution blocker after the completed clean release
**Status:** Implemented, tested, and included in a new passing clean release. Genuine PayPal acceptance remains blocked by missing private configuration.

## Observed blocker

The existing read-only registered-webhook preflight returned the fixed code `webhook_preflight_configuration_missing`. This execution environment has none of the six core PayPal Sandbox variables configured, and neither supported callback configuration is present. It would be misleading to report a paid invoice, an authenticated webhook or provider contact.

The existing [Sandbox acceptance runbook](../paypal/SANDBOX_ACCEPTANCE.md) documents the required settings and capture sequence. Turn 145 provides a short offline command that states which variable **names** are absent so the owner can complete configuration privately.

## Implementation

Run from the project root, including on Windows PowerShell:

```powershell
node .\scripts\sandbox-acceptance-readiness.mjs
```

The command:

1. Checks only six fixed core environment names: client ID, client secret, merchant name, merchant email, separate buyer email and registered webhook ID.
2. Detects the mutually exclusive hosted callback option or the two-variable one-shot collector option. It reports incomplete and conflicting selections.
3. Rejects empty, whitespace-padded, control-character-bearing and oversized text values at the local presence stage.
4. Returns only fixed variable names, status and next-step identifiers. It never includes any environment value, account address, webhook URL, private route or unknown argument.
5. Makes no network request, writes no private state, creates no invoice and does not modify a PayPal account.
6. Reports `configuration_present_not_verified` only for locally present variables. The existing authenticated Stage 0 webhook registration preflight and genuine create, pay, check and webhook stages remain mandatory.

Package scripts: `pnpm sandbox:acceptance:readiness` and `pnpm sandbox:acceptance:readiness:verify`. The eight tests also run through the canonical `pnpm paypal:verify` path.

## Actual configuration result

The local check returned `status: blocked`, `callbackMode: not_selected`, and these fixed missing core names:

- `PAYPAL_SANDBOX_CLIENT_ID`
- `PAYPAL_SANDBOX_CLIENT_SECRET`
- `PAYPAL_SANDBOX_MERCHANT_NAME`
- `PAYPAL_SANDBOX_MERCHANT_EMAIL`
- `PAYPAL_SANDBOX_BUYER_EMAIL`
- `PAYPAL_SANDBOX_WEBHOOK_ID`

Choose exactly one callback configuration:

- Hosted: `PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL`
- One-shot collector: both `PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN` and `PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE`

Enter actual values only on the owner's authorized machine. Do not send secrets, buyer addresses or private callback routes in chat, source files or screenshots. This local check cannot provision a PayPal account, register a webhook, verify a public forwarder or authorize payment.

## Verification

The initial clean release attempt correctly failed on a source-audit finding: unmarked credential-shaped values in the new test fixture. Those values were synthetic, but the audit remained strict. The fixture strings were labeled as synthetic and the public-audit rules were not weakened.

The completed clean release is bound to source commit `216d882c2ac5d23ea2378e9969b2ac2d3004daff`:

| Evidence | Observed result |
| --- | --- |
| Runtime | Node 22.23.4, Corepack 0.36.0, pnpm 12.8.2, Linux x64 |
| Source snapshot audit | Passed, zero findings |
| Frozen install | Passed, unchanged dependency lock |
| Complete `pnpm verify` | Passed; 71/71 Vitest tests and 2,896 passing Node TAP executions, zero failures, three existing skips |
| Canonical judge rehearsal | Passed, no external requests or credentials |
| Original stage logs | All eight SHA-256 hashes independently matched their verification record |
| Sanitized export | Passed, exactly one parentless `main` commit, no remote, 799 tracked files and exact source tree |

Exact release verification SHA-256: `ecf4659cef03cd2858a77b1eaaa5f0b19982f36515019b890fb6950dabe91d83`. Its four canonical stages returned zero exit codes. The prepared public commit is `0864a841fc6de7585685d419aceb0c9eb48c757d`, with source/public tree `677c158f0c9cd549da13d7aa76fa59ad471b629b`. Both source and exported-history audits returned zero findings.

The 2,896 Node TAP passes are summed executions across script suites, not unique test cases. Two skips cover unsupported-runtime branches; one is an opt-in FFmpeg video witness. A passing offline release does not prove an actual provider payment or a finished public video.

This receipt and subsequent status updates are documentation-only commits after the frozen source candidate. Preserve the candidate's original private handoff or run the canonical release again for a new source revision.

## Next action

On the owner's Windows machine, configure the six core Sandbox variables and a current, registered HTTPS callback option. Run the offline readiness command, start and bind the one-shot collector if using that option, and then run `pnpm sandbox:acceptance:webhook:preflight`. Proceed to creating the USD 425 Sandbox invoice only after that exact-app callback check passes. Complete separate-buyer payment, authenticated paid settlement retrieval and matching signed webhook verification.

The next four submission gates remain open: genuine Sandbox acceptance, published sanitized source, a functional public video under three minutes, and Devpost submission confirmation. This turn reduces the operator setup ambiguity but does **not** close the payment gate.
