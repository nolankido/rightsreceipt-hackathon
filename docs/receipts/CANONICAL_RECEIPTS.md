# Canonical Sandbox receipts and audit linkage

**Owner:** Turn 028, October 27, 2026 HST
**Base:** 3027e1695961ee625b16e4a10c024c874dab7278
**Status:** Local implementation and full-schema fixture verification. No public endpoint or real provider run.

## Meaning and authority

A receipt is a versioned account of the canonical Sandbox permission already recorded by the payment lifecycle. Receipt issuance never sends an invoice, confirms a browser payment claim, moves money, or grants a permission. It requires exact current creator approval, buyer acceptance, complete human terms, quote, policy, invoice, financial evidence and permission linkage.

The SHA-256 chain detects inconsistency against a known hash and the current server records. It is **not a digital signature, identity verification, copyright proof, legal opinion, immutable external ledger, or proof of irreversible settlement**. An attacker able to rewrite all database records and hashes could forge a replacement unsigned history. External signing or anchoring is outside this turn.

## Canonical format

`rightsreceipt-receipt-v1` extends the logical payload frozen in `DOMAIN_MODEL.md` with explicit audit and source-evidence anchors. It contains the visual asset/fingerprint, creator display name, buyer organization, twelve supported rights, exact UTC date interval, integer-cent quote and line items, policy version/hash, terms/consent identifiers and timestamps, actual extraction/model versions, Sandbox invoice reference, payment-evidence hashes and permission state.

The serializer follows RFC 8785: ECMAScript finite-number serialization, recursive UTF-16 property sorting, preserved array order, Unicode preserved without normalization and UTF-8 hashing. Lone surrogates, NaN/infinities, undefined, bigint, accessors, non-plain objects, sparse arrays, cycles and excessive input fail closed. Stored JSON must already be canonical, which also rejects duplicate property names and alternate encodings on read.

Canonical receipts contain internal identifiers for authorized export but exclude buyer email/name, raw requests, signing headers, access tokens, capabilities and raw external bodies. The public presentation will be a separate filtered projection in Turn 029. A receipt does not imply that those public routes exist today.

## Source verification

Before hashing and issuing a receipt, the builder:

- Verifies the case, asset, workspace, terms, quote, decision, acceptance, invoice, permission and verification relationships.
- Reconstructs the existing `rights-review-v1` terms hash and the exact original `quote-calculation-v1` preimage, rather than silently changing historical hash algorithms.
- Checks the policy rules' original SHA-256, integer-cent line sum, supported rights and licensing dates.
- Requires canonical reconciliation payment evidence, matching observed financial totals and a completed latest financial generation. Simulated evidence, pending work, blocked recovery and financial review prevent issuance.
- Preserves recorded extraction versions and artifact hashes, or explicit nulls when none exist. Learned proposals retain no authority.
- Requires the permission's temporal state to match the injected UTC clock. A stale active/scheduled projection must be refreshed by the lifecycle before a new receipt can be issued.

The original licensing terms and quote remain the authority. Receipt code validates their stored integrity and bindings; it is not a replacement pricing engine or a new payment verifier.

## Revision chain and idempotency

Every immutable revision records a sequence number, previous payload hash, material-state hash and audit-root hash. Revision 1 has no previous hash. All later revisions link to the previous stored hash. Asset, rights, consent, quote, period and extraction provenance cannot drift across one chain.

Repeated identical financial observations and audit-only operations do not create a new revision. The writer reuses the existing valid revision. Scheduled/active/expired/refunded/revoked state changes can issue a new linked revision after the canonical lifecycle has already changed. Pending/canceled cases without an issued permission remain without a rights receipt; they are not marked corrupt merely because no paid receipt exists.

Financial review invalidates a current claim. After a nonmaterial review is cleared, the existing revision can be restored only after the entire chain, audit anchors and current material state validate again. A corrupted chain is never overwritten or silently repaired.

## Audit linkage

The writer hashes every existing non-receipt business audit record in its source snapshot, including the canonicalized event payload, and records only event IDs plus hashes in the receipt. The ordered set has its own SHA-256 root. Receipt issuance itself is appended atomically after hashing, so it does not create a circular hash dependency. Earlier receipt events are represented by the previous-revision links rather than being copied into the business-audit anchor.

Verification checks each historical anchor against the retained audit records. Missing or modified anchored events fail closed. The anchor covers existing recorded history, not a claim that missing upstream audit commands have already been implemented. An audit-only append after issuance is allowed and does not change the licensed material state.

## Atomic database behavior

One SQL statement loads the source relationships and complete receipt chain. Hashing happens outside the write transaction. The first receipt insert contains a NOT NULL compare-and-swap guard comparing the exact source JSON and exact chain JSON to the still-current database snapshot. The same transaction appends the revision, advances the verification pointer/status, and appends its issuance audit.

Concurrent issuers cannot fork or duplicate a revision. A failure at any write rolls back the entire publication. A lost acknowledgement reloads the committed revision and returns it unchanged. Any new consent, financial generation, audit history, source metadata or chain revision appearing during hashing forces a bounded reload rather than publishing a stale record.

Migration `0008_canonical_receipts.sql` adds material/audit hashes and an insertion guard to the existing immutable receipt table. It adds no table. Schema version becomes 8 and the table count stays 31. All seven original migrations and the original seed remain byte-identical to the audited repository blobs.

## Integrity failures and exposure

Hash mismatch, altered source terms, bad links, stale permission dates, missing financial evidence, and corrupted anchors never return a valid current receipt. Integrity failures mark the verification invalid and add a deduplicated, redacted receipt-integrity audit entry when the loaded snapshot is still current. Verification also reloads its source after asynchronous hashing to avoid returning a raced active claim.

`reserveReceiptVerification` creates a 192-bit random public identifier through a version-guarded server operation. It is not a buyer/creator capability. `issueSandboxReceipt` requires explicit server-only `RIGHTS_RECEIPT_ISSUANCE_ENABLED=true`, a Sandbox/judge environment, Sandbox payment mode and the migrated database. The default is disabled. No public issuer, export, verifier, scheduler or deployment is installed by this turn.

## Evidence and limitations

`npm run receipts:verify`: **86 tests passed, zero failed**, including RFC-oriented vectors, all primitive material-leaf mutations, malformed values, full-schema issuance, all permission states, refund/revocation chains, source tampering, audit tampering, 100 repeated issuance calls, concurrent writers, exact-snapshot races, rollback at each publication step, lost acknowledgements, file-backed restart, and populated original-seed reset.

Native integration uses all eight actual migrations and the unchanged Gate C database wrapper. Consent, permission, financial and audit data are explicit synthetic records inserted into the full schema, not a fresh live payment flow. No transport or authentication test is implied. The historical payment, lifecycle and Gate C suites were not rerun here. Standalone TypeScript 5.8.3 passed for the receipt modules and server composition with no external type stubs.

The pinned dependency install, Hono/browser/Worker build, deployed D1, genuine Sandbox evidence and Gates A/B/C remain open. The registry was checked again and remains unreachable in the current container. Receipt creation is a separate guarded transaction after lifecycle state changes; previous lifecycle invalidation keeps the public record invalid until matching issuance succeeds. There is no automatic background issuer yet.

Primary specification: https://www.rfc-editor.org/rfc/rfc8785.html (reviewed October 27, 2026). The source implementation includes bounded-input restrictions in addition to the JSON canonicalization rules.

Next: Turn 029 receipt views, authorized JSON export/print and privacy-minimized public verification, without weakening the current source/evidence checks.
