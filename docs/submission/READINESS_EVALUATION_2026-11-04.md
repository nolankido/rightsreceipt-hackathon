# RightsReceipt: submission readiness evaluation and cutover plan

**Evaluated:** November 4, 2026  
**Source checkpoint:** private `nolankido/rightsReceipt`, `main` at `e26207001b16bd525c3af52e44638aa44c477da4` (Turn 082)  
**Decision:** NOT READY TO SUBMIT  
**Internal submission target:** Monday, November 9, 2026 at 3:00 p.m. Eastern  
**Official cutoff:** Thursday, November 12, 2026 at 12:00 p.m. Pacific / 3:00 p.m. Eastern

This is a time-boxed release plan, not proof that a test, transaction, deployment or submission occurred. It supersedes the scheduling and next-step recommendations in `RELEASE_READINESS_AUDIT_2026-10-29.md`; that older audit remains as historical context. Do not equate implementation, prior isolated tests or injected-provider rehearsals with a genuine PayPal transaction or a fully tested release.

## Decision in one paragraph

RightsReceipt has the substance for a compelling entry: a buyer expresses a commercial image use, source-grounded AI proposes structured rights and abstains on uncertainty, the creator determines terms and a deterministic USD 425.00 quote, the buyer independently accepts, PayPal is the financial authority, and a verifiable receipt records permission state. The engineering work is unusually mature for a hackathon, but the project is still vulnerable to a **Stage One failure or an incomplete submission** because genuine Sandbox operation, a clean pinned release verification, a sanitized public repository, a public under-three-minute working demo video and a submitted Devpost entry are not evidenced. The best next work is release execution and presentation, not another general feature sprint.

## Rules and interpretation

Primary sources checked November 4:

