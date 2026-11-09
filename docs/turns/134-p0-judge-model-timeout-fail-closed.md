# Turn 134: fail-closed local AI model diagnostic timeout

**Date:** November 6, 2026  
**Scope:** P0 functional judge AI exhibit reliability, no PayPal or external publication  
**Submission status:** NOT READY

## Problem

The read-only `/model` route invokes a credential-stripped Node child that loads the actual bundled lexical classifier and source-backed extractor. Its 20-second watchdog and 128 KiB output cap previously called `kill()` but waited for `close` before settling the route. If a killed child never closed, the browser could wait indefinitely. Child error also only set a flag without resolving the promise. Later data could continue accumulating after the cap was exceeded. This is a code-path reliability gap, not evidence that the real model failed in a complete Node 22 checkout.

## Change

- `runModelDiagnostic` now has idempotent, bounded settlement. A deadline, oversized result or child error **rejects before attempting termination**, so synchronous and late `close(0)` events cannot turn an aborted diagnostic into accepted HTML.
- No further output is accumulated after failure. A child that never emits `close` cannot hold the route indefinitely. The existing strict content/CSP validation still determines whether successful child output can be served.
- The HTTP `/model` route retains its fixed 503 response on failure, clears the failed cached promise and permits another explicit reviewer attempt without disclosing child output, credentials or internal paths.
- Added six independent `scripts/judge-model-launcher.test.mjs` child-process regressions and one browser HTTP retry regression in `scripts/judge-local-console-local.test.mjs`. The standalone model-launcher suite is now included in the mandatory `judge:console:verify` package script.

## Tests and limitations

- `node --test scripts/judge-model-launcher.test.mjs`: **6/6 passed** on Node 24.22.1 with no runtime shim.
- **70/70 focused tests passed** on Node 24.22.1 using a temporary **test-only version-string shim** for the browser console's Node 22 guard. This test-only override is not shipped and cannot substitute for actual Node 22 verification.
- The verified local model still renders its authored synthetic cases under Node 24; no real buyer data, paid model provider, PayPal call, invoice or permission grant is involved.
- The complete Node 22 release, actual separate-buyer PayPal Sandbox PAID retrieval and signed webhook, audited public source, signed-out video and final Devpost submission remain unverified.

## Mandatory next gate

On the complete private Windows checkout, run the exact pinned Node 22 clean-release verification and conditional private public export with `node .\scripts\clean-release-checkout.mjs --shareable --export-public`. This is the active submission bottleneck, not further judge UX polishing. Resolve any reported first failing stage before claiming a passing release. Genuine Sandbox acceptance, public assets and submission confirmation remain independent gates.
