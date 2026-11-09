# Turn 086: source-bound judge evidence in the submission gate

**Date:** November 4, 2026  
**Priority:** P0, release integrity and reproducible judge experience  
**Previous turn:** [Turn 085](085-p0-release-evidence-integrity.md)

## Confirmed weakness

Turn 085 made `submission-candidate-check.mjs` verify the release's saved command logs and the presence of a nonempty `judge` directory through the export validator. This did not establish that the judge rehearsal actually produced the expected semantic result. A directory containing an unrelated file could still satisfy that presence check.

The real `scripts/judge-rehearsal.mjs` creates **one generated `judge/run-XXXXXX/` subdirectory** containing `evidence.json` and `report.html`. Inspecting only the parent directory is inadequate.

## Implemented change

- Added `scripts/support/release-judge-evidence.mjs` to validate the real nested artifact layout, reject extra or missing files and symbolic links, and limit the size of each artifact.
- Reused the established `judgeConsoleEvidenceValid` contract to require three passing ordered journeys, three verified resets, deterministic USD 425.00 pricing, scheduled permission, a verified receipt, reproducible outcomes, in-memory database isolation, and zero external requests or credential use.
- Required `sourceRevision` to equal the **selected release HEAD**, `sourceClean === true`, and the rehearsal Node runtime to match the release evidence.
- Required `report.html` to show the local-only and simulated PayPal disclosures and to contain the same source commit and fingerprint as `evidence.json`.
- Updated `scripts/submission-candidate-check.mjs` to combine the existing release-log integrity validator with these semantic judge checks. Failures still produce only `release_log_or_judge_evidence_invalid` without disclosing private evidence.
- Updated the synthetic isolated CLI fixture in `scripts/submission-candidate-check.test.mjs` to reproduce the real nested layout, and added a tampered source-revision rejection.
- Added `scripts/support/release-judge-evidence.test.mjs` and included it in `pnpm submission:candidate:verify`. The symlink test skips only when operating-system privileges prevent creation of symlinks.

## Verification performed

Executed:

```bash
node --test scripts/support/release-judge-evidence.test.mjs
```

on Node **22.16.0** in an isolated working directory with the exact new module and regression test source committed to GitHub and a mirrored copy of the existing `judge-console-evidence.mjs` contract.

**Result: 12 passed, 0 failed, 0 skipped.** Post-edit Git blob SHA checks matched the corresponding committed files for the module and test. Static JavaScript parsing of the changed submission CLI and its integration test also passed. This is not a complete `pnpm submission:candidate:verify` execution in the full private repository, and not a successful full `pnpm release:verify`.

## Remaining release blocks

1. Execute the integrated submission regression and full release verifier in a clean, pinned Node 22 and pnpm 12.8.2 checkout of the latest `main`.
2. Obtain genuine PayPal Sandbox buyer-paid invoice plus authenticated paid GET and matching verified webhook evidence, without secrets in Git.
3. Complete a safe one-commit public export and public-source judge reproducibility check.
4. Publish and anonymously verify a working under-three-minute YouTube demo, then submit the Devpost entry by the internal November 9 target.

**Truth boundary:** The local rehearsal's simulated payment must not be presented as a real PayPal Sandbox payment or legal validation of ownership. No production endpoints, paid services, release deployment, public upload or Devpost submission were performed in this turn.
