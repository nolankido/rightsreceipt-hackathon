# RightsReceipt: final submission cutover checklist

**Updated:** November 4, 2026  
**Submission target:** November 9, 2026 at 3:00 p.m. Eastern  
**Official cutoff:** November 12, 2026 at noon Pacific / 3:00 p.m. Eastern  
**Status:** BLOCKED until evidence below is independently obtained.

This is an **operator runbook**, not a representation that a release, provider payment, public upload or Devpost submission has occurred. Follow [readiness evaluation](READINESS_EVALUATION_2026-11-04.md) for rationale. Keep private evidence under ignored `.data/`, not in Git, the video, or the public submission.

## Absolute priorities

1. Get a clean, pinned, **full** release on one exact commit. Do not confuse focused regressions with the release gate.
2. Prove a genuine PayPal Sandbox invoice was sent, paid by a separate test buyer, retrieved as PAID, and matched to a signature-verified webhook. A scripted/injected provider does not satisfy this stronger internal evidence target.
3. Export a **fresh, one-commit, sanitized** public repository from that verified source. Do not change the private development repository to public.
4. Capture a working product video **under three minutes**, publish it on YouTube as **Public**, and verify anonymous viewing.
5. Finish and **submit** Devpost with the real public source/video links; save a confirmation. A saved draft does not count.

## Operator gates, in chronological order

### Gate A: freeze and reproduce

