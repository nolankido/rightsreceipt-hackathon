# Turn 100: Reject embedded fixture markers in public source audit

**Date:** November 4, 2026  
**Priority:** P0, prevent unsafe public source release  
**Baseline:** private `main` after Turn 099

## Reproduced defect

The public release scanner previously used `fixtureMarkers.some(marker => value.toLowerCase().includes(marker))`. As a result, an opaque credential containing text such as `fake`, `example` or `fixture` **anywhere inside** could bypass the `sensitive_environment_assignment`, `sensitive_object_assignment` or `literal_bearer_token` checks.

For example, `PAYPAL_SANDBOX_CLIENT_SECRET=real-credential-with-fake-in-the-middle-987654321` would pass the generic fixture exemption despite being presented as an actual credential. This did not bypass the independent detector for known provider-issued key prefixes, but it weakened the scanner for other secret formats.

## Implemented correction

- Added `scripts/support/public-audit-fixture-value.mjs`, a shared strict placeholder/fixture classifier. It requires unambiguous placeholder syntax or a **leading** fixture label. Merely embedding a marker in an otherwise opaque value no longer causes an exemption. Explicit test-only labels are permitted narrowly in actual `.test.*` or `.spec.*` paths.
- Updated `scripts/public-release-audit.mjs` to import the strict classifier for sensitive secret assignments and literal bearer checks; removed the old broad substring function.
- Added `scripts/support/public-audit-fixture-value.test.mjs` with five unit tests covering clearly labeled placeholders, embedded marker bypasses, test path policy, missing or opaque values, and production vs test files.
- Updated both synthetic Git repository test fixtures, `scripts/public-release-audit-local.test.mjs` and `scripts/export-public-release-local.test.mjs`, to copy the new helper alongside the public audit script.
- Added two integration regressions to `public-release-audit-local.test.mjs`: an opaque value containing `fake` is blocked in the actual tracked-source snapshot, whereas an explicit `fixture-secret-123` label remains allowed.
- Updated the `public:audit:verify` package script to run the new standalone unit suite. The public export verifier and full `pnpm verify` already use the audit checks.
- Clarified fixture allowances and heuristic limitations in `docs/engineering/PUBLIC_RELEASE_AUDIT.md`.

## Verification observed

**Executed Node 22.16.0 test:** `node --test --test-reporter=tap scripts/support/public-audit-fixture-value.test.mjs` from a local isolated workspace containing exact GitHub source blobs. **5 passed, 0 failed, 0 skipped.** Both blob SHA values matched the files committed to private GitHub. The TAP output SHA-256 is in [Turn 100 evidence](../evidence/turn100/public-audit-fixture-hardening.json).

**Production scanner replay:** The exact current `scanText` implementation and its data definitions were extracted from the current GitHub source and evaluated with the new strict classifier. The opaque example above now produced `sensitive_environment_assignment` at line 1, whereas the former broad classifier would have exempted it. A clearly labeled fixture value produced no finding. The known `sk_test_` key prefix still produced a blocking finding.

The modified scripts and fixtures passed JavaScript static syntax checks, but the **full Git-fixture public-audit test suite, public export suite and complete `pnpm release:verify` have not been executed** from the current private repository. This turn must not be reported as full release acceptance.

## Next urgent cutover gates

1. Obtain the complete clean private repository with Node 22.13+ and pnpm 12.8.2, and run `pnpm public:audit:verify`, `pnpm public:export:verify`, and `pnpm release:verify`. Resolve any new findings rather than weakening fixture classification for unknown credentials.
2. Complete genuine PayPal Sandbox create/send, separate buyer payment, authenticated PAID GET and exact-invoice signature-verified webhook evidence.
3. Export and review a **separate sanitized one-commit public repository**. Do not publish private development history or private configuration files.
4. Publish the functioning, publicly viewable YouTube demonstration under three minutes and submit Devpost before the **November 9, 2026 3:00 p.m. Eastern** internal target, ahead of the **November 12, 2026 3:00 p.m. Eastern** official deadline.

No paid APIs, real PayPal transaction, GitHub Actions, remote deployment, public repository publication, YouTube upload or Devpost submission occurred in this turn.
