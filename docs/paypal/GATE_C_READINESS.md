# Gate C: PayPal integration readiness audit

**Reviewed:** October 27, 2026 HST
**Base commit:** 84326e396b762dc7e8d72a71d971eac7c0d54a52
**Audit and repairs:** Completed locally.
**Gate decision:** **BLOCKED.** No genuine end-to-end PayPal Sandbox evidence or deployed browser acceptance exists.

## Findings repaired

### GC-01: Competing recovery consumers could skip financial processing

The status-only reconciler and permission lifecycle used the same reconciliation outbox. A successful status-only PAID read wrote a `financial_review_required` receipt and acknowledged the generation. A later lifecycle call then returned `not_ready`, with no permission created. Reproduced against the real recovery store, real lifecycle service/store and all seven original SQL migrations.

The server recovery entry point now selects exactly one consumer. With both `PAYPAL_RECONCILIATION_ENABLED=true` and `PAYPAL_PERMISSION_LIFECYCLE_ENABLED=true`, the bounded batch is processed by the financial lifecycle. Both stores are composed from the same database binding. The status-only branch is not run before or after it. With lifecycle disabled, behavior remains explicitly status-only.

Financial mode requires the local assessed settlement object delivered by the trusted, content-validating invoice reader. Missing or cloned assessment objects block the generation; they never fall back to status-only acknowledgement. Invalid lifecycle flag values fail before database or provider I/O. The underlying library functions remain internal building blocks, not separately scheduled consumers.

This does not repair already-consumed historical work automatically. An authorized status-only retry queues a new generation; the regression scenario proves that recovery path. No database edits or resend are required.

### GC-02: Financial recovery hid permanent provider failures

The lifecycle service previously labeled every thrown provider read as `transport_unavailable`. Authentication rejection, mismatched invoice identity, unsafe payment links and missing bindings were therefore retried as if they were network faults, losing the actionable failure code. Rate limiting also received the shorter generic network delay.

The service now preserves an explicit safe error-code allowlist, blocks permanent failures and retries only transport, rate-limit or state-change failures. Rate-limit retries begin at 60 seconds, other retryable failures at 30 seconds, with exponential delays and the existing five-attempt limit. Provider messages, bodies and secrets are not returned or stored.

Nine targeted tests failed against the original lifecycle implementation: eight permanent-error classifications and the rate-limit deadline. All nine pass after the repair.

## Integration evidence added

`scripts/gate-c-integration-local.test.mjs` runs 48 tests using Node SQLite. Unlike the earlier focused lifecycle fixture, it executes all seven checked-in migrations, the real judge seed/reset SQL, the real lease/recovery store, the real financial assessment, and the real permission lifecycle service/store. It does not substitute simplified parent-table schemas or a fake recovery port.

The seven original migration files and seed are checked against their audited Git blob hashes. New future migrations can be added without rewriting those originals. This audit changes no existing migration, schema version or table.

Observed results:

| Check | Evidence |
| --- | --- |
| Full schema | All seven migrations applied transactionally; 31 domain tables plus migration ledger |
| Migration replay | A second run skipped the already recorded hashes |
| Integrity | `integrity_check=ok`; no `foreign_key_check` violations |
| Financial integration | Scheduled, active, expired, canceled, partial-review, full refund and creator revocation |
| Recovery | Real queue leases, transient retry, permanent block, explicit retry and missed-webhook sweep |
| Concurrent workers | One completion/evidence set under competing consumers |
| In-flight change | New notification generation or changed consent prevents stale financial completion |
| Atomicity | Injected failure at each of nine completion writes rolls back every financial change |
| Crash/restart | Lost acknowledgements and reopened file-backed databases preserve correct completion/retry state |
| Reset | Original seed SQL clears financial child records and reseeds deterministically |
| Receipt boundary | Verification stays invalid and rights receipt count remains zero |
| Network | Global fetch is prohibited by the offline integration test |

Native test environment: Node 22.16.0 and standalone TypeScript 5.8.3. The new suite has **48 passing tests**, zero failures. The earlier configuration/fake and OAuth/draft suites were also rerun: **97 total executed passes**, zero failures (48 + 22 + 27). Strict checking of the modified source and its actual recovered internal dependencies passed with no temporary type stubs. JavaScript syntax and changed-file formatting checks passed.

These are tests of integrated application logic with injected provider views. They are not an HTTP/Hono/browser end-to-end run, a PayPal signature test, a deployed Worker test, or a live D1/Sandbox result. The existing `scripts/db-local.mjs` command itself and the full historical payment regression collection were not executed in this isolated checkout. All SQL migrations and the original seed did execute through the new audit harness.

## End-to-end readiness matrix

| Boundary | Current result | Required before Gate C can pass |
| --- | --- | --- |
| Buyer request to creator review | Implemented source and earlier local evidence | Installed browser walkthrough and clarification-answer persistence |
| Creator approval and buyer acceptance | Simulated flow; canonical schema exists | Authenticated durable commands and exact-version binding to real invoice creation |
| OAuth/draft/send/read | Mock-tested adapters | Dedicated real Sandbox merchant/buyer transaction and redacted provider evidence |
| Webhook authenticity | Mocked signature/intake coverage | Registered Sandbox webhook delivered to the deployed listener |
| Processing/reconciliation/lifecycle | Local modules and this full-schema integration | Complete inbox-to-real-provider-to-permission pipeline on D1 |
| Recovery composition | GC-01 repaired; explicit single consumer | Wire the selected composition into an authorized runtime without competing consumers |
| Rights receipt/public verification | Invalid until matching receipt exists | Turns 028-029 canonical hashing, linked audit history and minimized public verifier |
| Build and deployment | Existing dependency gate unresolved | Clean pinned installation, lockfile, full verification, Worker build, browser checks |
| AI authority | Review-only | Preserve the block on learned auto-resolution after the three held-out unsafe predictions |

Registry DNS resolution was checked again and failed in this execution environment. No lockfile, installed build, genuine provider compatibility or public deployment was fabricated. No credentials were requested, exposed or used. No real invoice, email, refund, paid API, GitHub Action or scheduled task was initiated.

## Verified design references

Reviewed official references on October 27, 2026:

- PayPal payment records: https://developer.paypal.com/api/invoicing/v2/definitions/payments
- PayPal rate-limit handling: https://developer.paypal.com/api/rate-limiting/
- PayPal Sandbox API origin and idempotency: https://developer.paypal.com/api/rest/requests/
- Registered webhook delivery: https://developer.paypal.com/api/rest/webhooks/rest/
- Cloudflare D1 batch transaction semantics: https://developers.cloudflare.com/d1/worker-api/d1-database/

The SQLite transaction wrapper models D1's documented rollback semantics; it does not prove deployed D1 behavior. Provider-recorded payment detail is not a guarantee of irreversible settlement or absence of future disputes.

## Decision and next implementation

**Gate C remains blocked.** The audit and two repairs are complete, but only a genuine protected Sandbox flow can supply its missing external evidence. Do not enable public creator/payment access or mark the release ready based on this report.

The next independent sprint implementation is **Turn 028: canonical terms, audit linkage and receipt hashing**. Keep the runtime disabled by default and retain the explicit integration blockers in the project ledger.
