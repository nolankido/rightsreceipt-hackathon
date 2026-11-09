# Turn 123: high-precision UTC webhook timestamp acceptance

**Date:** November 5, 2026  
**Focus:** Prevent avoidable rejection of valid RFC 3339 timestamp precision during genuine PayPal Sandbox acceptance  
**Release:** NOT READY

## Observed defect and risk

Three independent ingress checks restricted UTC fractional seconds to one through three digits:

1. `scripts/support/sandbox-webhook-transmission-window.mjs`, screening the one-shot collector's retry window.
2. `scripts/sandbox-webhook-capture.mjs`, parsing preliminary transmission headers.
3. `packages/paypal/src/webhook-intake.ts`, the authenticated webhook verifier's timestamp parser.

RFC 3339 permits fractional seconds without a three-digit limit. If an otherwise correctly signed provider header or event creation time contains more than milliseconds, this project would reject it before PayPal could verify the signature. The official PayPal documentation describes a timestamp header and signature postback, but this turn **does not claim to have observed PayPal using six- or nine-digit precision**. The goal is conservative interoperability before real Sandbox acceptance, with a bounded nanosecond-precision allowance.

## Implemented

- Accept canonical `YYYY-MM-DDTHH:mm:ssZ` or the same with **one through nine decimal fractional digits** in all three intake components.
- Continue requiring UTC `Z`, strictly validated calendar seconds, the same three-day plus five-minute past bound and five-minute future bound. Precision beyond nine digits is rejected.
- Retain the **exact originally received** `paypal-transmission-time` string in the private capture and authenticated PayPal verification postback. The string is not rounded, truncated or reserialized before signature verification.
- Accept similarly formatted higher-precision `event.create_time` for the verified inbox, preserving the event string. A parsed timestamp is used only for time-window comparisons at JavaScript's millisecond resolution.
- Update [Sandbox acceptance instructions](../paypal/SANDBOX_ACCEPTANCE.md) to state this limit without claiming external payment proof.

## Regression proof

- Added a nanosecond/microsecond date-parsing test in `scripts/support/sandbox-webhook-transmission-window.test.mjs`, retaining malformed date and overprecision failures.
- Added a local HTTP test in `scripts/sandbox-webhook-capture.test.mjs` showing a ten-digit timestamp fails and a nine-digit header is captured byte-for-byte as **unverified**.
- Added `scripts/paypal-webhook-local.test.mjs` coverage for exact six- and nine-digit transmission-header values in the mocked PayPal signature postback, overprecision rejection before network access, and unchanged storage of a high-precision event creation time.
- Red phase: 120 of 123 existing/new focused tests passed, and the three intended high-precision regressions failed before the implementation.
- Green phase: **124/124 tests passed, exit code 0** on Node 24.22.1 with the repository's existing TypeScript test loader, including the added event `create_time` case.

Command, from a complete checkout:

```bash
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/paypal-ts-test-loader.mjs --test scripts/paypal-webhook-local.test.mjs scripts/sandbox-webhook-capture.test.mjs scripts/support/sandbox-webhook-transmission-window.test.mjs
```

## What is not proven

Focused synthetic tests do **not** substitute for the pinned Node 22/pnpm 12 complete source release, actual Sandbox invoice settlement, authenticated PAID financial retrieval or signature-verified matching webhook. No production provider, public repository, YouTube or Devpost operation was performed. The original timestamp's signature remains the actual PayPal server's decision, not a timestamp parser's decision.

## Next P0 action

Run the exact full clean release on a complete checkout with the required Node/pnpm versions. Then complete the approved genuine Sandbox merchant and distinct buyer flow with a properly registered and bound webhook receiver **before payment**. Keep the internal November 9 submission target and stop further feature work when real release evidence is available.
