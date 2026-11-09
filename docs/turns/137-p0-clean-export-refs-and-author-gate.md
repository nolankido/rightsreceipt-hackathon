# Turn 137: fail closed on public export refs and Git identity

**Date:** November 7, 2026 UTC  
**Scope:** P0 private clean-release and sanitized public-export handoff  
**Submission status:** NOT READY

## Verified defect

`validateCleanPublicExportResult` in the clean checkout wrapper checked the public source tree, one-commit history, manifest and absence of remotes, but did not inspect the actual Git ref namespace or commit author. Consequently the outer command could report a passing public export even when the later guarded publisher would refuse it:

- Export HEAD was on `master` or another branch rather than `main`.
- Extra tags, notes or custom refs existed in the exported repository.
- The one public commit used a personal author/committer despite the manifest claiming the approved noreply identity.

Real temporary Git fixtures reproduced false-green outcomes against the previous wrapper. Both new regressions failed with missing expected exceptions before the change.

## Improvement

- The clean wrapper now calls `git for-each-ref --format=%(refname)` inside the exported repository and requires the sole output to be `refs/heads/main`.
- The wrapper reads the actual author and committer names/emails from the Git commit and requires both to be `nolankido` with `212063387+nolankido@users.noreply.github.com`.
- A public commit identical to the private source commit now fails the outer export gate.
- The existing tree, one-commit, clean-working-tree, no-remotes, release-hash and manifest checks remain mandatory.
- Tests use an explicitly named `main` branch, a wrong-branch fixture, extra tag and note refs, and a root commit amended to a personal email with its forged manifest updated to match.
- A mismatch returns only the fixed `public_export_result_invalid` failure, preserving the path-free `--shareable` result.

## Verification and scope

- Before fix: 25/27 clean-checkout tests passed; the two new tests failed because the wrapper accepted wrong Git refs and a personal Git author.
- After fix: `node --test scripts/clean-release-checkout.test.mjs` passed **27/27** on Node 24.22.1.
- The tests used local temporary Git repositories and synthetic verifier records. No external repository, provider API, buyer account, public video or Devpost entry was touched.
- The later `public-release-publish` still independently rechecks the source, release evidence, one-commit public history and public Git identity before any explicit publication.

## Required next P0 gate

Run `node .\scripts\clean-release-checkout.mjs --shareable --export-public` from the complete private Windows checkout with pinned Node 22.13+ and pnpm 12.8.2. Inspect the path-free result and the saved private handoff. A passing mocked test suite or a forged export manifest does not establish release readiness. Then complete the genuine same-invoice Sandbox paid-status and signed-webhook evidence, separately audited public GitHub publication, functional public video under three minutes and Devpost confirmation.
