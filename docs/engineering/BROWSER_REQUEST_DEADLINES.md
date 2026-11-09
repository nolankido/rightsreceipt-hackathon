# Browser Request Deadlines and Deliberate Recovery

**Owning turn:** 042

## Boundary and scope

Every JSON request from the six native transaction clients now has a fixed 15,000 ms deadline. This includes initial creator-session requests, authenticated review reads, private buyer reads, confirmed writes and payment handoff checks. Previously an initial session or review request could remain pending before the private-view timer existed, leaving the form busy with no recovery action.

`REQUEST_DEADLINE_CLIENT` in `apps/web/src/request-deadline-client.ts` provides `readJsonWithDeadline`. The existing clients retain their HTTP-status checks, JSON content-type requirements, response validation, request policies and application-specific recovery behavior. The helper never retries or authorizes a command.

The budget applies to one HTTP request, from before dispatch through the complete `response.json()` operation. Receiving headers does not restart the clock. A page load that performs several successful requests in sequence has a separate budget for each request. This is not a 15-second deadline for an entire workflow.

## Deadline and cancellation rules

Each request gets its own AbortController. Its parent is the private view's existing controller. Private-view clearing cancels the child request, while a request timeout leaves the parent available for a deliberate retry when the view remains valid.

An explicit promise race settles a request even when the transport or body reader ignores abort. Elapsed wall-clock and monotonic time are checked before dispatch, after headers, after synchronous response validation, after JSON consumption and before returning the result. A result arriving at or beyond 15,000 ms is rejected even if the timer callback was delayed. A backwards wall-clock change cannot extend the monotonic budget; a forward clock change can conservatively end the request sooner.

Timeouts have the stable code `request_timeout` and a fixed message selected by the caller. Parent cancellation has code `request_aborted` and a fixed private-view message. Existing HTTP and ordinary transport errors retain their established handling. On ordinary failure, the helper aborts the child before removing its parent listener, requesting cancellation of any unread response body. Cleanup neither parses nor waits for that body. Successful completed requests remain un-aborted.

Timers and parent listeners are removed after settlement. A late response cannot reach the caller or overwrite a newer successful request, and response headers received after cancellation are not parsed.

The JavaScript event loop must be able to run to deliver a timer or cancellation. Synchronous parsing or a blocked event loop cannot be preempted by this helper; elapsed checks reject late completion afterward. This is a bound on asynchronous waiting and acceptance of results, not a guarantee of operating-system scheduling or a response-size limit.

## Recovery follows the operation

| Operation | Timeout result |
| --- | --- |
| Initial creator session or review | Clear the private review and enable Reload |
| Buyer request, clarification or offer read | Clear private state and return to code entry, explaining how to reopen the original link |
| Independent buyer payment/status read | Clear financial and permission authority, retain an already validated eligible offer with its existing expiry, and enable Reload |
| Confirmed request, answers, rights review, decision or acceptance | Keep the exact pending command and frozen controls for explicit retry while the private view remains valid |
| Creator link issuance | Keep the generated private token and exact issuance command; instruct the creator to retry the same link while the page remains open |
| Invoice creation, sending or recovery | Preserve the exact command and state that its outcome is uncertain; require explicit recovery |
| Buyer payment handoff | Preserve the exact pending check for retry while both the private view and invoice status remain current; otherwise require Reload. Never claim payment failure, confirmed payment or permission |
| Acknowledged save followed by refresh-request timeout or rejection | Keep the server acknowledgement alongside the request failure while the private view remains current; lifecycle clearing takes precedence |

An offer timeout does not trigger an additional status fallback. A creator invoice or recovery read timeout likewise stops the load instead of waiting through another request. Ordinary supported optional-read failures retain their previous behavior.

Aborting a browser request does not prove that a server transaction or provider action was canceled. A write may already be recorded. Exact replay and the existing server-side idempotency, reservation and source checks remain essential. The deadline helper neither repeats a request automatically nor creates a new command identity.

Reload deliberately reads current state and discards the in-memory pending command. A generated request-link token cannot be recovered after that page clears it, so issuance guidance specifically directs retry of the same link while the page is open. Hidden-page, page-history, session expiry and private-view expiry rules still take precedence and erase private state. The new request timer does not extend those lifetimes.

## Keyboard and private-view behavior

The existing focus tickets remain attached to explicit user actions. A timed-out write can focus its exact retry; a read can focus the relevant reload or code-entry control. A response or timeout does not take focus back after the user has deliberately moved elsewhere. Passive initial loading remains passive.

Epoch and expiry checks remain in each client. Deadline settlement cannot restore an older view, a cleared token, a discarded command, expired financial status or an expired payment link. Request codes continue to be removed from URL fragments before I/O and remain absent from storage, cookies, request URLs and request bodies.

## Reproduction and evidence

Run the deterministic deadline collection with the supported Node 22 runtime:

```bash
node --no-warnings --experimental-strip-types scripts/request-deadline-local.test.mjs
```

The package command is `pnpm request:deadline:verify`. It is included in `transaction:verify`, and therefore in both `verify:static` and `verify`.

Run the actual-handler browser collection when Playwright and Chromium are available:

```bash
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/consent-ts-test-loader.mjs scripts/request-deadline-browser-check.mjs
```

The equivalent package command is `pnpm request:deadline:browser`. `RR_PLAYWRIGHT_MODULE`, `RR_CHROMIUM` and `RR_DEADLINE_ARTIFACTS` select the local installations and evidence output directory.

The native collection covers hanging headers and bodies, a shared budget, the exact time boundary, delayed timer delivery, clock changes, parent cancellation, late replies, cleanup, unchanged request bytes and ordinary error propagation. Browser scenarios exercise the six actual page roles and handlers, with transport held before dispatch or after a real handler commits. Attempted browser requests and dispatched handler requests are counted separately.

The browser fixture seeds only the workspace, asset and policy. Transactional records come from actual commands. Managed gateway assertions, provider HTTP, clock advancement and lifecycle events are injected locally. The body-stall scenario wraps an actual JSON response's unchanged bytes in an injected ReadableStream that deliberately ignores abort. This exposes the late-body boundary without claiming a live streaming server test.

See [Turn 042](../turns/042-p0-browser-request-deadlines.md) and [verification.json](../evidence/turn042/verification.json) for the executed results, clean prior-revision witness, source hashes and regression evidence. Genuine managed sessions, Sandbox payment/refund/webhook exchange, deployed Worker/D1 and pinned clean-install/build verification remain separate release gates.
