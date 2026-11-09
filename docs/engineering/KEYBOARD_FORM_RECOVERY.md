# Keyboard Accessibility and Form Recovery

**Owning turn:** 041

## Audited scope

This improvement covers six native pages in the canonical licensing journey:

| Page | Main interactions |
| --- | --- |
| `/creator/requests/:assetId` | Review the asset, issue a private request link, reveal/copy it and recover an uncertain issuance |
| `/buyer/request` | Open a private code, validate and submit original intake, continue from the recorded request |
| `/buyer/clarification` | Open questions, validate answers, save or retry the exact answer command |
| `/creator/clarification/:caseId` | Review buyer evidence, explicitly choose rights fields, validate and save revised terms |
| `/creator/review/:caseId` | Record a decision, create/send a draft and recover a recorded uncertain invoice operation |
| `/buyer/review` | Accept the exact offer, inspect current financial/permission state and request a current payment handoff |

The checks target keyboard operation, accessible error associations, focus after asynchronous state changes, private-state clearing and responsive layout. They are not a screen-reader audit, a full-application accessibility audit or a WCAG conformance claim. Receipt-reader and public-verification pages remain outside this turn's accessibility scope.

## Focus follows the user's action

`FORM_ACCESSIBILITY_CLIENT` supplies shared focus helpers to the six existing native clients. A user-initiated operation captures the current focused element and a monotonically increasing focus-event sequence. Completion can move focus only if that sequence is unchanged and focus still belongs to the original control or has fallen back to the document after the control was disabled or hidden.

This restores a usable position when a successful command hides its submit form or an uncertain command reenables its exact retry. It also prevents a delayed response from taking focus away after the user deliberately navigates elsewhere. Passive initial loads do not capture a ticket and do not autofocus the newly loaded form.

| Transition | Destination |
| --- | --- |
| Invalid manually entered private code | Code field with associated error text |
| Invalid intake, answers, rights or decision reason | Focusable error summary with keyboard links to invalid fields |
| Recorded request or answers | Saved-result heading |
| Issued private link | Issued-link heading |
| Reloaded creator review or offer | Relevant review heading |
| Recorded buyer acceptance | Current payment and permission heading |
| Uncertain command | The same command's explicit retry button |
| Stale or expired private state | Available code-entry or reload control when the removed content owned focus |
| Current payment handoff | Valid handoff link or the no-link explanation |
| Expired focused payment link | Payment-check control or Reload when a new check is unavailable |

The clients retain an interaction ticket while a response is pending. This matters when disabling the initiating button has already moved focus to the document before the five-minute private deadline fires. Clearing the view can still restore a safe recovery control. A user focus move invalidates the retained ticket, and completed operations release their own tickets without clearing a newer operation's ticket.

Every shell has a keyboard-visible skip link and a focusable main landmark. Activating the skip link moves focus without modifying the URL fragment or browser history, because these pages use fragments to receive private codes. Programmatically focused headings and summaries have visible focus outlines.

## Errors belong to their fields

The shared `formErrors` helper creates text-only inline errors and a linked summary. Each invalid field receives `aria-invalid` and an owned `aria-describedby` reference while retaining its existing instructions. Editing one field clears only that field's error. Clearing or rebuilding private content removes owned error nodes and associations.

Checkbox groups share one error description across their controls. The note stays within the group's fieldset, preserving the two-column rights-editor layout. Error links prevent hash navigation and move focus directly to the relevant control. Validation messages do not interpolate buyer input or use HTML insertion.

Buyer clarification no longer disables Save solely because an answer is empty. Once the buyer explicitly checks the confirmation, submission can explain every incomplete answer. It sends no request until local validation passes. Creator rights review similarly reports all invalid selected values and notes together. Creator decision review explains a missing or invalid reason instead of silently disabling Save when the selected decision requires a reason.

Changing a creator decision, its reason, an answer or intake content clears the relevant confirmation. Pending commands freeze the confirmation and edited fields so an uncertain result remains tied to the exact original command. No accessibility control grants consent, retries automatically, creates an invoice or sends one.

## Private state and authority

The existing epoch, expiry and source guards remain authoritative. Focus helpers do not authorize actions and do not restore private data. Hidden-page and history lifecycle handling still clears private codes, form contents and pending commands. Late responses cannot repopulate a cleared view.

This audit also repaired an existing privacy residue: an unsaved creator decision reason is now erased during clear, reload, expiry and loss of access. Hiding the form alone was insufficient.

All business commands, payload identities, deterministic pricing, consent checks, provider guards and default-off runtime flags remain unchanged. Actual handler transactions and injected session/provider fixtures verify that validation and focus transitions do not introduce automatic approval, acceptance, invoice creation, sending or payment authority.

## Reproduction and evidence

```bash
pnpm accessibility:browser
```

The equivalent native command uses the supported Node 22 runtime:

```bash
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/consent-ts-test-loader.mjs scripts/form-accessibility-browser-check.mjs
```

The browser runner uses Playwright and Chromium. `RR_PLAYWRIGHT_MODULE` and `RR_CHROMIUM` select available installations; `RR_ACCESSIBILITY_ARTIFACTS` selects an evidence directory. The runner seeds only a workspace, asset and policy, then creates transactional state through actual handlers. Browser routing injects the HTTPS gateway and provider transport; no deployed service, provider credential or real payment is required.

Before-change browser witnesses were captured from the clean Turn 040 commit. The final targeted checks, existing application-browser regression, native results, actual source hashes and screenshots inspected are recorded in [Turn 041](../turns/041-p0-keyboard-form-recovery.md) and [verification.json](../evidence/turn041/verification.json).

The pinned clean installation/build, genuine managed login, Sandbox financial exchange and deployed Worker/D1 gates remain open. These targeted local improvements do not close those release gates.
