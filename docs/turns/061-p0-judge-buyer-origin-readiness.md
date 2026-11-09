# Turn 061 Receipt: Signed-Out Judge Buyer Origin Readiness

- **Status:** Implemented and isolated-test verified; no Cloudflare deployment or genuine PayPal activity.
- **Date:** November 1, 2026 UTC.
- **Priority:** P0.
- **Objective:** Ensure the restricted public judge Worker actually serves its advertised buyer intake shell, while preserving the creator/payment safety boundary.

## Root cause

The Turn 058 restricted judge config enabled buyer intake, clarification and human-consent flags, but pinned `HUMAN_CONSENT_ORIGIN` to an empty string. The native `createRequestIntakePageRoutes` checks this setting before serving `/buyer/request` or its script, and requires it to exactly match the incoming HTTPS origin. A blank value caused `503 request_intake_unavailable` even with a healthy migrated D1 database. The prior deployment preflight checked the public origin but did not validate this second origin dependency.

## Changes

1. The source-controlled `wrangler.judge.example.jsonc` now assigns both `HUMAN_CONSENT_ORIGIN` and `RIGHTS_RECEIPT_PUBLIC_ORIGIN` the same deliberately invalid HTTPS placeholder. The template still cannot deploy until the operator supplies a real judge origin and D1 UUID.
2. The dependency-free `scripts/judge-deploy-preflight.mjs` now requires both origins to pass the safe bare HTTPS-origin rules and be identical. It reports a sanitized `consent_origin_invalid` code for missing or mismatched consent origin and retains all creator, webhook, payment and receipt-issuance flags disabled.
3. Added `scripts/judge-preview-origin-local.test.mjs`, an isolated route regression that runs the actual native buyer page factory with a valid synthetic judge configuration. It checks public page and script availability, the private-code entry, no-store/no-referrer/noindex headers, denial of creator issuance, missing-binding failures, exact origin enforcement and GET-only behavior. The previous blank origin is an explicit negative case.
4. Tightened `scripts/hosted-judge-smoke.mjs` so the buyer route must include the private-code access form and input as well as the request form. Added a synthetic-response regression where a decorative form fails. The live smoke remains nine read-only GETs and makes no buyer submission or payment.
5. Wired the route regression into `pnpm judge:deploy:verify` with the existing TypeScript test loader, and updated the judge quick start, README and project status to instruct operators to fill both origins and accurately explain that the restricted shell cannot issue private buyer capabilities.

## Verification

- Fifteen isolated judge preflight configuration tests passed under Node 24.22.1.
- Six route regression cases passed against the actual page factory with inert bundled-client stand-ins and synthetic D1 configuration under Node 24.22.1.
- Fourteen signed-out hosted smoke regression cases passed under Node 24.22.1.
- Staged sources parsed, JSON configs validated and changed code passed basic newline/whitespace checks.
- The pinned Node 22 full dependency/build/test chain, hosted URL verification, real D1 migrations and genuine PayPal Sandbox acceptance were not executed here.

## Limits

A signed-out buyer page with a private-code entry is only a shell. The restricted preview disables creator login and capability issuance; without a legitimate creator-issued private code, a judge cannot open or submit a full request. No public capability or seeded private buyer data is added. Full payment, verified webhook, receipt issuance, sanitized public export, video and Devpost remain open release gates.

## Commit

This receipt is included in the Turn 061 implementation commit. A merged pull request, if approved, identifies the exact SHA.
