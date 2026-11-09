# Judge Quick Start

**Judge-access options:** The official PayPal AI Hackathon rules permit either an actually runnable local build with complete setup instructions or a hosted functional demo. Cloudflare hosting is not mandatory. A static illustration alone is insufficient.

## First path: executable local browser console

**Updated reviewer interface:** The localhost page has a responsive four-stage workflow overview, accessible keyboard focus and a live-status region. Report and JSON links appear only after the actual run succeeds. All page styling uses a per-request CSP nonce, without external scripts, images or font services. The prominent warning identifies simulated payment and scripted participants, rather than implying genuine PayPal acceptance.

With Node 22.13 through 22.x installed, from the public repository root run:

```bash
node scripts/judge-local-console.mjs
```

Open the printed `http://127.0.0.1:PORT/` address. Click **Run application rehearsal**. The form redirects immediately: a clearly labeled running-status page refreshes itself every two seconds without JavaScript. Allow up to two minutes for the canonical ordinary, lost-invoice-reply recovery, and repeat journeys. Once the actual application handlers and in-memory SQL complete their work and all reset evidence is validated, the page shows links to a fresh execution report and minimized JSON. A failed run has no evidence links. To diagnose a failed run, restart the local console and use the CLI alternative `node scripts/judge-rehearsal.mjs`, which emits bounded stage failure data; do not interpret the running page as proof of a passed rehearsal. The same landing page also offers **Run read-only AI diagnostic**, a separate `/model` page that verifies the bundled trained classifier, performs real TypeScript inference on two authored synthetic requests, and compares its suggestions with independent source-span extraction. It makes no payment calls, asks for no credentials, and does not grant rights. The transaction worker remains credential-stripped, with injected provider and scripted human behavior. No package installation, authenticated account, external service, public deployment or paid API is needed. It binds only to 127.0.0.1, checks the form origin and token, and keeps output under ignored `.data/judge-console/`. Press Ctrl+C to close it.

**Evidence boundaries:** The *transaction rehearsal* does not run the learned AI model, log in a real creator, contact PayPal, receive real webhooks, move money or grant a real license. The new separate `/model` route does execute the bundled learned classifier on synthetic requests, but it cannot approve rights, represent real-world model accuracy, or verify a payment. The report describes only locally simulated financial state. The real Sandbox acceptance gate remains independent. Turn 070 now provides a private `handoffPath` for an actual PayPal Sandbox recipient-view link after invoice creation and an unpaid GET; the URL is intentionally excluded from public evidence. See [Sandbox acceptance](../paypal/SANDBOX_ACCEPTANCE.md) for using a separate personal Sandbox buyer account. The local console is an additional functioning execution path, not a claim that final submission readiness has passed. The CLI-only alternative is `node scripts/judge-rehearsal.mjs`.

### Turn 092: one-click actual trained-model exhibit

The local browser console now has **two distinct routes**. The existing `/` POST-driven journey is the application rehearsal with scripted participants and injected PayPal responses. The new `/model` GET-driven exhibit starts a credential-stripped Node 22 child process, checks the bundled lexical model bytes against the committed training-report SHA-256, loads the real TypeScript inference implementation, and renders separate learned model predictions and deterministic source excerpts for complete and contradictory synthetic cases. It does not require a paid AI provider or a PayPal account.

On-screen warnings distinguish model predictions from human approvals and payment evidence. The diagnostic does not use real buyer data or claim calibrated confidence. The standard `pnpm judge:console:smoke` now checks that **both** the transaction rehearsal and the AI exhibit are reachable and honestly labeled. The new `judge-ai-demo.test.mjs` tests run in the standard judge verification suite.

This is a newly added release feature, not yet proof that the final private checkout passes all tests. The actual public deployment and genuine Sandbox acceptance remain separate gates.

### Verify the actual learned AI component separately

The first-path console is an honest **application-handler rehearsal** with injected financial responses. It does not run the learned classifier. To inspect actual trained-model behavior without a hosted AI provider, use Node 22.13+ in a full checkout:

```bash
node --no-warnings --experimental-strip-types scripts/evaluate-portable-local.mjs --check
node --no-warnings --experimental-strip-types --test scripts/portable-model-local.test.mjs
```

The first command loads the committed quantized lexical model, verifies its artifact identity against the project-authored synthetic validation dataset, runs real local TypeScript inference, checks that predictions cannot authorize quotes, and compares a deterministic validation report. The second exercises the model implementation. Both are **local model verification**, not a real creator session, generalizable accuracy proof or a substitute for running the live creator extraction screen.

For an end-to-end AI demonstration, use the running application creator extraction view: the deterministic source-span observations and the separate read-only learned-model suggestions must be distinguishable. The model's score margins are not calibrated confidence probabilities and it cannot authorize material rights. Consult `docs/model/MODEL_CARD.md` and `docs/model/INFERENCE_INTEGRATION.md` for limitations. The release video must show actual functioning product footage, not just a prerecorded mockup or this CLI report.

