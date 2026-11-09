# Turn 121: Require original private release evidence path provenance

**Date:** November 5, 2026 UTC  
**Status:** Implemented and locally tested. Full Node 22 release remains outstanding.

## Why this matters

The clean-checkout verifier runs the complete release in a fresh local clone and returns a private `verification.json` path. The wrapper previously checked whether this path appeared to be under `.data/clean-release/evidence/`, but used a lexical path comparison and followed symbolic links. A link in the run directory or file could redirect the read to an unrelated JSON record that claimed success. This was an evidence-origin gap just before public export and submission.

Turn 121 rejects that misdirection without changing the canonical full verifier or attempting a public release. The judge-facing console was reviewed first, and the release evidence boundary was selected as the higher-priority correctness risk.

## Changes

- Require an absolute evidence path with the exact layout `evidence/<run-directory>/verification.json` under the owned private clean-release root.
- Resolve the canonical paths of the evidence root, run folder and file. Reject symlinks at the root, run folder and file, and require the canonical evidence file to remain directly inside the verified run folder.
- Require a regular, nonempty evidence file no larger than 512 KiB, preventing the wrapper from reading unbounded substituted JSON.
- Preserve commit, schema, full-mode and successful-status checks from prior turns for both passing and failed records.
- Convert missing, malformed or redirected evidence to the fixed `release_result_invalid` code, with no raw path contents, logs or provider information in the failure.
- Add release regressions for symlinked files, symlinked run directories, symlinked evidence roots, oversized records, wrong filenames, nested records and nonobject summaries. Skip symlink-only tests when the host operating system denies fixture symlink creation.
- Update [Windows release instructions](../submission/CLEAN_CHECKOUT_RELEASE.md) and the [final cutover checklist](../submission/FINAL_CUTOVER_CHECKLIST.md).

## Verification

- `node --check scripts/clean-release-checkout.mjs`: **passed** on Node 24.22.1.
- `node --test scripts/clean-release-checkout.test.mjs scripts/release-candidate-verify-local.test.mjs`: **31 passed, 0 failed, 0 skipped** on Node 24.22.1.
- The existing legitimate release-record fixture still passes its synthetic verification. All new redirected/oversized path fixtures are rejected with `release_result_invalid`.

This is focused source-level and local fixture testing. The exact complete checkout is unavailable here and this environment has Node 24 rather than Node 22. The change does not establish a passing full release, real Sandbox invoice/payment/webhook, published public repository, public video or submitted Devpost entry.

## Immediate next action

Run `node .\scripts\clean-release-checkout.mjs --export-public` on the full private RightsReceipt checkout using Node 22.13+ in the Node 22 line. Preserve its original private evidence. If successful, continue the genuine PayPal Sandbox acceptance and sanitized one-commit public export checks. A synthetic or linked record never substitutes for real release evidence.
