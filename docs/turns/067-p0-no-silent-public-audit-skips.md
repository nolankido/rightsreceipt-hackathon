# Turn 067: Public audit must not silently skip source

## Problem

The history-aware public release audit previously scanned only text blobs up to 2 MiB, incremented counters for larger or binary files, and still allowed the audit to pass. The tracked synthetic training dataset `data/synthetic/v1/train.jsonl` is 3,592,589 bytes. A secret added to that file, or an unexamined binary object in the public export tree, could have passed the source audit. Existing regular-file-only iteration also did not independently reject symlinks and Git submodule entries.

## Improvement

The audit now inspects UTF-8 text up to 16 MiB, using strict decoding. An object that cannot be fully inspected fails with a finding rather than a warning or silent skip:

- `oversized_blob_unscanned`: source size exceeds 16 MiB.
- `binary_blob_unscanned`: embedded binary controls or invalid UTF-8.
- `unresolved_git_lfs_pointer`: the committed file points to external Git LFS payload bytes.
- `nonregular_git_entry`: current or historical Git symlink, gitlink/submodule, or unsupported index mode.

Current sources are checked using staged index modes and filesystem metadata. Historical sources are checked with `git ls-tree` entry types and modes. Historical regular blobs are read as raw bytes rather than lossy UTF-8, then inspected before the existing sensitive-content scanner. The scan covers both source snapshot and reachable history. All matched secrets remain excluded from finding evidence.

The larger supported size scans the current 3.59 MB training dataset. Oversized, binary, LFS and Git link findings still block publication even if other checks pass. The one-commit public exporter invokes the stronger snapshot audit before creating the export. The exporter continues requiring genuine full release-verifier evidence for the same clean commit, a byte-identical Git tree and a successful history audit. No exception was introduced for special folders, archival files or fixture paths.

## Files

- `scripts/public-audit-blob-policy.mjs`: inspectability policy, 16 MiB ceiling and strict byte classification.
- `scripts/public-release-audit.mjs`: record blocking findings in the current index/tree and historical Git objects.
- `scripts/public-audit-blob-policy.test.mjs`: six focused regression tests.
- `scripts/public-release-audit-local.test.mjs`: additional Git fixture cases for large text, oversized payloads, binary bytes, LFS, historical deleted binary, symlinks and gitlinks.
- `scripts/export-public-release-local.test.mjs`: two exporter regressions for binary and oversized tracked content.
- `package.json`: include policy tests in `public:audit:verify`.
- `README.md`, `PROJECT_STATUS.md`, `docs/engineering/PUBLIC_RELEASE_AUDIT.md`, `docs/submission/PUBLIC_REPO_PREFLIGHT.md`: update release contract and limitations.

## Verification

Six isolated blob-policy tests ran successfully using Node 22.16.0, including over-2 MiB UTF-8, 16 MiB boundary, NUL/invalid UTF-8, unresolved LFS pointer, nonregular Git mode, and international UTF-8 text. The modified audit and regression JavaScript also passed a source parsing check. The new Git-fixture and exporter integration tests were authored but have not been executed against this exact patch in the current session. They must pass during the complete pinned Node 22 verification before publication.

An earlier interrupted pass reported fifty passing audit/export tests, but its attempted GitHub write was not completed; that earlier result is not treated as execution evidence for this new commit.

No real PayPal Sandbox operations, Cloudflare/D1 calls, public repository creation, deployment or paid API calls occurred.

## Release gates still open

The private development Git history must remain private because of existing author metadata. The source code remains NOT READY for publication until a clean, exact-commit `pnpm release:verify`, genuine PayPal Sandbox invoice/payment/webhook acceptance, approved Cloudflare D1/Worker deployment with passing eleven-probe hosted smoke, complete authenticated demo, sanitized one-commit export, public video and Devpost submission are complete.

A scanner is a defense against obvious publication mistakes, not a guarantee that all sensitive content is detectable. Review license notices, ownership of demonstration assets, third-party dependencies and source provenance separately.
