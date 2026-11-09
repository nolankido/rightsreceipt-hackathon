# Turn 110: Clean-checkout full-release runner

**Date:** November 5, 2026 UTC

**Status:** Committed code and targeted regression validation. Exact clean Node 22 release remains open.

## Goal

Provide a reliable, single-command route to the actual pinned release verification from the user's local Windows Git repository, without contaminating the development checkout, depending on remote Git access or deleting previous evidence.

## Implemented

1. New dependency-free `scripts/clean-release-checkout.mjs` requires Node 22.13 through 22.x in its production CLI, verifies the current local Git HEAD and repository root, and creates a unique clone under ignored `.data/clean-release/checkouts/`.
2. The clone uses local Git transport and independent object copies (`git clone --no-hardlinks`), detaches the checkout at the exact source commit, checks the committed SHA remains unchanged in the source, and requires an empty clone Git status. Source `.env`, untracked work and private ignored data cannot enter the clone.
3. The runner invokes the existing canonical full `scripts/release-candidate-verify.mjs` in that cloned source with a clean environment, retaining all existing frozen-install, full-verify, judge-rehearsal and source-evidence gates.
4. Logs and proof are saved under the original repository's ignored `.data/clean-release/evidence/` folder. The summary is validated against the expected commit and evidence path. The private checkout and evidence are preserved for diagnostics, including failures. No published branch or existing working file is changed.
5. `package.json` gains `release:clean:verify` as a shortcut and includes the new test in `release:preflight:verify`, so the clone runner participates in the normal pinned release test suite.
6. `docs/submission/CLEAN_CHECKOUT_RELEASE.md` documents one Windows PowerShell command, output/error meanings, privacy rules and the remaining external gates.

## Verification

`scripts/clean-release-checkout.test.mjs` ran six targeted checks, including a real synthetic local Git clone with ignored `.env` and untracked notes absent from the detached clone. A separate test showed committed source identity and valid release summary linking. The actual CLI `--help` and invalid-argument boundaries were exercised.

Combined targeted tests:

```sh
node --test --test-reporter=tap \
  scripts/clean-release-checkout.test.mjs \
  scripts/release-candidate-verify-local.test.mjs \
  scripts/public-release-audit-local.test.mjs \
  scripts/export-public-release-local.test.mjs \
  scripts/submission-candidate-check.test.mjs \
  scripts/support/release-judge-evidence.test.mjs \
  scripts/judge-console-real-smoke.test.mjs \
  scripts/support/judge-console-page.test.mjs \
  scripts/judge-rehearsal-report-local.test.mjs
```

**Result:** 185 passed, 0 failed under Node 24.22.1 in the focused source reconstruction. The production invocation of the new CLI under that runtime returned the intentional `node_22_required` failure. It did not create a release clone or run dependency installation.

## Boundaries

The current execution environment lacks Node 22 and authenticated direct Git transport to the complete private repository, so a full `pnpm release:verify` has **not** been executed here. The new helper enables execution from a local clone on a machine that already has the private repository, Git and Node 22 installed. Native Windows operation was not directly tested in this Linux environment. This turn makes no claim that the project builds, that the canonical release is passing, or that a genuine PayPal Sandbox event occurred.

Remaining gates: exact full release, distinct Sandbox buyer payment with authenticated paid status and signature-verified matching webhook, sanitized public one-commit source, public working demo shorter than three minutes, and Devpost submission. Do not publish the cloned private development history or any `.data` output.
