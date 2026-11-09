# Turn 133: reject late judge worker success after a deadline

**Date:** November 6, 2026  
**Scope:** P0 local judge evidence integrity and worker failure handling  
**Submission status:** NOT READY

## Failure mode

The local browser console launches the canonical three-journey worker in a child process and has a two-minute timeout. Previously, the timeout only sent `kill()`. It did not remember that the deadline had been exceeded or settle the pending request. A process that later exited with code zero and a passing JSON envelope could still be accepted, or a process that never emitted `close` could leave the status page running indefinitely. Oversized stdout triggered the same `kill()`-without-a-failure-latch problem. These are source-level failure possibilities, not evidence that a PayPal transaction or actual Node 22 worker failed in production.

## Change

- `scripts/judge-local-console.mjs` now uses a single idempotent child-result settlement path. The timeout **latches failure before sending a kill signal**, so even a synchronous kill/close race cannot authorize success. The same rule applies to more than 8 KiB of worker output.
- Error and spawn-failure handling also settle without exposing arbitrary process output. Late stdout and close events cannot turn a rejection into a success. The regular valid zero-exit path still requires the existing owned report and JSON evidence paths; the page subsequently checks those artifacts and their semantics before showing links.
- `scripts/judge-rehearsal-launcher.test.mjs` exercises valid completion, late forged success after kill, synchronous kill/close ordering, a child that never closes, oversized output, and spawn/child errors. The new regression is included in the mandatory `judge:console:verify` package script.
- `JUDGES.md` explains that a timeout produces a failed local demo, never acceptable financial evidence.

## Verification actually performed

- `node --test scripts/judge-rehearsal-launcher.test.mjs`: **6/6 passed** on the available Node 24.22.1 runtime without any version override.
- A wider **63/63** test run passed on Node 24.22.1 using a temporary **test-only version-string shim** for the mocked browser console tests. The production Node 22 runtime guard remains unchanged. This is not genuine Node 22 validation.
- No actual `judge:console:smoke` worker, full pinned release, separate-buyer PayPal Sandbox payment or signed webhook was run in this partial local checkout. Public source, public video and Devpost submission remain open.

## Next mandatory action

On the complete private Windows checkout, use real Node 22.13+ within major 22 and run the one-command clean release and audited private export: `node .\scripts\clean-release-checkout.mjs --shareable --export-public`. Treat only its canonical source-bound evidence as a release result. The local judge worker timeout fix does not replace full release verification, genuine Sandbox acceptance, anonymous public source/video availability or a confirmed Devpost submission.
