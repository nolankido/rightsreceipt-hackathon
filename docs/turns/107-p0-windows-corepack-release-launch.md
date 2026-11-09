# Turn 107: Windows Corepack launch for the pinned release verifier

**Date:** November 5, 2026 UTC

**Status:** Focused code improvement complete. Full clean Node 22 release verification remains open.

## Release issue

`scripts/release-candidate-verify.mjs` runs the four-command full-release gate with synchronous child processes. Two planned commands previously called `spawnSync("corepack", args)` directly. On Windows, the Corepack command is ordinarily a `corepack.cmd` shim. Node's executable child-process API cannot launch `.cmd` or `.bat` scripts as standalone executables. The verifier would therefore risk a `spawnError` before reaching `pnpm install --frozen-lockfile` or `pnpm verify` on Nolan's Windows laptop.

Official technical reference: [Node 22 child_process documentation, spawning `.bat` and `.cmd` files on Windows](https://nodejs.org/download/release/v22.23.3/docs/api/child_process.html#spawning-bat-and-cmd-files-on-windows).

## Changes

1. Added the exported, pure `releaseCommandInvocation(executable, args, platform)` helper to `scripts/release-candidate-verify.mjs`.
2. Windows Corepack invocation now runs through `cmd.exe /d /c` and calls `corepack.cmd`. The `/d` flag disables `cmd.exe` AutoRun commands.
3. Only the exact predeclared `pnpm install --frozen-lockfile` and `pnpm verify` argument sequences can use this shell boundary. Any unexpected argument vector raises `unsupported_corepack_command` before a shell launches. No provider input, path or other arbitrary string is interpolated into the command line.
4. On non-Windows platforms, `corepack` still launches directly with the original separate argument vector. Node and Git commands are also unchanged on every platform.
5. Actual launch commands, including the Windows command processor when used, are retained in release verification evidence rather than reporting a fictional direct executable.
6. Added `scripts/release-candidate-verify-local.test.mjs` coverage for the two valid Windows command forms, non-Windows parity, direct Node invocation and rejection of shell-bearing or unsupported argument vectors.

## Verified outcomes

The new test initially failed because `releaseCommandInvocation` did not exist. After the implementation:

```sh
node --test --test-reporter=tap scripts/release-candidate-verify-local.test.mjs
```

**Result:** 9 passed, 0 failed on Node 24.22.1.

The combined targeted regression selection included the preflight, public snapshot audit/export, submission-candidate checker, release-judge evidence, judge browser-console smoke, page and report suites:

**Result:** 176 passed, 0 failed on Node 24.22.1.

This environment did not provide a native Windows runner or Node 22.13+ executable. The Windows invocation was validated as a pure command-construction contract; it was not executed through Windows `cmd.exe`. The full release verifier was not run against an installed, complete private checkout. No genuine PayPal Sandbox acceptance, external deployment, public export or Devpost submission happened in this turn.

## Next P0 action

Run the exact frozen private checkout under Node 22.13+ with pinned `pnpm@12.8.2` and execute `pnpm release:verify`. Resolve the first actual failing step, preserve its private verification evidence, and continue toward a genuine buyer-paid Sandbox invoice plus matching signed webhook. Do not present local simulation evidence as proof of payment or publication readiness.
