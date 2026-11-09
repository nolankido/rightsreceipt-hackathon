# Repeatable Local Judge Rehearsal

**Owning turn:** 040

## Run it

From the repository root with the supported Node 22.13 through 22.x runtime:

```bash
node scripts/judge-rehearsal.mjs
```

The command requires no package installation, browser, credentials, manual data preparation or external service. It runs the canonical application services against disposable in-memory SQLite databases, then writes a new report directory under `.data/judge-rehearsal/run-*`. The success output gives absolute paths to `report.html` and `evidence.json`. Open the HTML file locally; it works without JavaScript or a server.

An alternative output parent can be supplied with `--output DIRECTORY`. Relative paths are resolved from the invoking directory, while application source is always resolved from the script location. `--help` prints usage without creating files. With the package manager available, `pnpm judge:rehearse` invokes the same command.

Only `--output` and `--help` are accepted. The rehearsal has no database-path, URL, credential, live-provider or runtime-mode option. Every run receives a new directory. Existing reports and unrelated files are preserved, and file/symlink destinations fail closed.

## What runs

| Scenario | Purpose | Recorded steps |
| --- | --- | --- |
| Ordinary licensing journey | Verify the complete canonical asset-to-receipt path | 17 |
| Invoice delivery recovery | Lose the reply after the provider fixture commits sending; recover by GET and reject the stale command replay | 20 |
| Repeated ordinary journey | Repeat after reset and compare normalized outcomes with the first ordinary run | 17 |

Each scenario starts with the production seed: one creator workspace, one asset, one pricing policy and one reset metadata row. All 29 transactional tables are empty. The fixture applies all nine production migrations; the runner checks the complete 33-table set, foreign keys, integrity and seed snapshot.

Scripted creator and buyer actors submit the actual authenticated and capability-authorized commands. The application issues the private link, stores the immutable original request, records clarification answers, reviews all twelve rights, calculates the deterministic quote, records separate creator approval and exact buyer acceptance, creates a draft and sends the invoice. No consent, invoice, payment-evidence, permission or receipt row is inserted by the rehearsal to simulate completion.

The accepted policy quote is exactly 42,500 USD cents. Each scenario makes one create POST and one send POST to the injected provider transport. The interrupted scenario commits the synthetic send and then loses its response. The creator recovery route retrieves and validates the same invoice. Replaying the completed recovery command returns stale `409` without another provider call or reconciliation generation.

A provider `PAID` fixture label remains nonauthoritative until the existing financial reconciliation consumer validates transaction details. Reconciliation creates the payment evidence and permission; the canonical receipt issuer then produces the receipt. The rehearsal verifies the protected canonical JSON export, its integrity hash, minimized public verification, continuation from the original link and completed recovery metadata.

The fixed virtual clock is October 27, 2026 UTC, before the November 1 license start. The expected permission is therefore **scheduled**, not active. The report separately displays its actual generation time in UTC. Neither the clock nor a provider label is used to claim current real-world permission.

## Actual reset and repeatability

The runner executes the existing transactional `resetSeed` against each fully populated owned in-memory database. It does not call the destructive on-disk database verification/reset CLI or accept an existing application database path.

After each of the three journeys, it verifies the exact original seed snapshot and all 33 table counts. It then probes six old access paths: original intake, buyer offer, buyer invoice status, protected receipt export, public receipt verification and creator case review. They must return the expected `403` or `404` without a write or provider request. The final journey also ends with this checked reset.

Each fixture is closed in `finally`. The next fixture has fresh provider state and authorization caches. Reset proves retirement of transaction access, not revocation of the managed creator account. The creator fixture remains an explicitly injected test identity.

The ordinary and repeated journeys must have exactly equal minimized ordered steps, provider call counts, durable row counts and verified outcomes. Random private case IDs, capability secrets and receipt hashes are excluded from the comparison. The normalized result receives its own SHA-256 digest; the report projector independently recomputes and checks that digest.

This work also corrects a real reset metadata defect. The seed still reported schema version 2 while nine migrations were applied. It now records version 9, and `verifyDatabase` rejects a seed schema version that differs from the applied migration count. The fixture-manifest hash and pricing rules are unchanged.

## Isolation and failure handling

The public launcher starts an isolated Node worker with explicit type-stripping and loader arguments. It passes only the needed operating-system path, temporary-directory and locale settings. Application, provider, database, proxy, credential and `NODE_OPTIONS` values from the caller are not forwarded, and parent execution arguments are not inherited.

Before importing the journey and application modules, the worker installs tripwires on common fetch, HTTP, HTTPS, socket, TLS, DNS and datagram entry points. Unexpected external I/O fails the run, even if application code catches the immediate error. The actual gateway/JWKS and provider dependencies remain injected local functions. Tripwire restoration preserves original property descriptors, including inherited TLS methods.

These measures prevent accidental external I/O in trusted rehearsal code. They are not an operating-system sandbox for malicious source or a compromised host. Node may execute a parent preload before the launcher starts, so the launcher makes no claim to neutralize a preloaded parent process.

Output directories are new and artifact writes are exclusive. If the second artifact cannot be written, only files created by that failed run and still matching their recorded file identities are removed. A pre-existing collision is preserved. The worker writes a minimized `failure.json` where possible and returns a nonzero exit code. The launcher validates a closed response shape, fixed failure codes/phases and the owned output paths before echoing any worker result. Raw assertions, provider responses, error stacks and source text cannot become public failure output through that channel.

Optional Git revision discovery disables system/global configuration and command-local filesystem monitoring. If Git is unavailable, the report still records an actual source fingerprint. Source bytes are fingerprinted before and after the rehearsal; a change during execution fails the run. The report identifies the base/current revision and explicitly marks a modified checkout rather than attributing uncommitted source to a clean release.

## Minimized, reviewable output

The public report schema has a fixed step catalog, route templates, actors, outcomes and numeric evidence. It rejects unknown fields, arbitrary trace text, invalid ordering, duplicate provider writes, inconsistent authority timing, wrong prices, incomplete reset counts and false repeatability claims.

Private closures additionally reject the actual generated capabilities, concrete record IDs, invoice/payment references, buyer identity, request/answer text, synthetic credentials, signed assertions and private keys if they appear in JSON or HTML, including relevant encoded forms. The reports contain no usable application access links or provider payloads.

The HTML uses native disclosure controls, a responsive layout and print styles that expose all trace and reset rows. It loads no remote assets or application script. A stylesheet hash in its Content Security Policy binds the inline CSS; the JSON link is a relative local file. The report clearly distinguishes actual application handlers from injected sessions, scripted actors and provider responses.

## Verification and limits

```bash
pnpm judge:verify
node scripts/judge-rehearsal.mjs --help
```

Focused native tests cover both actual journeys and populated resets, private artifact rejection, strict report validation, environment isolation, unique outputs, file and symlink refusal, network tripwires, exact restoration, malformed worker output and partial-output cleanup. Independent CLI tests run from another working directory with poisoned application/provider/database/proxy settings and confirm unrelated files remain unchanged.

The report is inspected in Chromium on desktop and mobile, with keyboard disclosure and print checks. Native regression, executed commands, source hashes and a generated report are recorded in [Turn 040](../turns/040-p0-local-judge-rehearsal.md) and [verification.json](../evidence/turn040/verification.json).

This rehearsal does not verify a live managed login, genuine Sandbox payment/refund/webhook exchange, a deployed Worker/D1 or the pinned installed-library build. It does not run learned rights resolution automatically. Existing external runtime flags remain off, and the release remains NOT READY. The next local improvement unit can proceed without an account-owner task.
