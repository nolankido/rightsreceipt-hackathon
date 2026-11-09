# Turn 069: Executable local browser judge console and submission-path correction

## Reason for this turn

Official PayPal AI Hackathon rules, verified November 3, 2026 at https://paypalaihackathon.devpost.com/rules, explicitly permit a functional self-run demonstration with complete repository setup instructions instead of a hosted URL. Static illustrations alone are not enough. The private RightsReceipt roadmap had repeatedly treated Cloudflare deployment as mandatory, creating avoidable dependency on account provisioning despite an existing dependency-free canonical rehearsal with actual application handlers.

## Implementation

The new `node scripts/judge-local-console.mjs` starts a browser-facing review console bound to the IPv4 loopback interface `127.0.0.1` on an ephemeral port. It prints the complete local URL. The reviewer clicks **Run application rehearsal** to spawn the existing `judge-rehearsal.mjs` command in a fresh isolated run directory and open its generated report or minimized JSON. The underlying canonical worker still executes ordinary licensing, interrupted invoice-send recovery and repeat/reset scenarios with actual domain/application/SQL/receipt handlers. Human sessions and provider HTTP remain injected, and the simulated result is never represented as a genuine PayPal transaction.

The console:

- Runs on the existing pinned Node 22.13 through 22.x runtime without package installation, credentials, Cloudflare or paid APIs.
- Strips inherited provider configuration using the same existing worker-environment allowlist.
- Makes no remote request; its only listener binds to `127.0.0.1`.
- Requires exact local Host, same-origin POST, hidden random form token, bounded form body and a maximum of five runs per server session.
- Serves only the latest generated report and evidence files from the owned `.data/judge-console` output subtree, with bounded file sizes and private no-store headers.
- Preserves the generated report's strict SHA-256 inline-style CSP; the console itself uses a restrictive no-script CSP and anti-framing headers.
- Rejects noncanonical endpoints, unsafe output paths and failures without exposing worker stderr or private provider details.

## Tests and documentation

Added `scripts/judge-local-console-local.test.mjs` with six isolated loopback HTTP/CLI cases: safe first load, same-origin run and evidence serving, CSRF and method rejection, bounded run count, output-path confinement, and CLI help. **Six tests passed on Node 22.16.0** using an injected synthetic report generator. The existing canonical report from Turn 040 has an HTML size of 47,639 bytes and evidence JSON size of 40,390 bytes, below the 256 KiB console limit.

Registered `pnpm judge:console` and `pnpm judge:console:verify`, and included the test in the existing `judge:verify` chain. Updated `JUDGES.md`, `docs/submission/JUDGE_QUICKSTART.md`, `docs/demo/README.md`, the submission/readiness documentation, the README and project status to make the self-run functional path explicit and Cloudflare optional.

## Limitations and final release gates

These tests exercise the console and a mocked child result, **not the complete production application** or the real canonical rehearsal from this session. The actual local console must be run from a complete private checkout and again from the final sanitized public clone. The offline worker uses scripted buyer/creator actions, fake managed sessions and injected provider replies; no live AI inference, actual PayPal Sandbox payment, verified provider webhook or legal permission is proven by this browser console.

Outstanding mandatory release gates include exact clean Node 22 `pnpm release:verify` and clean-clone functional evaluation, a genuine PayPal Sandbox invoice/payment/webhook acceptance case, public sanitized open-source repository, actual functioning-project footage on public YouTube under three minutes, and Devpost submission by November 12 at noon Pacific. A live Cloudflare/D1 deployment and hosted smoke remain useful optional alternatives, not mandatory under the official rules.

No public repository creation, paid API call, remote deployment, actual PayPal operation or GitHub Actions was performed.
