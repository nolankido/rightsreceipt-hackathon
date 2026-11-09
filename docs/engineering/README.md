# Engineering Documentation

This directory records executable engineering decisions, commands, and verification evidence.

## Current records

- [`TOOLCHAIN.md`](TOOLCHAIN.md): Turn 007 runtime, dependency, workspace, command, and verification contract.
- [`PERSISTENCE.md`](PERSISTENCE.md): Turn 008 migrations, deterministic seed, reset, local SQLite evidence, and D1 handoff.
- [`ASSET_WORKSPACE.md`](ASSET_WORKSPACE.md): Turn 009 creator workspace, controlled asset metadata, API, UI, and local verification evidence.
- [`BUYER_REQUEST_INTAKE.md`](BUYER_REQUEST_INTAKE.md): Turn 010 opaque request links, immutable buyer evidence, validation, API, UI, and local verification evidence.
- [`STRUCTURED_TERMS_REVIEW.md`](STRUCTURED_TERMS_REVIEW.md): Turn 011 twelve-field review, manual corrections, immutable terms versions, provenance, API, UI, and local verification evidence.

- [`DETERMINISTIC_PRICING.md`](DETERMINISTIC_PRICING.md): Turn 012 creator policy, integer-cent quote, immutable versions, API, UI, and local verification.

- [`MOCK_VERTICAL_SLICE.md`](MOCK_VERTICAL_SLICE.md): Turn 013 local-only approvals, buyer acceptance, fake payment, simulated receipts, and verification boundaries.

- [`GATE_A_AUDIT.md`](GATE_A_AUDIT.md): local-only simulated flow security and receipt integrity audit, blocked browser gate, and regression evidence.

The product, architecture, and domain records remain authoritative for behavior. Engineering records distinguish configured, source-checked, locally verified, browser-tested, deployed, and externally verified states.

- [`../paypal/SANDBOX_SETUP.md`](../paypal/SANDBOX_SETUP.md): Turn 021 fake adapter, Sandbox-only configuration, and credential handoff.
- [`../paypal/SANDBOX_DRAFT_TRANSPORT.md`](../paypal/SANDBOX_DRAFT_TRANSPORT.md): Turn 022 mock-tested OAuth, draft invoice mapping, retry and idempotency limits.

- [`CANONICAL_TRANSACTION_UI.md`](CANONICAL_TRANSACTION_UI.md): Turn 035 buyer acceptance, authenticated invoice controls, per-dispatch authority and integrated browser verification.
- [`BUYER_PAYMENT_HANDOFF.md`](BUYER_PAYMENT_HANDOFF.md): Turn 036 capability-authorized payment handoff, current receipt status, protected navigation and local financial/receipt integration evidence.
- [`CLARIFICATION_WORKFLOW.md`](CLARIFICATION_WORKFLOW.md): Turn 037 immutable buyer answers, explicit human re-review, renewed exact consent, migration 9 and receipt-compatible financial integration.
- [`AUTHENTICATED_REQUEST_INTAKE.md`](AUTHENTICATED_REQUEST_INTAKE.md): Turn 038 managed creator link issuance, private immutable buyer intake, exact retries, original-link continuation and asset-only setup through canonical receipts.
- [`AUTHENTICATED_INVOICE_RECOVERY.md`](AUTHENTICATED_INVOICE_RECOVERY.md): Turn 039 authenticated recovery of reserved invoice actions, retained draft IDs and uncertain delivery, with exact command identity and no duplicate provider writes.
- [`LOCAL_JUDGE_REHEARSAL.md`](LOCAL_JUDGE_REHEARSAL.md): Turn 040 one-command canonical rehearsal, populated in-memory reset, retired-access checks, minimized offline report and environment/output isolation.
- [`KEYBOARD_FORM_RECOVERY.md`](KEYBOARD_FORM_RECOVERY.md): Turn 041 targeted six-page keyboard audit, linked field validation, focus ownership, exact retries and private-state recovery.
- [`BROWSER_REQUEST_DEADLINES.md`](BROWSER_REQUEST_DEADLINES.md): Turn 042 bounded browser JSON requests, uncertain-write recovery, exact command retries, cancellation and late-response rejection.
- [`BUYER_PRIVATE_RECOVERY.md`](BUYER_PRIVATE_RECOVERY.md): Turn 043 complete private cleanup after terminal acceptance conflicts and unexpected review failures, with deliberate code reentry and bounded recovery.
- [`RECEIPT_SESSION_RECOVERY.md`](RECEIPT_SESSION_RECOVERY.md): Turn 044 protected receipt request ownership, pending cancellation, full-body deadlines and current print/export authority.
- [`RECEIPT_RESPONSE_VALIDATION.md`](RECEIPT_RESPONSE_VALIDATION.md): Turn 045 protected response metadata, strict timing, exact export-byte verification and bounded validation ownership.
- [`RECEIPT_BODY_LIMITS.md`](RECEIPT_BODY_LIMITS.md): Turn 046 bounded HTML/JSON streaming, declared-length validation, reader cancellation and a justified renderer budget.
