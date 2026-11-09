# Turn 010 Receipt: Build Buyer Request Intake

- **Status:** Completed locally, browser and live D1 evidence pending the existing Turn 007 blocker
- **Date:** October 25, 2026 HST
- **Priority:** P0
- **Objective:** Add an asset-bound buyer request route, identity and intended-use form, versioned consent, server validation, immutable request persistence, and safe feedback for invalid or unsafe input.
- **Exit criteria:** A valid request is stored for exactly one known asset, while invalid, unsafe, archived, unknown, duplicate, and oversized requests fail without unauthorized side effects.

## Scope completed

- Added pure buyer-request domain records, validation, normalization, consent versioning, and link-record construction.
- Added 256-bit opaque capability issuance and SHA-256 digest lookup.
- Added seven-day expiration, revocation checks, allowed-action checks, and one-case binding.
- Added immutable request-submission construction that preserves original intended-use text exactly.
- Added separate NFKC and line-ending normalization for later extraction.
- Added plain-text safety checks for executable markup, event handlers, dangerous URL schemes, and common template syntax.
- Kept prompt-like instructions as inert evidence without granting authority.
- Added shared Zod request, context, link, and receipt response contracts.
- Added buyer-request application orchestration and typed service errors.
- Added D1-shaped case, capability, lookup, and submission repositories.
- Extended the local memory adapter with buyer request cases, capabilities, submissions, and related-case counts.
- Added creator request-link creation, buyer context, and buyer submission Hono routes.
- Added body-size checks, safe validation issues, and generic invalid-link handling.
- Added React buyer launcher, form, consent, error summary, loading, unavailable, submitted, and received states.
- Added a dependency-free SQLite request harness and nine passing tests.
- Added Vitest source tests for domain, contracts, application, persistence, API, and route behavior.
- Added request verification to the root static and full verification commands.
- Added engineering documentation and updated the root overview and project ledger.

## Requirements advanced

### `RR-P0-009`

A request capability resolves to one licensing case and one active asset. Unknown and archived assets cannot receive a new link.

### `RR-P0-010`

Buyer name, organization, and email are required with explicit length and syntax validation.

### `RR-P0-011`

The intended-use field accepts exactly 40 through 4,000 Unicode characters. Both accepted boundaries and both rejected adjacent boundaries have executable tests.

### `RR-P0-012`

Submission requires explicit acknowledgement. The stored record includes `buyer-request-v1` as the accepted consent-copy version.

### `RR-P0-013`

The original intended-use value survives persistence byte-for-byte. A separate normalized value is stored for later extraction.

### `RR-P0-014`

Unsafe markup and template syntax fail closed with field-specific issues and no request row. Prompt-like commands remain plain stored evidence and cannot invoke pricing, payment, or permission behavior.

Relevant domain invariants include `RR-DOM-001` through `RR-DOM-005`, `RR-DOM-022`, `RR-DOM-045`, `RR-DOM-047`, `RR-DOM-048`, and `RR-DOM-050`.

## Verification commands

```text
node --check scripts/request-local.mjs
node --check scripts/request-local.test.mjs
node --no-warnings --experimental-strip-types --test scripts/request-local.test.mjs

tsc -p tsconfig.internal.json
tsc -p tsconfig.apps.json
tsc -p tsconfig.contracts.json
tsc -p tsconfig.tests.json
```

The temporary TypeScript configurations and ambient declarations were used only in the execution workspace because package installation is unavailable. They are not committed and do not replace the real dependency gate.

## Verification results

- Nine dependency-free request tests passed with zero failures.
- One capability stayed bound to Harbor After Rain and one case.
- Unknown and archived assets created no case or capability.
- Original intended-use text persisted unchanged, including spaces and CRLF input.
- Normalized text used NFKC, LF line endings, collapsed horizontal spacing, and outer trimming.
- Buyer email normalized to lowercase separately from the original intended-use evidence.
- Consent version and acknowledgement persisted.
- Exactly 40 and 4,000 characters passed.
- 39 and 4,001 characters failed with `intendedUseText` issues.
- Invalid name, organization, email, and missing consent produced specific fields.
- Script and template payloads produced `unsafe_markup` and no request row.
- Prompt-like instructions were stored as inert text with no extra state changes.
- A second submission failed and the first request remained immutable.
- Strict internal TypeScript checking passed for domain, application, and persistence source.
- App source passed semantic TypeScript inspection with temporary external-package declarations.
- Authored files passed final-newline, CRLF, trailing-whitespace, tab, and em-dash checks.
- No credential, reusable capability token, private account data, production payment endpoint, paid service, or GitHub Actions workflow was introduced.

## Files added

- `packages/domain/src/buyer-requests.ts`
- `packages/domain/src/buyer-requests.test.ts`
- `packages/contracts/src/buyer-requests.ts`
- `packages/contracts/src/buyer-requests.test.ts`
- `packages/application/src/buyer-requests.ts`
- `packages/application/src/buyer-requests.test.ts`
- `packages/persistence/src/buyer-requests.ts`
- `packages/persistence/src/buyer-requests.test.ts`
- `packages/persistence/src/memory-buyer-requests.ts`
- `apps/web/src/buyer.tsx`
- `apps/web/src/buyer.css`
- `scripts/request-local.mjs`
- `scripts/request-local.test.mjs`
- `docs/engineering/BUYER_REQUEST_INTAKE.md`
- `docs/turns/010-buyer-request-intake.md`

## Files updated

- `packages/domain/src/index.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/index.test.ts`
- `packages/application/src/index.ts`
- `packages/persistence/src/index.ts`
- `packages/persistence/src/index.test.ts`
- `packages/persistence/src/memory-assets.ts`
- `apps/api/src/index.ts`
- `apps/api/src/index.test.ts`
- `apps/web/src/api.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/routes.ts`
- `apps/web/src/routes.test.ts`
- `package.json`
- `scripts/check-format.mjs`
- `docs/engineering/README.md`
- `README.md`
- `PROJECT_STATUS.md`

## Existing blocker

Turn 007 remains blocked because the execution environment cannot resolve `registry.npmjs.org`. The lockfile, installed-library type check, Vitest run, Vite build, Wrangler dry run, browser test, accessibility execution, and live D1 evidence remain pending.

No user action, paid resource, or GitHub Actions workaround was requested or introduced.

## Recommended next work

Proceed to Turn 011, structured rights-term review, as the next independent P0 unit. Preserve the immutable request evidence and keep all extracted values visibly proposed until human correction or later clarification resolves them.
