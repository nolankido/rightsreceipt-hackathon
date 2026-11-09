# Turn 074: Terminal one-shot PayPal Sandbox webhook capture lifecycle

## P0 failure fixed

Turn 073 bound a one-shot collector to the exact invoice, but its timeout and close result were not authoritative over outstanding HTTP requests. The collector maintained `claimed` and `completed` separately. Timeout marked only `completed`; an HTTP request arriving late, or a request that began before timeout but finished streaming afterward, could still observe `claimed=false`, write a private `capture.json`, return HTTP 200, and complete no visible new result because the previously resolved capture promise could not be changed. This left contradictory local evidence after a reported `capture_timeout`.

## Implementation

1. Added `scripts/support/one-shot-capture-lifecycle.mjs`, a dependency-free synchronous, one-shot authority state. It begins `open`, allows exactly one claim, and permanently moves to `finished` at success, failure, expiry or close. Once finished, no request can claim the capture slot.
2. The collector's `complete` function now settles through `lifecycle.finish()`. It rejects requests to an expired or closed collector with HTTP 410 at handler entry, rechecks immediately after asynchronous request-body consumption, and requires `lifecycle.claim()` before writing an accepted capture. Concurrent callbacks cannot both claim.
3. Preserved the existing exact invoice binding and original raw JSON plus five PayPal transmission headers. This change does not authenticate incoming callbacks or grant permission; `captured_unverified` still requires PayPal signature verification and an authoritative paid invoice GET.
4. Added six focused lifecycle tests and three collector HTTP cases: a matching request after timeout and an in-flight streaming request whose body completes after timeout. Updated both `paypal:verify` and `sandbox:acceptance:webhook:capture:verify` to include the lifecycle tests.
5. Updated README, status and the Sandbox acceptance guide with terminal behavior and a recovery sequence if the collector expires.

## Verification

The exact new helper and test modules passed **six Node 22.16.0 tests** and JavaScript syntax checks, run in an isolated local directory. Their Git blob SHA-1 identities match the staged source objects. The updated collector and its expanded regression source passed a syntax and formatting sanity check.

The three newly added actual-HTTP collector tests **were not executed on this exact private checkout**. They are included in the repository test scripts to be run during the full exact-commit Node 22 release verification. The full installed application suite and genuine PayPal Sandbox acceptance have not been run.

No account credentials, PayPal payment or API call, public HTTPS forwarding, Cloudflare deployment, GitHub Actions or paid provider operation was performed.

## Remaining release work

The critical next work is to complete a genuine PayPal Sandbox invoice/payment/signature-verified webhook journey, execute `pnpm release:verify` on the exact merged Node 22 checkout, export and publish the sanitized one-commit public source, demonstrate the functioning product in a public under-three-minute YouTube video, and submit via Devpost before the contest deadline. The local collector timeout guard alone does not establish any external release evidence.
