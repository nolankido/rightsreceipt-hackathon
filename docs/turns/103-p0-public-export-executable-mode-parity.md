# Turn 103: Preserve executable Git modes in the sanitized public export

**Date:** November 4, 2026
**Priority:** P0, protect reproducible public source release
**Status:** Implemented and targeted regressions passed; full release gate remains open
**Source:** Private `nolankido/rightsReceipt`, after Turn 102

## Confirmed defect

`scripts/export-public-release.mjs` copied each tracked `HEAD` blob to a fresh repository and performed `git add`, but it did not preserve executable-file mode `100755`. Copying such a file as an ordinary file changed its Git mode to `100644`. The export then failed its own required source/public tree identity check with `tree_identity_mismatch`, even when no content or credential was wrong.

The current private main-tree inventory has no executable blobs, so this is a **reproduced release-tool defect for a valid future source change**, not evidence that the current main snapshot was failing. It matters because a judge helper or packaging script may legitimately become executable before the final candidate freeze.

## Implementation

- `trackedEntries()` now reads the Git index in NUL-delimited staged format, retaining the exact regular-file mode with each tracked path and rejecting unsupported Git entries.
- Exact `HEAD` blob bytes are still used for the export; no working-tree data or private history is copied.
- Executable entries receive filesystem executable permissions on POSIX and an explicit Git index `--chmod=+x` setting after staging, so the Git tree identity check is portable to Windows where filesystem execute bits are not authoritative.
- The manifest's tracked file count now comes from the mode-aware tracked-entry list.
- A synthetic two-commit private repository regression adds a `100755` helper, proves the old exporter failed with `tree_identity_mismatch`, and verifies that the new export has a single public noreply commit with exactly the same Git tree and executable mode.

## Verification performed

- **Red test:** the new executable-mode regression failed against the previous exporter with `tree_identity_mismatch`.
- **Green test:** `node --test scripts/export-public-release-local.test.mjs`: **15 passed, 0 failed**.
- **Adjacent public audit tests:** `node --test scripts/public-audit-blob-policy.test.mjs scripts/support/public-audit-fixture-value.test.mjs scripts/support/public-audit-token-patterns.test.mjs scripts/public-release-audit-local.test.mjs`: **60 passed, 0 failed**.
- Tests ran from a focused local reconstruction of the relevant **exact GitHub source blobs**, on **Node v24.22.1**, with synthetic temporary Git checkouts. No actual private-release evidence was forged or certified.

The new regression validates the executable mode and exact tree on the current POSIX execution host. The Windows branch is implemented using Git index mode, but was not executed on Windows in this turn.

## Not yet verified

- The full private repository was not cloned locally because authenticated Git transport was unavailable. The frozen real source tree, entire application and history were not audited in this turn.
- The pinned Node 22 / pnpm 12.8.2 `pnpm release:verify` was **not** run. The isolated tests above do not substitute for it.
- Genuine PayPal Sandbox payment, independent PAID retrieval and signature-verified paid webhook have not been observed.
- No public repo was created, no video uploaded, no deployment or Devpost submission made, and no paid service called.

## Next eligible work

1. Use a clean authenticated full checkout, Node 22 and pinned pnpm to run `pnpm release:verify`, then resolve genuine failures before freezing the source.
2. Complete genuine Sandbox create/send, separate buyer payment, authenticated PAID GET, and exact-invoice verified webhook acceptance.
3. From the frozen candidate, export and inspect the new one-commit public tree, verify judge instructions signed out, record a public working demo under three minutes, and submit on Devpost before the November 9 internal target.

The original development repository must remain private. Local rehearsals are simulations, not proof of PayPal settlement.
