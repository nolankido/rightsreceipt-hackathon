# Turn 087: require semantic judge evidence for full release success

**Date:** November 4, 2026  
**Priority:** P0 release integrity  
**Starting branch:** private `main`, after Turn 086

## Defect and risk

The full `scripts/release-candidate-verify.mjs` command required four child commands to exit successfully and no preflight failures, but then set `status: passed` **before** confirming the judge output was meaningful. Its previous post-run check only set `judgeEvidence: {root: "judge"}` when the folder existed. Missing, empty, corrupted, misleading or source-mismatched rehearsal artifacts did not directly prevent a successful process exit.

Turn 086 added strict source-bound judge validation only to the later submission-candidate check. This left a window for a purportedly green release candidate to travel to public export or appear in a release log before its judge evidence was scrutinized. A failure should happen at the release gate itself.

## Implementation

- Added `releaseJudgeGate(runDirectory, commit, node)` to `scripts/support/release-judge-evidence.mjs`, delegating to the existing semantic validator on the real `judge/` output.
- Changed `scripts/release-candidate-verify.mjs` to call that function after all four successful commands and source-consistency checks.
- It now sets `status: passed` and `judgeEvidence: {root: "judge"}` **only if** semantic judge evidence is valid. Missing or mismatched evidence produces `judge_rehearsal_evidence_invalid`, retains `status: failed`, and returns a nonzero exit code.
- Updated temporary clean-repository fixtures in `scripts/release-candidate-verify-local.test.mjs` to include the judge-validator module and its existing supporting contract, preventing false failures from newly required imports.
- Added a focused regression in `scripts/support/release-judge-evidence.test.mjs` that exercises the exact `releaseJudgeGate` used by the full verifier. The regression confirms valid source-bound records pass, while missing output, wrong commits, unsupported Node versions and absent evidence files fail.
- Updated `docs/engineering/RELEASE_CANDIDATE_VERIFICATION.md` to explain the new gate.

## Verification done in this turn

Executed locally in an isolated working directory using Node **22.16.0**:

```bash
node --test scripts/support/release-judge-evidence.test.mjs
```

**Result: 13 passed, 0 failed, 0 skipped.** The local validator and test sources were compared with their corresponding committed Git blob SHAs. The edited full release verifier was also checked for JavaScript syntax after ESM import normalization. The actual repository test suite, the source-bound integration fixture and a full `pnpm release:verify` from a clean private checkout were **not** executed here. The repository is private, and no complete credential-free checkout or matching pnpm installation is present in this execution environment.

## Unchanged truth and security boundaries

- A local injected-provider rehearsal is not a genuine PayPal Sandbox payment.
- Neither this patch nor its passing focused tests proves real Sandbox OAuth, settlement, webhook signature verification or public hosting.
- No payment, account creation, deployment, GitHub visibility change, YouTube publication or Devpost submission was performed.
- Do not introduce paid services or production PayPal endpoints to clear the test gate.

## Next critical pass

In a clean checkout of current `main` using pinned Node 22 and pnpm 12.8.2, run `pnpm release:preflight:verify`, `pnpm submission:candidate:verify`, and `pnpm release:verify`. Fix and rerun on the final exact commit if any fail. Then obtain genuine Sandbox evidence and publish a separate sanitized public repository, and complete the video and Devpost entry ahead of the November 9 internal submission target. See `docs/submission/FINAL_CUTOVER_CHECKLIST.md`.
