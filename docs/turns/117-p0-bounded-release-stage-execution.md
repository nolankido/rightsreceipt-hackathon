# Turn 117: Bound and diagnose the final release verification stages

**Date:** November 5, 2026 UTC  
**Status:** Implemented and tested locally; no exact full Node 22 release performed.

## Why this was a release risk

`scripts/clean-release-checkout.mjs` already imposed a 30-minute deadline on the whole verifier. However `scripts/release-candidate-verify.mjs` launched four potentially expensive child commands without their own timeouts. A stalled registry download or test command could consume most of the outer deadline and terminate before the inner verifier wrote `verification.json`. That made a final cutover retry difficult to diagnose under the hackathon deadline.

## Implementation

The inner verifier now applies a hard-coded timeout to every release stage:

| Index | Stage | Timeout |
| --- | --- | --- |
| 1 | Public source snapshot audit | 2 minutes |
| 2 | Frozen `corepack pnpm install` | 8 minutes |
| 3 | Full `corepack pnpm verify` | 15 minutes |
| 4 | Judge rehearsal | 3 minutes |

The combined 28-minute maximum leaves a small allowance below the existing outer 30-minute cap for evidence writes and process startup. All Git preflight subprocesses also have a 15-second timeout. The process executor validates its timeout argument and uses `spawnSync` with `SIGTERM`, a 16 MiB buffer limit, the existing sanitized release environment and the Windows Corepack command allowlist.

Any process error is a nonzero stage outcome even if an inconsistent status value reports zero. On an `ETIMEDOUT`, the verifier adds the fixed `release_stage_N_timed_out` code to private `verification.json`, saves its standard hashed command logs and stops the remaining stages. It cannot mark the release passed after the timeout. The outer clean-checkout wrapper may still report its generic failure code, so the runbook points to the preserved private evidence for the specific stage.

## Verification

- Source syntax checked on Node 24.22.1.
- `node --test scripts/release-candidate-verify-local.test.mjs` passed **15/15 tests**.
- `node --test scripts/clean-release-checkout.test.mjs` passed **10/10 existing clean-wrapper tests**, confirming compatible release summary and guarded export behavior.
- New tests cover stage indices, exact budgets, the combined outer-budget condition, invalid timeout rejection, mock `ETIMEDOUT` with inconsistent zero process status, and a real stalled Node child terminated at a 250 ms test timeout.
- Prior tests for clean lockfile identity, hidden tracked changes, ignored local credentials and package-manager overrides, and Windows Corepack invocation still pass.
- This is a focused source test on reconstructed private repository files. It is **not** `pnpm release:verify`, and it does not prove Node 22, Windows process-tree termination or genuine PayPal Sandbox acceptance.

## Operator implications

If the final Windows run fails with `release_verification_failed`, read the generated private `verification.json` and its fixed blocker code. Stage 2 usually points to package installation or connectivity; Stage 3 to the source/test verification; Stage 4 to the judge rehearsal. Investigate any orphaned Windows child before trying a new clean run. Keep the original failed evidence, do not remove private release logs, and do not publish or pay anything as part of diagnosis.

## Next action

Run the complete exact private commit under Node 22.13+ and pnpm 12.8.2 with `node .\scripts\clean-release-checkout.mjs --export-public`. Once it genuinely passes, complete the separate real Sandbox payment/webhook acceptance and public source/video/Devpost cutover. No provider keys, public release, deployment or payments were used in this turn.
