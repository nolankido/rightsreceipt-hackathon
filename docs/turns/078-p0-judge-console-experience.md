# Turn 078: Accessible, usable judge console with self-contained CSP styling

## Problem and improvement objective

The local judge browser console provided a bare, unstyled HTML form, text status and links. It was executable but did little to explain what the evaluator was about to see: reviewed rights, the human licensing decision, a deterministic USD 425.00 quote, interrupted invoice recovery, receipt generation and retired-access proof. Because a complete self-run demonstration is an allowed hackathon evaluation path, this presentation gap could reduce judge comprehension even if the underlying worker was correct.

Turn 078 upgrades the browser experience while preserving the real executable worker, all existing URLs, the CSRF form contract, local-only binding, provider isolation and the explicit separation between simulation and genuine Sandbox acceptance.

## Delivered code

- New `scripts/support/judge-console-page.mjs` renders a responsive dark-teal judge page with visible RightsReceipt identity, workflow purpose, a high-contrast simulation notice, clear four-stage evidence overview, and an actionable Run button.
- The page has accessible semantic landmarks, a keyboard-visible focus outline, an `aria-live` status region, 50px-tall Run controls and single-column mobile layout. Success reveals links to the canonical execution HTML and minimized JSON, whereas failed or not-yet-run states do not reveal unrelated prior artifacts.
- `scripts/judge-local-console.mjs` now calls the page renderer using a fresh 128-bit style nonce for each GET, and returns matching `Content-Security-Policy: default-src 'none'; style-src 'nonce-...'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'` headers. The page uses no JavaScript, CDN stylesheet, external images or webfont service. The original HTTP body/token controls, execution worker, private storage and report CSP remain intact.
- New `scripts/support/judge-console-page.test.mjs` tests nine scenarios: prominent simulation disclosure, exact form contract, passing-run links, busy and five-run limit states, failure behavior, nonce CSP, mobile and keyboard accessibility, and rejection of unsafe injected tokens.
- Extended `scripts/judge-local-console-local.test.mjs` to check the returned nonce against the real GET response's CSP, responsive page markup, and absence of JavaScript.
- Registered the new page test in `judge:console:verify`, which already runs the actual-worker smoke and is required by `judge:verify` and `release:verify`.
- Updated `README.md`, `PROJECT_STATUS.md`, `JUDGES.md`, the judge quick start and the local demo guide.

## Verified and unverified

**Nine focused page-component tests passed under Node 22.16.0** in an isolated temporary environment. The Git blob SHA-1 values of the new page module and test file exactly match the tested bytes, and the generated HTML was checked for semantic landmarks, private form action and absence of scripts. The staged main console source, package JSON and test suite passed syntax and source-format checks.

The full application `judge-local-console-local.test.mjs` and `judge:console:smoke` against the real canonical worker were **not executed** in this session because a full authenticated checkout of the private repository is unavailable. The latest change cannot be called production-tested or judge-ready until those commands pass on an exact clean release checkout.

No PayPal API call, real payment, external AI inference, public deployment, GitHub Actions, paid API, or public repository creation occurred.

## Next release actions

Run `pnpm release:verify` on the exact clean Node 22 main revision. Capture genuine PayPal Sandbox invoice/paid financial status/verified webhook evidence with separate merchant and buyer accounts. Produce sanitized one-commit open-source export, actual functioning-product YouTube demo under three minutes, and Devpost submission. Keep private development history, PayPal secrets and webhook captures private.
