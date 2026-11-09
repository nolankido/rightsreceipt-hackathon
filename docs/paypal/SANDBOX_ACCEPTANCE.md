# Genuine PayPal Sandbox Acceptance

**Owning turn:** 049, hardened in Turns 070 through 082  
**Purpose:** Produce release evidence from the real PayPal Sandbox APIs without enabling production payments or persisting credentials.

PayPal's current Invoicing v2 flow is:

1. OAuth client credentials.
2. Create a draft invoice.
3. Send the invoice.
4. Retrieve the invoice and confirm the provider state.
5. Use PayPal's hosted payer experience.
6. Verify asynchronous webhook events before processing them.

RightsReceipt already implements those boundaries. This harness makes them reproducible for final hackathon acceptance.

## Safety contract

The harness:

- permits only `https://api-m.sandbox.paypal.com`;
- never automatically follows HTTP redirects from Sandbox OAuth, invoice, paid-status or webhook-signature verification calls; a redirect or a mismatched provider response URL fails closed;
- never supports the production PayPal API host;
- never prints or persists OAuth tokens or client secrets;
- verifies the paid-invoice webhook registration against the same REST app before invoice creation;
- writes all runtime state under ignored `.data` by default;
- stores only hashed recipient/merchant/rights details in its restart state;
- never marks payment from the send response;
- requires authenticated GET financial detail before reporting a paid settlement;
- verifies captured webhooks through PayPal's `verify-webhook-signature` endpoint;
- can privately collect the original webhook text and five transmission headers through an opt-in, one-shot localhost receiver connected by an operator-provided HTTPS forwarding endpoint;
- excludes the raw webhook body and transmission signature from final evidence;
- keeps the payer URL only in a private file and exposes only its pathname in the CLI summary.

The commands do not grant a legal license. They prove payment integration behavior only.

## Environment

Use dedicated PayPal Sandbox accounts.

Server-only values:

```dotenv
PAYPAL_SANDBOX_CLIENT_ID=<sandbox app client id>
PAYPAL_SANDBOX_CLIENT_SECRET=<sandbox app secret>
PAYPAL_SANDBOX_MERCHANT_NAME=<sandbox business display name>
PAYPAL_SANDBOX_MERCHANT_EMAIL=<sandbox business account email>
PAYPAL_SANDBOX_BUYER_EMAIL=<different sandbox personal account email>
PAYPAL_SANDBOX_WEBHOOK_ID=<registered sandbox webhook id>
# Choose ONE of the following exact-current callback configurations:
PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL=<exact registered HTTPS callback URL for a hosted listener>
# Or, for the one-shot collector, OMIT the setting above and provide BOTH:
PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN=<public HTTPS forwarding origin, no trailing path>
PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE=<path to current private-route.txt>
```

Do not commit a populated environment file.

### Check local configuration without exposing values

Before requesting an authenticated Sandbox preflight or creating an invoice,
run this offline check from the repository root:

```powershell
node .\scripts\sandbox-acceptance-readiness.mjs
```

It lists only the fixed names of missing server environment variables and
whether a hosted callback or one-shot collector configuration was selected.
When neither callback mode is selected, it shows the two valid variable-name
choices. A conflict between modes is reported without displaying either URL
or the private route file. It makes **zero network requests** and never
creates or sends an invoice. Configure values privately in the operator's
terminal, not in source control, a screenshot or a chat message.

A result of `configuration_present_not_verified` means only that local
values are present and have basic safe text shapes. It does not prove the
callback exists, the collector is listening or that PayPal recognizes the
Sandbox app. Continue with Stage 0A and the existing authenticated Stage 0
preflight below before creating any invoice. A blocked result must not be
used to skip those gates.

## Stage 0A: prepare a genuine paid-webhook receiver before invoice creation

A verified webhook must originate from a **real paid Sandbox invoice**, not the PayPal Webhooks Simulator. A locally forwarded webhook cannot arrive directly at `localhost`, so an operator must deliberately supply a public HTTPS:443 forwarding endpoint or use an already-approved hosted listener. The collector below **does not** create a tunnel, register a PayPal callback, change an account, or contact PayPal. This is an optional capture method when the application webhook receiver is not yet publicly deployed.

