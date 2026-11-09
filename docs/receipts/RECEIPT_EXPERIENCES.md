# Receipt and public verification experiences

**Turn:** 029
**Date:** October 27, 2026 HST
**Source base:** `25cdfadc086a33c56a2b4cf5e486b8633cae0d21`
**Original Turn 029 delivery:** Implemented and verified locally, then preserved as an exact-base overlay because repository-write tools were unavailable in that session.
**Turn 030 recovery:** The overlay is included in the combined Turn 029/030 repository change set. Current expiration behavior and verification evidence are documented in [Expiration and status](EXPIRATION_AND_STATUS.md). No deployment is claimed.

## Implemented surfaces

The new read-only Worker handler uses server-rendered HTML instead of loading the full React application for a signed-out verification page. Its Request/Response boundary is testable without Hono or Vite. Existing React and simulated receipt routes remain intact.

| Route | Access and representation |
| --- | --- |
| `/verify/receipt/:publicId` | Signed-out HTML status, receipt hash, asset identity and licensing interval |
| `/api/receipt-verification/:publicId` | Same public allowlist as JSON, not a canonical receipt export |
| `/receipts/buyer` | Buyer access shell; no private data in initial markup |
| `/api/receipts/buyer?format=html` | Current private receipt, valid receipt-scoped bearer required |
| `/api/receipts/buyer?format=print` | Same verified printable HTML and receipt hash |
| `/api/receipts/buyer?format=json` | Exact stored canonical JSON bytes and SHA-256 response header |
| `/api/receipts/creator/:caseId` | Same protected formats, injected authenticated creator session required |
| `/assets/receipt-access.js` | Local buyer access/refresh/export/print client with no embedded secret |

The Worker mounts the routes only through an explicitly enabled Sandbox/judge composition. `RIGHTS_RECEIPT_READ_ENABLED` defaults to false. `RIGHTS_RECEIPT_PUBLIC_ORIGIN` must name the exact configured origin; request and forwarded hosts cannot rewrite verification or QR destinations. The wrapper supplies no creator authorizer, so creator exports remain denied until secure session integration exists. A caller's demo-role header does not authorize them.

## Integrity and lifecycle behavior

Every successful private read and valid public result reuses Turn 028's actual chain verifier and source-material builder. The full hash chain, historical audit anchors, original terms and quote hashes, current financial state, exact consent tuple, permission dates and current receipt pointer must agree. A final source reload after asynchronous hashing guards concurrent changes. Private authorization is checked again before returning data, followed by another source consistency check.

Public outcomes distinguish `active`, `scheduled`, `expired`, `refunded`, `revoked`, `pending_payment`, `pending_receipt`, `canceled`, `rejected`, `review_required`, `invalid` and `not_found`. Pending financial work or a temporal permission that needs refreshing cannot show the old active claim. The reader does not invent a new expiration revision. Refreshing stored temporal state remains Turn 030.

Receipt reads do not issue receipts, fix broken chains, append audits, mutate verification, call PayPal or grant permission. The issuer remains separately opt-in. An old printed copy remains a historical snapshot, not proof that permission is still current.

## Public minimization and private access

Public JSON is an explicit allowlist. It includes only a schema/version label, Sandbox environment, current outcome, integrity result, check time and, for a verified record, asset title/type/fingerprint, period, revision and receipt hash. It excludes buyer organization/name/email, prices, invoice/transaction references, source request text, internal case/quote/consent IDs, model metadata, private audit payloads and capabilities. Public references are the 32-character representation generated from 24 random bytes in Turn 028. Numeric or internal UUID identifiers are rejected.

Canonical JSON contains the already approved export fields from Turn 028, so it is protected even though it excludes raw requests and buyer email. Private HTML shows the licensed scope, restrictions, dates, parties, itemized USD total, accepted versions, PayPal Sandbox reference, recorded extractor/model metadata and hash/audit references. Every stored string is HTML-escaped.