### Genuine Sandbox acceptance prerequisite

Before using the real Sandbox invoice/create command, run
`pnpm sandbox:acceptance:webhook:preflight` with the private business
app credentials and registered webhook ID. For a hosted callback it performs only Sandbox OAuth and a read-only
registration list. For a one-shot local collector it first verifies the current
private route responds to a side-effect-free localhost HEAD request, then checks
the authenticated PayPal registration. A stopped collector fails before OAuth.
Stage 1 independently enforces the same check. This does not prove that the
public HTTPS forwarder is reachable or that PayPal delivered a signed event.
It prevents creating invoices when the configured paid webhook belongs to a
different REST app. The callback still must be reachable from PayPal via public
HTTPS and a genuine Sandbox paid event must be verified. The standalone
local simulated demonstration never makes these calls.

**Capture a real paid webhook:** If a deployed listener is unavailable, an operator can launch `pnpm sandbox:acceptance:webhook:capture -- --port 8788` on their own machine and provide an approved public HTTPS forwarding endpoint to localhost. The receiver generates a private route path that must be registered under the same Sandbox REST app **before** invoice creation. After a real Sandbox buyer payment it saves an **unverified** private `capture.json`; `pnpm sandbox:acceptance:webhook` must then verify the signature and invoice match. The receiver does not create public forwarding, contact PayPal, grant rights or prove payment. Full setup is in [the acceptance runbook](../paypal/SANDBOX_ACCEPTANCE.md).

**Exact-invoice capture binding:** After `sandbox:acceptance:create` has sent and checked the USD 425.00 Sandbox invoice, but before the personal buyer pays, run `pnpm sandbox:acceptance:webhook:bind -- --route-file PRIVATE_ROUTE_FILE --state PRIVATE_STATE_FILE`. This writes a private, one-time invoice binding; the collector now ignores other invoices and partial/pending payments, rejects stale transmissions and cannot finish without that binding. The resulting webhook is still unverified until PayPal's signature API and the saved invoice state agree. See [Sandbox acceptance](../paypal/SANDBOX_ACCEPTANCE.md).

**Automated real-worker acceptance check:** Before calling the self-run demo ready, execute `node scripts/judge-console-real-smoke.mjs` on a clean Node 22.13 through 22.x checkout. It starts the actual console, submits the same local form as a judge, runs the real scripted handler worker, verifies the HTML and JSON artifacts, isolation and all three revocation resets, then cleans up. The successful JSON result explicitly reports `paymentEvidence: "simulated_only"`. This is not a substitute for a genuine PayPal Sandbox transaction or verified webhook. The smoke is mandatory inside `pnpm judge:verify` and `pnpm release:verify`.

## Optional hosted experience

### Hosted Sandbox demo

**Status:** Not yet available.

When the hosted release passes the security and Sandbox gates, place the stable URL here:

`[HOSTED_DEMO_URL]`

The hosted build must:

- run in Sandbox mode only;
- use server-side PayPal secrets;
- expose no production payment configuration;
- provide a deterministic seeded demo;
- remain available free of charge through the judging period;
- not require judges to receive secrets through email or chat.

## Restricted judge preview deployment

The source-controlled `wrangler.jsonc` is a local-only development config. Do not run a public deployment from it. The new `wrangler.judge.example.jsonc` is a safe, deliberately non-deployable template for a separate Worker named `rightsreceipt-judge`; it contains no credentials and uses an invalid D1 ID and public-origin placeholder until a Cloudflare judge environment is provisioned.

The first no-login page is `/judge`, a read-only illustrated tour of the canonical synthetic case. It now includes a paraphrased buyer-use example, all twelve resolved rights in an accessible native disclosure, the exact five-line seeded USD 425.00 deterministic quote, and an offline approval/injected-payment/scheduled-receipt timeline. This is readable and printable without JavaScript or private credentials. The page explicitly labels its October 27, 2026 fixture clock and the `manual-review-v1` human-corrected terms: the static tour does **not** run AI inference. The buyer's full original request and contact details remain private. It labels injected provider evidence and a scheduled receipt as illustrative, not a genuine PayPal payment or grant of rights. The restricted preview also serves the signed-out buyer intake shell, clarification and buyer-consent scaffolding, and public receipt-read routes. Opening or submitting a private buyer request still requires a valid creator-issued capability, which the restricted preview cannot issue because creator access is disabled. Creator authentication, real PayPal invoice creation/sending, payment processing, webhook intake and receipt issuance remain off. **A passing preview is not a completed PayPal Sandbox submission.**

Once an approved Cloudflare account and D1 instance are available:

