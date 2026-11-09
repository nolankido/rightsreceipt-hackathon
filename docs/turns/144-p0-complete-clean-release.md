# Turn 144: complete the pinned clean release

**Date:** November 8, 2026 UTC
**Priority:** P0, execute the release and repair observed blockers
**Status:** Complete local release and private sanitized export passed. The hackathon entry is not yet ready to submit.

## Outcome and frozen candidate

The actual command completed successfully:

```bash
node scripts/clean-release-checkout.mjs --shareable --export-public
```

| Record | Verified value |
| --- | --- |
| Private source commit | `85a322df6332d47e09ca8378b466ee41695f7c4a` |
| Source and public Git tree | `dbb605ea8ea2e300e0b97786197c69baa823e7cb` |
| Prepared public commit | `3cd7cf4a03794773b1edf8462e37d82239dca70c` |
| Runtime | Node 22.23.4, Corepack 0.36.0, pnpm 12.8.2 |
| Platform | Linux x64 |
| Full verification interval | 2026-11-08 07:07:59.111 through 07:10:02.639 UTC |
| Public export completed | 2026-11-08 07:10:12.986 UTC |
| Original verification JSON SHA-256 | `a6b0ae08f8e4db747665545c3209387788cd4572866410bc1b7d32209532b59d` |

The frozen candidate above is the tested release, not a claim about every later commit. This receipt and the accompanying status updates are a subsequent documentation-only checkpoint. Continue release operations from the frozen checkout or run a new complete release for a different candidate.

## Observed blockers and repairs

The complete private source was reconstructed with all 796 Git blob identities checked against GitHub. The canonical runner then created its own clean clones and retained the original results of each attempt.

1. **Toolchain launch:** older Corepack versions could not launch the pinned pnpm 12 package correctly. Selected Node 22.23.4 and Corepack 0.36.0, updated both Node version pins and the setup documentation, and verified the official runtime and package-manager downloads.
2. **Frozen dependency installation:** pnpm rejected the installation scripts for the already-locked esbuild and workerd packages. Inspected those scripts and added version-specific approvals for esbuild 0.27.7/0.28.1 and workerd 1.20260811.1/1.20260921.1. `strictDepBuilds: true`, the minimum release age, the pnpm pin, and the lockfile remain intact.
3. **Full lint:** removed unused test bindings/imports and an unnecessary escape. Added five documented, line-scoped exceptions for existing intentional control-character rejection regexes. Their validation behavior is unchanged.
4. **Generated checkout linting:** added ignored runtime output `.data/**` to ESLint's existing output exclusions so retained release clones do not get linted as current application source.
5. **Submission fixture import:** the existing real-Git submission test did not copy `release-candidate-verify.mjs`, which its exporter dependency imports. Added that actual module to the fixture; retained every assertion.
6. **Runtime warning isolation:** two CLI tests expected empty stderr but inherited Node's experimental environment-proxy startup warning. Suppressed runtime warnings only in those two test subprocesses, retaining exact output assertions and production environment handling.

Implementation commits: [toolchain and installation](https://github.com/nolankido/rightsReceipt/commit/38dad85ccc72fd761ba8719c6b76e8d774638af8), [lint and fixture repair](https://github.com/nolankido/rightsReceipt/commit/5d453e795fc608b3e41d805762f9f96a9258c9e2), and [test warning isolation](https://github.com/nolankido/rightsReceipt/commit/85a322df6332d47e09ca8378b466ee41695f7c4a).

## Complete verification

All four canonical stages returned exit code zero from the same clean candidate:

| Stage | Result | Recorded duration |
| --- | --- | ---: |
| Tracked-source snapshot audit | Passed, no findings | 1.560 seconds |
| Frozen dependency installation | Passed with unchanged lockfile; reused downloaded cache | 0.228 seconds |
| Complete `corepack pnpm verify` | Passed | 117.289 seconds |
| Canonical judge rehearsal | Passed | 1.237 seconds |

The complete verifier covered lint, type checking, 24 Vitest files with 71 passing tests, the production build, deployment dry-run, trained-model checks, simulated payment and receipt workflows, judge-console smoke, release tools, and public-export/publication-tool tests.

Across its Node TAP summary sections, the run reported 2,888 passing test executions, zero failures and three skips out of 2,891. These are summed execution counts, not a claim of 2,891 unique tests. Two existing tests skip on Node 22 because they exercise unsupported-runtime CLI behavior; the third is an opt-in FFmpeg integration witness. No finished demo video was evaluated.

The separate canonical rehearsal passed the ordinary, recovery and repeat journeys, with matching repeat outcomes and reset evidence. Its record states `externalRequests: 0` and `credentialsUsed: false`. The real local learned-model diagnostic and console smoke also passed within the full verifier.

## Private export and retained evidence

The export contains exactly one `main` commit, no remote, the expected noreply Git identity, and a tree byte-identical to all 796 files of the tested source. Source snapshot and exported-history audits both passed with zero findings. The public-history audit scanned 770 distinct reachable text blobs, with no skipped large or binary blobs.

The original verification JSON, eight hashed stage logs, judge JSON/HTML, export manifest, both audit records and private handoff were retained unchanged. A separate evidence archive preserves generated records; the source remains in the private Git repository. Copying or reading an archive is not a new verification run, and this Linux result does not establish that the commands were executed on Windows.

The private exporter prepared the public candidate locally. It did not create a public GitHub repository, push source, deploy an application, or publish a video.

## Next gate

Complete [genuine PayPal Sandbox acceptance](../paypal/SANDBOX_ACCEPTANCE.md) from the selected candidate: prepare the registered callback and bind the collector before buyer payment, create/send the invoice, pay with a separate Sandbox buyer, verify authenticated fully paid settlement, and verify the matching provider webhook.

Then publish the reviewed separate sanitized source, record and publish the functional public demo under three minutes, replace the final Devpost URL placeholders, and retain submission confirmation. The current local release closes one of the five gates from the [November 7 evaluation](../submission/READINESS_EVALUATION_2026-11-07.md); those four external completion gates remain open.
