# Anonymous public-source verification

This read-only check is for the final PayPal Hackathon submission after the **separate sanitized one-commit repository** has been published. It does not publish a repository or make the private development repository public.

## Before you run it

1. Complete the exact clean Node 22 full release and the sanitized export. Record the `publicExport.manifestPath` from the successful `node scripts/clean-release-checkout.mjs --export-public` summary.
2. Create a **new public GitHub repository** from only the verified export's `publicExport.repositoryPath`, not the original private development repository or its clean full-history clone.
3. Copy the new repository URL. Do not use `https://github.com/nolankido/rightsReceipt` or a placeholder URL.

If the repository is not yet populated, [Safe Public Release Publication](SAFE_PUBLIC_RELEASE_PUBLICATION.md) provides a gated preflight and an explicitly opted-in first push. The standalone command below is still useful for independently repeating the anonymous check afterward.

From the original private RightsReceipt repository directory, run this Windows PowerShell command with the real private manifest path and public URL substituted:

```powershell
node .\scripts\public-github-release-check.mjs --manifest 'PASTE_THE_publicExport.manifestPath' --repository 'https://github.com/nolankido/YOUR_PUBLIC_RELEASE_REPOSITORY'
```

Equivalent package script: `corepack pnpm public:github:check -- --manifest '...' --repository '...'`.

The manifest must be a real regular file within the original repository's ignored `.data/` folder. Do not copy the manifest into Git, Devpost, the video or public documentation.

## What it independently checks

The checker makes exactly four GET requests to GitHub's public REST API without an `Authorization` header or saved login:

1. Repository metadata must identify a real public, non-forked repository on the expected owner/name and default branch `main`. It must also report `license.spdx_id: "MIT"`, meaning GitHub has detected the open-source MIT LICENSE for display in the repository's About section.
2. The public `main` branch must point to the exact public commit SHA recorded by the sanitized export.
3. That commit must have the exact verified Git tree, **zero parents** and the expected sanitized GitHub noreply author and committer metadata.
4. GitHub's complete advertised Git reference set must consist of exactly one entry, `refs/heads/main`, pointing to the same audited public commit with object type `commit`. The trailing-slash `/git/matching-refs/` endpoint includes branches, tags, notes and other namespaces. An extra ref, missing or mismatched main, a non-array response, or a pagination `Link` header blocks the release. This repeats the source-integrity gate independently after the first push, so a ref introduced later cannot leave the standalone checker green.

Requests use fixed GitHub API endpoints, reject redirects, enforce short timeouts and never send provider credentials. A passing result returns `status: "passed"` with `checks.detectedMitLicense: true`, `checks.onlyAuditedMainReference: true` and other fixed check flags. All errors use fixed diagnostic codes, without exposing raw HTTP responses or private inputs. A missing, unrecognized or non-MIT GitHub license returns `public_repository_license_not_detected`. An unexpected or incomplete reference listing returns `public_repository_refs_unverified`; malformed GitHub JSON returns `public_github_response_invalid`.

An **empty** new public repository can pass the separate, pre-push destination preflight without a detected license. After its first verified push, the published-source check requires GitHub's MIT detection. If detection is delayed, inspect the actual root `LICENSE` and GitHub About sidebar, wait for GitHub metadata to update, and rerun the read-only check. Do not bypass this gate or change the source to make the test pass.

GitHub API documentation: [repository metadata](https://docs.github.com/en/rest/repos/repos#get-a-repository), [Git commit](https://docs.github.com/en/rest/git/commits#get-a-commit), [all Git references](https://docs.github.com/en/rest/git/refs#list-matching-references) and [pagination](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api).

## Important limitations

- **A passing result proves only public GitHub metadata and advertised-ref consistency at the time of checking.** GitHub can change afterward, and the API cannot expose deliberately hidden refs or unreferenced objects. This is not an independent audit of the original financial transaction, a future guarantee of availability, or evidence that Devpost was submitted.
- An authenticated browser session might still hide judge-access problems. Open the final repository in a signed-out browser and follow `docs/submission/JUDGE_QUICKSTART.md` from the public source.
- API rate limits, transient delays immediately after publication (including license detection) or a private/renamed repository cause a safe failure. Retry only after confirming that the intended public source exists.
- Separately verify the public YouTube demonstration, its runtime and actual product content, the genuine exact-invoice PayPal Sandbox payment and signed webhook, and the final Devpost submission confirmation.

