# Submission Documentation

This directory contains the PayPal AI Hackathon release and submission packet.

## Current working documents

- [Turn 145 offline Sandbox setup handoff](../turns/145-p0-sandbox-local-setup-handoff.md) - a value-free local configuration check, exact missing variable names, new clean-release proof and the remaining genuine Sandbox gate.
- [Turn 143 physical Sandbox output path guard](../turns/143-p0-sandbox-private-output-symlink-guard.md) - rejects custom output aliases or directory links into tracked source before an invoice can be created, protecting private state and buyer handoff files.
- [Turn 142 independent anonymous all-refs gate](../turns/142-p0-anonymous-public-all-refs-gate.md) - the repeatable signed-out GitHub source check now rejects any extra advertised ref, incomplete API pages, or a wrong main reference, closing the post-push verification gap.
- [Turn 141 post-push remote-ref verification](../turns/141-p0-post-push-public-refs-verification.md) - even after a successful creation-only push, a newly appeared unrelated ref or an unavailable all-refs read must leave publication verification pending, never green.
- [Turn 140 invalid final-video geometry gate](../turns/140-p0-invalid-demo-video-dimensions.md) - an MP4 video track with zero or subpixel frame dimensions now blocks the offline submission preflight instead of receiving only a low-resolution advisory.
- [Turn 139 forced release timeout termination](../turns/139-p0-release-timeout-forced-termination.md) - timed-out inner verification stages and the outer clean checkout no longer rely on catchable SIGTERM, with a real ignored-signal regression and explicit Windows descendant-process caveat.
- [Turn 138 rendered Devpost copy and duplicate-section gate](../turns/138-p0-devpost-rendered-copy-and-duplicate-gate.md) - headings and links hidden in code fences or HTML comments no longer count as submission content, and conflicting duplicate required sections now block copy readiness.
- [Turn 137 exact sanitized export identity gate](../turns/137-p0-clean-export-refs-and-author-gate.md) - the clean release wrapper now checks the actual one-branch public refs and noreply author/committer before reporting a passing private public export.
- [Turn 136 strict Sandbox paid-stage outcomes](../turns/136-p0-sandbox-paid-status-fail-closed.md) - an unpaid status read now reports payment pending while retaining the private buyer link; a bare PAID label cannot turn the financial stage green without matching settlement details.
- [Turn 135 full remote reference pre-push gate](../turns/135-p0-public-destination-all-refs-preflight.md) - refuses publication into repositories that contain notes, replace or custom refs even if no branch or tag exists; real Git regression proved the old gap.
- [Turn 134 fail-closed local AI model diagnostic](../turns/134-p0-judge-model-timeout-fail-closed.md) - the separate actual-model browser route can no longer hang when a timed-out child never closes, and failed attempts can be retried without exposing internal output.
- [Turn 133 fail-closed judge worker timeout](../turns/133-p0-judge-worker-timeout-fail-closed.md) - a late zero-exit or oversized child response cannot turn a timed-out local rehearsal into accepted evidence; focused regression added to the standard judge verifier.
- [Turn 132 responsive local judge progress](../turns/132-p1-judge-console-responsive-progress.md) - immediate browser redirect, secure running state, bounded polling and no evidence links before a validated result.
- [Turn 131 one-run safe and private handoff](../turns/131-p0-one-run-safe-private-release-handoff.md) - run the shareable diagnostic and audited private public export together, with path-free stdout and a separate exclusive private result retaining exact handoff paths.
- [Turn 130 stage-log integrity gate](../turns/130-p0-full-release-log-hash-integrity.md) - a claimed clean release now requires all eight original bounded stdout/stderr logs to match the saved SHA-256 digests; missing, redirected or altered logs fail closed.
- [Turn 129 full-release evidence completeness gate](../turns/129-p0-complete-clean-release-stage-evidence.md) - prevents an otherwise well-formed but empty or mismatched passing release record from authorizing a green clean-checkout result; tests the four canonical stages and judge marker.
- [Turn 128 path-free clean-release diagnostic handoff](../turns/128-p0-shareable-clean-release-handoff.md) - adds a full-release `--shareable` mode so a Windows operator can provide safe failure-stage JSON for remote triage without publishing private checkout or evidence paths.
- [Turn 127 Devpost AI proof and claims alignment](../turns/127-p0-devpost-ai-proof-claim-alignment.md) - updates the final judge copy, source-bound model-proof command, simulated-payment wording and preflight regression coverage before external publication.
- [Turn 126 mandatory actual-model release proof](../turns/126-p0-mandatory-ai-proof-release-gate.md) - integrates the existing real AI diagnostic into both release verification paths, tests standalone execution and ensures safe CLI failure output.
- [Turn 125 executable local AI proof](../turns/125-p0-local-ai-submission-proof.md) - one-command, read-only checked-in model inference proof, six focused regression tests and explicit non-payment limitations.
- [Turn 124 strict paid-webhook acceptance](../turns/124-p0-strict-paid-webhook-acceptance.md) - prevents a correctly signed but unpaid, partial or unbound webhook from yielding a successful CLI acceptance stage; confirms mocked regression scope and remaining live release gates.
- [Judge evidence matrix and filming handoff](JUDGING_EVIDENCE_MATRIX.md) - official Stage One requirements, five equally weighted judging criteria, exact screen-to-claim proof sources and honest Sandbox versus simulation narration branches.
- [Turn 144 completed clean release and private export](../turns/144-p0-complete-clean-release.md) - verified frozen candidate, observed blocker repairs, preserved evidence and the next Sandbox gate.
- [November 7 readiness evaluation](READINESS_EVALUATION_2026-11-07.md) - submission requirements, effort estimates and the five completion gates; the local release gate subsequently closed in Turn 144.
- [November 4 readiness evaluation](READINESS_EVALUATION_2026-11-04.md) - earlier cutover plan and historical checkpoints.
- [Final cutover and evidence checklist](FINAL_CUTOVER_CHECKLIST.md) - chronological P0 execution gates, contingency decisions, signed-out checks, and an evidence ledger.
- [Turn 102 expanded provider-token detection](../turns/102-p0-expanded-public-token-detection.md) - closes GitHub App/OAuth and additional API key scanning gaps; seven exact-source Node tests and eight scanner replay checks passed.
- [Turn 101 public-audit fixture release repair](../turns/101-p0-public-audit-fixture-release-blockers.md) - updates real financial test fixtures and adds a synthetic Git snapshot regression without relaxing secret detection; source-level scans of ten edited files found no issues.
- [Turn 100 public-source fixture bypass correction](../turns/100-p0-public-audit-fixture-bypass.md) - removes broad secret fixture exemptions from publication audit; five focused Node tests and production scanner replay passed.
- [Turn 099 real collector integration and test repair](../turns/099-p0-real-webhook-collector-integration.md) - fixes a missing `writeFileSync` test import, adds actual collector/preflight integration and records 51 matching-source Node tests passing.
- [Turn 098 live local collector preflight](../turns/098-p0-live-webhook-collector-preflight.md) - checks that the current private one-shot webhook listener actually responds before Sandbox OAuth or invoice creation; 15 source-matched focused Node tests passed.
- [Turn 097 private webhook-route preflight](../turns/097-p0-private-webhook-route-preflight.md) - derives the exact registered Sandbox callback from the one-shot collector's private route file; 30 focused Node tests passed.
- [Turn 096 Sandbox acceptance fixture repair](../turns/096-p0-sandbox-evidence-fixture-repair.md) - restores compatibility with the exact webhook callback requirement and verifies 17 focused Node tests, while retaining full release as an open gate.
- [Turn 095 exact Sandbox webhook callback preflight](../turns/095-p0-exact-sandbox-webhook-callback-preflight.md) - prevents an outdated registered callback from passing the real invoice preflight; integrated acceptance test fixtures still need review.
- [Turn 094 verified real model references and contradiction warning](../turns/094-p0-real-model-reference-and-contradiction.md) - independently reproduces 72 trained-model reference labels/scores and adds an explicit human-review alert to the executable demo.
- [Turn 093 verified AI identity binding](../turns/093-p0-model-identity-binding.md) - model identity is sourced from the checked artifact, with two predictions rather than four and fail-closed drift checks.
- [Turn 092 executable actual-model judge demo](../turns/092-p0-executable-local-ai-judge-demo.md) - adds a local browser route that runs the bundled learned classifier separately from the simulated financial journey, and extends release smoke coverage.
- [Turn 091 AI disclosure and video truth audit](../turns/091-p0-submission-ai-disclosure-and-demo.md) - names actual trained-model tools in Devpost and requires real inference rather than implying the simulated judge console proves AI or PayPal settlement.
- [Turn 090 exact judge HTML evidence gate](../turns/090-p0-exact-judge-report-integrity.md) - binds published local report HTML to the canonical validated rehearsal JSON byte-for-byte.
- [Turn 089 public-export evidence check](../turns/089-p0-public-export-judge-evidence.md) - requires canonical judge evidence at the one-commit export boundary and documents verification limits.
- [Turn 088 canonical judge-evidence improvement](../turns/088-p0-canonical-judge-release-evidence.md) - release gate now requires full semantic journey and reset verification, not abbreviated success metadata.
- [Turn 087 full release verifier fix](../turns/087-p0-release-verifier-judge-integrity.md) - full release pass now requires validated source-bound judge artifacts, with 13 focused Node 22 tests.
- [Turn 086 source-bound judge evidence receipt](../turns/086-p0-source-bound-judge-evidence.md) - validates the actual three-journey release output, exact source identity, and simulated-payment labeling.
- [Turn 085 release-evidence integrity receipt](../turns/085-p0-release-evidence-integrity.md) - final checker now validates release command logs and judge artifacts with the public-export validator.
- [Turn 084 improvement receipt](../turns/084-p0-submission-execution-checklist.md) - rationale and verification boundary for the operator checklist.
- [Turn 083 improvement receipt](../turns/083-p0-submission-cutover-and-webhook-order.md) - judge-first README and corrected pre-payment webhook instructions.
- [Release readiness audit](RELEASE_READINESS_AUDIT_2026-10-29.md) - official requirements mapped to current blockers and the recommended release sequence.
- [Devpost draft](DEVPOST_DRAFT.md) - project description, PayPal/AI framing, accomplishments, tools and release placeholders.
- [Devpost copy preflight](DEVPOST_COPY_QA.md) - run `node scripts/devpost-copy-preflight.mjs` to block missing submission sections, placeholder public links and malformed GitHub/YouTube URLs before manually copying the final entry; this is not proof of publication.
- [Final video storyboard](VIDEO_STORYBOARD.md) - a 2:35 to 2:50 demonstration plan designed to stay under the contest's three-minute limit.
- [Final MP4 release QA](VIDEO_RELEASE_QA.md) - dependency-free read-only duration, audio-track and video-track checks before manual review and signed-out YouTube playback.
- [Judge quick start](JUDGE_QUICKSTART.md) - hosted and local evaluation paths, canonical scenario and limitations, including the read-only signed-out deployment smoke command.
- [Public repository preflight](PUBLIC_REPO_PREFLIGHT.md) - preliminary credential/privacy review and publication gate.
- [Anonymous public GitHub release check](ANONYMOUS_PUBLIC_GITHUB_CHECK.md) - confirms the exact sanitized public commit, GitHub-detected MIT license and only the audited main Git ref through four unauthenticated API reads after publication.
- [Offline submission-candidate gate](SUBMISSION_CANDIDATE_CHECK.md) - check exact local release, sanitized one-commit export, private Sandbox acceptance records and proposed public URLs without claiming external submission readiness.

