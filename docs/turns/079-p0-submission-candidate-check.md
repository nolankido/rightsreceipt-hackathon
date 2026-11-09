# Turn 079: Fail-closed offline submission-candidate evidence check

## P0 problem

RightsReceipt had separate release-candidate verification, sanitized single-commit public export and PayPal Sandbox acceptance evidence reconciliation, but no final command connecting those artifacts to the same frozen private source commit and the proposed public links. Existing submission instructions listed the release blockers without a machine-readable local consistency verdict. An operator could mistakenly combine artifacts from different revisions or confuse locally generated JSON with actual provider/public submission evidence.

## Completed implementation

- Added `scripts/submission-candidate-check.mjs`, a dependency-free read-only command for a private `.data/submission-candidate.json` manifest. It reads only regular files within the ignored private data tree and emits fixed, sanitized blocker codes.
- It requires full, successful Node 22.13+ and pinned pnpm 12.8.2 release evidence for the exact current Git HEAD, clean checkout, full four-step verification record and judge rehearsal result. Preflight-only runs never pass.
- It requires a successful sanitized one-commit public export manifest bound to the exact current Git commit/tree and the SHA-256 of the release evidence file. The resulting public commit must differ from the private development commit, and the authorized GitHub noreply author identity must match.
- It reruns the existing internal PayPal Sandbox acceptance evidence reconciler on the three sanitized create/paid/webhook files; a missing or failed reconciliation blocks submission consistency.
- It rejects the private development repository URL, counterfeit GitHub hosts, ambiguous repository placeholders and unsupported YouTube/playlist links. URLs are checked for shape, not externally verified.
- Even with consistent local records and plausible URLs, it reports `status: local_records_consistent_external_checks_required` and `readyForSubmission: false`. It never claims actual provider authenticity, public video availability/duration, anonymous GitHub access or Devpost submission.
- Added a standalone `pnpm submission:candidate:check` command, `pnpm submission:candidate:verify` test command, and wired the regression suite into `pnpm public:export:verify`, already part of the standard clean release unit verification.
- Updated the main README, status and submission index, and added `docs/submission/SUBMISSION_CANDIDATE_CHECK.md` with private manifest example, operator commands and explicit external verification boundaries.

## Tests actually run

Nine focused Node 22.16.0 regression tests passed on the exact new source and test files. They cover locally consistent but never submission-approved results, missing manifest and dirty checkout, incorrect release evidence or Node version, mismatched public-export tree/commit/hash, forbidden private repository and deceptive GitHub URLs, invalid YouTube URLs, failed Sandbox reconciliation, sanitized CLI output, and a temporary real local Git repository binding test.

The original larger local scratch suite had also passed fourteen tests during an earlier iteration, but only the finalized nine-test file is staged for the repository. The Git blob SHA-1s of both finalized files were checked against the locally executed bytes. No full installed-dependency release verification, actual provider Sandbox payment, public repository publication, public video inspection or Devpost submission was performed.

## Release boundary

The new gate is intentionally a post-release consistency checker, not a replacement for real external evidence. Do not run its actual candidate check during the clean source build before artifacts exist. Only its focused regression suite is included in `pnpm verify`. An offline check cannot prove that private JSON came from PayPal, that a plausible video URL is public, or that the Devpost form accepted submission.

**Still blocked:** genuine PayPal Sandbox invoice/send/buyer payment/paid GET/verified webhook, exact clean Node 22 `pnpm release:verify`, sanitized public one-commit repository, public functioning YouTube demo under three minutes, and Devpost submission. No paid APIs, production PayPal, Cloudflare deployment, public repo creation, GitHub Actions or cron were used in this turn.
