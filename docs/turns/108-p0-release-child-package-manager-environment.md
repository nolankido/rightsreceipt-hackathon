# Turn 108: Package-manager environment isolation for release verification

**Date:** November 5, 2026 UTC

**Status:** Focused improvement complete. Full clean Node 22 release verification remains outstanding.

## Problem

`cleanEnvironment()` in `scripts/release-candidate-verify.mjs` removed some named provider credentials before running the pinned release steps, but its provider-prefix expression was case-sensitive. It also allowed inherited environment variables that control Corepack and pnpm registry behavior. This matters because a Windows environment treats variable names without regard to case, while a developer's process may carry secrets or registry overrides from unrelated projects.

Corepack documents `COREPACK_NPM_TOKEN`, `COREPACK_NPM_USERNAME`, `COREPACK_NPM_PASSWORD`, `COREPACK_NPM_REGISTRY` and `COREPACK_INTEGRITY_KEYS` as meaningful configuration. The last can disable registry integrity verification when set to `0`. pnpm documents environment-based registry authentication including `pnpm_config_//registry.npmjs.org/:_authToken`. These settings were not excluded by the previous environment filter.

Primary technical references:

- [Corepack environment variables](https://github.com/nodejs/corepack/blob/main/README.md)
- [pnpm authentication settings](https://pnpm.io/npmrc)

## Change

1. Provider-prefixed variables are now detected case-insensitively, including mixed-case PayPal and Vite names.
2. Inherited `NPM_CONFIG_*`, `PNPM_*`, `COREPACK_*` and `YARN_*` variables are removed before release child processes launch. This covers environment-provided registry tokens, alternate registry configuration and Corepack integrity overrides.
3. The explicitly named `NPM_TOKEN`, `NODE_AUTH_TOKEN`, `NODE_OPTIONS` and `NODE_TLS_REJECT_UNAUTHORIZED` variables are also removed without regard to letter case.
4. Any inherited casing of `APP_MODE` is removed before the verifier sets the exact `APP_MODE=local` and `PAYPAL_MODE=fake` pair. The existing disabled feature flags remain set to `false`.
5. Unrelated execution essentials such as `PATH` and `CI` remain available, and the input environment object is not mutated.

The verifier still invokes the same four release-stage commands, including the exact pinned Corepack/pnpm commands. The new Windows Corepack launch from Turn 107 is unchanged.

## Test evidence

The new regression supplies synthetic mixed-case provider secrets, Corepack token/registry/integrity settings, npm/pnpm/yarn authentication settings and insecure Node TLS configuration. It confirms none survive the child environment, while `PATH` and `CI` do and the local/fake payment boundary is enforced.

The test failed against the prior code because inherited `app_mode` survived. It passed after the filter change.

```sh
node --test --test-reporter=tap scripts/release-candidate-verify-local.test.mjs
```

**Result:** 10 passed, 0 failed on Node 24.22.1.

A combined targeted selection of release, public audit/export, submission-candidate, judge-console, page and report suites passed **177 of 177** on Node 24.22.1.

## Limits and next gate

This change strips environment variables, but does not prove that machine-level or user-level package-manager configuration files cannot influence installs. It does not run `pnpm install`, the dependency-backed build, the real judge worker or the complete `pnpm release:verify` on the required Node 22 runtime. Normal dependency installation may still access the public npm registry. No live PayPal, paid API, deployment or publication operation was performed.

The next P0 gate is a full clean Node 22.13+ run of the exact frozen private repository. Remaining submission obligations are the genuine distinct-buyer PayPal Sandbox payment and signed webhook, sanitized one-commit public source, functioning short public demo and completed Devpost submission. Do not use local simulation as payment proof.
