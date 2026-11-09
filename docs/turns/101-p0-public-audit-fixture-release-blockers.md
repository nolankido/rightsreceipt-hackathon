# Turn 101: Repair public-audit blockers in legitimate financial test sources

**Date:** November 4, 2026
**Priority:** P0, source audit required before publishing the sanitized hackathon repository
**Baseline:** private `main` after Turn 100

## Confirmed issue

Turn 100 correctly removed a broad public-audit exemption for secrets containing the words `fake`, `fixture` or `example` anywhere. Applying that stricter scanner to current PayPal-related repository source exposed additional **false positives in synthetic test data**:

- A transaction fixture used a secret with `fixture` embedded in the middle, instead of an explicit leading fixture label.
- Several PayPal invoice and account-control tests used opaque-looking, deliberately synthetic secrets without a recognized fixture prefix.
- Negative tests intentionally contained whitespace-only secrets, malformed addresses and unsafe basic-auth URLs. The static scanner treated those test examples or partial template interpolations as actual secrets or email addresses.

These findings could block `public-release-audit.mjs --snapshot-only` even though none is a genuine credential. The correct repair was to make the **test inputs** unambiguously synthetic or construct deliberately invalid URL/email strings at runtime, **not to weaken the release scanner**.

## Implemented changes

- `scripts/support/transaction-browser-fixture.mjs`: renamed its synthetic PayPal client secret to an explicit `fixture-` prefix. Updated corresponding redaction assertions in `scripts/buyer-payment-local.test.mjs` and `scripts/judge-rehearsal-isolation-local.test.mjs` and the fixture example in `docs/submission/PUBLIC_REPO_PREFLIGHT.md`.
- `scripts/paypal-adapter-local.test.mjs`: updated the synthetic secret and its redaction assertion; retained the three-space invalid credential test by constructing that value at runtime and kept the fake-mode rejection test explicitly labeled.
- `scripts/invoice-controls-local.test.mjs`, `scripts/invoice-sending-local.test.mjs`, and `scripts/invoice-recovery-local.test.mjs`: gave synthetic payment secrets explicit `fixture-` prefixes, updating the existing redaction checks where they referred to those values.
- `scripts/paypal-sandbox-draft-local.test.mjs`: still builds the invalid newline-bearing email at runtime but avoids a false static email match.
- `scripts/paypal-invoice-local.test.mjs` and `scripts/public-release-audit-local.test.mjs`: still construct and reject unsafe credential-bearing URLs at runtime without embedding static `user:pass@host` or `${token}@host` fragments in the published test source.
- Added a **Git snapshot regression** to `scripts/public-release-audit-local.test.mjs`. It copies nine real financial test sources into a synthetic Git repository, commits them, and requires the actual snapshot auditor to return zero findings. This will catch future drift in fixture conventions.

**The security audit rules were not relaxed.** The stricter Turn 100 classifier, known secret-token prefix detection, forbidden URL detection and nonfixture email checks remain in effect.

## Verification performed

Using the current scanner's exact `scanText` logic and fixture-classification source fetched from private GitHub, a source-level JavaScript evaluation scanned all **ten modified JavaScript source and test files** at their committed blob identities. **Zero findings** remained. All ten files also passed JavaScript parse checks in the isolated evaluator.

The project's actual `safeCredential` validator was extracted from `packages/paypal/src/adapter.ts` and executed against six new fixture labels; all six met the expected accepted-input shape. The deliberately invalid-input cases were preserved.

See [Turn 101 source-level evidence](../evidence/turn101/public-audit-source-fixtures.json) for the exact source blob SHAs and check boundaries.

**Not executed:** `node --test scripts/public-release-audit-local.test.mjs`, `pnpm public:audit:verify`, the complete Git snapshot/history audit, `pnpm release:verify`, genuine PayPal Sandbox acceptance, sanitized public export, video publication or Devpost submission. The complete private checkout and pinned pnpm dependencies remain unavailable in this execution environment. The new Git-fixture test is committed but has not been verified by Node.

## Next release gates

On one clean private checkout at a frozen commit, using Node 22.13+ and pnpm 12.8.2:

```bash
pnpm public:audit:verify
pnpm public:audit:snapshot
pnpm release:verify
```

Only after those gates pass should the separate sanitized one-commit public repository be exported. Genuine Sandbox payment, authenticated PAID GET, matching verified webhook, a public under-three-minute functioning YouTube demo and Devpost submission remain required.

**Internal target:** November 9, 2026 at 3:00 p.m. Eastern.
**Official cutoff:** November 12, 2026 at 3:00 p.m. Eastern.

No paid APIs, production or Sandbox payments, public visibility changes, GitHub Actions or external submission occurred in Turn 101.
