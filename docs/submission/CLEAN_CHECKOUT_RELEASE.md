# Clean-checkout release verification

This is the recommended route for the final, private RightsReceipt release check. It works from a local Git checkout and does not require another GitHub login, a remote clone, PayPal credentials or Cloudflare access.

## One command on Windows

Open PowerShell in the local RightsReceipt repository folder, with the pinned Node 22.23.4 and Git for Windows installed. The dependency-free judge console still supports Node 22.13 through 22.x, but the complete release setup now uses Corepack 0.36.0, which requires Node 22.22.2 or later within major 22.

Before the first full release, install the compatible Corepack and check the actual package manager:

```powershell
npm install --global corepack@0.36.0
corepack enable pnpm
corepack pnpm --version
```

The last command must print `12.8.2`. Older Node 22 installations can bundle Corepack 0.33.0, which looks for `bin/pnpm.cjs` that the pinned pnpm 12 package does not provide. If an old Corepack already cached a broken pnpm launcher, follow the cache recovery in [TOOLCHAIN.md](../engineering/TOOLCHAIN.md). Do not change the package-manager pin or disable integrity checks to get past that error.

The workspace explicitly allows the locked esbuild and workerd versions to perform their native installation checks. Unreviewed dependency build scripts remain blocked. Then run:

```powershell
node .\scripts\clean-release-checkout.mjs
```

Equivalent package script: `corepack pnpm release:clean:verify`.

### Shareable, path-free diagnostics for remote review

If the full release fails and you need to share the result with a collaborator, run this from the complete private checkout with Node 22.13 through 22.x:

```powershell
node .\scripts\clean-release-checkout.mjs --shareable
```

Equivalent package script: `corepack pnpm release:clean:shareable`.

This is a **new complete verification run**, not a reader of earlier evidence. It still creates a clean local clone, runs the exact pinned verifier and retains the detailed evidence privately in ignored `.data/clean-release/`. The command emits only a small JSON summary that omits source commit identifiers, checkout paths, evidence paths, public-export paths, provider payloads and arbitrary error text. It preserves a fixed failure code, the first failed stage and allowlisted failure identifiers when an authentic release record was produced.

When the verifier creates valid evidence, shareable mode also preserves the full private result in a uniquely named `.data/clean-release/handoffs/run-*.json` file with exclusive creation and private file permissions. The stdout field `privateHandoffSaved: true` confirms the detailed result was saved. If `false`, do not assume an actionable result file exists. Keep the entire `handoffs/` directory private: it contains exact local paths and source identifiers and must never be published or pasted into a chat.

You may paste **only the JSON from the `--shareable` command** into a support chat for triage. Do not paste `verification.json`, private logs, PowerShell environment output, credentials, invoice identifiers or the regular command's path-bearing JSON. The shareable summary is an aid to diagnosis, not an externally verifiable release certificate.

For a single full-release run that also prepares the private one-commit public source **only after verification passes**, use both flags together:

```powershell
node .\scripts\clean-release-checkout.mjs --shareable --export-public
```

The JSON printed to PowerShell remains path-free. If `releaseStatus`, `publicExportStatus` and `privateHandoffSaved` are all `passed`, `passed` and `true` respectively, open the newest matching JSON file under `.data/clean-release/handoffs/` **locally** to retrieve its `publicExport.repositoryPath` and `publicExport.manifestPath`. Verify the result belongs to this run before using those paths. The combined command can save a second full release run compared with first running `--shareable` and later `--export-public`. Both modes retain the Node 22 safety gate and never publish a GitHub repository or contact PayPal.

### Optional one-command release plus private public-source preparation

To run the same complete release and then automatically prepare the separate, sanitized one-commit Git repository **only if the release passes**, use:

```powershell
node .\scripts\clean-release-checkout.mjs --export-public
```

Equivalent package script: `corepack pnpm release:clean:export`.

This is still an entirely local operation. The command runs the canonical public exporter from its verified clean clone, checks the full release evidence, audits the public snapshot and new one-commit history, **then runs the actual localhost judge smoke and separate trained-model proof from the exported repository itself** with provider credentials removed and financial operations disabled. If either offline child fails or its limited result does not match the expected demonstration and payment-evidence boundaries, the export fails. The manifest records a bounded `publicJudgeExperience` result, and the outer release gate requires it to be `passed`. These checks do not authenticate PayPal settlement or guarantee that a judge's own machine is configured correctly.

