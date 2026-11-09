# Turn 141: post-push public destination reference verification

**Date:** November 7, 2026
**Priority:** P0, public source disclosure safety and accurate release status
**Status:** Implemented and locally tested in the private repository. Public release remains NOT READY.

## Problem and failure reproduction

The safe first-push command already required an empty advertised remote before an opt-in push, then used a creation-only lease for the audited `refs/heads/main`. That lease protects `main` but not an unrelated reference created concurrently. A tag, notes ref, branch or custom ref appearing between the preflight and successful push could coexist with the audited main. The subsequent anonymous GitHub content check only inspected main and could incorrectly report `published_and_verified`.

The initial regression proved the false green: an injected post-push reference failure still produced `published_and_verified`. An actual bare Git repository race that inserted `refs/notes/late` immediately after the successful push was not detected. The old push function also returned no positive post-push check result.

## Change

In `scripts/public-release-publish.mjs`:

1. Keep all local audit checks, anonymous public-destination preflight, empty-remote check, exact commit refspec and creation-only lease intact.
2. After a successful push, run a second `git ls-remote` against the exact destination URL, with the existing bounded command options.
3. Accept only a single advertised `refs/heads/main` at the audited exported SHA and, if present, `HEAD` at that same SHA. Reject duplicate lines, unexpected refs, missing main and mismatched SHAs.
4. Return `postPushRefsVerified: false` when the second read is unavailable or invalid. Since the remote was already written, the caller must report `pushed_verification_pending` with code `public_post_push_refs_unverified`. No automatic re-push or rollback is attempted.
5. Require an affirmative post-push reference check before the existing anonymous GitHub content checker can allow `published_and_verified`. A missing proof from a caller-provided push implementation is not accepted.

The operator runbook now distinguishes post-push reference uncertainty from the existing anonymous-content failure, offers a read-only all-refs reconciliation command, and explicitly says not to repeat `--publish` after either pending outcome.

## Verification

- Before implementation: four new expectations failed against the prior publication code, including the false-green handoff and real late-notes-ref injection.
- After implementation: `node --test scripts/public-github-release-check.test.mjs scripts/public-release-publish.test.mjs` passed 32/32 on Node 24.22.1, including 22 publication and 10 anonymous source-check tests, with real local Git test repositories.
- Cases cover successful exact push, a late unexpected notes ref, failed post-push Git read, missing main, wrong main SHA, inconsistent HEAD and duplicate advertisements, alongside the existing preflight and lease tests.
- No remote GitHub mutation, public repository creation, visibility change, paid service call or Sandbox transaction was made. Tests are focused and do not substitute for a pinned Node 22 complete release.

## Security boundary and remaining gates

The new check observes advertised refs at one moment. It cannot inspect hidden refs, unreferenced objects, or guarantee that no one will mutate a remote afterward. Before manually clearing a pending publication gate, reconcile the complete `git ls-remote` result and run the separate anonymous exact-commit source check. Do not use the existing anonymous source check alone to dismiss an unexpected-ref warning.

RightsReceipt remains NOT READY until the complete pinned Node 22 release and audited one-commit export pass, a separate public MIT source repository is genuinely accessible, exact buyer-paid PayPal Sandbox evidence and signed webhook are independently verified, the functional public video plays signed out and lasts under three minutes, and Devpost submission is confirmed.
