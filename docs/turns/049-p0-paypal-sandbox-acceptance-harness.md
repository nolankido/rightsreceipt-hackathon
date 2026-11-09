# Turn 049 Receipt: Genuine PayPal Sandbox Acceptance Harness

- **Status:** Implementation completed and merged; external Sandbox acceptance remains pending.
- **Date:** October 30, 2026 UTC.
- **Objective:** Remove the PayPal evidence bottleneck by making genuine Sandbox invoice and webhook acceptance reproducible, fail-closed and evidence-producing before credentials are introduced.
- **Scope completed:** Sandbox create/send/status harness, restart-safe private state, paid-state recheck, genuine webhook verification path, sanitized evidence, uncertain-send recovery, local regression fixtures, package commands and release runbook.
- **Merge commit:** `9ef506fc76c6355368fb5f832b75fbe3615686a3`.

## Implemented commands

```bash
pnpm sandbox:acceptance:create
pnpm sandbox:acceptance:check -- --state .data/.../state.json
pnpm sandbox:acceptance:webhook -- --capture .data/paypal-webhook.json --state .data/.../state.json
pnpm sandbox:acceptance:verify
```

The acceptance regression is also part of `pnpm paypal:verify`.

## Acceptance behavior

### Create and send

The harness constructs one fresh canonical USD 425.00 accepted-rights snapshot and invokes the existing PayPal Sandbox invoice adapter rather than a separate curl implementation.

A successful create/send result requires:

- exact Sandbox API origin;
- OAuth through the existing adapter;
- one draft invoice binding;
- one explicit send;
- an authenticated provider GET;
- a payable provider state;
- a validated PayPal-hosted payer URL;
- an `unpaid` financial assessment;
- no reconciliation flag.

Sending an invoice is never treated as payment.

### Later payment check

The private state file contains only the durable binding material needed to restore the adapter journal. It excludes buyer email, OAuth token and client secret.

A later `check` performs an authenticated provider GET. A paid conclusion requires the existing settlement validator to observe matching financial details, including USD 425.00 paid and zero due. A provider status label alone is not enough.

### Genuine webhook verification

The webhook command accepts a private capture containing the exact raw PayPal body and signing headers. It runs the existing production verification boundary, which posts the event to PayPal's webhook-signature verification endpoint using the registered Sandbox webhook ID.

When a state file is supplied, the verified event must reference the exact invoice from the create/send acceptance run.

Published evidence excludes:

- raw webhook body;
- transmission signature;
- OAuth token;
- buyer email;
- merchant email;
- client secret.

It retains only minimized event/invoice metadata and hashes needed to bind the evidence.

## Recovery hardening

An uncertain send outcome persists the current journal state before exit. If the provider action may have committed but the acknowledgement is lost, the private state records `sendState: started` so a later read-only reconciliation does not require a blind resend.

Configuration, state and capture validation occur before output directories are created. Runtime files are restricted to ignored `.data` or locations outside the repository.

## Verification performed during implementation

No real PayPal credentials were accessed and no external PayPal transaction was made.

Local acceptance fixtures were authored for:

- draft creation;
- send and payable UNPAID state;
- sanitized hosted handoff evidence;
- state restoration;
- later PAID financial detail;
- webhook signature-verification flow;
- invoice matching;
- secret and buyer-data redaction;
- missing configuration;
- lost send acknowledgement and preserved recovery state.

The current-head automated code review completed with no findings on `fbba860d8b86af0c71fea66080c585c3bc7577a3`.

A security review also completed against the final PR head `fbba860d8b86af0c71fea66080c585c3bc7577a3` with **no security issues found**. Both code and security review therefore covered the exact source that was squash-merged.

The complete installed-dependency regression is still blocked by the missing `pnpm-lock.yaml`.

## External acceptance still required

This turn prepares the evidence path but does not close Gate C.

Before submission, execute against genuine PayPal Sandbox:

1. OAuth with the server-only Sandbox app.
2. Create the canonical USD 425.00 invoice.
3. Send it once.
4. Pay it using the dedicated Sandbox personal buyer.
5. Recheck it through the authenticated invoice GET until the financial validator concludes `paid`.
6. Verify at least one genuine invoicing webhook using the registered Sandbox webhook ID.
7. Archive only the sanitized evidence files.

The PayPal webhook simulator is not sufficient as final end-to-end evidence.

## Recommended next turn

Do not add features.

Generate and commit the real `pnpm-lock.yaml` with pnpm 12.8.2 on a networked machine, run `pnpm release:verify`, repair any clean-build failures, then execute the prepared Sandbox acceptance sequence against the same release candidate.
