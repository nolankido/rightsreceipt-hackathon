# Turn 143: physically safe Sandbox acceptance output paths

**Date:** November 7, 2026
**Priority:** P0, prevent private payer and transaction artifacts entering source control
**Status:** Implemented and locally tested in the private repository. Release remains NOT READY.

## Problem and before-fix reproduction

The PayPal acceptance harness writes state, sanitized evidence and the confidential PayPal Sandbox payer link under ignored `.data` by default. It also permits a custom `--output` directory outside the repository. The previous `runDirectory` check used only lexical path components, not resolved filesystem targets.

A `.data` child symlink pointing to a tracked-source directory therefore appeared safe lexically and could receive the newly created run folder. An outside-repository symlink pointing back into source bypassed the lexical check in the opposite direction. Either could place private `state.json`, `evidence.json` or `sandbox-payment-link.txt` where a later source commit might expose it.

The regression first failed against the old code. A mocked Sandbox invoice could be created through the redirected output path, with the run directory physically landing in the controlled test source sink.

## Implementation

In `scripts/paypal-sandbox-acceptance.mjs`:

1. Resolve the nearest existing ancestor of the planned output directory using `realpathSync`, and append any missing path segments to determine the physical target before creating directories.
2. Resolve the real private source root. Reject a target inside the source root unless it is under the real `.data` directory, including when the apparent `.data` entry is itself redirected.
3. Apply the physical check once before the create command performs its initial OAuth/webhook-readiness requests, again before `mkdirSync(base)`, and after `mkdirSync(base)`, before creating a new run folder or writing any evidence.
4. Preserve support for a genuine external private output directory. Keep the existing lexical guard and fixed error `unsafe_private_path`.

## Verification and scope

- A new regression covered both a `.data` symlink and an outside alias into tracked source, as well as nested destinations that did not yet exist. It initially failed by allowing the unsafe output, then passed after the fix.
- The test confirms that no PayPal request of any kind occurs and the controlled tracked-source sink remains empty. A positive test confirms that a real external temporary output location can still produce a complete local test run.
- `node --experimental-strip-types --import ../ts-test-resolve-hook.mjs --test scripts/paypal-sandbox-acceptance-local.test.mjs scripts/paypal-acceptance-evidence-check-local.test.mjs` passed 27/27 on Node 24.22.1. The resolver is a temporary local test compatibility file, not part of the private GitHub commit or production release.
- All provider responses were local mocks. No PayPal API call, buyer payment, provider signature proof or public-source write was performed.

The path validation protects against accidental or pre-existing directory redirection, not a malicious process swapping a filesystem entry between the final check and the subsequent write. Exact operator permissions, a clean complete Node 22 release, real paid Sandbox acceptance, the separate public-source release, a genuine public video and Devpost confirmation remain open.
