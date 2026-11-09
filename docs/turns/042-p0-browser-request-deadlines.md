# Turn 042 Receipt: Browser Request Deadlines and Deliberate Recovery

- **Status:** Completed and locally verified.
- **Date:** October 28, 2026 UTC.
- **Objective:** Bound stalled browser reads and uncertain writes across the canonical forms while preserving exact commands, private-state clearing and deliberate recovery.
- **Scope:** Six native buyer and creator clients, one shared request helper, deterministic deadline tests, actual-handler browser fault scenarios, regression evidence and the next local boundary task.
- **Schema/dependencies:** No migration, database, dependency or workspace package change. External runtime flags remain off.
- **Release status:** NOT READY; external verification and pinned-toolchain gates remain open.

## Problem and resulting behavior

A clean Turn 041 browser witness held the initial creator-session request before it reached the handler. After advancing the browser clock by 16,000 ms, the page was still loading and Reload remained disabled. The private-view deadline had not been established. No case or provider work occurred during that witness.

Every JSON request from the six native transaction clients now has a fixed 15,000 ms budget, including headers and complete JSON consumption. The helper races the request against timeout and parent cancellation, so an ignored AbortSignal cannot leave the caller waiting. Elapsed checks reject results at or after the boundary even when the timer callback is delayed.

Creator read failures expose Reload. Buyer intake, clarification and offer timeouts clear private state and expose code reentry. An independently timed-out payment/status read clears financial and permission authority while retaining an already validated eligible offer and its original private expiry. A timed-out prerequisite stops optional fallback reads rather than extending the same failure through another request.

Write timeouts retain the exact pending command and frozen input for a deliberate retry while the private view is still valid. Link issuance also keeps the generated private token; its message directs retry of the same link while the page is open. Invoice creation, sending and recovery remain explicit. Payment handoff timeout does not expose a late URL or imply payment failure, confirmed payment or permission.

The interface distinguishes a write whose outcome is still unknown from a write that the server already acknowledged. If the following refresh request times out or rejects while the private view remains current, the acknowledged save remains in the status message. Private-lifecycle clearing takes precedence. Recovery copy no longer claims that saved state was refreshed before that read actually succeeds.

## Boundary implementation

`REQUEST_DEADLINE_CLIENT` creates a child AbortController for each request. Timing out that child does not poison the parent private view, allowing the same valid view to perform an explicit retry. Clearing or expiring the parent cancels the child immediately. Timers and listeners are cleaned up on success, rejection, timeout and cancellation.

The broader browser regression exposed an additional ordinary-failure cleanup gap during implementation. Rejecting HTTP or content-type validation detached the parent listener while leaving the unread child response active. The helper now aborts that child before rethrowing the original error. An isolated candidate made the unchanged clarification and invoice-recovery suites complete their previously stalled error-body reads. The final native cases explicitly check child cancellation on HTTP 403/409, content-type, fetch and JSON failure while leaving the parent usable.

Both wall-clock and monotonic elapsed time are checked before dispatch, after headers, after the existing synchronous response validator, after JSON consumption and before returning. The native tests cover a backwards wall clock, a conservative forward jump, the exact boundary and late completion before a delayed timer callback. Promise handlers also consume eventual late rejection without accepting a result.

Existing HTTP checks, request policies, response validation, view epochs, private expiry and focus ownership remain in their owning clients. A timeout does not grant consent, repeat a request, create a new command identity, contact a provider by itself or establish financial authority. Abort cannot prove that server work was canceled; exact replay and the server's existing idempotency/reservation checks remain necessary.

This is a deadline per HTTP request, not per complete multi-request page load. The event loop must run to deliver a timer. Synchronous parsing cannot be preempted, and this turn does not impose a response-size limit; elapsed checks reject a late result after execution resumes.

## Verification

| Collection | Executed result |
| --- | --- |
| Full native regression, 51 files | **2,171 passed**, zero failed/skipped/cancelled |
| New deterministic deadline collection | **22 passed**, included in the native total |
| New deadline browser collection | **132 checks passed**, 24 scenarios |
| Existing transaction/receipt browser | **127 checks passed**, 19 scenarios |
| Existing intake browser | **119 checks passed**, 8 scenarios |
| Existing clarification browser | **57 checks passed**, 8 scenarios |
| Existing invoice recovery browser | **88 checks passed**, 12 scenarios |
| Existing adversarial buyer browser | **51 checks passed** |
| Existing keyboard/form recovery browser | **134 checks passed**, 17 scenarios |
| Combined browser checks executed on final source | **708 passed** |
| Strict source TypeScript 5.8.3 | Transaction/receipt scope passed |
| All-source TypeScript syntax | **176 files**, no syntax errors |
| Formatting, workspace and whitespace | Passed; 325 files, 13 packages, 24 internal edges, no cycles |

