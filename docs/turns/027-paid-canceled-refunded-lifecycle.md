# Turn 027: Paid, canceled and refunded permission lifecycle

**Priority:** P0
**Date:** October 27, 2026 HST
**Base commit:** 7151f10f9d76d515e1517b26c7c97aeb523303f3
**Status:** Implemented and verified locally. Genuine Sandbox, full integration and release acceptance remain pending.

## Delivered

- Extended the existing content-validating Sandbox GET with financial assessment of its exact response.
- Required matching USD invoice/paid/due/refund totals, unique PayPal transaction IDs and valid dates; no manual, external, pending or partial records qualify as full settlement.
- Added lease-fenced canonical evidence and permission transitions with exact current consent and revision checks.
- Correctly derived scheduled, active and expired periods; prevented reactivation of terminal permissions.
- Handled refund-before-paid-notification without a temporary activation; deduplicated recurring payment evidence.
- Added partial/conflicting financial review suppression and protection against decreasing known refund totals.
- Added separately authorized creator revocation that does not send a refund or change payment evidence.
- Atomically recorded observation, reconciliation receipt, financial evidence, permission/case/invoice changes, verification invalidation, audit and generation completion.
- Added migration 0007, schema version 7 with 31 tables, root focused verification command and disabled server composition.
- Kept public verification invalid until a matching hashed receipt is issued in Turn 028.

## Executed evidence

```text
New financial/lifecycle/SQLite/revocation tests: 91 passed
New actual transport tests with mocked HTTP: 5 passed
Existing fake/configuration/OAuth/draft tests: 49 passed
Combined: 145 passed, 0 failed

Standalone strict TypeScript 5.8.3: new modules, modified transport, server hook
0 errors; no temporary dependency stubs used
```

Tests cover scheduled/start/end UTC boundaries, cancellation before/after payment, full and partial refunds, refund-first arrival, repeated financial snapshots, concurrent workers, missing or changed consent, lost acknowledgements, file-backed restarts, stale generations and rollback at every completion/revocation write. Core committed file hashes are compared with locally executed files at publication.

The database fixtures model the relevant original tables but are not the complete migration/seed runner. The recovery lease is a test port; the production recovery suite was not rerun. The modified Sandbox transport itself executed against injected responses using actual base adapter/journal modules, not type stubs. No genuine provider transaction, credential, deployed D1, Hono/browser test, email, paid API, GitHub Actions or schedule was used.

## Acceptance and limitations

- RR-P0-052: canonical paid/canceled/refunded permission and audit outcomes pass local scenarios. Live acceptance is pending.
- RR-P0-049/050: duplicate evidence is suppressed, newer work cannot be acknowledged by an older financial read, and terminal/partial-refund states cannot reopen silently.
- RR-P0-051: existing recovery leases and read-only provider boundary are reused, without a send/refund recovery shortcut.
- No public production permission or signed/hash-valid rights receipt is claimed. Internal Sandbox permissions and invalidated verification records await Turn 028.
- Turn 007, Gate A and Gate B remain open; Gate C now requires real end-to-end evidence. Learned automatic rights resolution remains prohibited.

## Next

**Gate C: PayPal end-to-end readiness review.** Review actual integration gaps and keep the gate blocked until a real Sandbox flow is verified. Next independent implementation afterward is Turn 028, canonical receipt hashing and audit linkage.

See [financial lifecycle engineering record](../paypal/FINANCIAL_PERMISSION_LIFECYCLE.md).
