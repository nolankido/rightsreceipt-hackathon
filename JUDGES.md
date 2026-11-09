# RightsReceipt Judge Guide

RightsReceipt is an AI-assisted creative licensing workflow built for the PayPal AI Hackathon.

Start here with a functional local demonstration (Node 22.13 through 22.x):

```bash
node scripts/judge-local-console.mjs
```

For an automated **real-worker browser smoke** on the same clean checkout, run `node scripts/judge-console-real-smoke.mjs`. This starts the localhost page, submits the actual Run form, checks the two resulting artifacts, verifies three reset proofs and no external requests, and cleans up. A passing result must say `paymentEvidence: "simulated_only"`. This smoke is part of `pnpm judge:verify` and must pass before public release. It does not make a PayPal Sandbox API call or prove a paid invoice.

For a quick, read-only **actual-model CLI proof**, from the repository root with Node 22.13+:

```bash
node --no-warnings --experimental-strip-types scripts/judge-ai-proof.mjs
```

This executes the same locally bundled SHA-256-verified classifier and source-grounded extractor used by the browser AI diagnostic. It returns a minimal JSON report with the model hash, two authored synthetic requests, 24 field comparisons and the visible contradiction warning. It explicitly reports `modelExecution: "real_local_inference"` and `paymentEvidence: "none"`. It makes no network or PayPal requests and needs no secrets. Failed integrity or display checks and invalid CLI arguments return fixed, non-sensitive failure JSON and a nonzero exit. The independent regression suite is `node --no-warnings --experimental-strip-types --test scripts/judge-ai-proof.test.mjs`. Both the proof and regression suite run within `pnpm judge:console:verify`, so the normal and static release verification chains cannot silently skip this AI diagnostic. The CLI proof remains supplemental: it is not the working visual demo, a calibration study, legal permission or a real Sandbox settlement.

A passing local judge console now also validates the *meaning* of the rehearsal evidence, not only its file and JSON shape. Each journey must pass with the expected USD 425.00 price and verified scheduled receipt; all three resets must revoke prior access, preserve baseline counts and show no external requests or credentials. This is still simulated and cannot prove PayPal settlement. See [Turn 081](docs/turns/081-p0-judge-semantic-evidence-validation.md).

The local browser has two distinct, no-login demos. **Run application rehearsal** exercises the licensing flow with scripted people and injected provider replies. **Run read-only AI diagnostic** runs the bundled, SHA-256-verified supervised lexical model and separate source-grounded extractor on synthetic requests. The latter shows real model inference but not a paid invoice, real-world accuracy, consent or a legal rights grant.

The model diagnostic has a 20-second child-process deadline and a 128 KiB output ceiling. If either limit is exceeded, or the child cannot start, the browser returns a generic 503 response rather than hanging or exposing private diagnostics. You can retry the model route after that failure. A 503 is not model evidence or a passing release check.

**Known model limitation demonstrated transparently:** The current synthetic model still suggests US and Canada as a resolved territory when a buyer request also says Germany only. The `/model` page explicitly flags this as conflicting information requiring a creator decision. A model label or source excerpt is not permission approval. Do not describe this case as successfully resolved by AI. Both use self-contained pages and restrictive CSP headers.

A successful console run now requires an accepted report and JSON evidence from the same execution directory. Invalid output produces a failed state without evidence links. The browser serves the accepted bytes for that run, so subsequent file replacement cannot change the displayed result. See [Turn 080 and its executed validation](docs/turns/080-p1-judge-console-artifact-validation.md) for the reproduced failure, correction and test scope.

Open the printed `http://127.0.0.1:PORT/` URL and choose **Run application rehearsal**. The form redirects immediately to a running-status page and checks for completion every two seconds, with no JavaScript or external service. Allow up to two minutes for the three application-handler journeys, including normal licensing, interrupted invoice recovery and repeat/reset. A timeout or oversized worker response fails closed, even if the worker later exits successfully. The report and minimized JSON evidence links appear only after validation succeeds. A failed run shows a failure message without report links; restart the console or use `node scripts/judge-rehearsal.mjs` for local stage diagnostics. No dependency installation, credentials, external API or Cloudflare account is needed. Stop the console with Ctrl+C.

The transaction path is a **local simulated integration demonstration**, not proof of real PayPal payment or managed login. The separate `/model` page performs actual learned inference on synthetic data, without any financial or legal authority. A fully authenticated Sandbox demo and a short video showing genuine product operation remain release work. A deployed preview is optional under the official hackathon rules, provided judges receive complete instructions to run a working build.

If a restricted preview has separately been deployed, `/judge` provides a signed-out synthetic walkthrough. Read [the full judge quick start](docs/submission/JUDGE_QUICKSTART.md), [Sandbox setup](docs/paypal/SANDBOX_SETUP.md), and [current release limits](PROJECT_STATUS.md) before interpreting its evidence.

Canonical demo:

- Creator: Maya Chen
- Buyer: Cedar & Tide
- Asset: Harbor After Rain
- Deterministic quote: USD 425.00
- Target payment environment: PayPal Sandbox only
- Current walkthrough evidence: locally injected provider responses, not genuine PayPal Sandbox

Important:

The checked-in local judge rehearsal uses injected provider responses and is intentionally labeled as simulated. It is not a substitute for genuine PayPal Sandbox evidence. For authentic paid webhook acceptance, the operator may use the one-shot localhost collector with an approved public HTTPS forwarding endpoint, bind it to the original sent invoice using `sandbox:acceptance:webhook:bind` before buyer payment, then verify the capture through PayPal's signature API. See [Sandbox acceptance](docs/paypal/SANDBOX_ACCEPTANCE.md).

AI can propose structured rights, cite source evidence and abstain. It cannot set prices, approve a license, accept terms, confirm payment or activate permission. The `/judge` evidence panels use human-reviewed fixture terms and injected provider responses, with the license only scheduled at the offline rehearsal clock. The buyer request is paraphrased to avoid publishing private input.

See [docs/submission/README.md](docs/submission/README.md) for the release and submission packet.
