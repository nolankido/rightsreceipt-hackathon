# Turn 041 Receipt: Keyboard Accessibility and Form Recovery

- **Status:** Completed and locally verified.
- **Date:** October 28, 2026 UTC.
- **Objective:** Repair consequential keyboard, validation and recovery problems across the canonical buyer and creator journey without a manual audit dependency or external account access.
- **Scope completed:** Six native page roles, shared focus/error behavior, exact pending-command recovery, private-state clearing, before-change witnesses, browser regression, native regression, project records and next-unit selection.
- **Schema/dependencies:** No migration, table, dependency, database reset or workspace package change. All external runtime flags remain off.
- **Release status:** NOT READY; genuine external and pinned-toolchain gates remain open.

## Shipped behavior

The audited pages cover creator request links, buyer intake, buyer clarification, creator rights review, creator offer/invoice controls and buyer acceptance/payment status. Each now has a keyboard-visible skip link and a focusable main landmark. Skip navigation moves focus without changing URL fragments or browser history, preserving private-code handling.

Explicit actions now restore focus after the initiating control is disabled, hidden or replaced. A successful request or answer submission focuses its recorded result; link issuance focuses the issued-link heading; acceptance focuses current payment and permission status; creator saves and invoice actions focus the relevant review section. An uncertain command focuses its exact retry action. Passive loads do not autofocus the new view.

Shared focus tickets record the original element and focus-event sequence. If the user moves elsewhere while a request is pending, its response cannot take focus back. The clients retain tickets through pending operations and nested save/reload flows. If the private deadline expires after disabling the submit button has left focus on the document, clearing the view can still restore code entry or Reload. Deliberate navigation cancels that old focus claim, and late replies cannot repopulate private state.

## Actionable validation

Intake, clarification, creator rights and decision forms now expose a focusable summary with keyboard links to the affected fields. Invalid controls receive associated inline error text and `aria-invalid`, while their existing help descriptions remain intact. Editing one field removes only its owned error. Grouped checkboxes share a description inside their fieldset, and clearing private content removes owned error nodes and associations.

Buyer clarification permits a confirmed incomplete submission to reach validation instead of disabling Save merely because an answer is blank. No invalid request is sent. Creator rights review collects invalid selected values and missing notes together. Creator decision review explains a missing or malformed reason instead of silently disabling Save for decisions that require one.

Confirmation remains explicit. Changing relevant form content clears its confirmation. While a command is pending, its controls and confirmation remain frozen, so a deliberate retry uses the exact same bytes. Focus helpers do not approve rights, accept an offer, retry a command, create/send an invoice or establish payment authority.

The audit also repaired existing private-state residue: an unsaved creator decision reason is erased on clear, reload, expiry and loss of access. Hiding the form alone no longer leaves that text behind.

## Concrete findings and corrections

| Finding | Correction and evidence |
| --- | --- |
| Successful link issuance hid its focused form, leaving focus on `BODY` | Captured against clean Turn 040, then verified to focus the issued heading |
| Invalid private code left focus on the submit button without `aria-invalid` | Captured against clean Turn 040, then verified on all three buyer code-entry pages |
| Validation was inaccessible through disabled Save or distant status messages | Linked summaries and field-associated errors verified for intake, answers, rights and decision reasons |
| Pending expiry lost the initiating focus context | Held issuance, intake and acceptance replies tested past the private deadline, including a moved-focus counterpart |
| A checkbox-group error became a separate rights-grid cell | Visual inspection found the defect; error placement moved inside the fieldset and gained a containment regression |
| Hidden creator decision reason retained unsaved text | Clear/reload/expiry now erase the value; browser checks verify the private boundary |

The shared implementation lives in `apps/web/src/form-accessibility-client.ts`; the six existing clients preserve their own application state and request guards. Four existing API page modules provide the headings, landmark targets, summaries and styles. No backend transaction, authorization, pricing or provider logic changed.

## Verification results

