# Expiration and status visibility

Turn 030. Base: `25cdfadc086a33c56a2b4cf5e486b8633cae0d21`, plus the recovered exact-base Turn 029 overlay.

## UTC contract

A licensing interval includes its start instant and excludes its end instant. Both boundaries are midnight UTC. A one-day license ends at the following UTC midnight, not 24 hours after payment or after the page was opened. Leap days and daylight-saving transitions do not change the UTC day arithmetic. Invalid calendar dates, local-time strings, offsets and intervals outside 1 through 365 days fail validation.

The pure temporal module derives scheduled, active and expired states only for an already recorded permission. Refunded, revoked and expired terminal permissions never become active again. A backward clock cannot rewind an active permission to scheduled. Temporal computation does not create payment evidence, extend rights, renew a license or infer consent.

Active verified receipts show an upcoming-expiration notice during the final seven 24-hour intervals and a stronger notice during the last 24 hours. Exact expiration and last permitted date are displayed. `daysRemaining` rounds upward for display only and never extends the exclusive deadline. Scheduled and refunded/revoked records do not get a misleading remaining-use countdown.

## Guarded clock worker

`createPermissionClock` loads the existing relational receipt snapshot, verifies every historical receipt and audit anchor, and runs the same terms/quote/consent/payment validation used by receipt issuance. Only the internal forward-clock validation mode permits an otherwise valid scheduled or active state to be behind the UTC clock. Ordinary receipt issuance and public/protected GETs still require exact temporal agreement.

An existing receipt must match the current material state before a new clock transition. Every frozen deal fact and payment reference must remain unchanged. Review flags, an unpaid/canceled/simulated binding, missing evidence, changed consent, pending provider generations, blocked recovery, an active recovery lease or corrupt source records prevent the worker from applying a transition.

The transition is one atomic database batch:

1. Insert a clock audit whose NOT NULL case lookup compares the entire source and receipt-chain snapshot.
2. Advance the permission state, reason, effective time and revision.
3. Advance the licensing-case revision.
4. Invalidate the current verification record.

The exact source comparison also catches newly appended financial work, audit history, consent changes, concurrent revocation and competing workers. All four writes commit or roll back. The clock never writes invoice status, payment evidence, financial observations or reconciliation generations.

Effective time is the actual UTC start/end boundary. Audit creation and update timestamps record when the delayed job observed the transition. A scheduled license first visited after its end moves directly to expired, without a transient active grant or fabricated intermediate receipt.

## Receipt publication and recovery

After the temporal transaction, the existing receipt issuer creates the next immutable hash-linked revision. It rechecks current financial and source state. Receipt publication is a separate guarded transaction: if it fails, verification stays invalid rather than retaining a valid active claim.

A subsequent worker invocation recognizes `utc_start_reached` or `utc_end_reached` and retries receipt publication without replaying the transition. Lost acknowledgements and file-backed restarts are covered. Identical refreshes add neither clock audits nor receipt revisions. A failed or independently invalidated receipt is not restored just because its calendar dates look plausible.

The bounded due selector includes scheduled/active permissions at their boundaries and invalid verification left by this worker's own completed transitions. It excludes terminal refunded/revoked states and known pending/review financial work. Corrupt eligible sources still fail the full service validation; repeated operator investigation may be required rather than automatically repairing them.

## Visibility and stale open pages

The public JSON allowlist adds temporal metadata inside the verified receipt projection. It exposes only already-public dates, check time, phase, expiration notice and next boundary. Buyer identity, price, internal IDs, payment references and audit details remain private.

Public, buyer and printable HTML use the same timing message. Public status explicitly says active **at check time**. Public HTML remains script-free and read-only. Saved or continuously open public pages are snapshots and must be refreshed. No GET executes a clock transition, issues a receipt or changes a permission.

The protected buyer client schedules a fresh read within 60 seconds or at the next boundary, whichever is earlier. It subtracts the elapsed request time from the server-provided interval. A response arriving after its boundary is never displayed. The old record and export/print actions are cleared before refresh. Hidden/history-restored tabs clear the token and private presentation. Timer/connection failures cannot activate anything: only a fresh server-validated response can render the record again. Browser timer throttling is not an authorization boundary; print/export requests always perform a fresh server check.

## Runtime configuration

`runPermissionClock` requires all of:

- `RIGHTS_PERMISSION_CLOCK_ENABLED=true`;
- `RIGHTS_RECEIPT_ISSUANCE_ENABLED=true`;
- Sandbox payment mode, Sandbox/judge application mode and a migrated database.

Defaults remain false. The Worker scheduled-handler source invokes the bounded clock helper after webhook processing, but no Cron Trigger, deployment or remote schedule was created. The helper accepts an injected clock for deterministic tests. There is no public mutation route and no separate manual billing step.

## Executed verification and limits

`npm run permission:clock:verify`: 73 native tests passed, zero failed. The new suite and the recovered Turn 029 experience/access/HTTP/QR suite ran together: 178 passed, zero failed, zero skipped.

The new cases include every supported 1-to-365-day interval, millisecond start/end boundaries, leap days, DST calendar dates, 100 repeated refreshes, eight competing workers, forward/backward clock changes, consent/review/payment races, all four temporal-transaction rollback points, all three receipt-publication failure points, lost acknowledgements and file-backed restart. The loops are scenarios within the 73 tests, not inflated independent test counts.

The native SQL fixture uses the actual production receipt store, exact-source guard, temporal SQL, issuer and chain/material validator. Its parent schema and financial records are synthetic focused fixtures, not the full eight-migration/seed runner. In particular, the audit case-ID NOT NULL constraint is retained to reproduce the production transaction fence. No full-schema acceptance is claimed for this turn.

Standalone strict TypeScript 5.8.3 passed for all recovered/current receipt modules and server helper. The Worker wrapper and buyer-link change received syntax checks only, not an installed Hono/React/Cloudflare build.

Offline Chromium passed 32 existing layout/DOM checks and 12 new deadline/hidden-tab checks. These use local markup and injected responses/timers, not actual HTTP browser navigation, authentication sessions or network downloads. No genuine PayPal or deployed D1 evidence exists. The entire historical payment, receipt-issuance and Gate C collections were not rerun. Turn 007 and Gates A/B/C remain open.

The recovered Turn 029 package retains its original verification report as historical evidence. This management turn re-executed its 105 native experience tests before and after the temporal changes. Runtime dependencies were restored from the exact reviewed base and their Git blob hashes checked. No paid API, real credential, payment, email, GitHub Actions or user handoff was used.

Next planned unit: Turn 031, creator portfolio dashboard, subject to the plan's P1 cut rule and unresolved P0 integration work.
