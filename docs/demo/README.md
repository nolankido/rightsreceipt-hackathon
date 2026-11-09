# Local Judge Rehearsal

## Accessible judge console layout (Turn 078)

The localhost page now leads judges through rights scope, human approval, deterministic USD 425.00 pricing, simulated invoice and receipt recovery, and reset/retired-access proof before they run the executable rehearsal. Success reveals report and minimized JSON links; failure leaves them hidden. The page is responsive, keyboard accessible, has a status region for assistive technology, includes no JavaScript or external dependencies and uses a per-request CSS nonce in its CSP. Nine focused tests passed on Node 22.16.0. Complete browser and worker integration tests still require the clean private checkout and cannot be declared passing from this code change alone.

## Real-worker browser smoke (Turn 077)

Run `node scripts/judge-console-real-smoke.mjs` to test the entire browser form to real-worker journey without manually opening a browser. The command binds only to localhost, presses the same form programmatically, reads the fresh report and JSON, verifies three actual scenarios, three reset proofs, denied previous capabilities, zero external network requests and restrictive report headers, and deletes its temporary ignored output. It returns a sanitized JSON summary with `paymentEvidence: "simulated_only"`. This is now a prerequisite of `judge:console:verify` and the full Node 22 release verification. Unlike the smaller UI tests, it deliberately uses the real canonical worker instead of a mocked runner. It must actually be executed and pass from the complete checkout before publication; the code change alone is not a passing release claim.

## Interactive local browser review (Turn 069)

With Node 22.13 through 22.x, run `node scripts/judge-local-console.mjs` from the repository root. Open the localhost URL printed by the command, click **Run application rehearsal**, and follow the generated report and minimized JSON links. This offers an interactive launcher for the existing actual-handler rehearsal without Cloudflare, dependencies or credentials. The browser triggers a fresh scripted run rather than showing a stored static screenshot. Local payment/provider replies and participant actions are still simulated, not genuine PayPal Sandbox acceptance. The server listens only on 127.0.0.1, uses a same-origin form token and limits runs per session. Stop with Ctrl+C.

Run the complete local rehearsal from the repository root with Node 22.13 through 22.x:

```bash
node scripts/judge-rehearsal.mjs
```

It requires no package installation, credentials, browser or manually prepared case. The command prints paths to `report.html` and `evidence.json` in a fresh `.data/judge-rehearsal/run-*` directory. The HTML is an offline execution report with keyboard-accessible disclosures and complete printable traces. The application journey itself is executed by scripted test actors through actual handlers.

For another output parent:

```bash
node scripts/judge-rehearsal.mjs --output ./rehearsal-output
```

Each invocation creates a new folder and preserves existing files. There is no option to select a real database, external URL or credential. All databases are owned disposable in-memory fixtures. The launcher ignores application/provider/database settings from the caller and the worker blocks accidental network entry points.

## What the report demonstrates

| Run | Actual local behavior |
| --- | --- |
| Ordinary | Asset review, private request link, immutable intake, clarification, explicit terms/price review, separate approval and acceptance, invoice creation/sending, financial reconciliation and receipt verification |
| Interrupted delivery | Provider fixture commits sending, its response is lost, creator recovery retrieves the same invoice and a stale replay is rejected without another send |
| Repeat | Ordinary journey runs after reset and its normalized ordered outcomes match the first run |

Every run produces the same $425.00 USD quote, one create POST, one send POST, one independently established payment-evidence record and one verified scheduled receipt. The virtual clock precedes the license start, so the report correctly distinguishes scheduled permission from active permission.

Three actual seed resets run against the populated in-memory databases. Each returns all 33 tables to the initial seed counts and denies the old buyer capability, private/public receipt and creator case access. The final database is reset and closed too. Creator-account revocation is outside this reset proof.

## Reviewable example

- [Generated HTML report](../evidence/turn040/report.html)
- [Minimized JSON evidence](../evidence/turn040/evidence.json)
- [Verification record](../evidence/turn040/verification.json)
- [Turn 040 receipt](../turns/040-p0-local-judge-rehearsal.md)
- [Engineering details](../engineering/LOCAL_JUDGE_REHEARSAL.md)

The example records its generation time, fixed scenario clock, base/current revision, checkout cleanliness and fingerprint of actual source bytes. A modified checkout is marked explicitly. The trace contains fixed route templates and numeric evidence, with no usable capabilities, concrete record identifiers, buyer identity, source text, signed assertions or raw provider payloads.

## Evidence limits

Managed sessions, scripted participants and PayPal HTTP are injected locally. The rehearsal exercises actual application, authorization, SQL, financial and receipt logic but does not represent a live managed login, genuine PayPal payment/refund/webhook, deployed Worker/D1 or pinned installed-library build. External runtime flags remain off and release status remains NOT READY.

The report is a reproducible local demonstration and engineering transcript. Final deployment evidence, video/storyboard, public judge access and submission materials remain separate release work. Simulated behavior must remain labeled in any future demo or recording.
