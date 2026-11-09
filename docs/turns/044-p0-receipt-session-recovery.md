# Turn 044 Receipt: Protected Receipt Session Recovery

- **Status:** Completed and locally verified.
- **Date:** October 28, 2026 UTC.
- **Objective:** Recover from repeated receipt-code submissions and prevent canceled or stale operations from printing or downloading a receipt.
- **Scope:** One receipt client, deterministic client tests, actual-handler browser scenarios, relevant regression, evidence and next-unit selection.
- **Schema/dependencies:** No migration, database, dependency or workspace package change. External runtime flags remain off.
- **Release status:** NOT READY; external verification and pinned-toolchain gates remain open.

## Before-change evidence

An isolated witness reran the receipt client from commit `4c6b61797478678f0313eeac75250b2a3b0fea7a`. With its first response held, a second valid submission advanced the session while `busy` prevented a new read. After the old response was released, a third valid submission still started no request. The page stayed checking, its actions were hidden, and the stale response was discarded before parsing.

That witness uses the actual old client in a Node VM with three distinct synthetic codes, a minimal DOM, a deferred response and inert timers. It is a reproduced client race, not a browser or authorization test. The repaired paths are independently exercised in the new browser suite through actual handlers.

The same review found a related output race: Print awaited a load that returned immediately during a pending export, then used visible actions as permission to print without completing its own fresh check.

## Shipped behavior

Each receipt request now owns its session, captured code, controller and start clocks. A new valid submission invalidates and aborts older work before starting its own read. Same-code and different-code replacements both recover. Old completions and cleanup cannot alter the newer request or view.

Close stays visible and enabled during loading and export. The code form remains available for deliberate replacement; Refresh, Print and Export are disabled with internal guards. Close, hidden-page clearing, pagehide and restored history clear active private state and cancel pending work. No response can reopen that cleared session.

A 15-second budget now bounds headers and complete HTML/Blob consumption, including transport that ignores abort. Elapsed wall-clock and monotonic checks reject completion after delayed timers. Failed reads clear active access and show empty code entry with fixed recovery copy.

Successful HTML grants at most 60 seconds of view freshness from request start, further bounded by its next licensing transition and UTC midnight. Invalid check timestamps and nonempty invalid boundary values fail closed. Idle expiry clears the document and refreshes; expiry during export locks and suppresses the download.

Print must complete its own fresh HTML read and still own that exact view. A canceled print cannot print a newer session's document. Export retains the current view's original deadline, preserves exact canonical bytes and checks ownership and freshness before the download. The existing server capability, source, integrity and final-authorization checks are unchanged.

## Verification

| Collection | Executed result |
| --- | --- |
| New deterministic receipt-client collection | **40 passed**, zero failed/skipped/cancelled |
| New receipt recovery browser collection | **126 checks passed**, 15 scenarios |
| Full final native regression, 52 files | **2,211 passed**, zero failed/skipped/cancelled |
| Existing transaction/receipt browser | **130 checks passed**, 19 scenarios |
| Existing asset-only intake browser | **119 checks passed**, 8 scenarios |
| Combined browser checks executed this turn | **375 passed** |
| Strict source TypeScript 5.8.3 | Transaction/receipt scope passed |
| All-source TypeScript syntax | **176 files**, no syntax errors |
| Formatting, workspace and whitespace | Passed; 328 files, 13 packages, 24 internal edges, no cycles |

The final native result covers all 52 collections on unchanged source. The first sandboxed attempt blocked the rehearsal isolation collection from spawning local Node subprocesses (`EPERM`), producing 13 failures in that file. The same unmodified collection passed all 15 tests when rerun with local child-process permission. Initial and retry records are retained; the final count replaces that file's first result and does not count it twice. No product or test code changed for the rerun.

Both existing browser collections passed with all 291 source hashes unchanged before and after, fingerprint `dd0236273b5c10d741478868bf93772298236f4be1f994d462a47ef8c5c25821`. Runtime was Node 22.18.0 and Chromium 140.0.7339.16.

The deterministic tests execute the actual client in a synthetic VM and cover both clocks, deferred dispatch, same/different codes, late headers/bodies, lifecycle invalidation, full-body deadlines, timing metadata, licensing boundaries, UTC midnight, fresh print and exact Blob output. They do not establish DOM layout, canonical integrity or handler authorization.

The browser suite uses actual transaction/receipt handlers, canonical SQLite services and receipt issuance. Synthetic initial requests, reviewed terms and quotes are fixture setup. Consent, invoice, reconciliation and issuance setup uses real services with injected gateway/provider responses. Every browser scenario records zero additional provider calls and database writes after that setup. The different-code scenarios use two isolated fixture databases; this is explicitly labeled.

Header/body faults replay native handler responses through a wrapper that ignores abort. Clocks, hidden/history events and print hooks are controlled locally. Successful JSON downloads preserve actual canonical bytes and SHA-256. Pending Close and mobile timeout screenshots were inspected for readable recovery, available cancellation, disabled output and no horizontal overflow.

The current transaction and intake browser regressions that execute the protected receipt client are rerun. Unchanged creator/buyer/clarification/deadline browser collections and older receipt smoke/layout scripts were not rerun and do not count toward this turn's results. No broader browser or screen-reader audit is claimed.

## Reproduction and records

```bash
pnpm receipt:experience:verify
pnpm receipt:recovery:browser
```

The new native client collection is part of `receipt:experience:verify`, which already participates in `verify:static` and `verify`. The browser command requires locally available Playwright/Chromium. Runtime selectors and direct Node commands are documented in the engineering guide.

Records: [engineering guide](../engineering/RECEIPT_SESSION_RECOVERY.md), [verification summary](../evidence/turn044/verification.json), [prior-revision witness](../evidence/turn044/receipt-pending-baseline.json), [targeted native results](../evidence/turn044/receipt-client-native.json), [targeted browser results](../evidence/turn044/receipt-recovery-browser.json), [native regression](../evidence/turn044/native-regression.json) and [existing browser regression](../evidence/turn044/existing-browser.json).

## Remaining gates and next boundary unit

No account-owner task, credentials, customer messages, real payments, paid service, GitHub Actions, deployment or remote schedule was required. Merchant identity remains blank. Genuine managed sessions, Sandbox payment/refund/webhook exchange, deployed Worker/D1 and pinned clean-install/typecheck/lint/Vitest/Vite/Wrangler gates remain open. Available TypeScript 5.8.3 does not replace pinned 5.9.3 verification.

**Next:** Turn 045 P0, validate protected receipt response formats before display and download. A [read-only VM witness](../evidence/turn044/receipt-export-format-baseline.json) shows an injected successful HTML response at the JSON endpoint being downloaded with a JSON filename and a canonical-export success message. The production handler emits correct canonical JSON; the witness tests an unexpected successful-response fault, not an authorization bypass. It uses a synthetic current view and transport, with no browser, handler, database or provider execution.

Validate expected response formats and complete timing metadata, verify the provided receipt digest where appropriate, and retain exact canonical export bytes. Keep cancellation, freshness and session ownership intact. Continue locally without account-owner dependencies; public deployment and submission assets remain separate work.