After those checks, the runner confirms the resulting Git tree and manifest match the exact released commit. The outer export gate independently requires one root commit, exactly one local reference (`refs/heads/main`), no remotes, a clean exported checkout and the actual Git author and committer matching the expected GitHub noreply identity. A manifest claiming those properties is insufficient. The JSON summary includes `publicExport.status`, `publicExport.repositoryPath` and `publicExport.manifestPath` only when the export succeeds. It creates **no GitHub remote, public repository, deployment, payment or Devpost entry**. A failing export exits nonzero, reports `releaseStatus: "passed"` if that earlier gate passed, and preserves the private evidence for diagnosis.

The release clone and export remain under the original checkout's ignored `.data/clean-release/` directory. That directory contains private history and verification evidence. Only the separately audited `publicExport.repositoryPath` may be considered for a new public GitHub repository.

To publish that exact export later without manual Git refspecs, use the [guarded public release handoff](SAFE_PUBLIC_RELEASE_PUBLICATION.md). Run its read-only preflight first and explicitly opt into a single new-branch push only after creating a separate empty, public GitHub repository. The clean-checkout runner itself never publishes anything.

The command refuses other Node major versions and malformed arguments. It does not alter the current working branch, discard changes, rewrite Git history or delete any files. It uses the exact existing local `HEAD` commit even if the development checkout contains uncommitted changes.

## What happens

1. The runner verifies the local source is a Git repository root and obtains its 40-character commit SHA.
2. It creates a unique, private local clone under `.data/clean-release/checkouts/`, detaches that checkout at the exact source commit, and confirms the clone has no Git changes. Untracked or ignored `.env`, `.dev.vars` and other local files are not copied into the clone.
3. It launches the existing `scripts/release-candidate-verify.mjs` from the cloned checkout with a cleaned child environment. This is the canonical full verifier: public source snapshot, frozen pnpm install, full `pnpm verify`, and real judge rehearsal evidence.
4. It saves the canonical release logs and `verification.json` under `.data/clean-release/evidence/` in the original source folder and emits a small JSON summary with the exact commit, checkout path, evidence path and outcome. A failed full verifier with a valid evidence record also includes safe diagnostic codes and the first failed stage number.
5. It preserves the private clone and evidence whether the check passes or fails so the first failure can be diagnosed without recreating an environment.

The release verifier uses simulated PayPal mode. It does not itself confirm a genuine Sandbox payment or signed webhook. The package install may contact public package registries but does not require a paid AI service.

## Reading the outcome

Only `"status":"passed"` with exit code `0` is an internally passing release check. A normal failure has exit code `1` and a sanitized `code`. The underlying full verifier's `verification.json` and individual hashed logs remain private under the emitted evidence path.

