# Turn 147: verify the merged Turn 146 source and prepare a sanitized release

**Date:** November 8, 2026, America/Phoenix  
**Priority:** P0, evidence-backed submission readiness  
**Status:** Complete pinned local clean release and private public export passed for the exact merged source tree. External acceptance and publication remain open.

## Frozen source identity

The original private GitHub `main` commit was `7bbd2d91fffb6529bc6b57ed1a3068d0f866017d`, with Git tree `2eb4de272ef2791bb932d360941aca9e8d92aaf6`. The environment did not have an authenticated checkout of the private Git history. Instead, all 804 tracked files were obtained from their Git blobs, each blob identity was verified, and the assembled local Git tree was independently checked against the original tree. All 804 of 804 blobs and the entire tree matched. The files total 13,427,079 tracked bytes.

The exact source tree was committed in a temporary, synthetic, single-commit local verification repository (`614e193f90d664fec6b62c6e630a1d1317e90cce`). This temporary commit **is not** the original GitHub commit, although its source files and Git tree are byte-identical. The release runner's commit-bound evidence refers to this temporary local commit. This distinction matters when interpreting the record.

## Executed release

The real canonical command completed:

```bash
node scripts/clean-release-checkout.mjs --shareable --export-public
```

It ran with Node 22.23.4, Corepack 0.36.0 and pnpm 12.8.2 on Linux against the temporary exact-tree source. The recorded interval was 2026-11-08 19:10:05.421 through 19:12:32.127 UTC. The private export completed at 19:12:46.381 UTC.

All four full-release stages returned exit code zero:

1. Tracked-source snapshot audit, with no findings.
2. Frozen-lockfile dependency installation, with no lockfile change.
3. Complete `corepack pnpm verify`, covering lint, type checking, 24 Vitest files with 71 passing tests, production build, deployment dry-run, local model and other application and release tests.
4. Canonical deterministic judge rehearsal, including the ordinary, recovery and repeat journeys, without external provider requests or credentials.

The Node TAP summaries in the complete verification log reported 2,904 passing executions, zero failures and three skips out of 2,907 total. Those are summed executions across test sections, not 2,907 unique test cases. The skipped cases are existing runtime/opt-in cases. The completed verification recorded `status: passed` and no preflight failures.

## Export identity and privacy

The separate public-source export returned `status: passed`. The exporter created a local, single-commit repository, with no private development history and no remote. Its prepared public commit was `d197d94796a3b046d9ce037a7520dedaaf3c1245`, and its public Git tree is the exact original `2eb4de272ef2791bb932d360941aca9e8d92aaf6`. Source-snapshot and exported-history audits both passed. The exporter did **not** create or push a GitHub repository.

The original release verification, hashed stage logs, judge evidence, audit records, export manifest and private handoff were retained inside the temporary local environment. The export manifest binds to verification SHA-256 `5fc2e35024de0b6ac113d89ccb2a4bfb1dac6c0eef97e45ed5ec032dbb3933e4`. Neither source materialization nor export proves a PayPal exchange or a live deployment. The temporary workspace is not a durable owner-machine checkout.

## Remaining submission gates

1. **Genuine Sandbox acceptance:** Configure the approved Sandbox REST app and the exact callback mode, run the readiness command and optional one-shot public webhook probe, create/send the invoice, bind the collector before a separate Sandbox buyer pays, and verify the authenticated paid invoice and signed matching webhook. This has not yet happened.
2. **Public source:** Publish the reviewed, sanitized source in a new public MIT-licensed GitHub repository, preserving the private development repository. Confirm signed-out clone/readability and runnable setup.
3. **Public demo:** Record and publish a real product walkthrough under three minutes, with honest simulated-versus-genuine-provider claims and a working public YouTube watch link.
4. **Devpost:** Fill verified public URLs, complete form fields and submit before the November 12, 2026 deadline. Retain confirmation.

This receipt is a subsequent documentation-only change. The verified release candidate is the frozen source tree above; any further application or packaging change needs a new clean release before being called verified.
