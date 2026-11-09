# Turn 075: Align webhook capture retry window with authenticated verification

## P0 issue

The private one-shot Sandbox webhook collector rejected every transmission older than five minutes. PayPal documents retrying failed webhook deliveries over as much as three days. RightsReceipt's existing `packages/paypal/src/webhook-intake.ts` signature-verification handler already allows a maximum past age of 259,500,000 milliseconds, with future skew limited to 300,000 milliseconds. This mismatch could cause the capture step to drop a genuine retry before independent PayPal signature verification, even though the verifier would otherwise accept its timestamp.

The previous Turn 075 attempt produced a local patch package but GitHub writes were blocked. This pass applies that exact reviewed patch to the previously verified main revision.

## Implemented corrections

1. Added `scripts/support/sandbox-webhook-transmission-window.mjs`, a dependency-free validator of canonical UTC transmission timestamps, using the exact existing verifier's past and future bounds. It rejects malformed, noncanonical and invalid UTC dates.
2. In `scripts/sandbox-webhook-capture.mjs`, replace the overly strict `Math.abs(Date.now() - sent) > 300_000` with the shared timestamp policy. Keep all five required provider headers, exact-invoice binding, partial/pending status exclusions, original raw event, one-shot terminal state, bounded request body and separate PayPal signature verification.
3. Updated the existing collector HTTP regression to reject events outside the independently verified range rather than the old five-minute past range, and added a delayed 20-minute retry that must be accepted as `captured_unverified`.
4. Added eight timestamp-policy tests, including precise boundaries, invalid dates and clock handling. Wired those tests into both the normal PayPal regression script and the standalone Sandbox capture verification script.
5. Updated the PayPal acceptance guide, README and project status so the release contract no longer incorrectly says that all timestamps older than five minutes are rejected.

## Verification evidence

Eight isolated tests of the exact timestamp helper and test bytes passed using Node 22.16.0. The staged Git blob hashes were compared to these local file bytes. The test expectations cover legitimate delayed retries, exact maximum-age/future-skew boundaries, noncanonical and impossible UTC dates, and invalid clocks.

The full updated collector HTTP suite and the clean exact-commit `pnpm release:verify` have **not** been executed against a complete authenticated checkout of the private repository in this session. The available container lacks a private GitHub clone. No provider, payment, forwarding, remote deployment or GitHub Actions operation ran.

The code only allows a delayed delivery to be captured for further verification. It does **not** establish PayPal authenticity, mark payment, grant rights, or keep a one-shot listener open for three days. Independent PayPal `verify-webhook-signature` postback, same-invoice binding and authenticated settled-invoice GET remain mandatory.

## Remaining release gates

Execute genuine Sandbox OAuth/create/send/buyer-payment/paid GET/verified webhook acceptance, clean full Node 22 verification, a sanitized one-commit public repository, a functional public YouTube demo under three minutes, and Devpost submission. A separate public HTTPS forwarding endpoint is needed only when using the local collector; Cloudflare hosting is optional under contest rules. The development Git history must stay private.

References: https://developer.paypal.com/api/rest/webhooks/rest/ and https://developer.paypal.com/platforms/invoicing/reference/invoicing-webhooks/
