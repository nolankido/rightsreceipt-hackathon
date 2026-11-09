# Turn 112: One-command clean release and sanitized public-source preparation

**Date:** November 5, 2026 UTC

**Status:** Implemented and locally regression-tested. The final pinned Node 22 release, PayPal Sandbox acceptance, public publication and Devpost submission remain open.

## Problem

The verified release could be followed by `pnpm public:export`, but the operator had to manually copy the evidence path, change directories into an isolated clone and provide the path again. Running the exporter from a dirty checkout or against an earlier commit would fail the secure evidence gate. The separate steps added avoidable work during the deadline-bound submission cutover.

## Implementation

1. `scripts/clean-release-checkout.mjs` now supports the optional `--export-public` mode, retaining the existing default verification-only behavior.
2. The mode first runs the exact frozen release verifier on a newly isolated, committed Git checkout. It does not attempt an export when release verification fails.
3. Only after a passing release, it executes the existing sanitized public exporter **from that same clean clone**, passing the exact verified evidence file and an export output root under the original project's ignored `.data/clean-release/exports/` directory.
4. New `validateCleanPublicExportResult` checks the export's result, schema, private path location, read-only manifest identity, release evidence SHA-256, source Git tree, one-commit public Git tree, empty remote list, clean worktree and known noreply author metadata. It never treats a shell process exit code alone as proof of success.
5. A failed export exits nonzero. If the release had passed, the error summary explicitly reports `releaseStatus: "passed"` without pretending a public repository was created. The runner never deletes checkout or evidence directories.
6. `package.json` adds `release:clean:export`, and `docs/submission/CLEAN_CHECKOUT_RELEASE.md` gives the exact PowerShell command and privacy constraints.

## Verification

Four new tests in `scripts/clean-release-checkout.test.mjs` cover the option boundary, a passing synthetic export bound to a real one-commit temporary Git repository, nonzero/malformed/unsafe outputs, altered release-record hash, extra remote and changed public tree. The existing six clean checkout tests remain passing.

Command:

```sh
node --test --test-reporter=tap \
  scripts/clean-release-checkout.test.mjs \
  scripts/export-public-release-local.test.mjs
```

**Result:** 27 passed, 0 failed on Node 24.22.1 in a focused reconstruction of the committed source and dependencies. The public-export suite includes Unix and Windows Corepack evidence as well as real temporary Git one-commit export tests. This turn does not claim the new combined production command ran on Node 22 or Windows.

## Boundaries and next steps

- No PayPal, paid AI, Cloudflare, GitHub remote write or external publication is performed by this helper.
- The private source repository, its full-history clone and `.data` evidence must not be published. Only the separate sanitized exported `repo` directory may be reviewed for publication.
- Run `node .\scripts\clean-release-checkout.mjs --export-public` on a full local checkout using Node 22.13+ in major version 22, with Git and pinned pnpm 12.8.2 available.
- After that passes, complete the genuine exact-invoice PayPal Sandbox payment/webhook gate, verify the public source and video signed out, and submit the Devpost entry.