| Collection | Result |
| --- | --- |
| Current native tests across 50 files | **2,149 passed**, zero failed/skipped/cancelled |
| New accessibility browser audit | **134 checks passed**, 17 scenarios |
| Existing transaction/receipt browser | **127 checks**, 19 scenarios |
| Existing intake browser | **119 checks**, 8 scenarios |
| Existing clarification browser | **57 checks**, 8 scenarios |
| Existing invoice recovery browser | **88 checks**, 12 scenarios |
| Existing adversarial buyer browser | **51 checks** |
| Combined browser checks actually executed | **576 passed** |
| Strict source TypeScript 5.8.3 | Transaction/receipt scope passed |
| All-source TypeScript syntax | **175 files**, no syntax errors |
| Workspace, formatting and whitespace | Passed; 13 packages, 24 internal edges, no cycles, 322 files checked |

The complete native collection initially passed 2,148 of 2,149 tests. The only failure was an existing literal `<main>` matcher that excluded attributes. Updating it to match the new focusable main landmark retained the one-main assertion, and the full 101-test creator-session collection passed its rerun. The native evidence preserves both the initial run and replacement result. No production implementation changed after the full collection. The targeted browser suite was then extended from 123 to 134 checks with a populated unsaved-reason scenario covering reload, expiry, hidden-page clearing and loss of access, and all 17 scenarios passed again.

The new browser runner starts from a workspace, asset and policy, then uses actual application commands to prepare transactions and exercise the targeted UI. It uses real HTML/scripts, signed-assertion verification, SQL ownership, nine migrations and production services, with locally injected HTTPS/gateway and provider behavior. It holds or drops actual committed replies to test exact retry, stale replay, focus ownership and deadline races. It never inserts case, consent, payment or permission rows to fabricate completion.

All five existing browser suites were rerun against the frozen implementation with bounded parallelism. Their source hashes matched before and after. Runtime was Node 22.18.0 and browser Chromium 140.0.7339.16. Eight screenshots were produced; desktop/mobile intake, clarification, rights and recovery layouts were inspected, including the corrected group-error layout. No screenshots are required to run the product.

## Reproduction and records

```bash
pnpm accessibility:browser
```

Native equivalent when Node 22 and Playwright/Chromium are available:

```bash
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/consent-ts-test-loader.mjs scripts/form-accessibility-browser-check.mjs
```

`RR_PLAYWRIGHT_MODULE`, `RR_CHROMIUM` and `RR_ACCESSIBILITY_ARTIFACTS` select the available local toolchain and output directory. Existing commands for the transaction, intake, clarification, recovery and buyer browser collections remain unchanged. The prior one-command judge rehearsal and its native regression also remain available.

Records: [verification summary](../evidence/turn041/verification.json), [before-change witnesses](../evidence/turn041/accessibility-baseline.json), [new browser audit](../evidence/turn041/accessibility-browser.json), [existing browser reruns](../evidence/turn041/existing-browser.json), [native results](../evidence/turn041/native-regression.json) and [engineering guide](../engineering/KEYBOARD_FORM_RECOVERY.md).

## Scope limits and next unit

This is a targeted keyboard, focus, semantics, validation and responsive audit of six pages. It is not a screen-reader test, whole-application audit or WCAG conformance claim. Receipt-reader/public-verification accessibility and other browser engines were not audited. Time and lifecycle events are injected; native tests cover Fetch Metadata checks that the intercepted Chromium runtime does not expose.

No real credentials, customer messages, payments, paid services, GitHub Actions, deployment or remote schedule were used. Genuine managed login, Sandbox payment/refund/webhook, deployed Worker/D1 and pinned clean installation/build gates remain open. Available TypeScript 5.8.3 does not replace pinned 5.9.3 checks. Merchant identity stays blank and external-operation flags stay off.

**Next:** Turn 042 P0, bound stalled browser requests and preserve deliberate recovery. Initial session/review reads can currently wait before a private deadline is established. Add bounded read and uncertain-write outcomes, retain exact commands, and prove that timeout recovery never automatically consents or repeats provider writes. Continue using local actual-handler fixtures with no account-owner dependency.
