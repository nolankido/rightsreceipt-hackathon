# Turn 065: Restricted judge runtime attestation

## Problem

Turn 064 made the local judge launcher fail closed on the ignored Wrangler configuration, remote D1 migration ledger and post-deploy HTTP smoke. But the remote smoke still accepted a general healthy `sandbox` or `judge` Worker without confirming that the **running deployment** actually had the reviewed restrictive flags. A stale Worker or an origin pointing at a different RightsReceipt instance could pass the ten public HTTP probes. A pre-existing Cloudflare secret or extra binding also would not be visible to the local config validator.

## Change

A Worker-first, read-only `GET /api/judge/runtime-profile` route now evaluates the **effective runtime env**, without exposing its values.

A success requires all of the following:

1. `APP_MODE=judge`, PayPal API endpoint pinned to Sandbox, and every feature-flag/creator value identical to the reviewed restricted judge template. The fixed runtime map is regression-pinned against `wrangler.judge.example.jsonc`.
2. Both `RIGHTS_RECEIPT_PUBLIC_ORIGIN` and `HUMAN_CONSENT_ORIGIN` exactly equal the request's bare HTTPS origin.
3. Exactly the approved 29 configured variables, plus `DB` and `ASSETS` bindings. No extra environment keys are allowed, so a retained or unexpected Cloudflare secret/binding blocks a green profile.
4. The D1 binding exposes `prepare`, and the static asset binding exposes `fetch`. The separate health probe performs the actual read-only D1 readiness check.

The route emits only a four-field JSON success: profile schema, `restricted` status, `judge` mode and `present` bindings. If any check fails it returns sanitized HTTP 503 without values or key names. Extra query parameters and non-GET methods are refused. Response headers mandate private no-store, no-index/nofollow, no-referrer, anti-framing, nosniff and a no-active-content CSP.

The signed-out hosted smoke now makes eleven GET probes. The new runtime probe requires the exact four-field profile, HTTP 200 and hardened headers. The health probe now requires `judge` mode, not the previously accepted `sandbox` alternative. The launcher now rejects older ten-of-ten evidence and accepts only a successful eleven-of-eleven report from the configured origin. All other smoke probes retain their prior bounds and checks.

## Changed files

- `apps/api/src/judge-runtime-profile.ts`: new runtime guard and minimal endpoint.
- `apps/api/src/worker.ts`: route before other transactional and API handlers.
- `scripts/hosted-judge-smoke.mjs`: eleventh probe, profile/CSP checks and exact mode.
- `scripts/judge-preview-launch.mjs`: new proof count.
- `scripts/judge-runtime-profile-local.test.mjs`: six new runtime and integration regressions.
- `scripts/hosted-judge-smoke-local.test.mjs`: realistic route fixture and adversarial cases.
- `scripts/judge-preview-launch-local.test.mjs`: updated proof fixture and stale-count rejection.
- `package.json`: add runtime test to the judge deploy verification command.
- `README.md`, `PROJECT_STATUS.md`, `docs/submission/JUDGE_QUICKSTART.md`: current status, operation and limitations.

## Verification

Executed isolated Node 24.22.1 tests from in-memory module sources with no network, remote database access or filesystem mutations:

- Six runtime-profile tests passed. They cover exact template parity, minimal headers/body, bad financial and creator flags, extra secret-like bindings, missing DB/assets, origin mismatch, unsafe HTTP/query/method access and Worker route wiring.
- Twenty-five hosted-smoke tests passed. They cover the new true runtime profile in the fixture and rejection of unavailable, malformed, insecure or differently configured profiles, alongside the existing buyer, receipt, CSP, nonce and privacy boundaries.
- Fourteen launcher tests passed. The fixed deployment flow rejects malformed remote-ledger evidence, stage failure and old or wrong-count smoke evidence.

Total: **45 isolated tests passed.**

No full dependency-backed `pnpm verify`, exact Node 22 release gate, remote Cloudflare read/deploy, browser execution or genuine PayPal Sandbox operation was performed in this environment.

## Remaining gates and limitations

The runtime profile is not an immutable artifact digest or a proof of the deployed Git commit. It cannot establish the absence of application bugs, prove D1 table definitions or complete an authenticated financial journey. It deliberately fails closed if future deploy config adds bindings, requiring explicit review and updated tests.

Still needed: clean Node 22 verification, approved remote D1/Worker provisioning and migration application, a real successful eleven-probe hosted smoke, genuine PayPal Sandbox invoice/payment/webhook acceptance, authenticated demo readiness, sanitized single-commit public export, video and Devpost submission. Do not publish the private repository history or represent synthetic fixture evidence as genuine PayPal evidence.
