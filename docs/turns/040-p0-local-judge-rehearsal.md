# Turn 040 Receipt: Repeatable Local Judge Rehearsal and Reset

- **Status:** Completed and locally verified.
- **Date:** October 28, 2026 UTC.
- **Objective:** Make the canonical licensing journey reproducible for a local judge rehearsal, including interrupted invoice recovery, with no credentials, manual setup or account-owner dependency.
- **Scope completed:** Public one-command launcher, isolated worker, actual handler journey, populated reset and retired-access probes, strict evidence projection, offline HTML report, native and browser verification, project records and next-unit selection.
- **Schema/dependencies:** Nine migrations and 33 domain tables remain unchanged. Seed schema metadata is corrected from 2 to 9. No dependency or package was added.
- **Release status:** NOT READY; external and pinned-toolchain gates remain open.

## Shipped behavior

```bash
node scripts/judge-rehearsal.mjs
```

The command works on Node 22.13 through 22.x without installing packages, opening a browser, configuring credentials or preparing a transaction. It creates a unique directory containing `report.html` and `evidence.json`, prints their absolute paths and exits nonzero on failure. `--output DIRECTORY` selects another output parent, and `--help` prints usage without creating artifacts. Package aliases are `pnpm judge:rehearse` and `pnpm judge:verify`.

The rehearsal runs three scenarios with 54 recorded steps: an ordinary journey, a lost send reply followed by authenticated recovery, and a repeated ordinary journey. Each starts from the production workspace, asset, pricing policy and reset metadata only. Every transactional record is produced through actual handlers and processors.

The scripted actors issue a private request link, submit immutable intake, answer clarification, review exact terms and deterministic pricing, separately approve and accept, create and send one invoice, reconcile payment evidence, issue a canonical receipt, verify its private export and public projection, and continue from the original link. The $425.00 USD quote and one-create/one-send counts are asserted for every scenario. The fixed clock precedes the license start, so permission is correctly reported as scheduled.

The interrupted scenario loses a response after the provider fixture commits sending. Recovery retrieves and validates the same invoice; it does not send another invoice. An exact stale replay returns `409` without another provider call or reconciliation generation. A provider `PAID` label still establishes no financial authority until canonical transaction reconciliation completes.

## Reset and repeatability

The real seed reset executes against every populated owned in-memory database, including the final one. It restores the exact seed snapshot and all 33 table counts, empties all 29 transactional tables and then checks six old buyer, receipt and creator-case access paths. Expected `403` or `404` responses must occur without writes or provider calls. Every fixture closes in `finally`, and the next scenario starts with fresh authorization and provider caches.

The first and repeated ordinary journeys must have equal ordered public outcomes, provider counts and durable row counts after private runtime identities are excluded. The runner computes a normalized SHA-256 digest and the report projector independently verifies it. Source bytes are also fingerprinted before and after execution, so source changes during a rehearsal fail the run.

This work found that the seed still recorded schema version 2 despite nine applied migrations. The seed now records 9, and database verification rejects mismatched metadata. The fixture-manifest hash and pricing policy remain unchanged. The existing whole-file seed guards in Gate C and receipt issuance were updated to the reviewed new blob; the guards were retained.

## Isolation, privacy and failure behavior

The launcher gives its worker an allowlisted operating-system environment. Application, provider, database, proxy and preload settings are excluded. No database-path, URL, credential or live-mode argument exists. The worker installs network tripwires before importing application modules, and the run requires zero external attempts. This is an accidental-I/O guard for trusted code, not an operating-system sandbox or protection against a hostile parent runtime.

Output creation refuses file/symlink destinations and uses a fresh owned directory with exclusive artifact writes. The launcher validates a closed public worker response before printing it. Failures expose fixed codes and phases, not assertions, private payloads or stack traces. If a later artifact write fails, cleanup removes only newly created files whose identities still match and preserves pre-existing collisions. A minimized `failure.json` is written where possible.

