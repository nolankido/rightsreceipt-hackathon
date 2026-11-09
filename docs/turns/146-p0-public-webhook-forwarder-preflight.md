# Turn 146: read-only public webhook forwarding probe

**Date:** November 8, 2026, America/Phoenix  
**Priority:** P0, genuine Sandbox acceptance preparation  
**Status:** Implemented and focused-tested; a new complete Node 22 clean release and real provider acceptance are still required before this source revision is a submission candidate.

## Observed gap

The existing registered-webhook preflight checked a current one-shot collector by sending `HEAD` to its private route on `127.0.0.1`, then authenticated to PayPal to verify the registered callback and paid-event subscription. That correctly rejected a stopped local collector and wrong REST app. It did not test the separately configured public HTTPS forwarding path. The local collector and PayPal registration could both be healthy while the forwarder was down, misrouted or not forwarding the private route. In that case the operator could create and pay an invoice without capturing the required genuine webhook.

## Improvement

For a one-shot collector, after starting the collector and approved HTTPS forwarder and registering the exact callback, run:

```powershell
node .\scripts\sandbox-webhook-preflight.mjs --probe-public
```

The optional flag performs three read-only checks in order:

1. Derive the exact callback from the locally owned private route file and approved HTTPS public origin. Refuse a hosted-callback configuration or conflicting modes.
2. Verify the local collector responds to a side-effect-free `HEAD`, then send exactly one redirect-locked, six-second-bounded public `HEAD` with no credentials, cookies, invoice body or PayPal headers. Require HTTP 204, the exact `X-RightsReceipt-Capture-Ready: unverified-local-v1` marker, no followed redirects, and no changed final URL.
3. Only after those checks, authenticate to the same PayPal Sandbox REST app and confirm the exact webhook URL and paid-event subscription with the existing preflight.

The command prints only fixed status and diagnostic codes and `publicForwarderReady: true` when all checks pass. It never prints the private route, full callback, Sandbox credentials or provider response body. It does not create invoices, register or modify webhooks, reserve the one-shot capture, or treat any liveness check as financial evidence. The previous zero-argument preflight remains unchanged for an independently approved hosted callback, whose endpoint does not use the one-shot collector marker.

This added check proves only that a matching public route responded at the time of the probe. It does not guarantee future uptime, preservation of PayPal POST headers, an authentic signed delivery or a paid transaction. The original Stage 1.5 invoice binding, buyer payment, authenticated PAID retrieval, signed webhook verification and evidence reconciliation remain mandatory for genuine Sandbox acceptance.

## Focused verification

Node 24.22.1, offline with loopback HTTP fixtures and synthetic provider responses:

- Five public-health tests passed: exact HEAD request/marker, malformed or private targets rejected before network, 200/302/wrong-marker failures, redirected/cross-origin response failures and sanitized transport errors.
- Three integrated preflight tests passed: successful public-to-local and authenticated registration sequence, unreachable public route blocking before PayPal OAuth, and hosted mode refusing the collector-only flag without a request.
- Three existing preflight CLI tests passed, including argument validation and fixed failure codes.

Total focused result: 11 passed, zero failed. No real forwarding service, PayPal account, Sandbox invoice, signed event, public repository, video or Devpost entry was contacted or created. These tests do not substitute for the complete pinned Node 22 clean release. The prior Turn 145 frozen release remains valid only for its original source commit.

## Next action

On the owner's machine, configure the six Sandbox variables and start the one-shot collector. Establish the actual public HTTPS forwarder and register its current private callback in the same Sandbox REST app. Run the new `--probe-public` check. If it passes, create and send the canonical Sandbox invoice, bind the collector to that exact invoice before buyer payment, then finish authenticated settlement and signed webhook verification. Re-run the complete release on the selected source revision before publishing a new sanitized candidate.
