# Turn 111: Windows release evidence accepted by the one-commit public exporter

**Date:** November 5, 2026 UTC

**Status:** Implemented and regression-tested in a focused reconstructed source checkout. Pinned Node 22, native Windows and genuine external release gates remain open.

## Release blocker

The canonical full release verifier was repaired in Turn 107 to launch Corepack on Windows using `cmd.exe /d /c corepack.cmd pnpm ...`. Its evidence therefore correctly records command arrays beginning with `cmd.exe`, and the matching stage log filenames begin with `02-cmd.exe` and `03-cmd.exe`.

The sanitized public exporter still only accepted the POSIX evidence forms `corepack pnpm install --frozen-lockfile` and `corepack pnpm verify`. Even a genuine successful Windows release could not pass the exporter to produce the public source. The shared local submission-candidate checker also depends on this export evidence validator.

## Change

1. `scripts/export-public-release.mjs` imports the verifier's `releaseCommandInvocation` and checks each Corepack stage against its precise direct POSIX or fixed Windows invocation, avoiding independent allowlists that can drift apart.
2. Both stage commands remain exact-match only. No arbitrary shell command, altered flag, replacement binary, extra argument or unapproved `.cmd` form is accepted.
3. Existing commit binding, log-file hashes, pinned pnpm and Node versions, judge evidence, source audit, tree identity and author sanitization remain required.
4. `scripts/export-public-release-local.test.mjs` builds synthetic Windows release evidence with the actual `cmd.exe` arrays, names the log files as the verifier would, and tests full one-commit export. Separate negative cases modify the shell text or launcher options. The test fixture now copies the verifier dependency into its synthetic repo.
5. `docs/submission/CLEAN_CHECKOUT_RELEASE.md` explains how a successful clean-checkout report feeds the one-commit exporter from its clean clone on Windows.

## Evidence

The new valid-Windows test first failed against the prior exporter with `release_evidence_invalid`; the existing POSIX tests still passed. After the change, all **17/17** focused public-export tests passed on Node 24.22.1, including the valid Windows record, three tampered Windows command variants, real temporary Git export/tree checks, unchanged Unix acceptance and existing negative security controls.

The adjacent release-preflight suite also passed 12/12, giving **29/29** combined passing tests on Node 24.22.1. The exporter syntax check passed.

These are **synthetic evidence fixtures**, not real verification output, a native Windows run or a passing frozen full Node 22 build. The new code makes the later real operator handoff possible without relaxing evidence standards.

## Release gates still unresolved

- Run the exact clean release on the full private source using Node 22.13+ within the 22.x major and pinned pnpm 12.8.2.
- Perform genuine PayPal Sandbox buyer payment, authenticated paid-status confirmation and exact-invoice signature-verified webhook reconciliation.
- Export and independently review the sanitized one-commit public source, then publish it separately from the private development repository.
- Publish and verify a functional public demo video under three minutes.
- Submit Devpost and retain its actual confirmation.
