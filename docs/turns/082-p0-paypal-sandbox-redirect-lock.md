# Turn 082: Lock genuine PayPal Sandbox HTTP requests against redirects

## P0 failure mode

The genuine Sandbox acceptance harness already rejected *initial* URLs outside `https://api-m.sandbox.paypal.com`, but its `safeCalls` wrapper used `fetchImpl(url, init)`. Native Node fetch defaults to automatic redirect following. A Sandbox response with HTTP 30x could therefore trigger a follow-up request to another origin, potentially delivering the same request body, OAuth credentials, authorization header, or sensitive invoice operation to an unintended endpoint. The separate registered-webhook preflight already used `redirect: "manual"`, but the main acceptance transport did not.

This is a source-identified transport risk, not a claim that any actual PayPal redirect or credential disclosure occurred.

## Implemented

1. Add dependency-free `scripts/support/sandbox-locked-fetch.mjs`, which accepts only the exact PayPal REST Sandbox origin, never URL credentials or fragments.
2. Explicitly override any caller setting with `redirect: "manual"` on every outgoing request. Reject 3xx, opaque redirects, `Response.redirected=true`, and any nonempty returned `Response.url` that differs from the requested endpoint. Preserve the original request method, body, headers, and ordinary non-redirect PayPal success/error responses.
3. Wire the transport helper into `scripts/paypal-sandbox-acceptance.mjs` inside its existing `safeCalls` request trace. This protects OAuth, invoice draft creation/send, invoice financial GET and signed webhook postback. The existing preflight registration checker was already redirect-locked.
4. Add ten standalone `sandbox-locked-fetch.test.mjs` regression tests for redirect blocking, production/lookalike origin and userinfo rejection, manual policy enforcement, wrong-origin/wrong-path successful-looking responses, normal 201/202/401 status handling, and invalid response/transport errors.
5. Add two acceptance-harness fixture tests proving the create/check flow sends `redirect: "manual"` to PayPal and a 302 response at invoice creation cannot produce a buyer payment link. These require the complete private repository to execute.
6. Register the standalone tests in both `paypal:verify` and `sandbox:acceptance:verify`; update the genuine Sandbox runbook, README and project status.

## Verification actually performed

Node **22.16.0** under `/mnt/data/rightsreceipt_turn082`:

- Both exact new source/test modules passed `node --check`.
- **10 focused tests passed, 0 failed** in an initial run.
- Three independent full repeats also passed all 10 tests with zero failures.
- Git blob SHA-1s of the staged helper and tests match the locally executed bytes:
  - `scripts/support/sandbox-locked-fetch.mjs`: `b6c4d40bca1667e2e37dd2e5399fb392ef68f4d4`
  - `scripts/support/sandbox-locked-fetch.test.mjs`: `9daf8b58fad66b5d3d5dc68037216300cca7f1e9`
- The individual TAP log SHA-256 values and verification limitations are recorded in [the validation record](../evidence/turn082/validation.json).

The two new acceptance-harness integration regressions were staged but **not executed** against a complete authenticated repository checkout. The full pinned `pnpm release:verify` and real PayPal Sandbox API/buyer payment/signature verification were **not performed**.

## Release safety boundary

Rejected redirects are reported as unavailable transport, not provider-confirmed payment. A rejected send response may have an uncertain remote outcome, and the existing invoice-delivery journal should preserve that uncertainty instead of blindly resending. This change does not establish that real PayPal provider calls succeeded, and does not authorize production payment or paid services.

## Remaining release blockers

Run clean exact-commit Node 22 release verification; complete a real Sandbox merchant/buyer USD425 invoice, authenticated paid GET and independently signed webhook; prepare and publish the sanitized one-commit source repository; publish a public working demo under three minutes; submit Devpost before the official deadline. No paid provider, public deployment, GitHub Actions or cron job ran during Turn 082.