The report uses a fixed step catalog and exact public schema. It rejects arbitrary trace fields, reordered steps, duplicate provider writes, inconsistent authority timing, incomplete resets and false repeatability claims. Private closures reject actual generated capabilities, record identities, buyer details, raw intake/answers, signed assertions and provider references in the artifacts, including encoded variants.

The report is self-contained and script-free. Native disclosures support keyboard interaction; mobile layouts wrap correctly, and print styles expose all otherwise collapsed evidence. It labels injected sessions, scripted actors and provider responses clearly. The checked-in example records the modified source checkout against its base revision and includes the actual source fingerprint; it is not mislabeled as a clean published checkout.

## Review corrections

1. Tripwire restoration now preserves property descriptors and deletes temporary shadows of inherited TLS methods.
2. Public worker output is projected through a strict schema and owned-path check before being printed.
3. Partial artifact cleanup removes only files created by the failed run and preserves pre-existing collisions.
4. Optional Git discovery disables filesystem monitoring and system/global configuration.
5. The worker loader is passed as a file URL for cross-platform ESM path handling. Execution was verified on Linux; a Windows runtime was not available.
6. Report validation requires exactly one row in every seed table, including reset metadata.

## Verification results

| Collection | Result |
| --- | --- |
| Current native tests across 50 files | **2,149 passed**, zero failed/skipped/cancelled |
| New canonical journey/reset collection | **4 passed**, included above |
| New report validation collection | **56 passed**, included above |
| New isolation/CLI collection | **15 passed**, included above |
| Seed schema metadata regression | Passed, included above |
| Final public CLI | **3 scenarios, 54 steps, 3 populated resets passed** |
| Generated report browser | **14 checks passed**, desktop/mobile/keyboard/print |
| Strict source TypeScript 5.8.3 | Transaction/receipt scope passed |
| All-source TypeScript syntax | **174 files**, no syntax errors |
| Workspace and formatting | Passed, 13 packages, 24 internal edges, no cycles, 320 files checked |
| Diff whitespace | Passed |

The complete native collection initially passed 2,147 of 2,149 tests. Its two failures were stale whole-file seed hashes. After updating only those expected hashes, the complete Gate C and receipt issuance files passed 48 and 64 tests respectively. The native evidence replaces their prior outcomes and preserves the initial collection and rerun summaries. The final public CLI ran after all source edits, including the loader file-URL adjustment. No unnecessary full-suite repeat is represented as having run.

The isolation collection also runs two independent public CLI invocations from a different working directory under poisoned application/provider/database/proxy settings. It verifies repeatability, unique output ownership, sentinel preservation, malformed worker output rejection, network blocking/restoration and a real second-artifact collision. Browser checks are bound to the final HTML's SHA-256. The prior turn's 442 application-browser checks were not rerun or added to this turn's browser count.

Records: [generated report](../evidence/turn040/report.html), [minimized JSON evidence](../evidence/turn040/evidence.json), [verification summary](../evidence/turn040/verification.json), [native results](../evidence/turn040/native-regression.json), [report browser checks](../evidence/turn040/report-browser.json) and [engineering details](../engineering/LOCAL_JUDGE_REHEARSAL.md).

## Limits and next unit

The application handlers, signed assertion verifier, SQL ownership, financial and receipt services execute locally against all nine migrations and SQLite. Gateway/JWKS and provider responses are injected. No live managed login, genuine Sandbox payment/refund/webhook, deployed Worker/D1 or pinned clean installation/build is claimed. Available TypeScript 5.8.3 does not replace pinned 5.9.3 checks. Reset retires transaction access; it does not revoke the managed creator account.

No real credentials, customer messages, payments, paid services, deployment, GitHub Actions or remote schedule were used. All external runtime flags remain off and merchant values remain blank. The generated report is an engineering demonstration, with video/storyboard, public judge access and submission materials still separate release work.

**Next:** Turn 041 P0, improve keyboard accessibility and form recovery across buyer intake/clarification/acceptance and creator review/invoice recovery with automated local browser interactions. Record the actual audited scope, preserve deliberate consent/provider actions and proceed without credentials, deployment or an account-owner task.
