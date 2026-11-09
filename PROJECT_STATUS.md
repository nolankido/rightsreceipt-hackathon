# RightsReceipt Project Status

**Last updated:** November 8, 2026 UTC
**Current work:** Management turn 148, make an exported public-source candidate execute the judge browser and actual local AI proof before it can pass the canonical private export gate.
**Release status:** PRIOR EXACT-TREE CLEAN RELEASE VERIFIED; NEW EXPORT-LEVEL EXECUTION GATE FOCUSED-TESTED; NOT READY TO SUBMIT. Turn 147 passed the complete pinned Node 22 release and history audit for original private source tree `2eb4de272ef2791bb932d360941aca9e8d92aaf6`. This turn adds a mandatory executable check on the sanitized new repository; that changed source needs its own full pinned release. Genuine Sandbox acceptance, public source, functional video and Devpost confirmation remain open.
**Next P0 unit:** Run the complete pinned release with `--shareable --export-public` on the selected source revision, including the new export-level judge checks. Then publish the reviewed source to a separate public repository, record and upload a real under-three-minute YouTube demo, and submit Devpost by the November 12 deadline. If the owner can configure the six Sandbox variables and approved callback, perform separate-buyer paid invoice and signed webhook acceptance before making any genuine-provider claims.

## Current improvement: Turn 148

The fresh extraction of the previously sanitized source ZIP independently passed the actual localhost judge-console smoke and trained-model proof with Node 22 and no dependency installation. Turn 148 integrates those two offline commands into the canonical public export path. A release fails if the exported tree cannot execute three scenarios, three resets, and 24 AI field comparisons with accurate simulated-payment boundaries. The export manifest records bounded proof, and the outer wrapper refuses skipped or falsified claims. The release remains private; no GitHub repository was created or published.

**Focused verification:** Forty-seven passing Node 22 focused test executions, zero failures and two existing skips. See [Turn 148](docs/turns/148-p0-public-export-judge-execution.md). A new full release is still required for this revised code.

## Prior improvement: Turn 147

Reconstructed the complete 804-file merged source and independently confirmed every tracked Git blob and the original Git tree. Executed the actual pinned Node 22 clean-release runner from an exact-tree temporary commit, including source audit, frozen install, full `pnpm verify`, judge rehearsal, and public-history export audit. All stages passed: 71 Vitest tests, 2,904 Node TAP executions with zero failures and three existing skips. The private export has one commit and the exact same source tree, without private history or a remote.

**Source distinction:** The original GitHub source commit is `7bbd2d91fffb6529bc6b57ed1a3068d0f866017d`; the temporary local commit had identical files but synthetic metadata/history. This receipt does not falsely claim the original commit hash was checked out. The new documentation-only status commit follows the frozen verified tree. See the [Turn 147 execution receipt](docs/turns/147-p0-exact-tree-clean-release.md).

**Still open:** Real Sandbox separate-buyer payment, authenticated paid GET and matching signed provider webhook, separate public source publication, public under-three-minute video and Devpost submission confirmation. No Sandbox transaction, external deployment or publication occurred.

## Prior improvement: Turn 146

The former registered-webhook preflight checked local collector liveness and authenticated PayPal registration but could not detect a broken public HTTPS forwarder before the test buyer paid. Turn 146 adds opt-in `--probe-public` for the one-shot collector. It checks the exact current public callback with a credential-free, redirect-locked `HEAD`, requires the collector's fixed HTTP 204 readiness marker, and only then authenticates to PayPal to verify registration. Hosted listeners retain the ordinary preflight. The public route and private path are never printed; the check cannot prove signed webhook delivery or payment.

**Focused verification:** Eleven Node 24.22.1 tests passed, zero failed, using synthetic PayPal responses and local loopback fixtures, covering unsafe URLs, redirects, marker mismatches, network failures, successful public-to-local sequencing and blocking before OAuth. Full pinned Node 22 release verification and genuine Sandbox payment remain open for this revision. See [Turn 146](docs/turns/146-p0-public-webhook-forwarder-preflight.md).


## Prior improvement: Turn 145

The genuine Sandbox preflight reported missing configuration before making a provider request. A new offline command now identifies only the fixed missing variable names, distinguishes hosted callback and one-shot collector mode, refuses mixed/partial configuration and never copies environment values into output. Eight focused tests verify its behavior and redaction. A first full release attempt correctly rejected unmarked credential-shaped fixture values; after explicitly marking synthetic test values, the unchanged source-audit policy passed.

**Complete verification:** The clean Node 22 release passed for source `216d882c2ac5d23ea2378e9969b2ac2d3004daff`. All eight original stage-log hashes match, 71 Vitest tests and 2,896 Node TAP test executions passed with zero failures and three existing skips, and the judge rehearsal passed. The private public export has one parentless commit `0864a841fc6de7585685d419aceb0c9eb48c757d`, no remote, and exactly the 799-file source tree. See the [Turn 145 setup and evidence receipt](docs/turns/145-p0-sandbox-local-setup-handoff.md) and [Sandbox runbook](docs/paypal/SANDBOX_ACCEPTANCE.md).

**Still open:** Genuine separate-buyer paid invoice, authenticated paid financial GET and matching verified webhook; public sanitized-source publication; public functional video under three minutes; Devpost confirmation. No provider account or callback was changed, no invoice created, and no credentials obtained in this turn. This documentation update follows the frozen tested source commit.

## Prior improvement: Turn 144

Executed the real clean-release command, repaired its observed blockers, and reran it successfully. Updated runtime/Corepack setup, approved only the locked native build scripts, corrected lint issues and generated-output scope, restored a missing submission-test fixture dependency, and isolated two CLI tests from Node startup warnings without changing their exact output assertions. The pnpm pin, lockfile, production validation rules and release checks remain intact. See the [Turn 144 execution receipt](docs/turns/144-p0-complete-clean-release.md) and [toolchain setup](docs/engineering/TOOLCHAIN.md).

**Complete verification:** All four canonical stages passed. The full verifier included 71 passing Vitest tests across 24 files, production build and deployment dry-run, local model execution, simulated payment/receipt tests, judge-console smoke and release/publication-tool checks. Its Node TAP summaries reported 2,888 passing executions, zero failures and three existing skips. The canonical ordinary, recovery and repeat journeys passed with no external requests or credentials. Both export audits returned zero findings; the one-commit export has the exact 796-file source tree.

**Frozen release:** The tested private commit is `85a322df6332d47e09ca8378b466ee41695f7c4a`; the prepared public commit is `3cd7cf4a03794773b1edf8462e37d82239dca70c`. This status update is a subsequent documentation-only checkpoint. Use the original frozen checkout and handoff for that release, or run a complete release for a new candidate. Original generated evidence has been retained separately.

**Still open:** Genuine buyer-paid Sandbox invoice and authenticated matching webhook, separate public-source publication, a functional under-three-minute public YouTube video, and Devpost submission confirmation. The export is prepared privately, not published. No Windows execution, real PayPal transaction, public deployment or finished video is claimed by this Linux release.

## Prior improvement: Turn 143

The genuine PayPal Sandbox acceptance CLI allows custom output directories because private `state.json`, webhook-related evidence and the confidential payer handoff should live under ignored `.data` or outside the checkout. Its existing `runDirectory` check only examined lexical paths. A directory symlink under `.data`, or an outside symlink pointing back into the tracked checkout, could redirect a fresh acceptance run into source files while still passing the check. Turn 143 resolves the nearest existing physical parent and the intended destination before creating output folders, and repeats the check after the base exists. Inside the private source root, only the real `.data` directory is permitted. Unsafe paths now fail as `unsafe_private_path` before the create command contacts PayPal. [Turn 143](docs/turns/143-p0-sandbox-private-output-symlink-guard.md); [Sandbox acceptance runbook](docs/paypal/SANDBOX_ACCEPTANCE.md).

**Focused verification:** A real symlink regression reproduced the prior false acceptance and private-file misplacement in a controlled local test fixture, then passed with the guard. Both inside-`.data` and outside aliases, plus not-yet-created nested directories, now fail before any mocked PayPal request and leave the tracked-source sink empty. An actual external temporary directory and ordinary `.data` destinations remain usable. A total of 27/27 combined acceptance harness and evidence-check tests passed on Node 24.22.1 with a test-only extensionless TypeScript resolver; shipping runtime/imports were not changed. No live Sandbox transaction or signed provider webhook was exercised.

**Still open:** Full clean pinned Node 22 release and public export, genuine buyer-paid Sandbox invoice and authenticated matching webhook, separate public-source publication, a functional under-three-minute public YouTube video, and Devpost submission confirmation.

## Prior improvement: Turn 142

Turn 141 added an all-refs Git check immediately after the opt-in public push, but the separate, repeatable anonymous public-source checker still inspected only metadata and the audited main commit. An unrelated branch, tag, notes or custom ref created after the post-push snapshot could therefore leave the later source check green, despite violating the intended one-commit sanitized public handoff. Turn 142 adds an anonymous, read-only fourth GitHub API request to `/git/matching-refs/` and requires its full result to be exactly one `refs/heads/main` commit at the manifest SHA. An unexpected, missing, malformed, mismatched or paginated response is a fixed failure. The publication flow inherits the stronger check and reports a successful push as verification-pending when this independent ref audit fails. [Turn 142](docs/turns/142-p0-anonymous-public-all-refs-gate.md); [Anonymous public source instructions](docs/submission/ANONYMOUS_PUBLIC_GITHUB_CHECK.md).

**Focused verification:** Four new source-check test groups initially failed against the old code, demonstrating the false-green condition. After the fix, 36/36 combined anonymous and publication tests passed directly on Node 24.22.1, including the Turn 141 real bare-Git race tests and a new cross-stage regression that simulates a notes ref added after the push check. GitHub's official matching-refs endpoint and trailing-slash behavior were independently checked. The tests do not establish a real anonymous release, a full Node 22 run or any PayPal payment evidence.

**Still open:** Full clean pinned Node 22 release and public export, genuine buyer-paid Sandbox invoice and authenticated matching webhook, separate public-source publication, a functional under-three-minute public YouTube video, and Devpost submission confirmation.

## Prior improvement: Turn 141

Previously the safe publisher rejected nonempty advertised refs before a push, but a second actor could introduce an unrelated tag, branch, notes or custom ref just after that check. The creation-only lease guards the named `main` branch, not the rest of the remote. The publisher could therefore return `published_and_verified` after an apparently successful push and anonymous main-commit check even though its public destination now contained additional refs. Turn 141 adds a separate post-push `git ls-remote` all-refs check that allows only the audited `refs/heads/main` and optional matching `HEAD`. Unreadable, missing, duplicated, extra or incorrect refs cause `pushed_verification_pending`, never a misleading `blocked` status after a successful push. [Turn 141](docs/turns/141-p0-post-push-public-refs-verification.md); [Safe public release instructions](docs/submission/SAFE_PUBLIC_RELEASE_PUBLICATION.md).

**Focused verification:** The new false-green handoff, successful-push result and late-ref race tests failed against the previous code, then passed after the fix. All 32 combined publication and anonymous GitHub source-check tests passed directly on Node 24.22.1, including real local Git bare-repository pushes and reference races. Only private source files were changed; no external push, private-to-public visibility change or paid API call was made. The check is a point-in-time Git advertisement snapshot, not proof of hidden refs or future immutability.

**Still open:** Full clean pinned Node 22 release and public export, genuine buyer-paid Sandbox invoice and authenticated matching webhook, separate public-source publication, a working under-three-minute public YouTube video, and Devpost submission confirmation.

## Prior improvement: Turn 140

The MP4 structural preflight previously required a video handler but treated zero-width, zero-height and subpixel video geometry as a resolution advisory. That allowed an obviously unusable declared picture track to return `passed_with_advisories` even though the final Devpost demo must be visually reviewable. Turn 140 adds a fail-closed `video_dimensions_invalid` blocker for the primary video track when either dimension is below one full pixel. Ordinary positive low-resolution footage remains an advisory so the gate does not arbitrarily reject otherwise usable exports. [Turn 140](docs/turns/140-p0-invalid-demo-video-dimensions.md); [Video release QA](docs/submission/VIDEO_RELEASE_QA.md).

**Focused verification:** The regression first failed against the previous parser, then passed after the fix. The actual locally generated H.264/AAC MP4 decoded successfully with opt-in FFmpeg integration on Node 24.22.1. The related offline PayPal evidence suite also passed. The full Node 22 release and an actual finished RightsReceipt demo remain unverified.

**Still open:** Full clean pinned Node 22 release and public export, genuine buyer-paid Sandbox invoice and authenticated matching webhook, separate public-source publication, a working under-three-minute public YouTube video, and Devpost submission confirmation.

## Prior improvement: Turn 139

Node's synchronous child-process timeout sends SIGTERM by default, and then waits for the process to exit. A child that catches SIGTERM without exiting can therefore ignore the effective deadline while the release verifier blocks. Turn 139 sets `killSignal: 'SIGKILL'` for the release runner's four stages, bounded Git subprocesses and the outer clean-checkout child commands. It retains existing timeout codes, private evidence logs, exact stage budgets and fail-closed results. [Turn 139](docs/turns/139-p0-release-timeout-forced-termination.md); [Windows release guide](docs/submission/CLEAN_CHECKOUT_RELEASE.md).

**Focused verification:** The new real-process regression failed before the change after about 2.5 seconds for a 600 ms limit and passed afterward at about 600 ms. A full 43/43 focused source and clean-checkout test suite passed directly on Node 24.22.1. This was not a complete pinned Node 22 release; grandchildren of a timed-out process may remain, especially through Windows command shims.

**Still open:** Full clean pinned Node 22 release and public export, genuine buyer-paid Sandbox invoice and authenticated matching webhook, separate public-source publication, a working under-three-minute public YouTube video, and Devpost submission confirmation.

## Prior improvement: Turn 138

The offline Devpost copy preflight previously treated `##` headings inside fenced code samples and HTML comments as submission sections. A fully hidden example with plausible URLs could report `copy_ready_for_manual_review` even though a reviewer would see no actual content. It also silently kept the last occurrence of any required section, letting duplicate or contradictory submission fields pass. Turn 138 now extracts headings and their URLs only from visible prose, and explicitly blocks repeated required sections. Unresolved placeholder scanning remains strict across the full source. [Turn 138](docs/turns/138-p0-devpost-rendered-copy-and-duplicate-gate.md); [Devpost copy QA](docs/submission/DEVPOST_COPY_QA.md).

**Focused verification:** Two new regressions failed against the prior parser and passed after the fix; a third confirms a legitimate copy can include longer fenced examples without false duplicate errors. Combined video and Devpost tests: 26 passed, zero failed, one deliberately skipped real-FFmpeg witness on Node 24.22.1. The real draft remains blocked on its unpublished GitHub and YouTube URL placeholders.

**Still open:** Full clean pinned Node 22 release and public export, genuine buyer-paid Sandbox invoice and authenticated matching webhook, separate public-source publication, a working under-three-minute public YouTube video, and Devpost submission confirmation.

## Prior improvement: Turn 137

The clean-release wrapper verified public export tree identity and one-commit history but did not check its actual Git refs or author and committer. It could report `publicExport.status: "passed"` when the export was on `master` instead of `main`, contained an unexpected tag/custom ref, or had a personal email in its Git commit, despite the later public publisher correctly refusing these conditions. Turn 137 brings the fail-closed identity requirements forward to the initial `--export-public` result. It requires exactly `refs/heads/main`, a distinct new public commit and the actual expected noreply author/committer, regardless of what the manifest claims. [Turn 137](docs/turns/137-p0-clean-export-refs-and-author-gate.md); [Clean release guide](docs/submission/CLEAN_CHECKOUT_RELEASE.md).

**Focused verification:** Two regressions first failed against the old wrapper, then passed after the correction. 27/27 clean-checkout tests passed directly on Node 24.22.1 with temporary local Git repos. The pinned complete Node 22 build and audited export have not been executed here.

**Still open:** Full clean Node 22 verification and audited export, genuine Sandbox buyer payment and authenticated matching webhook, sanitized public source, short public video and confirmed Devpost submission.

## Prior improvement: Turn 136

