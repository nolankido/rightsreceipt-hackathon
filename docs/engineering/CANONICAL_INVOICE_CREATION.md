# Canonical invoice reservation and provider binding

Management slot 032, P0 integration recovery. Base: `e1d43ad22137ade671cc491c2a6aa2aa6d048976`.

## Scope and authority

The optional AG Studio turn remains deferred. This implementation connects the durable human decisions from slot 031 to the existing Sandbox draft adapter. It reserves canonical `payment_operations` and `invoice_bindings` records, claims one external creation attempt, preserves a returned provider ID, and atomically completes the canonical draft binding. It does not send invoices, move money, activate permissions, or create receipt revisions.

`createSandboxInvoiceCreation` is server-only and requires an explicit enabled flag, Sandbox/judge mode, Sandbox payment configuration, a database, a supplied transport and a real creator authorizer. No HTTP endpoint, implicit global fetch, Worker route, deployment or schedule is added. Configuration remains disabled. There is still no implemented creator login/session system; an injected test authorizer is not a login.

## Revalidate the accepted deal

The extracted `verifyAcceptedInvoiceSnapshot` reuses the existing terms, policy, deterministic quote and human-audit validation before reservation, dispatch and binding. The original unreserved `prepareInvoice` method retains its billing-lock restriction. A reservation is not a way to bypass explicit approval or buyer acceptance.

The command fingerprint binds the full accepted invoice snapshot and the trusted app/merchant identity. Only the fingerprint, stable request key, identifiers and safe results persist in operation/audit records. Raw recipient details remain in the existing private request record, not the new audit payload. A changed recipient, asset fingerprint, consent tuple, quote or merchant/app identity cannot reuse the reservation.

Current creator authority is checked repeatedly. The final database guard compares the entire consent and operation snapshot. Existing consent commands already reject any started billing operation or binding. Direct privileged database edits occurring during a provider request prevent canonical finalization; a returned candidate reference is still retained for investigation. Database atomicity does not extend across an external network or identity provider.

## State and transaction sequence

1. **Reserve, with no network:** an exact-snapshot audit insert, canonical pending creation operation, create-pending invoice binding, optional random public verification reference and case pointer/revision update commit together. Existing opaque verification references are reused; internal UUIDs are rejected. Replay of the accepted deal returns the same operation and binding.
2. **Claim before dispatch:** an audit and operation update atomically change `pending/attempt_count=0` to `unknown/attempt_count=1`. The operation is durably uncertain before the external attempt. Competing callers cannot claim it again. A lost claim acknowledgement does not authorize a POST.
3. **Observe:** validate the trusted adapter response against the exact amount, currency, licensing IDs and Sandbox/DRAFT markers. Persist its provider reference and a redacted audit before final consent/session revalidation. This does not yet bind the invoice or confer payment authority.
4. **Bind:** reload the exact current source, validate retained consent and authorization, then atomically append the binding audit, complete the operation, store the provider ID on the canonical draft binding and advance the case revision. A provider ID already attached to another case cannot be reassigned. Later creation replays do not reset a paid/sent/canceled invoice back to draft.

The first write in every source-sensitive batch is an audit INSERT with a NOT NULL guarded case lookup. If the source changed, the batch aborts rather than silently accepting a zero-row UPDATE. Unique case bindings, operation keys and audit keys prevent forks and duplicates. Existing schema version 8 and all 31 tables are unchanged.

## Honest recovery limits

A retained successful response can finish local binding after a process restart or failed final write without another creation call. Lost acknowledgements are resolved through stored state. Failures at reservation, dispatch, candidate-save and final-binding transaction steps are tested.

**Unknown creation is not automatically retried.** A crash after dispatch claiming but before POST, a timeout with no saved ID, a malformed response or unavailable candidate persistence leaves an operation requiring reconciliation. The service does not reset its attempt counter or invent a new request key, even after a long delay. This intentionally favors avoiding duplicate invoices over automatic availability. Provider invoice-number lookup/manual operator resolution for unknown-ID cases is not implemented here. No user intervention is requested by this turn.

There is one claimed adapter invocation. The existing adapter's bounded authentication-refresh retry after an explicit HTTP 401 remains; ambiguous transport outcomes are not retried by the coordinator. No unlimited external exactly-once guarantee is claimed, and no undocumented PayPal idempotency-retention period is assumed.

## Two compatibility repairs

The previous prepared key used `rr_` plus 40 hexadecimal characters, totaling 43. The canonical helper now uses 32 hexadecimal characters plus the prefix, totaling 35 and remaining deterministic across retries. This fits the documented 38-character guidance. The existing generic adapter validator is not silently changed for unrelated callers.

The Sandbox draft adapter now requests `Prefer: return=representation` and supports both full `id` responses and minimal `self`/`GET` references. Every accepted link must be the exact Sandbox API invoice path with a valid invoice ID. Live hosts, look-alike hosts, query strings, fragments, encoded separators, send links and conflicting IDs fail closed. Response URLs are parsed only; none is fetched. Creation remains distinct from sending and does not establish settled payment.

## Executed verification

Node 22.16.0, native SQLite and the actual eight original migrations:

```text
New invoice reservation/dispatch/persistence/composition/transport tests: 94 passed.
Unchanged human-consent regressions: 100 passed.
Earlier fake/configuration adapter regressions: 22 passed.
Earlier OAuth/draft regressions: 27 passed.
Combined native run: 243 passed, 0 failed, 0 skipped.
Strict standalone TypeScript 5.8.3: passed with real source dependencies, no stubs.
```

The new tests execute actual approval and acceptance commands before invoice operations. They include 100 replay iterations, eight competing reservers/executors, complete transaction-failure matrices, lost acknowledgements, file-backed restart, late authorization/consent changes, merchant and invoice collisions, private-data checks and default-off construction. Three tests run the real OAuth/draft transport against injected HTTP responses for full/minimal/link-array shapes; hostile link forms are separate regressions. No test issues a live request.

All eight migration Git hashes match the reviewed baseline. Original runtime/type dependencies were restored and hash-checked. Source/schema tests include the original full 31-table consent harness, not simplified parents. The original seed/reset command, complete historical financial/receipt/clock suites, installed monorepo build, network browser flow, live Cloudflare D1 and genuine Sandbox transactions were not run. Turn 007 and Gates A/B/C remain open.

## Commands and next integration

```text
npm run invoice:creation:verify
npm run invoice:creation:typecheck
```

The new native suite is included in root verification commands. The optional sponsor agent and dashboard remain deferred. Next P0 work: adopt the canonical draft in the durable send journal and connect explicit authorized sending, then finish real creator-session/browser integration before enabling any public payment action. This turn does not mark that send/login/UI work complete.

Official references reviewed October 27, 2026:

- https://developer.paypal.com/api/rest/reference/idempotency/
- https://developer.paypal.com/api/invoicing/v2/invoices-create/
- https://developer.paypal.com/api/invoicing/
