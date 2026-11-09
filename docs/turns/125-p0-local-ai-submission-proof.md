# Turn 125: executable local AI proof for submission

**Date:** November 6, 2026  
**Scope:** Actual-model judge evidence, supplemental CLI, tests and handoff documentation  
**Submission status:** NOT READY

## Why this turn

RightsReceipt's browser judge console separates simulated provider payments from real local model inference. The AI diagnostic is real, but demonstrating that fact required running the full console and inspecting its browser page. A judge or release operator needs a small reproducible command that executes the checked-in model and independently verifies the critical diagnostic content, with no login, credentials, network access or provider payment.

This proof makes an existing capability easier to inspect. It does not build a new model, improve its validation scores, resolve the contradictory territory example, or establish an authentic PayPal payment.

## Implementation

- `scripts/judge-ai-proof.mjs`: execute the existing `runJudgeAiDemo` path, which verifies the bundled model artifact against its training report and runs the actual local classifier alongside the separate source-span extractor. No network, private user input, file write, account or PayPal interaction is needed.
- Fail closed if the SHA-256 identity is missing or inconsistent, either synthetic case is absent, the 12-field by two-case table is not complete, the model's uncalibrated disclaimer is gone, or the contradiction warning is missing.
- Emit only a fixed, bounded JSON evidence object. Its claims are limited to actual local inference, two synthetic requests, 24 field comparisons and explicit `paymentEvidence: "none"`. A failure prints a fixed code without revealing local paths, model bytes or internal exceptions.
- `scripts/judge-ai-proof.test.mjs`: exercise the real bundled model, modified report, altered model identity, incomplete rows, absent output, tampered artifact, safe CLI payload and invalid command arguments.
- `package.json`: add `judge:ai:proof` and `judge:ai:proof:verify` without weakening or replacing the existing full release gates.
- `JUDGES.md`, `docs/submission/README.md`, and `PROJECT_STATUS.md`: document the proof as supplemental to the browser application, authentic Sandbox acceptance and actual publicly viewed video.

## Reproduce on a complete pinned checkout

Use Node 22.13.x through 22.x and the checked-in package manager for the full release path. To run just this stand-alone AI proof from repository root:

```bash
node --no-warnings --experimental-strip-types scripts/judge-ai-proof.mjs
node --no-warnings --experimental-strip-types --test scripts/judge-ai-proof.test.mjs
```

Or after a normal pinned install:

```bash
pnpm judge:ai:proof
pnpm judge:ai:proof:verify
```

The observed model artifact hash was:

```text
6ea099b72fe00ce4643426a2729a84b207ae8eb3460c75488fab3502037e73e2
```

The proof output reports `status: "passed"`, `modelExecution: "real_local_inference"`, `syntheticRequestCount: 2`, `evaluatedRightsFields: 24`, `contradictionWarningVisible: true` and `paymentEvidence: "none"`. These are evidence of a bounded executable diagnostic, not a production accuracy, permission or payment guarantee.

## Executed checks and limitations

- **6/6 focused proof tests passed** with Node 24.22.1 on the reconstructed current source, including a modified artifact that fails integrity verification.
- The actual CLI passed and printed only bounded JSON with the verified artifact hash.
- The Devpost copy preflight read the existing draft and remained **blocked** as designed: no genuine public GitHub repository URL or YouTube watch URL, with unresolved placeholders. All fifteen mandatory draft sections exist, but copy completeness is not public availability.
- The complete source repository could not be authenticated and cloned through this environment, and local Node is 24 rather than the pinned 22. **No clean `pnpm release:verify` or real browser/Worker release was performed.**
- No real separate-buyer PayPal Sandbox invoice payment, payment-status read, verified signed webhook, actual public repository, working public YouTube video or Devpost submission was produced in this turn.

## Next required action

Do not spend the remaining hackathon window expanding features. On Nolan's complete private Windows checkout with Node 22 and pinned pnpm, run `node scripts/clean-release-checkout.mjs --export-public`, resolve the first real release failure, then complete authenticated same-invoice PayPal Sandbox settlement and signature-verified webhook evidence with callback bound before buyer payment. Publish and check the one-commit sanitized MIT source, record and validate an actual product-operation video under three minutes, verify YouTube signed out, and submit the Devpost entry. The internal target is November 9 at 3:00 p.m. Eastern; the official contest deadline is November 12, 2026 at noon Pacific.

**Decision:** This focused improvement is complete. The hackathon submission is **not** ready until the external evidence and release gates above pass.
