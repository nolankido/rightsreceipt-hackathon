# Turn 062: Signed-out judge walkthrough

## Outcome

The public judge launch was still a SPA placeholder even though the restricted Worker already had signed-out buyer and receipt shells. In the preview, local-only seeded requests cannot complete because creator issuance, authenticated review and PayPal side effects are intentionally disabled. An unauthenticated judge had no honest narrative of the working design.

Turn 062 replaces that dead-end with a self-contained, Worker-first `GET /judge` page. It uses the canonical synthetic scenario, Maya Chen licensing Harbor After Rain to Cedar & Tide for a deterministic USD 425.00 quote. It explains where the buyer, AI assistant, human creator, pricing policy, external payment evidence and receipt each have authority. The local rehearsal's receipt is correctly called **scheduled, not active**. All financial/provider behavior on the page is labeled as injected local fixture evidence, not an actual PayPal Sandbox operation.

The page links to the real buyer private-code entry, receipt viewer and public read-only service health route. It does not provide or request private capabilities, contains no form or script, and makes no external request. It continues to work as an explanatory artifact when the preview cannot issue private buyer codes.

## Engineering changes

- `apps/api/src/judge-tour.ts` serves the deterministic HTML with per-request CSP nonce, same-origin illustrative artwork, private no-store, no-index, anti-framing and no-referrer headers. Only exact GET without query arguments is accepted; other methods and query strings return sanitized errors.
- `apps/api/src/worker.ts` routes the tour before transaction, receipt and SPA fallback handlers. Both Wrangler configs send `/judge` to the Worker first.
- `scripts/judge-deploy-preflight.mjs` pins the new route in the restricted preview configuration. Removing it fails the offline preflight as `asset_routes_invalid`.
- `apps/web/src/App.tsx` now links directly to the native judge page, removes misleading home-page calls to launch a local seeded transaction, and labels prototype and evidence state accurately. Navigation marks local-only demo routes. The client fallback for `/judge` points back to the native page.
- `scripts/hosted-judge-smoke.mjs` adds a tenth signed-out GET probe that requires the page's synthetic-case marker, explicit warning that it is not genuine PayPal Sandbox evidence, scheduled state and safe buyer/receipt links.
- Added `scripts/judge-tour-local.test.mjs`, with route behavior, CSP, determinism, query/method refusal and Worker/asset wiring assertions. `judge:deploy:verify` runs it alongside existing restricted preview regressions.

## Verification

- 4 executed isolated native-tour route tests passed under Node 24.22.1 with in-memory TypeScript stripping.
- 16 hosted-smoke tests passed using an in-memory dependency-free module, including new placeholder and missing-disclaimer failures.
- 15 offline deployment-preflight tests passed using the modified configuration fixtures.
- Static review confirmed both tracked Wrangler configs route `/judge` Worker-first, the Worker dispatches the handler and the new source links to checked-in demo artwork.
- No network access, remote D1 mutation, Cloudflare deployment, paid API, genuine PayPal operation or production payment was performed.

The exact pinned Node 22.13+ release verification, dependency-backed TypeScript/React build, full tests and remote hosted smoke were not run in this environment. Passing isolated tests is not a release verdict.

## Remaining gates

A public restricted judge preview still cannot issue a private buyer capability or create a payment. An approved, fully authenticated Sandbox configuration, genuine PayPal Sandbox acceptance, clean Node 22 release run, deployed D1/Worker smoke, sanitized public export and final submission artifacts remain separate tasks.

## Suggested next unit

Complete the clean pinned Node 22 release-candidate verification in a credential-free checkout, or provision the reviewed Cloudflare preview and run the ten signed-out probes. Do not represent this illustrative page or local fixture report as genuine PayPal Sandbox payment evidence.
