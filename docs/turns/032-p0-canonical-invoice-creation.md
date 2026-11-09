# Management turn 032: Canonical invoice creation and provider binding

**Date:** October 27, 2026 HST
**Base:** e1d43ad22137ade671cc491c2a6aa2aa6d048976
**Priority:** P0 recovery substitution
**Status:** Implemented and verified locally. Release gates remain open.
**Scope:** Optional sponsor-agent integration remains deferred, not completed.

## Delivered

- Reused exact human-consent and deterministic pricing validation for canonical invoice reservation, dispatch and final binding.
- Added atomic operation/binding/case/audit reservation with a stable provider request key and merchant/app fingerprint.
- Reserved an opaque verification reference when absent, without issuing a receipt.
- Added a durable, one-claim creation boundary that does not blindly retry uncertain external outcomes after restart.
- Retained valid provider response IDs separately so local binding can recover from crashes and transaction failures without another POST.
- Bound a validated Sandbox draft ID only after renewed source, consent and creator-authorization checks.
- Preserved cross-case invoice-ID uniqueness and prevented creation replays from regressing later invoice states.
- Fixed 43-character prepared request keys to 35 characters and supported strictly validated minimal Sandbox invoice-link responses.
- Added disabled server-only composition, root verification wiring, focused strict type configuration, regression coverage and engineering documentation.

## Executed evidence

```text
94 new invoice tests + 100 human-consent regressions + 22 fake/configuration tests
+ 27 OAuth/draft tests = 243 passed, 0 failed, 0 skipped.
All 8 original migrations executed; original Git hashes retained; 31 domain tables.
Standalone strict TypeScript 5.8.3: passed, including exact optional properties and unchecked index checks.
```

The full-schema tests invoke actual creator/buyer commands and production invoice store statements. They test 100 replay calls, eight competing workers, all transaction rollback points, saved-candidate and completed-binding restarts, lost acknowledgements, late consent/auth changes, merchant changes, invoice-ID collisions, minimal-response validation and redaction. Provider HTTP replies are injected fixtures, not genuine PayPal evidence. The known $425 amount remains exactly `425.00` in the actual transport payload.

The original eight migrations and seed are not modified. No new database table is introduced. No live credential, invoice, customer email, payment, paid API, GitHub Action, deployment, public write route or schedule was used. The server composition is disabled by default and still requires a real creator authorizer.

## Limitations and next

No canonical send-journal adoption or invoice-send command is added. Unknown-ID outcomes remain blocked pending future provider lookup/operator reconciliation; the system deliberately does not trade duplicate-invoice risk for automatic retry. The login/session system, browser workflow, installed build, live D1 and genuine Sandbox flow remain unfinished. The entire historical payment/receipt/clock collection and original seed/reset runner were not rerun.

Turn 007 and Gates A/B/C remain open. Next P0 integration: canonical draft adoption into explicit authorized sending, followed by secure creator-session and browser wiring. Optional dashboard and sponsor-agent work remains deferred.

See [engineering record](../engineering/CANONICAL_INVOICE_CREATION.md).
