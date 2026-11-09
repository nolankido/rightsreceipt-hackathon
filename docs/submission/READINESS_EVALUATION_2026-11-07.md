# RightsReceipt submission readiness evaluation

**Evaluated:** November 7, 2026, America/Phoenix  
**Evaluated source:** private `nolankido/rightsReceipt`, `main` at `c5cdce068e3481fd22f09a4cde239b8e5cd7a41d` (Turn 143)  
**Decision:** NOT READY TO SUBMIT  
**Planning estimate:** 10 to 20 focused hours if the release and account setup have no major surprises; allow 2 to 4 calendar days with contingency  
**Internal target:** November 9, 2026, 1:00 p.m. Phoenix / 3:00 p.m. Eastern  
**Official cutoff:** November 12, 2026, noon Pacific / 1:00 p.m. Phoenix / 3:00 p.m. Eastern

## Decision

RightsReceipt has substantial implemented functionality and a real executable local AI component. The project has enough substance to enter a focused submission sprint. It is not yet a verified, publicly reviewable hackathon entry.

The same five completion gates identified in the November 4 evaluation remain open: the complete current release, authentic Sandbox payment evidence, separate public source, the final public demo video, and Devpost confirmation. Recent work improved the safeguards around those steps without completing them.

Freeze general feature work. Execute the existing release and Sandbox paths, fix observed blocking defects, then finish the public source, video, and entry. A percentage-complete claim would hide the integration uncertainty.

This evaluation is not evidence of a payment, deployment, source publication, video upload, or Devpost submission. The author did not inspect the signed-in Devpost dashboard or private ignored payment evidence on the owner's computer.

## What was checked

- Recovered the prior RightsReceipt work separately from ReleaseReceipt and BiteGrove.
- Read the connected GitHub repository metadata, latest commits, complete file tree, current status, release documentation, judge instructions, model implementation and submission packet.
- Confirmed the development repository remains private and the latest source checkpoint is Turn 143.
- Rechecked the official hackathon rules, schedule and FAQ.
- Reconstructed a ten-file AI subset of the exact source. All ten Git blob hashes matched repository metadata.
- Executed the actual AI proof and its proof/live-model tests on Node 24.22.1.
- Executed the current Devpost copy preflight against the current committed draft.
- Did not run the complete Node 22 release suite or the full current browser application. Current final UI quality and provider operation therefore remain unverified in this evaluation.

## Fresh verification results

### Actual AI execution

Command:

```bash
node --no-warnings --experimental-strip-types scripts/judge-ai-proof.mjs
```

Observed summary:

```json
{
  "status": "passed",
  "modelArtifactSha256": "6ea099b72fe00ce4643426a2729a84b207ae8eb3460c75488fab3502037e73e2",
  "syntheticRequestCount": 2,
  "evaluatedRightsFields": 24,
  "contradictionWarningVisible": true,
  "modelExecution": "real_local_inference",
  "paymentEvidence": "none"
}
```

The two suites `scripts/judge-ai-proof.test.mjs` and `scripts/judge-ai-live-local.test.mjs` passed 12 tests with no failures or skips. They also reproduced 72 reference field labels/scores and the known territory-contradiction weakness.

These were exact-source subset tests on Node 24.22.1. They required no source change, compatibility resolver, package install, provider credential or payment. They do not certify the required Node 22 release or the full application.

### Devpost copy

Command:

```bash
node scripts/devpost-copy-preflight.mjs
```

Observed exit code: 1. Status: `blocked`.

Blockers:

- `public_repository_url_missing_or_invalid`
- `public_video_url_missing_or_invalid`
- `unresolved_placeholders`

The draft has all 15 required internal sections, but the two final public URLs remain placeholders. Its header also states NOT SUBMITTED. This establishes the repository packet's state, not the current state of an independently edited Devpost account.

## Readiness by deliverable

