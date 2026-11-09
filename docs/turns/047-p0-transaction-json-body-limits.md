# Turn 047 Receipt: Bounded Shared Transaction JSON Responses

- **Status:** Completed and merged.
- **Date:** October 30, 2026 UTC.
- **Objective:** Bound shared creator/buyer transaction JSON response consumption before complete buffering while preserving the existing request deadline, parent cancellation and exact-command recovery behavior.
- **Scope completed:** Shared browser request helper, focused streaming regressions, recovery VM compatibility, review and release-ledger handoff.
- **Commit:** `e5abfb0df494d49a09bfdeb4d34f91fde289592c`.

## What changed

The shared `readJsonWithDeadline` helper used by creator review, buyer review, creator/buyer clarification and creator/buyer request intake now consumes browser JSON responses through a bounded stream instead of calling `response.json()` first.

- decoded JSON budget: 262,144 bytes;
- fixed-capacity `Uint8Array` accumulation;
- early rejection of oversized identity `Content-Length`;
- exact declared-length agreement for identity responses;
- compressed response lengths validated as metadata while decoded bytes remain bounded independently;
- cancellation and reader release on overflow, timeout, parent cancellation or invalid response;
- the original 15-second request budget remains authoritative from dispatch through body consumption and parsing;
- non-browser test doubles without a stream retain the previous `response.json()` fallback.

The first automated PR review found a concrete regression in `scripts/invoice-recovery-ui-local.test.mjs`: the VM harness used host `Response` streams without providing the host `Uint8Array` and `TextDecoder` constructors to the VM realm. The harness was corrected and the PR was re-reviewed.

## Verification

Evidence performed during this turn:

- exact staged helper source executed under Node **22.16.0** in an independent VM harness;
- normal host `Response.json()` streaming succeeded without calling the response's complete-body `json()` method;
- a valid response at the 262,144-byte boundary succeeded;
- a 262,145-byte declared response failed with `response_invalid`;
- the isolated VM-without-stream-globals case reproduced the compatibility failure that the harness fix addresses;
- GitHub automated code review completed on head `2e47bc3` with **zero findings and zero unresolved findings** after the fix;
- PR #1 was squash-merged into `main`.

The full repository-wide native/browser regression was not rerun in this execution environment because the private repository cannot be cloned from the isolated runner and outbound GitHub DNS is unavailable there. The prior Turn 046 full regression remains historical evidence, not evidence for this new source revision. A pinned clean install and full release verification remain mandatory before the release candidate is declared ready.

## Release impact

This closes the known unbounded shared transaction-body issue without adding a dependency, migration, external API call, deployment flag or production payment capability.

No PayPal Sandbox credentials were used. No payment, webhook, customer email or public deployment was created.

## Recommended next turn

**Turn 048 P0: Release-candidate verification and genuine PayPal Sandbox handoff.**

Stop adding product features. Prepare one deterministic release command/evidence path for the pinned clean build, then close the genuine Sandbox OAuth, invoice create/send/status and registered-webhook evidence gate. Preserve the existing local judge rehearsal as fallback and keep production payments impossible.
