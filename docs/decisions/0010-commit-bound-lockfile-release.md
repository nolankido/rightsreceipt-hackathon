# ADR 0010: Bind release lockfile to the exact Git commit

- **Status:** Accepted
- **Date:** 2026-10-31
- **Owners:** RightsReceipt release engineering
- **Related turns:** 048, 051, 052
- **Supersedes:** None
- **Superseded by:** None

## Context

The release verifier requires an exact clean checkout and a pinned pnpm dependency tree. A file-existence check and clean `git status` are not enough: an ignored `pnpm-lock.yaml` does not belong to the commit, and Git index flags can conceal local edits. A release check could therefore pass preflight even though a judge cloning that commit would not receive the same lockfile.

## Decision

- Require `pnpm-lock.yaml` to exist in the working tree and as a blob at `HEAD:pnpm-lock.yaml`.
- Compare `git rev-parse --verify HEAD:pnpm-lock.yaml` with `git hash-object --path=pnpm-lock.yaml pnpm-lock.yaml` before any installation or verification.
- Use Git's path-aware content filters so an ordinary checkout with Windows CRLF normalization does not falsely fail.
- Record both Git blob IDs and the working-file SHA-256 in ignored local release evidence; fail closed if either Git operation fails or the blob identities differ.
- Keep genuine PayPal Sandbox acceptance and public-access evidence as separate gates.

## Consequences

### Positive

- An untracked but ignored lockfile cannot impersonate a committed release dependency tree.
- An edit concealed by `skip-worktree` or `assume-unchanged` is still detected.
- The released commit is the authority for the lockfile, with explicit evidence of working-tree agreement.

### Negative and tradeoffs

- An intentional local change cannot be treated as a frozen release until committed.
- A repository with unusual custom Git clean filters may need separate validation of its filter configuration.
- Preflight still does not prove full source-tree byte identity beyond Git's ordinary clean-status semantics or substitute for the actual clean-commit build.

## Alternatives considered

### Rely on `git status`

Rejected because ignored files and index flags can hide real differences.

### Hash the working YAML using SHA-256 alone

Rejected as the sole identity check because it provides no relation to the committed blob and would reject ordinary CRLF-normalized checkouts when compared directly to Git's LF blob bytes.

## Validation

Four isolated Git-fixture tests cover absence, ignored/uncommitted lockfile, correctly committed file and a concealed modification. They passed under Node 24.22.1 in Turn 052. The final clean release verifier must still run under pinned Node 22.

## Revisit triggers

- A change to package-manager pinning, lockfile format or Git attributes.
- Introduction of custom Git clean filters or nonstandard repository release packaging.
- A verified false mismatch on a supported clean checkout.

## References

- [Release candidate verifier](../../scripts/release-candidate-verify.mjs)
- [Regression tests](../../scripts/release-candidate-verify-local.test.mjs)
- [Turn 052](../turns/052-p0-release-lockfile-identity.md)
