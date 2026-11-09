# Turn 052 Receipt: Commit-Bound Release Lockfile Identity

- **Status:** Completed preflight integrity improvement; complete release acceptance still open.
- **Date:** October 31, 2026 UTC.
- **Priority:** P0.
- **Objective:** Prevent a release preflight from passing when the dependency lockfile is missing from the release commit or locally differs from it despite a clean Git status.
- **Exit criteria:** Check committed and working Git blob identities, add isolated regression cases, wire them into existing verification and record honest remaining gates.

## Scope completed

1. Required the lockfile to resolve at `HEAD:pnpm-lock.yaml` and to match the working file after Git's path-aware clean filters.
2. Added distinct `lockfile_not_committed` and `lockfile_differs_from_head` failures. The former includes ignored copies; the latter includes a changed file hidden by an index flag.
3. Recorded committed and working Git blob IDs alongside the existing SHA-256 in the local preflight evidence.
4. Added four self-contained temporary Git-repository regression tests.
5. Integrated the new test command in both `pnpm verify` and `pnpm verify:static` and updated release instructions and status.

## Files changed

- `scripts/release-candidate-verify.mjs`: Git HEAD/working lockfile comparison.
- `scripts/release-candidate-verify-local.test.mjs`: new regression tests.
- `package.json`: `release:preflight:verify` and both verification chains.
- `docs/engineering/RELEASE_CANDIDATE_VERIFICATION.md`, `README.md`, `PROJECT_STATUS.md`: current release evidence and next gate.
- `docs/decisions/0010-commit-bound-lockfile-release.md`, `docs/decisions/README.md`: durable release identity decision.
- This receipt.

## Verification

### Commands or checks

```text
node --input-type=module --check < verifier source via stdin
node --input-type=module --check < regression source via stdin
node --test scripts/release-candidate-verify-local.test.mjs
```

The two syntax checks ran with source passed through standard input. The test command was executed against exact candidate script/test contents in an isolated temporary directory, with synthetic Git fixtures and cleanup after execution.

### Results

- Syntax checks: both passed under Node 24.22.1.
- New regression: 4 tests passed, 0 failed, 0 skipped, in approximately 0.56 seconds.
- Covered missing lockfile, ignored/uncommitted file with clean Git status, committed matching file, and a changed file concealed with `skip-worktree`.
- The positive test explicitly tolerates the unrelated `unsupported_node` outcome on Node 24, while still asserting no lockfile-specific failures. Required release Node 22 behavior remains a separate check.
- Complete `pnpm verify`, `pnpm release:verify` and PayPal Sandbox were not executed in this turn.

## Manual evidence

The merged Turn 051 repository has a committed `pnpm-lock.yaml` and local frozen-build evidence. Its release verifier had checked file presence, but not Git HEAD identity. The new regression proved that the prior false-positive cases fail closed in the candidate code.

## Risks or limitations

- The development repository could not be cloned by unauthenticated HTTPS Git in this execution environment. No complete source tree or installed workspace was available for the broad regression gate.
- The isolated test environment uses Node 24.22.1, not the release-pinned Node 22.
- No genuine PayPal Sandbox OAuth, invoice, payment, webhook, Cloudflare deployment or public judge access was exercised.
- A strong lockfile check does not replace the full clean build or external release gates.

## External blocker

Full release execution requires a clean authenticated checkout with Node 22 and the pinned pnpm version. Real Sandbox acceptance requires the dedicated test merchant/buyer accounts and server-only credentials; deployment and submission require their respective account access.

## Commit

This receipt is included in the Turn 052 implementation commit. See the repository pull request and merge record for the exact SHA.

## Recommended next turn

Turn 053: Execute full clean-commit release verification, then genuine PayPal Sandbox acceptance and the public judge-access handoff. Do not represent injected provider fixtures as real PayPal evidence.
