# RightsReceipt: safe first push to a separate public GitHub repository

**Added:** November 5, 2026  
**Status:** Publication command implemented and locally tested, including the Turn 141 post-push reference check and Turn 142 independent anonymous all-refs check. No actual public source was published during these tests.

This runbook protects the private development history. The command operates only on the one-commit export made by the successful frozen release, never on the private checkout. It cannot create a GitHub repository or change repository visibility.

## Prerequisites

1. Run the [clean checkout release](CLEAN_CHECKOUT_RELEASE.md) on the complete private repository using Node 22.13 through 22.x and pinned pnpm 12.8.2:

   ```powershell
   node .\scripts\clean-release-checkout.mjs --export-public
   ```

2. Keep the successful output. The three values needed below are `evidencePath`, `publicExport.manifestPath` and the intended **new** public repository URL. The command also prints `publicExport.repositoryPath`; do not manually substitute the private checkout for this export.
3. In GitHub, create a **new, separate Public repository**, preferably `nolankido/rightsreceipt-public-final`, with **no initial README, license or .gitignore**. The verified export already includes those files. The target must be anonymously visible before pushing.
4. Ensure your regular Git credential manager is signed in with push permission for the new target. Git prompts in the publication command are disabled, so a missing credential fails safely.

## Step 1: read-only preflight

Run from the original private repository root. Replace the three quoted placeholders with the exact real values. The command does **not** use the network or push anything without `--publish`:

```powershell
node .\scripts\public-release-publish.mjs --manifest 'PASTE_PUBLIC_EXPORT_MANIFEST_PATH' --release-evidence 'PASTE_FULL_RELEASE_EVIDENCE_PATH' --repository 'https://github.com/nolankido/rightsreceipt-public-final'
```

Required result:

```json
{"schemaVersion":"rightsreceipt-public-release-publish-v1","status":"prepared_not_published","publicCommit":"<40-hex-commit>","requiresExplicitPublish":true}
```

The preflight refuses a dirty private checkout, changed HEAD or tree, mismatched full release logs, modified manifest, unexpected public branch/tag/remote, extra public commits, modified public working files, personal public commit author, or an output outside the ignored `.data/` folder. It checks the complete full release verification and its judge evidence again.

## Step 2: explicit publication

Only after the preflight passes and you independently confirm the intended URL belongs to the new **public** repository, run the same command with `--publish`:

```powershell
node .\scripts\public-release-publish.mjs --manifest 'PASTE_PUBLIC_EXPORT_MANIFEST_PATH' --release-evidence 'PASTE_FULL_RELEASE_EVIDENCE_PATH' --repository 'https://github.com/nolankido/rightsreceipt-public-final' --publish
```

The command:

1. Repeats every local check.
2. Uses anonymous GitHub metadata to establish that the destination is publicly accessible, separate from the private source, not a fork and not disabled.
3. Runs a read-only Git remote reference check. Any existing advertised reference blocks publication, including branches, tags, notes, replace and custom refs. A branch-only check could otherwise mistake a populated repository for an empty one.
4. Pushes only the exact SHA recorded in the exported manifest to `refs/heads/main`. A creation-only lease refuses a remote `main` that appears between the reference check and the push. No `git remote add`, `--mirror`, `--all`, `--tags`, history rewrite or source repository visibility change occurs.
5. Re-reads **all** advertised Git references after the push. It requires exactly the audited `refs/heads/main` commit, with an optional matching `HEAD` reference. A late branch, tag, notes or other custom ref, an unexpected SHA, a missing `main` or an unreadable remote makes the result verification-pending. This is a point-in-time check, not a guarantee that a separate actor can never add refs later.
6. Independently checks GitHub's public API for the exact one-commit sanitized tree, noreply identity **and full advertised reference set**. Only `refs/heads/main` at the audited commit may be present. Any unexpected ref or incomplete listing leaves publication verification pending.

Successful result: `status: "published_and_verified"`.

If the Git push succeeds but either the post-push remote-ref check or the follow-up anonymous GitHub read fails, the result is **`pushed_verification_pending`** and the command exits nonzero. `public_post_push_refs_unverified` means the ref set was unexpected or could not be read; `anonymous_public_source_check_failed` means the later GitHub content check failed. **Do not run `--publish` again.** The push may already have created the public `main` branch.

Before treating either pending outcome as resolved, inspect all remote refs using this read-only command, replacing the repository if your intended destination differs:

```powershell
git ls-remote https://github.com/nolankido/rightsreceipt-public-final.git
```

The advertised list must contain `refs/heads/main` pointing to the exact manifest `publicCommit` SHA, and may also contain `HEAD` at that **same** SHA. If you see any other ref or a mismatched SHA, stop and investigate the public destination before claiming a verified release. If the read is unavailable, leave the gate pending. Only after that succeeds, wait for GitHub to settle and use the separate read-only [anonymous source check](ANONYMOUS_PUBLIC_GITHUB_CHECK.md) with the same manifest and URL. Turn 142 makes that checker independently verify **all** advertised API refs, but the manual Git read is still useful when diagnosing a previous post-push ref mismatch. The safe first-push command itself will refuse the now nonempty repository.

If authentication or a network error prevents the push, the result is a fixed failure code without leaking URLs with credentials, private artifacts, Git output or PayPal data. Diagnose your normal Git authentication and the empty repository in the GitHub UI before any further attempt. Never use `--force` or manually push the private repository as a workaround.

## Step 3: independent judge readiness

- Open the new GitHub repository in a signed-out or private browser window. Confirm README, MIT LICENSE, public source and that the commit history contains **one** sanitized commit.
- Clone the new **public** repository separately and follow [JUDGE_QUICKSTART](JUDGE_QUICKSTART.md), not a local private checkout.
- Capture the final GitHub URL for Devpost only after checks pass. Separately verify genuine Sandbox evidence, public YouTube playback under three minutes and Devpost's final submission confirmation.

## Security and scope limits

- `--publish` is a real external write and intentionally requires explicit opt-in. The first step is local-only.
- The creation-only lease plus full advertised-reference checks before and after the push prevent a false-green result for unexpectedly populated advertised ref sets at those checkpoints. They cannot detect unreferenced remote Git objects or refs deliberately hidden from Git advertisement, and cannot prevent future remote mutations. Neither protects against a malicious local Git installation or a Git credential-helper configuration that rewrites HTTPS URLs.
- The code uses the existing Git credential manager only for the permitted push. It does not itself handle PayPal, GitHub API tokens, Cloudflare deployment or Devpost.
- A successful public GitHub source check does not prove the payment, video content, submission state or long-term availability.

See the [final cutover checklist](FINAL_CUTOVER_CHECKLIST.md) for the remaining mandatory gates.
