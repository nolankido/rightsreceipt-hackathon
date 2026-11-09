# Turn 138: fail closed on hidden or duplicate Devpost copy

**Date:** November 7, 2026 UTC  
**Priority:** P0 submission-copy integrity  
**Release decision:** NOT READY

## Why this turn

The final Devpost handoff is time sensitive. The existing offline script checked whether all fifteen `##` submission headings and plausible public GitHub/YouTube links appeared in the Markdown source, but it did not distinguish submitted prose from fenced examples or HTML comments. A copy consisting entirely of a Markdown code sample could therefore receive `copy_ready_for_manual_review`, even though none of its sections would render as actual Devpost content. It also silently accepted two required headings with the same name, keeping the final one and potentially concealing contradictory text.

The user should not interpret a hidden template or duplicated final field as a reviewed submission.

## Change made

`scripts/devpost-copy-preflight.mjs` now:

1. Removes HTML comment spans from the content used to locate rendered headings, disclosures and public URLs, including an unclosed comment through EOF.
2. Ignores Markdown backtick and tilde fenced examples, tracking the original fence character and length so a shorter delimiter inside a longer example does not incorrectly terminate it.
3. Detects repeated required sections and emits the fixed `duplicate_required_section` blocker rather than silently accepting the last version.
4. Continues checking unresolved placeholders across the **entire original source**, including commented and fenced areas. This remains intentionally conservative.
5. Preserves the existing path-free, credential-free JSON output and read-only command interface.

The [Devpost copy QA instructions](../submission/DEVPOST_COPY_QA.md) now describe these cases. The [submission index](../submission/README.md) and [project status](../../PROJECT_STATUS.md) link the change.

## Regression evidence

Before the fix, two new tests failed because the script incorrectly reported `copy_ready_for_manual_review` for:

- all required sections and plausible public URLs inside a single fenced Markdown example;
- repeated `## Video` sections where the later occurrence supplied a plausible URL.

The revised suite covers an HTML-commented whole-copy example, both Markdown fence styles, a longer backtick fence containing a shorter delimiter, and valid visible headings alongside an illustrative fenced example.

From the repository root:

```powershell
node --test scripts/devpost-copy-preflight.test.mjs scripts/demo-video-preflight.test.mjs
```

**Observed:** 26 passed, zero failed, one intentional skip for the optional real-FFmpeg integration witness on Node 24.22.1. The genuine public GitHub and YouTube URLs remain unavailable. The actual draft correctly remains blocked on both release placeholders.

## Scope and remaining external gates

This is structural Markdown validation. It cannot establish that Devpost renders the pasted entry identically, that links are publicly reachable, that the video plays signed out, that a Sandbox invoice was actually paid, or that a Devpost submission was sent. Passing continues to mean only `copy_ready_for_manual_review`.

The P0 sequence is unchanged:

1. On the complete private Windows checkout with pinned Node 22, run the full clean-release verifier and sanitized public export once: `node .\scripts\clean-release-checkout.mjs --shareable --export-public`.
2. Complete the genuine separate-buyer PayPal Sandbox payment with the webhook collector bound before payment. Confirm authenticated matching PAID GET and signed exact-invoice webhook.
3. Publish only the audited MIT-licensed one-commit public source to a separate repository and verify it while signed out.
4. Record, export and watch a functional demo strictly under three minutes, then publish and verify the exact video signed out on YouTube.
5. Replace the two actual Devpost placeholders, rerun the copy check and inspect the entry manually. Submit and retain the true confirmation.

**No external publication, provider transaction, paid API use or Devpost submission occurred in this turn.**
