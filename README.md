# RightsReceipt

## PayPal AI Hackathon: what RightsReceipt does

A creator gets a request like, "Can we use your image in an ad?" Before anyone pays, they need to agree on exactly what that means. RightsReceipt makes the scope explicit: AI assists with identifying rights and uncertainty, the creator approves a deterministic quote, the buyer accepts the same version, PayPal is the authority for payment, and a verifiable receipt records the resulting permission state.

The canonical test case models a proposed license of Maya Chen's *Harbor After Rain* to Cedar & Tide for a seeded **USD 425.00** quote. This is a deliberately focused creative-image workflow, not an autonomous licensing lawyer or a claim of copyright ownership.

### Try the functioning local judge experience

Use **Node 22.13 through 22.x** from the repository root. It requires no account, secret, dependency installation or paid API:

```bash
node scripts/judge-local-console.mjs
```

Open the printed `http://127.0.0.1:PORT/` address. Select **Run application rehearsal** for three application-handler journeys, including invoice recovery and reset evidence. The button returns immediately to a running-status page that refreshes every two seconds until the evidence has been validated; it can take up to two minutes. If a run fails, no evidence links appear. Then select **Run read-only AI diagnostic** to run the actual SHA-256-verified trained lexical model on two synthetic requests and compare its suggestions with independent source-span extraction. The model route is separate from the simulated transaction and has no payment or consent authority. Stop with Ctrl+C. For automated verification of both paths, run `node scripts/judge-console-real-smoke.mjs` from a complete checkout.

**Check a downloaded source archive before submitting it:** Extract it into a fresh directory, install Node 22.13 through 22.x, and run `node scripts/judge-console-real-smoke.mjs` in that directory. It should report `status: "passed"`, three scenarios, three resets, zero external requests and `paymentEvidence: "simulated_only"`. Then run `node --no-warnings --experimental-strip-types scripts/judge-ai-proof.mjs`; it should independently report real local model inference on synthetic requests and `paymentEvidence: "none"`. Neither command needs `npm install`, PayPal credentials or Cloudflare access. The canonical `--export-public` release now requires these checks on its own sanitized, one-commit export rather than relying on the private checkout's earlier tests.

**Evidence boundary:** The **transaction rehearsal** uses scripted participants and injected PayPal-like responses. It does not run live AI inference, contact PayPal, authenticate a real creator, move money, or grant legal permission. The **separate `/model` diagnostic** performs real local learned inference on project-authored synthetic text, but does not approve terms or establish real-world model accuracy. Neither route establishes genuine Sandbox settlement. The separate [PayPal Sandbox acceptance runbook](docs/paypal/SANDBOX_ACCEPTANCE.md) describes authenticated invoice, buyer payment, paid-status and webhook verification. Do not confuse either local path with production PayPal payments.

### Why PayPal and AI are both central

- **AI proposes; it cannot decide:** source-grounded extraction suggests values, cites evidence and abstains on unclear rights. Human review is mandatory.
- **Humans approve:** the creator fixes the licensed scope and deterministic price; the buyer separately accepts the same terms.
- **PayPal verifies financial truth:** the implemented Sandbox adapter handles invoice creation/sending, authoritative status reconciliation and verified webhook processing. A browser redirect or simulated event is never itself settlement proof.
- **Receipts remain checkable:** canonical records use SHA-256 integrity checks and a privacy-minimized public verification view. This is not a digital signature or proof of copyright ownership.

### Start here

- [Judge instructions and evidence limits](JUDGES.md)
- [Submission documents and current cutover plan](docs/submission/README.md)
- [Architecture and domain model](docs/architecture/README.md)
- [Genuine PayPal Sandbox acceptance](docs/paypal/SANDBOX_ACCEPTANCE.md)

**Submission status:** The [project status](PROJECT_STATUS.md) is authoritative for the latest source revision and release evidence. The [Turn 147 receipt](docs/turns/147-p0-exact-tree-clean-release.md) records a complete pinned Node 22 release and privately audited export for the exact then-merged 804-file source tree. The new export-level judge check is a subsequent improvement and needs a new complete release before its revision is frozen. Genuine buyer-paid Sandbox acceptance, separate public-source publication, an under-three-minute public YouTube video and Devpost confirmation remain open. The localhost rehearsal and independent local model proof do not establish real PayPal settlement.

## Historical engineering checkpoints

The following entries preserve detailed turn-by-turn engineering evidence. The judge quick start above describes the shortest reproducible path; isolated historical test counts should not be mistaken for current exact-release acceptance.

**Current checkpoint: Turn 082, redirect-locked genuine PayPal Sandbox acceptance.** The genuine Sandbox acceptance harness now uses an explicitly manual-redirect HTTP boundary for its OAuth, invoice create/send, paid-status GET and webhook-signature verification calls. It rejects 3xx responses and provider responses reporting a different URL rather than allowing credential-bearing requests to be followed outside `https://api-m.sandbox.paypal.com`. The separate registered-webhook preflight was already manual-redirect. Ten focused Node 22.16.0 transport tests passed four times on the exact new modules, including a redirected POST to production PayPal, spoofed successful responses, malformed endpoints and normal success/error status cases. Two acceptance-harness integration regressions were also staged, but require a complete private checkout to run. No actual PayPal API requests or payments occurred. See [Turn 082](docs/turns/082-p0-paypal-sandbox-redirect-lock.md), [executed focused validation](docs/evidence/turn082/validation.json) and [Sandbox acceptance](docs/paypal/SANDBOX_ACCEPTANCE.md).

**Earlier checkpoint: Turn 081, semantic evidence required before judge success.** After Turn 080's file-pair checks, the console could still announce a successful rehearsal with a failed journey or reset, unexpected network activity, incorrect USD 425.00 price, or unverified receipt if the JSON kept a `passed` label and three array entries. Six HTTP regressions reproduced this false-success behavior before the fix. A new shared minimal semantic validator now checks actual journey status/order, deterministic price, scheduled verified receipt, single invoice creation/send, isolation, repeatability, and restoration/retirement of access after each reset. Both the console and its smoke verifier use it. **52 Node 22.16.0 tests passed**, repeated three additional times, on the exact staged files; the complete real-worker and full `pnpm release:verify` remain unexecuted. See [Turn 081](docs/turns/081-p0-judge-semantic-evidence-validation.md) and [executed local validation](docs/evidence/turn081/validation.json).

