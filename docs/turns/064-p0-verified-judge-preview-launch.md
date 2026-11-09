# Turn 064: Verified restricted judge preview launch

## Problem

The old `pnpm deploy:judge:preview` package script checked the local Wrangler template and built before deploying, but did not require the separately documented remote D1 migration-ledger query. It also did not run the hosted signed-out smoke after deployment. An operator could skip both reviewable gates and still get a successful deploy exit code.

## Change

The package script now calls `scripts/judge-preview-launch.mjs`, a dependency-free, fail-closed sequence:

1. Read the exact ignored `wrangler.judge.local.jsonc` file with symlinks and oversized files rejected. Require the same safe restricted configuration as the offline preflight and reject local dotenv/dev-vars overrides.
2. Build with the existing release-candidate credential stripping and disabled provider operations.
3. Perform a fixed read-only Wrangler D1 query against the config's `DB` binding using `--remote --json` and `SELECT name FROM d1_migrations ORDER BY id`. Parse the bounded result with the existing nine-migration ledger validator. Stop before deploy on query failure, missing records, wrong order or malformed JSON.
4. Run `wrangler deploy` against the exact ignored judge config only after the ledger passes.
5. Run the ten-probe, credential-free hosted smoke at the exact configured public HTTPS origin. Require a passing, correctly versioned summary for all ten probes. This includes the new browser-header and judge-walkthrough checks.

The launcher re-reads the ignored config between stages and fails if it changed. CLI error messages, remote JSON and response bodies are not written to its status output. It reports fixed phase and diagnostic codes, the completed stage names and a limitation statement. It never creates a database, applies migrations, issues buyer codes, uses PayPal credentials or invokes payment APIs.

A deliberate `pnpm deploy:judge:preview` invocation now performs an approved Cloudflare read and deployment, which may incur account usage. No such invocation was made in this turn. If post-deploy smoke fails, the Worker may already be deployed; the launcher does not attempt an automatic rollback.

## Local verification

Fourteen isolated Node 24.22.1 tests passed with injected command results. They verify:

- Fixed command ordering, exact remote ledger SQL and read-only flags, with Windows command quoting and POSIX argument-array tests.
- The tracked placeholder and unsafe runtime flag values stop before any build.
- Local dotenv overrides, build failures and in-process configuration drift prevent remote actions.
- A failed or malformed D1 query, a missing migration, or excessive output prevents deployment.
- Failed deploy prevents smoke, and failed, mismatched or fabricated smoke summaries never count as complete.
- Tool exceptions and deliberately secret-looking output remain absent from the sanitized status receipt.
- The package's official deployment command points at the new checked launcher.

The full clean Node 22 verification, dependency-backed build, Cloudflare D1 query, deployment and genuine PayPal Sandbox operations remain unexecuted here. The tests establish local gate behavior, not a published judge URL or real financial evidence.

## Remaining P0 gates

Provision and review an approved restricted Cloudflare account and D1 binding, apply migrations, then explicitly run the new guarded deployment command and preserve the hosted smoke evidence. The fully authenticated PayPal Sandbox acceptance, final release candidate verification, one-commit public export, demo video and Devpost submission remain separate gates.
