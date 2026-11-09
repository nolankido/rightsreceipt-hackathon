# Turn 036 Receipt: Buyer payment handoff and current receipt navigation

- **Status:** Completed implementation and local verification; external release gates remain open.
- **Date:** October 27, 2026 HST.
- **Base:** `d162674b8c48b2580300d0862b6eb16ed7d27b63`.
- **Objective:** Connect the accepted buyer offer to a fresh, capability-authorized Sandbox payment handoff and the current canonical receipt experience.
- **Scope decision:** This closes the next unblocked P0 integration item. Original dashboard work, full UX/security audits and external release gates remain incomplete.

## Scope completed

- Local buyer invoice and receipt status with no provider operation or database mutation on page load or refresh.
- Explicit version-bound payment-link request using only Sandbox OAuth and the exact canonically bound invoice GET.
- Current accepted-deal, account, amount, recipient, invoice and durable delivery checks; read-only delivery journal view; combined final SQL capability/source/receipt fence.
- Short payment-link lifetime bounded by elapsed request time, capability expiry and the licensing end boundary.
- Separate confirmed payment, permission and receipt states. A provider paid/refunded label or invoice GET does not issue evidence, activate permission or create a receipt.
- Current public verification and independently receipt-scoped private receipt navigation, with immediate fragment cleanup and header-only authorization.
- Safe receipt-only presentation when an archived asset or changed pricing policy makes the old offer ineligible for new consent or payment.
- Browser validation of state/integrity combinations, unsafe destinations, stale observations and receipt timing, plus private-state clearing for late responses and hidden/history transitions.
- Private receipt authorization recheck after the final asynchronous source read and rejection of UTC date rollover at the last authorization boundary.
- Default-off configuration, shared Worker/browser composition, repeatable verification commands and updated sprint records.
- Expanded the strict transaction typecheck to cover the receipt route and its actual dependencies. Corrected three existing unchecked-index type errors in QR arithmetic without changing its independent reference-vector output.

## Files changed

Runtime: `apps/api/src/buyer-payment-routes.ts`, `buyer-review.ts`, `receipt-routes.ts`, `transaction-routes.ts`; `apps/web/src/buyer-review-client.ts`; `packages/application/src/buyer-invoice.ts`; `packages/persistence/src/buyer-payment.ts`, `invoice-sending.ts`; `packages/receipts/src/http.ts`, `qr.ts`.

Verification: `scripts/buyer-payment-local.test.mjs`, `buyer-review-validation-browser-check.mjs`, `transaction-routes-local.test.mjs`, `receipt-experience-local.test.mjs`, `transaction-browser-check.mjs`, `support/transaction-browser-fixture.mjs`.

Configuration: `.dev.vars.example`, `wrangler.jsonc`, `package.json`, `tsconfig.transaction-ui.json`.

Records: `README.md`, `PROJECT_STATUS.md`, `DEVELOPMENT_PLAN.md`, this receipt, the engineering index, `BUYER_PAYMENT_HANDOFF.md`, the earlier transaction engineering follow-up, and JSON evidence under `docs/evidence/turn036/`.

## Executed verification

The full native collection reports **1,556 tests passed, 0 failed, 0 skipped across 39 files**, including the new **114-test** buyer payment collection, the **111-test** receipt experience collection and **20** composition tests. The integrated Chromium collection passed **127 checks across 19 scenarios**. The separate adversarial buyer browser collection passed **51 checks**.

Strict TypeScript 5.8.3 passed the expanded transaction/receipt and invoice-sending scopes using actual sources without stubs. All **152** TypeScript files passed syntax parsing, and **277** source/configuration/data files passed formatting. Workspace dependency checks and diff whitespace passed. The receipt experience rerun retains all sixteen independent QR reference vectors after the typing cleanup.

Final counts and execution metadata are recorded in [verification summary](../evidence/turn036/verification.json), [per-file native results](../evidence/turn036/native-regression.json), [integrated browser results](../evidence/turn036/transaction-browser.json), and [adversarial browser validation](../evidence/turn036/buyer-validation-browser.json).

Reproduction commands use the supported Node 22 runtime:

```bash
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/consent-ts-test-loader.mjs scripts/buyer-payment-local.test.mjs
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/consent-ts-test-loader.mjs scripts/receipt-experience-local.test.mjs
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/consent-ts-test-loader.mjs scripts/transaction-routes-local.test.mjs
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/consent-ts-test-loader.mjs scripts/transaction-browser-check.mjs
node --no-warnings --experimental-strip-types --experimental-loader ./scripts/consent-ts-test-loader.mjs scripts/buyer-review-validation-browser-check.mjs
```

`pnpm buyer:payment:verify`, `pnpm transaction:verify`, `pnpm transaction:browser`, `pnpm buyer:review:browser` and `pnpm transaction:typecheck` expose the focused commands. Browser checks accept `RR_PLAYWRIGHT_MODULE` and `RR_CHROMIUM` for existing local test installations.

The integrated browser path executes real rendered HTML/JavaScript, native handlers, generated RSA assertions verified by production authorization code and all eight migrations in SQLite. It exercises approval, exact buyer acceptance, one draft, separate send, fresh payment handoff, financial reconciliation, scheduled receipt, protected/public navigation, exact JSON export and full-refund revision continuity. The financial consumer and receipt issuer generate their own records from injected validated provider detail; the harness does not insert payment evidence or permission rows directly.

An isolated regression witness replaced only the private receipt HTTP handler with its previous committed version while retaining the new tests. All six targeted new tests failed against the old handler and pass with the correction. See [receipt authorization witness](../evidence/turn036/receipt-authorization-regression.json).

## Risks and limits

- Browser HTTPS requests are intercepted into actual handlers. There is no listening server, live Access gateway/cookie lifecycle, deployed Worker/D1 or genuine PayPal transaction.
- The fixture starts from a synthetic buyer request, human-prepared terms and deterministic quote. Initial request intake, AI extraction and terms editing are not exercised in this browser sequence.
- Generated signing keys, provider HTTP replies and financial transaction details are synthetic. Deliberate external PayPal navigation is intercepted into an inert document to verify privacy without contacting PayPal.
- Actual browser Origin is checked. Fetch Metadata is unavailable through this interception runtime; native HTTP tests cover it. Expiry and hidden/history events are injected.
- The separate adversarial browser collection intentionally corrupts server responses to test client validation. Its results are distinct from the integrated canonical path.
- Strict source TypeScript uses available compiler 5.8.3, not the pinned but uninstalled 5.9.3 toolchain. The clean installation, installed-library lint/Vitest/Vite build and Wrangler dry run remain open because registry resolution is unavailable.
- No deployment, real credential, paid service, production payment, external schedule or GitHub Action was used. Every runtime flag remains off. Receipt hashes remain unsigned integrity checks.

## Commit and next turn

Source, evidence and records are committed together as `feat: add buyer payment handoff and current receipt status (turn 036)`. The final commit identifier is in repository history and the work handoff rather than embedded in its own future content.

**Next independent P0:** Persist buyer clarification answers as versioned evidence and connect the creator's re-review to revised human-confirmed terms. The existing clarification page only displays questions; it does not store answers. Keep deterministic pricing, human approval and exact buyer acceptance mandatory. Unknown provider-outcome recovery, the pinned build and genuine managed-session/PayPal/D1 acceptance remain open parallel release work.
