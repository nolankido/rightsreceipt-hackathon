# ADR 0006: Use Versioned RFC 8785 Receipt Revisions with SHA-256

- **Status:** Accepted
- **Date:** 2026-10-25
- **Owners:** RightsReceipt project
- **Related turns:** Turn 004, implemented in Turns 028 and 029
- **Supersedes:** None
- **Superseded by:** None

## Context

RightsReceipt needs a tamper-evident record of approved terms, pricing, payment reference, permission state, and relevant versions. A normal JSON serialization is not a stable hash input because property ordering and display formatting can vary. The permission may also change after issuance through refund, revocation, or expiration.

The product must not overstate the record as immutable, legally conclusive, digitally signed, or blockchain-backed. It must remain possible to show current status while preserving prior evidence.

## Decision

Represent each material receipt state as an immutable, schema-versioned receipt revision.

For every revision:

- build a validated canonical payload from stable domain values only;
- represent money as integer cents;
- represent dates and timestamps as canonical strings;
- exclude display-only formatting, secrets, raw webhook payloads, capability tokens, and private operational fields;
- canonicalize the payload with RFC 8785 JSON Canonicalization Scheme;
- hash the canonical UTF-8 bytes with SHA-256 through Web Crypto;
- store the payload, canonicalization scheme, hash algorithm, hash representation, revision number, and prior revision hash where one exists;
- expose the current revision through the receipt projection;
- preserve prior revisions for creator audit history.

A material lifecycle change creates a new revision instead of mutating the prior payload. The public verification response returns the current privacy-minimized payload, status, and hash.

The hash is not a digital signature. It proves only that the stored or presented canonical payload matches the digest.

## Consequences

### Positive

- The same logical payload produces the same hash across local and deployed JavaScript runtimes.
- Prior material states remain available after refund, revocation, or expiration.
- Hash generation is independent of UI formatting.
- The receipt can be exported as canonical JSON and checked with standard cryptographic tooling.
- The design avoids blockchain and external signing infrastructure.
- A revision reference makes status history explicit without claiming immutability.

### Negative and tradeoffs

- The project must implement and test a correct RFC 8785 canonicalizer or use a carefully reviewed implementation.
- Receipt revisions add storage and rendering logic.
- SHA-256 does not prove who created the record or whether the underlying permission is legally enforceable.
- Private and public receipt payloads require deliberate field separation.
- Status projection and revision creation must remain synchronized.

## Alternatives considered

### Hash ordinary `JSON.stringify` output

Rejected because property insertion order and unvalidated numeric or string representation can make the digest contract fragile.

### Mutate one receipt row and recalculate the hash

Rejected because prior evidence would be lost and later lifecycle changes would overwrite the originally issued state.

### JSON Web Signature or public-key signatures

Not selected for P0. A signature would introduce key generation, rotation, custody, verification, and stronger identity implications. It may be considered after the hackathon.

### Blockchain or NFT anchoring

Rejected because it adds cost, scope, external dependencies, and misleading immutability or ownership implications without improving the core workflow.

### PDF as the canonical record

Rejected because PDF generation and rendering are not a stable semantic data format. Printable HTML is sufficient for P0, and JSON remains the canonical export.

## Validation

Turns 028 and 029 must demonstrate:

- identical canonical bytes and digest for logically identical payloads;
- digest changes for every material field mutation;
- no digest change for display-only formatting changes;
- revision creation for material lifecycle updates;
- preserved prior revision hashes;
- private and public field allowlists;
- printable HTML and JSON that refer to the same current hash;
- cross-runtime reproduction in unit and Worker tests.

## Revisit triggers

- RFC 8785 cannot be reproduced consistently in the chosen runtimes.
- The canonical payload requires a value that cannot be represented safely under the scheme.
- A future production requirement needs cryptographic identity or third-party timestamping.
- Revision creation materially complicates the P0 lifecycle beyond its value.

## References

- [RFC 8785 JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html)
- [Cloudflare Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [`../architecture/SYSTEM_ARCHITECTURE.md`](../architecture/SYSTEM_ARCHITECTURE.md)