**Earlier checkpoint: Turn 079, offline submission-candidate consistency gate.** A new read-only `pnpm submission:candidate:check` binds the exact local release commit/tree, full pinned Node 22 release verification record, sanitized one-commit public export, internally reconciled PayPal Sandbox acceptance files, and proposed public GitHub/YouTube URLs. Missing, mismatched and placeholder inputs fail closed. A matching package still reports `readyForSubmission: false` because the checker cannot independently prove actual PayPal settlement, anonymous public access, video content/duration or Devpost submission. Nine focused Node 22.16.0 regression tests passed, including a synthetic Git checkout. The actual full release suite, genuine Sandbox transaction, public URLs and Devpost confirmation remain outstanding. See [Turn 079](docs/turns/079-p0-submission-candidate-check.md) and [Submission candidate instructions](docs/submission/SUBMISSION_CANDIDATE_CHECK.md).

**Earlier checkpoint: Turn 078, improved judge browser presentation.** The executable localhost judge console now has a responsive, accessible walkthrough with clear stages for rights scope, human approval and pricing, simulated invoice and receipt behavior, and revocation/reset proof. It preserves the same actual worker, CSRF-protected Run form and restricted localhost-only behavior. A per-request 128-bit CSS nonce allows styling without external assets, scripts or weakening the restrictive page CSP. Nine exact-source Node 22.16.0 page tests passed, including post-run evidence links, disabled controls, mobile layout and explicit simulated-payment disclosures. The complete console HTTP tests, real-worker smoke and exact-commit release gate still need execution on the private checkout. No genuine PayPal evidence or deployment was generated. See [Turn 078](docs/turns/078-p0-judge-console-experience.md) and [Judge guide](JUDGES.md).

**Earlier checkpoint: Turn 077, real-worker judge console smoke.** The release verification path now includes `node scripts/judge-console-real-smoke.mjs`, which starts the real localhost judge console, submits its actual Run form, executes the canonical three-journey worker, and checks the resulting report and JSON for three reset proofs, zero external requests, no credentials used, denied previous permissions, and restrictive report headers. This removes reliance on mock-only console tests as the final judge-readiness gate. Eight focused Node 22.16.0 validator and local-HTTP tests passed; the full production-source worker run and exact-commit `pnpm release:verify` remain pending. The output is explicitly `simulated_only` and is not genuine PayPal payment evidence. See [Turn 077](docs/turns/077-p0-real-worker-judge-console-smoke.md) and [Judge guide](JUDGES.md).

**Earlier checkpoint: Turn 076, cross-stage PayPal acceptance linkage.** Final offline evidence reconciliation now requires the same exact saved state hash from Sandbox invoice creation and authenticated paid-status retrieval, a same-app paid-webhook registration attestation at creation, and the same registered webhook ID hash used by the later signature-verification stage. Missing, mixed and legacy records fail closed. Nine isolated Node 22.16.0 tests passed, plus six direct checks of the integrated reconciler against passing and failing three-stage fixtures. These checks only establish consistency of local JSON and do not replace real PayPal evidence. Full private-repository verification and live Sandbox acceptance remain pending. See [Turn 076](docs/turns/076-p0-cross-stage-sandbox-acceptance-evidence.md) and [Sandbox acceptance](docs/paypal/SANDBOX_ACCEPTANCE.md).

**Earlier checkpoint: Turn 075, Sandbox webhook retry-window alignment.** The one-shot collector now uses the same transmission-time limits already enforced by RightsReceipt's independent PayPal signature verifier. Eligible delayed retries are not discarded by a five-minute-old-event cutoff before verification. Future clock skew remains limited to five minutes, and malformed UTC dates are rejected. Eight isolated Node 22.16.0 timestamp-policy tests passed; an integration test for a delayed 20-minute HTTP retry is included but not yet run against the full private checkout. The signature postback, invoice binding and paid financial GET remain mandatory. No real Sandbox payment, webhook delivery, deployment, or clean release suite was executed. See [Turn 075](docs/turns/075-p0-paypal-webhook-retry-window-alignment.md) and [Sandbox acceptance](docs/paypal/SANDBOX_ACCEPTANCE.md).

**Earlier checkpoint: Turn 074, terminal-state enforcement for the private webhook collector.** The one-shot collector now uses a tested synchronous lifecycle state machine so a run that times out or closes cannot later accept a callback or write a private capture. It rechecks the state after reading an in-flight HTTP body and before claiming the slot. Six focused lifecycle tests passed under Node 22.16.0, including simultaneous callbacks and late completion. Three additional HTTP regression cases were added for requests arriving after expiry or finishing after the timeout; these require the complete checkout to execute. No genuine PayPal, public forwarding, payment or full release verification ran. See [Turn 074](docs/turns/074-p0-terminal-webhook-capture-lifecycle.md) and the [Sandbox runbook](docs/paypal/SANDBOX_ACCEPTANCE.md).

**Earlier checkpoint: Turn 073, exact-invoice Sandbox webhook capture.** The one-shot local webhook collector now requires a private `invoice-binding.json` from the original Stage 1 `state.json` before accepting a paid event. A new offline `pnpm sandbox:acceptance:webhook:bind` command binds the collector's private route to a confirmed, sent invoice without printing the invoice ID. Other invoice events and partial/pending payments cannot consume the capture; stale/future transmission times are rejected. The binding module and CLI passed 12 focused Node 22.16.0 tests, and five additional collector regression cases are staged for the complete verification suite. No real PayPal request, public forwarding, transaction or deployment was performed. See [Turn 073](docs/turns/073-p0-exact-invoice-paypal-webhook-capture.md) and [the Sandbox runbook](docs/paypal/SANDBOX_ACCEPTANCE.md).

