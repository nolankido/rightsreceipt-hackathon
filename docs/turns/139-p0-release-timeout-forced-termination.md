# Turn 139: force release stage exit on timeout

**Date:** November 7, 2026 UTC  
**Priority:** P0 clean-release reliability  
**Release decision:** NOT READY

## Concrete problem

Turn 117 added explicit budgets for all four mandatory release stages, but its `spawnSync()` calls used `killSignal: "SIGTERM"`. Node's synchronous child-process API sends the configured signal on timeout and then waits until the child actually exits. A stalled process can register a SIGTERM handler that continues running, defeating the intended bounded wait. The outer `clean-release-checkout.mjs` child launcher relied on the same catchable default signal.

This matters when the full Node 22 release is run on Nolan's Windows computer close to the hackathon deadline. A timed-out verification, dependency installation or checkout operation must fail promptly enough to permit a controlled retry or first-failure investigation.

## Code changes

- `scripts/release-candidate-verify.mjs`: use `killSignal: "SIGKILL"` in `runReleaseCommand()`. The fixed 2, 8, 15 and 3 minute stage budgets and 15-second internal Git budget are unchanged.
- `scripts/clean-release-checkout.mjs`: use `killSignal: 'SIGKILL'` for the outer synchronous `run()` launcher, including its full-release and optional sanitized export calls.
- `scripts/release-candidate-verify-local.test.mjs`: update the mocked timeout contract to expect forced termination and add a real child process that catches SIGTERM but otherwise exits only after a delayed timer. The real subprocess is bounded by its own timer so the regression cannot hang indefinitely.
- Update the [Windows clean release runbook](../submission/CLEAN_CHECKOUT_RELEASE.md), the [submission index](../submission/README.md) and [project status](../../PROJECT_STATUS.md).

No stage is skipped. A process timeout still emits a nonzero stage result and records `ETIMEDOUT`; partial output cannot authorize a clean release.

## Regression evidence

The new test launches a real Node child with a SIGTERM listener and a 2,400 ms self-exit timer, but gives the release wrapper a 600 ms timeout.

| Version | Observed result |
| --- | --- |
| Prior `SIGTERM` implementation | Test failed: synchronous verifier waited about 2,532 ms, well past the 600 ms budget |
| Updated `SIGKILL` implementation | Test passed: forced direct child exit in about 604 ms; `ETIMEDOUT` and nonzero exit retained |

Verification from the repository root:

```powershell
node --test scripts/release-candidate-verify-local.test.mjs scripts/clean-release-checkout.test.mjs
```

**Observed:** 43 passed, zero failed, on Node 24.22.1. The real ignored-SIGTERM fixture is skipped on Windows because Node's Windows termination semantics differ; the configuration contract and existing stall regression still run there. No complete Node 22 checkout or actual export was available in this environment.

## Limitations and operational handoff

Forced termination targets the direct subprocess. It does not guarantee that process descendants, particularly pnpm commands spawned through a Windows command shim, have also exited. After a timeout, inspect for orphaned package-manager or test processes before retrying. Keep partial logs under the private evidence directory; never publish or paste them directly. The hard timeout prevents waiting for a direct child that deliberately catches SIGTERM, but it does not prove that all downstream resources have been cleaned up.

Node's official explanation of synchronous child timeout behavior is in the [child process API documentation](https://nodejs.org/api/child_process.html#child_processspawnsynccommand-args-options).

The next P0 action remains the **actual** one-command clean verification and audited export on the complete private Windows checkout with pinned Node 22:

```powershell
node .\scripts\clean-release-checkout.mjs --shareable --export-public
```

After a passing local release, the separate genuine PayPal Sandbox buyer-paid evidence, sanitized public repository, signed-out under-three-minute video and confirmed Devpost submission are still required. No external payment, public GitHub publication, YouTube upload or Devpost submission was attempted during this turn.
