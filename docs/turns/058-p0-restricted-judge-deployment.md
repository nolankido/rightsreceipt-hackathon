# Turn 058 Receipt: Restricted Judge Deployment Preflight

- **Status:** Completed offline deployment-configuration safety hardening; remote D1 and real Sandbox release gates remain open.
- **Date:** October 31, 2026 UTC.
- **Priority:** P0.
- **Objective:** Prevent accidental deployment of RightsReceipt's local-only Worker and create an explicit, restricted path toward a Cloudflare/D1 judge preview.
- **Exit criteria:** Make default deployment fail closed, provide a safe distinct Worker template, reject placeholder and unsafe config, preserve all provider-off flags, add regressions and update operator guidance.

## Scope completed

1. Added `scripts/judge-deploy-preflight.mjs`, a dependency-free read-only configuration validator. It enforces a distinct `rightsreceipt-judge` Worker name; expected entry point, assets and worker-first routes; explicit `DB` D1 binding and migration directory; nonzero UUID; real bare HTTPS origin; exact Sandbox-only API mode and host; known variable keys; no inline credentials; and an intentionally limited set of active routes.
2. Added `wrangler.judge.example.jsonc`, a credential-free template. Its database UUID and public-origin values are invalid by design, so copying it unchanged can never pass the preflight. The template turns on buyer intake, clarification, buyer-consent scaffolding and guarded receipt reading, while creator login, invoicing, webhooks, payment, reconciliation, lifecycle and receipt issuance remain off.
3. Added `wrangler.judge.local.jsonc` to `.gitignore`. Real Cloudflare target IDs and public origins are supplied only to this ignored local copy. It must never contain secrets. The public-release audit now also rejects that local path if someone force-tracks it, with a new Git-fixture regression.
4. Changed `pnpm deploy` to validate the local default first, which now fails and prevents an accidental network deploy. Added `pnpm judge:deploy:check`, `pnpm deploy:judge:preview` and the isolated `pnpm judge:deploy:verify` regression gate. Kept `deploy:dry-run` unchanged for offline release verification.
5. Added thirteen regressions for safe configurations, placeholders, current unsafe default, production PayPal host, unauthorized live flags, inline secrets, missing D1 or migrations, route drift, custom domains, invalid public origins, malformed objects and pinned targets. Wired the regression into both verification chains.
6. Added the new template to format checks. Updated the public audit runbook, README, project status and the judge runbook with the Cloudflare D1 create, remote migration, preview-deploy and hosted-smoke sequence. No production payment code, authentication or database migration file was altered.

## Verification

The exact staged validator and test code passed JavaScript syntax checks. Thirteen isolated regression cases passed, zero failed or skipped, under Node 24.22.1 using in-memory module loading and synthetic configurations. The tracked template and checked-in local default were both included as inputs. The additional Git-fixture public-audit regression was added and syntax-checked, but not executed without a writable authenticated repository checkout. The validator neither invoked Cloudflare nor wrote account data.

The complete Node 22 `pnpm verify` and `pnpm release:verify` chains were not run from the private repository because the current environment lacks an authenticated local checkout and the pinned toolchain. No deployed preview, remote migration, provider request, real payment or paid AI API call occurred.

## Operator sequence

After a Cloudflare account and D1 database are approved, follow `docs/submission/JUDGE_QUICKSTART.md`. Copy the committed example to ignored `wrangler.judge.local.jsonc`, replace the D1 UUID and HTTPS Worker origin, check the exact target, apply D1 migrations remotely, then run `pnpm deploy:judge:preview` and `pnpm judge:hosted:smoke`.

The preview has deliberately disabled creator/payment/webhook actions. A passing static guard or hosted HTTP smoke cannot constitute genuine PayPal Sandbox acceptance or a final submission claim.

## External references

- [Cloudflare Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/wrangler-commands/)

## Next turn

Securely provision the distinct Cloudflare/D1 preview when account authority is available and run the signed-out smoke. In parallel, run the final exact clean Node 22 release verification and genuine PayPal Sandbox invoice/payment/verified webhook acceptance. Only then broaden the authenticated judge path, produce the sanitized one-commit public repository and finalize video/Devpost.

## Commit

This receipt is included in the Turn 058 implementation commit. The merged PR identifies the exact source SHA.