A passing outer result now also requires all four ordered canonical release commands (including the platform's exact Corepack invocation), zero recorded command errors, valid SHA-256 digest fields, no preflight failures, pinned package-manager identity and the local judge evidence marker. It rehashes each of the four original stdout and four stderr log files under the same private evidence run, rejecting a missing, symlinked, oversized or digest-mismatched file. Empty logs are valid only when their SHA-256 digest matches. A synthetic, truncated or substituted `"passed"` evidence record returns `release_result_invalid` instead of authorizing the release. This is an integrity cross-check of the verifier's saved evidence, not proof of genuine provider settlement or an independently published source.

- `node_22_required`: select Node 22.13+ (within major 22), then retry.
- `source_not_repository` or `source_not_repository_root`: run from a local Git checkout of the project, not a downloaded source folder.
- `checkout_unavailable` or `checkout_identity_mismatch`: inspect the local Git installation and checkout; do not publish a release.
- `release_verification_failed`: inspect the returned `diagnostics.failureCodes` and `diagnostics.firstFailedStage` first, then review the canonical private `verification.json` and corresponding local logs. Address the first failed step before trying again.
- `release_result_invalid`: the verification process did not yield a valid, commit-bound evidence file. Do not claim a passing release.

The runner now also rejects any purported release evidence reached through a symbolic-link file or symbolic-link run directory. The evidence must be a regular, nonempty `verification.json` directly within one run folder under the owned `.data/clean-release/evidence/` directory, with no more than 512 KiB of JSON. A copied file outside that structure, renamed file, unexpected nested path or redirected link cannot establish a passing release even if its JSON claims success. Leave the generated evidence in its original private location; never relocate or link it to satisfy the release gate.

For example, a Stage 3 timeout produces `diagnostics.firstFailedStage: 3` and `diagnostics.failureCodes: ["release_stage_3_timed_out"]` in the outer JSON. A failed preflight can list `lockfile_missing` or `unsupported_node` with a null stage number. Only known, fixed verifier codes are repeated: private stdout, stderr, file contents, URLs and arbitrary injected strings are never copied into the summary. If `diagnostics.unknownFailureCodesPresent` is true, inspect the private evidence locally because the outer summary intentionally withheld an unrecognized value. Successful releases omit `diagnostics` entirely.

### Bounded release stages and timeout triage

The inner release verifier now limits each stage so a stalled dependency download or test process cannot silently consume the entire 30-minute clean-checkout deadline. The fixed budgets below are part of the source, not operator-configurable environment overrides:

| Stage in `verification.json` | Command | Maximum runtime | Timeout blocker |
| --- | --- | --- | --- |
| 1 | Public source snapshot audit | 2 minutes | `release_stage_1_timed_out` |
| 2 | `corepack pnpm install --frozen-lockfile` | 8 minutes | `release_stage_2_timed_out` |
| 3 | `corepack pnpm verify` | 15 minutes | `release_stage_3_timed_out` |
| 4 | Actual judge rehearsal | 3 minutes | `release_stage_4_timed_out` |

A timeout produces a nonzero stage result, retains the existing private stdout/stderr log files and records `ETIMEDOUT` as the spawn error, rather than treating a partial run as a passing release. The outer wrapper reports the specific allowlisted timeout code and failing stage in `diagnostics` when the inner verifier produced valid evidence. Inspect `verification.json` under its reported private evidence path for detailed triage, and review only the corresponding local logs. If the inner process produced no valid evidence, the wrapper fails closed without inventing a stage diagnosis. Do not paste private logs or provider identifiers into public issues or Devpost.

The stage runner and outer clean-checkout process now use forced child termination on timeout. Node's synchronous subprocess API otherwise sends the default `SIGTERM` and waits for exit, even if the child handles that signal and continues running. A real process regression reproduced the resulting overrun before the fix and passed with `SIGKILL`. This guarantees a direct timed-out child cannot simply catch SIGTERM to prolong the synchronous wait, but it does **not** guarantee cleanup of child processes launched by `corepack.cmd`, pnpm or test runners, or release any resources they may have left behind. See the [Node synchronous child-process documentation](https://nodejs.org/api/child_process.html#child_processspawnsynccommand-args-options).

If a stage times out, investigate the stalled package download, system load or test independently. On Windows, check that no orphaned package-manager subprocess remains before starting another attempt. Only retry from a new clean checkout after addressing the cause. The lower-level verifier's bounded Git checks are limited to 15 seconds each. This improvement was tested with synthetic and local child processes, not an actual full pinned Node 22 release on Nolan's Windows system.

There is no automatic cleanup. The `.data/clean-release/` directory contains a private clone of the complete development history and may contain internal logs. Never publish it or upload its contents as part of a hackathon entry. When the release is proven, use the separate sanitized one-commit public exporter and independent Sandbox acceptance procedure.

## Submission gates after this command

A green clean-checkout release does **not** complete the submission. The genuine separate-buyer PayPal Sandbox invoice, authenticated paid-status read and signature-verified matching webhook, sanitized public source, working public demo video under three minutes, and Devpost submission all remain independent required steps.

### Handoff to the sanitized public exporter on Windows

If you used the original verification-only command, after the summary reports `"status":"passed"`, copy its exact `checkoutPath` and `evidencePath` values privately. In PowerShell, change to the emitted **clean checkout**, not a development folder with uncommitted edits, and run the exporter against the emitted verification file:

```powershell
Set-Location 'PASTE_THE_checkoutPath_FROM_SUCCESSFUL_SUMMARY'
node .\scripts\export-public-release.mjs --release-evidence 'PASTE_THE_evidencePath_FROM_SUCCESSFUL_SUMMARY'
```

The exporter now recognizes both the direct POSIX Corepack command records and the exact `cmd.exe /d /c corepack.cmd` command records written by the canonical Windows verifier. It still checks each stage's hashed logs, full release success, source commit, lockfile and judge evidence. Any modified command string is rejected. The resulting `repositoryPath` is a separate one-commit export with no remote. Keep both the clean checkout and export under private `.data` storage until the sanitized public repository has been independently audited and checked signed out. Never publish the clean checkout or its private Git history.
