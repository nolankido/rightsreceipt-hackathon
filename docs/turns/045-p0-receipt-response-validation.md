# Turn 045 Receipt: Protected Receipt Response Validation

- **Status:** Completed and locally verified.
- **Date:** October 28, 2026 UTC.
- **Objective:** Reject unexpected protected receipt responses and verify exact export bytes against the currently displayed receipt.
- **Scope:** One receipt client, expanded deterministic client coverage, a response-fault browser collection, relevant regression and evidence.
- **Schema/dependencies:** No migration, database, dependency or workspace package change. External runtime flags remain off.
- **Release status:** NOT READY; external verification and pinned-toolchain gates remain open.

## Before-change evidence

An isolated witness reran the client from commit `09ff88fca9c43db1fbdaf6d0e673d419e1cf06e7`. With a synthetic current receipt loaded, an injected HTTP 200 HTML response from the JSON endpoint was downloaded as `rightsreceipt-sandbox.json`. Its bytes and MIME remained HTML, and the client reported canonical-export success.

The witness uses the actual old client in a Node VM with a minimal DOM, synthetic current view and injected transport. The production handler emits correct canonical JSON. This is an unexpected successful-response fault, not an authorization bypass or a claim of an incorrect normal handler response.

## Shipped behavior

Successful protected reads require HTTP 200, the expected singleton HTML/JSON media type, supported UTF-8 metadata and a valid 64-character lowercase receipt digest. Existing non-success response handling is preserved. Metadata rejection occurs before the successful body is consumed.

HTML must contain one `MAIN` receipt document and both timing attributes. Strict UTC millisecond parsing and round-trip checks reject missing, ambiguous or normalized invalid timestamps. An explicit empty boundary remains valid. HTML parsing and validation now share the request deadline, including an elapsed check after synchronous parsing.

The HTML digest is retained in its view. JSON export must advertise that same digest, pass UTF-8 and receipt-envelope validation, and hash to that digest over its exact raw bytes. Blob size must be nonzero and at most 262,144 bytes before conversion/parsing/hashing. The verified download uses the unchanged bytes; it does not reserialize JSON or normalize text. A changed valid revision requires loading the current view again before export.

All asynchronous validation remains inside the original operation's cancellation and 15-second budget. Close, replacement, hiding, history clearing or expiry prevents late hashing from releasing a URL, download or success message. Fixed recovery text replaces raw exceptions. Server capability, canonical serialization, domain, payment, source and chain checks are unchanged.

## Verification

| Collection | Executed result |
| --- | --- |
| Expanded deterministic receipt-client collection | **102 passed**, including all 40 prior recovery cases |
| New receipt response browser collection | **193 checks passed**, 13 scenarios |
| Full final native regression, 52 files | **2,273 passed**, zero failed/skipped/cancelled |
| Existing receipt recovery browser | **126 checks passed**, 15 scenarios |
| Existing transaction/receipt browser | **130 checks passed**, 19 scenarios |
| Existing asset-only intake browser | **119 checks passed**, 8 scenarios |
| Combined final browser checks executed this turn | **568 passed** |
| Strict source TypeScript 5.8.3 | Transaction/receipt scope passed |
| All-source TypeScript syntax | **176 files**, no syntax errors |
| Formatting, workspace and whitespace | Passed; 329 files, 13 packages, 24 internal edges, no cycles |

The complete native regression passed all 52 files on final source, including the expanded 102-test client collection. All three existing browser collections passed with all 292 source hashes unchanged before and after, fingerprint `7a5bccfb8e0cc63ddc11752f28389d3d89ad638f9b0f8a2d03e499b3d2f636fd`. Runtime was Node 22.18.0 and Chromium 140.0.7339.16.

The deterministic collection uses the actual client and real WebCrypto with synthetic DOM, responses, clocks and output hooks. It covers success status/media/digest contracts, strict timing metadata, exact and oversized byte limits, invalid UTF-8/BOM/envelopes, raw-byte tampering, current-view digest binding, stalled conversion/hashing, elapsed budgets and lifecycle/freshness invalidation.