**Earlier checkpoint: Turn 072, one-shot genuine webhook capture.** A new dependency-free `pnpm sandbox:acceptance:webhook:capture` receiver binds to localhost, generates a private 192-bit route, accepts a bounded `INVOICING.INVOICE.PAID` callback only through an operator-provided HTTPS forwarding endpoint, and saves the original JSON and PayPal signature headers under ignored `.data`. It labels the result `captured_unverified`; the existing independent signature verification and same-invoice check remain mandatory. Ten local Node 22.16.0 regression tests passed against the exact new files. No HTTPS forwarding service, actual PayPal webhook, payment, public deployment or complete release gate was run. See [Turn 072](docs/turns/072-p0-private-genuine-sandbox-webhook-capture.md) and [Sandbox acceptance](docs/paypal/SANDBOX_ACCEPTANCE.md).

**Earlier checkpoint: Turn 071, same-app paid webhook readiness.** The real PayPal Sandbox acceptance harness now checks the registered webhook against the same application credentials used for invoicing before creating an invoice. A new read-only `pnpm sandbox:acceptance:webhook:preflight` command verifies the registered ID, required INVOICING.INVOICE.PAID subscription and public HTTPS listener without modifying PayPal. Ten isolated webhook registration tests and three CLI tests passed under Node 22.16.0; newly added acceptance integration cases and the complete clean Node 22 release gate are not yet executed. No PayPal Sandbox calls, account changes, deployments or payments occurred. See [Turn 071](docs/turns/071-p0-same-app-sandbox-webhook-readiness.md) and [the genuine Sandbox runbook](docs/paypal/SANDBOX_ACCEPTANCE.md).

**Earlier checkpoint: Turn 070, genuine Sandbox buyer handoff.** The acceptance harness can now hand the buyer the real PayPal Sandbox recipient-view link after a successful invoice create/send/GET, without including the link in public evidence or console output. It writes a private `sandbox-payment-link.txt` beside the ignored local state, prints only the `handoffPath`, and regenerates a link on an unpaid read-only status recheck. No link is created for paid/nonpayable invoices. A dedicated five-case Node 22.16.0 regression suite passed; updated end-to-end fixture assertions are staged but the full private-repo suite and live Sandbox remain unexecuted. See [Turn 070](docs/turns/070-p0-private-paypal-sandbox-buyer-handoff.md) and [Sandbox acceptance guide](docs/paypal/SANDBOX_ACCEPTANCE.md).

**Earlier checkpoint: Turn 069, executable local judge browser demo.** `node scripts/judge-local-console.mjs` starts a loopback-only page that lets judges click to run a fresh canonical application-handler rehearsal, then inspect its newly generated report and minimized JSON. It uses scripted people and injected provider replies, not genuine PayPal Sandbox or live AI. Six isolated HTTP tests passed under Node 22.16.0; the complete real handler integration and final release suite remain to be run from the private checkout. The official rules allow a functional self-run demo with complete setup instructions instead of mandatory hosting, so the Cloudflare preview is an optional path. See [Turn 069](docs/turns/069-p0-local-functional-judge-console.md), [judge guide](JUDGES.md) and [status](PROJECT_STATUS.md).

**Current checkpoint: Turn 068, full tracked-source release identity.** The release verifier and one-commit public exporter now compare the current HEAD tree with the staged index and the Git-normalized on-disk bytes of every tracked file. Hidden `skip-worktree` or `assume-unchanged` flags, staged divergence, nonregular entries and altered files cannot produce a green exact-source gate. Nine isolated Node 22.16.0 tests passed and a synthetic 635-file tree passed in approximately 1.2 seconds. Integrated release/export regressions were added but the complete clean Node 22 release run remains unexecuted. No payment, paid API, deployment or public repository operation occurred. See [Turn 068](docs/turns/068-p0-whole-tree-release-identity.md) and [project status](PROJECT_STATUS.md).

**Earlier checkpoint: Turn 067, fail-closed public-source inspection.** The public audit now scans UTF-8 text through 16 MiB, including the 3.59 MB synthetic training dataset previously skipped. Oversized or binary files, invalid UTF-8, unresolved Git LFS pointers, tracked symlinks, and submodule gitlinks are blocking findings rather than silent audit gaps in both the current tree and reachable history. The sanitized one-commit exporter inherits this stricter snapshot gate. Six isolated scanner-policy tests passed under Node 22.16.0. Additional Git-fixture and export regressions are included but have not been executed in this session. No real PayPal, Cloudflare, or public-repository action ran. See [Turn 067](docs/turns/067-p0-no-silent-public-audit-skips.md), [Public Release Audit](docs/engineering/PUBLIC_RELEASE_AUDIT.md), and [project status](PROJECT_STATUS.md).

**Earlier checkpoint: Turn 066, evidence-backed no-login judge walkthrough.** The static `/judge` tour now shows a paraphrased buyer-use example, all twelve human-reviewed rights in an accessible native disclosure, the five exact seeded policy lines that total USD 425.00, and a stage-by-stage offline approval, injected provider and scheduled-receipt timeline. The fixture test clock and manual-review origin are labeled so the page cannot be mistaken for live AI or PayPal Sandbox evidence. New regressions compare quote amounts directly to `seed/demo-reset.sql`, pin rights to the rehearsal source, exclude private buyer text and require those evidence panels in the hosted smoke. Eight isolated tour tests and twenty-six hosted smoke tests passed under Node 24.22.1. No remote deployment, paid API, genuine Sandbox operation or clean Node 22 full verification ran. See [Turn 066](docs/turns/066-p0-evidence-backed-judge-walkthrough.md), [judge quick start](docs/submission/JUDGE_QUICKSTART.md) and [project status](PROJECT_STATUS.md).

