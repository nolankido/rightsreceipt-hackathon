# Turn 073: Bind PayPal Sandbox webhook capture to the exact original invoice

## Problem

Turn 072's new one-shot receiver stored the first structurally valid `INVOICING.INVOICE.PAID` event that reached its private URL. It did **not** compare the paid event's invoice ID with the specific USD 425.00 invoice created by the acceptance harness until the later PayPal signature verification step. A genuine paid event for another invoice on the same Sandbox app, or a forged callback with a known URL, could consume the collector's sole capture slot, causing the actual test invoice's paid event to be lost. PayPal's invoicing documentation also says the `INVOICING.INVOICE.PAID` event may be generated for partial or pending payment, not only fully paid invoices.

## Implementation

1. Add `scripts/support/sandbox-webhook-binding.mjs` for a private, one-time, exact-invoice capture binding. It reads the collector's `private-route.txt` and the existing real acceptance harness's private `state.json`. It requires `rightsreceipt-paypal-sandbox-state-v1`, a `sent_checked` phase, an exact matching invoice ID in the draft binding, and a confirmed send journal. It rejects tracked-source paths, invalid files, symlinks, malformed state, and invalid route shapes.
2. Write `invoice-binding.json` exclusively into the collector's ignored run directory, with the original invoice ID and hash of the private webhook route. Where supported, file permissions are owner-only. The bind command reports a path and invoice-ID SHA-256 but never the actual invoice ID, route or provider credentials.
3. Add standalone `scripts/sandbox-webhook-bind.mjs` with the package command `pnpm sandbox:acceptance:webhook:bind -- --route-file ROUTE_FILE --state STATE_FILE`. It is offline and uses no provider API, and accepts pnpm's leading argument separator.
4. In `scripts/sandbox-webhook-capture.mjs`, require the binding **before** claiming a paid event. Without it, respond 503 without saving or closing, so PayPal may retry. A paid event for a different invoice returns 202 without consuming the slot. Malformed binding files return 503 rather than accepting an unbound event.
5. Ignore partial/pending paid-type notifications without taking the one-shot capture, require `PAID` for the exact invoice, and reject transmission header times more than five minutes into the past or future. Preserve original raw UTF-8 JSON and all five signature headers for the independent PayPal postback signature verifier.

## Operational sequence

Start the one-shot collector on localhost, configure a separately approved public HTTPS:443 forwarding URL, and register that complete private callback under the same Sandbox REST app. Complete Stage 1 create/send and GET, obtaining its private `statePath`. **Before** the personal Sandbox buyer pays, bind the collector using `--route-file` and `--state`. Pay using the private Sandbox recipient-view URL. Promptly verify any captured paid webhook through the existing `sandbox:acceptance:webhook -- --capture ... --state ...` command, then reconcile with the authenticated paid invoice GET. Do not reuse a binding for another invoice or treat it as proof of origin.

## Tests and review

- 8 isolated private-binding tests passed under Node 22.16.0.
- 4 standalone bind-command tests passed under Node 22.16.0.
- 5 new collector HTTP tests were added to the existing suite: no binding, unrelated invoice, stale/future timestamp, partial/pending status, and malformed binding. Existing capture tests now create an appropriate fixture binding before delivering a paid event.
- The new binding and CLI Git blob SHA-1s match the exact locally tested files. The staged changed collector and tests plus package JSON passed syntax/parsing checks.

The full changed collector HTTP collection, dependency-backed integration, exact clean Node 22 `pnpm release:verify`, real PayPal API calls, public HTTPS forwarding, paid buyer action, and genuine signature postback were **not executed** in this session. Binding is a private local consistency guard, not proof that the incoming webhook was sent by PayPal. The event remains `captured_unverified` until the separate signed postback succeeds.

## Release still blocked

RightsReceipt remains not submission-ready until genuine Sandbox create/send/paid GET/verified webhook evidence, full clean release verification, sanitized public repository, functional demonstration and under-three-minute YouTube video, and Devpost submission are complete. Cloudflare judge preview is optional under the official rules. Never publish the private development history, invoice state, webhook route, raw capture, signature, or payment link.

Official references: [PayPal invoicing webhooks](https://developer.paypal.com/platforms/invoicing/reference/invoicing-webhooks/) and [webhook verification and delivery](https://developer.paypal.com/api/rest/webhooks/rest/).
