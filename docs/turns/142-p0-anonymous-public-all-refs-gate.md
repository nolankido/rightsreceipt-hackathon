# Turn 142: anonymous public source all-refs verification

**Date:** November 7, 2026
**Priority:** P0, sanitized public repository integrity and accurate release status
**Status:** Implemented and locally tested in the private repository. Release remains NOT READY.

## False-green condition

The independent `scripts/public-github-release-check.mjs` only checked a public repository's metadata, `main` SHA, one-commit root, tree and author identities, plus GitHub's detected MIT license. It did not enumerate other public refs. Even with Turn 141's post-push remote-ref gate, a branch, tag, notes or custom ref could appear after that earlier snapshot. Re-running the anonymous checker would still return `passed` while the destination contained extra refs.

The new tests reproduced this gap against the old code. A mock public repository containing the exact audited `main` alongside an unrelated branch, tag, notes or custom reference was accepted instead of rejected.

## Implementation

1. Keep the existing three anonymous public API reads and all their identity, root-commit, tree and license checks intact.
2. Add a fourth read to GitHub's `GET /repos/{owner}/{repo}/git/matching-refs/`, with the significant trailing slash and no namespace prefix. GitHub documents that this lists all advertised refs, including non-head and non-tag namespaces, and works without authentication for public resources.
3. Require a JSON array containing exactly one entry, `refs/heads/main`, whose Git object type is `commit` and SHA equals the frozen sanitized export manifest's `publicCommit`.
4. Refuse a missing main, extra ref, duplicate, wrong commit, tag object, malformed response, or any pagination `Link` header. If a complete listing is unavailable, fail closed as `public_repository_refs_unverified` or the existing GitHub transport/JSON failure code. Do not trust a clean first page while later pages might contain unknown refs.
5. Return `checks.onlyAuditedMainReference: true` only after all checks pass. The opt-in publication handoff uses this same verifier after its successful push and reports `pushed_verification_pending` on a new ref mismatch.

## Verification

- Baseline: four new anonymous verifier tests failed against the previous implementation, including the old acceptance of unexpected refs.
- Result: `node --test scripts/public-github-release-check.test.mjs scripts/public-release-publish.test.mjs` passed **36 of 36** directly on Node 24.22.1. This includes existing bare Git push and race fixtures and a new simulated mismatch between the post-push check and the later anonymous audit.
- The official GitHub Git-refs documentation confirms that omitting the `ref` prefix lists all namespaces and is usable without authentication on public resources. A read-only GitHub API probe confirmed that the endpoint must end with a slash to list all refs.
- No public repository was created or changed, no private history was published, no paid API was called and no PayPal payment was simulated as genuine evidence.

## Scope and remaining work

This is a point-in-time GitHub API verification, not a guarantee against future mutation, hidden Git refs, or unreachable Git objects. A large, incomplete, rate-limited or inaccessible ref listing must remain a failed or pending gate until the operator can repeat the safe read-only check. The separate Git CLI `ls-remote` inspection remains useful if the previous post-push snapshot failed.

Before release, the full pinned Node 22 clean-checkout and audited export must pass, actual buyer-paid PayPal Sandbox financial and signed exact-invoice webhook evidence must be validated, the separate sanitized MIT source must be published and verified anonymously, a functional public video under three minutes must be checked signed out, and Devpost submission must be confirmed.
