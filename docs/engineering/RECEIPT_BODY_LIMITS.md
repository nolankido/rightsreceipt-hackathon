# Protected Receipt Body Limits

**Owning turn:** 046

## The demonstrated buffering gap

Turn 045 checked the export Blob against the server's canonical JSON ceiling before parsing and hashing. That prevented an oversized download, but `Response.blob()` still consumed the entire response first. An isolated rerun of the prior client supplied 394,831 bytes through an actual Node `Response` and `ReadableStream`. All bytes were buffered before rejection; the stream reached its end without cancellation. No download occurred and private access cleared.

The native handler emits bounded canonical JSON. The witness injects an unexpected response into the actual client with a synthetic DOM, current view and transport. It counts consumed bytes, not heap allocation or browser memory exhaustion.

## Count decoded bytes as they arrive

Protected HTML and JSON now use a stream reader. Each chunk is checked before its bytes are copied into a fixed-capacity accumulator. Empty chunks do not accumulate metadata. A list of chunks or references to their backing buffers is not retained. A missing or unusable body has no convenience-method fallback that could buffer it without a limit.

| Format | Maximum decoded body bytes | Basis |
| --- | ---: | --- |
| Canonical JSON export | 262,144 | Existing server canonical payload ceiling |
| Protected HTML | 131,072 | Current renderer, validated field limits, escaping and fixed QR dimensions |

Both formats must be nonempty. At the first chunk that would exceed a limit, the client cancels the reader, aborts the request and clears private access. It does not copy that chunk, parse the partial body or hash it. A valid complete body is sliced to its actual size. HTML uses strict UTF-8 decoding; a leading UTF-8 BOM remains accepted for HTML. JSON retains strict UTF-8 decoding with BOM rejection and uses its original bytes for SHA-256 and the verified download.

The limit applies to bytes delivered by the response reader after content decoding. It bounds the client's accepted accumulator and later parsing input. A browser or producer can already have allocated a large chunk before delivering it, and a normal stream may prefetch data. This change does not claim to cap transport buffers, all heap allocation or the size of a producer's individual chunk.

## Declared lengths are checked independently

An absent `Content-Length` is valid. If present, it must contain only decimal digits after trimming and must represent a safe nonnegative integer. Leading zeroes are allowed. Combined values, signs, exponent notation, fractional values and unsafe integers fail before a body read.

For an absent, empty or `identity` content encoding, the declared length must be positive and within the format's limit. Reading stops if the accumulated bytes would exceed that declaration. The completed body's length must equal it. These checks detect early oversize declarations, dishonest short declarations and truncated responses.

For a nonidentity `Content-Encoding`, a numeric declaration describes encoded wire bytes. The client validates the declaration's syntax but does not compare it with decoded byte counts or the decoded body limit. The actual decoded stream is still bounded. A false or misleading declaration never removes that bound or the existing receipt validation.

Browser fixtures simulate decoded bodies with compressed-response metadata. They do not claim to test a compression implementation or live network transfer.

## HTML bound and regression

The renderer's free-text fields are bounded in `packages/receipts/src/material.ts`: 32 quote descriptions of at most 300 UTF-16 units, a 200-unit title, two 120-unit display names, an 80-unit acceptance version and three 120-unit provenance strings. Their total is 10,480 units. Escaping expands one such unit to at most six UTF-8 bytes.

| Contribution | Conservative byte budget |
| --- | ---: |
| Escaped bounded free text | 62,880 |
| Other constrained dynamic output | 8,192 |
| Fixed template, CSS, labels and 32 row wrappers | 16,384 |
| Fixed 41 by 41 QR matrix and SVG wrapper | 28,672 |
| Total source-reviewed bound | **116,128** |
| Headroom below the client ceiling | **14,944** |

The dynamic allowance covers constrained terms, amounts, timestamps, hashes, identifiers and the two occurrences of a QR-compatible public URL. The QR bound allows every cell to emit the longest path segment, plus its wrapper. These are conservative source-reviewed budgets, not a claim that every payload or QR pattern has been enumerated.

Permanent experience tests issue and read receipts through actual production material, chain and HTTP validation using synthetic source snapshots with maximal escaped text, 32 quote rows and 1,024 audit anchors. Active, scheduled, expired, refunded and revoked cases render between 84,984 and 85,141 bytes. Their canonical JSON is independently within its ceiling. Future changes to rendered fields, row limits, CSS or QR dimensions must retain this regression or revise the documented budget deliberately.

## Reader cleanup keeps the existing ownership

The original request still owns one 15-second budget across headers, streaming, decoding, parsing and hashing. Each read is checked before and after it awaits a chunk. Both wall and monotonic clocks remain enforced, followed by checks after synchronous parsing and asynchronous hashing.

Close, deliberate code replacement, hidden-page clearing, history clearing and receipt freshness expiry cancel an active reader as well as its request. Reader cancellation is best effort and is never awaited by the UI: a thrown error, rejected promise or unsettled cancellation cannot prevent recovery. The reader lock is released where possible. If an abort-ignoring fetch supplies headers after the operation ended, that late body is also canceled without gaining authority.

No stale read may restore the private document, create a download URL, print or report export success. Existing status/media/digest/timing/envelope validation and exact-byte binding remain in force. Client cancellation does not prove that a server stopped processing, and clearing the tab does not revoke a server capability.

## Verification and commands

```bash
pnpm receipt:experience:verify
pnpm receipt:stream:browser
pnpm receipt:response:browser
pnpm receipt:recovery:browser
```

The native experience and client collections remain included in `verify:static` and `verify`. Direct focused execution is available with Node 22:

```bash
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/receipt-ts-test-loader.mjs --test scripts/receipt-experience-local.test.mjs scripts/receipt-client-local.test.mjs
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/consent-ts-test-loader.mjs scripts/receipt-stream-browser-check.mjs
```

Browser execution requires local Playwright and Chromium. `RR_PLAYWRIGHT_MODULE` and `RR_CHROMIUM` select installations; `RR_RECEIPT_STREAM_ARTIFACTS` selects the streaming collection's output directory.

Native checks use the actual client with synthetic DOM, clocks, transport and output hooks, plus real WebCrypto and focused real-stream cases. Browser checks use actual transaction/receipt handlers, canonical SQLite services and production issuance. Initial requests, reviewed terms and quotes are synthetic fixture setup; gateway/provider responses are injected. Deliberately padded bodies and paired digest headers are response faults, not claims that a canonical service emitted oversized records. Receipt actions add no provider calls or database writes after setup.

See [Turn 046](../turns/046-p0-receipt-body-limits.md), the [verification summary](../evidence/turn046/verification.json) and the [HTML bound record](../evidence/turn046/receipt-html-bound.json) for exact evidence and remaining release gates.
