# Turn 028: Canonical receipt hashing and audit linkage

**Priority:** P0
**Date:** October 27, 2026 HST
**Base commit:** 3027e1695961ee625b16e4a10c024c874dab7278
**Status:** Implemented and verified locally. Public/browser and live acceptance remain pending.

## Delivered

- Bounded RFC 8785-style canonical serialization with SHA-256, strict Unicode and non-JSON input rejection.
- Canonical Sandbox receipt payload with all twelve rights, dates, amount, quote/policy versions, exact consent, recorded extraction/model provenance, payment evidence and permission state.
- Recomputed original terms, policy and quote hashes before issuance; privacy-minimized canonical data rather than raw requests or buyer contact details.
- Immutable, sequential previous-hash links and independent material/audit hashes.
- Full historical business-audit anchors, with no circular issuance-hash dependency.
- Exact source-and-chain snapshot guards for atomic revision/pointer/audit publication, duplicate suppression, competing issuers, lost acknowledgements and stale-state retries.
- Current-chain verification against source records and historical audit anchors; invalidation rather than silent tamper repair.
- Safely reused identical receipts, including after a cleared nonmaterial review. Unpaid/canceled unissued cases do not get a misleading receipt or corruption label.
- Added a guarded random public-reference reservation and disabled server-only issuance hook, without a public endpoint or scheduler.
- Added migration 0008 and manifest/test/verification wiring. Original seven migrations and judge seed unchanged.

## Executed verification

```text
npm run receipts:verify
86 tests passed, 0 failed

All 8 migrations applied to native SQLite; 31 domain tables; clean integrity/foreign keys.
Original 7 migrations, seed and Gate C database helper match audited Git blob hashes.
Original reset after populated multi-revision receipts: passed.
Standalone strict TypeScript 5.8.3: receipt package and server composition, 0 errors.
New test/loader JavaScript syntax and changed-source formatting checks: passed.
```

The mutation scenario changes every primitive material leaf independently. Replays and concurrent issuers do not duplicate revisions or issuance audits. Failure at each of three publication writes rolls back the entire transaction. File-backed restart verifies the same stored chain. Tests reject altered amounts/rights/versions, rehashed payloads conflicting with source state, forged model provenance, missing audit events, stale consent and stale time-based permissions.

Tests use full schema with directly seeded canonical consent/financial/lifecycle records, not live PayPal transactions or an executed browser workflow. The historical payment/Gate C suites and full pinned build were not rerun. Registry DNS remains unavailable. No paid service, real credential, real payment, email, GitHub Actions, deployment or schedule was used.

## Acceptance

- RR-P0-053: local canonicalization/version/reference tests pass.
- RR-P0-054: local material-leaf mutation, hash-chain and tampering tests pass.
- RR-P0-059: existing audit-history linkage and payload-redaction checks pass locally; creator-view browser evidence remains open.
- RR-P0-055 through RR-P0-058: UI, authorized export/print and signed-out public verification remain Turn 029.
- RR-P0-001 and Gates A/B/C remain open. A hash is not a signature, ownership proof or an external immutability guarantee.

Next independent unit: **Turn 029, receipt and public verification experiences**.

See [canonical receipt engineering record](../receipts/CANONICAL_RECEIPTS.md).