1. Create the remote D1 database with `pnpm wrangler d1 create rightsreceipt-judge`, or locate its existing ID using `pnpm wrangler d1 list`. Review account usage before any remote mutation.
2. Copy the tracked template to the ignored root file `wrangler.judge.local.jsonc`. On Windows PowerShell, use `Copy-Item wrangler.judge.example.jsonc wrangler.judge.local.jsonc`. Do not commit the local file. The publication audit rejects it even if someone force-adds it to Git.
3. Fill in the new database's UUID and the actual bare HTTPS Worker origin in that local file. Set **both** `RIGHTS_RECEIPT_PUBLIC_ORIGIN` and `HUMAN_CONSENT_ORIGIN` to the same exact public HTTPS origin, with no trailing slash, path, query or custom port. The buyer page and its private intake API require this match. The old blank consent origin causes HTTP 503 even when the request feature flags are enabled. Keep the file as strict JSON without comments. Keep the Sandbox host, restricted flags, Worker name, D1 binding, migration path, ledger and asset routes unchanged. Never paste PayPal secrets or account tokens into JSONC.
4. Run the read-only preflight, review pending migrations, then apply them to the approved remote database:

```bash
pnpm judge:deploy:check
pnpm wrangler d1 migrations list DB --remote --config wrangler.judge.local.jsonc
pnpm wrangler d1 migrations apply DB --remote --config wrangler.judge.local.jsonc
```

5. For optional independent evidence, inspect the remote Wrangler migration ledger after applying migrations. The first command performs a read-only remote D1 query; the second consumes its JSON through a bounded, offline checker. It fails on missing, extra, duplicated or out-of-order migration filenames. The Step 6 launcher performs a fresh check automatically, so there is no need to run the same query manually just to deploy. Review the configured account, database and usage before any remote query.

```bash
pnpm wrangler d1 execute DB --remote --config wrangler.judge.local.jsonc --json --command "SELECT name FROM d1_migrations ORDER BY id" | pnpm judge:d1:ledger:check
```

The standalone checker reports sanitized status and counts only. It cannot prove that supplied JSON actually came from the remote account, so preserve the optional command and its exit status if you run it. The automated launcher blocks deployment when its own remote query fails or the ledger is empty, partial or inconsistent.

6. Only after checking the target account, database, migration ledger and any usage costs, invoke the gated restricted preview launcher. It repeats the same fixed read-only remote D1 query immediately before deploying, refuses a bad ledger, builds with provider credentials stripped, and automatically runs the eleven signed-out smoke probes at the exact configured origin. Do not invoke it without approved Cloudflare access and awareness of account usage:

```bash
pnpm deploy:judge:preview
```

The launcher prints a sanitized phase/code receipt and stops on any failed gate. It does not create D1 or apply migrations, and it does not perform any PayPal operation. If the final smoke fails, deployment may already have occurred; investigate and rerun the signed-out smoke separately rather than assuming an automatic rollback. For independent verification or a new saved HTTP evidence run, use `pnpm judge:hosted:smoke -- --origin https://YOUR-APPROVED-JUDGE-HOST`.

Once a restricted preview is deployed, give judges the exact `https://YOUR-APPROVED-JUDGE-HOST/judge` URL. It requires no login or private code. The tour's buyer and receipt links lead to real entry screens, not pre-authorized cases. No test capability or hidden seeded case is published.

The normal `pnpm deploy` now runs the same fail-closed guard against the local default and therefore refuses that unsafe target. `pnpm deploy:dry-run` remains available for credential-free release verification. The standalone deployment preflight checks local configuration only; the standalone ledger checker validates operator-supplied Wrangler JSON and does not itself query D1. The new launch command invokes Wrangler to query the configured remote D1 binding, checks its ledger JSON, deploys and tests the specified public origin. It cannot independently authenticate the Cloudflare account, cryptographically prove the deployed source commit, prove migration SQL hashes or genuine PayPal evidence, or guarantee deployment rollback on smoke failure. Cloudflare's [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) and [D1 migration commands](https://developers.cloudflare.com/d1/wrangler-commands/) document the underlying flags.

## Hosted deployment smoke gate

Once a Sandbox-only Cloudflare/D1 judge deployment exists, verify its public routes from a signed-out environment:

```bash
pnpm judge:hosted:smoke -- --origin https://YOUR-APPROVED-JUDGE-HOST
```

The command accepts one exact HTTPS origin with no path, query, user information or custom port. It makes eleven bounded, read-only GET requests with no cookies or credentials, refuses redirects, and saves a sanitized result under `.data/hosted-judge-smoke/run-*/evidence.json`.

The eleventh probe reads `GET /api/judge/runtime-profile`, a minimal JSON attestation generated by the Worker from its effective bindings. It requires exactly the approved restricted feature flags, the configured origin, D1 and static asset bindings, and no extra runtime bindings or secrets. Unexpected values produce a sanitized HTTP 503. The smoke requires a strict no-active-content CSP and no-store/anti-indexing headers on that endpoint. The profile is not a cryptographic proof of the release commit or complete security; it provides independent evidence that the Worker at the configured URL is running the restricted profile.