**Earlier checkpoint: Turn 065, runtime-verified restricted judge preview.** The Worker now exposes a privacy-preserving `GET /api/judge/runtime-profile` attestation that passes only when its effective judge-mode feature flags, expected DB/assets bindings, exact HTTPS origin and allowed binding names match the restricted preview contract. Unexpected secrets or enabling any creator, payment or webhook side effect yield a sanitized HTTP 503. The hosted smoke now requires this hardened endpoint and exact judge mode as its eleventh read-only probe; the guarded launcher rejects a ten-probe/stale result. Forty-five isolated runtime, smoke and launcher regressions passed under Node 24.22.1. This does not prove the deployed source commit, guarantee complete runtime security, or substitute for genuine PayPal Sandbox evidence. No live Cloudflare or PayPal operation or clean Node 22 full verification ran. See [Turn 065](docs/turns/065-p0-restricted-judge-runtime-attestation.md), [judge quick start](docs/submission/JUDGE_QUICKSTART.md) and [project status](PROJECT_STATUS.md).

**Earlier checkpoint: Turn 064, verified restricted judge deployment launcher.** `pnpm deploy:judge:preview` now uses one fail-closed runner: validate the ignored judge config and reject local dotenv overrides, build with provider credentials stripped, issue a fixed read-only remote D1 migration-ledger SELECT, refuse deployment on incomplete/incorrect migration evidence, deploy the separate restricted Worker only after those gates pass, and run the then-ten-probe signed-out security smoke against the configured HTTPS origin. The command never applies migrations, creates D1, issues private capabilities or contacts PayPal; its remote read/deploy stages require approved Cloudflare access and may incur account usage. Fourteen isolated launch regressions passed under Node 24.22.1 with injected commands. No real deployment, exact Node 22 release gate or genuine PayPal Sandbox payment has run. See [project status](PROJECT_STATUS.md), [Turn 064](docs/turns/064-p0-verified-judge-preview-launch.md), and [judge quick start](docs/submission/JUDGE_QUICKSTART.md).

**Current checkpoint: Turn 061, working restricted judge buyer entry.** The tracked judge template previously set `HUMAN_CONSENT_ORIGIN` to an empty string even though native buyer pages require that value to equal the public Worker origin. The preflight now enforces both origin settings together, and the template makes the shared placeholder explicit. A new route regression verifies that the configured signed-out buyer form and client script return HTTP 200 while creator issuance stays disabled. Hosted smoke now requires the buyer private-code entry, not just a form marker. Fifteen configuration, six route and fourteen smoke tests passed in isolated Node 24.22.1 runs. No real judge deployment, Node 22 release gate or genuine PayPal Sandbox payment has been completed. See [project status](PROJECT_STATUS.md), [Turn 061](docs/turns/061-p0-judge-buyer-origin-readiness.md) and [judge quick start](docs/submission/JUDGE_QUICKSTART.md).

**Release status: NOT READY.** All external-operation flags remain off. Local tests inject the managed gateway and PayPal responses; no live login, deployed D1, genuine Sandbox payment/refund or complete public judge path has been verified. The local dependency/build/test gate is green; a clean-commit `pnpm release:verify`, genuine Sandbox acceptance, deployment and public export remain open. The learned model is diagnostic only; unsafe held-out outputs still prohibit automatic learned rights resolution.

## Release-candidate verification

The final release must pass against one exact clean commit. The repository now provides:

```bash
node scripts/release-candidate-verify.mjs --preflight-only
pnpm release:verify
```

The preflight refuses a dirty checkout, unsupported Node version, changed package-manager pin, missing or uncommitted lockfile, lockfile contents differing from `HEAD`, or ignored local `.env*` / `.dev.vars*` overrides. Full mode strips known provider credentials and Vite variables, forces local/fake mode with live-operation flags disabled, then performs the frozen install, complete verification gate and canonical judge rehearsal. Evidence stays under ignored `.data/release-candidate`. Use a separate credential-free checkout for this offline release gate.

**Local gate:** `pnpm-lock.yaml` is now pinned and passed a frozen install, complete local verification, build and dry run. Final `pnpm release:verify` must still be run from an exact clean Git release checkout. See [release candidate verification](docs/engineering/RELEASE_CANDIDATE_VERIFICATION.md) and [Turn 051](docs/turns/051-p0-reproducible-release-build.md).

The genuine PayPal evidence path is also prepared:

```bash
pnpm sandbox:acceptance:webhook:preflight
pnpm sandbox:acceptance:create
pnpm sandbox:acceptance:check -- --state .data/.../state.json
pnpm sandbox:acceptance:webhook -- --capture .data/paypal-webhook.json --state .data/.../state.json
```

These commands are Sandbox-only and keep private state/evidence under ignored `.data`. A successful create/send run prints the private `handoffPath`; read the link only from that local file to pay using a personal Sandbox account. An unpaid `check` regenerates the file without resending. The link is never copied into public evidence. Actual Sandbox execution remains a release gate. See [Turn 049](docs/turns/049-p0-paypal-sandbox-acceptance-harness.md).

## Reconcile Sandbox acceptance evidence

After completing a genuine Sandbox invoice/payment/webhook journey, run the read-only reconciliation of the three sanitized stage artifacts:

```bash
pnpm sandbox:acceptance:evidence:check -- --create PATH_TO_CREATE_EVIDENCE --paid PATH_TO_PAID_EVIDENCE --webhook PATH_TO_WEBHOOK_EVIDENCE
```

The command checks that payment and webhook evidence refer to one exact invoice. A green result does not prove that the JSON originated from PayPal, and does not replace real Sandbox acceptance. See the [Sandbox acceptance runbook](docs/paypal/SANDBOX_ACCEPTANCE.md).
## Public repository audit

Before changing GitHub visibility, run:

```bash
pnpm public:audit
```

The full audit scans both current tracked files and reachable Git history. The development history contains a known non-fixture author-email privacy blocker, so this private repository is not the publication target.

The release build uses the snapshot-only audit. After the final candidate passes, run:

```bash
pnpm public:export -- --release-evidence .data/release-candidate/run-.../verification.json
```