- [ ] Select the freeze commit on `main`; note its SHA privately.
- [ ] In a clean checkout use Node 22.13+ <23 and pnpm 12.8.2.
- [ ] Run `pnpm install --frozen-lockfile`.
- [ ] Run `pnpm submission:candidate:verify` to exercise both artifact-integrity regression suites, including the real `judge/run-XXXXXX/` layout. These are local tests, not proof of final external readiness.
- [ ] Run `pnpm release:verify`; preserve the full tool-generated verification record and logs.
- [ ] Use only the original regular `verification.json` generated under the owned private clean-release evidence run directory. Do not substitute a symlink, renamed, nested or copied evidence record to pass the wrapper.
- [ ] If a release stage fails, read the outer JSON `diagnostics.firstFailedStage` and allowlisted `diagnostics.failureCodes`, then inspect the private `verification.json` and matching logs using the [bounded release-stage triage guide](CLEAN_CHECKOUT_RELEASE.md#bounded-release-stages-and-timeout-triage). Do not substitute a partial preflight for the complete clean release.
- [ ] If requesting remote diagnostic help, run a new `node scripts/clean-release-checkout.mjs --shareable` from the complete private checkout and share only its fixed, path-free JSON. Never paste private evidence/logs or the normal path-bearing release response.
- [ ] To avoid repeating the complete full release solely to recover export paths, prefer a single `node scripts/clean-release-checkout.mjs --shareable --export-public` run. Check the safe stdout's `privateHandoffSaved` flag, then inspect the matching private `.data/clean-release/handoffs/run-*.json` locally for exact checkout/export paths. Never share or publish that private file, and never treat an absent or false flag as a saved result.
- [ ] Confirm `status: passed`, mode `full`, exact HEAD/lockfile identity, and all required stages successful. If failed: log the **specific** stage, fix, select a new freeze commit, and rerun the entire gate.
- [ ] Confirm the full release's `judge:console:verify` stage executed both `judge:ai:proof:verify` and `judge:ai:proof` with passing exit codes. The proof command prints actual-model JSON and explicitly states `paymentEvidence: "none"`; a successful proof is not a paid invoice or a functioning UI.
- [ ] Confirm **Run read-only AI diagnostic** successfully loads the bundled classifier at `/model`, displays the model SHA-256, 24 learned/source comparison rows, and a contradictory synthetic case. This separately proves local model execution, not payment or legal authority.
- [ ] Run the local functional judge command `node scripts/judge-local-console.mjs`; verify it in a fresh browser. Clearly label its injected PayPal-like simulation.

**Go only if:** one exact commit passed the full release gate and the judge path behaves as documented. Do not film final release behavior based on an older commit.

### Gate B: Sandbox reality

- [ ] Read `docs/paypal/SANDBOX_ACCEPTANCE.md` and use the prescribed acceptance harness.
- [ ] Use only developer Sandbox merchant and separate personal Sandbox buyer credentials. Never use live-money endpoints.
- [ ] In one-shot collector mode, run `node scripts/sandbox-webhook-preflight.mjs --probe-public` with the approved HTTPS forwarder already running. Require `localCollectorReady: true`, `publicForwarderReady: true` and `exactCallbackChecked: true` before invoice creation. A stopped collector, stale route or nonforwarding public endpoint must fail before PayPal OAuth. This is an instant liveness check, not signed delivery proof. Hosted listeners use the ordinary registered-webhook preflight.
- [ ] Verify `exactCallbackChecked: true` before invoice creation. For the one-shot collector, use the safer `PAYPAL_SANDBOX_WEBHOOK_PUBLIC_ORIGIN` plus `PAYPAL_SANDBOX_WEBHOOK_PRIVATE_ROUTE_FILE` pair, which reads the current route without copying its secret URL. For a hosted callback, use `PAYPAL_SANDBOX_EXPECTED_WEBHOOK_URL` alone. The two methods are mutually exclusive. Restarting the collector requires updating the registered PayPal callback before Stage 0. Do not expose any private route in Git, shell history, logs or screenshots.
- [ ] Establish the publicly reachable, registered HTTPS:443 webhook receiver **before payment**; check the event type and app registration. For a one-shot collector, bind the exact created invoice and have the collector listening **before** buyer payment.
- [ ] Create and send the canonical USD 425.00 Sandbox invoice.
- [ ] Let the separate Sandbox buyer pay; retrieve PAID using the authenticated PayPal financial API.
- [ ] Verify the authentic signed event for the same invoice and reconcile the three sanitized stage records with the existing acceptance evidence checker.
- [ ] Pass the original private `--state` file to the webhook CLI. Check that its own result is `passed` only for the exact invoice with both `INVOICING.INVOICE.PAID` and resource status `PAID`. Pending, partial, unrelated and missing-state captures are not paid-webhook evidence.
- [ ] Preserve real provider evidence only in ignored private storage. Redact screenshot addresses and browser UI; never copy secrets or private payment URLs into Git or Devpost.

**Go only if:** exact-invoice, provider-origin and lifecycle evidence is consistent. If blocked by account credentials or webhook registration by November 7, record the precise limitation and avoid claims of a genuine completed payment. Do not hold all other submission preparation hostage to repeated speculative Sandbox attempts.

### Gate C: safe public repository

- [ ] Run `pnpm public:audit` against the frozen candidate, including history-aware inspection.
- [ ] Run the documented `pnpm public:export` with the **same** passing release verification record.
- [ ] Check one clean public commit, unchanged source tree, expected author metadata, no remote, visible MIT LICENSE, working local setup, absence of private artifacts and no secret-bearing blobs.
- [ ] Create a **separate** public GitHub repository from the export. Never flip `nolankido/rightsReceipt` public.
- [ ] Follow [Safe Public Release Publication](SAFE_PUBLIC_RELEASE_PUBLICATION.md): create an empty public destination without initial files, run the local preflight first, then use the explicit `--publish` command on the exact verified export. Never push the original private checkout.
- [ ] Run the [anonymous public-source check](ANONYMOUS_PUBLIC_GITHUB_CHECK.md) against the exact private export manifest and the new public GitHub URL. Confirm it returns `status: passed`, binds the public `main` branch to the sanitized one-commit tree and includes `checks.detectedMitLicense: true`.
- [ ] Verify the new repository, README, root MIT LICENSE, GitHub About sidebar displaying the MIT license, source and setup steps in a signed-out session. A LICENSE blob alone does not prove GitHub recognized it.
- [ ] Test a clean clone or extraction from the **public** repository, not only the private working tree.

**Go only if:** the anonymous public repository is reproducible and safe. A simulated clean export is not a published source URL.

### Gate D: video and submission assets

- [ ] Follow `docs/submission/VIDEO_STORYBOARD.md` with the frozen working application captured on screen.
- [ ] If filming an injected-provider simulation, display that fact on screen; use genuine Sandbox footage for any claim of actual Sandbox payment.
- [ ] Avoid personal identifiers, URLs with capabilities, provider secrets, browser notifications, unlicensed music and third-party branding without permission.
- [ ] Export a video shorter than 3:00. Watch the **exact uploaded file**, including audio, captions, legibility and complete transaction narrative.
- [ ] Run the [final MP4 video QA](VIDEO_RELEASE_QA.md) against the exact export. Require an audio track, a video track, nonempty media and **strictly less** than 180 seconds. Treat its metadata result as a preflight, not proof of decodable playback or safe content.
- [ ] If FFmpeg is already installed, run the optional `--decode-check` on the same export. This tests actual decoding and requires video frames, but still cannot assess narration quality, privacy or factual truth.
- [ ] Publish YouTube visibility as **Public** and confirm signed-out playback.
- [ ] Fill `docs/submission/DEVPOST_DRAFT.md` with the actual tools used, working demo instructions, public repository and YouTube links. Remove all placeholders and unsupported claims.
- [ ] Run `node scripts/devpost-copy-preflight.mjs` on the final draft. Require `copy_ready_for_manual_review`, then manually check claims and links. The command checks copy structure and URL syntax offline; it cannot confirm public access, payment or submission.
- [ ] Review the official Devpost form for required fields, then submit rather than merely saving a draft.
- [ ] Verify the submitted entry URL/state and store a private dated confirmation, with no secrets.

**Go only if:** a judge with no project account can access the entry materials and independently execute or interact with the promised functional demonstration.

## Independent final consistency and truth audit

- [ ] Run `pnpm submission:candidate:check` using real private paths and exact release/export evidence. It is an **offline consistency check only**, and intentionally does not return `readyForSubmission: true`.
- [ ] Open public GitHub and YouTube **signed out**; check the actual final URLs.
- [ ] Verify that final prose and video distinguish source-grounded AI proposals from human consent, policy pricing, PayPal settlement and active rights. Do not say a hash proves copyright ownership or serves as a signature.
- [ ] Ensure the repository and any functional hosted demo remain available for the judging period through December 15, 2026.
- [ ] Capture Devpost's final submission confirmation, not just a draft-preview screenshot.
- [ ] Do not create new features, use paid services or touch production PayPal to satisfy this checklist.

## Schedule and contingency decisions (Eastern)

| When | Must be complete | If not complete |
| --- | --- | --- |
| Nov 4 | Operator checklist; working judge narrative and runbooks | Avoid feature scope |
| Nov 5 | Exact clean full release gate | Fix only P0 defects; rerun full gate |
| Nov 6 | Genuine Sandbox payment/webhook evidence | Identify credential, webhook or provider blocker precisely |
| Nov 7 | Sanitize/export/public repo and clean-clone check | Shift to complete functional local demo and submission package |
| Nov 8 | Public sub-3-minute YouTube demo, final narrative, checked links | Cut optional polish and optional hosted deployment |
| **Nov 9, 3 p.m.** | **Submit Devpost and retain confirmation** | Escalate outstanding mandatory items; do not falsely claim complete submission |
| Nov 10 to 11 | Buffer: repair broken access, metadata and proof | No scope expansion |
| **Nov 12, 3 p.m.** | Official deadline | No late-first-submission plan |

## Evidence ledger to fill without committing sensitive data

| Gate | Evidence location (private unless public URL) | Result | Checked by/date |
| --- | --- | --- | --- |
| Exact source commit | Private release notes | PENDING | |
| Full release verification | `.data/release-candidate/...` | PENDING | |
| Genuine Sandbox acceptance | `.data/paypal-sandbox-acceptance/...` | PENDING | |
| Public export/audit | `.data/public-export/...` | PENDING | |
| Public source, signed-out | Final public GitHub URL | PENDING | |
| Public video, signed-out | Final YouTube URL | PENDING | |
| Functional judge run | Clean public build or hosted URL | PENDING | |
| Devpost submitted confirmation | Private confirmation with final entry URL | PENDING | |

**Final status rule:** mark *submitted* only after Devpost confirms the entry. Mark *fully evidence-backed* only after every independently verifiable gate above passes. A deadline does not turn unknown status into success.