The browser collection uses actual transaction/receipt handlers, canonical SQLite services and production receipt issuance. Synthetic initial requests, reviewed terms and quotes are fixture setup. Gateway/provider responses, response faults, clocks, print hooks and delayed digest completion are controlled locally. Browser assertions distinguish ordinary valid handler output from deliberately malformed success responses. No live provider, deployed Worker/D1 or screen-reader evidence is claimed.

The first response-browser attempt collected a test-instrumentation error on the initial `about:blank` page, where WebCrypto was unavailable. A secure-context guard fixed that harness setup. The complete collection then passed on unchanged production source; the initial attempt is retained and its partial checks are not added to the final total.

Every final response-browser scenario recorded zero additional database writes and provider calls after fixture setup. Different-code cases use two isolated canonical fixture databases. Malformed-envelope cases pair an injected digest header on the native HTML and mutated JSON responses to isolate body validation from an earlier view-hash mismatch. Delayed hashing calls actual browser WebCrypto first, then holds or rejects its completion. These are explicitly labeled faults.

Desktop pending-digest controls and mobile invalid-response recovery were inspected. Close remains available during hashing, output controls are disabled, and mobile recovery copy is readable without overflow. The available headless font does not render one CJK glyph in the synthetic title; UTF-8 byte and DOM-text assertions still preserve that character. No font change is part of this turn.

The current receipt-recovery, transaction and intake browser regressions were rerun because they execute the changed protected receipt client. Unchanged creator/buyer/clarification/deadline collections and older receipt smoke/layout scripts were not rerun and do not count toward this turn's results.

## Reproduction and records

```bash
pnpm receipt:experience:verify
pnpm receipt:response:browser
```

The native client collection already participates in `receipt:experience:verify`, `verify:static` and `verify`. The new browser command requires local Playwright/Chromium. The engineering guide documents direct Node commands and runtime selectors.

Records: [engineering guide](../engineering/RECEIPT_RESPONSE_VALIDATION.md), [verification summary](../evidence/turn045/verification.json), [prior-revision witness](../evidence/turn045/receipt-export-format-baseline.json), [targeted native results](../evidence/turn045/receipt-client-native.json), [response browser results](../evidence/turn045/receipt-response-browser.json), [native regression](../evidence/turn045/native-regression.json) and [existing browser regression](../evidence/turn045/existing-browser.json).

## Limits and next boundary unit

The browser verifies response format, envelope shape and byte consistency with the supplied digest/current view. It does not establish identity, ownership, signatures or independent server business-source integrity. It does not hash the HTML markup. The JSON byte limit applies after full Blob buffering, and timers cannot preempt synchronous parsing.

No account-owner task, credentials, customer messages, real payments, paid service, GitHub Actions, deployment or remote schedule was required. Merchant identity remains blank. Genuine managed sessions, Sandbox payment/refund/webhook exchange, deployed Worker/D1 and pinned clean-install/typecheck/lint/Vitest/Vite/Wrangler gates remain open. Available TypeScript 5.8.3 does not replace pinned 5.9.3 verification.

**Next:** Turn 046 P0, bound protected receipt body consumption before complete buffering. A [read-only witness](../evidence/turn045/receipt-body-buffering-baseline.json) uses the actual client and Node Response/ReadableStream to show all 394,831 injected bytes buffered before the 262,144-byte limit rejects the export. No download, ArrayBuffer conversion or digest call occurs, and the private view clears. It measures consumed bytes with fixed clocks and synthetic markup/transport, not heap allocation or browser memory exhaustion. The native handler emits bounded canonical JSON. Add bounded streaming reads with cancellation on overflow, preserve exact valid bytes and the current operation deadline, and verify declared lengths, oversized/chunked or stalled bodies and late completion. Keep this local without account-owner dependencies; public deployment and submission assets remain separate work.