That command now requires the intact full `pnpm release:verify` evidence bundle for the same commit before creating a fresh one-commit repository with GitHub noreply metadata. It still requires the public Git tree SHA to match the frozen private source tree and runs the full history-aware audit against the exported repository. A matching local JSON/log bundle is not proof of genuine PayPal Sandbox payment.

See [public release audit](docs/engineering/PUBLIC_RELEASE_AUDIT.md) and [Turn 050](docs/turns/050-p0-public-release-audit.md).

## Restricted Cloudflare judge preview

The `/judge` route is a self-contained signed-out narrative, not a live transaction. It is available without a code, uses only synthetic fixture values and records no payment. A restricted hosted preview additionally exposes native buyer and receipt entry screens, which cannot open private cases without creator-issued access. The overview routes judges to the truthful tour rather than a local-only seeded transaction.

The tracked Wrangler default remains local-only and cannot pass the deployment guard. The public-source audit also rejects any force-tracked local judge config. `wrangler.judge.example.jsonc` defines a separate Worker with a D1 binding, the default `d1_migrations` ledger pinned explicitly, a public-origin placeholder and Sandbox-only configuration. Copy it to ignored `wrangler.judge.local.jsonc`, fill in the approved D1 UUID and set both `RIGHTS_RECEIPT_PUBLIC_ORIGIN` and `HUMAN_CONSENT_ORIGIN` to the exact same public HTTPS Worker origin, then validate the local config. After approved remote migrations are applied, check the ledger before deployment:

```bash
pnpm judge:deploy:check
pnpm wrangler d1 execute DB --remote --config wrangler.judge.local.jsonc --json --command "SELECT name FROM d1_migrations ORDER BY id" | pnpm judge:d1:ledger:check
pnpm deploy:judge:preview
```

The launcher repeats the read-only ledger check immediately before the actual deploy and automatically runs the signed-out HTTP smoke afterward. It stops on a failed gate without echoing CLI output; if smoke fails after deploy, the remote Worker may already have changed. The config check and ledger JSON parser are offline; the middle command performs a remote read and must be run only against an approved account and database. The deployment command itself enforces static configuration, while the hosted health gate independently enforces schema and ledger presence. Do not deploy until the Cloudflare account, D1 migrations and usage implications are approved. The preview serves the signed-out buyer intake shell, clarification and consent scaffolding, and guarded receipt reading, but it cannot issue a private buyer capability while creator access is disabled. It also leaves invoice sending, payment processing, webhooks and receipt issuance disabled. It is not yet a complete genuine Sandbox demo. The safe deployment sequence is in [judge quick start](docs/submission/JUDGE_QUICKSTART.md).

## Verify hosted judge access after deployment

Once a safe Sandbox-only judge build exists, run:

```bash
pnpm judge:hosted:smoke -- --origin https://YOUR-APPROVED-JUDGE-HOST
```

This checks nine signed-out, read-only Worker/browser-entry routes, including the buyer form's private-code entry, with a strict HTTPS origin, bounded responses and no redirects, credentials or payment calls. The health probe now requires `persistence: ready` from an actual read-only D1 schema and Wrangler migration-ledger query, rejecting missing/unmigrated bindings and older Worker builds. It also fails when buyer or receipt pages are unavailable, local mocks are exposed, or legacy creator access is public. The checked-in Wrangler config remains local-only and has no D1 binding. Passing this smoke test is not a substitute for all migrations, a full browser walkthrough or genuine PayPal Sandbox acceptance. See [judge quick start](docs/submission/JUDGE_QUICKSTART.md).

## Run the local judge rehearsal

With Node 22.13 through 22.x, run from the repository root:

```bash
node scripts/judge-rehearsal.mjs
```

No package installation, browser, provider credentials or existing database is required. The command uses disposable in-memory SQLite and injected session/provider responses. It prints the paths to a new `report.html` and `evidence.json` under `.data/judge-rehearsal/run-*`. The HTML opens locally, works without JavaScript, and labels the simulation clearly.

The report shows 54 steps across three journeys, the deterministic $425.00 quote, one invoice creation and send per journey, independent financial reconciliation, a verified scheduled receipt, and retirement of old buyer/receipt/case access after reset. The repeated ordinary journey must match the first one exactly after private runtime identities are removed.

Use `--output DIRECTORY` to choose another output parent or `--help` for usage. Each invocation creates a fresh run folder and preserves existing files. The same command is available as `pnpm judge:rehearse`; `pnpm judge:verify` runs the focused regression gates. See the [demo guide](docs/demo/README.md) for the generated example and evidence limits.

## Keyboard operation and form recovery

The buyer request, clarification and acceptance pages and the creator link, rights-review and invoice-control pages share keyboard recovery behavior. Validation summaries link to the affected fields and preserve their instructions. Explicit successful commands focus their result; uncertain commands focus the same retry; stale or expired views offer a usable recovery control. Passive loads and delayed responses do not take focus away after the user moves elsewhere.

The targeted browser audit covers 17 scenarios and 134 checks, including a response held past private-view expiry, exact retries without duplicate records, all six page roles, responsive layouts and private-state clearing. It uses actual application handlers with injected gateway/provider fixtures. It is not a full-application or screen-reader accessibility audit. Run it with `pnpm accessibility:browser` when Playwright and Chromium are available; the [engineering guide](docs/engineering/KEYBOARD_FORM_RECOVERY.md) describes the native command and evidence.

## Recovery from stalled requests

Initial session checks, review reads, confirmed writes and payment checks now have a fixed 15-second deadline per request, including JSON consumption. Timeout exposes Reload or private-code entry for a read, or the exact pending command for a deliberate write retry. Creating a private request link retains the generated token while the page remains open. A successfully acknowledged save remains acknowledged if its following refresh times out.

The helper never retries automatically. A timeout cannot prove that a server transaction was canceled, so the existing exact-command and provider-operation guards remain authoritative. Private-view expiry and clearing still take precedence. A page load may perform several requests in sequence, each with its own deadline; blocked synchronous JavaScript cannot be preempted by a timer.

