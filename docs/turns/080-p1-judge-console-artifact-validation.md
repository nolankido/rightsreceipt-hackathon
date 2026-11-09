# Turn 080: Reproduced and fixed false success in the judge console

## Failure reproduced

The console previously announced `Local rehearsal passed` after checking that two output files existed. Report security-policy validation happened only when a judge later opened `/report`; JSON evidence was not parsed before success. Consequently, a malformed report, unsafe report policy, invalid JSON, failed evidence record, or files from different execution directories could produce a passing page. A failed rerun could also display new invalid output as successful.

Starting from commit `95f554e2135475129b6912e1a73e16439251777c`, the exact source modules were reconstructed locally and their Git blob SHA-1 values checked against GitHub. The six existing console HTTP tests passed. Six additional HTTP regression tests then failed against that unchanged source, reproducing the problem rather than relying on source inspection alone.

## Correction

`scripts/judge-local-console.mjs` now validates the complete report/evidence pair before assigning successful state. Both files must resolve to the same execution directory inside the owned output area, satisfy the existing size bounds, decode as valid UTF-8, and contain the expected report CSP and local rehearsal evidence envelope. Evidence must identify `judge-rehearsal-v1`, `local_injected`, `passed`, three scenarios and three resets.

After validation, the server retains the accepted bytes in memory. `/report` and `/evidence` serve that snapshot rather than rereading mutable files. A later on-disk replacement cannot silently change what authorized the passing page. This snapshot is replaced only after another fully accepted run, and cleared when a new run begins. Failure exposes neither prior evidence links nor rejected artifacts.

The original CSRF token, same-origin restriction, localhost-only listener, five-run limit, renderer, child-worker launch and independent genuine PayPal acceptance requirements remain unchanged. This is a file-pair and evidence-envelope check, not proof of full scenario semantics or PayPal authenticity.

## Executed verification

All of the following ran under Node 22.16.0 using the real localhost HTTP server and current renderer:

- 17 console HTTP/CLI tests, including 11 new regression cases.
- 9 existing page-renderer tests.
- 8 existing smoke-validator tests.

Result: **34 passed, zero failed**, followed by three additional complete repeat runs with the same result. The new tests cover malformed and unsafe reports, invalid JSON/UTF-8, failed or incomplete evidence, cross-directory output, failed reruns, snapshot stability after file replacement, concurrent-run rejection and the existing smoke client operating through the actual console with controlled artifacts. JavaScript syntax checks also passed.

The exact tested source blob IDs, base revision, command and limitations are recorded in [the validation record](../evidence/turn080/validation.json). The expanded console tests are already included by the existing `judge:console:verify` command; no new command or dependency was introduced.

## Scope and remaining release requirements

The validation used a hash-checked subset of repository modules with an injected rehearsal runner. It was not a full private repository clone, did not execute the canonical licensing worker, and was not `pnpm release:verify`. The real-worker smoke, complete clean release verification and genuine PayPal Sandbox invoice/payment/signed webhook remain outstanding, along with the sanitized public repository, demonstration video and Devpost submission.

No production or Sandbox PayPal request, payment, external deployment, paid API operation or GitHub Actions job was performed. Local HTTP test traffic was loopback-only.
