# Durable human consent and invoice preparation

Management slot 031, P0 recovery substitution. Base: `75dc35a32866cf9d91901f4d1bb0e4b3fda57ed8`.

## Why this work takes priority

The original Turn 031 dashboard is P1. MVP_SCOPE.md cuts that dashboard while PayPal, tests or receipt work remains; the current ledger explicitly lists durable consent and canonical invoice integration as release blockers. This turn defers the dashboard instead of building optional analytics around an incomplete payment handoff. The original dashboard is **not marked complete**.

Turn 013's approval/acceptance store is explicitly simulated. The new application service writes the existing canonical `creator_decisions`, `buyer_acceptances`, `licensing_cases` and `audit_events` tables used by the Sandbox payment lifecycle. It never converts simulated records into real human consent.

## Trust and authority

Creator reads and decisions require a server-injected authorizer returning an authenticated workspace and stable actor reference. The service checks workspace ownership and rechecks the authorizer after asynchronous hashing, immediately before commit or return. Neither a role header nor actor fields in request JSON are accepted. The default Worker supplies no authorizer and therefore denies creator actions even when the route flag is enabled. This is an authorization integration point, **not an implemented login/session system**.

Buyers must present their existing 256-bit bearer capability. Its digest is looked up server-side. The token must be current, unrevoked, issued, unexpired and include `review` scope. That scope already authorizes review/acceptance in the simulated application. Receipt-only capabilities and public verification references cannot accept. The final database transaction checks the same capability identity, scope and deadline again. Revoking a link prevents subsequent commands/replays; it does not retroactively delete immutable consent already given.

Each decision requires a strict command schema, a UUID idempotency key, the displayed case revision, terms/quote IDs and review hash. Approvals require explicit confirmation. Acceptance additionally names the approved creator decision, requires an explicit acknowledgement and the exact version of the displayed consent copy. Extra fields such as amount, paid state or actor identity are rejected.

## Verify the actual offer

The service loads one exact relational snapshot. It requires complete creator-confirmed terms, a current quote, the assigned active policy, an active asset and a consented original submission. It reconstructs the original rights-review hash, checks the original policy hash, and re-runs the existing deterministic pricing engine. Every line, description, amount and calculation hash must match; this is not a second pricing implementation.

A deal hash binds the workspace, case, asset identity/fingerprint/display information, request identity, a digest of the invoice recipient, all twelve rights, licensing dates, policy and exact price. A separate review hash also binds the current creator decision. Audit evidence stores the deal/review hashes and the version/hash of the consent copy, never the recipient email or raw buyer request. Substituting an asset or invoice recipient after consent fails invoice preparation. An unaudited approval inserted by a fixture or simulated flow is not sufficient for buyer acceptance.

## Atomic writes and retries

Creator decisions append an immutable decision and audit, advance the case revision, invalidate effective prior acceptance, and keep an unissued verification record pending or rejected. Buyer acceptance appends its immutable acceptance and audit and advances the case pointer/revision. No invoice, payment evidence, permission or rights receipt is created.

The first write is an audit insert whose NOT NULL case lookup compares the complete current source JSON against the verified snapshot, ownership, case revision and final buyer capability where applicable. A failed comparison throws inside the batch, rolling back every following write. It does not rely on treating a zero-row UPDATE as an exception.

Unique audit idempotency keys preserve one result per command. Same-command replays reload the recorded result; different content using the same key is rejected. Concurrent writers cannot both replace the same displayed revision. A lost commit acknowledgement resolves through the stored result. Replays require current authorization and matching effective consent. Material edits need fresh approval and acceptance, while old records remain immutable.

An unaccepted approval can be replaced by rejection or a clarification request. A clarification request requires explicit re-review before approval. Turn 037 adds [persisted buyer clarification and human re-review](CLARIFICATION_WORKFLOW.md), which advances the case version and clears prior approval/acceptance. When new evidence confirms unchanged rights, it can reuse the verified immutable terms and quote while requiring new consent. Accepted terms cannot be silently overridden. Invoice bindings, permissions, receipt records and even an already-started payment operation block new consent changes, including pointerless invoice rows.

## Server-only invoice preparation

`prepareInvoice(caseId)` produces the existing `AuthorizedInvoiceSnapshot` type only after validating the current approval, acceptance and their matching human-command evidence. It includes the canonical recipient and all twelve rights, with a stable request ID derived from accepted identifiers. It reloads the source after hashing to reject races.

This method is NOT an HTTP endpoint, an operation reservation, or permission to skip final payment checks. It makes no provider request. The next P0 integration must atomically reserve the canonical invoice operation/binding, recheck this exact consent at the final handoff, and connect the existing idempotent Sandbox adapter. A prepared snapshot alone is not a completed invoice workflow.

## HTTP composition

Routes are wired into the Worker source but disabled unless `HUMAN_CONSENT_ENABLED=true`, a migrated DB, Sandbox/judge mode, Sandbox payment mode and an exact HTTPS `HUMAN_CONSENT_ORIGIN` are supplied:

```text
GET  /api/consent/creator/cases/:caseId/review
POST /api/consent/creator/cases/:caseId/decision
GET  /api/consent/buyer/review
POST /api/consent/buyer/accept
```

Buyer tokens appear only in the Authorization header. Writes require an exact same-origin Origin header and reject cross-site Fetch Metadata. Bodies are bounded to 4 KiB, UTF-8 JSON with no duplicate decoded top-level keys. Unknown fields, unsupported methods, query credentials, compressed bodies and malformed JSON are rejected. Responses use no-store, no-referrer and generic errors. There is no permissive CORS header and no logging of private bodies.

The built-in 60-request/minute limiter is intentionally coarse and per-isolate, not distributed abuse protection. Production edge limits and authenticated session/CSRF policy still require deployment integration. The current React simulated workflow is not switched to these commands in this turn. No UI or browser authentication pass is claimed.

## Executed evidence

- 100 new native Node/SQLite tests passed, zero failed, zero skipped.
- 22 unchanged canonicalization regressions rerun. Combined: 122 passed, zero failed.
- All eight actual migrations executed; original Git blob hashes match the reviewed repository. The database has all 31 domain tables, not simplified consent-parent tables.
- Actual domain, pricing, canonicalization and PayPal contract sources were recovered and hash-checked. No dependency stubs are used.
- Standalone TypeScript 5.8.3 strict check, exact optional properties and unchecked-index checking passed. Node is 22.16.0.
- Replays, eight competing workers, restart, lost acknowledgement, each transaction rollback point, last-moment capability revocation/expiry, stale consent, quote/policy tampering, recipient substitution, permanent rejection and redaction are covered.
- Native Request/Response tests execute the real HTTP handler and persistence. They are not network/browser/Hono/Cloudflare end-to-end tests.

The original full seed/reset runner and all historical financial, receipt and clock suites were not rerun. Tests seed synthetic offers directly into the full schema. No genuine PayPal call, credentials, invoice, email, payment, deployment, scheduled trigger, paid API or GitHub Action was used. Registry DNS remains unavailable; the pinned monorepo install/build and Gates A/B/C remain open.

## Design references

Reviewed official guidance on October 27, 2026:

- OWASP transaction authorization: https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html
- OWASP authorization: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- Cloudflare D1 batch transaction semantics: https://developers.cloudflare.com/d1/worker-api/d1-database/

SQLite tests model documented D1 batch rollback. Deployed D1 behavior and genuine user sessions remain unverified.
