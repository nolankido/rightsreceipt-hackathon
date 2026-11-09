# Release Candidate Verification

**Owning turn:** 048, hardened in Turns 052, 054 and 068
**Status:** Implemented preflight and evidence path. Turn 051 committed the lockfile and passed the local dependency/build/test gate. The complete clean-commit Node 22 release verifier remains unexecuted.

## Why this exists

Historical test evidence is useful, but the hackathon release must bind build, tests and the judge rehearsal to one exact source revision. The release verifier provides that single command and refuses to silently reuse earlier results.

## Commands

Preflight only:

```bash
node scripts/release-candidate-verify.mjs --preflight-only
node --test scripts/tracked-source-identity-local.test.mjs scripts/release-candidate-verify-local.test.mjs
```

Full release verification:

```bash
pnpm release:verify
```

The command requires:

- Node 22.13 through 22.x;
- `packageManager: pnpm@12.8.2`;
- a clean Git checkout;
- a complete HEAD-to-index-to-worktree identity check for **every** tracked file, not only the lockfile. Hidden Git index flags and nonregular file modes are rejected;
- a valid 40-character HEAD commit;
- a committed `pnpm-lock.yaml` whose working content normalizes to the exact Git blob stored at `HEAD:pnpm-lock.yaml`;
- no root-level local `.env*` or `.dev.vars*` overrides, even if Git ignores them. Explicit `.env.example` and `.dev.vars.example` files are allowed.

Full mode then runs, in order:

```text
node scripts/public-release-audit.mjs --snapshot-only
corepack pnpm install --frozen-lockfile
corepack pnpm verify
node scripts/judge-rehearsal.mjs --output <release-run>/judge
```

The release verifier audits the frozen current source snapshot before dependency installation. The private development history is audited separately because the final hackathon repository is produced by `pnpm public:export` as a fresh one-commit repository. That exported repository then receives the full history-aware audit.

It stops at the first failed command.

## Turn 087: judge evidence is a mandatory full-release gate

After the four commands succeed, `release:verify` now uses the same `releaseJudgeGate` function tested by the standalone judge-evidence suite. A zero exit code from `judge-rehearsal.mjs`, or the mere existence of `judge/`, no longer permits the release status to become `passed`. The gate checks the real nested `judge/run-XXXXXX/` output: a source-bound, clean Node 22 local rehearsal, three passing journeys and three successful resets, deterministic quote and receipt state, no external requests or credentials, and honest simulated-payment labeling in `report.html`.

If the semantic evidence is absent, corrupted or inconsistent, the full verifier records the fixed failure code `judge_rehearsal_evidence_invalid`, returns nonzero, and leaves `judgeEvidence` null. The private source revision and execution log hashes still must match.

The direct Node 22 test command is `node --test scripts/support/release-judge-evidence.test.mjs`. The fixture now includes a test of the very same `releaseJudgeGate` consumed by the full release verifier, including rejection of missing, mismatched and incomplete artifacts. **Thirteen focused tests passed on Node 22.16.0 during Turn 087.** This does not replace a clean exact-commit `pnpm release:verify` run, genuine PayPal Sandbox acceptance, or external Devpost verification.

## Turn 088: canonical semantic proof, not just a green summary

The release judge gate now uses `projectJudgeRehearsalReport` to validate the **complete** ordered 17/20/17-step journey records, the prescribed outcomes, provider action counts, 33 named domain tables, restored reset baselines, and recalculated repeatability evidence. It also requires `evidence.json` to match the canonical serializer byte-for-byte. A simplified one-step-per-scenario success object that once passed the console's intentionally minimal indicator now **fails** the release verifier. The check still requires a clean exact commit, matching Node runtime and a report that explicitly labels simulated PayPal behavior.

The new `scripts/support/release-judge-fixture.mjs` produces realistic synthetic fixtures for regression tests. These are not genuine transaction evidence. **Turn 088 did not run the complete Node regression and release suites.** See [Turn 088 receipt](../turns/088-p0-canonical-judge-release-evidence.md). Continue to require `pnpm release:verify` on the frozen exact commit.

## Turn 090: release report HTML must match canonical evidence

The local judge gate now checks **both artifacts**, not merely canonical `evidence.json` and identifying phrases in `report.html`. It regenerates HTML with the production `renderJudgeRehearsalReport` from the validated evidence and requires a byte-exact match. A modified report that still contains the title, source fingerprint, success message and simulated-payment disclaimer will fail. The shared synthetic fixtures use the same production renderer.

This covers the full release, sanitized one-commit public export and final offline submission-candidate integrity check because all three reuse the gate. It does **not** verify real PayPal transactions or replace a clean Node 22 full release run. See [Turn 090 receipt](../turns/090-p0-exact-judge-report-integrity.md).

## Turn 099: actual collector test coverage

