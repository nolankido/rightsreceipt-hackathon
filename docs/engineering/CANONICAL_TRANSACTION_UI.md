# Canonical transaction screens and invoice controls

Turn 035 connects the creator review, buyer acceptance and existing durable Sandbox invoice services. It does not enable a deployment or establish live PayPal evidence. All runtime flags remain off.

## Product behavior

The creator reviews the twelve material rights, licensing dates and deterministic itemized USD quote. A creator decision is recorded only after explicit confirmation. A buyer with a current review capability sees the same canonical offer and separately accepts its exact version. The creator can then create a Sandbox draft and, after another unchecked confirmation, send that exact invoice.

Every successful command reloads current server records. Approval, acceptance, draft creation and delivery remain separate actions. Their results explicitly report no payment confirmation and no permission grant. This screen does not expose a persisted or replayed payment link. The verified financial lifecycle and receipt services retain their separate authority.

## Route contract

| Route | Authority and behavior |
| --- | --- |
| `GET /creator/review/:caseId` | Managed creator assertion and SQL workspace ownership; existing offer review plus new invoice controls |
| `GET /buyer/review` | Public page shell; private data requires a review capability |
| `GET /api/consent/buyer/review` | Current, unrevoked review capability in a Bearer header |
| `POST /api/consent/buyer/accept` | Exact reviewed case/terms/quote/decision/hash, versioned copy and explicit acknowledgement |
| `GET /api/invoices/creator/cases/:caseId` | Authenticated current invoice metadata; no provider operation or durable reservation |
| `POST /api/invoices/creator/cases/:caseId/create` | Exact `{ expectedCaseVersion, confirmed: true }`; reserve and execute the canonical draft operation |
| `POST /api/invoices/creator/cases/:caseId/send` | Exact `{ expectedCaseVersion, invoiceId, confirmed: true }`; reserve and execute explicit delivery |

The invoice GET returns `invoice-controls-v1`, the Sandbox environment, case revision, offer stage, safe invoice reference/status, and advisory `canCreate`/`canSend` flags. It includes no buyer email, merchant email, raw source snapshot, credentials or provider response. Action flags require valid pure transport configuration; evaluating configuration does not make an HTTP request. Commands independently revalidate all authority and source requirements.

`createTransactionRoutes` is shared by the deployed Worker source and the integrated browser harness. The factory constructs route instances once, preserving their per-isolate limits. Creator authentication is bound to each request and environment. Buyer routes do not invoke creator authentication. Existing public verification, receipt and webhook routing remains separate.

## Request and authorization controls

Invoice mutations require the exact configured HTTPS Origin. Conflicting Origin or Fetch Metadata values are rejected. The creator and human-consent origins must agree. JSON commands reject unknown or duplicate decoded keys, wrong content types, compressed bodies, invalid UTF-8 and bodies exceeding 4 KiB. Rate bounds and no-store/no-referrer/security headers apply to the native routes.

The draft adapter now rechecks canonical dispatch authorization after OAuth acquisition and immediately before every invoice POST, including its bounded explicit-401 refresh attempt. The canonical factory always supplies this guard. It binds the original creator principal, accepted request, claimed operation and exact persisted state. Standalone injected-adapter compatibility does not create a permissive path through the canonical factory.

Both creation and sending also recheck the same principal after the final asynchronous source read. Revocation during that read cannot authorize the subsequent provider POST. Focused regression witnesses revert only that ordering in an isolated test copy: each reproduces an unauthorized POST, while the corrected implementation sends none.

These are local request and dispatch checks. They do not replace managed Access ingress policy, upstream logout/revocation behavior, distributed edge limits or deployed D1 verification.

## Browser privacy, freshness and retries

The buyer entry supports `/buyer/review#<review-capability>` and a private code entry field. JavaScript removes the fragment with `history.replaceState` before its first data request. The capability stays in a closure, is sent only in the Authorization header and is never saved in browser storage. Buyer fetches omit cookies; creator fetches use same-origin managed cookies without exposing an assertion to JavaScript.

Both clients validate all twelve material rights, required identifiers, version/hash, exact consent copy, itemized sum and UTC date arithmetic before enabling actions. Text is inserted with `textContent`. Missing or malformed material values disable the action rather than display an apparently valid incomplete offer.

A review lasts at most five minutes and, for a creator, no longer than the remaining managed session. Expiry, hidden pages, navigation and restored history invalidate the response generation, abort pending reads and clear private content. A late successful response cannot repopulate an expired page or trigger another action. Clearing a page does not undo a command already committed by the server.

An uncertain response preserves the exact command for a deliberate retry. The existing durable service claim prevents a new draft or repeated send. Reloading reads saved state without calling PayPal. Unknown provider outcomes keep new action flags disabled; they do not reset a claimed operation into an automatic dispatch. Operator recovery for unknown external outcomes remains separate work.

## Configuration

`BUYER_REVIEW_ENABLED` and `RIGHTS_INVOICE_CONTROLS_ENABLED` are new default-off flags. Existing consent, creator session, creation and sending flags remain required independently. `PAYPAL_SANDBOX_MERCHANT_NAME` and `PAYPAL_SANDBOX_MERCHANT_EMAIL` are blank server configuration values. No credential or account identity is installed by this turn.

Before eventual enabling, protect all creator ingress, including `/api/invoices/creator/*`, using the same managed Access policy. Keep `/buyer/review`, its script and `/api/consent/buyer/*` outside creator login. Sandbox merchant configuration must match the intended Sandbox account. All existing credential, webhook, financial and receipt gates still apply.

## Reproduce the local checks

With the project's supported Node 22 runtime:

```bash
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/consent-ts-test-loader.mjs scripts/invoice-controls-local.test.mjs
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/consent-ts-test-loader.mjs scripts/transaction-routes-local.test.mjs
```

`pnpm transaction:verify` runs those two collections. `pnpm transaction:typecheck` checks the native transaction composition and its actual dependency sources. It does not typecheck the full Hono/React monorepo without the pinned installation.

For browser verification, provide Playwright and an installed Chromium browser, then run `pnpm transaction:browser`. Optional `RR_PLAYWRIGHT_MODULE`, `RR_CHROMIUM` and `RR_TRANSACTION_ARTIFACTS` select the local test dependencies and output directory. The harness routes Chromium HTTPS requests into the actual native handlers and SQLite stores. Only the Access gateway/public signing-key replies and provider HTTP are injected. It binds no socket and makes no genuine provider request.

The eight scenarios cover the full approval-to-delivery path, uncertain response recovery, stale buyer offers, stale creator invoice versions, creator/buyer isolation, late buyer responses, late creator responses and private lifecycle clearing. An independent offline creator harness also preserves the prior UI checks and adds malformed-view and late-response regressions.

Executed counts and limitations are recorded in [Turn 035](../turns/035-p0-canonical-transaction-ui.md) and its evidence files. Chromium interception supplies real browser Origin but does not expose Fetch Metadata in this runtime; native HTTP tests cover its rejection behavior. The browser fixture is not a live login, listening server, deployed Worker/D1, Sandbox invoice, payment or refund.

## Follow-up integration

[Turn 036](BUYER_PAYMENT_HANDOFF.md) adds the capability-authorized payment handoff, current receipt/status navigation and local browser financial/receipt continuity. Its status and handoff handlers remain separate from financial authority. Complete the pinned clean install/build and genuine managed-session, Sandbox webhook/payment/refund and deployed D1 acceptance before claiming release readiness. Persisted clarification answers and safe operator recovery remain incomplete. Optional dashboards and sponsor features stay deferred.
