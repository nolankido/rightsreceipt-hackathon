# Turn 114: Guard the one-commit public GitHub publication step

**Date:** November 5, 2026 UTC

**Status:** Implemented, test evidence local only. The development repository remains private; no final public repository was created or pushed.

## Release risk

The clean checkout runner and exporter generate a private one-commit sanitized release, and the anonymous GitHub checker can verify it once published. The handoff in between was manual. An operator could accidentally push the original private history, target a repository that was already populated, or misread a successful push as proof that an anonymous judge could open the correct source.

## Change

1. Added `scripts/public-release-publish.mjs` with a local read-only preflight as its default. The command must be given the private export manifest, the matching full release evidence and an exact separate `https://github.com/owner/repository` URL.
2. Re-verifies the complete release's source commit, source Git tree, hashed evidence record and existing full release judge/log gate. The export must be under ignored `.data/`, have the same tree SHA, a single root commit, only the `main` branch, no tags/remotes/dirty files and the sanitized noreply author/committer.
3. Only explicit `--publish` contacts GitHub. An unauthenticated read requires a public, non-forked, enabled destination. Git `ls-remote` must see no existing branch or tag. A single exact-SHA push uses a creation-only lease on `refs/heads/main` that cannot overwrite a branch created during the race window.
4. A successful push is followed by the existing anonymous three-GET check. Its failure yields the separate `pushed_verification_pending` state and does not falsely indicate verification succeeded.
5. Added `public:publish:preflight` and `public:publish:verify`, included publication regressions in the existing public-export verify chain, and documented the Windows cutover steps and failure recovery.

## Observed defect during test-first hardening

The first implementation used only a creation-only Git lease. An actual local bare remote test revealed that repeating an identical push returned a successful *up-to-date* result even with that lease. The command now also reads remote heads/tags and refuses any nonempty destination. A second test creates `main` **after** the empty read and confirms the lease rejects that race. This is stronger than testing only a mocked success path.

## Evidence and limits

**50 of 50** combined clean-checkout, public-export, anonymous GitHub and guarded-publication tests passed. The new suite exercises real local Git commits and bare remotes, tampered manifest/evidence, wrong repository identity, dirty worktrees, extra commits, tags, remote references, default no-network behavior, explicit opt-in, GitHub metadata rejection and post-push verification mismatch. Syntax and package JSON checks also passed. This does not constitute a real GitHub publication or a full pinned Node 22 release; the test runtime here is Node 24.22.1.

The next work requires Nolan's complete private checkout with Node 22, genuine PayPal Sandbox acceptance and human recording, plus a new empty public GitHub repository. The official Devpost submission is still outstanding.
