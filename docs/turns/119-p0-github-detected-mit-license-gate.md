# Turn 119: Require a GitHub-detected MIT license in public release verification

**Date:** November 5, 2026 UTC  
**Status:** Implemented and locally tested. No public repository was created or pushed.

## Why this matters

The PayPal AI Hackathon submission rules require a public open-source source repository with its license detectable and visible at the top of its GitHub repository in the About section. The existing public-source gate checked that the sanitized one-commit tree was anonymously visible, but did not inspect GitHub's license recognition. A public repository containing a LICENSE blob could therefore pass the automation even if GitHub did not recognize the license.

The private development source already has an MIT `LICENSE`. This turn checks **the published repository's GitHub metadata** rather than merely trusting the local file's existence. It does not publish anything or alter license terms.

## Changes

- Read `license.spdx_id` from the repository metadata already obtained by `checkPublicGithubDestination` in `scripts/public-github-release-check.mjs`.
- Require the exact value `MIT` in `checkPublishedGithubRelease`, after verifying the published branch, tree, root commit and noreply identity. Return the fixed failure code `public_repository_license_not_detected` when missing, unrecognized or different.
- Include `checks.detectedMitLicense: true` only in a passing public-release result.
- Preserve the ability to preflight a **new empty** public destination with `license: null` before its first opted-in push; do not conflate destination readiness with post-publication license compliance.
- Keep the same three anonymous, credential-free REST GETs, with no new API call, secret access, payment activity or release mutation.
- Update the publication test fixture's successful published metadata and add a post-push pending-verification regression for a missing license.
- Update [anonymous verification](../submission/ANONYMOUS_PUBLIC_GITHUB_CHECK.md), [cutover checklist](../submission/FINAL_CUTOVER_CHECKLIST.md) and [submission index](../submission/README.md) to require the GitHub About MIT recognition signal.

## Verification

- `node --check scripts/public-github-release-check.mjs`: **passed** on Node 24.22.1.
- `node --test scripts/public-github-release-check.test.mjs scripts/public-release-publish.test.mjs`: **26 passed, 0 failed, 0 skipped** on Node 24.22.1.
- Missing, null, unrecognized, non-MIT and malformed license values block publication verification. A not-yet-populated public destination still passes its one-request pre-push visibility check.
- The opt-in publication handoff reports `pushed_verification_pending`, never `published_and_verified`, if GitHub's post-push metadata still lacks MIT detection. The existing exact-commit public Git push safety tests remain green.

This focused local test is not a complete Node 22 release verification, proof of a real published GitHub URL, a PayPal Sandbox settlement or a Devpost submission.

## Next release action

Use the frozen complete source under Node 22.13+ and pnpm 12.8.2 for `node scripts/clean-release-checkout.mjs --export-public`, then obtain genuine PayPal Sandbox acceptance for a paid exact invoice and its signed matching webhook. Publish **only** the sanitized exported one-commit repository after the private preflight. Confirm GitHub's About section displays MIT, rerun the read-only anonymous source checker, and then verify the public video and submitted Devpost entry. Do not change the original private repository's visibility.
