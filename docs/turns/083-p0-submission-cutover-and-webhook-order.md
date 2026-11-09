# Turn 083: submission cutover and safe Sandbox acceptance order

**Date:** November 4, 2026  
**Priority:** P0, submission readiness and judge presentation

## Problem addressed

The official PayPal AI Hackathon deadline is November 12, 2026 at noon Pacific. The private project has substantial implementation and focused test history, but a full pinned release, genuine Sandbox transaction, public sanitized repository, public working demonstration video and Devpost entry are not verified. The main README begins with a long sequence of internal engineering checkpoints, obscuring the first-time judge's product explanation. The genuine Sandbox runbook also presented its buyer payment as Stage 2, followed by the one-shot webhook collector instructions as Stage 2.5, even though that collector **must be prepared and bound before buyer payment**. Its prose warned about this, but the section order could still cause a lost webhook or an unnecessary repeated test transaction.

## Improvement implemented

1. Save a fresh [readiness evaluation and dated cutover plan](../submission/READINESS_EVALUATION_2026-11-04.md), separating official rules from stronger internal evidence standards and setting an internal November 9 submission target.
2. Put a concise product explanation, one-command functional judge path, explicit PayPal and AI authority boundaries, and honest evidence status before historical checkpoints in `README.md`.
3. Reorder `docs/paypal/SANDBOX_ACCEPTANCE.md` so optional collector/HTTPS registration appears before Stage 0 preflight, exact-invoice binding follows invoice creation as Stage 1.5, buyer payment follows as Stage 2, and verification follows as Stage 3. Add a hard stop before paying if the real listener and invoice binding are not ready. Correct the example capture path to use the collector's actual private output.
4. Promote the new active plan in the submission documentation index so future improvement turns focus on release gates rather than optional features.

## Source and scope checks

- Contest requirements, deadline and five equally weighted judging criteria reviewed from the official Devpost rules on November 4.
- The source repository was private at evaluation time, with a visible MIT license and a source checkpoint at Turn 082.
- The current `package.json` and existing runbook were checked for the exact CLI names referenced in the instructions.
- The edited runbook preserves the existing safety restrictions: Sandbox-only API, no credential output, public HTTPS:443 registration, one-shot private capture, exact-invoice binding, authenticated PAID GET and independent signed-webhook verification.
- Only documentation and judge onboarding text changed. No runtime business logic, payment provider request, deployment, repository visibility change, public upload, or Devpost form submission was performed.

## Verification boundary

Editorial checks must verify that the runbook stages are now chronological, all command names exist in the package scripts, the README starts with the judge-facing entry point, and new documentation links exist. These do **not** substitute for a clean Node 22 `pnpm release:verify` or a real PayPal Sandbox acceptance test. Because this environment has no authenticated full private checkout and does not have the pinned Node/pnpm toolchain, those P0 release tests remain pending.

## Next highest-value unit

Complete the exact clean Node 22/pnpm 12 release gate and the genuine same-app PayPal Sandbox buyer-paid acceptance run. If these are blocked by account-bound credentials or HTTPS webhook registration, record the missing dependency precisely and immediately advance the public source/video/Devpost work that can safely be prepared without claiming unverified functionality.
