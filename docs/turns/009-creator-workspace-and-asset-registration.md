# Turn 009 Receipt: Build Creator Workspace and Asset Registration

- **Status:** Completed locally, browser and live D1 evidence pending the existing Turn 007 blocker
- **Date:** October 25, 2026 HST
- **Priority:** P0
- **Objective:** Add the creator profile surface, seeded asset catalog, controlled asset metadata registration, safe project previews, stable fingerprints, and pricing-policy assignment visibility.
- **Exit criteria:** A creator can view seeded asset metadata and register a supported photograph or illustration, while unsupported types and uncontrolled previews fail closed.

## Scope completed

- Added pure domain records and validation for creator workspaces, assets, controlled previews, fingerprints, timestamps, and registration errors.
- Added two safe, project-owned SVG previews with accessible titles and descriptions.
- Added shared Zod schemas for workspace, asset detail, registration, storage mode, and safe errors.
- Added a creator asset application service with workspace, active pricing-policy, asset-detail, and registration orchestration.
- Added D1-shaped workspace, asset, pricing-policy assignment, and related-case repositories.
- Added an explicitly labeled local memory adapter for local mode only.
- Added Hono creator workspace, detail, and registration endpoints.
- Added a temporary explicit demo-role header guard without representing it as production authentication.
- Added React workspace, asset-detail, and registration routes.
- Added controlled preview selection, metadata validation, focusable error summaries, loading states, persistence-mode labels, provenance copy, fingerprint copy control, and truthful empty request and receipt summaries.
- Added domain, application, persistence, contract, API, and route tests for the installed-dependency suite.
- Added a dependency-free Node SQLite asset harness and seven passing tests.
- Added asset verification to the root static and full verification commands.
- Expanded formatting checks to cover public SVG assets.
- Added engineering documentation and updated the root overview and project ledger.

## Requirements advanced

### `RR-P0-006`

The implemented creator workspace and asset-detail routes expose the seeded Harbor After Rain title, type, creator, controlled preview, provenance note, availability, fingerprint, policy assignment, and related-case count.

Dependency-free data and view-model verification passes. Browser execution remains pending the blocked package installation gate.

### `RR-P0-007`

The registration service and SQLite integration tests create and reload both supported asset types. Unsupported `video` metadata, uncontrolled preview keys, and preview-type mismatches fail before persistence.

The React form and Hono route are implemented. Browser execution remains pending the blocked package installation gate.

### `RR-P0-008`

Local integration evidence confirms stable identifiers, 64-character lowercase hexadecimal fingerprints, provenance persistence, creation and update timestamps, and row version 1 after reload.

Relevant domain invariants include `RR-DOM-001`, `RR-DOM-003`, `RR-DOM-045`, `RR-DOM-047`, and `RR-DOM-050`.

## Verification commands

```text
node --check scripts/asset-local.mjs
node --check scripts/asset-local.test.mjs
node --no-warnings --experimental-strip-types --test scripts/asset-local.test.mjs

tsc -p tsconfig.internal.json
tsc -p tsconfig.apps.json

Python static check for final newlines, CRLF, trailing whitespace, tabs, em dashes, and SVG XML parsing
```

The two temporary TypeScript configurations and ambient declarations were used only in the execution workspace to inspect authored source while package installation was unavailable. They are not committed and do not replace the real dependency gate.

## Verification results

- Seven dependency-free asset tests passed with zero failures.
- Registration requires the workspace pricing-policy assignment to remain active before persistence.
- The seeded workspace exposes Maya Chen, Harbor After Rain, active availability, the controlled preview, and Harbor demo policy version 1.
- Photograph metadata registration persisted and reloaded a fixed identifier, fingerprint, timestamps, and row version.
- Illustration metadata registration persisted the controlled Studio Lines preview and fingerprint.
- Unsupported types, uncontrolled previews, mismatched previews, invalid identifiers, and invalid timestamps failed without additional rows.
- Both SVG previews parsed as XML and contained no script, foreign-object, external-image, or external-href content.
- Strict TypeScript checking passed for domain, application, and persistence source against internal package paths.
- App source passed TypeScript semantic inspection with temporary external-library declarations.
- JavaScript syntax and authored-file formatting checks passed.
- No credential, capability token, private account data, production payment endpoint, GitHub Actions workflow, or em dash was introduced.

## Files added

- `packages/domain/src/assets.ts`
- `packages/domain/src/assets.test.ts`
- `packages/contracts/src/assets.ts`
- `packages/contracts/src/assets.test.ts`
- `packages/application/src/assets.ts`
- `packages/application/src/assets.test.ts`
- `packages/persistence/src/assets.ts`
- `packages/persistence/src/memory-assets.ts`
- `apps/web/src/api.ts`
- `apps/web/src/creator.tsx`
- `apps/web/src/creator.css`
- `scripts/asset-local.mjs`
- `scripts/asset-local.test.mjs`
- `public/demo/harbor-after-rain.svg`
- `public/demo/studio-lines.svg`
- `docs/engineering/ASSET_WORKSPACE.md`
- `docs/turns/009-creator-workspace-and-asset-registration.md`

## Files updated

- `packages/domain/src/index.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/index.test.ts`
- `packages/application/src/index.ts`
- `packages/persistence/src/index.ts`
- `packages/persistence/src/index.test.ts`
- `packages/persistence/src/ports.ts`
- `apps/api/package.json`
- `apps/api/src/index.ts`
- `apps/api/src/index.test.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/routes.ts`
- `apps/web/src/routes.test.ts`
- `package.json`
- `scripts/check-format.mjs`
- `docs/engineering/README.md`
- `README.md`
- `PROJECT_STATUS.md`

## Existing blocker

Turn 007 remains blocked because the execution environment cannot resolve `registry.npmjs.org`. Therefore the lockfile, real dependency type checking, Vitest execution, Vite build, Wrangler dry run, and browser execution remain unavailable.

No user action, paid resource, or GitHub Actions workaround was requested or introduced.

## Recommended next work

Proceed to Turn 010, buyer request intake, as the next independent P0 turn. Preserve the Turn 007 release blocker and do not represent local memory behavior as D1 or PayPal evidence.
