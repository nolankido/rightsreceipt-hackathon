# ADR 0001: Use a pnpm TypeScript Monorepo

- **Status:** Accepted
- **Date:** 2026-10-25
- **Owners:** RightsReceipt project
- **Related turns:** Turn 004, implemented in Turn 007
- **Supersedes:** None
- **Superseded by:** None

## Context

RightsReceipt needs a React browser application, Hono API, pure domain logic, persistence and PayPal adapters, a local inference runtime, receipt logic, shared validation contracts, test fixtures, and offline Python model tooling.

The repository must support one clean-clone verification path, no GitHub Actions dependency, one public portfolio history, and a short hackathon schedule. Separate repositories would increase version drift and make cross-layer changes harder to review. A heavyweight task orchestrator would add configuration before the project has evidence that it needs remote caching or a complex build graph.

## Decision

Use one pnpm workspace monorepo with:

- one committed lockfile;
- strict TypeScript configuration shared through repository tooling;
- separate `apps/`, `packages/`, `model/`, `migrations/`, and `scripts/` areas;
- pnpm `workspace:` references for every internal package dependency;
- root scripts that compose filtered workspace commands;
- no Turborepo, Nx, Rush, or custom build daemon in P0;
- no GitHub Actions requirement;
- a pinned supported Node.js runtime and package manager version added in Turn 007.

Python training remains in the same repository but outside the JavaScript workspace dependency graph.

## Consequences

### Positive

- Browser, API, contracts, domain, adapters, and tests advance in one atomic history.
- Shared types and fixtures do not require publishing packages.
- One lockfile reduces dependency drift.
- Root commands can provide a clean local verification experience.
- The repository remains understandable to judges and portfolio reviewers.
- Avoiding a task-runner framework reduces initial setup and supply-chain surface.

### Negative and tradeoffs

- Workspace boundaries are conventions enforced by linting, imports, and review rather than process isolation.
- Root scripts must maintain a correct execution order.
- Python dependencies require a separate reproducibility mechanism.
- If the repository grows substantially after the hackathon, a task graph and cache may become useful.

## Alternatives considered

### Separate web, API, and model repositories

Rejected because the product requires coordinated contract, lifecycle, and evidence changes. Separate histories would complicate release integrity and final submission traceability.

### npm or Yarn workspaces

Both can support the project. pnpm was selected for explicit workspace linking, strict dependency visibility, filtered commands, and a single efficient store.

### Turborepo or Nx from the first scaffold

Rejected for P0 because the repository is small enough for pnpm recursive and filtered scripts. Additional orchestration can be introduced only after a measured need.

### A single package with folders only

Rejected because payment, domain, model runtime, receipt, persistence, and UI boundaries need enforceable package-level imports and independent tests.

## Validation

Turn 007 must demonstrate:

- a fresh install from the committed lockfile;
- no undeclared cross-package imports;
- no workspace dependency cycles;
- filtered package commands;
- one root verification command;
- a successful production build without GitHub Actions.

## Revisit triggers

- Build order becomes unreliable or materially slow.
- Workspace dependency cycles cannot be prevented with existing checks.
- More than one independently released application is required.
- Measured build time justifies a task graph or remote cache.

## References

- [pnpm workspaces](https://pnpm.io/workspaces)
- [`../architecture/SYSTEM_ARCHITECTURE.md`](../architecture/SYSTEM_ARCHITECTURE.md)
