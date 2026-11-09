# Turn 018: Evaluate, Calibrate, and Document the Model

**Priority:** P0
**Date:** October 26, 2026 HST
**Result:** Completed local evaluation, read-only gating, and documentation. Model failed the held-out safety criterion and is NOT approved for automatic rights resolution.

## Completed work

- Evaluated twelve model heads against all 240 validation requests and 2,880 field labels from the committed corpus.
- Selected and froze twelve score-margin thresholds using validation data only, with SHA-256 binding to the exact model artifact and dataset.
- Opened the 240-record held-out split only after freezing those thresholds. No post-test tuning took place.
- Logged 17 raw incorrect resolved predictions and three that still passed the frozen margin gates.
- Added a strict TypeScript policy verifier and diagnostic selector that never promotes a model guess to an authorized resolved right.
- Added reproducible native Node evaluation and safety-regression test commands.
- Recorded detailed field counts, failure IDs, calibration caveats, and a model card.

## Observed results

Validation: 2,851/2,880 raw exact fields, 26 false resolved; 2,302 diagnostic candidates after selection, with no errors on fitted validation cases.

Held-out: 2,855/2,880 raw exact fields; 17 incorrect resolved. Frozen thresholds selected 2,303 review candidates including **three incorrect ones**: rrs-10-02-06 (impressions), rrs-10-02-10 and rrs-11-02-10 (sublicensing). All three involved contradictory terms. Twelve synthetic injection pairs retained matched selections, but this is not broad adversarial robustness.

## Local checks

The working source passed strict TypeScript validation and 17 native calibration safety tests. The prior portable inference test suite passed eight of eight, for a total of 25 native tests with no failures. The GitHub-held validation and held-out data were scored in the current turn and identified by their Git blob SHAs.

The Node evaluator is committed for repeatable scoring against the complete checked-in JSONL corpus. Full pnpm, Vitest, Worker build, and browser acceptance remain blocked under Turn 007 and Gate A. Do not claim a live Cloudflare D1 or PayPal test.

## Requirements

RR-P0-036: Validation-selected thresholds exist but probability calibration and model readiness do not pass.
RR-P0-037: Review-only abstention now fails closed for all learned fields.
RR-P0-038: Fixed synthetic injection-pair comparison completed, adversarial readiness remains open.
RR-P0-039: AI continues to have no money, consent, invoice or permission authority.
RR-P0-001: Clean dependency install and root verification remain blocked.

## Decision and next work

Hold the learned classifier to diagnostic review only. Turn 019 must combine it with deterministic extraction, exact UTF-16 source spans and conflict detection before any human-facing extraction proposal can be saved. Do not tune against the consumed held-out examples. The existing Gate A browser blocker remains open.