Run `pnpm request:deadline:verify` for the deterministic boundary checks or `pnpm request:deadline:browser` for the actual-handler Chromium scenarios. The native collection is part of the transaction verification gate. The [engineering guide](docs/engineering/BROWSER_REQUEST_DEADLINES.md) records the timing contract, recovery choices and local fixture limits.

## Private recovery after a changed offer

When an acceptance receives a terminal rejection, the buyer page now clears its code, pending command, displayed rights and financial navigation together. Reload becomes unavailable and the empty private-code field becomes the recovery point. Waiting or activating stale controls cannot reuse the old access. Deliberate reentry reads the current record and starts with unchecked confirmation; it never accepts the changed offer automatically.

The separate paths for uncertain writes and independently valid receipts retain their existing bounded recovery. Run `pnpm buyer:boundary:browser` for the targeted actual-handler checks. The [engineering guide](docs/engineering/BUYER_PRIVATE_RECOVERY.md) describes the before-change witness and the distinction between local clearing and server capability validity.

## Receipt loading and output recovery

The protected receipt page accepts a deliberate replacement code while a read is pending, including the same code again. Each request owns its session and cancellation; an old response cannot restore the previous document or release its output. Close remains enabled during loading while Refresh, Print and Export are disabled.

Headers and the complete response body share a 15-second deadline. A current view is bounded by 60 seconds from request start, its next licensing boundary and UTC midnight. Print completes its own fresh read; export must finish while its original view is still current. Failed or canceled operations expose code reentry, and lifecycle clearing takes priority.

Run `pnpm receipt:experience:verify` for the native experience/client collections or `pnpm receipt:recovery:browser` for the actual-handler browser scenarios. The [engineering guide](docs/engineering/RECEIPT_SESSION_RECOVERY.md) describes the reproduced race, repaired behavior and fixture limits.

## Receipt response validation

Protected receipt responses require HTTP 200, the expected HTML or JSON media type, supported UTF-8 metadata and a valid receipt digest. HTML must supply a single receipt document and complete, strict UTC timing metadata. JSON export must match the digest of the current view and the SHA-256 of its exact bytes. Invalid responses clear active access and provide deliberate code reentry.

Bounded streaming, envelope validation and hashing share the original 15-second request deadline; canceled or expired work cannot release a late download. The client preserves verified export bytes without JSON reserialization. Server authorization, canonical receipt-chain and business-source validation remain unchanged.

Run `pnpm receipt:response:browser` for actual-handler response-fault scenarios, or `pnpm receipt:experience:verify` for the native experience/client collections. The [engineering guide](docs/engineering/RECEIPT_RESPONSE_VALIDATION.md) records the response contract and verification limits.

## Receipt body limits

Protected reads accept at most 262,144 decoded JSON bytes or 131,072 decoded HTML bytes. The client copies accepted chunks into a fixed-capacity buffer and cancels on the first overflow, before parsing or hashing. Declared identity lengths must match the actual body; compressed-response lengths are treated separately from decoded bytes. Close, replacement and deadlines also cancel active or late-arriving bodies without waiting for cancellation to settle.

The HTML ceiling is supported by the renderer's validated field limits and permanent stress cases with maximum escaped text, 32 quote rows and 1,024 audit anchors. These local cases render below 86 KB. The client limit does not claim to bound transport buffers or a producer's already allocated chunk.

Run `pnpm receipt:stream:browser` for actual-handler streaming faults and near-limit cases. The [body limit guide](docs/engineering/RECEIPT_BODY_LIMITS.md) documents the byte budgets, cancellation and fixture scope.

## Current canonical transaction entry points

- Creator request link: `/creator/requests/:assetId`, using the managed session and SQL asset/workspace ownership.
- Buyer initial request: `/buyer/request#<capability>`, with immutable submission and later continuation from the same private link.
- Buyer clarification: `/buyer/clarification#<clarify-capability>`, with immutable answer submission and a separate human review step.
- Creator terms re-review: `/creator/clarification/:caseId`, using the managed creator session and exact saved answer revision.
- Creator: `/creator/review/:caseId`, using a verified managed creator session and workspace ownership.
- Buyer: `/buyer/review#<review-capability>`, with the fragment removed before data requests and explicit acceptance of exact rights and price.
- Creator invoice API: `/api/invoices/creator/cases/:caseId`, with separate confirmed `/create` and `/send` commands.
- Creator recovery API: `GET /api/invoices/creator/cases/:caseId/recovery` for local metadata and a separate confirmed `POST /recover` for the exact recorded operation.
- Buyer status API: `GET /api/invoices/buyer/status`, using the private review capability and local reads only.
- Buyer handoff API: `POST /api/invoices/buyer/handoff`, using the exact case revision and invoice ID to request a fresh validated Sandbox link.
- Current receipt: `/receipts/buyer` with independent receipt-scoped access, plus minimized `/verify/receipt/:publicId` verification.

A page load or status refresh does not contact PayPal. Saving clarification answers invalidates the earlier offer and consent pointers without making rights or a price. Human re-review remains separate from approval and acceptance. Payment links expire within 30 seconds and cannot confirm payment or grant permission. The financial processor and receipt reader independently validate payment evidence, receipt integrity and licensing dates. Private receipt navigation remains available when a previously licensed asset is archived. This source checkpoint has no public deployment URL.

The current persistence schema has nine migrations and 33 domain tables. Turn 050 adds no migration or dependency; the seed schema metadata remains version 9. `INVOICE_RECOVERY_ENABLED`, `REQUEST_INTAKE_ENABLED`, `CLARIFICATION_ENABLED` and all external-operation flags remain off. Actual handlers produce every transactional record in the local rehearsal. Recovery scenarios prove that continuing the existing operation does not duplicate creation or sending. Legacy path-token request routes remain limited to local-memory demo mode.

The feature descriptions below preserve the earlier implementation slices. Use `PROJECT_STATUS.md` and the latest turn receipt for current completion and verification status.

