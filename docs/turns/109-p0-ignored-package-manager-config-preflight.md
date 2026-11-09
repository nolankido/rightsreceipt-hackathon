# Turn 109: Detect ignored package-manager configuration in release preflight

**Date:** November 5, 2026 UTC

**Status:** Focused improvement complete. Exact clean Node 22 full release remains open.

## Issue

The release verifier already requires a clean Git checkout, checks exact tracked source identity, prevents ignored local dotenv overrides and strips inherited package-manager environment variables. A remaining gap involved locally present package-manager configuration excluded from Git status by a global or repository ignore rule.

An ignored `.npmrc`, `.pnpmfile.cjs` or `pnpm-workspace.yaml` could affect package installation, dependency hooks or workspace selection even if the `git status --porcelain` output were empty. This would make an ostensibly frozen release depend on noncommitted local configuration. The issue is an acceptance-gate coverage gap, not evidence of an actual leaked token or altered production release.

## Implemented change

`scripts/release-candidate-verify.mjs` now checks the three known root package-manager configuration files:

- `.npmrc`
- `.pnpmfile.cjs`
- `pnpm-workspace.yaml`

It uses `git ls-files --cached -z` to determine whether each existing file is tracked, independent of Git ignore rules. If an existing file is not tracked, preflight adds the fixed blocker `local_package_manager_override_present`. If the Git query fails, preflight instead adds `package_manager_config_check_unavailable`. Neither diagnostic exposes the file contents, path names or environment secrets in the structured release output.

The private repository already contains legitimate tracked `.npmrc` and `pnpm-workspace.yaml` files, and these remain permitted. Exact tracked file content and hidden-index flags are covered by the previously existing `verifyTrackedSourceIdentity` gate.

## Tests and evidence

Two tests were added to `scripts/release-candidate-verify-local.test.mjs`:

1. Create synthetic clean Git repositories with a locally ignored package-manager file, separately for all three filenames. Require the release preflight to reject each despite empty Git status and avoid returning the filename.
2. Confirm a harmless committed `.npmrc` and `pnpm-workspace.yaml` do not trigger the new blocker.

Before the production change, the new ignored-config regression failed at `.npmrc`: the checker had no blocker for it. After the fix:

```sh
node --test --test-reporter=tap scripts/release-candidate-verify-local.test.mjs
```

**Result:** 12 passed, 0 failed under Node 24.22.1.

Combined targeted release, public audit/export, submission-candidate and judge-console/report regression selection: **179 passed, 0 failed** under Node 24.22.1.

## Limits and next release gate

This change checks locally present configuration files in the repository root. It does not neutralize machine-level or user-level `.npmrc` configuration, and it does not prove the package-manager install is hermetic or network-free. The exact pinned Node 22.13+ full `pnpm release:verify` with the complete private source checkout and installed dependencies was not executed. Nor were a genuine PayPal payment, signed webhook, remote deployment, sanitized public export, demo video or Devpost submission.

The next priority remains a clean exact-commit Node 22 release run that includes the real application build and judge worker, followed by genuine Sandbox acceptance and the public submission packet. The private development history must remain private.
