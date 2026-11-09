# Turn 043 Receipt: Buyer Private Access After Terminal Errors

- **Status:** Completed and locally verified.
- **Date:** October 28, 2026 UTC.
- **Objective:** Close the retained-code lifetime gap after terminal buyer acceptance errors and unexpected outer review failures.
- **Scope:** One buyer client, a targeted actual-handler browser collection, extended stale-offer integration checks, relevant regression, evidence and next-unit selection.
- **Schema/dependencies:** No migration, database, dependency or workspace package change. External runtime flags remain off.
- **Release status:** NOT READY; genuine external verification and pinned-toolchain gates remain open.

## Before-change evidence

An isolated browser witness ran the clean Turn 042 commit `5e4f890433eb53ce87846f2805a9de51983b767c`. After the buyer loaded an approved offer, a competing canonical terms revision caused the actual acceptance handler to reject the old command with HTTP 409.

The page cleared its rights display but kept code entry hidden and Reload enabled. Its cleanup had canceled the five-minute timer while leaving the private code in the active closure. The same state persisted after 300,001 ms of controlled browser time. A programmatic Reload then sent authorized offer and status GET requests using that retained code; both returned 200.

The witness produced zero automatic requests, buyer acceptances or provider calls. Server capability checks were still active. This was a browser retention and recovery defect, not a bypass of server authorization.

## Shipped behavior

Acceptance HTTP 400/409 now calls the existing complete `lock()` transition and returns. That clears the code, pending acceptance, pending payment check, rights, confirmation, financial/status data and navigation targets. It advances the view epoch, requests cancellation of the view controller and clears timers. Reload is disabled and an empty code-entry form becomes available.

The message explains how to reopen the original review link or enter the private code. Recovery does not silently reuse the rejected command. Deliberate reentry fetches the current record and begins with unchecked confirmation. A separately confirmed acceptance uses a new command identity derived from the new view.

The outer load-failure boundary now also locks completely. Its generic recovery copy does not reflect the internal exception text. When the server has already acknowledged acceptance, that acknowledgement remains alongside the recovery instruction. Known authentication and request-deadline failures retain their existing messages, and lifecycle clearing retains priority.

Focus uses the existing interaction ticket. An interrupted action can restore code-entry focus, while a delayed rejection respects a deliberate focus move elsewhere. Stale controls cannot regain access by being programmatically activated, even beyond the old private lifetime.

## Boundaries preserved

Only terminal cleanup changed. A timeout, transport failure or nonterminal acceptance error still keeps the exact pending command for a deliberate retry while the private view is valid. Independent non-authentication payment/status errors retain their existing status-clearing behavior and the original private-view timer. Handoff conflicts still require Reload within that bounded view.

The inner offer-read fallback remains available for current receipts when an offer is unavailable for acceptance, including archived assets. No backend authorization, consent, pricing, invoice, payment, receipt or provider contract changed. Clearing this browser state does not revoke the server capability or prove that earlier work was rolled back.

## Verification

| Collection | Executed result |
| --- | --- |
| Full native collection, 51 files | **2,171 passed**, zero failed/skipped/cancelled |
| New buyer private-boundary browser collection | **42 checks passed**, 6 scenarios |
| Existing transaction/receipt browser | **130 checks passed**, 19 scenarios |
| Existing intake browser | **119 checks passed**, 8 scenarios |
| Existing clarification browser | **57 checks passed**, 8 scenarios |
| Existing adversarial buyer browser | **51 checks passed** |
| Existing keyboard/form recovery browser | **134 checks passed**, 17 scenarios |
| Existing request-deadline browser | **132 checks passed**, 24 scenarios |
| Combined browser checks executed this turn | **665 passed** |
| Strict source TypeScript 5.8.3 | Transaction/receipt scope passed |
| All-source TypeScript syntax | **176 files**, no syntax errors |
| Formatting, workspace and whitespace | Passed; 326 files, 13 packages, 24 internal edges, no cycles |

