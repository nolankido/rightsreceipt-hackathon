# Local simulated transaction vertical slice

**Owner:** Turn 013  
**Mode:** `APP_MODE=local` with no D1 binding  
**Status:** Implemented with dependency-free service tests. Browser / installed-dependency checks pending Turn 007.

## Purpose and non-goals

Demonstrate the complete decision flow without requiring PayPal credentials or making an actual payment. The simulator integrates with the existing submitted licensing case, immutable terms review, and deterministic quote service. It never claims to have generated PayPal evidence, issued a real permission, or verified copyright ownership. The prominent text shown on every simulated view is:

> SIMULATED DEMONSTRATION ONLY. No PayPal transaction occurred. This record does not grant a real license.

The fake evidence is stored only in a separate, volatile memory store. No record is inserted into `payment_evidence`, `invoice_bindings`, `permissions`, `verification_records`, or `receipt_revisions`. Real provider adapters and durable receipts belong to later turns.

## Workflow

1. Creator uses the existing asset workflow to issue a fresh buyer capability link.
2. Buyer submits the original licensing request with versioned consent; input remains immutable.
3. Creator reviews and corrects all twelve fields, explicitly marked as human-entered, not AI.
4. The existing deterministic pricing service verifies the seeded policy and creates a versioned USD quote.
5. Creator makes an explicit approval, rejection, or clarification decision, bound to quote ID and terms ID.
6. Buyer returns to the same scoped capability and explicitly accepts the exact approved terms and quote.
7. Creator triggers **Simulate payment, no real money**. The fake provider creates synthetic paid evidence.
8. A simulated receipt is hashed with SHA-256, includes a random opaque verification identifier, and is publicly verifiable in local mode.

The receipt includes the asset title/fingerprint, quoted cents, licensing dates, quote and terms version IDs, fake payment reference, and simulation disclaimer. It excludes buyer email, buyer capability, untrusted original request text, and internal notes.

## User interfaces

- `/creator/cases/:caseId/quote` links to the simulated creator decision page.
- `/creator/cases/:caseId/mock` displays the creator decision, quote, next action, fake payment, and receipt link.
- `/request/:capability/mock` shows the precise quote and records explicit buyer acceptance.
- `/verify/simulated/:publicId` displays a privacy-minimized hash and simulated status.

The original buyer request success page links to the buyer-review route after submission. Buyer and creator views deliberately remain separate.

## API routes

Creator routes require the existing demonstration creator header:

```text
GET  /api/creator/cases/:caseId/mock
POST /api/creator/cases/:caseId/mock/decision
POST /api/creator/cases/:caseId/mock/payment
```

Buyer capability routes:

```text
GET  /api/request/:capability/mock
POST /api/request/:capability/mock/accept
```

Public simulation-only verification:

```text
GET  /api/mock/verify/:publicId
```

Every route fails closed with `503 mock_mode_unavailable` if `APP_MODE` is not `local` or any D1 binding exists. The API never calls the PayPal adapter, sends an invoice, or treats a browser callback as real payment evidence. The creator header is a temporary demo mechanism, not secure authentication.

## Concurrency and authority

- Creator approval binds to exact current quote and immutable terms IDs.
- Buyer acceptance requires an unrevoked, unexpired capability with `review` permission, a submitted buyer request, current creator approval, explicit acceptance, and exact matching IDs.
- A stale quote, terms version, case row version, or simulator revision fails closed.
- A rejected case cannot be reopened through the same quote. Clarification requires a new terms and quote version.
- Fake payment requires complete creator and buyer consent and returns an immutable simulated receipt.
- A second fake payment never creates a second receipt.
- SHA mismatch produces an invalid public verification result without exposing the payload.
- A paid future-date simulation is labeled `simulated_scheduled`, not `simulated_active`.
- Day intervals are `[start_date, end_date_exclusive)` in UTC.
- Source data remains unchanged; the fake test store can be reset without touching real payment state.

## Running available tests

```bash
node --no-warnings --experimental-strip-types --test scripts/mock-transaction-local.test.mjs
```

The dependency-free suite has 21 checks, including version and capability guards, rejection, clarification, approval, acceptance, fake evidence, hash tampering, redaction, permission dates, idempotency, and CAS conflicts.

The Hono integration test in `apps/api/src/mock-transaction.test.ts` exercises the complete existing buyer-request, terms-review, quote, approval, acceptance, fake-payment, and verification chain. It is not represented as passing until Vitest dependencies can be installed.

## Remaining release blockers

- Missing generated pnpm lockfile and clean install from Turn 007.
- No executed Vitest full-chain or Playwright browser test.
- No live Cloudflare D1 verification or deployed Worker.
- The fake-only store is volatile and intentionally separated from D1 and future real PayPal evidence.
- Real secure creator sessions, sandbox webhooks, reconciliation, and legally meaningful licensing require later turns.
