# Turn 070: Private genuine PayPal Sandbox buyer payment handoff

## Problem and release impact

RightsReceipt's genuine Sandbox acceptance harness could create a USD 425.00 invoice, send it, retrieve authoritative invoice details and confirm that a `recipient_view_url` was present, but it intentionally discarded the URL before returning from Stage 1. The operator could not directly open the sandbox buyer payment page using the evidence or state saved by the harness. This prevented a self-contained sequence from create/send to actual buyer payment, even if appropriate personal/business Sandbox accounts and credentials were available.

PayPal's Invoicing v2 reference confirms that `detail.metadata.recipient_view_url` is the customer-facing URL from an authenticated invoice GET, and the official Sandbox account instructions require a separate personal buyer and business merchant. This turn preserves PayPal Sandbox as the only allowed provider environment.

## Implemented improvement

Added `scripts/support/sandbox-payment-handoff.mjs`, a dependency-free private-output boundary with two functions:

- `checkedSandboxHandoffUrl` requires exact `https://www.sandbox.paypal.com` origin, the existing supported invoice-view path shapes, no credentials, no query parameters, no percent encodings or unsafe characters.
- `writeSandboxPaymentHandoff` writes `sandbox-payment-link.txt` under the selected private run directory using `wx` and `0o600` where supported, refusing to overwrite a previous file. It returns `null` for paid, draft, refunded or otherwise nonpayable statuses.

The existing `scripts/paypal-sandbox-acceptance.mjs` now writes the private file after a successful authenticated create/send/GET payable result. Its CLI summary prints `handoffPath` but never the URL. Public `evidence.json` retains only the `paymentUrlPresent` boolean, and private restart `state.json` does not store the URL. For a later `check --state`, a still-unpaid invoice produces a fresh link file from another authorized GET, with **no second create/send**. A PAID result has `handoffPath: null`.

The buyer can open the link locally in a browser and pay with a separate personal Sandbox account. The link is private operational access, not proof of settlement. All real PayPal requests remain behind the original harness's Sandbox-only transport and require explicit credential/account setup outside the repository. This turn does not perform any provider request itself.

## Verification

Five focused Node 22.16.0 tests passed on the exact new helper bytes. Tests cover a valid private file, owner-only mode on POSIX, nonpayable statuses, no overwriting, hostile/live PayPal URLs, and supported Sandbox invoice-view paths. The exact helper and test Git blob SHA-1 values matched local Git object hashes.

The existing `scripts/paypal-sandbox-acceptance-local.test.mjs` now asserts the private file contents after create/send, absence from public evidence and restart state, a new private link after an unpaid status check without additional sends, no link after PAID status, and no link after uncertain send. An additional fixture rejects a live PayPal recipient URL. The new focused tests are included in `pnpm sandbox:acceptance:verify` and `pnpm paypal:verify`.

**Limit:** These updated acceptance integration tests were authored but were **not executed** against the entire private source tree in this session. No actual PayPal Sandbox OAuth, invoice, browser payment, or verified webhook occurred. Final clean Node 22 `pnpm release:verify` and genuine Sandbox acceptance remain mandatory.

## Operational instructions

1. Keep distinct business Sandbox merchant and personal Sandbox buyer accounts and server-only credentials outside Git.
2. Run `pnpm sandbox:acceptance:create`; inspect its printed `handoffPath` and `statePath`. Read the URL from the private `sandbox-payment-link.txt` file, never from public evidence.
3. Open that Sandbox-only PayPal URL in a private browser session and pay the invoice as the personal buyer.
4. Run `pnpm sandbox:acceptance:check -- --state <statePath>`. If still unpaid, the command returns a new private `handoffPath`. If paid, verify the independently validated USD 425.00 settled detail and zero due balance.
5. Capture a genuine webhook privately, run the signature verifier, and reconcile all three sanitized evidence files with `pnpm sandbox:acceptance:evidence:check`. Do not substitute a simulated webhook.

No paid service, production transaction, Cloudflare deployment, public repository or GitHub Actions was used. See `docs/paypal/SANDBOX_ACCEPTANCE.md` for the complete release runbook.