The new browser suite starts with workspace, asset and policy records only. Actual handlers create every subsequent case, request, answer, terms version, quote, decision, acceptance and invoice operation. Tests hold transport before dispatch and after real handler commits. Attempted browser requests and dispatched handler requests are counted separately.

Nine stalled-read scenarios cover all six page roles. Confirmed write scenarios verify unchanged retry bytes and unchanged record counts after late or lost replies. Invoice creation and sending each remain at one provider write through explicit retries. Recovery does not duplicate sending. Payment handoff retries perform a fresh read only. Payment evidence, permissions and receipt revisions remain zero in all 24 targeted scenarios.

The body-stall scenario takes actual handler JSON bytes and withholds part of them through an injected browser ReadableStream that deliberately ignores abort. Timeout still settles after headers arrive. Releasing that old body after loading a newer submitted view cannot replace the new state. Separate hidden-page and private-expiry scenarios verify that cancellation takes precedence over later timeout messages and committed replies.

Keyboard checks prove that timeout can restore the exact retry control and that deliberate navigation elsewhere cancels the old focus claim. Two timeout screenshots were inspected for readable explanations, frozen controls and expected focus behavior. Gateway/provider transport, clock advancement and lifecycle events are local injections. No live latency, external service or deployed Worker/D1 behavior is claimed.

All six existing browser suites were rerun after the ordinary-failure cleanup fix. The transaction suite's earlier 30-second held-reply assertion now expects the preceding 15-second request timeout, retaining its no-late-link and no-automatic-provider-retry checks. Its independent 30-second expiry test remains intact. The clarification and invoice-recovery harnesses were unchanged, including their HTTP-error body assertions. The initial failed expectation and interrupted body waits are preserved in the aggregate evidence. Final browser source snapshots matched across all 288 fingerprinted files. The complete native collection was also rerun after the fix, rather than replacing its earlier results with focused tests.

## Reproduction and records

```bash
pnpm request:deadline:verify
pnpm request:deadline:browser
```

The native deadline command is included in `transaction:verify`, and therefore in `verify:static` and `verify`. The browser runner uses `RR_PLAYWRIGHT_MODULE`, `RR_CHROMIUM` and `RR_DEADLINE_ARTIFACTS` to select local installations and an output directory. The prior judge rehearsal and all earlier transaction/browser commands remain available.

Records: [engineering guide](../engineering/BROWSER_REQUEST_DEADLINES.md), [verification summary](../evidence/turn042/verification.json), [clean prior-revision witness](../evidence/turn042/deadline-baseline.json), [deadline browser results](../evidence/turn042/deadline-browser.json), [native regression](../evidence/turn042/native-regression.json) and [existing browser regression](../evidence/turn042/existing-browser.json).

## Remaining gates and next boundary unit

No account-owner task, credentials, customer messages, real payments, paid service, GitHub Actions, deployment or remote schedule was required. Merchant identity remains blank. Genuine managed-session verification, Sandbox payment/refund/webhook exchange, deployed Worker/D1 and pinned clean-install/typecheck/lint/Vitest/Vite/Wrangler gates remain open. Available TypeScript 5.8.3 does not replace pinned 5.9.3 verification.

**Next:** Turn 043 P0, clear retained buyer access after terminal acceptance conflicts. The separate HTTP 400/409 acceptance branch currently clears displayed rights and cancels the private timer while retaining the bearer code for Reload. Server authorization still applies, and hiding the page clears it, but an idle visible tab can retain that code beyond the intended browser lifetime. The generic non-timeout load failure has the same cleanup shape. This is a prompt terminal-response boundary, distinct from this turn's request deadlines.

Route those terminal outcomes to complete private locking or preserve an independently bounded capability lifetime. Extend the actual-handler stale-offer scenario to prove code reentry and focus, disabled Reload, no bearer reuse after five minutes, deliberate reacquisition and zero automatic acceptance/provider writes. Continue locally with no account-owner dependency. Optional dashboard, sponsor, public deployment and submission work remain deferred.
