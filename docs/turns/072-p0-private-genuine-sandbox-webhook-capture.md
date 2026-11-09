# Turn 072: Private capture of a real PayPal Sandbox webhook for later independent verification

## P0 problem

The existing genuine acceptance path could create/send a PayPal Sandbox invoice, read a paid financial result, and post back a saved webhook to PayPal's `verify-webhook-signature` API. But it still depended on the operator manually assembling a sensitive `rightsreceipt-paypal-webhook-capture-v1` JSON file containing the exact delivered webhook body and five transmission headers. Without a receiver, there was no executable capture step between PayPal's HTTPS POST and the existing verifier.

PayPal's webhook integration documentation says delivery requires a publicly reachable HTTPS listener on port 443 and a prompt HTTP 2xx response. The Webhooks Simulator is not connected to a REST app and cannot be verified with the genuine postback verifier. Sources: https://developer.paypal.com/api/rest/webhooks/rest/ and https://developer.paypal.com/api/invoicing/webhooks/.

## Implementation

Added `scripts/sandbox-webhook-capture.mjs` and `pnpm sandbox:acceptance:webhook:capture`.

- The standalone Node 22 receiver binds **only** to `127.0.0.1` on a configurable port (default 8788). It creates no external endpoint, PayPal credentials, webhook registration or payment.
- It generates a fresh 192-bit unguessable webhook route and saves the route in `private-route.txt` under ignored `.data/sandbox-webhook-capture/run-*`. The route string and any header signature are never printed to stdout.
- To receive a genuine event, an operator must deliberately configure a **separate public HTTPS:443 forwarding endpoint** that preserves request bodies and PayPal headers, and register the complete forwarded URL plus private route under the **same** Sandbox REST app before invoice creation. The existing Turn 071 preflight then confirms the registered app and paid-invoice subscription.
- The receiver accepts only POST to the exact random route, JSON bodies no larger than 131,072 received bytes, the five required PayPal transmission headers, Sandbox certificate URL shapes and syntactically valid `INVOICING.INVOICE.PAID` payloads. Unrelated invoice events are acknowledged as ignored. Production certificate addresses, unsupported payloads, invalid signatures' header forms, encoded bodies and wrong methods fail.
- It writes the exact received UTF-8 body **without reserializing the event**, together with the required five headers, to a fresh `capture.json` using exclusive creation and owner-only permissions where supported. The result is labeled **`captured_unverified`**, never `paid` or `verified`. One matching capture or a 30-minute timeout ends the listener. The CLI accepts the optional leading pnpm forwarding separator.
- The existing `pnpm sandbox:acceptance:webhook -- --capture PRIVATE_CAPTURE --state ORIGINAL_STATE` remains the only way to obtain a provider-verified webhook result, matching the event to the real invoice. The local capture file itself is untrusted, must never be published, and cannot activate permission.

## Files

- `scripts/sandbox-webhook-capture.mjs`: executable one-shot local receiver.
- `scripts/sandbox-webhook-capture.test.mjs`: ten focused HTTP and CLI tests.
- `package.json`: `sandbox:acceptance:webhook:capture` and `sandbox:acceptance:webhook:capture:verify`; add tests to the normal PayPal release verification paths.
- `docs/paypal/SANDBOX_ACCEPTANCE.md`: full multi-terminal operator sequence, public HTTPS forwarding prerequisite, private route handling, genuine postback verification and cleanup.
- `docs/submission/JUDGE_QUICKSTART.md`, `JUDGES.md`, `README.md`, `PROJECT_STATUS.md`: judge and release-status boundaries.

## Verification performed

Ten isolated tests passed using Node **22.16.0** against the exact new source and test bytes, covering loopback binding, 192-bit route privacy, file permissions, exact raw-body preservation, five transmission headers, irrelevant event acknowledgement, malformed and hostile event rejection, content-byte limit, nested invoice shape, one-shot behavior, timeout, output-path security and CLI help/argument forwarding. The staged GitHub blob SHAs match the locally tested Git blob SHA-1 values.

The entire private repository checkout is not available to this execution session, so no clean pinned Node 22 `pnpm release:verify`, dependency-backed application tests, genuine PayPal Sandbox API operation, publicly forwarded webhook delivery or real signature postback was executed. The ten tests used locally synthesized HTTP requests; they are not genuine PayPal evidence.

## Remaining release gates

Provision a separately reviewed public HTTPS:443 callback path or existing approved listener, register it under the same Sandbox app, run the real Sandbox invoice/payment, receive the actual paid event, verify its signature and same-invoice binding, then reconcile sanitized evidence. Independently complete the exact-commit release gate, one-commit public export, public functional-demo instructions, under-three-minute YouTube video, and Devpost submission.

Do not publish the private development repository, webhook route, raw capture, signature, account credentials, buyer data or payment link. Do not enable production PayPal, GitHub Actions or unapproved paid services.