- [Official PayPal AI Hackathon rules](https://paypalaihackathon.devpost.com/rules)
- [Official FAQ](https://paypalaihackathon.devpost.com/details/faqs)
- [PayPal developer announcement](https://developer.paypal.com/community/blog/PayPal_AI_Hackathon/)

Official **requirements** are meaningful PayPal developer-platform and AI use; an actually functioning app; an English description and tool-use disclosure; an accessible working demo or complete instructions for judges to run it; a public repository with all needed source, assets and a visible open-source license; and a publicly visible YouTube demonstration of the working product, shorter than three minutes. Judging access must remain free and unrestricted through December 15, 2026. A hosted demo is **not mandatory** if the executable self-run path is complete. Projects started before October 1 must have significant hackathon-period updates; GitHub records show this repository was created on October 26, within the submission period. Judges may rely on the video and written entry without running the application.

The following are **our higher-quality evidence gates**, not separately stated contest rules: a real Sandbox buyer-paid USD 425.00 invoice, authenticated PAID financial GET, signature-verified matching webhook, exact-commit clean Node 22 release suite and privacy-preserving one-commit public export. These gates reduce the chance of a misleading integration claim and strengthen technical scoring. Do not present them as an additional legal Devpost rule.

Stage One is pass/fail on theme and real PayPal/AI application. Stage Two weights **technological implementation, design, potential impact, innovation/idea and presentation equally**. The final five days should increase the minimum of these scores: genuine integration proof and an instantly understandable judge journey are more valuable now than adding optional scope.

## Observed readiness at Turn 082

| Workstream | Evidence actually found | Current gate | Priority |
| --- | --- | --- | --- |
| Product concept and workflow | React/Hono/Worker source, seeded USD 425.00 case, rights and receipt modules, many isolated tests | Substantial implementation; full end-to-end release not verified here | Maintain, no new scope |
| AI | Source-grounded extraction, a local portable diagnostic model, abstention and human review documented | Implemented; real model behavior in a judge-recorded flow remains to be demonstrated accurately | P1 presentation |
| PayPal | Invoicing v2 adapter, OAuth, send/recovery, financial reconciliation, webhook verification, latest redirect hardening | **No genuine buyer-paid Sandbox acceptance evidence** | P0 |
| Release test | Focused Turn 082 transport tests reported passing on Node 22.16.0; new acceptance integration tests staged | **No complete pinned clean `pnpm release:verify` run** | P0 |
| Judge demo | No-install `node scripts/judge-local-console.mjs`, actual handlers and in-memory SQL with injected provider/scripted participants | Usable simulated local route; not live AI, actual PayPal settlement or managed login | P0 judge clarity |
| Hosting | Restricted Cloudflare judge preview code and preflight documented | No verified publicly accessible deployed preview | P2 optional |
| Repository | MIT LICENSE and public-release audit/export tooling; development repository is private | **No sanitized one-commit public repo**; do not expose private Git history | P0 |
| Video | `VIDEO_STORYBOARD.md` targets 2:35 to 2:50 | **No verified public YouTube video** | P0 |
| Devpost | `DEVPOST_DRAFT.md` exists with release placeholders | **No submission or confirmation observed** | P0 |

Assessment limit: this review read the connected private repository and official rules, but this execution environment has no authenticated full checkout, has Node 24/pnpm 11 rather than the project's pinned Node 22/pnpm 12, and did not access PayPal credentials or the Devpost account. It cannot certify a full build, remote payment, public deployment or submission. Prior test counts in project documents are historical claims, not tests rerun by this evaluation.

## Most important risks and cut lines

1. **External-payment gap:** A simulated invoice must never be described as a genuine PayPal transaction. Close with the existing `docs/paypal/SANDBOX_ACCEPTANCE.md` harness. Prepare and bind the real webhook listener **before** the personal Sandbox buyer pays, then retrieve PAID status and verify the matching signed callback. Do not expose secrets, private payment links or webhook payloads.
2. **Verification gap:** Execute from a clean exact source with Node 22.13 through 22.x and pnpm 12.8.2. `pnpm release:verify` is the release evidence gate. Repair failing P0 behavior before recording the final video or exporting the public tree. Do not mark green from focused tests alone.
3. **Public-history privacy:** The private development repository's historical Git metadata is unsuitable for publication. Use `pnpm public:audit` and the existing one-commit `pnpm public:export` path, then publish only the sanitized result after reviewing it. Never flip this development repository's visibility as a shortcut.
4. **Presentation gap:** The main README opens with extensive engineering history, while judges may never read past the first screen. Put the value proposition, reproducible local demo, exact AI/PayPal authority boundaries and honest release status first. Make the final video demonstrate actual functioning product footage, with simulated portions labeled.
5. **Owner-bound tasks:** PayPal Sandbox business and personal accounts, a registered HTTPS webhook, GitHub public-repo publication, YouTube public upload, and Devpost account submission require account-bound decisions or credentials. Keep these visible on the critical path. Do not incur paid API, hosting or other charges without permission.

## Work order with acceptance criteria

### P0.1 Clean-source release gate

- In a full private checkout confirm the pinned Node/pnpm versions, install using `pnpm install --frozen-lockfile`, and run `pnpm release:verify`.
- Preserve the tool-generated exact-commit `verification.json` and the complete logs under ignored `.data`.
- Specifically confirm the Turn 080 to 082 integration regressions and real-worker judge console smoke are executed, not just included in source.
- **Done when:** one full release record passes on a clean HEAD; failing or partial stages are enumerated and fixed.

### P0.2 Genuine PayPal Sandbox acceptance

- Set up the same-app registered `INVOICING.INVOICE.PAID` webhook and an approved HTTPS:443 receiver **before invoice creation**. If using the one-shot local collector, keep it live and bind it to the exact sent invoice before buyer payment. See the corrected chronological runbook.
- Run the read-only webhook registration preflight; create/send the USD 425.00 invoice; have a different personal Sandbox test buyer pay; retrieve authoritative paid financial detail; verify an authentic same-invoice webhook; reconcile the sanitized stage evidence.
- **Done when:** the existing genuine acceptance checker passes on the three private stage records, with no production PayPal API usage or disclosed secrets.
- If the webhook cannot be verified by November 7, do not falsely claim it. Reassess Stage One viability using only actually observed provider requests and transparently describe the limitation. The contest does not separately mandate a particular webhook method, but meaningful PayPal integration remains mandatory.

### P0.3 Judge delivery and public source

- Run `node scripts/judge-console-real-smoke.mjs` from the clean checkout and manually open the browser console for a first-time-user walk-through.
- Pick exactly one primary judge path: a proven Sandbox hosted experience **only if safe and ready**, otherwise the executable local demo with complete Node 22 run instructions and explicit injected-provider disclosures.
- Run the full privacy audit and one-commit export only after the release gate. Check the exported tree and history. Create a **new** public repository from it and test its LICENSE, README, source and run command signed out. Avoid placing keys or buyer capabilities in the repo or Devpost.
- **Done when:** an anonymous judge can read the source/license and reproduce the stated functional path without private development credentials.

### P0.4 Demo video and Devpost

- Record a clear 2:35 to 2:50 demonstration from the frozen candidate, with readable actual app UI. Separate live Sandbox footage from any injected-provider simulation on screen. Do not include browser tabs, personal account identifiers, secrets or copyrighted assets without rights.
- Upload to public YouTube and verify playback signed out, duration under three minutes, and correct audio/captions.
- Replace all final `DEVPOST_DRAFT.md` release placeholders, describe actual tool use, paste the public source and demo links, include complete testing instructions, and submit the Devpost form.
- **Done when:** the entry is confirmed submitted, the URLs work signed out, and a dated confirmation is saved privately.

### P1 only after all P0 gates

- Improve first-visit demo wording and visual polish, tighten the five equally weighted judging arguments, and obtain one independent viewer's first-impression feedback.
- Optional hosted judge preview is beneficial but must not delay the working self-run alternative. Do not introduce sponsor integrations, new media types, subscriptions or production payments this week.

## Calendar, with buffer before the official cutoff

| Date (Eastern) | Target deliverable | Stop condition |
| --- | --- | --- |
| **Nov 4** | Publish this current evaluation; fix the Sandbox acceptance operator order; make README judge-first | No new feature scope |
| **Nov 5** | Clean pinned release gate completed; repair only release-blocking defects | Do not record final proof from a failing commit |
| **Nov 6** | Genuine Sandbox merchant/buyer invoice and matching webhook acceptance, or a precisely documented blocker | No simulated event labeled genuine |
| **Nov 7** | Full privacy audit, one-commit sanitized source export, fresh-clone judge walkthrough | Never publish development history |
| **Nov 8** | Final video recorded, uploaded Public and checked signed out; Devpost draft populated | No placeholders or unverified functionality claims |
| **Nov 9, 3:00 p.m. ET** | **Internal submission target:** submit and capture confirmation | Stop extra polish; ensure complete entry |
| **Nov 10 to 11** | Contingency days: broken-link repair, accessible demo check, correction of legitimate blockers | No unnecessary feature work |
| **Nov 12, 3:00 p.m. ET** | Official hard deadline; entry must already be complete | Never plan to first submit at the cutoff |

Work can overlap: prepare narrative, account setup and video capture list while release tests run, but only claim and film final features after verification. Submit early and verify Devpost's final state, not just a draft or saved form.

## Explicit no-go decisions

- **Do not** make the private development repository public.
- **Do not** claim simulated PayPal settlement, AI inference, legal rights ownership or live user identity verification when they have not been demonstrated.
- **Do not** publish a draft YouTube video as if it proves a real Sandbox payment.
- **Do not** add production PayPal credentials or initiate live-money transactions.
- **Do not** spend time on optional hosted deployment if the working local path and genuine API evidence are still unfinished.
- **Do not** call a release complete based on a passing offline consistency checker; `pnpm submission:candidate:check` intentionally cannot prove public URLs or Devpost submission.

## Turn 083 selected from this evaluation

The first immediate improvement is **submission-cutover clarity**: put the pitch and executable judge entry point before historical engineering notes, and repair the acceptance runbook's nonchronological webhook instructions so an operator cannot accidentally pay before binding the one-shot listener. Record the actual scope and verification limits in a turn receipt. Follow with P0.1 and P0.2 rather than another isolated hardening sprint.

## Final human/account-bound confirmations

- [ ] A real Sandbox merchant REST app, distinct personal Sandbox test buyer and same-app webhook have been configured by the operator.
- [ ] Full clean Node 22 / pnpm 12 release evidence is saved from the frozen commit.
- [ ] Real Sandbox create, send, paid GET, verified callback and sanitized reconciliation evidence are saved.
- [ ] A new sanitized one-commit public repository is published and its LICENSE and demo path work signed out.
- [ ] Under-three-minute YouTube video is Public and watchable signed out.
- [ ] Devpost form has been submitted, not merely saved as draft; confirmation and exact URLs are retained privately.

If these are incomplete at the November 9 target, report the exact remaining blockers that day and use the remaining three days deliberately. The official contest rules, rather than internal aspirations, control minimum eligibility; truthful disclosure always controls any fallback.
