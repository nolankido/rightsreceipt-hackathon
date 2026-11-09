# Turn 029: Receipt and public verification experiences

**Priority:** P0
**Date:** October 27, 2026 HST
**Base:** `25cdfadc086a33c56a2b4cf5e486b8633cae0d21`
**Original implementation status:** Completed locally; publication was blocked in the Turn 029 session.
**Original delivery:** Exact-base overlay with guarded edits, hashes and evidence. At that time GitHub main remained at Turn 028. Recovery into the combined Turn 029/030 change set is recorded below.

## Delivered

- Read-only public HTML/JSON verification using actual canonical-chain and source-record checks.
- Explicit public-data allowlist and distinct lifecycle, pending, invalid, review and not-found states.
- Protected buyer receipt, exact canonical JSON export, printable HTML and fixed-origin public QR.
- Creator record/export authorization interface that defaults to deny, never trusting a demo-role header.
- Existing buyer-capability SQL validation including receipt scope, digest lookup, issue/expiry dates and revocation.
- Final authorization/source rechecks around asynchronous hashing.
- Memory-only buyer access client, fragment removal, refreshed printing, safe download and private-DOM clearing on access loss.
- Locally generated bounded QR with independently checked matrices; no tracking or external QR endpoint.
- Escaped responsive server-rendered pages, readable failure states and security/cache headers.
- Disabled Worker route/static-asset wiring, buyer entry link and focused root verification command in the prepared overlay.

## Executed verification

```text
New receipt-experience/access/HTTP/QR tests: 105 passed
Existing canonical serialization regressions: 22 passed
Combined native total: 127 passed, 0 failed
Standalone strict TypeScript 5.8.3: passed, no external type stubs
Offline Chromium layout/DOM checks: 32 passed, 0 failed
Independent QR reference matrices: all 16 matched
One generated verification URL decoded independently with OpenCV
```

The native fixtures call the actual Turn 028 issuer, source verifier and hash-chain code. Access SQL uses native SQLite. The broader complete-schema issuance, payment and Gate C suites were not rerun. Runtime baseline source hashes were matched to the retrieved repository blobs.

Offline Chromium uses rendered HTML and in-memory fetch responses for DOM behavior. It is not end-to-end server/browser proof. Actual navigation to the local HTTP fixture was attempted and blocked by browser policy (`ERR_BLOCKED_BY_ADMINISTRATOR`). No restriction was bypassed. The installed Hono/Worker/Vite build, browser network flow, live D1 and genuine PayPal remain unverified.

## Acceptance and deliberate limits

- RR-P0-055: protected receipt HTML contains required scope, amounts, dates, versions, Sandbox reference and status; offline presentation checked, real browser acceptance pending.
- RR-P0-056: public allowlist and capability separation pass local negative/leak tests; distributed edge throttling and live deployment review remain pending.
- RR-P0-057: all defined statuses have deterministic read/presentation coverage; no GET silently refreshes temporal state.
- RR-P0-058: authorized printable HTML and exact canonical JSON reference the same hash in local tests; real download/navigation acceptance remains pending.
- RR-P0-059: private receipt links the existing audit root/count; no private raw audit payload is exposed publicly.
- RR-P0-001 and Gates A/B/C remain open. Secure creator sessions are not implemented by this turn.

No schema migration, paid API, real credential, payment, email, GitHub Actions, deployment or schedule was introduced. No user setup or manual handoff was requested.

Next: publish the preserved Turn 029 overlay, then **Turn 030: expiration and status visibility**.

See [receipt experience engineering record](../receipts/RECEIPT_EXPERIENCES.md).

## Publication recovery in Turn 030

The original exact-base package is included in the Turn 030 repository change set. Its 105 native experience tests and 32 offline Chromium checks were rerun successfully before/after the expiration additions. The earlier publication limitation describes the prior session, not a new claim of deployment.
