# Turn 056 Receipt: Commit-Bound Sanitized Public Export

- **Status:** Completed local release-to-public-export integrity hardening; the real Node 22, Sandbox and deployment gates remain open.
- **Date:** October 31, 2026 UTC.
- **Priority:** P0.
- **Objective:** Prevent an operator from exporting a publication-ready one-commit source repository without a full successful release verification record for that exact source revision.
- **Exit criteria:** Require release evidence, reject stale or incomplete verification, bind the committed lockfile and recorded command logs, preserve the exact tree and privacy history invariants, and add regressions.

## Scope completed

1. Changed `scripts/export-public-release.mjs` to require `--release-evidence VERIFICATION_JSON` before constructing the public repository. The optional leading `--` used by pnpm argument forwarding is accepted.
2. Required `rightsreceipt-release-candidate-v1` evidence with `status=passed`, `mode=full`, no preflight failures, a clean Git-status hash, Node 22.13 or later within major 22, and the pinned pnpm 12.8.2.
3. Required the evidence commit to equal `HEAD`, and the saved lockfile SHA-256 plus committed and working Git blob IDs to match the exact current `HEAD:pnpm-lock.yaml` and Git-normalized checkout contents.
4. Checked all four expected release commands in order: current-source snapshot audit, frozen pnpm install, complete `pnpm verify`, and judge rehearsal. Each command must report a clean exit with the expected form.
5. Validated the hashes of every retained stdout/stderr log file and required a nonempty judge rehearsal output directory. Large or missing evidence/log files fail closed with sanitized diagnostic codes.
6. Preserved the existing one-commit noreply Git repository, exact tree identity and full public-history audit. Added only release verification digest, Node version and timestamp to the manifest stored outside the public Git tree.
7. Updated regression tests, publication runbooks, README and project status. No provider, payment, deployment or production route was changed.

## Files changed

- `scripts/export-public-release.mjs`: required commit-bound release evidence and log verification.
- `scripts/export-public-release-local.test.mjs`: eight additional synthetic regression cases, bringing the total to eleven.
- `docs/engineering/PUBLIC_RELEASE_AUDIT.md`: required evidence argument, integrity checks and limitations.
- `docs/engineering/RELEASE_CANDIDATE_VERIFICATION.md`: keep the complete evidence directory and bind it to export.
- `docs/submission/PUBLIC_REPO_PREFLIGHT.md`: correct publication command and gate.
- `README.md`, `PROJECT_STATUS.md`: release truth and next steps.
- This receipt.

## Operator sequence

From one exact clean release checkout using Node 22 and pnpm 12.8.2:

```bash
pnpm release:verify
pnpm public:export -- --release-evidence .data/release-candidate/run-.../verification.json
```

Use the actual `evidencePath` printed by the first command. Keep `verification.json`, all `*.stdout.log`, `*.stderr.log`, and `judge/` together. The export does not copy private evidence into the public repository or create/push any remote.

## Verification

The exact candidate exporter and test modules passed JavaScript module syntax checks. Eleven isolated tests ran in disposable temporary Git repositories under Node 24.22.1 using deliberately synthetic release records. They did not execute a real Node 22 `pnpm release:verify`.

The regressions cover:

- a successful one-commit noreply export with exact Git tree identity;
- dirty checkout rejection;
- source snapshot credential rejection;
- missing required evidence;
- missing or malformed evidence file;
- preflight-only evidence rejection;
- evidence from a different commit;
- committed lockfile mismatch;
- altered saved stdout log;
- failed recorded command;
- pnpm forwarding separator compatibility.

The public-release snapshot audit over the staged exporter and test modules plus safe minimal release-documentation fixtures passed with zero findings. This was not the full private repository history audit.

No network, paid AI API, PayPal Sandbox or deployment calls occurred.

## Limitations and release truth

This is a consistency and workflow guard, not independent cryptographic attestation. An operator can fabricate a self-consistent local `verification.json` plus companion logs. It does not establish genuine PayPal OAuth, invoice creation, payment, verified webhook or hosted judge access. Those separate release gates are mandatory.

The current environment lacks an authenticated local checkout of the private repository and has Node 24 rather than the pinned Node 22. The full `pnpm verify` and `pnpm release:verify` chains were not run on the merged commit during this turn.

## Next turn

Turn 057 should prioritize the exact clean Node 22 full release verifier and genuine PayPal Sandbox acceptance. Once both pass and the restricted Cloudflare/D1 judge build is ready, run the signed-out hosted smoke check, then export the sanitized public repository with this evidence gate and finalize the video and Devpost entry.

## Commit

This receipt is included in the Turn 056 implementation commit. The merged pull request identifies the exact SHA.
