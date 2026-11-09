# Turn 113: Independently verify the sanitized public GitHub release

**Date:** November 5, 2026 UTC

**Status:** Implemented and synthetic-regression-tested. No actual public source repository has yet been verified or published.

## Release risk

The offline submission-candidate validator correctly reports `readyForSubmission: false` because a proposed URL cannot prove that a judge can see the final public source. The existing public exporter checks the **local** sanitized Git repository, but never asks an unauthenticated GitHub endpoint whether the separately published repository still matches that exact export. An accidental push of the original private history, the wrong branch or a later commit would not be detected by local manifest validation alone.

## Improvement

1. Added `scripts/public-github-release-check.mjs`, a dependency-free, read-only post-publication command that consumes the private export manifest and a strict HTTPS `github.com/owner/repo` URL.
2. The checker refuses the development repository URL, deceptive hosts, credentials, query strings, alternate paths and placeholder repos before network access.
3. It performs exactly three unauthenticated GET requests against fixed GitHub REST API URLs, with no redirect following or tokens: repository metadata, `main` branch and exported Git commit.
4. A passing result requires public visibility, a non-forked repository, exact exported `main` SHA, identical sanitized Git tree, a parentless root commit and the GitHub noreply author/committer fields. Invalid or oversized responses fail closed.
5. It prints only fixed status/diagnostic codes and never writes to GitHub, PayPal, Cloudflare or Devpost.
6. Added `public:github:check` and `public:github:verify` package scripts, with the new tests included in the existing public-export verification chain. Updated the publication preflight and final cutover checklist.

## Tests and limits

Eight synthetic regression tests passed on Node 24.22.1, including all positive and negative branches, CLI help, and invalid options. The combined public-export and new anonymous check suites passed **25/25**. A live verification is impossible until the new sanitized public GitHub repository exists. GitHub's public REST endpoint semantics are documented in the official [repository](https://docs.github.com/en/rest/repos/repos#get-a-repository) and [Git commit](https://docs.github.com/en/rest/git/commits#get-a-commit) references.

Passing this new gate must **not** be presented as a genuine PayPal Sandbox payment, signed webhook, video validation or completed Devpost submission. The pinned full Node 22 release, real payment acceptance, public source publication, under-three-minute demo and actual entry submission remain outstanding.
