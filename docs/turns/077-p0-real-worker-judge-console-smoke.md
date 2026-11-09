# Turn 077: Release-gated real-worker judge console smoke

## P0 gap and objective

RightsReceipt already had an executable dependency-free local judge rehearsal and a browser console for running it. However, `judge:console:verify` used an injected mock runner, whereas the canonical worker's CLI was tested separately. The release suite could pass both independent groups without proving that the actual localhost browser Run button invoked the real worker, then served the generated HTML and JSON to a judge. For a hackathon that permits a complete self-run demo instead of a hosted app, this missing end-to-end check is a submission-readiness gap.

The objective is to make the real judge browser route verifiable with one command, while clearly labeling all financial/provider interactions as simulated.

## Implementation

- Add `scripts/judge-console-real-smoke.mjs`. Its no-argument CLI uses the actual `startJudgeConsole` default runner. It creates an isolated folder under ignored `.data`, starts the real loopback-only HTTP console on `127.0.0.1`, loads the landing page, extracts the random form token, and submits the same same-origin POST used by a human judge.
- Waits for the real `judge-rehearsal.mjs` child and actual canonical worker to complete the three licensing journeys and resets. Loads the newly generated `/report` and `/evidence` through the actual HTTP server.
- Requires valid report identity, strict report CSP, no-store and anti-framing response headers, `judge-rehearsal-v1` evidence, three scenarios, three resets, repeatable outcomes, in-memory database, zero external requests, no credentials used, and explicit denial of old capabilities/receipts/creator cases.
- Returns only sanitized fixed fields including `paymentEvidence: "simulated_only"`. Never prints private artifacts, provider credentials, browser session tokens or simulated buyer identities. Closes all local HTTP connections and deletes the temporary ignored folder.
- Adds `scripts/judge-console-real-smoke.test.mjs` with eight Node 22 checks covering correct evidence interpretation, missing reset proof, forbidden provider I/O or credential use, unsafe CSP, missing form, one real localhost HTTP POST against a controlled test server, nonlocal-origin rejection, and sanitized invalid CLI arguments.
- Add `pnpm judge:console:smoke`. Make this actual real-worker command mandatory in `pnpm judge:console:verify`, which is already called by `pnpm judge:verify` and therefore by the full `pnpm verify` and `pnpm release:verify` chains.
- Update README, `PROJECT_STATUS.md`, `JUDGES.md`, the self-run judge quick start and local rehearsal guide.

## Verification performed

Eight focused Node 22.16.0 tests passed in an isolated temporary workspace. They used a controlled localhost HTTP server and injected test reporter rather than the full private repo. The new CLI and test files also passed Node syntax checks, and their exact Git blob SHA-1s were verified against the staged source content. The normal application `judge-rehearsal-isolation-local.test.mjs` already tests the separate real worker, but it is **not evidence that the new combined browser smoke has completed**.

The real-worker end-to-end browser smoke, the entire installed-dependency Node 22 release verification and genuine PayPal Sandbox transaction were **not run** in this session because an authenticated local clone of the full private repo is unavailable. Do not mark submission-ready until a clean checkout actually completes `pnpm release:verify`.

No external PayPal, paid API, public Cloudflare deployment, GitHub Actions, live AI, or public repository publication occurred.

## Remaining release work

A genuine Sandbox invoicing, buyer-paid financial GET and signature-verified webhook chain, exact-commit full Node 22 release, sanitized single-commit public source export, functioning-product public YouTube video under three minutes, and Devpost submission remain outstanding. The local browser console verifies a scripted offline handler workflow only and cannot substitute for PayPal financial acceptance.
