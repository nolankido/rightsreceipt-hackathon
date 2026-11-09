# Public Repository Preflight

**Date:** October 29, 2026  
**Purpose:** Preliminary read-only review before changing the repository from private to public.

This is not a complete secret-scanning certification. It records the searches performed during the submission-prep pass and the follow-up required before publication.

## Repository state

- Current visibility: private.
- License: MIT.
- Public visibility is required by the PayPal AI Hackathon rules before submission.
- Do not make the repository public until the final release audit is complete.

## Search patterns reviewed

The connected GitHub code index was searched for:

- `PAYPAL_SANDBOX_CLIENT_SECRET`
- `client_secret`
- `access_token`
- `BEGIN PRIVATE KEY`
- `.dev.vars`
- `@gmail.com`
- `@hawaii.edu`
- `Bearer `

## Findings

No personal Gmail or hawaii.edu addresses were returned by the code searches.

Matches for PayPal client IDs, client secrets, access tokens and bearer values were concentrated in:

- configuration contracts;
- documentation placeholders;
- `.dev.vars.example`;
- test fixtures with visibly synthetic values;
- security tests that assert secret redaction;
- PayPal adapter implementation that reads server-side configuration.

Examples such as `sandbox-secret-12345`, `fixture-transaction-secret`, `synthetic-secret-035`, `buyer@example.test` and similar test-only values are intentionally non-production fixtures.

No conclusion should be drawn from code-index search alone about Git history, binary artifacts, ignored files, generated outputs or unindexed content.

## Required final publication checks

Before switching visibility to public:

1. Search the complete Git history for actual Sandbox client IDs, secrets, access tokens, webhook IDs, private keys and credentials.
2. Inspect committed generated evidence and screenshots for capabilities, buyer tokens, personal emails and account identifiers.
3. Confirm no populated `.dev.vars`, local database, test artifact, browser recording or environment dump is tracked.
4. Confirm `.gitignore` excludes local credentials and generated runtime output.
5. Verify the canonical demo asset is owned by the entrant or otherwise licensed for the submission.
6. Check that no binary, unresolved Git LFS, oversize (>16 MiB), symlink or submodule payload is silently omitted by the final audit. All must be explicitly inspectable or blocking.
7. Check third-party dependencies and notices for license compatibility.
8. Verify the repository About/license metadata shows the MIT license after publication.
9. Open the public repository signed out and follow only the judge instructions.
10. Confirm no release documentation claims local injected-provider evidence is genuine PayPal Sandbox activity.
11. Preserve the release commit/tag and public URL in the final submission evidence.

## Publication decision

Current decision: **DO NOT MAKE THIS DEVELOPMENT REPOSITORY PUBLIC.**

Turn 050 confirmed a Git-metadata privacy blocker across the development history. The planned hackathon path is a fresh sanitized one-commit repository generated from the frozen release tree with `pnpm public:export`.

The release itself also remains NOT READY until genuine PayPal Sandbox, pinned clean-build and final judge-access gates pass.


## Automated publication audit

Turn 050 adds a history-aware automated check:

```bash
pnpm public:audit
```

The audit scans all currently tracked paths and every reachable Git blob. It is intentionally stricter than the preliminary code-index search above because deleted credentials remain public after repository visibility changes unless history is rewritten.

The current Turn 050 branch contains no obvious private-file/path blockers under the automated filename rules. Final publication still requires running the audit from the frozen release candidate and resolving every reported finding before changing repository visibility.

See [Public Release Audit](../engineering/PUBLIC_RELEASE_AUDIT.md).


## Public submission repository strategy

Do not flip the private development repository to public.

After the final candidate passes `pnpm release:verify`, run:

```bash
pnpm public:export -- --release-evidence .data/release-candidate/run-.../verification.json
```

The exported repository must show:

- a full passing release verification record for this exact source commit with intact logs and pinned lockfile;
- exactly one commit;
- GitHub noreply author and committer metadata;
- the same Git tree SHA as the frozen private source commit;
- a passing full history-aware `public:audit`;
- no configured remote.

Create the final public GitHub repository from that exported directory, then verify it signed out before using its URL in Devpost.

### Independent anonymous GitHub release check (Turn 113)

After a separate public repository has been created, use the read-only check in [Anonymous Public GitHub Check](ANONYMOUS_PUBLIC_GITHUB_CHECK.md). It calls public GitHub REST endpoints without credentials and confirms that `main` points to the exact sanitized exported commit, the public tree matches the verified private export, and the commit has no parents or private author metadata. It does not push, create a repository or validate YouTube, PayPal or Devpost. A passing API check does not replace opening the repository signed out and following the judge quickstart.

### Guarded empty-repository publication (Turn 114)

For the actual handoff, use [Safe Public Release Publication](SAFE_PUBLIC_RELEASE_PUBLICATION.md). `scripts/public-release-publish.mjs` runs a **read-only preflight by default** against the exported one-commit repository, the exact source Git tree, a clean private checkout and intact full release evidence. It never accepts the private development repository URL as the target.

Only an explicit `--publish` runs `git push`. Before that write, an anonymous GitHub API read must establish the destination is a distinct public repository. The Git transport then requires no existing remote heads or tags and uses a single exact exported commit refspec plus a creation-only `main` lease. This means an existing remote branch is never overwritten, even in a race after the read-only emptiness check. The tool immediately rechecks the resulting GitHub source anonymously and reports a distinct **pushed but verification pending** state if the remote read is not yet consistent. It does not create GitHub repositories or change the visibility of the private source.

## Turn 067 audit hardening

The snapshot and full-history audit now fail closed on skipped files: UTF-8 text up to 16 MiB is actually scanned; larger, binary, invalid UTF-8, unresolved Git LFS, symlink and gitlink entries are blockers. The 3.59 MB synthetic training set must be inspected rather than counted as an ignored large blob. The sanitized public export retains its exact release-evidence and one-commit requirements. The code change is not proof that a public export or genuine Sandbox validation has occurred.

