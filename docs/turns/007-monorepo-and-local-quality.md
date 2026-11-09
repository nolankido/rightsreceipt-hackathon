# Turn 007 Receipt: Create the Monorepo and Local Quality Commands

- **Status:** Blocked after implementation
- **Date:** October 25, 2026 HST
- **Priority:** P0
- **Objective:** Establish the executable pnpm and TypeScript monorepo, React and Hono shells, Cloudflare configuration, shared package boundaries, tests, builds, and one root local verification command.
- **Exit criteria:** A clean install, lint, typecheck, test, production build, and Wrangler dry run all pass without GitHub Actions.

## Scope completed

- Created a pnpm workspace pinned to pnpm 12.8.2 and Node.js 22.16.0.
- Created two applications and eleven internal packages matching the accepted architecture.
- Added exact-pinned runtime and development dependencies.
- Added React 19 route shells for public, judge, creator, buyer, and verifier contexts.
- Added reusable role, mode, notice, header, and surface-card UI foundations.
- Added the initial Evidence Ledger CSS token and responsive layout baseline.
- Added a Hono Worker entry point with `/health`, `/api/health`, `/api/scaffold`, security headers, and JSON not-found behavior.
- Added shared Zod health contracts and authority-boundary copy.
- Added pure domain authority mapping, application ports, adapter boundaries, redacted log helpers, and a deterministic fake clock.
- Added Vitest files for contracts, API shell, route separation, authority, logging, and clock behavior.
- Added Vite, Cloudflare Vite plugin, Wrangler, TypeScript, Vitest, and ESLint configuration.
- Added one-origin Worker static-asset routing for `/api/*`, `/health`, and `/webhooks/*`.
- Added workspace graph, formatting, TypeScript syntax, runtime, build, test, and deployment dry-run commands.
- Added `pnpm verify` as the full local gate and `pnpm verify:static` as the dependency-free preliminary gate.
- Added engineering documentation and updated the root overview and live status ledger.
- Added no GitHub Actions workflow and no paid-service dependency.

## Files added or updated

### Root configuration

- `package.json`
- `pnpm-workspace.yaml`
- `.npmrc`
- `.node-version`
- `.nvmrc`
- `.dev.vars.example`
- `index.html`
- `tsconfig.base.json`
- `tsconfig.json`
- `vite.config.ts`
- `vitest.config.ts`
- `eslint.config.js`
- `wrangler.jsonc`

### Applications

- `apps/web/package.json`
- `apps/web/src/App.tsx`
- `apps/web/src/main.tsx`
- `apps/web/src/routes.ts`
- `apps/web/src/routes.test.ts`
- `apps/web/src/styles.css`
- `apps/web/src/vite-env.d.ts`
- `apps/api/package.json`
- `apps/api/src/index.ts`
- `apps/api/src/index.test.ts`

### Internal packages

- `packages/contracts/`
- `packages/domain/`
- `packages/application/`
- `packages/persistence/`
- `packages/pricing/`
- `packages/ai-runtime/`
- `packages/paypal/`
- `packages/receipts/`
- `packages/observability/`
- `packages/testing/`
- `packages/ui/`

### Verification and documentation

- `scripts/verify-environment.mjs`
- `scripts/check-workspace.mjs`
- `scripts/check-format.mjs`
- `scripts/check-typescript-syntax.mjs`
- `docs/engineering/README.md`
- `docs/engineering/TOOLCHAIN.md`
- `docs/README.md`
- `README.md`
- `PROJECT_STATUS.md`
- `docs/turns/007-monorepo-and-local-quality.md`

## Requirements materially advanced

No P0 row passes while the installed-dependency gate remains unavailable.

Materially advanced:

- `RR-P0-001`: workspace, commands, and root verification gate exist;
- `RR-P0-004`: scaffold has no paid API requirement;
- `RR-P0-060`: responsive role-aware application shell exists;
- `RR-P0-063`: deterministic test and verification structure exists;
- `RR-P0-067`: install, command, architecture, and limitation documentation exists.

Relevant interaction and domain contracts include the role separation in `USER_JOURNEYS.md`, the Evidence Ledger baseline in `VISUAL_SYSTEM.md`, and authority boundaries in `RR-DOM-022`, `RR-DOM-029`, and `RR-DOM-031`.

## Dependency selection evidence

The selected Cloudflare-facing line follows the official Cloudflare React and Hono Vite template reviewed on October 25, 2026:

- React and React DOM 19.2.1;
- Hono 4.11.1;
- Cloudflare Vite plugin 1.52.1;
- TypeScript 5.9.3;
- Wrangler 4.136.1;
- React Router 7.9.6 from the corresponding official full-stack template.

Vite is pinned to 7.3.2 rather than an earlier Vite 7 release because 7.3.2 contains the April 2026 patched development-server behavior.

## Verification commands run

### Passed

```text
npm_config_user_agent='pnpm/12.8.2 ...' node scripts/verify-environment.mjs
environment: node 22.16.0, pnpm/12.8.2

node scripts/check-workspace.mjs
workspace: 13 packages, 20 internal edges, no cycles

node scripts/check-format.mjs
format: 53 scaffold files checked

node scripts/check-typescript-syntax.mjs
typescript syntax: 24 files parsed

TypeScript strict offline diagnostic pass with temporary uncommitted external-module declarations
result: no diagnostics
```

Additional checks:

- all MJS and JavaScript configuration files passed `node --check`;
- every package manifest parsed successfully;
- the authored scaffold contains no em dash;
- source and documentation were inspected for credentials, access tokens, personal data, production endpoints, and unsupported implementation claims.

### Blocked

```text
corepack pnpm install --frozen-lockfile
```

Result:

```text
Error when performing the request to https://registry.npmjs.org/pnpm/-/pnpm-12.8.2.tgz
getaddrinfo EAI_AGAIN registry.npmjs.org
```

Because pnpm could not be downloaded and no package registry was reachable, these required checks were not run:

- lockfile generation and frozen clean install;
- ESLint with installed plugins;
- type checking against real dependency declarations;
- Vitest execution;
- Vite and Cloudflare Worker production build;
- Wrangler deployment dry run.

The temporary declarations used for offline type diagnostics are not committed and do not substitute for real installed dependency types.

## Blocker and exact resolution

A network-enabled environment must run:

```bash
corepack enable
pnpm install
pnpm verify
```

Then:

1. commit the generated `pnpm-lock.yaml`;
2. repair any dependency, type, lint, test, build, or dry-run defect;
3. rerun `pnpm verify` from a clean install;
4. update this receipt with exact passing output;
5. mark Turn 007 complete only after the exit criteria pass.

## Risks or limitations

- The source is structurally and syntactically checked but not yet proven against installed library declarations.
- The Vite and Worker configuration follows current official patterns but has not executed locally.
- The route shell is intentionally not a mock product and contains no licensing behavior.
- The CSS token baseline has not received browser accessibility or responsive verification.
- A lockfile is intentionally absent rather than fabricated.
- Turn 008 is not eligible until the full Turn 007 gate passes.

## External blocker

The current execution environment cannot resolve or reach `registry.npmjs.org`. No credential, account action, or paid service is required, but dependency installation must occur in a network-enabled development environment.

## Commit

This receipt is included with the scaffold commit. The final commit SHA is recorded in the turn report and repository history.

## Recommended next action

Complete the Turn 007 install and `pnpm verify` gate. Do not begin Turn 008 until the lockfile exists and the full gate exits successfully.
