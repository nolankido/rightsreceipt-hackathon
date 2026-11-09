# Turn 135: verify every advertised reference before publishing source

**Date:** November 7, 2026  
**Scope:** P0 privacy and release handoff safety, local-only change  
**Submission status:** NOT READY

## Problem and reproduced failure

`pushNewPublicMain` is the narrowly scoped, opt-in one-commit GitHub publisher. Its pre-push empty-target check used `git ls-remote --heads --tags`. This only queries branches and tags, omitting notes, replace and custom references that can already hold Git objects in the destination. The subsequent creation-only lease protects `refs/heads/main`, but it cannot establish that the remote itself was empty.

The new real-Git regression first created a bare repository containing **only** `refs/notes/preexisting`, pointing to a private fixture commit. Git confirmed that the old heads/tags query returned no refs. Against the old publisher, the regression failed: the push incorrectly succeeded and created public `main`. This was a local disposable fixture, not an actual public upload.

## Implemented correction

- `scripts/public-release-publish.mjs` now runs the complete read-only `git ls-remote` reference listing before any push.
- Any advertised remote reference yields `public_destination_not_empty` and stops before the push.
- The exported one-commit identity, anonymous GitHub repository metadata check, explicit `--publish` switch, creation-only `main` lease and post-push verified MIT-licensed root commit are unchanged.
- `scripts/public-release-publish.test.mjs` now includes a real bare-repository notes-only regression, checks no branch was created, and preserves the preexisting note ref. Existing empty, branch, tag and race tests remain.
- The safe-publication runbook now describes complete advertised-reference checking and its residual limitations.

## Verification

- Before fix: `node --test scripts/public-release-publish.test.mjs` had 16 passes and one failing notes-only regression with `Missing expected exception`, confirming the gap.
- After fix: `node --test scripts/public-release-publish.test.mjs scripts/public-github-release-check.test.mjs` passed **27/27** tests on Node 24.22.1.
- Tests used disposable local Git remotes and stubbed GitHub HTTP metadata. **No** real GitHub repository was created, populated or changed.
- A complete pinned Node 22 release, one-commit export from that release, genuine separate-buyer PayPal Sandbox acceptance, signed exact-invoice webhook, public demonstration video and Devpost confirmation have **not** been completed here.

## Remaining boundary and next action

The check sees advertised refs, not unreachable objects or refs deliberately hidden by a remote server. A malicious local Git executable or Git URL rewrite could still violate assumptions, so independently verify the destination and use an empty, newly created public repository.

The binding P0 step remains one full clean private Windows checkout on Node 22 with `node .\scripts\clean-release-checkout.mjs --shareable --export-public`. A passing, privately saved audit/export handoff is needed before the opt-in public push. Then obtain genuine Sandbox acceptance, finish the public video, validate Devpost copy and manually confirm the final submission. Do not label the hackathon submission complete until those independent gates pass.
