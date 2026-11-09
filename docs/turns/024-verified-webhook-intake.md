# Turn 024: Verified webhook intake

**Priority:** P0
**Date:** October 27, 2026 HST
**Status:** Implemented and verified locally; actual Sandbox and deployed release acceptance remain pending.
**Base commit:** b7d177faf2d652e8814ca2f7e262ec90ce8a3214

## Delivered

- Added a Sandbox-only Web Request/Response signature-verification handler using the fixed PayPal postback endpoint and server-configured registered webhook ID.
- Preserved original signed bytes and JSON through validation; bounded streams, UTF-8, headers, timestamps, certificate origins, nesting and duplicate-property checks fail closed.
- Added private OAuth acquisition/cache, early expiry, one auth refresh, bounded responses and sanitized retryable failures. No token method or raw logging surface is exposed.
- Accepted only exact provider SUCCESS responses. A local crypto verification mock confirms altered bytes and forged signatures fail before inbox persistence.
- Added redacted verified inbox persistence, atomic event uniqueness, conflict rejection, safe late invoice association and immutable evidence metadata.
- Added migration 0004 and schema-version/test expectations. No new domain table was added.
- Added an explicitly disabled-by-default inbound route at `/webhooks/paypal/sandbox` and a Worker wrapper that delegates all other traffic to the existing Hono app.
- Kept payment evidence, invoice state changes, permission activation and receipt issuance outside intake.
- Added the native webhook test command to root payment verification and documented operational boundaries.

## Executed evidence

```text
New webhook/intake/route/SQLite tests: 92 passed, 0 failed
Prior fake/configuration tests: 22 passed, 0 failed
Prior OAuth/draft tests: 27 passed, 0 failed
Combined executed total: 141 passed, 0 failed
Standalone strict TypeScript 5.8.3 for new intake, inbox and route: 0 errors
New Worker wrapper syntax parse: passed
```

The cryptographic fixtures are generated locally and returned through injected mock HTTP, not by PayPal. File-backed SQLite was closed and reopened to prove deduplication survives an adapter restart. The test uses the exact original webhook table and migration 0004 with a minimal invoice binding table, not the full migration/seed flow or live D1.

The Turn 023 delivery suite's earlier 53 tests were not rerun in this isolated workspace. No full `pnpm verify`, root installed-library build, Hono/Worker execution, browser walkthrough or live PayPal test is claimed. npm registry access remains unavailable. No account changes, real credentials, real payment, email, paid API or GitHub Actions were used.

## Safety findings addressed

- False payment claim: a PAID event is only a verified pending notification, never immediate permission authority.
- Pre-verification acknowledgement: supported events receive success only after authentication and durable receipt.
- SSRF/header manipulation: certificate URLs are strictly allowlisted and never fetched locally; redirects and duplicate security headers fail closed.
- Evidence overwrite: verified receipt fields are immutable; changed payload under an existing event ID conflicts.
- Replay shortcut: even known events must pass verification again, and legacy rejected rows are not accepted as verified duplicates.
- Privacy: buyer details, raw content, signatures and credentials are absent from persistence and replies.

## Acceptance mapping and limitations

- RR-P0-047: forged, altered, missing-header, malformed and valid simulated signature flows pass native tests. Genuine registered Sandbox event delivery remains unverified.
- RR-P0-048: safe metadata, provider invoice references, hashes and timestamps persist with redaction and restart evidence.
- RR-P0-049: intake deduplication foundation only. Downstream event processing and side effects remain Turn 025.
- RR-P0-050 through RR-P0-052: ordering, reconciliation and authoritative lifecycle remain future work.
- RR-P0-001, Gate A and Gate B: remain open. Learned auto-resolution is still prohibited.

Next: **Turn 025, idempotent and order-safe webhook processing**. Do not turn a verified event name or raw status into a paid permission without the accepted-version and reconciliation checks.

Detailed behavior and official references: [Verified webhook intake](../paypal/VERIFIED_WEBHOOK_INTAKE.md).
