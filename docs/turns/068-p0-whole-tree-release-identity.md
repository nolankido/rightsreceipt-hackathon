# Turn 068: Whole-tree source identity for the release candidate

## Problem and priority

RightsReceipt already checked the committed lockfile and a clean Git status, but that was not enough to establish that all application files being tested matched the release commit. Git's `skip-worktree` and `assume-unchanged` index flags can hide source modifications from ordinary `git status`. A clean-looking test run could therefore use altered application code and later export different committed bytes. This is a P0 release-integrity gap.

## Implemented protection

Added `scripts/tracked-source-identity.mjs`, a dependency-free fail-closed verifier covering every tracked file. It:

1. Compares the complete `HEAD` tree path/mode/object identities against the staged Git index, including rejecting staged divergence and nonregular entries.
2. Rejects hidden `skip-worktree` and `assume-unchanged` flags across all tracked paths.
3. Recomputes each working file's Git-normalized object SHA with `git hash-object --path` and compares it to the exact committed blob, including when Git status is misleading.
4. Reports only fixed failure codes and a successful file count, never secret values or source path names.
5. Preserves normal CRLF handling using Git's path-specific clean filters.

Integrated the verifier into `scripts/release-candidate-verify.mjs` both at preflight and after the full verification commands. It rejects hidden source changes made before or during the release process. Integrated it into `scripts/export-public-release.mjs` before creating the sanitized public repository. The existing exact-commit release evidence requirement, sanitized one-commit history, public audit and tree-SHA checks remain unchanged.

## Code and regression changes

- `scripts/tracked-source-identity.mjs`: reusable source-identity guard.
- `scripts/tracked-source-identity-local.test.mjs`: nine isolated Git-fixture tests.
- `scripts/release-candidate-verify.mjs`: before/after source checks.
- `scripts/export-public-release.mjs`: pre-export source check.
- `scripts/release-candidate-verify-local.test.mjs`: hidden non-lockfile edit regression and fixture integration.
- `scripts/export-public-release-local.test.mjs`: concealed source mutation rejected even with synthetic passing release logs; fixture integration.
- `package.json`: add focused tests to `release:preflight:verify`.
- `README.md`, `PROJECT_STATUS.md` and release/public-audit runbooks: update scope and evidence limits.

## Verification performed

Nine standalone tests passed using Node 22.16.0 and Git 2.47.3 in disposable local Git repositories. They covered clean source, hidden `skip-worktree` and `assume-unchanged` edits, ordinary changed source, staged divergence, deleted files, ignored-untracked files, CRLF normalization and a Git symlink mode. A separate 635-file synthetic repository verified successfully in about 1.2 seconds, demonstrating that per-file hashing is practical at RightsReceipt's current scale.

The complete package install, TypeScript/build suite, full regression collection, new release/export fixture integration tests and exact clean-checkout `pnpm release:verify` were **not** run in this session. Although this environment has Node 22, it lacks an authenticated local checkout and cannot clone the private GitHub repository. The release remains NOT READY.

No GitHub Actions, real PayPal requests, Cloudflare deployment, paid API calls, public GitHub repository creation or publication occurred.

## Remaining release gates

Run the exact clean Node 22 release verifier, complete a real PayPal Sandbox invoice/payment/verified webhook journey, provision and smoke-test a restricted Cloudflare D1/Worker judge preview, finalize a usable authenticated demonstration, export the sanitized one-commit public repository, verify all public links and video, and submit the Devpost entry. Keep the private development repository and historical author metadata private.

The source verifier proves Git-normalized consistency at the checked times, not the authenticity of remote GitHub, dependency packages, PayPal Sandbox, or the deployed application.