The targeted scenarios cover a real stale-offer 409, a real malformed-command 400, delayed-conflict focus ownership, unexpected completion failure, an acknowledged acceptance followed by completion failure, and exact retry after a native service-unavailable response. An additional three assertions extend the existing transaction stale-offer scenario.

The HTTP 400 case deliberately changes the outgoing confirmation before the actual handler validates it. The generic completion tests inject a one-shot status-render exception after successful native reads. These faults are labeled as injections. Ordinary API 500 responses normally remain within nested optional-read handling and are not misrepresented as reaching the outer catch.

The targeted fixture starts with a synthetic request, reviewed terms and quote; initial intake is outside its scope. Subsequent decisions and acceptances use actual handlers. Provider calls, invoice/payment operations, payment evidence, permissions and receipt revisions remain zero throughout the new collection. Recorded acceptances occur only in the separately confirmed success, acknowledged-save and explicit retry scenarios. No code reentry or stale-control action accepts anything automatically.

The browser screenshot was inspected for clear recovery copy, an empty focused code field, disabled stale controls and removed private content. Runtime was Node 22.18.0 and Chromium 140.0.7339.16. Clock advancement, gateway assertions, provider transport, delayed replies and the one-shot completion fault are controlled local fixtures.

All six existing browser collections that execute the changed buyer client passed their complete reruns. Their 289 source hashes matched before and after, with fingerprint `06cb67efdb1f8ee9fb44cd173d9df3f4cd4571c8159f2118ade234a4c3b0379a`. The creator-only invoice-recovery browser collection was outside this turn's unchanged creator/shared scope and was not rerun. Its native tests remain included in the complete native collection. Browser totals count only checks actually executed this turn.

## Reproduction and records

```bash
pnpm buyer:boundary:browser
```

Native invocation when Node 22 and local Playwright/Chromium are available:

```bash
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/consent-ts-test-loader.mjs scripts/buyer-private-boundary-browser-check.mjs
```

Use `RR_PLAYWRIGHT_MODULE`, `RR_CHROMIUM` and `RR_BUYER_BOUNDARY_ARTIFACTS` for runtime selection and output. Existing native, deadline, transaction and judge-rehearsal commands remain available.

Records: [engineering guide](../engineering/BUYER_PRIVATE_RECOVERY.md), [verification summary](../evidence/turn043/verification.json), [clean prior-revision witness](../evidence/turn043/terminal-baseline.json), [targeted browser results](../evidence/turn043/buyer-boundary-browser.json), [native regression](../evidence/turn043/native-regression.json) and [existing browser regression](../evidence/turn043/existing-browser.json).

## Remaining gates and next boundary unit

No account-owner task, credentials, customer messages, real payments, paid service, GitHub Actions, deployment or remote schedule was required. Merchant identity remains blank. Genuine managed sessions, Sandbox payment/refund/webhook exchange, deployed Worker/D1 and pinned clean-install/typecheck/lint/Vitest/Vite/Wrangler gates remain open. Available TypeScript 5.8.3 does not replace pinned 5.9.3 verification.

**Next:** Turn 044 P0, make protected receipt access recoverable under repeated submissions. The receipt client can advance its session and replace the code on a second submission while the first load remains busy. The second load exits immediately, while the first later refuses to clear busy for its stale session. That can strand the page with its actions hidden and no refresh timer. The submission handler advances the session even for an unchanged valid code. A [read-only VM witness](../evidence/turn043/receipt-pending-baseline.json) reproduces the deadlock with distinct synthetic codes and a deferred response; it does not exercise receipt rendering or live transport.

Make pending receipt submissions own their session consistently and expose deliberate recovery. Test held first responses, repeated same/different-code submissions, late completion, hidden cancellation and current print/export authority through actual receipt handlers. Continue locally without an account-owner dependency. Public deployment, optional dashboard/sponsor work and submission assets remain separate tasks.
