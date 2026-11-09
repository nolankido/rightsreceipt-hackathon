# Authenticated Request Links and Private Buyer Intake

**Owning turn:** 038
**Date:** October 27, 2026 HST.
**Scope:** Connect the seeded asset to the canonical clarification, consent, invoice and receipt journey without preparing a buyer request in test setup.

## User flow and authority

The creator opens an authenticated asset page, reviews its identity and provenance, and explicitly creates a private request link. The buyer opens that link, enters their identity and intended use, and confirms the existing request acknowledgement. Submission preserves the original intended-use text and records normalized text separately. It creates no terms, quote, approval, acceptance, invoice, payment or permission.

The buyer then deliberately continues to clarification. The creator reviews the original request and any saved answers, chooses all twelve material rights fields, and receives the deterministic quote when complete. Explicit creator approval and exact buyer acceptance still precede invoicing.

The original private request link also resumes an existing journey. Before an offer is available, it leads to clarification. After an offer or financial activity exists, it leads to the current buyer offer and status page. That page independently verifies consent, payment state and receipt access. Read-only continuation remains available after asset archival while the capability is valid. Reopening a request never rewrites the original evidence or repeats a financial operation.

If the asset is archived before an offer or financial progression exists, the original request remains readable but its continuation is unavailable. The API returns `nextPath: null`; the page explains the archived state and disables navigation instead of directing the buyer to a clarification screen that cannot accept changes.

## Routes and deployment boundary

| Entry point | Behavior |
| --- | --- |
| `/creator/requests/:assetId` | Managed creator session, actual SQL asset/workspace ownership, explicit link creation |
| `/buyer/request#<capability>` | Public shell; fragment removed before the first private API request |
| `GET /api/intake/creator/assets/:assetId/review` | Current asset snapshot, source hash, version and exact consent copy |
| `POST /api/intake/creator/assets/:assetId/links` | Authenticated, source-fenced creation of one case and digest-only capability |
| `GET /api/intake/buyer/review` | Capability-authorized current intake or immutable submitted evidence and continuation |
| `POST /api/intake/buyer/request` | One immutable original request, exact source/version and explicit acknowledgement |

`REQUEST_INTAKE_ENABLED=false` is the checked-in default. The native APIs require `HUMAN_CONSENT_ENABLED`, `CLARIFICATION_ENABLED`, the existing nine migrations, a database binding, Sandbox/judge mode, `PAYPAL_MODE=paypal_sandbox`, and a fixed HTTPS consent origin. These operations need no provider credentials or PayPal transport. Creator and buyer origins must match for creator issuance. The managed gateway must protect the creator page, its external script and `/api/intake/creator/*`. Buyer routes remain outside creator login and require their own capability.

`/api/creator/session` can return the signed session lifetime for intake without enabling the separate creator offer page. The Worker constructs the native route factories once so per-isolate limits persist, and runs the canonical paths before static asset fallback.

The old `/request/:capability` shell and `/api/request/:capability` family are restricted to the existing HTTP local-memory demo. A shared boundary runs in native composition and the Hono API middleware. Database-bound, Sandbox/judge and public runtimes reject those routes before a repository lookup. The native check normalizes percent-encoded ASCII prefixes, and the matched Hono middleware enforces the runtime gate independently of path decoding. This prevents encoded URLs from reaching the old submission implementation without canonical audit and concurrency checks. The legacy local demo remains available under its original local-only gate.

## Capability issuance and exact retries

The native creator client generates 32 bytes with `crypto.getRandomValues`, encodes them as a 43-character base64url secret, and computes its SHA-256 digest. Only the digest enters the issuance command. The backend fixes the four scopes (`submit_request`, `clarify`, `review`, `receipt`) and seven-day lifetime. It rejects caller-supplied workspace, case, expiry, price, payment or permission fields.

This design lets the browser retain one private secret and one frozen command during an uncertain response. Retrying that exact command returns the same case and capability metadata without storing or recovering a bearer secret on the server. Entropy is supplied by the audited native client. An external authenticated API client must also generate 32 cryptographically random bytes; the server cannot infer the strength of a chosen secret from its digest. An authorized creator already controls sharing their own link.

The raw capability is never saved in the database, audit JSON, application storage, a DOM link, a cookie or an issuance request. Explicit copy puts it in the clipboard, and explicit manual reveal puts it in a read-only field until hidden or cleared. Buyer APIs carry it only in the authorization header. Deliberate navigation uses a fixed same-origin fragment that the destination immediately removes.

The browser clears private state after five minutes, on expiry, hiding, page exit and restored history. Once cleared, the server cannot recover the secret. Creating another link starts a separate request; an earlier unused link remains inaccessible without its secret and expires at its recorded time. No claim of recovery across a closed tab is made.

## Commands and evidence

The creator command contains `requestId`, `expectedAssetVersion`, `reviewHash`, `tokenDigestSha256`, `confirmed: true` and `copyVersion: creator-request-link-v1`. The backend derives ownership from the verified session and SQL asset record. It records the original asset/workspace snapshot, its hash, the authenticated actor, exact command fingerprint, capability identity, lifetime, scopes and consent copy hash in immutable audit evidence.

