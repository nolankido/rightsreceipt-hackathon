# Turn 118: Block unfinished Devpost copy before final submission

**Date:** November 5, 2026 UTC
**Status:** Implemented and locally tested. The real Devpost draft is still blocked, as expected.

## Why this matters

RightsReceipt has detailed release and PayPal evidence gates, but its actual judge-facing Devpost copy still has unresolved GitHub and YouTube placeholders. A rushed paste could direct judges to the private development repository, use a malformed video URL, omit required project sections or make an unfinished submission look complete.

The new `scripts/devpost-copy-preflight.mjs` is a no-network, dependency-free read-only guard for this last publication handoff. It is separate from the local evidence consistency checker and cannot upload or submit anything.

## Changes

- Validate the draft's fifteen required title, pitch, problem, product, AI, PayPal, tools, learning and demo sections.
- Require exact labeled public-source and YouTube fields with plausible direct HTTPS URLs; reject the existing private source repository, generic placeholders, video URL extras and unrelated hosts.
- Detect unresolved release placeholders even when both URL fields look valid.
- Require explicit PayPal and AI/tool disclosure sections to contain their identifying terms.
- Return only sanitized fixed blocker codes, short check flags and a limitation statement. Never echo input prose, URL values or filesystem paths.
- Read only regular, nonsymlink files beneath `docs/submission/` and reject large or unreadable inputs.
- Add `submission:devpost:check` and `submission:devpost:verify` commands. Include the regression suite in the existing `submission:candidate:verify` chain.
- Add [one-command Windows copy QA](../submission/DEVPOST_COPY_QA.md) and a final cutover checklist item.

## Evidence

- `node --test scripts/devpost-copy-preflight.test.mjs`: **9 passed, 0 failed** on Node 24.22.1.
- Combined local regression run (Devpost, video preflight, release preflight, clean checkout): **47 passed, 1 deliberately skipped FFmpeg witness, 0 failed**.
- Verified a synthetic filled-in copy reaches `copy_ready_for_manual_review` with both valid URL formats.
- Verified the *actual current draft* still returns `blocked` for placeholder repository and video fields.
- Verified direct private GitHub link, tracking-parameter video link, absent sections and unsafe file arguments cannot pass.
- CLI output contains no draft content, file paths or link values.

The tests do not substitute for a full clean Node 22 release, a real Sandbox payment or public accessibility checks.

## Next release action

After the separate sanitized public repository and functioning under-three-minute public video exist, insert their actual URLs into `DEVPOST_DRAFT.md`, rerun the offline copy preflight, manually review all claims and verify both URLs signed out. Submit the final entry on Devpost and retain its confirmation; neither a passing copy check nor a draft preview counts as submission.
