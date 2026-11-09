# RightsReceipt Toolchain and Local Verification

**Updated:** November 7, 2026, America/Phoenix

**Owning improvement:** Turn 144, execute the complete release and repair observed installation blockers

## Pinned release toolchain

- Node.js: **22.23.4**, recorded in `.node-version` and `.nvmrc`.
- Corepack: **0.36.0**.
- pnpm: **12.8.2**, recorded in `package.json` and the committed lockfile.

Corepack 0.36.0 requires Node 22.22.2 or later within major 22. The application and dependency-free judge console retain their existing Node 22.13 through 22.x support range. Use the pinned runtime for full release work.

Node and package-manager versions are separate prerequisites. A supported Node version alone does not establish that its bundled Corepack can launch pnpm 12.

## Setup and version check

With Node 22.23.4 selected, run from the repository root:

```bash
npm install --global corepack@0.36.0
corepack enable pnpm
node --version
corepack --version
corepack pnpm --version
```

The version commands should report `v22.23.4`, `0.36.0`, and `12.8.2` respectively. These are tool installation commands, not an application deployment.

If an older Corepack cached pnpm with a launcher such as `bin/pnpm.cjs` and the missing-module error persists after upgrading, refresh the downloaded package-manager cache:

```bash
corepack cache clean
corepack pnpm --version
```

This clears downloaded Corepack caches, which may need to be downloaded again. It does not change project source or the pnpm pin. Do not disable integrity verification, change the pin, or fabricate the missing launcher.

## Native dependency build approvals

A real clean release attempt on the previous source stopped at dependency installation with `ERR_PNPM_IGNORED_BUILDS`. The locked native tools require installation scripts to locate and validate their platform binaries.

The workspace now explicitly approves only:

| Package | Approved locked versions |
| --- | --- |
| esbuild | 0.27.7 and 0.28.1 |
| workerd | 1.20260811.1 and 1.20260921.1 |

`strictDepBuilds: true` remains enabled. The approvals are version-scoped in `pnpm-workspace.yaml`; other dependency scripts and new versions still require review. The existing one-day minimum release age remains unchanged.

The inspected postinstall scripts select the platform package, validate its executable version, and provide a registry-download fallback. They do not implement a PayPal transaction or deploy the application.

## Full application verification

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm verify
```

The full verifier includes workspace, format, TypeScript, lint, unit, native integration, build, deployment dry-run, model, payment-fixture, receipt, judge, and release-tool checks. These local checks use simulated provider operation.

For the authoritative clean-commit release and private sanitized export, run:

```bash
node scripts/clean-release-checkout.mjs --shareable --export-public
```

This creates a clean local clone, audits its source, performs the frozen installation and complete verification, runs the canonical judge rehearsal, and prepares the sanitized export only after success. It never publishes a repository or proves a real PayPal payment. See [CLEAN_CHECKOUT_RELEASE.md](../submission/CLEAN_CHECKOUT_RELEASE.md).

Only a passing complete result and its original generated evidence establish the release outcome. Version checks, a successful installation, or focused tests are insufficient.

## Checks before installation

These two commands require only Node:

```bash
node scripts/check-workspace.mjs
node scripts/check-format.mjs
```

The syntax checker imports the installed TypeScript package. The broader `verify:static` script also runs additional checks and must not be described as an installation-free substitute for the full release.

## Workspace and dependency policy

The workspace contains `apps/web`, `apps/api`, and eleven internal packages. Internal dependencies use `workspace:*`; the workspace checker rejects missing packages, unknown internal dependencies, incorrect internal specifiers, and cycles.

Preserve the committed lockfile. Dependency updates require an intentional lockfile update with the pinned pnpm version and a new clean release. Do not regenerate dependencies merely to bypass a frozen-install failure.

## Primary references

- [Corepack package metadata and runtime requirement](https://registry.npmjs.org/corepack/0.36.0)
- [Official Corepack pnpm 12 issue](https://github.com/nodejs/corepack/issues/873)
- [pnpm dependency build settings](https://github.com/pnpm/pnpm.io/blob/main/docs/settings/build.md)