The buyer command contains `requestId`, `expectedCaseVersion`, `reviewHash`, `buyerName`, `buyerOrganization`, `buyerEmail`, `intendedUseText`, `consentAcknowledged: true` and `copyVersion: buyer-request-v1`. Domain validation preserves the original intended-use string, including supported Unicode and line breaks. It rejects executable markup, templates, malformed Unicode and missing acknowledgement. Intended use is bounded to 40 through 4,000 Unicode code points. The browser's character count and input bounds match this contract.

The submitted request has a separate content hash, normalization, immutable record ID, timestamp, capability identity, source version, command fingerprint and copy hash. No buyer answer is treated as an approved right. New requests continue through the existing deterministic clarification planner and explicit human review.

For submitted read-only continuation, the stored issuance snapshot supplies the original asset display. The live asset and workspace must still have the same identities; later archival or metadata/policy edits do not erase access to the already-recorded request. The initial submission and all mutation replays retain the stricter current, active asset/version/source checks. The current buyer review, invoice and receipt services remain responsible for their own authority checks.

## Atomicity, races and time

No migration or table is added. Issuance writes the case, capability and audit event in one atomic batch. Submission writes its audit event, immutable request and case pointer/version in one atomic batch. The first statement uses an exact SQL snapshot fence whose failure violates a required column and aborts the whole transaction.

The command UUID is also the globally unique audit event primary key. This closes concurrent first-issuance races across newly generated case IDs without relying on the existing per-case idempotency index. Reusing a command ID with different content, a different actor or workspace, or an unrelated audit event fails. A unique capability digest prevents collision with another link.

Lost database acknowledgements are recovered by reading committed evidence and validating the exact command. Browser transport failure retains the exact command for a deliberate retry. Replays require the result to remain current; they cannot restore an earlier request or offer after downstream changes. New submission is locked after invoicing or financial/receipt state exists.

Private reads recheck capability, source and authorization after asynchronous work. Creator authority is verified against asset ownership before a case exists, and rechecked around awaited work. Configuration changes, database replacement, expiry, revocation, account switching and aborts fail closed. A final SQL check prevents a stale aggregate from being returned after authorization.

The creator principal also carries the expiry from the verified request JWT. Each creator operation retains that deadline locally and checks it synchronously after the final SQL read and immediately before return or dispatch. The existing route fence checks current mapping/configuration, database identity and cancellation at the same points. This closes expiry during a delayed source read without moving another asynchronous authorization after the source fence. Six regressions use actual signed assertions for review, issuance and replay under expiry or mapping revocation during that final SQL wait. Expiry is excluded from the command identity so a renewed session can retry the same command, and buyer operations never inherit a creator lease from an earlier call.

The immutable event timestamp and the fresh capability-check timestamp are separate. Hashing can advance the clock between request creation and the final write fence. Audit `created_at`, request `submitted_at` and the case event timestamp remain identical, while the capability fence uses the current time. An advancing-clock regression covers this distinction.

## HTTP, browser and privacy checks

Commands use strict JSON parsing that rejects duplicate decoded keys at every depth, unknown fields, malformed UTF-8, excessive depth, content encodings and bodies above 32 KiB. Origin and Fetch Metadata checks reject cross-origin commands. Responses are private, uncached and excluded from indexing. Per-isolate limits remain a local defense rather than a distributed deployment guarantee.

The creator page uses the managed session; buyer requests omit cookies. Form values and returned evidence render as text. Exact consent copies, result identities, scope lists, timestamps, source versions and a fixed continuation-path allowlist are validated before the browser enables an action. Pending commands freeze edits. Lifecycle events clear private fields and epoch checks prevent late replies from restoring them.

The private canonical receipt may identify the licensed buyer organization. Buyer name, email, original request, clarification text and bearer secret are excluded from its payload. The public verification view additionally omits the buyer organization. Receipt hashes remain unsigned integrity checks, not ownership guarantees.

## Local verification and limits

Focused reproduction commands:

```bash
pnpm request:intake:verify
pnpm request:intake:browser
pnpm transaction:verify
pnpm transaction:typecheck
```

Native commands use the supported Node 22 runtime and the existing consent TypeScript loader. Browser checks accept `RR_PLAYWRIGHT_MODULE`, `RR_CHROMIUM` and `RR_INTAKE_ARTIFACTS` for an available local Playwright/Chromium installation and an evidence directory.

The new full browser journey seeds only one workspace, asset and pricing policy. Actual native routes create every transactional record, then reach clarification, a $425 policy quote, separate approval/acceptance, invoice dispatch, payment reconciliation and canonical receipt/export/public verification. The original link is reopened at the offer, sent invoice and archived receipt stages. Native integration also verifies full-refund revision continuity, including both ordinary delivery and lost database acknowledgements.

The fixtures apply all nine production migrations and use actual managed assertion verification, application services, SQL batches, financial processors and receipt validators. Gateway assertions, JWKS and PayPal HTTP replies are injected. No payment evidence or permission rows are inserted directly in these journeys. Browser Fetch Metadata is not exposed by this interception and is covered by native route tests; time and lifecycle transitions are injected.

Results are recorded in [Turn 038](../turns/038-p0-authenticated-request-intake.md) and its [verification summary](../evidence/turn038/verification.json). These checks do not claim a deployed Worker/D1, actual managed login, genuine Sandbox payment/refund/webhook, or the pinned installed-library build. Available TypeScript 5.8.3 source checks do not replace the pinned 5.9.3 toolchain. All runtime flags remain off and no account-owner action is required for the next local improvement turn.