The Stage 2 PayPal Sandbox acceptance command used to report `passed` for any successful authenticated invoice GET, including an invoice that was still UNPAID. It also reported `passed` when the provider response used the status label PAID but omitted independently reconcilable financial transactions. The final three-record checker refused incomplete paid evidence, but the intermediate CLI result was misleading during a deadline-driven cutover. Turn 136 makes `runCheck` report `payment_pending` with the existing private payment link for a valid unpaid invoice, and report `failed: settlement_not_proven` when PAID lacks full matching financial settlement. Only exact USD 425 paid, zero refunded/due and no reconciliation need may pass Stage 2. The local evidence and CLI exit code now agree. [Turn 136](docs/turns/136-p0-sandbox-paid-status-fail-closed.md); [Sandbox acceptance runbook](docs/paypal/SANDBOX_ACCEPTANCE.md).

**Focused verification:** Two regressions failed against the previous code and passed after the change. 35/35 acceptance-harness, three-record checker and cross-stage linkage tests passed directly on Node 24.22.1 using source-matched mocked PayPal transport. No actual buyer paid, no provider signature was independently established and no external write occurred.

**Still open:** Full clean Node 22 verification and audited export, genuine separate-buyer Sandbox payment with authenticated financial status and signed exact-invoice webhook, sanitized public source, short public video and confirmed Devpost submission.

## Prior improvement: Turn 135

The safe first-push script previously queried only remote heads and tags before its creation-only main lease. A repository containing `refs/notes/*`, `refs/replace/*` or custom refs therefore looked empty and could receive the audited public main even though the remote already contained objects. Turn 135 changes the read-only pre-push query to include every advertised ref. A real bare-Git regression failed against the previous code because the push was allowed, then passed after the fix. The single-ref creation-only lease, anonymous metadata gate and exact post-push commit verification remain unchanged. [Turn 135](docs/turns/135-p0-public-destination-all-refs-preflight.md); [Safe publication runbook](docs/submission/SAFE_PUBLIC_RELEASE_PUBLICATION.md).

**Focused verification:** 27/27 anonymous GitHub and public publication tests passed directly on Node 24.22.1. No remote publication was attempted. The full pinned Node 22 clean release and every genuine external submission gate remain open.

**Still open:** Full clean Node 22 verification and audited export, genuine Sandbox paid-status and signed exact-invoice webhook, sanitized public source, short public video and confirmed Devpost submission.

## Prior improvement: Turn 134

Turn 133 fixed the application rehearsal worker's hanging timeout path, but the separate real local AI model diagnostic still waited indefinitely for a failed child to emit `close`. Turn 134 applies the same bounded, fail-closed lifecycle to `/model`: on deadline, output overflow or process error it rejects before kill, ignores late output/exit and lets the browser return a fixed 503. The cached diagnostic is cleared so a reviewer can retry. Six direct model-child regressions and an end-to-end HTTP retry test now cover that path, with the direct suite in the mandatory judge verification command. [Turn 134](docs/turns/134-p0-judge-model-timeout-fail-closed.md); [Judge instructions](JUDGES.md).

**Focused verification:** 6/6 standalone model-launcher tests passed directly on Node 24.22.1, plus 70/70 combined mocked-console tests using a temporary test-only Node-version shim. Real Node 22 handler/model integration and full release are not proven by these tests.

**Still open:** Full clean Node 22 verification and audited export, genuine Sandbox paid-status and signed exact-invoice webhook, sanitized public source, short public video and confirmed Devpost submission.

## Prior improvement: Turn 133

The browser worker's previous two-minute timeout and 8 KiB stdout limit sent `kill()` but did not mark the run as irreversibly failed or resolve the pending result. A late zero-exit worker could still make the console accept nominally valid artifacts, and a child that never closed could leave progress spinning. Turn 133 settles the run as failed at the deadline or size limit, latches the rejection **before** attempting to kill the child, ignores any later output or exit, and uses the same failure path for spawn and child errors. It adds six direct regressions to the mandatory judge verification chain. [Turn 133](docs/turns/133-p0-judge-worker-timeout-fail-closed.md); [Judge instructions](JUDGES.md).

**Focused verification:** 6/6 standalone launcher tests passed on Node 24.22.1, plus 63/63 combined mocked-console tests with a temporary test-only Node-version shim. The real Node 22 handler worker, full release and provider Sandbox gates remain unverified in this environment.

**Still open:** Full clean Node 22 verification and audited export, genuine separate-buyer Sandbox payment and signed exact-invoice webhook, separate public MIT source, genuine video under three minutes, and confirmed Devpost submission.

## Prior improvement: Turn 132

The browser console formerly held the judge's POST request open for the entire handler rehearsal, potentially up to two minutes, hiding its existing running-status page. Turn 132 makes the form return a 303 promptly and runs the existing credential-free rehearsal in the background. While active, the page includes a same-origin two-second meta refresh and no report links; after a success or failure, refresh stops and evidence is offered only for validated complete outcomes. The real-worker smoke now checks intermediate progress and polls for final success, and the public judge instructions explain what to expect. The old origin/token, five-run, restrictive CSP and semantic evidence gates remain. [Turn 132](docs/turns/132-p1-judge-console-responsive-progress.md); [Judge quick start](docs/submission/JUDGE_QUICKSTART.md).

**Focused verification:** 32/32 progress, fake HTTP smoke, page and evidence tests passed directly on Node 24.22.1. A separate 57/57 mocked-console run passed with a temporary Node-version override **only to exercise isolated tests** under Node 24; the shipping Node 22 runtime guard is unchanged. The full authenticated checkout's actual Node 22 worker smoke and release verification remain pending.

**Still open:** Full clean Node 22 verification and audited export, genuine separate-buyer Sandbox payment and verified exact webhook, separate public MIT source, genuine video under three minutes, and confirmed Devpost submission.

## Prior improvement: Turn 131

The prior `--shareable` run emitted a privacy-safe result but discarded the full checkout/export paths from stdout. A user who wanted both a safe support handoff and the actionable one-commit export locations needed to re-run an expensive complete release in a different mode. Turn 131 retains the normal detailed output for ordinary commands, but during `--shareable` saves the validated detailed outcome under a fresh, exclusive, mode-restricted private `.data/clean-release/handoffs/run-*.json` file. When combined with `--export-public`, one complete run can produce a safe JSON summary and privately retain the export locations. The safe response adds only `privateHandoffSaved: true/false` when an evidence path exists. No files are overwritten, and redirected or outside handoff directories are rejected. [Turn 131](docs/turns/131-p0-one-run-safe-private-release-handoff.md); [Windows runbook](docs/submission/CLEAN_CHECKOUT_RELEASE.md).

**Focused verification:** Twenty-five of twenty-five clean-checkout tests passed on Node 24.22.1, including real temporary Git fixtures, no private path leakage, exclusive private file creation, file-mode checks and redirection refusal. This does not establish the full pinned Node 22 run or any public release.

**Still open:** Full clean Node 22 verification and audited export, genuine Sandbox buyer-paid invoice with authenticated status and exact signed webhook, separate public MIT source, real signed-out video under three minutes, and confirmed Devpost submission.

## Prior improvement: Turn 130

Turn 129 ensured the four full-release command records were present and internally consistent, but only checked that the claimed stdout/stderr hashes looked like valid digests. The runner could still accept a fabricated or modified passing record when the corresponding saved log was altered, missing or redirected. Turn 130 now independently hashes every original stage log from the already validated private evidence run. It refuses missing, symlinked, oversized or hash-mismatched output and preserves the existing redacted failure channel. [Turn 130](docs/turns/130-p0-full-release-log-hash-integrity.md); [Windows runbook](docs/submission/CLEAN_CHECKOUT_RELEASE.md).

**Focused verification:** The new tampered-log regression first failed against the old code, then passed. Twenty-three of twenty-three clean-checkout tests passed on Node 24.22.1, including empty output, missing logs, oversized logs and symlinks. This structurally reinforces private release evidence; it cannot replace an actual full Node 22 run, genuine PayPal Sandbox acceptance or the external publication gates.

**Still open:** Full pinned Node 22 release/public export, genuine Sandbox buyer-paid invoice with authenticated status and exact signed webhook, separate public MIT source, real signed-out video under three minutes, and confirmed Devpost submission.

## Prior improvement: Turn 129

The clean-checkout wrapper correctly required a commit-bound, regular private evidence file, but it could still report success when that file contained only `status: "passed"` with no verified stage list or judge marker. Turn 129 makes the outer pass depend on the real full verifier's four ordered command records, exact platform-specific Corepack form, zero exit codes, bounded SHA-256 digest syntax, pinned package manager and a `judgeEvidence.root: "judge"` marker. An incomplete or mismatched passing claim now fails closed as `release_result_invalid`, including in the path-free handoff. Failed stage evidence retains its prior sanitized diagnostic behavior. [Turn 129](docs/turns/129-p0-complete-clean-release-stage-evidence.md); [Windows runbook](docs/submission/CLEAN_CHECKOUT_RELEASE.md).

**Focused verification:** A new false-green regression failed against the prior wrapper and then passed after the change. Twenty-two of twenty-two clean-checkout tests passed on Node 24.22.1 with temporary real Git fixtures. The actual Node 22 release, true buyer-paid Sandbox transaction and external submission are still unverified.

**Still open:** Full clean pinned Node 22 release/public export, genuine Sandbox buyer-paid invoice with authenticated status and exact signed webhook, separate public MIT source, real signed-out video under three minutes, and confirmed Devpost submission.

## Prior improvement: Turn 128

The clean-release wrapper's ordinary JSON includes private local checkout and evidence paths, which are necessary for a later public-export handoff but awkward to paste into a support conversation. Turn 128 adds an opt-in `--shareable` mode that still executes the same clean Node 22 release and preserves detailed private evidence while returning only fixed status, allowlisted failure codes, a bounded first failed stage and separate release/export status. It omits private paths, SHA identifiers and arbitrary errors. The normal `--export-public` output remains unchanged. [Turn 128](docs/turns/128-p0-shareable-clean-release-handoff.md); [Windows runbook](docs/submission/CLEAN_CHECKOUT_RELEASE.md).

**Focused verification:** Twenty-one of twenty-one clean-checkout tests passed on Node 24.22.1, including real local Git clones and synthetic release records. The actual `--shareable` CLI returned `node_22_required` with no private paths as expected. This does not constitute a full pinned Node 22 release, real Sandbox payment or a public submission.

**Still open:** Full clean pinned Node 22 release/public export, genuine Sandbox buyer-paid invoice with authenticated status and exact signed webhook, separate public MIT source, real signed-out video under three minutes, and confirmed Devpost submission.

## Prior improvement: Turn 127

The public-facing draft still pointed only to an older portable-model evaluator and described PayPal-paid invoices in its tagline despite the lack of authenticated buyer-paid Sandbox evidence. Turn 127 makes the short description and tagline precise, distinguishes the simulated application rehearsal from the real `/model` route, documents the new verified `judge-ai-proof.mjs` command with `paymentEvidence: "none"`, and aligns the video checklist and copy QA runbook. The Devpost copy test suite now fails if the executable model proof or no-payment disclosure disappears from the entry while its release command remains advertised. [Turn 127](docs/turns/127-p0-devpost-ai-proof-claim-alignment.md); [Devpost draft](docs/submission/DEVPOST_DRAFT.md).

**Focused verification:** Ten of ten Devpost copy preflight regression tests passed and the real current draft remained intentionally blocked on the missing separate public GitHub and YouTube watch URLs. The eight focused AI proof/release-integration tests passed again on Node 24.22.1. No full pinned Node 22 release, real provider payment, public upload or actual Devpost submission was performed.

**Still open:** Full clean pinned Node 22 release/public export, genuine Sandbox buyer-paid invoice with authenticated status and signed exact-invoice webhook, separate public MIT source, a real signed-out video under three minutes, and confirmed Devpost submission.

## Prior improvement: Turn 126

Turn 125 introduced an accurate read-only actual-model proof, but its commands were optional and could go stale while the full release still passed. Turn 126 requires `judge:ai:proof:verify` and `judge:ai:proof` within `judge:console:verify`, which flows into `judge:verify`, both `verify` and `verify:static`, and the canonical release stages. It also returns fixed, non-sensitive JSON for invalid CLI arguments and adds a real subprocess regression from an unrelated directory. The final cutover checklist now requires successful execution of both AI proof commands. [Turn 126](docs/turns/126-p0-mandatory-ai-proof-release-gate.md); [submission checklist](docs/submission/FINAL_CUTOVER_CHECKLIST.md).

**Focused verification:** Eight of eight proof/release-integration tests passed on Node 24.22.1, the real-model proof command exited 0 with `paymentEvidence: "none"`, and an invalid CLI argument exited 2 with `ai_proof_args_invalid`. The release integration is statically verified but the complete pinned Node 22 release has not been executed in this partial checkout.

**Still open:** Full pinned Node 22 clean release and public export, genuine Sandbox buyer-paid invoice and authenticated matching webhook, separately published MIT-licensed public source, public working demonstration video shorter than three minutes, and confirmed Devpost submission.

## Prior improvement: Turn 125

The judge console already provided an actual learned-model demonstration separate from its simulated payment rehearsal, but its full browser path depends on a complete pinned checkout. Turn 125 adds a simple read-only `judge:ai:proof` command that executes the same SHA-256-verified local classifier and source-grounded extractor on two frozen synthetic cases, checks the 24 displayed field comparisons and human-review contradiction warning, and returns concise fixed-schema JSON. It explicitly records `paymentEvidence: "none"`. A malformed/tampered model, missing case, inconsistent display or missing contradiction warning cannot produce a passing proof. [Turn 125](docs/turns/125-p0-local-ai-submission-proof.md); [judge guide](JUDGES.md).

**Focused verification:** Six of six source-matched proof tests passed on Node 24.22.1; the real local model command passed with verified artifact hash `6ea099b72fe00ce4643426a2729a84b207ae8eb3460c75488fab3502037e73e2`. The actual Devpost copy preflight remains blocked on the missing genuine public repository and video links. No external API, provider payment, full Node 22 release or public submission was completed.

**Still open:** Full pinned Node 22 clean release and public export, genuine Sandbox buyer-paid invoice and authenticated matching webhook, separately published MIT-licensed public source, public working demonstration video shorter than three minutes, and confirmed Devpost submission.

## Prior improvement: Turn 124

An authentic `INVOICING.INVOICE.PAID` webhook can describe an invoice with payment pending or partially paid. Before this turn, the `sandbox:acceptance:webhook` CLI could report its individual stage as passed for any signature-verified subscribed event, even without binding it to a saved invoice when `--state` was omitted. The downstream three-record reconciler already rejected these incomplete claims, but an operator could still misread the earlier green result. The CLI now requires `--state`, exact invoice identity, paid event type and `PAID` resource status before it produces successful webhook evidence. [Turn 124](docs/turns/124-p0-strict-paid-webhook-acceptance.md); [Sandbox acceptance](docs/paypal/SANDBOX_ACCEPTANCE.md).

**Focused verification:** The new false-green assertions failed before the implementation. After the correction, 9/9 acceptance-harness tests and 25/25 cross-stage reconciliation tests passed, exit code 0, on Node 24.22.1 using reconstructed current-source module dependencies. This is neither a complete Node 22 release nor real Sandbox provider evidence.

**Still open:** Full pinned Node 22 clean release and public export, genuine Sandbox buyer-paid invoice and authenticated matching webhook, separately published MIT-licensed public source, public working demonstration video shorter than three minutes, and confirmed Devpost submission.

## Prior improvement: Turn 123

The one-shot collector, its preliminary time-window helper and the authenticated webhook handler all previously rejected RFC 3339 UTC fractional seconds beyond millisecond precision before the PayPal signature postback. Turn 123 extends their strict UTC timestamp parsers to accept one through nine fractional digits, while continuing to reject malformed dates and excessive precision. The raw `paypal-transmission-time` string is not reformatted in the private capture or PayPal verification call. [Turn 123](docs/turns/123-p0-sandbox-webhook-high-precision-timestamps.md); [Sandbox acceptance](docs/paypal/SANDBOX_ACCEPTANCE.md).

