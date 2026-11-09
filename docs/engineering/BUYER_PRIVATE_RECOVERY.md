# Buyer Private Access After Terminal Errors

**Owning turn:** 043

## The demonstrated gap

The buyer review page keeps its private code in a JavaScript closure and clears the code from the URL fragment before requests begin. Its private view normally expires after five minutes. Before this turn, an acceptance rejected with HTTP 400 or 409 called `clear()`: displayed rights and financial controls disappeared, but the private code remained. That same call canceled the view timer and reset its deadline. Reload stayed enabled because it checked whether a code still existed.

A browser witness against the clean Turn 042 revision reproduced a real stale-offer rejection. After advancing the browser clock by 300,001 ms, the access form was still hidden and Reload remained enabled. A programmatic Reload sent two authorized GET requests using the retained code. No automatic requests, acceptance or provider calls occurred in that witness. Server capability checks remained enforced; the defect was the browser's finite retention of private access.

## Terminal recovery now uses complete locking

The acceptance handler now routes HTTP 400 and 409 through the existing `lock()` operation and returns immediately. The outer review-load error boundary also uses complete locking for an unexpected completion failure. It no longer clears only the display while retaining access without a timer.

That operation:

- Advances the view epoch and requests cancellation of its controller.
- Removes the private code and pending acceptance from active page state.
- Clears the pending payment check, financial status, receipt state and payment/public-verification link destinations.
- Cancels the view, status and handoff timers and resets their deadlines.
- Clears the displayed rights and acceptance statement, unchecks confirmation, and disables consequential controls.
- Reveals an empty private-code field and disables Reload.
- Restores code-entry focus only when the interrupted user action still owns focus.

The message identifies a changed or locked offer, or an acceptance that could not be confirmed, and explains how to reopen the original review link or enter its private code. The shared HTTP 409 message used by other operations is unchanged.

An unexpected outer load failure receives fixed recovery copy. Its raw exception message is not displayed. If the server already acknowledged acceptance before the following load fails, that acknowledgement remains alongside the recovery instructions. Existing authentication and request-deadline messages retain their established meaning. Private lifecycle clearing still takes precedence.

## Reentry is deliberate

Once locked, dispatching a click on Reload or submitting the hidden acceptance form cannot reuse the old code or create a command. Waiting beyond the old five-minute deadline does not restore access. The active view no longer holds a reusable private code.

Reopening the original link or entering the code again starts a fresh authorized read. The server still decides whether the capability is current and permitted to access the case. The current rights, price and case identifiers are loaded again, and confirmation begins unchecked. A later acceptance requires a separate explicit action and a command derived from that new view. A rejected command is not silently replayed.

Clearing this page does not revoke the server capability, invalidate someone else's copy of the link, or prove that earlier server work was rolled back. It is client-state cleanup. The original link remains usable only while the server's existing capability rules permit it.

## Recovery boundaries that remain distinct

| Condition | Recovery behavior |
| --- | --- |
| Acceptance HTTP 400/409 | Complete private locking and deliberate code reentry |
| Authentication/access rejection | Existing complete private locking and access guidance |
| Unexpected outer load-completion failure | Complete private locking with fixed copy and any acknowledged-save note |
| Acceptance timeout, dropped reply or nonterminal server error | Preserve the exact pending command and frozen confirmation while the private view remains valid |
| Offer unavailable while an independently valid current receipt exists | Preserve the existing bounded receipt fallback |
| Independent payment/status expiry or non-authentication failure | Clear that status and its authority while retaining the existing private-view lifetime |
| Payment handoff HTTP 400/409 | Clear stale status and require Reload within the existing private-view lifetime |

Only the terminal cleanup paths changed. A nonterminal uncertain write still permits an explicit exact retry. Independent receipt access and financial-status validation retain their own guards. None of these transitions accepts rights, starts an invoice action, grants permission or contacts a provider automatically.

## Verification and reproduction

The targeted browser collection uses the real buyer page, scripts and transaction handlers with the existing canonical SQLite fixture. A canonical terms revision produces a real HTTP 409. The HTTP 400 test deliberately changes a command at the intercepted transport boundary so the actual handler rejects its malformed shape. The outer generic catch is exercised with an explicitly injected, one-shot client completion fault after valid reads; ordinary API 500 responses are handled by the nested optional-read paths and are not presented as reaching that outer catch.

Checks cover full clearing, focus recovery and moved-focus preservation, inactive controls after expiry, deliberate reacquisition, fresh unchecked confirmation, no automatic acceptance/provider work, acknowledged saves and unchanged exact retries. The existing transaction stale-offer scenario also checks the private-access boundary.

```bash
pnpm buyer:boundary:browser
```

Native invocation with Node 22, Playwright and Chromium available:

```bash
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/consent-ts-test-loader.mjs scripts/buyer-private-boundary-browser-check.mjs
```

`RR_PLAYWRIGHT_MODULE` and `RR_CHROMIUM` select the available local installations; `RR_BUYER_BOUNDARY_ARTIFACTS` selects the output directory. See [Turn 043](../turns/043-p0-buyer-private-recovery.md) and [verification.json](../evidence/turn043/verification.json) for the executed counts, source hashes and before-change witness.

Clock advancement, transport mutation, the completion fault, managed gateway assertions and provider responses are controlled local injections. No deployed Worker, Cloudflare D1 or genuine provider behavior is established by these checks. The pinned clean-install/build and external release gates remain open.
