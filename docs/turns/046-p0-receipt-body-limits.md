# Turn 046 Receipt: Bounded Protected Receipt Bodies

- **Status:** Completed and locally verified.
- **Date:** October 28, 2026 UTC.
- **Objective:** Bound protected receipt body consumption before complete buffering while preserving valid bytes, response validation and cancellation.
- **Scope:** One production receipt client, native boundary and renderer regressions, a streaming browser collection, affected regressions and evidence.
- **Schema/dependencies:** No migration, database, dependency or workspace package change. External runtime flags remain off.
- **Release status:** NOT READY; external verification and pinned-toolchain gates remain open.

## Before-change evidence

An isolated witness reran the client from commit `be9c09082328b5933f72b2c4ecdbedde32a9c334`. It supplied an unexpected 394,831-byte JSON body using an actual Node `Response` and `ReadableStream`. The client buffered every byte into a Blob, then rejected it against the 262,144-byte ceiling. The stream reached EOF without cancellation. No download, subsequent ArrayBuffer conversion or hashing occurred, and private access cleared.

The native handler emits bounded canonical JSON. The witness uses the actual old client with a synthetic DOM, current view and transport. It establishes complete-body consumption before rejection, not a handler authorization bypass or measured memory exhaustion.

## Shipped behavior

Protected HTML and JSON now use bounded streaming. The client checks each chunk before copying accepted bytes into a fixed-capacity accumulator. JSON retains the server's 262,144-byte ceiling; HTML has a separately justified 131,072-byte ceiling. Both must be nonempty. The client cancels at the first overflow, without copying that chunk or parsing/hashing the incomplete body. No `text()`, `blob()`, `json()` or `arrayBuffer()` fallback can bypass the bound.

An optional declared length must be decimal and safely representable. With absent, empty or identity content encoding, a zero or oversized declaration fails before a read, cumulative bytes may not exceed it, and EOF must match it. With nonidentity encoding, encoded length is checked as metadata while actual decoded bytes remain bounded independently.

The stream shares the original 15-second operation budget and current view/session checks. Close, replacement, lifecycle clearing, expiry or timeout cancels and releases the reader where possible. Cancellation errors or unsettled promises cannot hold the UI. A response arriving after cancellation has its unread body canceled too. Late chunks cannot restore a private view, print, hash or release a download.

Existing status/media/digest/timing/envelope checks remain active. HTML now rejects malformed UTF-8 while allowing a UTF-8 BOM. JSON retains strict decoding and BOM rejection. Verified JSON downloads preserve the original bytes and current-view digest binding. Server capability, canonical, chain and business-source validation are unchanged.

## HTML budget

Current field validation bounds rendered free text to 10,480 UTF-16 units, at most 62,880 bytes after escaping. Conservative allowances for other dynamic output, the fixed template/CSS and the fixed QR yield a 116,128-byte source-reviewed bound, leaving 14,944 bytes below the client ceiling.

Five permanent regressions issue and read domain-valid synthetic receipts through actual material, chain and HTTP validation. They exercise maximum escaped strings, 32 quote rows, 1,024 audit anchors and maximum supported origin/invoice lengths for active, scheduled, expired, refunded and revoked states. Rendered bodies are 84,984 to 85,141 bytes; canonical JSON is 164,071 to 164,257 bytes. GETs add no writes. The bound and stress inputs are documented in the [HTML evidence](../evidence/turn046/receipt-html-bound.json).

## Verification

| Collection | Executed result |
| --- | --- |
| Expanded deterministic receipt client | **141 passed**, 39 more than Turn 045 |
| Receipt experience and renderer collection | **116 passed**, including five new maximum-field cases |
| Full final native regression, 52 files | **2,317 passed**, zero failed/skipped/cancelled |
| New receipt streaming browser collection | **165 checks passed**, 15 scenarios |
| Existing receipt response browser collection | **193 checks passed**, 13 scenarios |
| Existing receipt recovery browser collection | **126 checks passed**, 15 scenarios |
| Existing transaction/receipt browser journey | **130 checks passed**, 19 scenarios |
| Existing asset-only intake browser journey | **119 checks passed**, 8 scenarios |
| Combined final browser execution | **733 checks passed**, 70 scenarios |
| Strict TypeScript 5.8.3 | Transaction/receipt source scope passed |
| All-source TypeScript syntax | **176 files**, no syntax errors |
| Formatting, workspace and whitespace | Passed; 330 files, 13 packages, 24 internal edges, no cycles |

Both the full native run and the five-suite browser run verified all 293 source hashes unchanged before and after, fingerprint `d7e0ff934fef774a0f5f8acb63804ffe63b0effe614a1f961b2ae894b3323c4c`. Runtime was Node 22.18.0 and Chromium 140.0.7339.16. Only final executed results are counted; targeted native cases are included in the full total.

