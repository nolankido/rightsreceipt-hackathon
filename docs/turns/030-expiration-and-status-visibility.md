# Turn 030: Expiration and status visibility

**Priority:** P1
**Date:** October 27, 2026 HST
**Base:** 25cdfadc086a33c56a2b4cf5e486b8633cae0d21
**Status:** Implemented and verified locally. Runtime defaults remain off; external release gates remain open.

## Delivered

- Recovered the exact-base Turn 029 package, including its read-only receipt routes, protected exports, local QR, tests, browser fixtures, integration changes and documentation.
- Added strict UTC interval and effective-state calculations, seven-day and last-day expiration notices, and shared public/private/print messaging.
- Added a guarded clock worker for existing paid permissions, with exact source-and-chain checks, atomic audit/state/invalidation and retryable hash-linked receipt publication.
- Preserved all payment/financial records and terminal permission states. Delayed scheduled work may expire directly without temporary activation.
- Added bounded due selection, crash/lost-acknowledgement recovery, and a default-disabled server/Worker integration without installing a schedule.
- Added protected-client fresh-read timers, conservative request-latency handling and hidden-tab clearing. Public pages remain script-free snapshots.
- Retained strict GET verification, capability/session rechecks, canonical export bytes and private/public field separation.

## Executed evidence

```text
Recovered Turn 029 baseline experience suite: 105 passed, 0 failed.
New permission clock/SQL/status suite: 73 passed, 0 failed.
Combined final native run: 178 passed, 0 failed, 0 skipped.
Standalone strict TypeScript 5.8.3: passed, no temporary dependency declarations.
Offline Chromium layout/DOM regression checks: 32 passed.
Offline Chromium temporal client checks: 12 passed.
```

Focused SQL tests execute real receipt/temporal statements against a synthetic relational schema and financial fixture. They preserve the production NOT NULL transaction fence and terminal/immutability guards. This is not the full migration/seed suite or live D1. Browser checks use injected responses/timers without network navigation or real authentication. The standalone package/Hono/React/Worker build and all historical test suites were not run.

## Guardrails

Receipt issuance, receipt reads and clock refresh remain opt-in and disabled by default. No new public write route, deployment, Cron Trigger, real PayPal request, email, paid API or GitHub Action is introduced. A hash remains an unsigned integrity digest, not ownership or legal proof. The learned model remains barred from automatic rights resolution.

Permission changes are recorded before receipt publication; verification remains invalid if the second transaction fails. Replaying the job can finish publication without changing financial evidence. No calendar computation restores refunded/revoked/expired rights.

## Next

Turn 031 is the planned creator dashboard. Its optional scope remains subordinate to unresolved P0 build, authentication, durable consent, actual Sandbox and end-to-end browser work. See [expiration engineering record](../receipts/EXPIRATION_AND_STATUS.md).
