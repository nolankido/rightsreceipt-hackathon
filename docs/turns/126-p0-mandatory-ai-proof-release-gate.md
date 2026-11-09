# Turn 126: require actual AI proof in release verification

**Date:** November 6, 2026  
**Scope:** Judge verification, focused real-process regression tests, submission handoff  
**Submission status:** NOT READY

## Gap closed

Turn 125 added a real locally executed AI diagnostic with a SHA-256-verified model artifact, two authored synthetic examples, 24 field comparisons and a mandatory human-review contradiction warning. However, the proof and its test suite were only optional package commands. The comprehensive release verifier could finish its other judge stages without running this concise new evidence path. In the final hackathon rush, a stale proof could be shipped as an advertised judge command.

## Implementation

1. In `package.json`, `judge:console:verify` now requires `pnpm judge:ai:proof:verify` followed by `pnpm judge:ai:proof` before the real console smoke. Both must exit 0 or the chain stops. The existing `judge:verify` command calls `judge:console:verify`, and both `verify` and `verify:static` include `judge:verify`. The canonical full release uses the normal complete verification stage.
2. In `scripts/judge-ai-proof.mjs`, unexpected arguments now yield a small, machine-readable `ai_proof_args_invalid` JSON response with exit status 2, not a silent exit. The argument itself is not echoed. Integrity failures remain sanitized and nonzero.
3. In `scripts/judge-ai-proof.test.mjs`, add an independent Node child-process execution from a directory unrelated to the repository, proving that the CLI finds the bundled model relative to its script file. Add an explicit release-chain regression to prevent inadvertent removal of the new mandatory gate. Extend the invalid-argument test to require bounded, safe JSON.
4. Update the judge guide, submission index, project status and final cutover checklist so the operator checks real AI proof execution separately from simulated PayPal and genuine Sandbox evidence.

## Focused verification, actual results

From the partial reconstructed current-source tree, using Node 24.22.1:

```bash
node --no-warnings --experimental-strip-types --test scripts/judge-ai-proof.test.mjs
node --no-warnings --experimental-strip-types scripts/judge-ai-proof.mjs
node --no-warnings --experimental-strip-types scripts/judge-ai-proof.mjs unexpected
```

- **8/8 focused tests passed**, including the real compiled-model prediction path, a modified artifact rejection, a separate subprocess and release-script inclusion check.
- The real proof command returned exit 0, `status: "passed"`, model SHA-256 `6ea099b72fe00ce4643426a2729a84b207ae8eb3460c75488fab3502037e73e2`, 24 field comparisons and `paymentEvidence: "none"`.
- A command with an unexpected argument returned exit 2 and only `{"schemaVersion":"rightsreceipt-local-ai-proof-v1","status":"failed","code":"ai_proof_args_invalid"}`.
- The release-chain test establishes the intended script links, **not** a completed pinned Node 22 release. A full checkout was unavailable through authenticated Git transport in this environment, and Node 22 was not installed. No paid provider API was called.

## Boundary and urgent handoff

This closes a proof-integrity gate, not a launch gate. Genuine separate-buyer Sandbox settlement must still be established by PayPal's authenticated paid-status read and an exact-invoice signed webhook, both checked against the same saved invoice. No public GitHub repository, verified public sub-three-minute video or submitted Devpost confirmation was produced in this turn.

Next, run `node scripts/clean-release-checkout.mjs --export-public` in the complete pinned private checkout, then complete real Sandbox acceptance and the sanitized public release. Film and verify the working product demonstration, obtain signed-out YouTube playback, and submit before the November 12, 2026 noon Pacific cutoff. The internal target remains November 9 at 3:00 p.m. Eastern.

**Decision:** Turn 126 complete, with mandatory AI proof verified only in the focused Node 24 environment. Hackathon submission remains **not ready**.
