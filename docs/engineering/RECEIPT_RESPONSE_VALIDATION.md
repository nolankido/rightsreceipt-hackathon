# Protected Receipt Response Validation

**Owning turn:** 045; body consumption updated in [Turn 046](RECEIPT_BODY_LIMITS.md).

## The demonstrated response gap

The protected receipt handler already returns HTML and exact canonical JSON with an `X-Receipt-SHA256` header. Before this turn, the client trusted any successful export response and downloaded its Blob with a JSON filename. An isolated prior-revision witness injected HTTP 200 HTML at that endpoint. The client downloaded the HTML bytes as `rightsreceipt-sandbox.json` and displayed its canonical-export success message.

That witness uses the actual old client in a Node VM with a synthetic current view and transport. The native handler emits correct canonical JSON. The witness establishes an unexpected successful-response failure, not a server authorization bypass or an incorrect ordinary handler response.

## Validate successful response metadata first

Both protected HTML and JSON require HTTP 200 and a single supported media type. HTML requires `text/html`; export requires `application/json`. Media types are case-insensitive. An absent charset or one UTF-8 charset parameter is accepted, including the quoted form. Missing or combined media types, unknown parameters, duplicate charset parameters and other charsets are rejected.

Both responses also require `X-Receipt-SHA256` to contain exactly 64 lowercase hexadecimal characters. Unsupported successful statuses such as 204 and 206 cannot grant display or download authority. Existing handling for denied access, unavailable records and rate limits remains in place, and rejected metadata is checked before successful-body consumption.

These failures clear active private access and show empty code entry with fixed recovery text. Raw server, parser or cryptographic exception text is not displayed. Recovery requires deliberately reopening the original link or submitting the private code again.

## Complete HTML timing metadata

Protected HTML must contain exactly one `#rr-document`, and that element must be `MAIN`. Both timing attributes are required:

| Attribute | Accepted value |
| --- | --- |
| `data-checked-at` | A canonical UTC millisecond instant, `YYYY-MM-DDTHH:mm:ss.sssZ` |
| `data-next-boundary` | The same strict instant form, or an explicitly empty string for no next transition |

A missing next-boundary attribute is distinct from a valid empty one. The date shape, finite timestamp and `Date` round-trip must all agree, rejecting normalized invalid dates and ambiguous alternate representations.

HTML parsing and metadata validation now occur inside the owned request operation, followed by an elapsed deadline check. A parse that completes after the 15-second budget cannot gain authority under the longer view-freshness window. The existing request-start age, licensing-boundary and UTC-midnight fences remain unchanged.

The digest advertised by this HTML response is retained in its view. It identifies the canonical receipt represented by the server response; it is not a digest of the HTML markup itself. This turn does not add a client-side hash of HTML or duplicate the server's rendering/source validation.

## Verify exact export bytes against the current view

Before an export body is consumed, its digest header must match the digest retained from the current HTML view. If the server has advanced to another valid revision, the client requires the user to load that current record before exporting it. A different receipt cannot be silently substituted for the one displayed.

Turn 046 reads the body through a bounded stream into a fixed-capacity accumulator. The canonical payload size ceiling remains 262,144 bytes, and empty or oversized bodies are rejected before parsing or hashing. Declared identity lengths must agree with actual bytes. See the [body limit guide](RECEIPT_BODY_LIMITS.md) for compressed metadata, chunk boundaries and cancellation behavior.

The client decodes those bytes as strict UTF-8 and parses JSON. Invalid UTF-8, a BOM, malformed JSON and a non-object root fail validation. The envelope must have the supported schema tag, UUID case/chain identifiers, an opaque public reference, a positive safe revision number, the expected previous-hash shape, a material hash, a strict creation timestamp and object-valued material/audit sections.

These are response-envelope checks. Rights, pricing, payment evidence, audit relationships, canonical serialization and receipt-chain semantics remain independently validated by the existing server. The browser does not reinterpret those business rules or replace that authority.

WebCrypto computes SHA-256 over the original bytes. The computed digest must match the advertised digest, which must also match the current view. The download is constructed from those exact verified bytes with the existing JSON filename. There is no parse-and-reserialize step, whitespace cleanup or Unicode normalization.

A digest match provides byte consistency with the supplied receipt response and displayed view. It does not establish a digital signature, identity, copyright ownership or permission beyond the server's validated record.

## Validation keeps the existing request ownership

Headers, bounded body consumption, UTF-8 decoding, JSON parsing, hashing and verified-Blob construction share the original 15-second operation budget. No stage starts a fresh deadline. Wall-clock and monotonic checks reject late completion even when timer callbacks are delayed.

Close, a replacement code, hidden-page clearing, history clearing and view expiry invalidate the operation before a later conversion or digest can finish. A WebCrypto computation itself is not abortable by the client; its late result cannot create a download URL, report success or restore access. The response race settles the page promptly without waiting for that result.

Timers cannot preempt synchronous parsing. Post-parse checks reject an over-budget result when execution resumes. Turn 046 bounds accepted decoded bytes before complete buffering and cancels the reader at the first overflow. The bound does not control browser transport buffers or an oversized chunk already allocated by its producer.

## Verification and commands

```bash
pnpm receipt:experience:verify
pnpm receipt:response:browser
```

The native client collection remains part of `receipt:experience:verify`, `verify:static` and `verify`. Direct focused execution with Node 22 is available:

```bash
node --no-warnings --experimental-strip-types scripts/receipt-client-local.test.mjs
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/consent-ts-test-loader.mjs scripts/receipt-response-browser-check.mjs
```

`RR_PLAYWRIGHT_MODULE` and `RR_CHROMIUM` select local browser installations. `RR_RECEIPT_RESPONSE_ARTIFACTS` selects response-browser evidence output. The prior `receipt:recovery:browser` command remains available for session, cancellation and output regression.

The native collection evaluates the actual client with synthetic DOM, metadata, transport, clocks and output hooks, while WebCrypto hashing is real. The browser collection uses actual receipt handlers, canonical SQLite services and receipt issuance, with explicitly injected successful-response faults and delayed real hashing. Synthetic initial requests, reviewed terms and quotes are fixture data; gateway/provider transport is injected. Receipt actions must add no provider calls or database writes after setup.

See [Turn 045](../turns/045-p0-receipt-response-validation.md) and the [verification summary](../evidence/turn045/verification.json) for executed counts, hashes, screenshots, fault boundaries and remaining release gates.
