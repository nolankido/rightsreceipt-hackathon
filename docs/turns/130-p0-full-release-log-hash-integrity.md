# Turn 130: bind passing clean release to its eight original stage logs

**Date:** November 6, 2026  
**Scope:** P0 release-evidence integrity  
**Submission status:** NOT READY

## Gap reproduced

Turn 129 required a passing clean-checkout release to contain four exact command records, with successful exit codes, SHA-256-shaped output digest fields and local judge evidence. Yet the wrapper had not compared those claimed hashes to the original saved stage logs. A truncated or fabricated record with structurally plausible hash strings, or genuine evidence whose log files were changed afterward, could still produce a green outer result. A test that modified a saved Stage 2 stdout file while retaining its original digest was accepted before this improvement.

## Change

- `scripts/clean-release-checkout.mjs` now reconstructs each expected log filename from the already validated command record and stage index using the same naming scheme as the inner release verifier.
- Every one of the four stdout and four stderr files must be an original regular, non-symlinked file under the validated private evidence run, with size no greater than the verifier's 16 MiB output buffer.
- The SHA-256 digest of each file's actual bytes must equal the corresponding digest in `verification.json`. A zero-byte stderr or stdout is allowed only when it hashes to the empty-content digest.
- A missing, redirected, oversized or modified log causes `release_result_invalid` for an otherwise claimed passing result. No raw log content, paths, provider data or command output is copied into the path-free `--shareable` response.
- Existing behavior for an honest failing full-release record is unchanged: its safe, allowlisted first-stage diagnostics remain available without demanding a complete passing command history.

This validates the saved output provenance and guards against accidental evidence drift. It does not attest that a particular external provider performed a payment or that a complete Node 22 release has already been run here.

## Test-driven evidence

1. Created a temporary Git fixture with four canonical passing command records and eight matching stage log files.
2. Confirmed the previous code continued to report a pass after a Stage 2 stdout log was modified, reproducing the false-green problem.
3. Added real log byte hashing and bounded regular-file checks.
4. Re-ran the release suite with matching output, modified content, missing file, oversized file, symlinked log and zero-byte output cases.

Result: **23/23** `scripts/clean-release-checkout.test.mjs` tests passed on Node 24.22.1, including actual temporary Git clones. The new test failed before the implementation and passed afterward. No genuine Node 22 full release or Sandbox provider transaction is claimed.

## Required external follow-up

On Nolan's complete private Windows source checkout with Node 22.13 or later in the 22.x series:

```powershell
node .\scripts\clean-release-checkout.mjs --shareable
```

Share only its JSON for safe triage. If the full release succeeds, run `node .\scripts\clean-release-checkout.mjs --export-public` and use the separately audited sanitized one-commit export. Then separately obtain genuine buyer-paid PayPal Sandbox status and verified matching webhook evidence, publish the MIT source and public sub-three-minute YouTube video, and complete the actual Devpost submission.

The current environment has Node 24 and a partial reconstructed checkout. No full release, public artifact or submission was performed during this turn.