**Before Stage 1**, launch a one-shot localhost capture in a dedicated terminal:

```bash
pnpm sandbox:acceptance:webhook:capture -- --port 8788
```

It listens only on `127.0.0.1:8788`. It prints an ignored, private `privateRouteFile` under `.data/sandbox-webhook-capture/run-*/private-route.txt`, not the random route string itself. It also writes `private-local-origin.txt` in that same ignored run folder, containing only the loopback address and port. The preflight uses that local file to verify the collector is still responding, without contacting the forwarding service or exposing the callback. Open that file locally. Configure a separately approved public HTTPS:443 forwarding service that preserves the original POST body and all `paypal-*` headers, forwarding to that localhost port. In the same PayPal Sandbox REST app used to create invoices, register the **exact** full external HTTPS callback URL made by joining the public forwarding origin with the private route path. Subscribe to `INVOICING.INVOICE.PAID`. Do not paste the route, signature or captured body into GitHub, screenshots, logs or chat. A stable public forwarding URL must be registered before invoice creation so the Stage 0 preflight can succeed.

The capture listener uses a freshly generated 192-bit path, a bounded 131,072-byte request body, strict Sandbox certificate-header shapes, one-shot file writing and owner-only local permissions where available. It accepts only correctly invoice-bound paid events and returns a successful HTTP response after saving the raw payload. Unrelated invoice or nonfinal payment events are acknowledged but ignored. It stops after one matching capture or a 30-minute timeout. Restarting creates a new route, which must be re-registered if the earlier route expired. The private path helps limit unsolicited traffic, but **does not authenticate PayPal**.


If an already-approved hosted RightsReceipt HTTPS webhook listener is available, the one-shot local collector is optional. In either case the webhook registration must be in the same Sandbox REST app and exist **before** the Stage 0 registration check. For the local collector, finish this setup before running Stage 0, then leave the listener running until the invoice is paid and the event is captured.

## Stage 0: confirm the registered paid webhook belongs to this same Sandbox app

Before creating an invoice, configure PAYPAL_SANDBOX_WEBHOOK_ID for the webhook
registered under **the same REST application and client ID used to create invoices**.
The registration must subscribe to INVOICING.INVOICE.PAID (or all events) and have a
public HTTPS listener URL. A localhost address, test documentation hostname,
different app's webhook ID, or PayPal simulator-only WEBHOOK_ID cannot qualify.

**Exact current listener requirement (Turns 095 and 097):** PayPal must have registered the same callback that is currently listening. Two mutually exclusive configurations are supported:

- **Hosted listener or explicit callback:** Set `PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL` to the full registered HTTPS callback URL.
- **One-shot local collector, safer option:** Set `PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN` to the approved public HTTPS forwarding origin (for example, `https://your-approved-domain.example`) and `PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE` to the current `privateRouteFile` returned by `sandbox:acceptance:webhook:capture`. Do **not** set `PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL` at the same time. The application reads the private 192-bit route from its existing file and builds the full callback internally. It never prints the combined URL.

For both modes, Stage 0 and Stage 1 check PayPal's authenticated webhook registration for an exact match before creating an invoice. In the **one-shot collector file mode**, Stage 0 and Stage 1 first send a read-only `HEAD` request to the exact private callback route at the locally recorded `127.0.0.1` port. The collector responds with a fixed `204` readiness marker without claiming a webhook, changing its invoice binding or consuming its one-shot capture slot. A stopped, expired, wrong-route or impersonating local listener fails closed **before OAuth or invoice creation**. This checks only local liveness, not that the approved public HTTPS forwarder can reach the collector. Restarting the collector generates a new route, so the registered webhook callback must be updated before re-running Stage 0. The file mode rejects missing files, symlinks, malformed routes, unexpected locations and conflicting settings **before contacting PayPal**. Only a fixed, sanitized status/error is returned. Do not paste the private route into source control, shell history or screenshots. The callback check cannot prove that the external forwarding service is reachable or that PayPal delivered a signed event.

Run the explicit read-only preflight. For a hosted callback it makes only
Sandbox OAuth and an authenticated GET of the app's registered webhooks.
For the one-shot collector it first makes a localhost-only HEAD liveness request:

