# Turn 148: execute the judge experience from the sanitized public export

**Date:** November 8, 2026, America/Phoenix
**Priority:** P0, judge-accessible hackathon artifact
**Status:** Implementation and focused regression verification completed; full pinned clean-release verification to be recorded separately.

## Observed gap

Turn 147 proved that a fresh extraction of the 804-file sanitized source ZIP could run both the browser-console rehearsal and the actual local model proof with Node 22, no installation, no PayPal credentials and no external requests. The release exporter previously checked committed source identity, sanitized history, file modes and a passing private release, but did not execute anything from the **new public repository** before reporting export success. A future accidentally omitted asset or broken entry point could therefore pass static export audits and leave judges unable to run the project.

## Change

The public exporter accepts an opt-in `--verify-judge` flag. The canonical `clean-release-checkout.mjs --export-public` path always supplies it. After history and tree audits, the exporter runs both commands from the new one-commit export, under the existing credential-stripped local environment:

```bash
node scripts/judge-console-real-smoke.mjs
node --no-warnings --experimental-strip-types scripts/judge-ai-proof.mjs
```

The first must prove the actual localhost POST-driven flow, three passing scenarios, three resets, no external requests, simulated-only financial evidence and a visible real-model diagnostic. The second must prove execution of the committed SHA-256-verified classifier, 24 rights-field comparisons, synthetic-only inputs, visible contradiction warning and no payment evidence. Both runs have bounded timeouts and strict machine-readable outcome checks. Raw child stdout/stderr are never printed into the shareable release handoff or the public manifest.

The manifest now includes a fixed, limited `publicJudgeExperience` object. The outer release runner refuses a missing, skipped or misleading result even if the public Git tree and author identity match. A direct, manual export without `--verify-judge` still works for private research, but its manifest is explicitly marked `not_requested` and it cannot satisfy the canonical release runner's export gate. The exported Git tree must remain byte-identical and clean after smoke execution; generated local `.data` is ignored.

This does not prove a genuine Sandbox buyer payment, signed webhook, public GitHub visibility, video quality or Devpost submission.

## Focused evidence

- Actual previously sanitized ZIP extracted into a new directory: Node 22 localhost smoke passed all three journeys, three resets, no external requests and simulated-only payment; separate real local model proof passed 24 rights-field comparisons with contradiction warning and `paymentEvidence: "none"`.
- Under Node 22.23.4, focused export and wrapper test collections plus the new isolated judge-gate tests reported 47 passing executions, zero failures and two existing skips.
- Regression cases reject missing runnable entry points, a fake or incomplete browser summary, falsely claimed paid evidence, missing model proof, bad artifact hashes and a skipped export-level check.

## Next gate

Run the full pinned Node 22 clean release with `--shareable --export-public` on a committed exact source revision and inspect its new manifest. Then publish the reviewed separate public source, publish an actual functional YouTube video under three minutes, independently verify links and judge setup, and submit on Devpost before the deadline. Genuine paid Sandbox acceptance remains a separately recommended quality gate requiring the configured owner's Sandbox app and buyer account.