The buyer directory hashes a 43-character bearer token and queries the existing capability record. It requires the `receipt` action, a valid issue/expiry interval and no revocation. Expiry is exclusive. A public reference never becomes a private credential. A token can be supplied in the buyer shell's password input or URL fragment. The client immediately removes the fragment, keeps the token only in memory and sends it only as an Authorization header. It does not put credentials into query strings, local/session storage, cookies, public links, downloads or QR codes. Input is cleared after use. Close, pagehide and restored-history behavior clear the private view. Failed refresh authorization also removes previously displayed private content. These controls do not revoke files a previously authorized user has already saved.

Print first refreshes the private receipt. JSON download obtains a fresh server-validated response, not a serialized client reconstruction. The bytes hash to the same receipt SHA-256 displayed in HTML. The printable page includes the Sandbox limitation, end-exclusive UTC boundary and public verification QR/link.

## QR and response protections

QR generation is local and dependency-free: a bounded Model 2 version-6/L byte encoder with Reed-Solomon correction and a four-module quiet zone. It accepts at most 134 ASCII bytes. A fixed mask is used; an independent Python `qrcode` encoder generated 16 reference matrices for the native tests. One generated verification URL was also decoded successfully with OpenCV during development. The QR encodes only the trusted-origin public verification URL. No external QR service receives private or public identifiers.

Responses use no-store/private cache controls, no-referrer, no indexing, same-origin resource policy, frame denial, MIME sniffing protection and a restrictive content-security policy. Private cross-site requests, unknown formats, query credentials and unsupported methods fail closed. Error text never includes SQL or provider details.

A bounded, salted per-isolate limiter restricts reads and caps its in-memory key map. This is only local defense, not a distributed or account-aware quota. Platform edge rate limiting and access-log redaction remain deployment requirements. A forged platform IP header in a non-platform host must not be treated as trusted client identity. The default-disabled routes must not be exposed as a production-ready service.

## Executed evidence

The new native suite contains **105 tests**, including 16 independently generated QR vectors. Together with the **22 unchanged canonicalization regressions**, the executed native total is **127 passed, 0 failed**.

The tests exercise actual new source modules and the actual Turn 028 issuer, material builder and chain verifier. Private/source fixtures are synthetic in-memory records. The directory's exact SQL executes against native SQLite access tables. These are not the full migration-and-seed suite, D1 or a genuine provider transaction.

Standalone strict TypeScript 5.8.3 passed for the new receipt package modules and server composition with actual recovered internal dependencies and no type stubs. The Worker wrapper has syntax and wiring checks only; the full installed Hono/Worker build remains unverified.

Optional offline Chromium checks produced **32 passes, 0 failures**: desktop/mobile overflow, printable content, statuses, public privacy, accessible labels, one main landmark and DOM client interactions. DOM interactions use in-memory fetch responses, not a real server session. Actual local HTTP browser navigation was attempted and rejected by the environment with `ERR_BLOCKED_BY_ADMINISTRATOR`. No policy bypass was used. Consequently there is no claim of full browser, network authentication, navigation or download acceptance.

Preview images show synthetic data only. Optional preview commands require separately available Python Playwright/Chromium, but no new paid or mandatory runtime dependency is added. Source screenshots are not installed application assets.

## Remaining integration boundaries

The private creator record has a tested authorization contract and rendered representation, but the current Worker denies it because secure creator sessions are unfinished. Buyer access is backed by existing capability SQL, while full end-to-end durable human approval, invoice creation, live provider reads and issuance must still be composed. Read and issuance flags remain disabled; nothing was deployed.

Turn 007 and Gates A/B/C remain open. No pinned dependency installation, root lint/test/build, genuine PayPal transaction, registered webhook, production license, deployed D1 or complete browser journey was performed. A hash is not a digital signature, copyright proof or an external immutable ledger.

The prepared overlay includes Worker/static-path wiring, default-off configuration, the buyer link and root verification-script edits. Its apply helper refuses a different base commit, modified base files, unexpected new-file collisions or content/hash mismatch. It performs no commit, push, remote scheduling or service activation.

Subsequent implementation: **Turn 030, expiration and status visibility**, included with the recovered overlay. The earlier evidence above remains a historical Turn 029 record.