```bash
pnpm sandbox:acceptance:webhook:preflight
```

**For the one-shot collector, use the stronger public forwarding check before creating an invoice:**

```powershell
node .\scripts\sandbox-webhook-preflight.mjs --probe-public
```

The `--probe-public` option first checks the local private route, then sends one credential-free `HEAD` to the exact derived public HTTPS callback. It rejects redirect responses, wrong paths, missing readiness markers and transport failures **before requesting PayPal OAuth**. If it succeeds, the same invocation also authenticates to PayPal and verifies the webhook registration. Require `localCollectorReady: true`, `publicForwarderReady: true` and `exactCallbackChecked: true`. Leave the collector and forwarder running afterward. This proves current forwarding of a harmless readiness probe only, not signed PayPal event delivery or future availability. It is supported only for the one-shot collector; hosted listeners continue to use the ordinary command above.

This prints a sanitized result containing only status, the expected event type,
a hash of the registered webhook ID, and `exactCallbackChecked: true` when the exact current URL matches. In one-shot collector mode it also reports `localCollectorReady: true`. For hosted mode this field is `null`. Neither status means the public forwarder is reachable or a genuine signed webhook has arrived. It does not print OAuth tokens, secrets,
the registered listener URL, or buyer/merchant details. It does not register,
change or delete a webhook, issue invoices, collect payments or send test events.
A failure blocks the genuine acceptance path until the app's webhook
registration or subscription is corrected.

Stage 1 **repeats this preflight automatically before creating any invoice**.
For a valid registration, PayPal's list is authenticated with the exact same
server-side client ID and secret that the invoice adapter subsequently uses.
This prevents sending an invoice that cannot produce the required paid webhook
because the ID belongs to a different REST app. This test verifies only
registration metadata, not HTTPS reachability, actual event delivery,
a real transaction or PayPal's signature.

A genuine PayPal invoicing webhook must be delivered to a public HTTPS
listener on port 443, which may be a separately approved hosted endpoint or
trusted HTTPS forwarding service. The loopback-only local judge console is not
a public webhook destination. After a real delivery, the existing private
capture-and-verify process below still applies.