Staged Git whitespace verification then found one extra terminal blank line in the new streaming browser fixture. That single LF was removed; exact byte comparison confirms no other fixture change and all production/native test sources remain unchanged. Tests were not repeated for this formatting-only cleanup. The published source fingerprint is `16ff8bf5dad719b22bb7f174eb2162018c1b046b0983af82ccc654a91941d0a0`; the execution reports retain their actual pre-cleanup fingerprint and script hash. The verification summary records both hashes and the exact change.

The independent after-change witness reuses the same 394,831-byte input. The client reads five chunks, including the first overflow chunk, for 327,680 delivered bytes. Normal stream prefetch produces 393,216 bytes. Cancellation occurs before EOF, with no Blob consumption, client digest or download. The accumulator accepts at most 262,144 bytes; delivered bytes and prefetch are not claimed as retained heap measurements.

Native tests execute the actual client with synthetic DOM, clocks, transport and output hooks, real WebCrypto, and real-stream as well as controlled-reader cases. They cover exact limits, split UTF-8, empty chunks, malformed readers, early declaration rejection, truncated/dishonest lengths, compressed metadata, chunked overflow, stalls, late headers and cancellation that throws, rejects or never settles. Previous response/ownership coverage remains; obsolete Blob-mechanism assertions now test the corresponding streaming outcomes.

Browser tests use actual transaction/receipt handlers, canonical SQLite services and production issuance. Synthetic initial requests, reviewed terms and quotes are fixture setup; gateway/provider responses are injected. Faulted streams replay actual handler bytes with controlled chunking, or explicitly labeled padding and paired digest headers. Encoded-length cases inject decoded bytes and metadata, not actual compression. All receipt action scenarios record zero additional provider calls and database writes after setup.

The first streaming browser development attempt found a fixture reentry error: the test tried filling hidden code entry after a successful size case. The helper now closes that view before deliberate reentry. The sanitized initial report is retained; its ten partial checks are excluded from final totals. Intermediate native fixture expectations were corrected to count UTF-8 bytes instead of characters. A scratch runner syntax error prevented initial orchestration from starting any collection; corrected runners then executed the complete final source. These were verification setup issues and required no production change.

Final desktop pending and mobile overflow-recovery screenshots were inspected. Close remains available during pending consumption, output actions are disabled, and empty entry/fixed recovery text fit the mobile viewport without horizontal overflow. No screen-reader or whole-application visual audit is claimed.

Unchanged creator/buyer/clarification/deadline browser collections and older receipt smoke/layout scripts were not rerun. The five selected collections execute the changed receipt client and provide the relevant integration regression.

## Reproduction and records

```bash
pnpm receipt:experience:verify
pnpm receipt:stream:browser
pnpm receipt:response:browser
pnpm receipt:recovery:browser
```

The native client and experience collections already participate in `verify:static` and `verify`. Browser commands require local Playwright/Chromium; the [engineering guide](../engineering/RECEIPT_BODY_LIMITS.md) documents direct execution and runtime selectors.

Records: [verification summary](../evidence/turn046/verification.json), [before-change witness](../evidence/turn046/receipt-body-buffering-baseline.json), [after-change witness](../evidence/turn046/receipt-body-streaming-witness.json), [native client](../evidence/turn046/receipt-client-native.json), [native regression](../evidence/turn046/native-regression.json), [stream browser](../evidence/turn046/receipt-stream-browser.json) and [combined browser regression](../evidence/turn046/browser-regression.json).

## Limits and next boundary unit

The decoded-byte ceiling limits accepted client accumulation and later input. It cannot prevent a producer or browser from allocating a large chunk before delivery, bound all transport buffers, or preempt synchronous parsing. Best-effort cancellation does not prove server cancellation or revoke a capability. Digest agreement establishes byte consistency, not identity, ownership or a digital signature.

No credentials, account-owner task, customer messages, real payments, paid service, GitHub Actions, deployment or remote schedule was required. Merchant identity remains blank. Genuine managed-session, Sandbox payment/refund/webhook and deployed Worker/D1 gates remain open. Pinned clean-install/typecheck/lint/Vitest/Vite/Wrangler verification remains unverified; available TypeScript 5.8.3 does not replace pinned 5.9.3 verification.

**Next:** Turn 047 P0, bound shared transaction JSON response consumption. A [separate read-only witness](../evidence/turn046/transaction-body-buffering-baseline.json) executes the unchanged `readJsonWithDeadline` helper with an unexpected 2,097,181-byte stream. All 33 chunks reach EOF and the parsed object is returned without a byte ceiling. This does not assert that a caller accepts/displays the padding or that an existing declared size contract is violated. Derive supported response budgets for the six review, clarification and intake clients; preserve parent cancellation, the original deadline and exact same-command recovery after uncertain mutations. Keep this local without account-owner dependencies.
