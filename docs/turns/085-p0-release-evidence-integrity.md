# Turn 085: submission release evidence integrity

**Date:** November 4, 2026  
**Priority:** P0 submission validation. Follow-up to Turn 084.

## Concrete defect

The final offline submission check accepted a plausible `verification.json` release summary with four generic successful command objects and syntactically valid stdout/stderr hash fields. It did not independently check the saved command logs or the existence of judge-rehearsal artifacts. Separately, `scripts/export-public-release.mjs` already contained a stronger release-evidence validator which checked the required command sequence, log hashes, lockfile identity, start/end timestamps and judge directory.

A user could obtain a submission consistency result even if those saved release artifacts were subsequently lost or modified. This was an integrity gap, not direct evidence of a genuine payment or a successful Devpost submission.

## Implementation

1. Exported `verifyReleaseEvidence` from `scripts/export-public-release.mjs` for reuse. The export's original validation path and invocation semantics remain unchanged.
2. Updated `scripts/submission-candidate-check.mjs` to call the same release validator for the *current HEAD* and compare its source evidence SHA-256 against the privately loaded release bytes. The validation fails closed without echoing private files, paths, tokens or URLs.
3. Added `release_log_or_judge_evidence_invalid` as an explicit submission blocker whenever independent release integrity is absent or the validator rejects the record.
4. Extended the existing submission-candidate Node regression tests to create a realistic temporary Git repository with pinned lockfile, canonical four-command release record, saved stdout/stderr logs and judge directory; then prove success for consistent offline records and blocking on tampered logs, missing logs and missing judge files.
5. Updated `docs/submission/SUBMISSION_CANDIDATE_CHECK.md` with the new gate and its limitations.

## Verification boundary

The source and test changes were reviewed and saved through the connected private GitHub repository. The three modified JavaScript modules passed a static JavaScript function-body syntax compilation check after ESM imports and `import.meta` were normalized for that check; this is not an executed regression suite. **The full Node 22 `pnpm release:verify` was not run in this turn**, and the new regression tests were added but not executed against a full private checkout. No PayPal API call, Sandbox buyer payment, live webhook, hosted deploy, public repository push, YouTube upload or Devpost submission was performed.

This code strengthens integrity of local evidence; it does not authenticate the origin of the PayPal JSON files or prove external readiness. The checker intentionally continues returning `readyForSubmission: false` even when internal consistency is satisfied.

## Next critical action

From a clean, full private checkout on Node 22/pnpm 12, execute:

```bash
pnpm submission:candidate:verify
pnpm release:verify
```

Repair any P0 failures, rerun the full gate on the fixed exact commit, then proceed with genuine PayPal Sandbox acceptance and sanitized one-commit public source export as documented in `docs/submission/FINAL_CUTOVER_CHECKLIST.md`.