The PayPal Webhooks Simulator sends mock events unrelated to your REST app.
These do not validate with the genuine
`verify-webhook-signature` API, and cannot satisfy the release gate.
See [PayPal invoicing webhook troubleshooting](https://developer.paypal.com/invoicing/troubleshooting)
and [Webhooks integration](https://developer.paypal.com/api/rest/webhooks/rest/).

## Stage 1: create, send and retrieve

Run:

```bash
pnpm sandbox:acceptance:create
```

The harness creates a fresh version-bound canonical transaction with:

- amount: USD 425.00;
- one accepted rights summary;
- fresh case/asset/terms/quote/creator-decision/buyer-acceptance identifiers;
- a stable request ID for the one creation operation.

It calls the existing `createPayPalSandboxInvoiceAdapter`, not a separate curl implementation.

Expected result:

- An authenticated preflight verifies the configured webhook ID belongs to this same Sandbox app and subscribes to the paid invoice event;
- OAuth succeeds;
- PayPal creates a DRAFT invoice;
- RightsReceipt binds the provider ID;
- RightsReceipt sends exactly that invoice;
- an authenticated GET observes the current state, normally UNPAID after send;
- a PayPal-hosted payment URL is present when the state is payable.

Output:

```text
.data/paypal-sandbox-acceptance/run-*/
  evidence.json
  state.json
  sandbox-payment-link.txt
```

`evidence.json` is sanitized. `state.json` is private restart material and must never be committed.

**Private output path verification (Turn 143):** The optional `--output DIRECTORY` must resolve physically to the ignored `.data` directory or to a directory outside the private source checkout. Before contacting PayPal or creating any run folder, the harness resolves existing parent directories and planned missing path segments to reject symlinks and Windows directory junctions that point back into tracked source. It checks again after creating the output base. A redirected destination fails as `unsafe_private_path` before OAuth or any provider request, without writing state, evidence or buyer handoff files to source control. An ordinary real directory outside the checkout remains supported. Keep all private state and payer links out of public source even when choosing a custom output path.

**Private buyer handoff:** After a successful payable invoice GET, the command now prints a `handoffPath` pointing to `sandbox-payment-link.txt`. This file contains only the PayPal Sandbox recipient-view URL, is written once with owner-only file permissions where supported, and remains under ignored `.data`. The URL itself is **never** printed by the command, copied into `evidence.json`, or stored in `state.json`. Treat it as a private payment-access link and do not paste it into GitHub, chat, a YouTube recording, screenshots, or the public submission.

**Do not pay yet.** If using the one-shot collector, finish Stage 1.5 exact-invoice binding first, then proceed to Stage 2. A hosted HTTPS listener must likewise be receiving before payment.

Open the file locally to retrieve the URL, then open that validated Sandbox PayPal URL in a browser and sign in using the **personal Sandbox buyer** account, not the business merchant account. On Windows PowerShell you can use `Start-Process ((Get-Content -Raw 'PATH_PRINTED_AS_handoffPath').Trim())` after replacing the placeholder with the private path. Do not run this command with a production PayPal URL. The source is PayPal's authenticated invoice GET, and only the strict `www.sandbox.paypal.com` invoicing path is accepted. The file is an operational handoff, **not** payment evidence.


## Stage 1.5: bind the collector to the original sent invoice before payment

This step applies when using the optional one-shot local collector. If a separate deployed HTTPS listener is already receiving and verifying genuine paid webhooks, confirm that listener's readiness and proceed to Stage 2 instead.

**After Stage 1 succeeds and before the personal Sandbox buyer pays, bind the collector to that exact invoice.** Keep the collector running. Use the private `privateRouteFile` printed by the collector and the private `statePath` printed by `sandbox:acceptance:create`:

```bash
pnpm sandbox:acceptance:webhook:bind -- --route-file .data/sandbox-webhook-capture/run-.../private-route.txt --state .data/paypal-sandbox-acceptance/run-.../state.json
```

This is an entirely local operation. It requires the original invoice state to be `sent_checked` with a confirmed send journal and matching invoice binding, then exclusively creates `invoice-binding.json` in the collector's private run directory. No invoice ID, private route or PayPal credentials are printed. The command is intentionally one-time per capture run. If the invoice changes, restart the collector, register the new private URL before the next attempt, and bind a fresh run rather than editing the binding by hand.

**Until the binding file exists, the collector returns HTTP 503 for a paid event without storing or claiming it.** After binding, only a paid event referencing the exact original invoice can consume its one capture slot. Paid events for another invoice, partial payment or pending status are acknowledged as ignored. PayPal retries non-2xx deliveries, but the clean path is to bind before paying. Transmission timestamps are screened against the same limits already used by RightsReceipt's independent PayPal webhook verifier: up to 259,500,000 milliseconds in the past (three days plus five minutes) and no more than five minutes in the future. This permits delayed provider retries without treating the captured event as authenticated. Malformed or noncanonical UTC timestamps still fail. Keep the computer clock accurate and run the separate PayPal signature verification promptly. Structural checks and invoice matching are not proof of authenticity.

**Timestamp precision compatibility (Turn 123):** The collector and the independently authenticated handler accept canonical UTC `Z` timestamps with zero through nine fractional-second digits. Calendar-invalid dates, alternate offsets and precision beyond nine digits still fail. The extra fractional digits are retained unchanged in the private capture and in the PayPal signature-verification postback. JavaScript date comparisons operate at millisecond granularity; the existing three-day retry and five-minute future limits remain in place. This is a defensive format-compatibility change, not evidence that a particular real PayPal delivery uses a higher precision or that any webhook was verified.

Once the exact invoice is bound, continue to Stage 2 and pay as the personal Sandbox buyer while the collector and public forwarding are running. On receipt, the collector prints only a local `capturePath` for `capture.json` with status `captured_unverified`. The file includes the exact original UTF-8 JSON text and the five PayPal transmission headers required by the existing verifier. It may contain buyer or transaction data and a signature, so it must remain inside ignored `.data` or another private directory. It is **not** public evidence and must not be published.

**Terminal capture safety (Turn 074):** A collector that has timed out, been closed or completed is permanently unavailable. It must not accept another HTTP request or write `capture.json` after reporting a terminal outcome. The HTTP handler checks this both at entry and after an asynchronous body read; late requests receive HTTP 410. If the collector expires before the correct invoice is paid, start a fresh collector, configure/register its new private callback and bind that new run to the invoice before continuing. Never treat an expired run's file or an unverified event as settlement proof.

**Retry-window alignment (Turn 075):** PayPal may retry failed webhook notifications for up to three days, so the unverified capture step no longer discards a potentially valid replay merely because its original transmission time is more than five minutes old. The timestamp helper uses exactly the already-implemented verifier's old-event and future-skew bounds. It does **not** make a delayed event authentic or prove a paid settlement. The existing authenticated `verify-webhook-signature` postback, exact invoice binding, and independent financial GET remain mandatory. The collector still terminates on its configured one-shot timeout; the three-day retry policy does not keep a local listener running for three days.

## Stage 2: pay through PayPal Sandbox and recheck

**Stop before payment:** If using the local one-shot collector, Stage 0A must be running, the same-app public HTTPS webhook must be registered, and Stage 1.5 must have written the exact-invoice binding. Do not pay an unbound invoice and hope the webhook can be captured later. A separately deployed HTTPS listener must also be ready before payment.

Use the Sandbox personal buyer to pay through the PayPal-hosted link from the real workflow.

Then run:

```bash
pnpm sandbox:acceptance:check -- --state .data/paypal-sandbox-acceptance/run-.../state.json
```

If the invoice remains UNPAID, the `check` command writes a **new** private `handoffPath` using the current authenticated GET result. It now reports `status: "payment_pending"`, `errorCode: "buyer_payment_pending"` and a nonzero CLI exit until payment is independently verified. This is an expected waiting state, not proof of a broken API call. It does not create another invoice or resend the existing one. A PAID, refunded, draft or unknown invoice does not produce a payment link. Never retry `create` to recover a missing payer URL for an already-created invoice; use `check --state` instead.

A successful paid result requires the authenticated invoice GET to contain financial details that satisfy the existing settlement validator:

- provider status PAID;
- paid total exactly USD 425.00;
- due amount zero;
- recognized PayPal payment transaction detail;
- no conflicting refund or conditional amount.

A status label by itself is not accepted as payment evidence.

**Turn 136 release guard:** The Stage 2 command itself now reports `passed` only when the authenticated GET includes the complete matching financial settlement above. A `PAID` label with missing or contradictory transaction details reports `status: "failed"` and `errorCode: "settlement_not_proven"` instead of passing an intermediate stage. The final three-record evidence reconciliation continues to check the independent paid record and same-invoice webhook. Do not proceed to a paid claim while Stage 2 is pending or failed.

## Stage 3: verify a genuine invoicing webhook

The strongest acceptance path is the deployed RightsReceipt Sandbox webhook route because it verifies and persists the actual incoming event directly.

The CLI also supports independent verification of a privately captured genuine webhook request, after the authenticated Stage 2 paid GET. Use the `capturePath` printed by the one-shot collector. The capture must remain under `.data` or outside the repository. When verified, stop the temporary HTTPS forwarder and unregister only the temporary webhook if it is no longer needed.

Capture format:

```json
{
  "schemaVersion": "rightsreceipt-paypal-webhook-capture-v1",
  "headers": {
    "paypal-transmission-id": "...",
    "paypal-transmission-time": "...",
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api-m.sandbox.paypal.com/v1/notifications/certs/CERT-...",
    "paypal-transmission-sig": "..."
  },
  "body": "{...exact raw JSON from PayPal...}"
}
```

Verify it:

```bash
pnpm sandbox:acceptance:webhook -- \
  --capture .data/sandbox-webhook-capture/run-.../capture.json \
  --state .data/paypal-sandbox-acceptance/run-.../state.json
```

The `--state` argument is mandatory for the CLI acceptance stage. It binds the signature-verified event to the exact saved invoice created in Stage 1. This command reports `passed` only when the verified event is `INVOICING.INVOICE.PAID`, its resource status is exactly `PAID`, and its invoice ID matches that private state. PayPal can also use the PAID event type for pending or partial payment, so a valid signature or event name alone is insufficient. The command rejects those cases with `webhook_not_paid`, rejects a mismatched invoice with `invoice_mismatch`, and rejects a missing state with `state_required` before making any provider request. Stage 2's authenticated paid-status and transaction detail check is still independently required.

The published evidence includes:

- event type;
- invoice ID;
- provider resource status;
- payload SHA-256;
- hashes of event/transmission IDs;
- verification result;
- sanitized PayPal API call metadata.

It does not include the signature, OAuth token, buyer data or raw webhook.

**Redirect safety (Turn 082):** The acceptance harness uses `redirect: "manual"` for every credential-bearing Sandbox REST request, not just the read-only webhook registration preflight. HTTP 3xx, opaque redirect responses, a followed redirect or a response claiming a different URL fails the request. This prevents a redirect from silently forwarding OAuth credentials, authorization tokens or invoice operations to production PayPal or another origin. A rejected invoice-send response may still represent an *unknown provider outcome*, so use the existing read-only reconciliation procedure instead of blindly resending. This is transport hardening, not evidence that a real Sandbox payment occurred.

## Stage 4: reconcile sanitized evidence

After a real Sandbox buyer has paid and a genuine invoicing webhook has been verified, reconcile the three separate sanitized records. Use the `evidence.json` from each run, not the private state or raw webhook capture:

```bash
pnpm sandbox:acceptance:evidence:check -- \
  --create .data/paypal-sandbox-acceptance/run-CREATE/evidence.json \
  --paid .data/paypal-sandbox-acceptance/run-CHECK/evidence.json \
  --webhook .data/paypal-sandbox-acceptance/run-WEBHOOK/evidence.json
```

The command is read-only and makes **no network, payment or PayPal API calls**. It requires the same exact Sandbox invoice ID in all three stages; a DRAFT creation, explicit send and authenticated payable handoff; an independent paid financial conclusion for USD 425.00 with zero due/refunded balance; and a verified PAID webhook bound to the same invoice. It also checks sanitized PayPal API call metadata, required evidence hashes and the absence of obvious sensitive fields. **Turn 076 adds cross-stage linkage:** creation must record a successful same-app paid-webhook registration, the saved invoice-state SHA-256 from creation must match the authenticated later paid-status read, and the webhook ID SHA-256 used for signature verification must match the webhook registered under the original invoicing app. An old or mixed evidence bundle lacking these fields fails closed. A successful output contains only an invoice-ID SHA-256, a result and a limitation notice; it never prints the evidence body or private paths.

**Important:** These hashes link private local acceptance records without exposing the invoice-state bytes or the webhook ID. They do not prove the authenticity of any of the JSON files, that the registered webhook was reachable, or that a transaction settled. Use the genuine PayPal signature postback, authoritative paid invoice GET and original private evidence together. An older v1 acceptance file without the new hashes must be regenerated from real Sandbox operations, not edited by hand to appear passing.

**Important:** A pass is an *internal consistency check*, not proof that the files actually came from PayPal. These files can be fabricated. Keep the original genuine Sandbox API, payment and webhook evidence and use the deployed application as the authoritative acceptance path. This checker does not close Gate C on its own.

Run the offline regression with:

```bash
pnpm sandbox:acceptance:evidence:verify
```

## Local regression

No PayPal account is needed to test the harness itself:

```bash
pnpm sandbox:acceptance:verify
pnpm sandbox:acceptance:webhook:preflight:verify
pnpm sandbox:acceptance:webhook:capture:verify
```

The acceptance regression is also included in `pnpm paypal:verify`.

It exercises:

- DRAFT creation;
- send transition;
- UNPAID hosted handoff;
- restart-safe state restoration;
- later PAID financial verification;
- webhook postback verification;
- invoice matching;
- secret/buyer-data redaction;
- fail-closed missing configuration.

## Release evidence decision

Gate C can be considered externally demonstrated only when the release archive contains all of the following from Sandbox:

- successful create/send/status evidence for one invoice;
- evidence that the buyer paid through the hosted Sandbox experience;
- a later authenticated GET concluding `paid`;
- one genuine invoicing webhook verified with the registered webhook ID.

The PayPal webhook simulator is useful for development but is not a substitute for this evidence.