## The problem

Creators often receive vague requests such as, “Can we use this photo in an advertisement?” The request may omit duration, territory, media, modification rights, attribution, exclusivity, sublicensing, or AI-training rights. Informal approval creates uncertainty for both creator and buyer.

RightsReceipt turns that conversation into an explicit workflow while keeping consequential authority with people, deterministic code, and verified PayPal payment evidence.

## Implemented slices

### Engineering foundation

- pnpm workspace with React, Hono, and eleven internal packages
- one-origin Cloudflare Worker design
- strict TypeScript, ESLint, Vitest, build, and deployment dry-run commands
- local quality and package-boundary checks
- no GitHub Actions or paid AI dependency

Turn 051 resolved the earlier registry/lockfile blocker: the frozen install, installed-library typecheck, lint, Vitest, Vite production build and Wrangler dry run passed under the pinned toolchain. The live release acceptance gates remain pending.

### Persistence

- two ordered and hash-tracked SQL migrations
- 25 constrained domain tables
- deterministic Harbor After Rain judge seed and reset
- migration drift detection
- append-only evidence guards
- six passing dependency-free SQLite integration tests

### Creator workspace and assets

- creator workspace and pricing-policy summary
- seeded Harbor After Rain asset catalog
- asset detail with provenance, availability, controlled preview, fingerprint, and related-case count
- controlled metadata registration for a photograph or illustration
- D1-shaped repositories and a visibly labeled local memory adapter
- seven passing dependency-free asset tests

### Buyer request intake

- fresh 256-bit asset-bound request capabilities
- SHA-256 digest storage rather than plaintext token storage
- buyer identity, organization, email, intended-use, and versioned consent intake
- immutable original request evidence and separate normalization
- safe rejection of markup, templates, malformed values, archived assets, and duplicate submission
- D1-shaped and local-memory request repositories
- nine passing dependency-free request tests

### Structured rights review

- creator queue for submitted licensing cases
- immutable original buyer evidence beside the review
- fixed review of all twelve material rights fields
- explicit supported, unresolved, contradictory, and unsupported states
- supported P0 value validation and canonical ordering
- manual human corrections without invoking AI
- immutable terms versions, human field observations, attempt records, and audit events
- deterministic blocked or ready-for-pricing gate without calculating a quote
- D1-shaped and local-memory terms repositories
- ten passing dependency-free terms tests

### Deterministic pricing

- exact seeded policy ID, version, rules JSON, and SHA-256 integrity check
- twelve-field fail-closed validation before quoting
- integer-cent policy rules, deterministic line-item selection, and stable calculation hashes
- Harbor After Rain five-line regression totaling exactly $425.00
- immutable quote versions, historical superseding, optimistic concurrency, and audit records
- D1-shaped quote repository and explicitly labeled local-memory quote adapter
- creator quote API routes and itemized React view
- twenty passing dependency-free pricing and quote SQL-adapter tests

## Implemented routes

Creator routes:

```text
/creator
/creator/assets/new
/creator/assets/:assetId
/creator/cases
/creator/cases/:caseId
/creator/cases/:caseId/quote
```

Buyer routes:

```text
/buyer/demo
/request/:capability
```

Current API routes include:

```text
GET  /api/creator/workspace
GET  /api/creator/assets/:assetId
POST /api/creator/assets
POST /api/creator/assets/:assetId/request-links
GET  /api/request/:capability
POST /api/request/:capability
GET  /api/creator/cases
GET  /api/creator/cases/:caseId/terms
POST /api/creator/cases/:caseId/terms
GET  /api/creator/cases/:caseId/quote
POST /api/creator/cases/:caseId/quote
```

The older creator APIs listed in this section are local demonstration routes. Their `x-rightsreceipt-demo-role: creator` header is blocked on public origins, D1-bound environments and Sandbox/judge modes. The canonical creator review and invoice routes above use the managed session verifier instead.

## Local-only simulated transaction

Turn 013 connects exact creator approval, buyer acceptance, and a fake paid event to a publicly checkable simulated receipt. The receipt is SHA-256 hashed and deliberately **does not prove PayPal payment or grant a real license**.

- Creator step: `/creator/cases/:caseId/mock`
- Buyer step: `/request/:capability/mock`
- Simulated verification: `/verify/simulated/:publicId`

Run the dependency-free service suite:

```bash
node --no-warnings --experimental-strip-types --test scripts/mock-transaction-local.test.mjs
node --no-warnings --experimental-strip-types --test scripts/ai-contract-local.test.mjs
node --no-warnings --experimental-strip-types --test scripts/gate-a-local.test.mjs
```

**21 of 21 local tests passed.** The Hono full-chain test has been authored but not executed; Vitest, browser, Wrangler, and real PayPal remain pending. See [engineering documentation](docs/engineering/MOCK_VERTICAL_SLICE.md).

## Local AI extraction safety contract

Turn 014 introduces a strict rights-extraction-v1 proposal validator, Zod wire contracts, exact UTF-16 source spans, supported P0 field values, model artifact/version binding, per-field abstention, immutable result snapshots, and explicit human-review authority. Model predictions never set prices, approve terms, confirm payments, or issue permissions.

- [AI Task Contract](docs/model/AI_TASK_CONTRACT.md)
- [Turn 014 receipt](docs/turns/014-ai-task-contract-and-safety.md)

The Turn 014 contract was verified with twenty-eight dependency-free tests. Later turns added the trained diagnostic model and source-grounded extraction; consult the model card for their current restrictions.

## Reproducible local AI training data

Turn 015 commits all 1,440 synthetic labeled examples and 24 quarantined unsafe-input probes. Twelve template families are allocated to train, validation and held-out test partitions without overlap. Each record contains exactly twelve gold labels, abstention states and exact original-text UTF-16 evidence offsets. A checked-in manifest binds files and generator source with SHA-256. This Turn 015 dataset preceded the later trained diagnostic model. No real-world accuracy claim follows from these synthetic examples.

