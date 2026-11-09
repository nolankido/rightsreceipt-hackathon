# Payment integration

The Gate C readiness audit repaired competing recovery consumers and incorrect permanent-error retries. The new integration suite executes all seven original migrations and the real recovery/lifecycle stores together. **Gate C remains blocked:** no genuine Sandbox or deployed browser flow has been verified.

- [Gate C audit and readiness matrix](GATE_C_READINESS.md)
- [Financial permission lifecycle](FINANCIAL_PERMISSION_LIFECYCLE.md)
- [Reconciliation and recovery](RECONCILIATION_AND_RECOVERY.md)
- [Order-safe webhook processing](IDEMPOTENT_WEBHOOK_PROCESSING.md)
- [Verified webhook intake](VERIFIED_WEBHOOK_INTAKE.md)
- [Invoice delivery and status retrieval](SANDBOX_INVOICE_DELIVERY.md)
- [OAuth and draft transport](SANDBOX_DRAFT_TRANSPORT.md)
- [Sandbox setup](SANDBOX_SETUP.md)
- [Genuine Sandbox acceptance](SANDBOX_ACCEPTANCE.md)
- [Gate C management-turn receipt](../turns/gate-c-paypal-readiness-review.md)

`npm run gate-c:verify` runs the 48-test full-schema audit suite without installing dependencies. This audit also reran 49 earlier configuration/fake/OAuth/draft checks: 97 executed passes, zero failures. Other historical suites and the full installed build were not rerun.

When both recovery and permission-lifecycle flags are enabled, the recovery entry point selects the financial lifecycle instead of running two consumers against the same queue. Without explicit financial opt-in it remains status-only. All checked-in flags remain disabled. No routes, credentials, real transactions, public verification receipts or scheduled deployment were added.