The PayPal verification suite now includes `scripts/sandbox-webhook-collector-preflight.test.mjs`, which starts the real one-shot collector and checks live callback readiness, rejected stale registration, rejection after listener shutdown and a synthetic invoice-bound capture following an initial HEAD probe. A missing `writeFileSync` import in the existing collector test file has also been fixed. A source-matched isolated Node 22.16.0 run passed **51 of 51** focused collector, callback, route and acceptance-linkage tests. This is not the same as passing the complete clean `pnpm release:verify` gate or genuine PayPal Sandbox acceptance. See [Turn 099](../turns/099-p0-real-webhook-collector-integration.md).

## Evidence

Each run creates a new ignored directory under `.data/release-candidate/run-*` containing:

- `verification.json`;
- stdout/stderr logs for each executed command;
- the judge rehearsal output when that step runs.

The JSON records the exact commit, branch, Node version, package-manager pin, lockfile SHA-256, committed and working Git blob identities, command exit codes/durations and hashes of command output. It does not copy environment values into evidence.

Turn 054 also closes a release-environment gap: Git can report a clean checkout while ignored `.env.production.local` and `.dev.vars` files are present. Vite can load local dotenv configuration during a production build, making the artifact differ from the committed source. Preflight now blocks those inputs with a sanitized `local_environment_override_present` code; it does not print their values or filenames.

For full verification, child commands inherit only non-provider environment values. Known PayPal, AI-provider, Cloudflare, GitHub, AWS, application feature and `VITE_*` variables are removed, along with `NPM_TOKEN`, `NODE_AUTH_TOKEN` and `NODE_OPTIONS`. The verifier forces `APP_MODE=local`, `PAYPAL_MODE=fake`, and all defined live payment, consent, access and issuance flags to `false`. This is an offline release-build safeguard, not an assertion that the full command can never make an outbound network request. Dependency installation still contacts the package registry as required. Genuine PayPal Sandbox acceptance is a separate release gate.

If Sandbox credentials or a local `.env*` file are needed for development, keep them in a different working copy. Run `pnpm release:verify` from a clean, credential-free release checkout.

## Turn 068 complete-source identity guard

Git status alone is not sufficient evidence of a matching release tree. Git's `skip-worktree` and `assume-unchanged` bits can hide edits to an application file even when the lockfile is correct. `scripts/tracked-source-identity.mjs` now compares the entire `HEAD` tree to the index, refuses hidden index flags, then computes each tracked working file's Git-normalized blob SHA using `git hash-object --path`. A mismatch prevents either `release:verify` or `public:export` from claiming success. The full release verifier repeats the check **after all build and rehearsal commands**, catching hidden changes made during verification. Normalized CRLF changes remain supported. The check does not print filenames or file contents in its release receipt.

Nine standalone Node 22.16.0 regressions passed in temporary Git repositories, including concealed changes, staged edits, deletions, unsupported modes and Windows-style newline normalization. A synthetic 635-file tree also passed in about 1.2 seconds. Additional integration tests have been added to the preflight and public-export regression suites but have not been run against the full repository in this session. The clean Node 22 final release command remains outstanding.

## Current release gate

Turn 051 committed the actual lockfile generated with pnpm 12.8.2 and passed a frozen local install, TypeScript, lint, the complete local verification chain, production build and Wrangler dry run.

Turn 052 closes a narrower integrity gap: a clean `git status` does not prove that the working lockfile belongs to `HEAD`. An ignored file can leave a worktree clean, and `skip-worktree` can conceal a modification. Preflight now compares `git rev-parse --verify HEAD:pnpm-lock.yaml` with `git hash-object --path=pnpm-lock.yaml pnpm-lock.yaml`. The path-aware hash applies Git's content filters, avoiding false mismatches from Windows line endings. Missing, uncommitted and locally altered lockfiles fail closed.

Turn 054 added three focused cases to the preflight regression suite. Seven isolated tests passed on Node 24.22.1: the four previous lockfile checks, ignored production dotenv rejection, ignored Sandbox configuration rejection with safe example allowance, and child-environment scrubbing. The tests did not exercise the complete Node 22 release command.

The next required command remains:

```bash
pnpm release:verify
```

Run it from an exact clean checkout of the final merged candidate using the pinned Node 22 toolchain and package manager. The Turn 054 regression ran under Node 24 in an isolated temporary test environment. It did **not** run this final Node 22 gate, contact PayPal or deploy the application.

## Bind the verified release to the public export

After the full command reports `passed`, retain its entire ignored `.data/release-candidate/run-*/` directory, not just `verification.json`. The sanitized public export now requires the exact full evidence record for the same `HEAD` commit:

```bash
pnpm public:export -- --release-evidence .data/release-candidate/run-.../verification.json
```

The export checks command success and saved stdout/stderr hashes, committed lockfile identity and judge rehearsal output before constructing the one-commit public tree. A preflight-only result or evidence from an earlier commit fails. This is a local integrity and workflow guard; evidence files can still be fabricated and do not authenticate PayPal activity. See [Public Release Audit](PUBLIC_RELEASE_AUDIT.md).

## What a pass does not prove

A green local release candidate does not prove:

- genuine PayPal Sandbox OAuth or payment;
- a registered Sandbox webhook exchange;
- live Cloudflare Worker/D1 behavior;
- public repository visibility;
- final video or Devpost submission.

Those remain subsequent release gates.