```bash
node scripts/generate-synthetic.mjs --verify
node --test scripts/generate-synthetic.test.mjs
node scripts/generate-synthetic.mjs --check
```

See [synthetic dataset provenance and limitations](docs/model/SYNTHETIC_DATASET.md).

## Deterministic extraction baseline

Turn 016 adds a model-free, source-evidence extractor that only resolves supported, explicitly stated P0 clauses. The twelve fields preserve unresolved, contradictory and unsupported states and original UTF-16 evidence offsets. Missing licensing rights never default to permission. All proposals are review-only, not quoteable and never payment authority.

The parser and safety wrapper are verified with 21 focused Node regression tests and strict TypeScript checks. The exact Turn 015 synthetic training, validation and held-out JSONL partitions were scored against their SHA-256 manifest. Every resolved label and abstention on those authored templates matched, but **this is not a real-world accuracy result** because the held-out families reuse the same rights-clause phrases. Novel natural-language evaluation and learned-model validation remain pending.

```bash
node --no-warnings --experimental-strip-types --test scripts/deterministic-local.test.mjs
node --no-warnings --experimental-strip-types scripts/evaluate-deterministic.mjs
```

- [Deterministic extraction report](docs/model/DETERMINISTIC_BASELINE.md)
- [Turn 016 receipt](docs/turns/016-deterministic-extraction-baselines.md)

## Product contract

Canonical product records:

- [`docs/product/PRODUCT_BRIEF.md`](docs/product/PRODUCT_BRIEF.md)
- [`docs/product/MVP_SCOPE.md`](docs/product/MVP_SCOPE.md)
- [`docs/product/ACCEPTANCE_MATRIX.md`](docs/product/ACCEPTANCE_MATRIX.md)
- [`docs/product/USER_JOURNEYS.md`](docs/product/USER_JOURNEYS.md)
- [`docs/product/VISUAL_SYSTEM.md`](docs/product/VISUAL_SYSTEM.md)

The P0 release remains deliberately narrow: one visual asset per request, English, USD, one seeded creator workspace, commercial paid social use on Instagram or Facebook, United States and Canada territory, non-exclusive rights, crop-only or no modification, no sublicensing, and no AI use.

## Architecture and authority

The accepted system and domain design is documented in:

- [`docs/architecture/SYSTEM_ARCHITECTURE.md`](docs/architecture/SYSTEM_ARCHITECTURE.md)
- [`docs/architecture/DOMAIN_MODEL.md`](docs/architecture/DOMAIN_MODEL.md)
- [`docs/decisions/README.md`](docs/decisions/README.md)

Authority remains separated:

- AI may propose structured terms, evidence, confidence, and clarification needs.
- Deterministic code validates scope, calculates integer-cent prices, and enforces lifecycle rules.
- The creator reviews and approves exact terms and a quote.
- The buyer accepts the same immutable version.
- PayPal provides authoritative Sandbox payment state.
- The clock and licensing dates determine scheduled, active, and expired permission states.

Turn 011 and Turn 012 do not invoke AI.

Turn 012 calculates prices exclusively from the creator policy and supported saved terms. Quoting alone does not approve rights, create invoices, confirm payment, or issue permission.

 Every saved observation from the manual review is labeled human-entered and has no model confidence or fabricated evidence span.

## Gate A readiness review

The mock transaction flow now has a fail-closed local-only creator perimeter. The previous forgeable header is blocked on public origins, D1-bound environments, and sandbox/judge modes. This is a temporary safeguard, not public authentication. The buyer screen no longer links into creator actions. Simulated receipt verification checks the current deterministic quote, canonical payload, approvals, and fake payment reference in addition to SHA-256. Memory evidence reads are isolated copies.

**Gate A is not passed:** dependency installation, the original Hono full-chain/mock browser gate, authenticated public access, deployed Cloudflare D1 and genuine PayPal Sandbox evidence remain pending. Turn 035 adds a distinct native canonical transaction browser integration test. See [Gate A audit](docs/engineering/GATE_A_AUDIT.md).

## Local verification

The implemented dependency-free gates can run without a package installation:

```bash
node --no-warnings scripts/db-local.mjs verify
node --no-warnings --test scripts/db-local.test.mjs
node --no-warnings --experimental-strip-types --test scripts/asset-local.test.mjs
node --no-warnings --experimental-strip-types --test scripts/request-local.test.mjs
node --no-warnings --experimental-strip-types --test scripts/terms-local.test.mjs
node --no-warnings --experimental-strip-types --test scripts/pricing-local.test.mjs scripts/quote-service-local.test.mjs
```

For the complete gate, use the pinned Node 22.23.4 and Corepack 0.36.0. The dependency-free judge console above remains available on Node 22.13 through 22.x. See [toolchain setup](docs/engineering/TOOLCHAIN.md) for older-Corepack cache recovery and the version-scoped native build approvals.

```bash
npm install --global corepack@0.36.0
corepack enable pnpm
corepack pnpm install --frozen-lockfile
corepack pnpm verify
```

The installed-dependency gate passed on Node 22.18.0 with pnpm 12.8.2, including the complete `pnpm verify` command. A clean-checkout release-verifier evidence bundle and genuine PayPal Sandbox acceptance remain pending.

## Product boundaries

RightsReceipt does not:

- provide legal advice;
- verify copyright ownership, identity, or authority to license;
- provide escrow or hold funds;
- let AI set prices, approve rights, confirm payment, or activate permission;
- use production PayPal payments during the hackathon build;
- require a paid AI API;
- hide uncertainty in extracted or manually reviewed terms;
- silently coerce unsupported rights into supported values.

## Repository records

- [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md): master backlog and management-turn protocol
- [`PROJECT_STATUS.md`](PROJECT_STATUS.md): canonical current truth and blockers
- [`docs/engineering/`](docs/engineering/README.md): executable implementation and verification records
- [`docs/turns/`](docs/turns/README.md): auditable receipts for management turns

## License

This repository is licensed under the [MIT License](LICENSE).
