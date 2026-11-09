# Protected Receipt Session Recovery

**Owning turn:** 044

## The reproduced failure

The protected receipt page previously advanced its session whenever a valid access code was submitted. Its loader separately returned immediately while `busy` was true. A second submission during the first read therefore changed the session without starting another read. When the first response arrived, it was stale and could no longer clear `busy`. A third submission still sent no request. The receipt stayed at "Checking current receipt and integrity..." with its actions hidden.

A read-only witness reran the actual client from the prior commit in a Node VM, using three distinct synthetic codes and one deferred response. It reproduced one request after all three submissions. The witness uses a minimal DOM and controlled transport; it does not establish browser layout or handler behavior. The new browser collection separately verifies the repaired behavior through actual receipt handlers.

## Requests own their session

Each HTML read or JSON export now owns its session, captured access code, cancellation controller and request start clocks. A completion can change the page only while that exact operation still owns the current session. Its cleanup also checks ownership, so an older operation cannot release a newer request's busy state.

Every valid form submission first invalidates the previous session and requests cancellation, then starts a read with the newly supplied code. Both repeated same-code submissions and different-code submissions work. The previous rights display and output authority disappear immediately. No request or code is retried automatically after failure.

The actions group remains visible while access is active. Close stays enabled during pending work; Refresh, Print and Export are disabled and have matching internal guards. The code-entry form is available during a pending request, allowing deliberate replacement. Activating unavailable controls programmatically cannot start another read or release output.

Close clears the active code, input, receipt content, timers and output authority, invalidates the session and aborts the pending request. Explicit Close returns focus to code entry. Hidden-page clearing, `pagehide` and persisted `pageshow` use the same state invalidation without forcing focus. Restoring visibility does not reopen the receipt.

## Bounded reads and deliberate recovery

One 15-second budget covers response headers and the complete HTML or Blob body. The request races completion against its timeout and cancellation. This allows the application to settle even if a test transport ignores abort. Wall-clock and monotonic elapsed checks also reject late completion when a timer callback has not run yet.

All failed reads and exports clear active access and expose empty code entry. HTTP errors use fixed recovery copy, and unexpected exception text is not reflected. Existing access-denied wording remains unchanged. The timeout message explains how to reopen the original receipt link or enter the code again.

Cancellation requests do not prove that remote work stopped. These receipt routes remain read-only, and the server's existing capability, source and integrity checks still govern every response. Clearing active browser state does not revoke a server capability or guarantee erasure of data already held by an in-flight transport.

## Freshness and output authority

Successful HTML must contain a receipt document and a finite `checkedAt`. A nonempty licensing boundary must also parse to a finite instant. The client's view lifetime is the smallest of:

- 60 seconds from the start of its HTML request.
- The server-reported interval to the next licensing boundary.
- The interval from the server check to the next UTC midnight.

Both wall-clock and monotonic deadlines must remain current. Counting from request start conservatively includes transport and body-consumption time. UTC midnight matters because calendar status can change before the licensing period ends, and the server rejects a read that crosses its checked UTC day.

When an idle current view reaches that budget, the existing status refresh clears the displayed receipt before reading again. If an export is still pending, expiry locks the page and cancels that export. Delayed timer callbacks cannot authorize a print or download after the deadline; the output checks test freshness again. Timers cannot preempt blocked synchronous JavaScript, so this is a completion and action boundary rather than a claim of instantaneous clearing during a blocked event loop.

| Action | Required authority |
| --- | --- |
| Refresh | An active code, no pending operation and a visible page |
| Print | A current view, then a successful fresh HTML read owned by that print operation |
| Export | A current view, a successful complete response from the JSON endpoint and the same still-current view at download time |
| Close or new code | Immediate invalidation of older reads and output continuations |

A print canceled by replacement cannot print the newer session's document. Print is also blocked while export is pending. Export preserves the handler's exact canonical bytes and the current filename; this turn does not add client-side MIME, schema or digest verification. Those response-contract checks are the next distinct boundary unit.

## Verification and commands

The deterministic collection evaluates the actual exported client with a synthetic DOM, HTML metadata, clocks, transport and output hooks. It covers replacement before dispatch and during body consumption, late-result rejection, lifecycle clearing, request deadlines, malformed timing values, request-start freshness, licensing boundaries, UTC midnight and print/export ownership.

```bash
pnpm receipt:experience:verify
pnpm receipt:recovery:browser
```

The first command includes the existing receipt experience collection and the new client collection. Direct focused execution with Node 22 is available:

```bash
node --no-warnings --experimental-strip-types scripts/receipt-client-local.test.mjs
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/consent-ts-test-loader.mjs scripts/receipt-recovery-browser-check.mjs
```

`RR_PLAYWRIGHT_MODULE` and `RR_CHROMIUM` select local browser installations. `RR_RECEIPT_RECOVERY_ARTIFACTS` selects browser evidence output.

The browser collection uses actual pages, receipt handlers, canonical SQLite services and receipt issuance. Synthetic requests, reviewed terms and quotes are initial fixture data. Consent, invoice, reconciliation and issuance setup uses the existing services with injected gateway/provider responses. The receipt actions then produce zero additional provider calls or database writes. Different-code scenarios use two isolated canonical fixture databases, each enforcing its own actual capability authorization.

Header and body faults replay actual handler responses through an injected wrapper that deliberately ignores abort. Browser clocks, lifecycle events and print hooks are controlled locally. Actual JSON downloads are compared with retained canonical bytes and SHA-256. This is local browser verification, not live provider, deployed Worker/D1 or screen-reader evidence.

See [Turn 044](../turns/044-p0-receipt-session-recovery.md) and the [verification summary](../evidence/turn044/verification.json) for executed counts, hashes and remaining release gates.
