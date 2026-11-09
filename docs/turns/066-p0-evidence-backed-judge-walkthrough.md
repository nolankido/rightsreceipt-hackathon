# Turn 066: Evidence-backed no-login judge walkthrough

## Problem

The restricted Worker already served an honest read-only `GET /judge` tour. It listed the canonical synthetic scenario and five authority checkpoints, but did not show reviewers what the terms, deterministic quote calculation or receipt-state boundaries look like. A hackathon judge arriving without credentials could read the architecture but not inspect concrete evidence. The preview still cannot issue buyer capabilities or run genuine PayPal Sandbox operations.

## Improvement

The public no-login tour now adds three semantic, keyboard-accessible evidence sections with in-page jump links:

1. **Reviewed rights:** a brief paraphrase of the seeded buyer request plus a native `details` disclosure of all twelve resolved rights, including paid Instagram/Facebook, US/Canada, November 1 start, 90 days, 500,000 impressions, non-exclusivity, crop-only modification, and no sublicensing or AI use. It clearly identifies `manual-review-v1` human-corrected terms. No learned model is called by this static page, and the original synthetic private request is not printed.
2. **Deterministic quote:** a semantic table with the five actual versioned policy lines from `seed/demo-reset.sql`: $200 base digital commercial, $100 paid social, $50 US/Canada, $50 31-to-90-day duration and $25 crop permission. Total USD 425.00, calculated from integer cents, with neither AI nor the browser choosing a price.
3. **Local state trail:** an offline timeline separating creator approval, buyer acceptance, injected provider create/send, an injected PAID label, reconciliation, and a scheduled permission receipt. It explicitly states that the local fixture clock is October 27, 2026, before the November 1 license start, to prevent a misleading current-day inference.

The page still contains no JavaScript, forms, private capability, payment identifier, buyer contact, real payment proof or outbound request. It retains the original per-request CSP nonce, strict privacy and no-indexing headers, GET-only routing, and sanitization of query/method failures. The new UI is responsive and print-friendly, with semantic headings, lists, table headers and native disclosure.

The signed-out hosted smoke retains eleven read-only probes but now requires the three evidence markers, the exact `42500`-cent total marker and the human-review source label. A stale text-only `/judge` page or a visibly incorrect quote is a failed launch gate.

## Source provenance

- `scripts/support/judge-rehearsal-journey.mjs`: the 12 human-corrected rights, manual-review provenance, local provider and receipt sequence.
- `scripts/support/human-consent-fixture.mjs`: the October 27, 2026 rehearsal clock.
- `seed/demo-reset.sql`: fixed seed creator, asset, buyer organization and policy version 1.
- `packages/pricing/src/index.ts`: line-selection rules and integer-cent computation.

The canonical private request and contact details remain outside the public tour, even though the underlying rehearsal fixture is synthetic.

## Changed files

- `apps/api/src/judge-tour.ts`: three evidence panels and responsive/print styles.
- `scripts/judge-tour-local.test.mjs`: source-pinned quote/rights and privacy checks.
- `scripts/hosted-judge-smoke.mjs` and `scripts/hosted-judge-smoke-local.test.mjs`: stronger live page evidence contract with stale/inaccurate-page regressions.
- `README.md`, `PROJECT_STATUS.md`, `JUDGES.md`, `docs/submission/JUDGE_QUICKSTART.md`: updated judge path and scope boundaries.

## Verification

- Eight isolated native judge-route tests passed under Node 24.22.1, including exact five-line quote agreement with the SQL seed, all twelve source rights, fixture-clock and human-review provenance, privacy omissions, semantic HTML, CSP, read-only methods and Worker wiring.
- Twenty-six isolated hosted-smoke tests passed under Node 24.22.1, including cases where rights, quote, state evidence or `42500`-cent quote marker was missing or altered.
- All tests used in-memory source modules and mocked HTTP requests. The checked-in demo SVG was read and confirmed to exist.

No clean pinned Node 22 full `pnpm verify`, dependency-backed build, actual browser screenshot, Cloudflare Worker/D1 operation, live hosted smoke or genuine PayPal Sandbox payment was run here.

## Remaining P0 gates

This is still a **synthetic explanatory walkthrough**, not an authenticated live purchase, AI-inference sample or proof of paid permission. Before submission: clean Node 22 release verification, approved remote D1/Worker and live eleven-probe smoke, genuine PayPal Sandbox create/send/payment/verified-webhook evidence, authenticated demo, sanitized one-commit public export, video and Devpost submission. Never publish the private Git history or present injected provider responses as PayPal.