| Deliverable | Current evidence | What closes it |
| --- | --- | --- |
| Product workflow | Buyer intake, reviewed rights, human consent, deterministic pricing, invoicing, receipts and recovery are implemented and documented | Demonstrate the chosen complete workflow on the frozen release |
| Learned AI | Actual local model freshly ran; 12 focused tests passed | Confirm the final browser exhibit and describe its synthetic-data limitations accurately |
| Complete release | Historical full local verification exists at Turn 51; current Turn 143 full clean release remains unverified | Complete the pinned clean release and preserve its exact-source results |
| PayPal | Adapter, harness, webhook verification and reconciliation code exist; current tests use injected provider responses | Complete authentic Sandbox create/send, separate-buyer payment, paid retrieval and matching verified webhook |
| Judge delivery | Local browser console and complete run instructions are documented | A fresh user can run the public candidate and observe the promised functionality |
| Public repository | Development repo is private; MIT license and sanitized-export tools exist | Publish the reviewed separate export and verify anonymous source/license access |
| Video | Storyboard and QA tools exist; final public URL remains a placeholder | Publish and review actual working-product footage under three minutes |
| Devpost | Substantial draft exists; fresh copy preflight is blocked | Final links, accurate claims, completed form and retained submission confirmation |

The local transaction rehearsal executes real application handlers with scripted participants and injected PayPal responses. Its separate model route executes the learned classifier. Neither by itself proves an authentic PayPal Sandbox transaction.

## Product and judging assessment

The product's strongest idea is its coherent commercial sequence: make an image-use request explicit, obtain matching human approvals, verify financial state through PayPal, and preserve the agreed permission in a checkable receipt. PayPal is naturally part of that workflow.

The AI component is real but deliberately modest. It is a locally trained lexical classifier with twelve rights-field heads, separate from the deterministic source-span extractor. The tests expose a contradiction that the classifier mishandles. Preserve human review and show the warning honestly. Synthetic validation does not establish real-world accuracy, and a hash does not establish copyright ownership.

The largest presentation risk is spending the demo on verification machinery instead of the creator and buyer experience. Lead with the creator's problem, show the request and terms, show approvals and a genuine provider interaction, and end with the receipt. The scripted rehearsal, actual model inference and genuine Sandbox footage must be clearly distinguished.

No numerical competitiveness score is assigned here because the current integrated UI and final video were not directly reviewed. Implementation depth is a strength; the completeness and clarity of the demonstrated product still need to be established.

## Rules that affect the completion plan

