# Turn 102: Expand secret-prefix detection before public repository export

**Date:** November 4, 2026
**Priority:** P0, reduce accidental credential exposure
**Baseline:** private `main` after Turn 101

## Verified gap

The current public-source auditor recognized `ghp_` and `github_pat_` GitHub personal access tokens but did not detect `gho_` OAuth tokens, `ghu_` GitHub App user tokens, `ghs_` installation tokens or `ghr_` refresh tokens unless they also happened to match a generic assignment or bearer pattern. The GitHub documentation explicitly lists those prefixes and notes the introduction of JWT-style installation tokens. See [GitHub's token format documentation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github).

The scanner also lacked dedicated patterns for common `sk-proj-`, `sk-svcacct-` and `sk-admin-` OpenAI-style API key identifiers, legacy long-form `sk-` keys, and `ASIA` temporary AWS access key IDs.

As a result, a hard-coded token in a comment, unrecognized assignment, or copied source snippet could bypass the old `known_secret_token_prefix` check even though the public repository exporter requires a zero-finding source audit.

## Implemented fix

1. Added `scripts/support/public-audit-token-patterns.mjs` with one dependency-free, read-only `hasKnownSecretPrefix` function. It recognizes documented GitHub PAT, OAuth, App user, App installation and refresh token shapes, including dot-separated installation JWT-style values. It covers common OpenAI-style project, service-account, administrative and legacy API keys and AWS temporary credentials, while preserving earlier Anthropic, npm, Slack, Google, long-lived AWS and Stripe detections.
2. Updated `scripts/public-release-audit.mjs` to use the new helper before any general fixture exemption. A match still becomes only the fixed `known_secret_token_prefix` finding with path and line, never the secret value.
3. Added seven focused Node tests in `scripts/support/public-audit-token-patterns.test.mjs`, covering all supported prefixes, JWT-style installation tokens, short-placeholder exclusions, backward compatibility and fixture labels that must not mask provider-shaped tokens.
4. Added two synthetic Git audit regressions to `scripts/public-release-audit-local.test.mjs`: leaked provider token shapes fail the tracked current-tree snapshot without exposing the values, and a deleted GitHub App refresh token still fails the full reachable-history audit.
5. Updated `scripts/public-release-audit-local.test.mjs` and `scripts/export-public-release-local.test.mjs` to copy the new helper when creating their temporary Git repositories.
6. Added the focused test file to `public:audit:verify`. The release candidate's `pnpm verify` and the sanitized export gate already invoke the public audit.
7. Updated `docs/engineering/PUBLIC_RELEASE_AUDIT.md` to explain new coverage and its heuristic limitations.

## Executed checks

- Node **v22.16.0** ran `node --test --test-reporter=tap scripts/support/public-audit-token-patterns.test.mjs`: **7 passed, 0 failed, 0 skipped**.
- The exact two local module/test files were verified by `git hash-object` against their committed GitHub blob SHA-1 identifiers:
  - `scripts/support/public-audit-token-patterns.mjs`: `bed8521dbb74564a145f232ade51b8ff6c70967f`
  - `scripts/support/public-audit-token-patterns.test.mjs`: `f64c60245d71b39150422febdc80be71ecb80679`
- The current committed `scanText` function was replayed using the new helper and the stricter Turn 100 fixture classifier. **Eight of eight targeted assertions passed**, including six positive provider patterns and two negative values.
- Seven selected current source and documentation files passed the current scanner logic with **zero findings**.

[Turn 102 structured verification record](../evidence/turn102/expanded-token-audit-validation.json) contains the test outcome, TAP SHA-256, source blob identities and scope.

## Remaining verification boundaries

This is a targeted dependency-free Node test plus production scanner replay, **not** a green full repository snapshot/history audit. The synthetic temporary-Git regressions were committed but were not executed from a full private checkout, which is not mounted in this execution environment. The pinned pnpm installation and full `pnpm release:verify` are also outstanding.

Token-pattern checks are heuristic. They cannot prove that a value is active or that a source tree is free of all secrets. The final public export must still pass the complete audit and receive human review before its separate one-commit GitHub repository is published. The private development repository must remain private.

## Remaining submission work

1. Run `pnpm public:audit:verify`, `pnpm public:audit:snapshot`, `pnpm public:export:verify` and `pnpm release:verify` from the same clean final Node 22 / pnpm 12.8.2 private checkout.
2. Obtain genuine PayPal Sandbox create/send, separate-buyer payment, independently authenticated PAID invoice GET and signature-verified same-invoice paid webhook evidence.
3. Export the sanitized one-commit public source repo, publish a functioning public video under three minutes, and complete the Devpost submission.

**Internal target:** November 9, 2026 at 3:00 p.m. Eastern.
**Official deadline:** November 12, 2026 at 3:00 p.m. Eastern.

No paid APIs, real PayPal transactions, GitHub Actions, remote deployment, public repository visibility changes, YouTube uploads or Devpost submissions occurred in this turn.