It checks the no-login `/judge` walkthrough is Worker-served, contains all three concrete evidence panels and the exact seeded USD 425.00 quote-total marker, and explicitly marks its human-corrected rights, scheduled receipt and injected provider responses as synthetic. It also requires the seven native runtime-profile, judge, buyer, script and receipt-verification responses to retain private no-store caching, no-referrer, anti-indexing, anti-framing, no-sniffing and restrictive CSP headers; judge and buyer inline style nonces must match CSP. It also checks the Worker health endpoint is in exact `judge` mode **and reports `persistence: ready` after a read-only D1 schema check**; the landing page, buyer intake form with its private-code entry and client assets load; the buyer receipt shell and receipt asset are enabled; an unknown public receipt returns the exact minimized 404 schema with no extra private fields; private responses are marked `no-store`; legacy creator workspace access is denied; and local mock verification is unavailable. A failed check blocks the hosted judge path until the deployment or bindings are corrected. An older Worker without the persistence field cannot pass.

**Limitation:** The eleven smoke probes confirm the illustrative page and expected browser-security headers are present, not that a judge followed the page, that authenticated creator/buyer flows work or that an authorized buyer code exists. These exact header checks do not constitute a complete browser security audit. Passing HTTP checks establishes only that the D1 binding answered a read-only schema query covering 33 domain tables, 23 named indexes, 28 integrity triggers and 15 later-added columns. It also checks the exact nine expected migration filenames are present in the Wrangler D1 ledger. It does not prove migration file hashes, schema object definitions, seed rows, creator login, end-to-end buyer journey or PayPal payment. Preserve genuine Sandbox create/send/pay/status/webhook evidence and conduct a browser walkthrough separately. This command makes no PayPal API or payment calls.

The checked-in `wrangler.jsonc` remains a safe local-only default (`APP_MODE=local`) with no D1 binding. For the restricted preview, use the separate ignored `wrangler.judge.local.jsonc` and the preflight above. Apply remote migrations and pass the separate ledger check before deploying and smoke-testing. Full creator and real PayPal paths require a separately reviewed authenticated Sandbox configuration, not merely a passing preview.

## Path B - Local judge rehearsal

Available now:

```bash
node scripts/judge-rehearsal.mjs
```

Requirements:

- Node 22.13 through 22.x
- no package installation
- no credentials
- no browser
- no prepared database

This produces a local `report.html` and `evidence.json` under `.data/judge-rehearsal/run-*`.

Important limitation:

The rehearsal uses injected managed-session and provider behavior. It demonstrates the actual application/domain/SQL/receipt flow under deterministic fixtures, but it is **not genuine PayPal Sandbox evidence**.

## Full application setup

The complete build uses the pinned Node 22.23.4, Corepack 0.36.0, and pnpm 12.8.2. See [toolchain setup](../engineering/TOOLCHAIN.md) for the older-Corepack cache recovery. These package-manager requirements do not apply to the dependency-free local console above.

Expected release commands:

```bash
npm install --global corepack@0.36.0
corepack enable pnpm
corepack pnpm install --frozen-lockfile
corepack pnpm verify
```

For real Sandbox operation, use only the server-side configuration described in `docs/paypal/SANDBOX_SETUP.md`.

Never put populated Sandbox credentials in the public repository.

## Canonical judge scenario

Creator: Maya Chen  
Buyer organization: Cedar & Tide  
Asset: Harbor After Rain  
Quote: USD 425.00  
Environment: PayPal Sandbox

The target journey is:

1. buyer submits the requested use;
2. AI assistance proposes evidence-backed structured rights;
3. unresolved terms are clarified;
4. creator reviews all material rights;
5. deterministic policy computes USD 425.00;
6. creator approves;
7. buyer accepts the exact terms and quote;
8. creator creates and sends the PayPal Sandbox invoice;
9. buyer uses the PayPal-hosted Sandbox payment path;
10. verified provider evidence updates the financial state;
11. RightsReceipt issues the current permission receipt;
12. public verification shows the minimized current status.

## What judges should evaluate

The intended judging case is not "AI negotiates a license automatically."

The intended case is:

- AI reduces ambiguity without gaining authority.
- Deterministic code controls money.
- Humans approve the commercial terms.
- PayPal is the authoritative payment source.
- The receipt preserves exactly what was agreed and the current permission state.

## Safety and scope

RightsReceipt is a hackathon prototype.

It does not:

- provide legal advice;
- prove copyright ownership;
- prove creator identity;
- provide escrow;
- use production PayPal payments;
- allow AI to set price, approve rights, confirm payment or activate permission.