The official schedule closes entries on November 12 at noon Pacific. [Official schedule](https://paypalaihackathon.devpost.com/details/dates)

The entry needs meaningful PayPal Sandbox and AI use, a functioning build with access instructions, public source with an open-source license, a description/tool disclosure, and a public YouTube demonstration targeting less than three minutes. Hosting can be replaced by complete executable local setup instructions. [Official overview](https://paypalaihackathon.devpost.com/)

The rules assess implementation, design, impact, innovation and presentation equally after an initial viability screen. Judge access must remain available through the judging period. [Official rules](https://paypalaihackathon.devpost.com/rules)

A sponsor AI service is optional; a local learned model is consistent with the permitted tool/model choice, subject to meaningful use in the actual project. [Official FAQ](https://paypalaihackathon.devpost.com/details/faqs)

The USD 425 scenario, exact Node release evidence, one-commit export, and particular paid-webhook proof sequence are project quality controls. They are not additional organizer rules. Genuine provider proof is still central to supporting this project's advertised payment workflow.

## Work remaining and estimates

These are planning estimates, not measured completion times. They assume access to the existing source checkout and required test accounts, ordinary provider behavior, and no major newly discovered application defect.

| Work package | Focused effort | Completion evidence |
| --- | ---: | --- |
| Frozen complete release and blocker repairs | 2 to 4 hours | Passing complete release on the supported toolchain, with source identity and logs |
| Authentic Sandbox payment and webhook proof | 2 to 5 hours | Matching invoice, separate-buyer payment, authoritative fully paid retrieval and verified callback |
| Public source and fresh-user verification | 1 to 2 hours | Separate sanitized public repository, visible license, working public setup |
| Record, edit, publish and inspect demo | 3 to 5 hours | Public working-product video under three minutes with readable UI and accurate narration |
| Final Devpost copy, access checks and submission | 1 to 2 hours | Correct links, no placeholders, completed entry and retained confirmation |
| **Total** | **9 to 18 hours, rounded to 10 to 20 for planning** | All five completion gates closed |

The technical work could finish faster if the first full run and payment succeed. It could take longer if the release finds integration failures or the account/callback setup is incomplete. Reserve 2 to 4 calendar days, including retry and account-access delays.

## Exact next action

Use the existing command from the complete private checkout with Node 22.13 through 22.x and pnpm 12.8.2:

```powershell
node .\scripts\clean-release-checkout.mjs --shareable --export-public
```

This prepares a clean checkout, runs the current release checks, and prepares a private sanitized export after success. It does not publish the repository.

Review the first actual failure and repair that failure. Preserve the private handoff/evidence files; the shareable JSON omits private local paths. Repeat only as needed to close the current failure.

Then use [SANDBOX_ACCEPTANCE.md](../paypal/SANDBOX_ACCEPTANCE.md). The current registered collector must be ready and bound to the invoice before the separate test buyer pays. The acceptance harness and its unit tests are preparation for that operation, not proof that it occurred.

Once the candidate is proven, publish the reviewed sanitized source, record the final product demonstration, replace Devpost placeholders, and verify the final entry state.

## Calendar and scope control

| Date, Phoenix time | Intended result |
| --- | --- |
| November 8 | Complete release, resolve actual blocking failures, collect authentic Sandbox evidence |
| November 9 | Publish verified source and video, finalize entry, target submission by 1 p.m. |
| November 10 to 11 | Contingency for integration, access, video or link failures |
| November 12, 1 p.m. | Official cutoff; the entry should already be submitted |

This is a recommended schedule, not an automation or promise that these actions have happened.

Until the entry is submitted, defer new features, model replacements, optional sponsor integrations and optional hosting. Keep existing release protections. Fix defects demonstrated by the real release, payment path or final review.

## Evidence references

All internal source references below refer to evaluated commit `c5cdce068e3481fd22f09a4cde239b8e5cd7a41d`:

- [Current project status](https://github.com/nolankido/rightsReceipt/blob/c5cdce068e3481fd22f09a4cde239b8e5cd7a41d/PROJECT_STATUS.md)
- [Current release tooling and runtime pins](https://github.com/nolankido/rightsReceipt/blob/c5cdce068e3481fd22f09a4cde239b8e5cd7a41d/package.json)
- [Turn 143 scope and focused tests](https://github.com/nolankido/rightsReceipt/blob/c5cdce068e3481fd22f09a4cde239b8e5cd7a41d/docs/turns/143-p0-sandbox-private-output-symlink-guard.md)
- [Historical full local build checkpoint](https://github.com/nolankido/rightsReceipt/blob/c5cdce068e3481fd22f09a4cde239b8e5cd7a41d/docs/turns/051-p0-reproducible-release-build.md)
- [Current judge quick start](https://github.com/nolankido/rightsReceipt/blob/c5cdce068e3481fd22f09a4cde239b8e5cd7a41d/docs/submission/JUDGE_QUICKSTART.md)
- [Current Devpost draft](https://github.com/nolankido/rightsReceipt/blob/c5cdce068e3481fd22f09a4cde239b8e5cd7a41d/docs/submission/DEVPOST_DRAFT.md)
- [Actual model proof](https://github.com/nolankido/rightsReceipt/blob/c5cdce068e3481fd22f09a4cde239b8e5cd7a41d/scripts/judge-ai-proof.mjs)
- [Model proof tests](https://github.com/nolankido/rightsReceipt/blob/c5cdce068e3481fd22f09a4cde239b8e5cd7a41d/scripts/judge-ai-proof.test.mjs)
- [Live model tests](https://github.com/nolankido/rightsReceipt/blob/c5cdce068e3481fd22f09a4cde239b8e5cd7a41d/scripts/judge-ai-live-local.test.mjs)
- [Previous November 4 readiness evaluation](https://github.com/nolankido/rightsReceipt/blob/c5cdce068e3481fd22f09a4cde239b8e5cd7a41d/docs/submission/READINESS_EVALUATION_2026-11-04.md)
