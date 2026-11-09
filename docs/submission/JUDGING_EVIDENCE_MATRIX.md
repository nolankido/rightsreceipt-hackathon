# RightsReceipt: judge-facing evidence matrix and filming handoff

**Prepared:** November 5, 2026  
**Submission target:** November 9, 2026 at 3:00 p.m. Eastern  
**Decision:** NOT READY TO SUBMIT. This page is a claim-to-proof map, not evidence that a release, payment, video, or entry was completed.

## What must be true before the entry is eligible

The [official PayPal AI Hackathon rules](https://paypalaihackathon.devpost.com/rules) require meaningful PayPal developer-platform and AI use, a functioning application that judges can run or interact with, a public open-source repository with its source and a detectable license, and a **public YouTube demonstration of the working product shorter than three minutes**. A complete local run path can satisfy functional-demo access; optional Cloudflare hosting is not required. Judges may evaluate the video and description without running the code. The entry must actually be submitted by November 12 at noon Pacific, and the working project must remain free and accessible through the December 15 judging endpoint.

The project's **additional internal proof standard** requires a clean Node 22 release and a real, separate-buyer PayPal Sandbox payment with authoritative PAID retrieval and a signature-verified matching webhook. These are our credibility gates, not separately worded contest mandates.

| Stage One requirement | Existing inspectable material | Evidence status and missing action |
| --- | --- | --- |
| Actual AI use | Read-only trained-model `/model` route via [`judge-local-console.mjs`](../../scripts/judge-local-console.mjs); [`judge-ai-demo.mjs`](../../scripts/judge-ai-demo.mjs); [model card](../model/MODEL_CARD.md) | **Implemented, final release unverified.** Capture actual local inference and its contradiction warning after the full release passes. The scripted transaction does not execute this model. |
| Meaningful PayPal integration | [invoice creation](../../apps/api/src/invoice-creation.ts), [invoice sending](../../apps/api/src/invoice-sending.ts), [reconciliation](../../apps/api/src/paypal-reconciliation.ts), [signed-webhook processing](../../apps/api/src/paypal-webhook-processing.ts), [Sandbox acceptance](../paypal/SANDBOX_ACCEPTANCE.md) | **Code exists, genuine transaction unverified.** Perform distinct Sandbox buyer payment, authenticated PAID GET and authentic exact-invoice webhook validation. Do not substitute injected provider responses. |
| Working product access | [judge quick start](JUDGE_QUICKSTART.md), [local console](../../scripts/judge-local-console.mjs), [real-worker smoke](../../scripts/judge-console-real-smoke.mjs) | **Runnable path described, final release unverified.** A clean exact-commit Node 22 run must prove it works without accounts or secrets. |
| Public source and visible license | [privacy audit / export runbook](SAFE_PUBLIC_RELEASE_PUBLICATION.md), [anonymous MIT check](ANONYMOUS_PUBLIC_GITHUB_CHECK.md) | **Not published or anonymously checked.** Never expose the private development history. Use only a verified one-commit sanitized export. |
| Actual functioning video | [2:35 to 2:50 storyboard](VIDEO_STORYBOARD.md), [MP4 preflight](VIDEO_RELEASE_QA.md) | **No final video supplied or publicly verified.** Show real screens, review the exact MP4, upload Public to YouTube, and verify signed out. |
| Submitted entry | [Devpost draft](DEVPOST_DRAFT.md), [final cutover](FINAL_CUTOVER_CHECKLIST.md) | **Not submitted.** Replace placeholders with verified URLs and retain Devpost confirmation. |

## Stage Two: five equally weighted judging criteria

The rows below are **evidence priorities**, not predicted scores. Every visual claim should have a live source, an executable command, or a verifiable source file. Documentation alone is not a substitute for a working demonstration.

| Criterion | Specific product claim worth showing | Best available proof surface | Weak spot to address before publication |
| --- | --- | --- | --- |
| **Technological implementation** | An actual trained lexical classifier suggests rights; humans alone resolve scope; deterministic quote and PayPal financial authority are separate | Live `/model` diagnostic and source-span comparisons; [`creator-review.ts`](../../apps/api/src/creator-review.ts), [`invoice-creation.ts`](../../apps/api/src/invoice-creation.ts), [`paypal-webhook-processing.ts`](../../apps/api/src/paypal-webhook-processing.ts) | Full source release and genuine Sandbox invoice/event evidence remain absent. Do not say the rehearsal itself proves live PayPal or live learned inference. |
| **Design** | The buyer, creator and public verifier each see only the decision appropriate to their role | Actual running [buyer](../../apps/web/src/buyer.tsx) and [creator](../../apps/web/src/creator.tsx) interfaces when verified; otherwise clearly labeled [local judge console](../../scripts/support/judge-console-page.mjs) | The judge console is a *simulation and evidence viewer*, not the full logged-in product. Do not film a static mock as if interactive. |
| **Potential impact** | A small image creator can turn a vague commercial-use request into explicit scope, price, consent and a checkable record | The *Harbor After Rain* case, twelve reviewed rights fields and USD 425.00 canonical quote in [judge guide](JUDGE_QUICKSTART.md) | This is a plausible user problem, **not** evidence of adoption, measured savings, actual income, or verified copyright ownership. Avoid unsupported market numbers. |
| **Innovation / idea** | AI is useful specifically because it can surface uncertainty without owning consent, pricing or payment state | Contradictory territory case in live `/model` output plus the real recovery journey; [AI task contract](../model/AI_TASK_CONTRACT.md), [architecture](../architecture/SYSTEM_ARCHITECTURE.md) | Describe what is distinctive about this implementation. Do not claim to be the first such platform or a substitute for legal advice. |
| **Presentation** | One intelligible request goes through distinct authority boundaries; the video shows the product operating | Exact [storyboard](VIDEO_STORYBOARD.md), actual running interface, generated judge report, authentic Sandbox footage **if obtained** | No verified MP4/Public YouTube URL yet. Narration must switch to the simulated-payment variant when genuine financial proof is unavailable. |

## Capture-to-proof handoff

Use the existing [storyboard](VIDEO_STORYBOARD.md) for time codes, voiceover and edits. The following table says **which source is legitimate** for each claim. Capture from the exact fully verified release commit only. Never put secrets, callback routes, token-bearing URLs, personal messages or real account identifiers in the frames.

| Storyboard range | Required visual evidence | Label and truth condition |
| --- | --- | --- |
| **0:00 to 0:12** | Working product / locally rendered judge entry with the synthetic *Harbor After Rain* problem | Do not use a design-only mockup as product functionality. |
| **0:12 to 0:35** | Real `/model` route from a running Node 22 console: source excerpt, learned prediction, contradiction/human-review message | **LEARNED MODEL, REVIEW ONLY**. The trained model and deterministic extractor are distinct, and scores are not calibrated probabilities. |
| **0:35 to 1:18** | Actual creator review / buyer agreement screens **if working**; if presenting the scripted judge report, show its genuine generated output | **SCRIPTED PARTICIPANTS** on the rehearsal. A USD 425.00 deterministic quote is a seeded example, not an actual customer sale. |
| **1:18 to 1:50** | Real PayPal Sandbox invoice and state on a redacted dedicated test account **only if the acceptance record proves it** | **GENUINE PAYPAL SANDBOX** only after separate-buyer payment, paid GET and signed matching callback. Otherwise use **LOCAL SIMULATION, NO PAYPAL PAYMENT** and the alternate narration. |
| **1:50 to 2:18** | Actual receipt/status in a running environment or the generated scripted rehearsal report | Say **verified payment** only in the genuine acceptance branch. In simulation, call it the *receipt behavior demonstrated by the local rehearsal*. A SHA-256 hash is not a signature or ownership proof. |
| **2:18 to 2:50** | Actual recovery/reset report and close; brief reproducible `node scripts/judge-local-console.mjs` command | State that network uncertainty and repeated requests are reconciled. Do not claim live refund or failure processing from a simulated clip. |

## Honest claims for the two possible release states

**If genuine Sandbox acceptance and clean release both pass:** "The demonstration includes a PayPal Sandbox invoice paid by a separate test buyer, an authenticated paid-status retrieval and a matching signature-verified webhook. AI suggestions remain advisory and a human approves the rights and quote." Film only verified actual screens; put the evidence receipt in the private submission ledger, not the public video.

**If Sandbox acceptance remains blocked:** "The functioning local demonstration uses scripted participants and simulated PayPal provider responses. The project implements PayPal Sandbox invoicing and verification paths, but a real buyer-paid transaction and matching signed webhook have not yet been independently demonstrated." Do not quietly substitute the first claim, even if offline fixture tests pass. This fallback leaves the stronger internal gate open and requires an explicit eligibility/viability decision before submission.

## Release-day actions, in priority order

1. **Full source:** On the operator's complete Windows checkout, run the [clean Node 22 release](CLEAN_CHECKOUT_RELEASE.md); save the exact commit and successful full private verification record. The current workspace has Node 24 and no full authenticated checkout, so it cannot close this gate.
2. **Genuine financial proof:** With dedicated Sandbox merchant and separate buyer, configure a reachable same-app paid-webhook callback **before invoice creation**, bind the actual sent invoice **before payment**, then perform [Sandbox acceptance](../paypal/SANDBOX_ACCEPTANCE.md). This workspace has no configured PayPal Sandbox credentials or managed callback.
3. **Public delivery:** After passing gates, publish only the audited one-commit MIT-licensed source. Confirm it and the Node 22 local judge instructions anonymously.
4. **Working video:** Record actual product screens, choose the payment narration branch by evidence, export under three minutes, run [video QA](VIDEO_RELEASE_QA.md) and verify Public YouTube playback signed out.
5. **Submit:** Fill the exact public source/video URLs in [Devpost draft](DEVPOST_DRAFT.md), run [copy preflight](DEVPOST_COPY_QA.md), manually submit and retain the final confirmation.

**Do not expand scope:** no new hosted deployment, paid API, production transaction, repository visibility change, public upload or Devpost submission is authorized by this evidence matrix. It is an execution handoff for gates that remain open.
