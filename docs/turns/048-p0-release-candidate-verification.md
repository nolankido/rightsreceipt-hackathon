# Turn 048 Receipt: Release-Candidate Verification Gate

- **Status:** Blocked after substantial progress.
- **Date:** October 30, 2026 UTC.
- **Objective:** Convert release readiness from a checklist into one exact, reproducible, evidence-producing gate tied to a single source revision.
- **Scope completed:** Dependency-free release verifier, clean-checkout/toolchain/lockfile preflight, full verification orchestration, judge rehearsal handoff, minimal evidence bundle, child-process credential isolation, release documentation and project-ledger update.
- **Merge commit:** `2dca31692662fe53581190ccefd27654f197323d`.

## Implemented

The repository now exposes:

```bash
pnpm release:preflight
pnpm release:verify
```

The underlying script is `scripts/release-candidate-verify.mjs`.

Preflight requires:

- Node 22.13 through 22.x;
- `packageManager: pnpm@12.8.2`;
- a clean Git checkout;
- a valid HEAD commit;
- a committed `pnpm-lock.yaml`.

Full mode then runs:

1. `corepack pnpm install --frozen-lockfile`
2. `corepack pnpm verify`
3. the canonical local judge rehearsal

Each run writes an ignored evidence bundle under `.data/release-candidate/run-*` with the exact commit, toolchain, lockfile hash, command exit codes/durations and hashed stdout/stderr.

Child commands strip PayPal and Cloudflare credential variables before forcing local/fake payment mode. The local release verifier cannot be used as an accidental production-payment path.

## Verification and review

- The release script is dependency-free and uses only Node core modules.
- The repository has no current `pnpm-lock.yaml`; the new preflight therefore correctly blocks the release.
- A local attempt to prepare pnpm 12.8.2 in the isolated environment failed because `registry.npmjs.org` was unreachable.
- No lockfile was fabricated or hand-authored.
- GitHub automated code review completed on PR #2 head `e5e5b90` with **zero findings and zero unresolved findings**.
- PR #2 was squash-merged to `main`.

## Current blocker

The clean release gate cannot pass until a real lockfile is generated using the pinned package manager on a networked machine and committed.

Required command:

```bash
corepack enable
corepack prepare pnpm@12.8.2 --activate
pnpm install --lockfile-only
```

After reviewing and committing `pnpm-lock.yaml`, rerun from a clean checkout:

```bash
pnpm release:verify
```

## Remaining Turn 048 acceptance

Turn 048 is not complete yet. After the local release candidate is green, preserve genuine PayPal Sandbox evidence for:

- OAuth;
- exact invoice creation from approved/accepted terms;
- one explicit send;
- current invoice status retrieval;
- PayPal-hosted buyer handoff;
- a registered Sandbox invoicing webhook verified against the real webhook ID.

The official hackathon submission also still requires the public repository, working judge access, final public YouTube video and Devpost submission.

## Recommended next improvement

Generate and commit the real `pnpm-lock.yaml`, run `pnpm release:verify`, and repair any resulting clean-build defects before touching optional product features.
