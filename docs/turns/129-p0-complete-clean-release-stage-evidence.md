# Turn 129: require complete stage evidence for a green clean release

**Date:** November 6, 2026  
**Scope:** P0 release integrity and safe submission handoff  
**Submission status:** NOT READY

## Defect reproduced

`validateCleanReleaseResult` already protected the original private evidence path, matched the exact Git commit and required a full-mode record. However, a `verification.json` containing only a schema, mode, commit and `status: "passed"` could still authorize a green outer clean-checkout result when paired with a zero-exit verifier summary. It did not require the four required release commands or the judge rehearsal evidence marker. The sanitized `--shareable` response would then also report a pass. A successful local wrapper is an important handoff, so it must reject incomplete evidence.

## Correction

- The passing record must describe exactly four ordered canonical commands: public snapshot audit, frozen pinned pnpm install, full pnpm verification and the source-bound judge rehearsal.
- Each recorded command must match the specific release checkout and current evidence run paths. The command comparison reuses the canonical `releaseCommandInvocation` function, which also recognizes the fixed `cmd.exe /d /c corepack.cmd ...` forms on Windows.
- Every command must have exit code zero, null signal and spawn error, a nonnegative integer duration and syntactically valid SHA-256 output digest fields.
- A passing release must have an empty preflight-failure list, the exact `pnpm@12.8.2` package-manager identity, the same Node runtime and `judgeEvidence.root: "judge"`.
- A claimed pass that misses any of these fields now fails closed as `release_result_invalid`. Legitimate failed release records continue to produce bounded, allowlisted diagnostics. No new network access, PayPal call or public operation was introduced.

This is a structural defense for the outer runner. The canonical full verifier and separate public-export verifier remain responsible for actual command execution, logs, source-tree audit and judge artifact integrity. A syntactically complete record by itself is not independent proof of those external facts.

## Regression and observed result

The new focused test created a real temporary Git repository and a fabricated zero-exit, fully passing release summary. It then attempted to substitute incomplete stage arrays, a nonzero stage, wrong commands, malformed output hashes, a missing or unrelated judge marker, preflight failures, a changed package manager and a mismatched Node version.

**Before the fix:** the new assertion failed because the wrapper accepted the first incomplete `commands: []` record.

**After the fix:** `node --test scripts/clean-release-checkout.test.mjs` passed **22/22** on local Node 24.22.1. The suite still exercises actual disposable local Git clones, evidence path protections and safe CLI reporting. This is not the pinned Node 22 full release.

## Remaining release work

On Nolan's complete private Windows checkout, run:

```powershell
node .\scripts\clean-release-checkout.mjs --shareable
```

If it fails, share only the bounded JSON and address the first actual stage error. If it passes, run `node .\scripts\clean-release-checkout.mjs --export-public` to generate the private audited one-commit source export. Separately complete genuine buyer-paid PayPal Sandbox acceptance with authenticated PAID retrieval and signed exact-invoice webhook; publish and check a separate public MIT repository and public under-three-minute YouTube video; and confirm the submitted Devpost entry.

No complete authenticated checkout, Node 22 full release, genuine Sandbox payment, public repository, public video or Devpost submission was verified in this environment.
