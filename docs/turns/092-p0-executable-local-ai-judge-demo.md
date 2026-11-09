# Turn 092: executable learned AI exhibit for hackathon judges

**Date:** November 4, 2026
**Priority:** P0, demonstrate meaningful real AI use to Stage One judges
**Status:** Implemented in source; focused unit tests passed; full private-checkout release not yet verified

## Evidence gap

The no-install localhost judge console could exercise the actual licensing handlers, invoice recovery and receipt lifecycle, but all people and PayPal responses were injected. It did not execute RightsReceipt's trained AI model. The Devpost/video drafts therefore needed a separate route to demonstrate that the supervised lexical component actually runs, rather than presenting the deterministic rule-based extractor as AI.

## What changed

1. Created `scripts/judge-ai-demo.mjs`. In a credential-free Node 22 child process, it loads the committed lexical model artifact, verifies its SHA-256 against the committed model training report, and invokes the actual portable TypeScript learned-model implementation. It also runs the separate deterministic source-span extractor. It displays side-by-side results for a fully stated synthetic rights request and a deliberately contradictory synthetic request, twelve fields per example.
2. It labels learned outputs **uncalibrated review-only**, displays source text only for the deterministic extractor, and refuses to render results that claim quote or payment authority, violate the canonical field contract, or contain invalid source spans. The report uses escaped HTML, an inline-CSS SHA-256 CSP and no executable scripts, user-provided data, network connections, PayPal calls, external fonts or paid APIs.
3. `scripts/judge-local-console.mjs` now serves `GET /model`, running the diagnostic as a credential-stripped Node 22 `--experimental-strip-types` child. It limits execution and output size, validates the returned HTML/CSP, caches a successful result, and returns a fixed HTTP 503 if the model cannot run.
4. `scripts/support/judge-console-page.mjs` adds an accessible **Run read-only AI diagnostic** link, separate from the existing **Run application rehearsal**. The prominent simulated-payment warning remains.
5. `scripts/judge-console-real-smoke.mjs` now exercises the actual `/model` route as part of the release smoke and checks both case labels, the 24 result rows, real artifact digest display, no-authority statement and restrictive HTTP security headers. It reports `aiEvidence: real_local_classifier_on_synthetic_only` alongside `paymentEvidence: simulated_only`.
6. Added `scripts/judge-ai-demo.test.mjs` and regression coverage in the judge console and smoke tests. The `judge:console:verify` package script now runs the AI unit suite before the real-worker smoke. The full pinned release verifier therefore exercises the new component when running normally.
7. Updated `README.md`, `JUDGES.md`, the judge quick start, video storyboard and Devpost draft to distinguish actual learned inference from the simulated financial workflow.

## What was actually verified

- Ran `node --test scripts/judge-ai-demo.test.mjs` against the authored new standalone module on **Node 22.16.0**: **7 tests passed**, 0 failed. Tests exercise SHA-256 mismatch rejection, authority restrictions, source offset bounds, exact twelve-field ordering, HTML escaping, and the no-assets `--help` path. The tests use an injected synthetic model fixture and are not a live inference demonstration of the committed production artifact.
- Retrieved and cross-referenced the committed `data/model/v1/artifact.json` and `training-report.json` through the private GitHub connector: 12 named field heads, 768 lexical features, encoded int16 model weights and a trusted training artifact digest are present and structured as the new loader expects.
- Checked the GitHub-saved edited JavaScript modules and regression tests for syntax after normalizing ESM imports in a static V8 compile check.
- **Not run:** the actual bundled-artifact model process in the complete repository, the new local HTTP integration tests, `pnpm judge:console:smoke`, `pnpm release:verify`, genuine PayPal Sandbox acceptance, remote deployment, YouTube or Devpost submission. The container cannot clone the private repository or download the pinned pnpm package. Do not claim complete functional release from these partial checks.

## Next P0 work

1. On a clean checkout of the current private main, with Node 22.13+ and pnpm 12.8.2, run `pnpm judge:console:verify` and `pnpm release:verify`. The smoke must prove the actual trained-model route and actual application-handler rehearsal work together and are clearly distinguished.
2. Complete genuine Sandbox OAuth/create/send with a different buyer account, authenticated PAID GET and a matching signed invoice-paid webhook, keeping all secrets and private links out of Git and videos.
3. Produce and anonymously verify the separate sanitized public repository. Record functioning footage of `/model` and the transactions, labeling the provider simulation or genuine Sandbox footage accurately.
4. Upload the public under-three-minute YouTube demo, finish required Devpost fields and **submit** before the **November 9, 2026 3:00 p.m. Eastern** internal target, ahead of the November 12 official deadline.

No GitHub Actions or cron, paid APIs, production PayPal operations, repository visibility changes or external submissions were initiated in this turn.
