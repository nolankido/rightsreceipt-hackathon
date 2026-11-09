# Turn 131: one full release, safe stdout and actionable private export paths

**Date:** November 6, 2026  
**Scope:** P0 Windows release handoff and private evidence hygiene  
**Submission status:** NOT READY

## Operator problem

`--shareable` printed a fixed path-free JSON summary suitable for remote diagnosis, while `--export-public` returned the actionable private source-export locations. The flags already worked together, but their combined mode printed only the safe summary and discarded the detailed export paths from stdout. A passing shareable run therefore forced a second complete release merely to obtain the private output paths. The full release has a thirty-minute outer timeout and the public exporter has a separate fifteen-minute timeout, so unnecessary repetition is costly during hackathon cutover.

## Improvement

- `scripts/clean-release-checkout.mjs` retains the existing path-free stdout for `--shareable`, alone or combined with `--export-public`.
- When a validated release evidence path exists, the same operation now writes its complete detailed result to `.data/clean-release/handoffs/run-*.json`, separate from the evidence folder and from the public export tree.
- A private handoff is saved only within the original release-owned directory structure, after verifying the expected absolute evidence filename and source commit, with no symlinked evidence directory or handoff folder. It uses exclusive `wx` creation so an earlier result cannot be overwritten, and `0600` permissions where supported.
- The public JSON adds only `privateHandoffSaved: true` or `false` when an evidence path exists. It never includes the full path, commit ID, provider payload or export manifest content. A failure to save the private copy is reported as false, not as a fictional saved artifact.
- An early CLI error such as `node_22_required` still emits only its fixed safe JSON, without creating a handoff file. Ordinary non-shareable output remains unchanged.

The handoff file itself is private. It can contain the clean checkout, release evidence and audited public-export locations, and it must not be committed, uploaded, pasted into a chat or copied to the public repository. The root `.gitignore` already excludes `.data/`.

## Recommended single-run command

From PowerShell in the **complete private RightsReceipt repository** with Node 22.13+ within major 22:

```powershell
node .\scripts\clean-release-checkout.mjs --shareable --export-public
```

The command runs the exact same clean-release and conditional public-export validation as before. If it succeeds, share only the small stdout JSON and inspect the corresponding newest private `handoffs/run-*.json` locally for `publicExport.repositoryPath` and `publicExport.manifestPath`. Do not substitute a handoff result from a different run. The exporter still creates only a local audited one-commit repository, never a public GitHub repository.

If the full release fails, the shareable JSON reports a bounded first failed stage and recognized errors. Address that first failure. If `privateHandoffSaved` is false or absent, do not assume a private handoff file was written.

## Verification actually performed

- Restored the current exact-source release runner and test dependencies after temporary workspace maintenance; the unchanged baseline passed 23/23 checkout tests.
- Added two focused tests for safe combined export output, exact private sidecar content, restrictive permissions on POSIX, exclusive non-overwrite behavior, outside-path refusal, symlink redirection refusal and absent evidence.
- `node --test scripts/clean-release-checkout.test.mjs` passed **25/25** on Node 24.22.1, including local temporary real Git repositories.
- The full pinned Node 22 release could not run in this environment because only Node 24 and a reconstructed subset of private source are available. No genuine PayPal Sandbox payment, public GitHub repository, YouTube video or Devpost submission was created.

## Remaining release gates

Use the validated private handoff to publish only the sanitized export, then confirm a separate buyer-paid PayPal Sandbox invoice with authenticated PAID retrieval and signed exact-invoice webhook. Public source must expose a recognized open-source license. The functional video must be publicly watchable on YouTube and under three minutes, and the Devpost entry must be submitted and confirmed. This improvement does not waive any of those independent gates.