## Functional local evaluation path

For a short supplemental proof that runs the checked-in trained model without launching the browser, use `pnpm judge:ai:proof` after installing the pinned dependencies or `node --no-warnings --experimental-strip-types scripts/judge-ai-proof.mjs` directly. Both `pnpm judge:ai:proof:verify` and the proof command now execute within the mandatory `judge:console:verify` release path. The JSON reports a verified model hash, two project-authored synthetic cases, 24 rights-field comparisons and a human-review contradiction warning. It explicitly says payment evidence is none. This is not a replacement for the working browser demo or real Sandbox acceptance.

The official rules allow an executable local build in place of a hosted URL. The new `node scripts/judge-local-console.mjs` route gives judges a browser-based launch action for the real application-handler rehearsal using injected PayPal-like responses. It is not itself proof of genuine Sandbox integration or the production UI. The finished public repo must include that command, Node 22 requirements, and accurate limitations. A public YouTube video of actual functioning product behavior remains mandatory; a static storyboard or synthetic-only presentation is insufficient.

## Final evidence still required

The post-release local consistency check is `pnpm submission:candidate:check` using a private manifest under ignored `.data`. A passing local check **does not** approve submission: it still reports `readyForSubmission: false` until genuine PayPal evidence and independent public GitHub, YouTube and Devpost checks are completed. See the [gate instructions](SUBMISSION_CANDIDATE_CHECK.md).

Before submission this directory should also contain or link to:

- hosted signed-out smoke evidence, only if an optional hosted demo is deployed;
- final public repository URL and release commit/tag;
- genuine PayPal Sandbox evidence summary;
- hosted demo URL, if used;
- final public YouTube URL;
- open-source and third-party license review;
- signed-out link verification;
- final submission confirmation and archived identifiers.

The active contest rules and Devpost form must be checked again before release. Draft copy must never claim functionality that the release commit does not provide.
