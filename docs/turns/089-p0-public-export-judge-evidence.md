# Turn 089: enforce judge evidence at public export

**Date:** November 4, 2026
**Priority:** P0 submission packaging
**Source branch:** private main

## Finding
The full release verifier and final submission-candidate checker already require semantically valid local judge rehearsal artifacts. The sanitized public repository exporter did not: its `verifyReleaseEvidence` accepted a passing `verification.json`, matching logs and any nonempty `judge` directory. If artifacts were missing or modified after the original release run, the exporter could proceed before the final submission consistency gate.

## Change
- `scripts/export-public-release.mjs` imports the existing `releaseJudgeGate` and checks the actual release candidate's `judge/run-XXXXXX` evidence, with the release's exact source commit and Node runtime. The existing presence-only error remains `release_judge_evidence_missing`. Semantic failure now causes `release_judge_evidence_invalid` and stops the one-commit export.
- `scripts/export-public-release-local.test.mjs` now builds canonical synthetic 17/20/17 step judge artifacts in the same nested structure used by the real release command, rather than a placeholder `judge/report.html`. The test repository copies the necessary judge-validation modules.

## Verification and limitations
The changes were committed and read back from GitHub. Existing 13 judge-evidence tests passed locally on Node 22.16.0. The updated public-export regression suite and full `pnpm release:verify` **were not run**. This environment does not have an authenticated private-repository checkout, cannot reach the package registry, and cannot download the required pnpm 12.8.2. Do not infer a green release from a code review or prior tests.

The canonical fixture is synthetic and deliberately does not assert real PayPal Sandbox behavior. The source development repository remains private. No production payment, Sandbox transaction, remote deployment, public repository or Devpost submission was performed.

## Required next verification

From a clean private checkout on Node 22 and the pinned pnpm toolchain:

```bash
pnpm public:export:verify
pnpm submission:candidate:verify
pnpm release:verify
```

Review any failures before preparing the separate sanitized public repository. Next complete a genuine Sandbox invoice and paid/webhook acceptance, then the public video and Devpost submission by the November 9 internal target.