**Targeted verification:** The focused suite runs 124 webhook tests on Node 24.22.1, including four new high-precision tests (one covers event `create_time`). Three new tests failed before the source fix, and the final focused suite passed afterward. No real PayPal callback, signature service response, full pinned Node 22 release or public artifact was produced.

**Still open:** Full pinned Node 22 clean release and public export, genuine Sandbox buyer-paid invoice and authenticated matching webhook, separately published MIT-licensed public source, public working demonstration video shorter than three minutes, and confirmed Devpost submission.

## Prior improvement: Turn 122

Turn 122 rechecked the [official PayPal AI Hackathon rules](https://paypalaihackathon.devpost.com/rules) and mapped its two-stage judging standard to the precise implemented evidence in the repository. The new [judging evidence matrix](docs/submission/JUDGING_EVIDENCE_MATRIX.md) separates actual locally trained AI inference, scripted judge transactions, private genuine PayPal acceptance and still-missing public delivery. It gives a timestamped, source-bound capture guide, an honest claims branch for the still-unverified Sandbox payment and an ordered release-day handoff. The [video storyboard](docs/submission/VIDEO_STORYBOARD.md) now includes payment/receipt narration alternatives so an incomplete provider gate cannot silently turn into a spoken payment claim. The [submission index](docs/submission/README.md) links the packet.

**Verification:** Source references and internal Markdown links were checked against the current private tree; no program behavior or payment evidence changed. This workspace has Node 24 and no PayPal Sandbox credentials or installed PayPal connector, so it cannot run the pinned full release or authenticated Sandbox transaction. [Turn 122](docs/turns/122-p0-judge-evidence-and-video-claim-handoff.md).

**Still open:** Full pinned Node 22 clean release and public export, genuine Sandbox buyer-paid invoice and authenticated matching webhook, separately published MIT-licensed public source, public working demonstration video shorter than three minutes, and confirmed Devpost submission.

## Prior improvement: Turn 121

The clean-checkout release wrapper previously used a lexical path comparison for its private `verification.json` and followed symbolic links, allowing a redirected file to be read as release evidence. Turn 121 now requires the original absolute, regular, nonempty, bounded `evidence/<run>/verification.json` within the canonical owned private evidence root, with no symlinks at the root, run folder or file. Invalid, stale and redirected records fail with `release_result_invalid` before they can authorize a passing release. No public repository, payment or other external artifact was created.

**Targeted verification:** **16/16 clean-checkout plus 15/15 release-candidate tests passed** on Node 24.22.1, including symlinked paths, oversized files, wrong filenames, nested paths, valid fixture acceptance, bounded stage timeouts and private child environment behavior. The full pinned Node 22 release remains unverified. [Turn 121](docs/turns/121-p0-clean-release-evidence-path-provenance.md); [Windows release runbook](docs/submission/CLEAN_CHECKOUT_RELEASE.md).

**Still open:** Full pinned Node 22 clean release and public export, genuine Sandbox buyer-paid invoice and authenticated matching webhook, separately published MIT-licensed public source, public demonstration video shorter than three minutes, and confirmed Devpost submission.

## Prior improvement: Turn 120

The clean-checkout runner saved detailed inner release evidence but reported only `release_verification_failed` on a failed full run, making the first failure difficult to identify during the time-sensitive Windows cutover. Turn 120 adds `diagnostics.failureCodes`, `diagnostics.firstFailedStage` and `diagnostics.unknownFailureCodesPresent` for failed full releases with valid evidence. It emits only recognized fixed identifiers and stage numbers, never raw logs, invented codes or private inputs. Successful release summaries do not change. Invalid evidence remains blocked. This environment has Node 24.22.1, so the actual `--export-public` command was tried read-only and correctly returned `node_22_required` before running the full release or creating an export.

**Targeted verification:** **12/12 clean-checkout and 15/15 release-candidate verifier tests passed** on Node 24.22.1, including Stage 3 timeout reporting, preflight failure reporting, malformed evidence, secret-bearing unknown codes and existing safety tests. A full pinned Node 22 release has not run. [Turn 120](docs/turns/120-p0-clean-release-failure-diagnostics.md); [Windows release runbook](docs/submission/CLEAN_CHECKOUT_RELEASE.md).

**Still open:** Full pinned Node 22 clean release and public export, genuine Sandbox paid-invoice and authenticated matching webhook, separately published MIT-licensed public repository, real public demonstration video shorter than three minutes, and confirmed Devpost submission.

## Prior improvement: Turn 119

The official contest rules require a detectable open-source license visible in the public GitHub repository's About section. The existing three-request anonymous source check had not required GitHub license recognition. Turn 119 now checks `license.spdx_id === 'MIT'` in the same unauthenticated repository metadata response and returns `public_repository_license_not_detected` for absent, unrecognized or other licenses. It reports `checks.detectedMitLicense: true` on a passing published-source result. The separate pre-push destination check intentionally still permits an empty repository, and the opt-in handoff reports verification pending if license recognition is not available after the push. No public repository or provider transaction was created.

**Targeted verification:** `node --check` passed and **26/26** anonymous public-source and publication handoff tests passed on Node 24.22.1. The test set includes missing/malformed license metadata, empty-repository preflight, post-push pending status, exact public commit identity, creation-only Git push safeguards and CLI safety. This is not a complete Node 22 release, a real GitHub publication or genuine Sandbox evidence. [Turn 119](docs/turns/119-p0-github-detected-mit-license-gate.md); [anonymous source runbook](docs/submission/ANONYMOUS_PUBLIC_GITHUB_CHECK.md).

**Still open:** Full pinned Node 22 clean release, genuine Sandbox buyer-paid invoice and signature-verified matching webhook, separate publicly published one-commit repository with recognized MIT license, real under-three-minute public YouTube video, final Devpost submission and confirmation.

## Prior improvement: Turn 118

The final Devpost copy was still vulnerable to an operator accidentally pasting its GitHub/YouTube placeholders or the private development repository link into the actual submission. Turn 118 adds `scripts/devpost-copy-preflight.mjs` as a dependency-free offline Markdown structure checker. It requires fifteen submission sections, explicit PayPal and AI disclosures, plausible direct HTTPS links for a separate public repository and ordinary YouTube watch page, and no unresolved placeholders. It never prints draft text or URLs. Passing means only `copy_ready_for_manual_review`, not external visibility or completed submission. The current draft correctly remains blocked until genuine public artifacts exist.

**Targeted verification:** **9/9 Devpost copy tests passed** on Node 24.22.1, including the intentionally blocked actual draft, synthetic filled-in copy, private GitHub link, malformed video URLs, missing sections and safe CLI errors. Combined relevant local regressions passed **47 tests with 1 intentional FFmpeg-witness skip**. The tests are included in `submission:candidate:verify`; no complete clean Node 22 verifier was run. [Turn 118](docs/turns/118-p0-devpost-copy-release-preflight.md); [copy QA runbook](docs/submission/DEVPOST_COPY_QA.md).

**Still open:** Full pinned Node 22 clean release, genuine Sandbox buyer-paid invoice and signature-verified matching webhook, separate public repository, real under-three-minute public YouTube video, final Devpost submission and confirmation.

## Prior improvement: Turn 117

The complete release verifier previously launched its snapshot audit, frozen pnpm installation, full source verification and judge rehearsal without any individual child-process timeout. The clean-checkout wrapper had a 30-minute outer deadline, but a stalled stage could consume most of that time without preserving an informative stage result. Turn 117 adds fixed stage budgets of 2, 8, 15 and 3 minutes, bounded Git checks, a fail-closed process-error rule, and `release_stage_N_timed_out` codes in the private verification record. Existing sanitized command log capture and failure preservation remain intact. Node 22 release execution itself still requires a real complete checkout.

**Targeted verification:** **15/15 release-preflight tests plus 10/10 clean-checkout wrapper tests passed** on Node 24.22.1, including an actual child terminated at a 250 ms test deadline, mock timeout safety checks, Windows Corepack command allowlist and prior clean-source checks. [Turn 117](docs/turns/117-p0-bounded-release-stage-execution.md); [clean checkout runbook](docs/submission/CLEAN_CHECKOUT_RELEASE.md).

**Still open:** Exact clean pinned Node 22 full release; genuine Sandbox buyer-paid invoice and matching authenticated signed webhook; separate public-source publication; a real signed-out YouTube video under three minutes; Devpost submission confirmation.

## Prior improvement: Turn 116

The Turn 115 regression suite opportunistically generated a real H.264/AAC video whenever an `ffmpeg` executable existed. A Windows release host with an FFmpeg build lacking those encoders would therefore fail the full source verification for a tooling issue unrelated to RightsReceipt. The real codec witness is now opt-in through `RIGHTSRECEIPT_FFMPEG_TEST=1`, while the default tests cover structural and simulated decoder faults without requiring FFmpeg.

The CLI also supports an optional `--decode-check` after its dependency-free structure gate. It uses the real local FFmpeg decoder, maps exactly the first video and audio tracks, allows only local file/pipe protocols, disables stdin, forwards no PayPal or AI credentials, writes no media output, enforces a six-minute timeout and requires decoded video frames. Results never reveal filenames, provider secrets or FFmpeg diagnostics. Decoding cannot verify that narration is audible or truthful, that private identifiers are hidden, or that YouTube public playback works.

**Targeted verification:** Standard suite **13 passed, 1 explicitly skipped**, zero failed. Explicit FFmpeg integration suite **14/14 passed** on Node 24.22.1, including actual H.264/AAC muxing and full decoding. [Turn 116](docs/turns/116-p0-optional-video-decode-and-test-portability.md); [video release QA](docs/submission/VIDEO_RELEASE_QA.md).

**Still open:** Exact clean Node 22 release, genuine Sandbox buyer-paid invoice and matching authenticated signed webhook, separate public source, a real public working video under three minutes, and submitted Devpost confirmation.

## Prior improvement: Turn 115

The final video storyboard required a runtime below 3:00 but relied entirely on a manual timeline and export check. A video exactly three minutes long, an audio-only export, a silent export without an audio track, or a file with a misleading movie duration could slip into the rushed upload process. New `scripts/demo-video-preflight.mjs` is a dependency-free, read-only MP4 structure scanner. It checks movie and recognized track times in integer milliseconds, requires at least one video and one audio track plus media payload, handles version-1/64-bit timing and atom sizes, and reports resolution, file size and a few nonblocking quality advisories. No path or private metadata is echoed. It does not decode frames, assess actual audio quality, verify content/privacy, or prove YouTube public playback.

**Targeted verification:** **11/11** preflight tests passed on Node 24.22.1, including synthetic exact-3:00 and conflicting-track duration boundaries, malformed atoms, missing audio/video, and a real locally encoded H.264/AAC MP4. The `submission:candidate:verify` package chain now includes the new regression suite. [Turn 115](docs/turns/115-p0-final-demo-video-mp4-preflight.md); [video release QA](docs/submission/VIDEO_RELEASE_QA.md); [storyboard](docs/submission/VIDEO_STORYBOARD.md).

**Still open:** The exact Node 22 clean release on complete source, real same-invoice Sandbox payment and authenticated signed webhook, a separate published sanitized GitHub repository, a real public demonstration video under three minutes, and Devpost submission confirmation.

## Current improvement: Turn 114

Before this turn, the public exporter produced an audited local repository and the anonymous GitHub checker could verify a subsequent publication, but the intervening manual push was easy to perform against the wrong local checkout or a populated destination. The new `scripts/public-release-publish.mjs` links the frozen release evidence, private export manifest, source Git tree and actual one-commit public repository. Its default is a local read-only preflight. Only explicit `--publish` proceeds after an anonymous public-destination check; it reads remote heads/tags before invoking a single exact-SHA push to `main` under a creation-only lease. A successful push is followed by the existing independent three-GET GitHub verification, and any post-push verification failure is reported as pending rather than completed.

**Observed test-driven correction:** An initial real local Git test showed an identical second push could return success even with a creation-only lease. A separate no-existing-refs check now prevents both repeat pushes and publications over any existing branch or tag. A race test proved the lease still rejects remote `main` created after that read. This was tested only against temporary local bare repositories, not GitHub.

**Targeted verification:** **50/50** combined clean checkout, public export, anonymous GitHub and guarded-publication tests passed on Node 24.22.1. Syntax checks, package JSON parsing and the no-em-dash check for newly added sources/docs passed. The new Git transport cases used temporary local bare repositories only. See [Turn 114](docs/turns/114-p0-safe-public-source-publication.md) and the [Windows handoff runbook](docs/submission/SAFE_PUBLIC_RELEASE_PUBLICATION.md). No actual GitHub publication, provider payment, full Node 22 release, YouTube upload or Devpost submission occurred.

**Still open:** Exact clean Node 22 release on the complete private checkout, genuine Sandbox buyer payment and verified matching webhook, separate public repository, public video shorter than three minutes, and submitted Devpost confirmation.

## Current improvement: Turn 113

The offline submission-candidate checker intentionally refuses to treat plausible public GitHub URLs as proof of publication. There was no automated independent check that an anonymously accessible repository was public, distinct from the private history, still at the exact exported commit, and contained only the expected one-commit sanitized tree. The new dependency-free `scripts/public-github-release-check.mjs` accepts a verified private export manifest and a proposed public GitHub repository URL. It makes three unauthenticated, redirect-denied GitHub REST GET requests for public repository metadata, the `main` branch head and its Git commit. It checks public visibility, exact branch SHA and tree, root commit with zero parents, no fork, and public noreply author/committer metadata. It never uses credentials, creates a remote, pushes, deploys or contacts PayPal. It reports fixed outcomes without echoing private manifest paths or API bodies.

**Targeted verification:** The combined **25/25** public-export and anonymous-GitHub suites passed on Node 24.22.1. Eight new HTTP/CLI tests cover successful anonymous linkage, invalid and private URLs, private/forked repository metadata, head/tree/parent/author mismatch, redirect and unavailable responses, invalid/oversized JSON, and malformed local export evidence. Live public-source verification remains blocked until the sanitized repository exists. [Turn 113](docs/turns/113-p0-anonymous-github-source-check.md); [verification runbook](docs/submission/ANONYMOUS_PUBLIC_GITHUB_CHECK.md).

**Still open:** Exact clean Node 22 release and export on complete source, genuine Sandbox buyer-paid invoice and signed matching webhook, actual separate public GitHub repository, public functional video under three minutes, and Devpost submission. Anonymous GitHub API checks alone do not establish video visibility or payment authenticity.

## Prior improvement: Turn 112

The previous operator path required copying a release evidence path, changing into the generated clean clone and separately launching the one-commit public exporter. That was easy to mistype or run from a dirty checkout, particularly on Windows. `scripts/clean-release-checkout.mjs` now accepts the opt-in `--export-public` argument, invoking the existing sanitized exporter automatically **only after the exact clean Node 22 full release reports success**, from the matching isolated clone, with the earlier evidence record and an explicit private export directory. It requires the resulting one-commit repository and manifest to match the released source commit, source tree, hashed release record, fixed Git author identity, clean Git status and absence of remotes. A public export failure exits nonzero and does not erase the successful release evidence. Nothing is published or sent to PayPal by the new command.

**Targeted verification:** Four new tests covered the optional flag boundary, a real synthetic one-commit Git tree matching the release, rejection of failed/malformed/out-of-directory export records, manifest hash tampering, an unexpected remote and a modified public tree. **27/27** combined clean-checkout and public-export tests passed on Node 24.22.1. No full Node 22 run, native Windows execution, real PayPal Sandbox settlement, public push or submission occurred. [Turn 112](docs/turns/112-p0-one-command-private-public-export.md); [Windows operator runbook](docs/submission/CLEAN_CHECKOUT_RELEASE.md).

**Still open:** Run the exact clean Node 22 release and private public export on the complete repository, then genuine Sandbox buyer-paid invoice and signed matching webhook, independent public publication and signed-out checks, functional video shorter than three minutes, and Devpost submission.

## Prior improvement: Turn 111

The full release verifier now correctly launches Corepack through the fixed `cmd.exe /d /c corepack.cmd ...` shim on Windows, but the sanitized public exporter still recognized only the direct Unix Corepack command arrays in the passing release evidence. Thus a valid, successfully completed Windows full release would hit `release_evidence_invalid` during the next P0 step, preventing creation of the one-commit public source repository. The exporter now derives the two exact accepted command forms from the verifier's shared `releaseCommandInvocation` allowlist: direct Corepack and the Windows fixed `.cmd` launcher. All other command records, including shell-bearing text, missing `/d`, or a substituted executable, continue to fail closed. The hashed-command-log and source-tree validation are unchanged.

**Targeted verification:** A synthetic full-release record with both genuine Windows command arrays and the matching `02-cmd.exe`/`03-cmd.exe` hashed log names was rejected before the fix and accepted afterward. Three altered Windows command variants were rejected. **29/29** combined public-export and release-preflight tests passed on Node 24.22.1 (17 export and 12 preflight). This is synthetic cross-platform evidence testing, not a native Windows execution, genuine full Node 22 release, Sandbox payment, public publication or Devpost submission. [Turn 111](docs/turns/111-p0-windows-release-evidence-public-export.md); [clean checkout handoff](docs/submission/CLEAN_CHECKOUT_RELEASE.md).

**Still open:** Exact clean Node 22 full verification on Nolan's complete checkout, genuine Sandbox paid invoice and signed matching webhook, sanitized public source, public working demo under three minutes, and Devpost submission.

## Prior improvement: Turn 110

The private source cannot be cloned through an authenticated Git transport from the current execution environment, which also provides Node 24 rather than required Node 22. To make the complete release gate reproducible on the Windows machine that already holds the repository, `scripts/clean-release-checkout.mjs` now creates a unique, ignored **local clone** from the exact committed HEAD without copying untracked/ignored files, detaches at the SHA, checks the clone is clean, and launches the canonical release verifier there with a credential-stripped environment. Logs and `verification.json` go to the original repository's ignored `.data/clean-release/evidence` directory, while the source branch and working files remain untouched. The runner does not delete private evidence or clone directories, and it never calls a PayPal API itself.

**Targeted verification:** Six new tests exercised runtime refusal, CLI help and arguments, actual local Git clone identity, excluded dirty/ignored files and commit-bound evidence validation. **185/185** combined clean-clone, release, public audit/export, submission candidate and judge-console/report tests passed on Node 24.22.1. The production invocation was attempted here and failed as designed with `node_22_required` before any release work. A complete full Node 22/pnpm 12 build, real judge worker, genuine Sandbox payment or publication is **not** yet verified. [Turn 110](docs/turns/110-p0-clean-checkout-release-runner.md); [one-command runbook](docs/submission/CLEAN_CHECKOUT_RELEASE.md).

**Still open:** Run the pinned Node 22 full verifier using a complete local Git checkout, genuine Sandbox buyer-paid invoice with matching signed webhook, sanitized public one-commit source, public working demo video shorter than three minutes, and Devpost submission.

## Prior improvement: Turn 109

Even after stripping inherited package-manager environment variables, an ignored local `.npmrc`, `.pnpmfile.cjs`, or `pnpm-workspace.yaml` could silently alter `pnpm install` despite a clean Git status, especially when the developer has a global Git ignore pattern. The verifier now checks present package-manager configuration against the Git index. A configuration file that exists but is not tracked produces the fixed `local_package_manager_override_present` preflight failure; an unavailable tracking check fails closed. Existing committed `.npmrc` and `pnpm-workspace.yaml` remain allowed, with their exact source bytes already verified by the tracked-source identity gate.

**Targeted verification:** New synthetic Git tests first reproduced the ignored `.npmrc` bypass, then confirmed it is rejected along with ignored `.pnpmfile.cjs` and `pnpm-workspace.yaml`. A committed config fixture remains accepted. All 12 release preflight tests and **179/179** combined release, public-audit/export, submission-candidate and judge-console/report tests passed on Node 24.22.1. This protects local checkout configuration but does not isolate machine-level or user-level package-manager files. No complete Node 22 release execution, genuine Sandbox operation or publication occurred. [Turn 109](docs/turns/109-p0-ignored-package-manager-config-preflight.md).

**Still open:** Exact clean Node 22 full verification, genuine Sandbox buyer-paid invoice with signature-verified matching webhook, sanitized public one-commit repository, public working video under three minutes, and Devpost submission.

## Prior improvement: Turn 108

The release verifier's child environment previously deleted uppercase provider-prefixed keys and a few npm token names but allowed mixed-case variants and `COREPACK_*`, `NPM_CONFIG_*`, `PNPM_*` and `YARN_*` variables. Corepack supports registry credentials and integrity overrides in environment variables, while pnpm can accept registry authentication/configuration from environment. Inherited settings could therefore affect the supposedly clean release install or pass secrets into child tooling, especially with case-insensitive Windows environment names. The verifier now strips these families case-insensitively, also removing `NODE_TLS_REJECT_UNAUTHORIZED`, and removes any inherited casing of `APP_MODE` before explicitly setting `APP_MODE=local` and `PAYPAL_MODE=fake`.

**Targeted verification:** The new mixed-case/package-manager credential regression failed against the old code, then passed after the change. Ten of ten release preflight tests and **177/177** combined release, public-audit/export, submission-candidate and judge-console/report tests passed on Node 24.22.1. This is child **environment-variable** isolation, not proof that user-level npm configuration files cannot influence installation. No complete Node 22 run, real provider call or public release happened. [Turn 108](docs/turns/108-p0-release-child-package-manager-environment.md).

**Still open:** Exact clean Node 22 full verification, genuine Sandbox buyer-paid invoice with signature-verified matching webhook, sanitized public one-commit repository, public working video under three minutes, and Devpost submission.

## Prior improvement: Turn 107

The full release verifier invoked `corepack` as a direct child executable for `pnpm install --frozen-lockfile` and `pnpm verify`. On Windows, Corepack is normally exposed through a `.cmd` shim, which Node cannot launch directly without a command processor. This is an avoidable blocker for running the pinned release check on Nolan's Windows laptop. The verifier now invokes `cmd.exe /d /c` with **only** two exact, statically permitted `corepack.cmd` command strings on Windows. Linux and macOS still execute `corepack` directly. The release evidence records the actual launched executable and arguments, preserving auditability. New tests reject additional, malformed and shell-bearing Corepack arguments.

**Targeted verification:** Nine of nine release preflight tests passed, including the new simulated-Windows command selection and rejected shell argument cases. A combined selection of release, public-audit/export, submission-candidate and judge-console/report tests passed **176/176** on Node 24.22.1. The synthetic cross-platform unit test is not an execution on Windows. The genuine full `pnpm release:verify` still requires a clean, complete private checkout, Node 22.13+ and pinned pnpm 12.8.2. No provider or paid API calls were made. [Turn 107](docs/turns/107-p0-windows-corepack-release-launch.md).

**Still open:** Clean full Node 22 release verification, genuine Sandbox buyer-paid invoice with signature-verified matching webhook, sanitized public one-commit repository, public working video shorter than three minutes, and Devpost submission.

## Prior improvement: Turn 106

The actual localhost judge-console smoke previously accepted a redirect from the run button and then checked the `/report` and `/evidence` endpoints, without confirming that the browser console showed a successful run. A failed page with lingering artifact endpoints could therefore satisfy that portion of the test. The smoke now fetches the page immediately after the click and requires the explicit successful-rehearsal status, both evidence links, the first-run counter, a visible simulated-payment disclaimer and Sandbox distinction, and matching style-nonce CSP, frame-denial and no-store headers. Any mismatch fails with the sanitized `judge_smoke_completion_invalid` code. A stale copy assertion in the judge-page test was also aligned with the more precise existing transaction-report wording.

**Targeted verification:** 77/77 real-smoke helper, judge-page and report tests passed on Node 24.22.1, including a one-click HTTP fixture and negative completion-state cases. The actual `judge-local-console-local.test.mjs` suite cannot run in this environment because the application deliberately requires Node 22.13 or later within major 22. The genuine real-worker smoke and clean full Node 22 release verification were not executed. No Sandbox provider call or publication occurred. [Turn 106](docs/turns/106-p0-judge-console-post-run-completion-smoke.md).

**Still open:** Exact clean Node 22 full release verification, genuine Sandbox buyer-paid invoice and signature-verified matching webhook, public sanitized one-commit repository, public working video under three minutes, and Devpost submission.

## Prior improvement: Turn 105

The genuine Sandbox webhook preflight already blocked missing and malformed expected callback URLs before OAuth, but an explicitly empty direct callback produced `webhook_preflight_callback_invalid` rather than the documented `webhook_preflight_configuration_missing`. That discrepancy failed the existing read-only readiness integration test and would block the wider release regression chain. The callback-target helper now distinguishes empty configuration from malformed nonempty values without accepting any new URL or contacting PayPal. A separate direct-callback regression was added. The combined targeted Sandbox acceptance, webhook capture, registration, transport and reconciliation suite passed **142 of 142** on Node 24.22.1. This does not establish a real Sandbox payment or a full pinned release pass. [Turn 105](docs/turns/105-p0-sandbox-callback-missing-configuration.md).

**Still open:** Exact clean Node 22 full release verification, genuine Sandbox buyer-paid invoice and signature-verified matching webhook, public sanitized one-commit repository, public working video under three minutes, and Devpost submission.

## Prior improvement: Turn 104

The release preflight test fixture copied three required support modules into a synthetic Git repository but committed only top-level scripts. Six preflight tests therefore failed an unrelated clean-checkout assertion due to `?? scripts/support/` rather than exercising their intended release gates. The fixture now stages the support directory and explicitly asserts an initially clean checkout. All affected preflight checks pass, and the combined targeted public-audit, public-export, release, submission and judge-evidence suite passed **125 of 125** on Node 24.22.1. This is not the pinned Node 22 full private release run. [Turn 104](docs/turns/104-p0-clean-release-preflight-fixtures.md).

**Still open:** Clean full `pnpm release:verify` from the exact frozen private checkout, genuine Sandbox paid invoice and verified webhook, sanitized public one-commit source, working public YouTube demo and completed Devpost submission.

## Prior improvement: Turn 103

The sanitizer previously copied every tracked Git blob as an ordinary file. A legitimate executable `100755` source file consequently became `100644` in the new public repository, causing its required exact-tree check to reject an otherwise valid release. A synthetic Git regression reproduced the failure as `tree_identity_mismatch` before the fix. The exporter now reads staged Git modes, preserves executable permissions and applies the explicit executable index bit for cross-platform reliability. The new regression verifies source/public tree equality and the one-commit noreply export.

**Targeted verification:** 15/15 public export tests and 60/60 public audit tests passed on Node 24.22.1 in a focused local source reconstruction. This is substantive release regression coverage, **not** the pinned Node 22 full `pnpm release:verify`, a complete source snapshot audit or real payment evidence. The current source tree contains no executable tracked blobs; this correction protects valid future source changes. [Turn 103](docs/turns/103-p0-public-export-executable-mode-parity.md).

**Still blocked:** Clean full Node 22/pnpm 12 verification, genuine same-invoice Sandbox payment and verified webhook, sanitized one-commit public source, public working YouTube demo shorter than three minutes, and submitted Devpost entry. The private development history must remain private.

## Earlier improvement: Turn 083

Turn 083 moves the project from feature hardening into a deadline-bound hackathon submission cutover. The [November 4 evaluation](docs/submission/READINESS_EVALUATION_2026-11-04.md) separates official contest eligibility from stronger internal evidence goals, sets an internal November 9 submission target, and prioritizes the full release, genuine Sandbox acceptance, sanitized public source, short working video and Devpost confirmation. The [runbook](docs/paypal/SANDBOX_ACCEPTANCE.md) now puts optional collector registration before preflight, exact-invoice webhook binding before buyer payment, and authenticated paid GET and signature verification after payment. The main README now presents the product and no-install judge demo before historical engineering logs. Editorial stage-order, referenced-script and documentation-link checks passed. No runtime code, provider calls, full clean release tests or publication steps occurred. [Turn 083 receipt](docs/turns/083-p0-submission-cutover-and-webhook-order.md).

**Still open:** Clean pinned Node 22 release verification; genuine PayPal Sandbox buyer-paid invoice and signed webhook; sanitized one-commit public repo; public under-three-minute demonstration; and actual Devpost submission.

## Prior improvement: Turn 082

Turn 082 closes a Sandbox-origin boundary gap in the genuine acceptance harness. `scripts/paypal-sandbox-acceptance.mjs` restricted only the *initial* outgoing URL to `https://api-m.sandbox.paypal.com` in its `safeCalls` wrapper, but allowed native `fetch` to use its default automatic redirect behavior. A redirect response during OAuth, invoice draft/create/send, paid-status GET or signature verification could therefore produce a second request to an unintended origin, including potentially a production PayPal endpoint. The already-existing webhook-registration preflight specified `redirect: "manual"`, but the main acceptance harness did not.

The new `scripts/support/sandbox-locked-fetch.mjs` requires the exact Sandbox origin, rejects URL credentials and fragments, forces `redirect: "manual"` even if a caller asks to follow, rejects 3xx/opaqueredirect/redirected responses, and rejects returned response URLs that differ from the original request. The original request-body, method, headers and non-redirect error handling are retained. The genuine acceptance harness now calls this helper from its existing sanitized request-trace wrapper. An unsupported redirect is reported as an unavailable transport; the caller cannot treat it as a provider-confirmed payment or safe invoice handoff.

**Verification actually run:** Ten focused Node 22.16.0 transport tests passed and the complete test file was repeated three more times, all ten passing with no failures. The source and test Git blob SHA-1 identities match the tested local bytes. Two additional genuine-acceptance fixture regressions are staged to check `redirect: "manual"` across actual invoice operations and an unexpected redirect from invoice creation, but those integration tests and `pnpm release:verify` have not been executed on a complete private repo checkout. No real Sandbox credentials, OAuth, payment, webhook delivery, external deployment or GitHub Actions were used.

**Still open:** Clean exact-commit Node 22 full release verification; genuine PayPal Sandbox seller/buyer invoice, confirmed paid GET and signature-verified webhook; sanitized one-commit public repository; public working demonstration video under three minutes; Devpost submission. No claims of external acceptance may be based on the offline tests alone.

Records: [Turn 082](docs/turns/082-p0-paypal-sandbox-redirect-lock.md), [focused validation](docs/evidence/turn082/validation.json), [Sandbox runbook](docs/paypal/SANDBOX_ACCEPTANCE.md).

## Prior completed improvement

Turn 081 closes a concrete false-success gap in the executable localhost judge review. The prior accepted-file checks blocked malformed JSON and report policies but accepted an evidence record with a `passed` top-level flag and three array entries even when a licensing journey had failed, a reset had not denied a previous receipt, the seed DB counts differed, or the worker had attempted network requests. Six new HTTP cases reproduced the defect against exact Turn 080 source, failing as intended while the existing 17 console cases passed.

The new `scripts/support/judge-console-evidence.mjs` is shared by the browser's success gate and the smoke validator. Before `Local rehearsal passed` can display, it requires the three ordered ordinary/recovery/repeat journeys to each report success, a deterministic USD 425.00 quote, scheduled permission and verified receipt integrity, one create/send and actual invoice reads, zero external requests and zero credentials, repeatable outcomes, source and baseline markers, and three completed resets with prior capability/receipt/case denial and restored row counts. This is still a minimum local consistency screen, not independent PayPal authentication or the full report projector.

**Verification:** 23 console HTTP tests, 9 page tests, 10 smoke tests and 10 semantic-validator tests passed on Node 22.16.0, 52 total with zero failures. The full suite passed three more times. The Git blob SHA-1 identities of all seven tested source/test files match their locally executed bytes. See `docs/evidence/turn081/validation.json`. The canonical licensing worker and clean pinned `pnpm release:verify` were not executed in this session because the full private source checkout is unavailable locally.

**Remaining release gates:** Genuine Sandbox invoice paid by a separate test buyer and signature-verified webhook; exact clean full Node 22 verification including the real-worker smoke; sanitized public repository; public under-three-minute functional demonstration; and Devpost submission. Do not claim the offline simulation proves settlement.

Records: [Turn 081](docs/turns/081-p0-judge-semantic-evidence-validation.md), [validation](docs/evidence/turn081/validation.json).

## Prior completed improvement

Turn 079 adds a final, read-only consistency gate across the existing release artifacts. The private release verifier already creates `verification.json` for the exact frozen source; the public exporter already produces a sanitized single-commit `manifest.json`; the PayPal acceptance reconciler already checks three stage evidence files. No command previously connected these outcomes and the proposed public GitHub and YouTube URLs in one fail-closed submission check. `scripts/submission-candidate-check.mjs` reads a private `.data/submission-candidate.json` manifest, binds the exact current Git commit/tree to the full release and export records, checks the pinned Node/pnpm release steps and internally reconciled Sandbox evidence, and rejects a private development-repo URL, bad video link, or missing/mismatched records. It has no network access and prints only fixed blocker codes.

**Verification:** Nine focused Node 22.16.0 tests passed on the exact staged source and test bytes, including a temporary synthetic Git checkout exercising the read-only CLI, failed/missing release evidence, private-repository URL rejection, invalid public video URLs, mismatched export trees and Sandbox reconciliation failures. The full application release verification, the actual PayPal transaction, and independent checks of the proposed public GitHub, YouTube and Devpost links were **not** performed. The checker deliberately reports `readyForSubmission: false` even when all local records match. Its test suite is included in the standard release verification unit-test chain, but the final post-release CLI is separate because it requires external artifacts that do not yet exist.

**Still blocked:** genuine PayPal Sandbox settlement plus signature-verified webhook; clean exact-commit `pnpm release:verify` and export; anonymous public repo availability; public under-three-minute working demo video; and Devpost submission. Never publish the private development Git history or claim payment verification from JSON alone.

Records: [Turn 079](docs/turns/079-p0-submission-candidate-check.md), [Submission candidate instructions](docs/submission/SUBMISSION_CANDIDATE_CHECK.md), [Turn 078](docs/turns/078-p0-judge-console-experience.md).

## Prior completed improvement

Turn 078 improves the judge-facing browser demonstration itself. The previously dependency-free local console provided an unstyled HTML form and a text report link, leaving the value and sequence of the licensing workflow difficult for judges to scan. The new `scripts/support/judge-console-page.mjs` renders a responsive, dark-teal judge landing with explicit stages for scope, human approval and quote, simulated invoice/recovery and receipt, and three reset proofs. It adds high-contrast keyboard focus, semantic landmarks, screen-reader status, and direct links to the actual report and minimized JSON only after a passing run. A prominently bordered notice prevents confusion between injected provider behavior and genuine PayPal Sandbox evidence. The original 48-character CSRF token, exact form endpoint, same-origin POST, run limits, local worker and ignored private output remain unchanged. The page generates a new 32-hex-character per-request style nonce, with `style-src 'nonce-...'` CSP and no JavaScript or third-party assets.

**Verification:** Nine exact-source isolated Node 22.16.0 tests of rendering, accessibility and CSP passed. SHA-1 Git blob hashes of the new helper and tests match the executed bytes. The existing console HTTP regression suite now checks the actual HTML nonce against the HTTP CSP and confirms the responsive layout; those integration regressions were added but not run from a full private repository checkout. The real-worker browser smoke, pinned full `pnpm release:verify` and genuine PayPal Sandbox acceptance remain pending.

**Still open:** exact-commit clean full release test including the real-worker browser smoke, genuine Sandbox paid-invoice and signed-webhook acceptance, sanitized public repo, public working product demonstration video and Devpost entry. This UI pass performs no payment or external operation.

Records: [Turn 078](docs/turns/078-p0-judge-console-experience.md), [Judge guide](JUDGES.md), [local rehearsal](docs/demo/README.md).

## Prior completed improvement

Turn 077 makes the local judge's actual executable browser path a release test, not just a mock-driven UI check. Previously, `judge:console:verify` tested only an injected runner, while `judge-rehearsal-isolation-local.test.mjs` independently tested the worker CLI. Neither confirmed that the browser's Run form launched the real worker and returned valid report and JSON evidence. The new `scripts/judge-console-real-smoke.mjs` starts `startJudgeConsole` with its actual default runner, submits the same CSRF-protected localhost POST a judge uses, checks both served artifacts and strict report CSP, validates three scenarios and resets, confirms prior permissions are denied and the worker used zero network requests or credentials, then closes the server and deletes its ignored temporary directory. Its single JSON result is labeled `simulated_only`.

**Verification:** Eight focused Node 22.16.0 smoke-validator and local-HTTP tests passed in a temporary isolated test workspace. The exact tested source and test Git blobs were verified. The CLI is wired into `pnpm judge:console:verify` and hence `pnpm judge:verify` and `pnpm release:verify`, so it must actually complete against the real worker in a complete private checkout before any release gate can be green. That real-worker smoke, complete installed-dependency suite and genuine PayPal Sandbox transaction were **not** run in this session. No external service, production API or deployment was used.

**Still open:** exact-commit Node 22 release verify with real smoke passing, genuine Sandbox buyer-paid invoice and verified webhook, sanitized public one-commit repo, a real functioning-demo YouTube video, and Devpost submission. The Cloudflare preview is optional under official rules and is not verified deployed.

Records: [Turn 077](docs/turns/077-p0-real-worker-judge-console-smoke.md), [Judge guide](JUDGES.md), [Rehearsal guide](docs/demo/README.md).

## Prior completed improvement

Turn 076 closes a final-evidence linkage gap. The real Sandbox harness already validates that the paid-invoice webhook registration belongs to the same REST app, but the final offline three-stage acceptance checker did not require that registration record. Nor did it verify that the later PAID status read was based on the *same exact private invoice-state file* saved after creation. It could therefore pass internally consistent-looking but mismatched acceptance records. The new `scripts/support/sandbox-acceptance-linkage.mjs` requires three explicit cross-stage identities: successful paid-event webhook registration under the same Sandbox app, matching SHA-256 of the original saved `state.json` between creation and paid status, and matching registered webhook ID SHA-256 between creation and the verified webhook event. The harness now emits the missing sanitized hashes without exposing IDs, secrets or private state bytes; final reconciliation rejects absent, malformed, cross-invoice or mismatched records.

**Verification:** Nine focused Node 22.16.0 tests passed on the exact new linkage module, including positive and fail-closed cases. Six additional direct evaluations of the updated final reconciler confirmed that a valid fixture passes and missing registration, wrong saved state, wrong webhook registration, mixed invoice or unsettled financial evidence fails. Updated acceptance fixture regressions are staged and registered, but the full installed private-repo Node 22 release verification and real PayPal Sandbox acceptance did not run here. These JSON checks do not independently authenticate PayPal or prove payment.

**Still open:** A genuine Sandbox invoice paid by a distinct test buyer, verified settled GET and signed webhook evidence; exact clean Node 22 release verification, sanitized public repository, public functional demo video under three minutes, and Devpost submission. Cloudflare judge hosting remains optional. The development Git history remains private.

Records: [Turn 076](docs/turns/076-p0-cross-stage-sandbox-acceptance-evidence.md), [Sandbox acceptance](docs/paypal/SANDBOX_ACCEPTANCE.md), [Turn 075](docs/turns/075-p0-paypal-webhook-retry-window-alignment.md).

## Prior completed improvement

Turn 075 corrects an overly restrictive timestamp check introduced in the local, unverified webhook capture layer. PayPal retries deliveries for up to three days. The collector previously rejected any transmission older than five minutes, even though RightsReceipt's existing independent authenticated verifier accepts up to 259,500,000 milliseconds in the past, with a five-minute future skew. A real delayed retry could therefore be discarded before any PayPal signature postback. The new `scripts/support/sandbox-webhook-transmission-window.mjs` shares the verified handler's bounds with the preliminary collector. It validates canonical UTC times, preserves five-minute future skew, and does not change invoice binding, raw event retention, one-shot terminal protection or authentic signature verification.

**Verification:** Eight exact-byte isolated timestamp tests passed using Node 22.16.0 and match their staged Git blob hashes. The changed collector HTTP suite includes a delayed twenty-minute retry acceptance test and a rejection outside the three-day boundary, but the complete collector suite and pinned full release verification have not run against a local private checkout. No real PayPal call, payment, delivery or hosted deployment was performed.

**Still open:** Genuine Sandbox create/send/buyer-paid/verified-webhook evidence, exact clean-release `pnpm release:verify`, a sanitized public repository, working YouTube demo under three minutes, and Devpost submission. The old private Git history must remain private.

Records: [Turn 075](docs/turns/075-p0-paypal-webhook-retry-window-alignment.md), [Sandbox runbook](docs/paypal/SANDBOX_ACCEPTANCE.md), [Turn 074](docs/turns/074-p0-terminal-webhook-capture-lifecycle.md).

## Prior completed improvement

Turn 074 closes an asynchronous lifecycle bug in the one-shot local webhook collector. The previous `capture_timeout` result settled the capture promise, but the HTTP handler still had a separate `claimed=false` flag, so a late request could write `capture.json` and be acknowledged after the run had already failed. The collector now uses `scripts/support/one-shot-capture-lifecycle.mjs` as a single synchronous authority state. A completed or expired capture denies new requests with HTTP 410; an in-flight body is checked again after its asynchronous read before any event can claim the slot. A claim can succeed only once, and completion is terminal. The private route, exact invoice binding, structural header checks, raw-body retention and independent PayPal signature verification remain unchanged.

**Executed verification:** Six focused Node 22.16.0 lifecycle tests passed, including an expired late request, two simultaneous claim attempts, claimed completion, and independent run ownership. The exact Git blob hashes match those tested local files. Three additional real-HTTP collector tests were staged for post-timeout arrivals, in-flight body completion, and malformed late bodies but were not executed against the full private repository in this session. The changed collector source passed JavaScript syntax review; no full dependency-backed Node 22 verification or real PayPal event was performed.

**Still open:** Clean exact-commit release verification, genuine PayPal Sandbox invoice/payment/paid GET/verified webhook, approved public HTTPS forwarding if using the local collector, sanitized public repository, functional demo video, and Devpost submission. Cloudflare is optional under contest rules. Keep the private development history private.

Records: [Turn 074](docs/turns/074-p0-terminal-webhook-capture-lifecycle.md), [Turn 073](docs/turns/073-p0-exact-invoice-paypal-webhook-capture.md), [Sandbox runbook](docs/paypal/SANDBOX_ACCEPTANCE.md).

## Prior completed improvement

Turn 073 closes a one-shot collector correctness risk in the genuine Sandbox acceptance flow. Previously the collector accepted the first structurally valid `INVOICING.INVOICE.PAID` event and then closed, regardless of which invoice generated it. An unrelated paid invoice on the same Sandbox app could therefore consume the only capture before the canonical USD 425.00 case was paid. The collector now requires a **private, exact original-invoice binding** before accepting any paid event. The new `scripts/support/sandbox-webhook-binding.mjs` validates the exclusive collector route and the original `state.json` from a successfully sent/checked invoice, then writes `invoice-binding.json` under the ignored run directory using owner-only permissions. `pnpm sandbox:acceptance:webhook:bind` performs this offline step between invoice creation and buyer payment, without printing the actual invoice ID or contacting a provider.

Without a binding, the collector returns an HTTP 503 and remains available for PayPal retry; with a binding, paid events for other invoices are acknowledged as ignored. The collector ignores partial/pending paid-event notifications and rejects transmissions outside a five-minute freshness interval. The later PayPal signature verification and paid financial GET remain independent. Binding is not authentication. Twelve focused Node 22.16.0 tests passed for the binding helper and CLI; five additional collector HTTP regression cases were added but not executed against the complete private repository in this session. No live provider, deployment or payment action occurred.

**Still open:** public HTTPS forwarding and registered callback, a real Sandbox buyer payment, same-invoice signature verified paid webhook, exact-commit clean Node 22 full release verification, sanitized public repository, functioning demonstration video, and Devpost submission. The restricted Cloudflare preview remains optional under the contest rules.

Records: [Turn 073](docs/turns/073-p0-exact-invoice-paypal-webhook-capture.md), [Sandbox acceptance runbook](docs/paypal/SANDBOX_ACCEPTANCE.md), [Turn 072](docs/turns/072-p0-private-genuine-sandbox-webhook-capture.md).

## Prior completed improvement

Turn 072 provides an operator-controlled intake path for the existing genuine PayPal Sandbox signature checker. Previously the acceptance harness required a manually assembled private `capture.json`, without a built-in receiver for an actual delivered event. The new `scripts/sandbox-webhook-capture.mjs` creates a localhost-only, one-shot, no-credential receiver with a 192-bit private route stored under ignored `.data`. With a separately configured public HTTPS:443 forwarding endpoint, the receiver can persist the exact original `INVOICING.INVOICE.PAID` JSON text and five signature headers to a private file using owner-only permissions, then closes. Requests have a 131,072-byte body ceiling; irrelevant events are ignored and invalid, forged-looking or production certificates are rejected structurally. It does not authenticate the callback or grant permission. The existing `sandbox:acceptance:webhook -- --capture ... --state ...` must perform genuine PayPal postback signature verification and bind the event to the original invoice.

**Verification:** Ten standalone localhost Node 22.16.0 HTTP/CLI regression tests passed, including raw-body preservation, signature-header handling, ignored events, byte ceilings, wrong statuses, private paths, one-shot behavior and timeout. The new test is wired into the normal PayPal acceptance verification chain. The full project Node 22 release, real publicly forwarded delivery, actual Sandbox payment and verified webhook have not been executed in this session.

**Important:** A public HTTPS forwarding endpoint remains a manual, separately approved external setup. The receiver binds only to `127.0.0.1`, does not create a tunnel or alter PayPal registration, and prints only private file paths. The official self-run judge path remains available without Cloudflare but is simulated; it is not a substitute for authentic PayPal evidence. The release is NOT READY.

Records: [Turn 072](docs/turns/072-p0-private-genuine-sandbox-webhook-capture.md), [Sandbox acceptance runbook](docs/paypal/SANDBOX_ACCEPTANCE.md), [Turn 071](docs/turns/071-p0-same-app-sandbox-webhook-readiness.md).

## Prior completed improvement

Turn 071 closes an external-acceptance prerequisite: an invoice created by one PayPal REST app cannot generate paid-invoice webhook events for a webhook registered under a different app. The new `scripts/support/sandbox-webhook-readiness.mjs` uses only the configured Sandbox client credentials to make OAuth and a bounded, authenticated read-only GET of that app's webhook registration list. It requires the configured webhook ID to be present exactly once, to subscribe to INVOICING.INVOICE.PAID (or all events), and to use a structurally public HTTPS listener. Malformed/redirected/oversized responses and the simulator-only webhook ID fail closed. It emits no credentials or listener URLs, only sanitized result fields and a hash of the configured ID.

The new `pnpm sandbox:acceptance:webhook:preflight` command can check this readiness without creating an invoice. Stage 1 `sandbox:acceptance:create` now enforces the same preflight before the first invoice POST, and records the sanitized registration confirmation in its local evidence. Negative fixture cases prove that a webhook belonging to another app or missing ID prevents invoice creation. Ten isolated registration tests and three CLI tests passed under Node 22.16.0. The modified full acceptance integration test collection was staged but has not been run from a complete private repository checkout in this session.

This confirms only current app registration metadata. It does not prove that PayPal can reach the HTTPS listener, deliver a genuine webhook, verify its signature or settle a transaction. A live Sandbox OAuth/create/send/paid invoice/verified webhook and clean Node 22 release run remain mandatory. Do not use simulator events as genuine signature evidence.

**Still open:** real PayPal Sandbox acceptance, exact clean-release verification, sanitized public repository, public functional demo and under-three-minute YouTube video, Devpost submission. The separate Cloudflare judge-preview route remains optional under the contest rules.

Records: [Turn 071](docs/turns/071-p0-same-app-sandbox-webhook-readiness.md), [Sandbox acceptance runbook](docs/paypal/SANDBOX_ACCEPTANCE.md), [Turn 070](docs/turns/070-p0-private-paypal-sandbox-buyer-handoff.md).

## Prior completed improvement

Turn 070 addresses a concrete blocker in the real PayPal Sandbox acceptance runbook. The harness already created, sent and fetched an authenticated USD 425.00 Sandbox invoice, but returned only a `paymentUrlPresent` boolean, leaving the tester no direct way to open the actual PayPal recipient-view link. The new `scripts/support/sandbox-payment-handoff.mjs` validates the strict Sandbox invoice-view origin and URL shape, then writes a private `sandbox-payment-link.txt` with owner-only permissions where supported. Stage 1 prints only the local `handoffPath`, never the URL; public `evidence.json` and restart `state.json` remain URL-free. A later unpaid Stage 2 status check regenerates a fresh link without creating or resending an invoice. PAID or nonpayable statuses generate no new link. Unexpected URLs or file errors fail closed, and an existing file is not overwritten.

Five isolated Node 22.16.0 handoff tests passed, including safe payment URL validation, private file permissions, overwrite rejection, nonpayable states and hostile URLs. The integration fixture now exercises create, unpaid recheck, paid conclusion and uncertain-send no-handoff cases, but the full private-repository test suite and genuine PayPal Sandbox actions were **not** run in this session. The PayPal Sandbox invoice GET and webhook proof remain external gates. Real buyer interaction with a separate personal Sandbox account remains required.

**Still open:** genuine Sandbox OAuth/create/send/buyer-payment/paid GET/verified webhook evidence, exact clean Node 22 release verification, sanitized public repository, functional public judging instructions, under-three-minute YouTube demo and Devpost submission. Cloudflare hosting remains optional under the official rules; the private development repository must remain private.

Records: [Turn 070](docs/turns/070-p0-private-paypal-sandbox-buyer-handoff.md), [PayPal acceptance runbook](docs/paypal/SANDBOX_ACCEPTANCE.md), [current judge quick start](docs/submission/JUDGE_QUICKSTART.md).

## Prior completed improvement

Turn 069 adds `node scripts/judge-local-console.mjs`, a dependency-free localhost browser console that launches a fresh application-handler rehearsal when the reviewer clicks a form, then shows the generated HTML and minimized JSON evidence. The same three ordinary/recovery/repeat scenarios and reset proof remain delegated to the canonical worker, with credentials stripped and PayPal-like provider responses injected. The console is loopback-only, refuses cross-origin or unrecognized POSTs, rate-limits runs, checks generated artifact paths and uses no-store, anti-framing and restrictive CSP headers. Six isolated Node 22.16.0 HTTP tests passed with a mocked rehearsal runner. The actual complete application-run-through was not executed from a private Git checkout in this session. The console is **not** a real payment, live-AI or authenticated creator demo.

The official hackathon rules permit complete self-run instructions rather than a hosted demo URL, so Cloudflare deployment is now correctly treated as an optional submission path rather than a mandatory rule. The source must still be public, genuinely functional, usable by judges, and shown running in a public YouTube video under three minutes. Genuine PayPal Sandbox acceptance, clean full Node 22 release verification, sanitized public export and Devpost remain open. The restricted Cloudflare preview remains useful if approved and deployed, but is not a prerequisite under the official rules.

Records: [Turn 069](docs/turns/069-p0-local-functional-judge-console.md), [judge quick start](docs/submission/JUDGE_QUICKSTART.md), [demo guide](docs/demo/README.md).

## Prior completed improvement

Turn 068 closes a release identity gap beyond the lockfile. A clean Git status may conceal changed application source when Git index flags are set. The new `scripts/tracked-source-identity.mjs` verifies the exact committed HEAD tree, staged index and Git-normalized contents of every tracked file, rejecting `skip-worktree`, `assume-unchanged`, missing files, unexpected modes and any mismatch. Both the exact-commit `release:verify` preflight and the sanitized `public:export` reject a failed identity check. The new native regression suite is wired into `release:preflight:verify` and integration cases were added to both release and export fixtures.

**Verification:** Nine focused tests passed using Node 22.16.0 in temporary Git repositories. A 635-file synthetic tree passed in approximately 1.2 seconds. The full installed-dependency Node 22 release suite, including the newly added integration fixtures, was not run here because an authenticated local checkout of the private repository is unavailable. No PayPal or Cloudflare operation occurred.

**Still open:** clean Node 22 `pnpm release:verify` on the final merged commit, genuine PayPal Sandbox invoice/payment/webhook evidence, live Cloudflare/D1 deployment and judge smoke, authenticated demonstration, sanitized public repository, video and Devpost submission. Preserve the private development Git history.

Records: [Turn 068](docs/turns/068-p0-whole-tree-release-identity.md), [release verification](docs/engineering/RELEASE_CANDIDATE_VERIFICATION.md), [public release audit](docs/engineering/PUBLIC_RELEASE_AUDIT.md).

## Prior completed improvement

Turn 067 removes silent blind spots from the history-aware publication audit. The previous 2 MiB limit skipped a 3,592,589-byte synthetic training file without blocking success. The scan now examines UTF-8 text up to 16 MiB and fails on any larger file, binary or invalid UTF-8 content, unresolved Git LFS pointer, symlink or Git submodule. Git index modes and historical tree entry types are checked separately. The one-commit public exporter continues to require a clean exact-commit Node 22 release record and now inherits a fail-closed source scan. Six isolated blob-policy tests passed under Node 22.16.0; additional disposable-Git and export regressions were added but not executed in this session. This is not a completed publication audit or a real release verification. No public repository, deployed Worker or PayPal transaction was created.

**Still open:** clean Node 22 `pnpm release:verify`, genuine Sandbox paid and verified-webhook evidence, Cloudflare D1/Worker deployment with live eleven-probe smoke, authenticated judge demo, sanitized public export, public video and Devpost submission. The private development Git history must remain private.

Records: [Turn 067](docs/turns/067-p0-no-silent-public-audit-skips.md), [Turn 066](docs/turns/066-p0-evidence-backed-judge-walkthrough.md), [Public Release Audit](docs/engineering/PUBLIC_RELEASE_AUDIT.md).

## Prior completed improvement

Turn 066 makes the no-login `/judge` walkthrough useful as a concrete product demonstration instead of only a prose explanation. The previous page explained five authority checkpoints and listed a synthetic case, but did not show the reviewed rights, real seeded pricing-policy breakdown or evidence-state timeline that make RightsReceipt distinctive to a hackathon reviewer.

The Worker-first, read-only page now has three accessible, responsive, print-friendly evidence panels. A paraphrase of the synthetic buyer request avoids reproducing the private original text. A native `details` disclosure reveals all twelve resolved rights, tied to the rehearsal's human-corrected `manual-review-v1` source, without suggesting that this page executed AI. The USD 425.00 quote table displays the exact seeded integer-cent policy lines: $200 base commercial digital, $100 paid social, $50 US/Canada, $50 duration and $25 crop permission. A timeline distinguishes local creator approval, separate buyer acceptance, injected provider invoice/send and paid label, local reconciliation, and the **scheduled, not active** permission receipt. The page explicitly states its October 27, 2026 fixture clock, before the November 1 license start.

The static page makes no API requests, has no scripts or forms, shares no access code, invoice ID, buyer contact or raw request, and retains its per-request CSP nonce plus privacy headers. The hosted eleven-probe smoke now requires the three evidence markers, the exact quote-total marker and the manual-review label, rejecting a stale narrative-only page. Eight isolated route tests and twenty-six hosted-smoke tests passed under Node 24.22.1. Tests cross-check five quote rules against `seed/demo-reset.sql`, all twelve rights against the source rehearsal, and privacy boundaries. No full Node 22 build, real Cloudflare deployment, genuine PayPal Sandbox call or browser session was run.

**Still open:** genuine Sandbox acceptance, clean Node 22 release verification, approved remote D1 and Worker provisioning with live eleven-probe smoke, authenticated demo readiness, sanitized public export, video and final submission evidence. A synthetic walkthrough is explanatory evidence only, not a substitute for a real PayPal transaction.

Records: [Turn 066](docs/turns/066-p0-evidence-backed-judge-walkthrough.md), [Turn 065](docs/turns/065-p0-restricted-judge-runtime-attestation.md), [judge quick start](docs/submission/JUDGE_QUICKSTART.md).

## Prior completed improvement

Turn 065 closes a runtime-verification gap left by the restricted judge deployment launcher. A valid local Wrangler file does not by itself prove that the deployed Worker is running the safe preview flags. The hosted smoke previously accepted a healthy `sandbox` or `judge` mode service without checking the deployed feature-flag and binding profile. A stale Worker, wrong origin or unexpected Cloudflare runtime secret/binding could therefore look healthy from public pages alone.

The Worker now serves a strict, read-only `GET /api/judge/runtime-profile` route before other API handlers. It returns an intentionally minimal `restricted` response only when the runtime environment has exactly the approved fixed variables, public/consent origins match the HTTPS request origin, D1 and static asset bindings exist, and no extra runtime variables or bindings are attached. Misconfigured Workers return sanitized HTTP 503 with no value disclosure. The fixed flag values are checked against the tracked judge template by regression. The route uses private no-store, anti-indexing, anti-framing and a no-active-content CSP, and rejects query parameters and methods other than GET.

The signed-out hosted smoke now requires eleven probes: the prior ten plus the restricted runtime attestation, with exact profile schema and response fields, strict headers and `APP_MODE=judge`. The deployment launcher requires an eleven-of-eleven smoke summary, so older or mismatched Workers cannot satisfy this turn's launch proof. Six isolated runtime tests, twenty-five hosted-smoke tests and fourteen launcher tests passed under Node 24.22.1 using in-memory sources and mocked HTTP/command results. The full Node 22 build/test suite, real Cloudflare deployment and genuine PayPal Sandbox acceptance were not performed. This public profile does not cryptographically attest to a source commit, or guarantee that application code has no bugs.

**Still open:** approved remote D1/Worker setup and real eleven-probe smoke, clean Node 22 release verification, genuine PayPal Sandbox acceptance, authenticated demo path, sanitized public export, video and final submission evidence.

Records: [Turn 065](docs/turns/065-p0-restricted-judge-runtime-attestation.md), [Turn 064](docs/turns/064-p0-verified-judge-preview-launch.md), [judge quick start](docs/submission/JUDGE_QUICKSTART.md).

## Prior completed improvement

Turn 064 closes an operational fail-open gap in the restricted judge deployment process. Until now, `pnpm deploy:judge:preview` checked the ignored local Wrangler config and built before deployment, but did not enforce the independently documented remote D1 ledger check. It also did not automatically test the resulting hosted Worker. The operator could omit those manual steps and still receive a successful deployment command.

The new `scripts/judge-preview-launch.mjs` is the only package-script path for the restricted preview deploy. Before remote activity it validates the exact ignored `wrangler.judge.local.jsonc`, rejects local dotenv and dev-vars overrides, and builds with the existing release verifier's credential-stripped, local/fake environment. It then runs a fixed `SELECT name FROM d1_migrations ORDER BY id` against the configured remote D1 binding using Wrangler, parses the bounded JSON through the existing nine-migration ledger checker, and deploys only after the ledger is complete and ordered. It checks that the ignored config has not changed between stages. After deployment, it runs the then-ten-probe signed-out HTTP smoke at the exact configured HTTPS origin and requires a valid passing summary. All output is a sanitized phase/code receipt; raw Wrangler output, credentials and response bodies are not printed by the launcher.

Fourteen isolated Node 24.22.1 launch tests passed with injected commands, including unsafe config, dotenv overrides, failed build, missing or malformed ledger evidence, config drift, failed deploy, rejected hosted smoke, bad target or count and exception sanitization. Neither the remote D1 query, Wrangler deployment, PayPal API nor a pinned Node 22 full build/test run was executed. The actual remote read/deploy must only be invoked with approved Cloudflare access and awareness of account usage. If postdeploy smoke fails, the remote deployment may already exist and is not automatically rolled back.

**Still open:** an approved Cloudflare account and separate D1 with applied migrations, the real gated launch and hosted smoke result, genuine PayPal Sandbox acceptance, clean Node 22 release verification, authenticated demo path, sanitized public export, video and submission packet.

Records: [Turn 064](docs/turns/064-p0-verified-judge-preview-launch.md), [Turn 063](docs/turns/063-p0-hosted-browser-security-headers.md), [judge quick start](docs/submission/JUDGE_QUICKSTART.md).

## Prior completed improvement

Turn 063 strengthens the hosted judge deployment gate without adding any network operation or payment action. Previously, `pnpm judge:hosted:smoke` accepted a native buyer page, receipt viewer, judge tour, browser script or unknown public verification response when its status/body looked correct and `Cache-Control` merely included `no-store`. A Cloudflare deployment that stripped clickjacking protection, anti-indexing, no-referrer, MIME sniffing controls or critical Content Security Policy (CSP) directives could therefore pass.

The same ten signed-out, bounded GET probes now also validate six native-response security profiles: private plus no-store caching, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-Robots-Tag` noindex/nofollow, and CSP directives that deny default sources, framing and base URLs. Script and connection sources may use only the response's own origin, form actions are restricted, duplicate CSP directives fail, and the inline style nonce must match the CSP for both judge and buyer HTML. The public SPA landing page is exempt from the private-page policy. The acceptance tests use the actual `createJudgeTourRoute` handler for the judge response and realistic buyer/receipt fixtures.

Twenty-one isolated smoke tests passed under Node 24.22.1, including adversarial removal or weakening of headers, CSP and nonces. No deployed Cloudflare URL was queried, no private request was opened, and no genuine PayPal Sandbox operation was performed. The pinned Node 22 full release gate remains pending. A passing header check does not establish a browser security audit or operational correctness across an authenticated journey.

**Still open:** the same release blockers remain: approved remote D1/Worker setup and hosted smoke, genuine PayPal Sandbox acceptance, clean Node 22 release verification, authenticated demo path, sanitized public export and submission evidence.

Records: [Turn 063](docs/turns/063-p0-hosted-browser-security-headers.md), [Turn 062](docs/turns/062-p0-signed-out-judge-walkthrough.md), [judge quick start](docs/submission/JUDGE_QUICKSTART.md).

## Prior completed improvement

Turn 062 replaces a broken judge entry: the public /judge SPA route still said the seeded demonstration would come later, while the home page offered local-only simulated actions that a restricted judge Worker cannot complete. A new Worker-first /judge route now serves an accessible, no-login illustrative journey built only from the canonical synthetic Maya Chen, Cedar & Tide, Harbor After Rain and USD 425.00 scenario. The narrative separates buyer intake, AI suggestions, human approvals, deterministic pricing, injected provider settlement and a **scheduled, not active** receipt. It links to the actual signed-out buyer private-code screen, receipt viewer and read-only health check, but holds no private capabilities, makes no outbound calls, and does not issue credentials or process payment.

The native HTML uses a per-request Content Security Policy nonce, same-origin image loading, no scripts, no forms, private no-store and no-index headers. Query strings and mutation methods are rejected without echoing values. Both local and restricted Wrangler configs route /judge to the Worker before SPA fallback, and the deployment preflight refuses a judge config that removes it. The React home page and navigation now describe the prototype and local-only routes honestly. Hosted smoke now makes ten read-only signed-out probes, including evidence that the judge page contains the synthetic labels and explicit PayPal limitation.

Isolated Node 24.22.1 route, preflight and hosted-smoke tests were run against in-memory source fixtures. No Cloudflare deployment, pinned Node 22 full test/build gate, genuine Sandbox payment, authenticated creator journey or public export was performed. The page itself is an explanatory artifact, not proof that a real payment happened.

**Still open:** A public restricted preview still cannot issue buyer codes because creator access remains disabled. Genuine end-to-end Sandbox acceptance, Cloudflare account setup and D1 deployment, signed-out hosted smoke against a real URL, clean Node 22 release verification, sanitized public export, video and Devpost submission remain release gates.

Records: [Turn 062](docs/turns/062-p0-signed-out-judge-walkthrough.md), [Turn 061](docs/turns/061-p0-judge-buyer-origin-readiness.md), [judge quick start](docs/submission/JUDGE_QUICKSTART.md).

## Prior completed improvement

Turn 061 fixes a concrete blocker in the restricted judge preview before it can become a public demo. The tracked `wrangler.judge.example.jsonc` enabled `REQUEST_INTAKE_ENABLED`, `CLARIFICATION_ENABLED` and `HUMAN_CONSENT_ENABLED`, but left `HUMAN_CONSENT_ORIGIN` blank. The native buyer page and its private intake API require this value to equal the exact public Worker origin. As a result, the planned configuration would return `503 request_intake_unavailable` on `/buyer/request`, even with migrated D1 and the other feature flags set correctly.

The judge template now uses the same deliberately invalid public-host placeholder for `HUMAN_CONSENT_ORIGIN` and `RIGHTS_RECEIPT_PUBLIC_ORIGIN`. The dependency-free preflight requires both to be a safe bare HTTPS origin and to match exactly. The operator must replace both occurrences when configuring the ignored local judge file. A new test exercises the actual request-intake page factory with the restricted configuration, confirming buyer form/script HTTP 200, required private-code entry, private no-store headers, and continued rejection of creator issuance. The signed-out hosted smoke now requires the code entry and access form, so a decorative intake form cannot pass.

Fifteen static-config, six native-route and fourteen hosted-smoke regressions passed under Node 24.22.1 using in-memory fixture substitutions. Existing route and client code was not changed, and no provider or D1 remote calls occurred. The new route test is part of `pnpm judge:deploy:verify` through the existing TypeScript test loader. The exact Node 22 full verifier and dependency-backed production build were not executed in this environment.

**Still open:** a restricted signed-out shell is not a functioning end-to-end licensing demo. It cannot issue private buyer capabilities because authenticated creator issuance remains disabled; no seeded request code is publicly disclosed. Genuine PayPal Sandbox and creator authorization remain separate reviewed release gates. Cloudflare account setup, live D1 migrations, public URL, hosted smoke, clean Node 22 release verification and final submission evidence remain pending.

Records: [Turn 061](docs/turns/061-p0-judge-buyer-origin-readiness.md), [Turn 060](docs/turns/060-p0-judge-d1-ledger-verification.md), [judge quick start](docs/submission/JUDGE_QUICKSTART.md).

## Prior completed improvement

Turn 060 closes another hosted judge readiness gap. Turn 059 checked the nine SQL migrations' expected schema artifacts but could report `persistence: ready` for a database that was manually assembled or had a missing, duplicated or unexpected Wrangler migration-history record. Hosted health now additionally requires the default `d1_migrations` table to contain exactly nine entries, each matching one of the nine expected filenames. Missing or incorrect ledger evidence still produces the same sanitized `503 persistence_unavailable` in `sandbox` and `judge` modes. The check remains one read-only query. Local mode remains offline.

The restricted `wrangler.judge.example.jsonc` now explicitly pins `migrations_table: d1_migrations`, and the static deployment preflight enforces that pin. A new dependency-free `pnpm judge:d1:ledger:check` consumes one operator-supplied Wrangler `d1 execute --json` result from stdin and validates that all nine filenames appear once, in migration order, without projecting row values into its result. The judge runbook shows the approved read-only remote query to pipe into this check after applying migrations and before deploying.

Thirteen hosted-schema regressions passed against the actual nine SQL migrations plus a simulated Wrangler ledger, and ten isolated JSON-parser regressions passed under Node 24.22.1. No remote D1 query, Cloudflare deployment, genuine PayPal Sandbox operation or paid API was performed. The full clean Node 22 release verifier and route-level dependency-backed Vitest remain unexecuted in this environment.

**Limitations:** The offline ledger checker cannot authenticate the source, freshness or account identity of piped JSON. The hosted health check confirms filename and schema artifact presence, not migration file hashes, object definitions, row integrity or business acceptance. The `deploy:judge:preview` command enforces the static config only, so the operator must also execute the documented remote ledger check before deploying.

Records: [Turn 060](docs/turns/060-p0-judge-d1-ledger-verification.md), [Turn 059](docs/turns/059-p0-expanded-hosted-schema-readiness.md), [judge quick start](docs/submission/JUDGE_QUICKSTART.md).

## Prior completed improvement

Turn 059 hardens the hosted D1 readiness check against a partial or tampered migration. Previously health counted fourteen representative tables, so a database with those tables but missing later indexes, triggers or ALTER TABLE columns could still report `persistence: ready`. It now runs one read-only SQLite schema query for the 33 domain tables, 23 named indexes, 28 integrity triggers and 15 columns added by migrations 0004, 0006, 0007 and 0008. Any missing artifact, malformed result or D1 error returns the same sanitized `503 persistence_unavailable` response in Sandbox/judge modes. Local mode still does not require D1.

The source-controlled inventory was checked against all nine actual SQL migrations. In-memory SQLite applied the nine real migrations successfully; 28 isolated acceptance/rejection checks passed under Node 24.22.1, including removed artifact cases and unexpected database result shapes. Ten isolated Node test cases passed with in-memory module loading; the route-level Vitest integration assertion was updated but not executed. No hosted D1, Cloudflare account, PayPal API or payment was used. The full dependency-backed test suite and exact clean Node 22 release verifier remain unexecuted here.

**Limitations:** Schema-object and column-name presence does not verify object SQL definitions, migration ledger state, foreign-key integrity, seeded data or an actual business journey. The restricted deployment preflight from Turn 058 is still only a static configuration guard. The remote D1 database and signed-out judge URL remain unprovisioned and untested.

Records: [Turn 059](docs/turns/059-p0-expanded-hosted-schema-readiness.md), [Turn 058](docs/turns/058-p0-restricted-judge-deployment.md), [judge quick start](docs/submission/JUDGE_QUICKSTART.md).

## Prior completed improvement

Turn 058 adds a fail-closed deployment guard for the next Cloudflare judge preview. The source-controlled `wrangler.jsonc` is still local-only and has no D1 binding, yet `pnpm deploy` previously invoked Wrangler against it directly. Now `pnpm deploy` performs a dependency-free safety preflight and refuses that configuration before any build or network deployment.

A new credential-free `wrangler.judge.example.jsonc` template targets the distinct `rightsreceipt-judge` Worker in judge/Sandbox mode with a D1 binding and the expected asset routes. Its D1 ID and HTTPS origin are deliberately invalid placeholders. A local copy named `wrangler.judge.local.jsonc` is ignored by Git and can be validated with `pnpm judge:deploy:check`. The guard requires a non-placeholder UUID, a public HTTPS origin, exact Sandbox API host, a named D1 migration directory, the expected Worker and static-asset routes, and disabled creator access, invoicing, webhook, payment and receipt-issuance flags. The preview permits buyer intake, clarification, buyer-consent scaffolding and guarded receipt reading, without enabling financial operations. The public-source audit now rejects any force-tracked `wrangler.judge.local.jsonc`, and a Git-fixture regression was added for that privacy boundary.

Thirteen isolated, mocked-configuration regression tests passed under Node 24.22.1. The regression is wired into both verification chains. No deployed Worker, remote D1 migrations, real PayPal activity or full clean Node 22 release verifier was run. The configuration guard validates only static settings, not account identity, D1 migration execution, secret provisioning, availability or functional payment.

**Still open:** create or select the Cloudflare account's D1 database, fill in the ignored local config, approve any remote usage/costs, apply migrations, deploy the restricted preview and run the signed-out smoke. That preview is not a substitute for genuine PayPal Sandbox acceptance or a full authenticated creator/buyer/payment flow.

Records: [Turn 058](docs/turns/058-p0-restricted-judge-deployment.md), [judge quick start](docs/submission/JUDGE_QUICKSTART.md), [Turn 057](docs/turns/057-p0-hosted-d1-readiness.md).

## Prior completed improvement

Turn 057 closes a hosted judge false-positive: the Worker previously answered `/api/health` with `ok` in Sandbox/judge mode even when no D1 binding existed or the schema had not been migrated. Both `/health` and `/api/health` now require a successful, read-only D1 query proving a representative cross-migration set of fourteen core tables is present in hosted modes. Failures return sanitized `503 persistence_unavailable`. A success explicitly includes `persistence: ready`. Local mode keeps its offline health response without requiring D1.

The signed-out hosted smoke now requires that readiness field, so an older deployment or a Worker reporting only the correct mode cannot pass. Five isolated SQLite-backed readiness regressions and thirteen synthetic HTTP smoke regressions passed under Node 24.22.1. API integration assertions were added to the Vitest collection but the full dependency-backed suite was not run in this environment.

**Still open:** the checked-in `wrangler.jsonc` is local-only and has no D1 binding. This turn did not configure Cloudflare, apply remote migrations, deploy a Worker, exercise real PayPal, run the exact Node 22 release chain or publish anything. The health check does not validate every table column, seeded row or full business journey. Genuine Sandbox acceptance and release gates remain mandatory.

Records: [Turn 057](docs/turns/057-p0-hosted-d1-readiness.md), [judge quick start](docs/submission/JUDGE_QUICKSTART.md), [Turn 056](docs/turns/056-p0-release-bound-public-export.md).

## Prior completed improvement

Turn 056 makes the sanitized one-commit public export depend on a full, passing `pnpm release:verify` record for the exact private source commit. Before copying any tracked source blobs, the exporter now checks the evidence schema, Node 22 and pinned pnpm, clean preflight, committed and working lockfile identities, all four expected successful commands, their saved stdout/stderr SHA-256 values and a nonempty judge rehearsal output directory. A preflight-only record, stale commit, altered log or mismatched lockfile cannot pass.

Eleven isolated Git-fixture tests passed under Node 24.22.1 using explicitly synthetic release records. The original one-commit history rewrite and tree-SHA identity tests remain green. The private export manifest now includes the release verification digest but the public Git tree contains no private evidence file. This is a workflow integrity gate, not independent proof of provider authenticity.

**Still open:** actually run the full clean Node 22 `pnpm release:verify` on the merged candidate, complete genuine PayPal Sandbox invoice/payment/verified webhook, deploy and smoke-test Cloudflare/D1 judge access, create the sanitized public remote, publish the demo video and submit on Devpost.

The current execution environment has Node 24 and no authenticated local checkout of the private GitHub repository. No real PayPal API call, live deployment or full release verification took place in this turn.

Records: [Turn 056](docs/turns/056-p0-release-bound-public-export.md), [public release audit](docs/engineering/PUBLIC_RELEASE_AUDIT.md), [release verification](docs/engineering/RELEASE_CANDIDATE_VERIFICATION.md).

## Prior completed improvement

Turn 055 adds a dependency-free, read-only smoke test for the future hosted Sandbox/judge build. It checks nine real Worker routes without authentication or mutations: API health in Sandbox/judge mode, landing and buyer intake, their client scripts, receipt access and its script, minimized unknown-receipt output, denied legacy creator workspace access and disabled local mock verification. It refuses redirects, unsafe origins, oversized response bodies, unexpected private fields and missing no-store headers. The report saves only sanitized check outcomes under ignored `.data`.

Eleven synthetic-response regressions passed under Node 24.22.1. The new regression is included in both verification chains. This is an operational deployment check prepared for when a real judge URL exists, not proof that a hosted build is already deployed.

**Still open:** full clean Node 22 `pnpm release:verify` on the exact merged commit, genuine PayPal Sandbox invoice/payment/verified webhook, Cloudflare Worker/D1 deployment and signed-out smoke against its real URL, sanitized public export, public video and Devpost submission.

The local execution environment has Node 24 and no authenticated checkout of the private GitHub repository, so it cannot honestly close the exact-commit Node 22 gate. The test suite was run against the exact staged script in disposable fixtures only. No paid API or payment call was made.

Records: [Turn 055](docs/turns/055-p0-hosted-judge-smoke.md), [judge quick start](docs/submission/JUDGE_QUICKSTART.md), [Turn 054](docs/turns/054-p0-credential-free-release-verification.md).

## Prior completed improvement

Turn 054 closes a release-safety gap in the exact-commit verifier. A Git-clean checkout could still contain ignored local `.env.production.local` or `.dev.vars` files, and inherited environment variables could inject paid-provider credentials or change the Vite build. The preflight now refuses those local configuration overrides. Full verification strips known provider credentials, `VITE_*` inputs and Node/npm injection tokens, explicitly forces local/fake mode and disables live application-operation flags.

Seven isolated preflight regression tests passed in disposable Git fixtures under Node 24.22.1, including ignored dotenv/Sandbox config rejection and environment scrubbing. This is a guard for the pending release verification, not proof the full Node 22 gate passed or that any genuine PayPal Sandbox activity occurred.

**Still open:** the clean Node 22 `pnpm release:verify` command, genuine PayPal Sandbox create/send/payment/verified webhook acceptance, deployed Cloudflare/D1 judge build, sanitized public export, public video and Devpost submission.

Records: [Turn 054](docs/turns/054-p0-credential-free-release-verification.md), [release verification](docs/engineering/RELEASE_CANDIDATE_VERIFICATION.md), [Turn 053](docs/turns/053-p0-sandbox-evidence-reconciliation.md).

## Prior completed improvement

Turn 053 adds a read-only reconciliation command for the three sanitized PayPal Sandbox acceptance artifacts: create/send/payable handoff, later paid financial status, and verified webhook. It rejects mixed invoice identities, a merely PAID label without exact USD 425.00 settlement totals, missing signed-webhook verification evidence, missing PayPal API call metadata and obvious sensitive fields in the saved artifacts.

Nine isolated synthetic-evidence tests passed on Node 24.22.1. The command is part of `paypal:verify` and is also asserted against the original acceptance harness's injected provider journey, although the combined Node 22 suite was not rerun here. It makes no network or payment calls and does not authenticate the origin of the JSON evidence. Real Sandbox validation remains mandatory.

**Still open:** the clean Node 22 `pnpm release:verify` gate, genuine Sandbox OAuth/create/send/payment/webhook, Cloudflare/D1 deployment, sanitized public export, signed-out judge demonstration, public video and final Devpost submission.

Records: [Turn 053](docs/turns/053-p0-sandbox-evidence-reconciliation.md), [Sandbox acceptance runbook](docs/paypal/SANDBOX_ACCEPTANCE.md), [ADR 0008](docs/decisions/0008-separate-payment-permission-verification-lifecycles.md).

## Prior completed improvement

Turn 052 closes a release identity gap in the clean-commit preflight. An ignored copy of `pnpm-lock.yaml` could previously pass the existence and clean-status checks, even though the commit did not contain it. Git index flags could also conceal modified lockfile content. The verifier now compares the working file's Git-normalized blob ID against `HEAD:pnpm-lock.yaml` and records both identities.

Four new isolated Git-fixture regressions passed on Node 24.22.1: missing lockfile, ignored uncommitted lockfile, correctly committed lockfile, and modified lockfile hidden by `skip-worktree`. The regression is wired into both verification chains. This verifies the preflight safeguard, not the complete release under its required Node 22 toolchain.

**Still open:** full `pnpm release:verify` from a clean Node 22 checkout of the merged candidate, genuine PayPal Sandbox payment and webhook acceptance, restricted Cloudflare deployment, sanitized public export, working judge access, public demo video and final Devpost submission.

Records: [Turn 052](docs/turns/052-p0-release-lockfile-identity.md), [release verification](docs/engineering/RELEASE_CANDIDATE_VERIFICATION.md), [ADR 0010](docs/decisions/0010-commit-bound-lockfile-release.md).

## Prior completed improvement

Turn 051 commits the pinned `pnpm-lock.yaml` generated with pnpm 12.8.2, repairs strict TypeScript and application-contract errors previously hidden by the dependency-install blocker, and makes the repository lint-clean while keeping security validation, explicit consent and provider boundaries intact.

The isolated Node 22.18.0 / pnpm 12.8.2 temporary verification checkout passed `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm lint`, `pnpm test` (69 Vitest tests), `pnpm build` (TypeScript and both Vite production bundles), `pnpm deploy:dry-run`, `pnpm dataset:verify`, and the complete `pnpm verify` chain. Deterministic regeneration of the 1,440-record synthetic corpus exactly matched all three committed Git blob IDs. No genuine PayPal call, public deployment, live authentication or paid AI provider was used.

The complete `pnpm release:verify` gate is still pending from a clean Git checkout of this merged candidate, as is the real Sandbox create/send/payment/status/webhook acceptance sequence. The private development history remains unsuitable for publication. Use the sanitized one-commit export after freezing and validating the release.

Records: [Turn 051](docs/turns/051-p0-reproducible-release-build.md), [Turn 050](docs/turns/050-p0-public-release-audit.md), [release verification](docs/engineering/RELEASE_CANDIDATE_VERIFICATION.md).

## Prior completed improvement

Turn 050 adds a dependency-free publication audit that scans both the current tracked tree and every reachable Git blob before RightsReceipt becomes public. It detects likely credentials, private-key material, private environment/database/runtime files, non-fixture email addresses and missing release documentation while keeping matched values out of the evidence record.

The audit is now part of `pnpm release:verify` and its regression is part of the standard verification commands. A credential committed and later deleted therefore still blocks release unless the credential is revoked and the private repository history is rewritten.

A connected GitHub tree inspection found 594 tracked blobs and no obvious private-file/path blockers under the audit filename rules.

A separate Git metadata audit found that all 100 development commits expose the same non-fixture author email. The private development repository must therefore stay private. Turn 050 now provides `pnpm public:export`, which creates a fresh one-commit repository using a GitHub noreply identity, requires exact private/public tree-SHA equality and runs the full history-aware audit against the exported repository.

At the Turn 050 checkpoint, the missing `pnpm-lock.yaml` was the first execution blocker. Turn 051 closes that blocker; genuine PayPal Sandbox evidence remains the next external gate.

Records: [Turn 050](docs/turns/050-p0-public-release-audit.md), [public release audit](docs/engineering/PUBLIC_RELEASE_AUDIT.md), [Turn 049](docs/turns/049-p0-paypal-sandbox-acceptance-harness.md).

## Prior completed improvement

Turn 049 removes the next PayPal release bottleneck. The repository now has a Sandbox-only acceptance harness that uses the existing production payment boundaries to create and send the canonical USD 425.00 invoice, restore private journal state, recheck authoritative invoice financial detail after payment, and verify a genuine captured invoicing webhook through PayPal's signature-verification endpoint.

The harness stores private restart material only under ignored `.data` or outside the repository. Published evidence omits credentials, OAuth tokens, buyer/merchant email, raw webhook bodies and transmission signatures. Unknown send outcomes preserve the `started` journal state for later read-only reconciliation rather than authorizing a blind resend.

No real PayPal credentials or external transaction were used during this implementation turn. Gate C remains open until the prepared commands are executed against genuine Sandbox.

At the Turn 049 checkpoint, `pnpm-lock.yaml` was still absent. Turn 051 subsequently generated it and passed the frozen local install.

Records: [Turn 049](docs/turns/049-p0-paypal-sandbox-acceptance-harness.md), [Sandbox acceptance runbook](docs/paypal/SANDBOX_ACCEPTANCE.md), [Turn 048](docs/turns/048-p0-release-candidate-verification.md).

## Prior completed improvement

Turn 048 now has a dependency-free release-candidate verifier. `pnpm release:preflight` checks the exact commit, clean checkout, Node/toolchain pin and lockfile. `pnpm release:verify` then runs the frozen install, complete `pnpm verify` gate and canonical judge rehearsal, writing a minimized evidence bundle under `.data/release-candidate`.

This improvement surfaced a concrete release blocker: **`pnpm-lock.yaml` is absent from the repository.** The clean `--frozen-lockfile` gate cannot pass until the lockfile is generated with the pinned pnpm 12.8.2 and committed. The isolated environment used in this turn could not reach `registry.npmjs.org`, so no lockfile was fabricated.

See [Turn 048](docs/turns/048-p0-release-candidate-verification.md) and [release candidate verification](docs/engineering/RELEASE_CANDIDATE_VERIFICATION.md).

## Prior completed improvement

Turn 047 merged bounded streaming consumption into the shared transaction JSON request helper. Creator/buyer review, clarification and intake responses now use a 262,144-byte decoded ceiling, fixed-capacity accumulation, declared-length checks and early cancellation while preserving the original 15-second request deadline and exact-command recovery semantics.

The first automated PR review found a VM-realm regression in the invoice recovery UI harness. The harness now injects the host `Uint8Array` and `TextDecoder`; the automated re-review completed with zero findings. The exact staged helper also passed an independent Node 22.16.0 VM harness covering normal host Response streaming, the exact byte ceiling, oversized rejection and the compatibility condition.

This turn did not rerun the complete repository regression or installed-library build. Those remain release-candidate gates. No credentials, provider calls, deployment flags, migration or dependency were added.

Records: [Turn 047](docs/turns/047-p0-transaction-json-body-limits.md) and [engineering guide](docs/engineering/TRANSACTION_JSON_BODY_LIMITS.md).

## Prior Turn 046 improvement

Protected receipt HTML and JSON now enforce byte limits while consuming their streams. The prior client rejected an oversized export only after completely buffering its Blob. An isolated prior-revision witness reproduced that behavior with 394,831 unexpected bytes. The new client cancels at the first overflow chunk before the stream finishes, preserving the existing fixed recovery and exact-byte validation.

| Boundary | Resulting behavior |
| --- | --- |
| Decoded JSON body | Nonempty and at most 262,144 bytes, checked before each accepted chunk is copied |
| Decoded HTML body | Nonempty and at most 131,072 bytes, justified by renderer/domain limits and permanent stress regressions |
| Accumulation | Fixed-capacity buffer with no retained list of chunks and no complete-body convenience-method fallback |
| Declared identity length | Valid decimal safe integer, positive and within budget, consistent with cumulative bytes and EOF |
| Encoded response length | Syntax validated separately from decoded byte counts; actual decoded bytes remain capped |
| Overflow or invalid stream | Cancel, abort and clear private access before parsing, hashing or output |
| Close, replacement, lifecycle clearing, deadline or expiry | Cancel/release the active reader; errors or unsettled cancellation cannot block recovery |
| Late response headers/chunks | Cancel obsolete bodies without restoring authority or releasing output |
| Existing receipt validation | Preserve strict media/timing/envelope checks and SHA-256 agreement with exact bytes and the current view |

The HTML budget has a conservative source-reviewed upper bound of 116,128 bytes. Five domain-valid stress fixtures exercise maximum escaped strings, 32 quote rows and 1,024 audit anchors through actual material, issuance, chain and HTTP validation. Their HTML bodies are 84,984 to 85,141 bytes. These cases now permanently guard the client ceiling against renderer/domain changes.

The independent after-change witness uses the same 394,831-byte unexpected JSON response. The client receives five chunks including the first overflow chunk, totaling 327,680 delivered bytes; normal stream prefetch produces 393,216 bytes. The reader is canceled before EOF, with no Blob consumption, client hashing or download. Accepted accumulation remains at most 262,144 bytes. Delivered bytes and prefetch are distinguished from retained memory or heap measurements.

Only the receipt client changed in production. Server authorization, canonical serialization, chain/domain/financial validation and external-operation defaults remain unchanged. The byte limit bounds accepted decoded input; it cannot bound transport buffers or a producer's already allocated oversized chunk. Cancellation does not prove that a server stopped processing or revoke a capability.

## Evidence actually executed

| Check | Result |
| --- | --- |
| Full final native regression | **2,317 passed**, zero failed/skipped/cancelled, across 52 files |
| Expanded deterministic receipt-client collection | **141 passed**, 39 additional cases; included in native total |
| Receipt experience collection | **116 passed**, including five new maximum-field HTML cases; included in native total |
| New receipt streaming browser collection | **165 checks passed**, 15 scenarios |
| Existing receipt response browser collection | **193 checks passed**, 13 scenarios |
| Existing receipt recovery browser collection | **126 checks passed**, 15 scenarios |
| Existing transaction and receipt browser journey | **130 checks passed**, 19 scenarios |
| Existing asset-only intake browser journey | **119 checks passed**, 8 scenarios |
| Combined final browser execution | **733 passed**, 70 scenarios |
| Strict TypeScript 5.8.3 | Transaction/receipt scope passed against actual dependency source |
| All-source TypeScript syntax | **176 files parsed**, no syntax errors |
| Formatting / workspace / diff | Passed; 330 files, 13 packages, 24 internal edges, no cycles |

The full native and five-suite browser runs both verified all 293 source hashes unchanged before and after, fingerprint `d7e0ff934fef774a0f5f8acb63804ffe63b0effe614a1f961b2ae894b3323c4c`. Runtime was Node 22.18.0 and Chromium 140.0.7339.16. Targeted native cases are included in the full native count; development browser checks are not added to final results.

Staged Git whitespace verification then found one extra terminal blank line in the new streaming browser fixture. That single LF was removed; exact byte comparison confirms no other fixture change and all production/native test sources remain unchanged. Tests were not repeated for this formatting-only cleanup. The published source fingerprint is `16ff8bf5dad719b22bb7f174eb2162018c1b046b0983af82ccc654a91941d0a0`; the execution reports retain their actual pre-cleanup fingerprint and script hash. The verification summary records both hashes and the exact change.

Native client coverage uses actual exported code, real WebCrypto and real-stream/controlled-reader cases with synthetic DOM, metadata, clocks and output hooks. It covers exact limits, split UTF-8, empty chunks, early length rejection, truncated/misleading lengths, encoded metadata, malformed/locked bodies, chunked overflow, deadlines, late headers and cancellation that throws, rejects or never settles. Previous response, digest and session boundaries remain exercised.

Browser coverage uses actual transaction/receipt handlers, canonical SQLite services and issuance. Initial requests, reviewed terms and quotes are synthetic setup; gateway/provider responses are injected. Stream faults use controlled browser readers over actual handler bytes or explicitly labeled padded content. Paired digest injection isolates valid envelope/size tests. Compressed-response metadata does not claim real compression verification. Receipt action scenarios add zero provider calls or database writes after setup.

The first streaming browser development attempt found a fixture reentry error after a successful size case. The fixture now closes the current view before new entry; the sanitized initial report is retained and its ten partial checks are excluded. Intermediate native fixture expectations were corrected to count UTF-8 bytes. A scratch runner syntax error stopped initial orchestration before any collection began; corrected runners completed all final checks. These setup issues required no production change.

Final mobile overflow recovery and desktop pending controls were visually inspected. Empty entry and fixed recovery copy remain readable without horizontal overflow, Close stays enabled, and output actions are disabled while pending. Unchanged creator/buyer/clarification/deadline browser collections and older receipt smoke/layout scripts were not rerun. No deployed-runtime, live-service, screen-reader or whole-application audit is claimed.

Records: [Turn 046](docs/turns/046-p0-receipt-body-limits.md), [engineering guide](docs/engineering/RECEIPT_BODY_LIMITS.md), [verification summary](docs/evidence/turn046/verification.json), [before-change witness](docs/evidence/turn046/receipt-body-buffering-baseline.json), [after-change witness](docs/evidence/turn046/receipt-body-streaming-witness.json), [HTML budget](docs/evidence/turn046/receipt-html-bound.json), [native results](docs/evidence/turn046/native-regression.json) and [browser regression](docs/evidence/turn046/browser-regression.json).

## Repeatable local rehearsal

The one-command canonical rehearsal remains available:

```bash
node scripts/judge-rehearsal.mjs
```

With Node 22.13 through 22.x, it requires no package installation, credentials or prepared case. It runs three canonical handler journeys, verifies populated resets and produces an offline report. Its journey/report/isolation collections are included in the full native regression. See the [local rehearsal guide](docs/engineering/LOCAL_JUDGE_REHEARSAL.md) for the $425 quote, scheduled receipt, exact reset and evidence boundaries.

The native receipt collections remain included in `pnpm receipt:experience:verify`. The new focused command is `pnpm receipt:stream:browser`; response and recovery browser commands remain available. Browser commands require local Playwright/Chromium; the [body limit guide](docs/engineering/RECEIPT_BODY_LIMITS.md) documents direct commands and selectors. Existing buyer, creator, deadline, transaction and rehearsal commands remain available.

## Prior work and deferred scope

| Work | Current status |
| --- | --- |
| Turns 001-012 | Product/domain design, local assets/request/human terms/pricing |
| Turn 013 / Gate A | Explicit simulated transaction; original full mock review gate remains open |
| Turns 014-020 / Gate B | Source-grounded extraction and diagnostic model; unsafe held-out outputs prohibit automatic learned rights resolution |
| Turns 021-027 / Gate C | Sandbox transport, notifications/recovery and financial lifecycle; genuine provider gate open |
| Turns 028-030 | Canonical receipts, protected/public views, exports and UTC transitions; defaults off |
| Slot 031 P0 | Durable creator decisions and buyer acceptance |
| Slot 032 P0 | Canonical creation reservation and provider-ID binding |
| Slot 033 P0 | Draft adoption, explicit authorized sending and reconciliation handoff |
| Slot 034 P0 | Managed creator assertion verifier, workspace authority and creator-review page |
| Slot 035 P0 | Buyer acceptance screen, authenticated invoice controls, dispatch fixes and integrated browser evidence |
| Slot 036 P0 | Fresh payment handoff, current receipt/status navigation and local payment/refund receipt continuity |
| Slot 037 P0 | Persisted clarification evidence, explicit human re-review, renewed consent and receipt-compatible provenance |
| Slot 038 P0 | Authenticated link issuance, immutable private intake, original-link continuation and asset-only setup through canonical receipt |
| Slot 039 P0 | Authenticated recovery for reserved operations, retained draft IDs and uncertain delivery without duplicate provider writes |
| Slot 040 P0 | One-command canonical judge rehearsal, populated resets, retired-access checks and a minimized offline report |
| Slot 041 P0 | Six-page keyboard and form recovery, linked field errors, focus ownership through pending expiry and private decision-text clearing |
| Slot 042 P0 | Per-request browser deadlines, exact uncertain-write recovery, late-result rejection and unread child-response cleanup |
| Slot 043 P0 | Complete buyer locking after terminal acceptance errors, deliberate private-code reentry and preserved exact uncertain-write recovery |
| Slot 044 P0 | Receipt request/session ownership, pending Close and code replacement, complete-body deadlines and current print/export authority |
| Slot 045 P0 | Protected response metadata, strict timing/envelope validation and exact export-byte SHA-256 binding within owned cancellation/deadlines |
| Slot 046 P0 | Bounded decoded receipt streams, declared-length validation, early reader cancellation and permanent maximum-field HTML budget regression |\n| Slot 047 P0 | Bounded shared transaction JSON streams, declared-length validation, cancellation and recovery-harness compatibility |
| Slot 048 P0 | Release-candidate preflight, evidence capture and explicit clean-install lockfile gate |
| Slot 049 P0 | Genuine Sandbox acceptance harness, paid-state recheck, webhook verification and sanitized evidence |
| Slot 050 P0 | History-aware public-repository audit, secret/private-artifact scanning and release-gate integration |
| Slot 051 P0 | Pinned pnpm lockfile, full local verify, build/lint repair and Worker deployment dry run |
| Original dashboard/agent turns | Deferred, not complete |
| Original full UX/security audits | Deferred/incomplete; targeted integration and review do not replace them |

## Runtime and remaining gates

Schema version 9, nine migrations and 33 domain tables remain current. No migration, database change, dependency or workspace package was added. All external runtime flags remain false; merchant identity values remain blank.

The pinned local frozen installation, TypeScript 5.9.3 typecheck, ESLint, Vitest, full Vite build, Wrangler dry run and complete `pnpm verify` command passed under Node 22.18.0 and pnpm 12.8.2 in an isolated temporary checkout. This does not substitute for `pnpm release:verify` on a clean Git checkout of the exact merged release commit. Injected gateway and provider fixtures do not close genuine managed-session, Sandbox payment/refund/webhook or deployed Worker/D1 gates. Public judge access, video and submission materials remain separate work.

The next work is release acceptance on an exact frozen commit: run the clean-checkout preflight, preserve genuine PayPal Sandbox OAuth/invoice/status/webhook evidence, deploy the gated Cloudflare Worker/D1 path, then produce and publish the sanitized one-commit judge repository with its video and submission assets.

No real credentials, customer email, payment, paid service, GitHub Actions, deployment or remote schedule was used. Receipt hashes remain unsigned integrity checks rather than ownership proofs. Human authority, deterministic pricing and exact accepted versions remain mandatory in the product.

