# Public Release Audit

**Owning turn:** 050  
**Purpose:** Prevent accidental publication of credentials, private artifacts or personal data when the hackathon repository becomes public.

The PayPal AI Hackathon requires a public open-source repository. RightsReceipt has intentionally remained private while external release gates are open. Before changing visibility, the project now has a dependency-free audit that scans both the current tracked tree and all reachable Git history.

## Run

Full current-repository history audit:

```bash
pnpm public:audit
```

Current frozen-source snapshot audit:

```bash
pnpm public:audit:snapshot
```

The release-candidate build uses snapshot mode because the final hackathon repository is generated as a fresh one-commit export rather than publishing the private development history.

Evidence is written under:

```text
.data/public-release-audit/run-*/audit.json
```

The evidence file never contains matched credential values.

## What is scanned

The audit checks:

- every currently tracked path;
- every reachable Git blob from the repository's commit trees;
- current Git index modes and historical tree entry types, rejecting symlinks and submodules;
- UTF-8 text files up to 16 MiB, including the 3,592,589-byte synthetic training dataset;
- explicit blocking findings for files above the size limit, binary or invalid UTF-8, and unresolved Git LFS pointer files;
- UTF-8 text blobs up to 16 MiB;
- filenames associated with environment files, private keys, databases, private runtime data, recordings and archives;
- PEM private-key material;
- GitHub classic/fine-grained PAT, OAuth, GitHub App user, installation and refresh token prefixes, including JWT-style installation tokens;
- OpenAI project, service-account, administrator and legacy-style API key shapes, plus Anthropic, Slack, npm, Stripe, AWS long-lived/temporary and Google token prefixes;
- literal Bearer credentials;
- basic-auth credentials embedded in URLs;
- sensitive environment assignments such as PayPal, OpenAI, Cloudflare, GitHub, AWS, Stripe and Slack secrets;
- email addresses outside explicit fixture-only domains;
- embedded credentials in the Git remote URL;
- required release/judge documentation.

The history scan is deliberate. Deleting a credential from `main` does not make a public repository safe if that credential remains reachable in earlier commits. No skipped large or binary source can produce a green result: a blocked object must be removed or replaced with inspectable source before release. This audit does not fetch Git LFS payloads or recurse into Git submodules.

## Turn 102: expanded token prefix coverage

The private-repository public audit previously recognized `ghp_` and `github_pat_` GitHub token shapes but omitted documented OAuth (`gho_`), App user (`ghu_`), App installation (`ghs_`) and refresh (`ghr_`) formats. GitHub has also introduced JWT-style App installation tokens containing periods. The scanner now checks these formats as well as common OpenAI project/service-account/admin and legacy key shapes and temporary AWS `ASIA` access keys. See the [GitHub authentication token reference](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github).

A token-pattern match always produces the same minimized `known_secret_token_prefix` finding, with the matched credential omitted. An explicit fixture prefix cannot override a recognized token shape. These are **heuristic shape checks**, not proof that any token is valid or active, nor comprehensive credential detection.

## Fixture allowances

The repository contains security tests and documentation examples. The audit permits **explicitly labeled** placeholder and fixture values, including angle-bracket placeholders, `${ENV_NAME}` environment references and values beginning with a recognized fixture prefix such as `fixture-`, `synthetic-`, `fake-`, or `mock-`. Test files have a narrow additional allowance for similarly labeled synthetic tokens. Fixture email domains such as `example.test` remain permitted.

**Turn 100 security correction:** The audit no longer treats a credential as a fixture merely because the word `example`, `fake`, `mock` or `fixture` appears somewhere inside an opaque value. For instance, `PAYPAL_SANDBOX_CLIENT_SECRET=actual-key-with-fake-inside-123456` must trigger the sensitive-assignment finding rather than being automatically exempt. Known provider-issued token prefixes remain blockers regardless of fixture labels. The public audit's reports omit matched values.

These checks are intentionally heuristic and cannot prove that a public snapshot is free of all secrets or sensitive personal data. Review publication contents independently before making the sanitized source public.

## Release behavior

A finding produces a nonzero exit code and a sanitized record containing only:

- finding code;
- scope: current tree or history;
- path;
- abbreviated blob SHA when historical;
- line number when available.

The matched value is intentionally omitted.

Examples of blocking finding codes:

- `environment_file`
- `private_deployment_config` (a force-tracked `wrangler.judge.local.jsonc`)
- `private_key_file`
- `private_key_material`
- `sensitive_environment_assignment`
- `known_secret_token_prefix`
- `literal_bearer_token`
- `credential_in_url`
- `non_fixture_email_address`
- `database_file`
- `private_runtime_directory`
- `recording_or_archive`
- `oversized_blob_unscanned`
- `binary_blob_unscanned`
- `unresolved_git_lfs_pointer`
- `nonregular_git_entry`
- `required_release_file_missing`

## Development-history finding

The Turn 050 audit found that all 100 current development commits contain the same non-fixture author email in Git metadata. The value is intentionally not copied into tracked documentation or audit evidence.

For the hackathon, the current development repository should remain private. The safer release path is:

```bash
pnpm public:export -- --release-evidence .data/release-candidate/run-.../verification.json
```

This produces a new one-commit repository under ignored `.data`, using a GitHub noreply author identity. The export requires its Git tree SHA to exactly match the frozen private source tree, then runs the full history-aware audit against the one-commit repository.

The connected GitHub tools cannot create the new remote repository, so remote creation/push remains a final account action.

If the development repository itself must ever become public, do not merely delete current files.

1. Revoke/rotate the credential first.
2. Rewrite the repository history to remove the sensitive blob.
3. Force-update the private repository while it is still private.
4. Have all working copies reclone or reset to the rewritten history.
5. Rerun `pnpm public:audit`.
6. Only then consider making the repository public.

## What a green audit does not prove

A pass does not prove:

- GitHub visibility is already public;
- PayPal Sandbox evidence is complete;
- deployment is available;
- dependency licenses are all acceptable;
- the video and Devpost links are valid.

Those are separate final release checks.

## Local regression

```bash
pnpm public:audit:verify
```

The regression creates temporary Git repositories and verifies that:

- a clean fixture repository passes;
- a committed credential remains detectable after deletion;
- private environment files fail;
- required judge docs cannot disappear silently;
- private-key material and non-fixture email addresses fail without leaking into evidence;
- audit output cannot be placed in a tracked project directory.


## Additional source identity gate (Turn 068)

In addition to the publication-content scan, the exporter now verifies that **all** tracked source files are Git-normalized byte matches for the current `HEAD` commit. It rejects staged tree divergence, local modifications hidden by `skip-worktree` or `assume-unchanged`, missing files and unexpected tracked modes. This closes the gap where the release tests could run against source differing from the exported commit despite a visually clean Git status. The existing `pnpm public:audit:snapshot` checks suspicious content and unsupported Git objects; the new source-identity gate verifies exact release source provenance. Neither establishes genuine PayPal Sandbox payment evidence.

## Sanitized public export

```bash
pnpm public:export -- --release-evidence .data/release-candidate/run-.../verification.json
```

The export command:

1. requires a clean private checkout and a full successful `pnpm release:verify` record for the exact `HEAD` commit;
2. requires the record's Node 22 and pnpm pin, clean preflight, committed lockfile identity, four successful commands, intact stdout/stderr logs and a nonempty judge rehearsal output directory;
3. runs the snapshot-only source audit;
4. copies exact tracked `HEAD` blob bytes;
5. creates a fresh `main` repository with one commit and a GitHub noreply author;
6. verifies the public Git tree SHA exactly equals the private source tree SHA;
7. runs the full history-aware audit inside that new repository;
8. writes a private manifest outside the exported repository.

The exported repository contains no development commit history, no private remote, and no manifest linking local filesystem paths.

The `--release-evidence` argument must point to the `verification.json` printed by a **full** `pnpm release:verify` run, not `--preflight-only`. Keep its companion `*.stdout.log`, `*.stderr.log` and `judge/` directory together. Missing or altered logs, stale commit IDs, a mismatched lockfile or failed commands block export. The private export manifest records a SHA-256 of the release verification JSON but never copies the evidence into the public Git tree.

This is an operational consistency gate, not independent cryptographic attestation. An operator can fabricate local JSON and matching logs. Genuine PayPal Sandbox invoice, payment and verified webhook evidence remains an additional required gate, and export never contacts PayPal.

Turn 058 explicitly blocks a local judge deployment config if someone force-adds it to Git, even though the filename is ignored by default. Only the credential-free `wrangler.judge.example.jsonc` template belongs in public source. The public export keeps exact tracked blobs, so this audit rule is an additional publication safety gate.
