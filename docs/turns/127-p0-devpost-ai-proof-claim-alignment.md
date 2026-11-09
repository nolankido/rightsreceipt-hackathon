# Turn 127: align Devpost claims with executable AI proof

**Date:** November 6, 2026  
**Scope:** Final hackathon copy, model demonstration instructions, video capture and regression test  
**Submission status:** NOT READY

## Concrete submission risk

The release candidate now has an executable, SHA-256-verified local AI diagnostic that is mandatory within `judge:console:verify`. The Devpost draft still pointed only to the older portable-model evaluator, and its tagline said `PayPal-paid invoices` while no genuine separate-buyer PayPal Sandbox acceptance had been verified. A judge could follow the old instructions and miss the most direct evidence of learned inference, or read a payment claim stronger than the available provider evidence.

## Changes

1. `docs/submission/DEVPOST_DRAFT.md` now describes human-approved rights and PayPal **invoices** in its tagline, reserving settlement claims for authenticated provider evidence. Its description explicitly separates implemented Sandbox integration from genuine acceptance, which remains an external release gate.
2. The draft's functional demo gives the direct `node --no-warnings --experimental-strip-types scripts/judge-ai-proof.mjs` command and specifies its bounded real inference proof, model SHA-256, two authored synthetic examples, 24 rights comparisons, contradiction alert, `modelExecution: "real_local_inference"` and `paymentEvidence: "none"`. The `/model` browser route remains the recommended visual AI segment, not a synthetic transaction clip.
3. The recording note now correctly distinguishes **Run application rehearsal**, which uses scripted participants and injected PayPal responses, from **Run read-only AI diagnostic**, which runs the actual local model.
4. The draft's accomplishments add the objectively verified synthetic-model proof with an explicit no-payment declaration. No production reliability, license authority, authentic payment or external release is claimed.
5. `docs/submission/VIDEO_STORYBOARD.md` adds a pre-recording proof check on the frozen source and warns that a CLI capture alone is not a functioning product demonstration. `docs/submission/DEVPOST_COPY_QA.md` carries the same manual review boundary.
6. `scripts/devpost-copy-preflight.test.mjs` now checks that Devpost instructions name the executable proof, include its explicit no-payment reporting, distinguish both demo paths, and stay connected to the required release script. The existing preflight's intentionally limited URL/section checks remain unchanged.

## Focused verification

Run from repository root:

```bash
node --test scripts/devpost-copy-preflight.test.mjs
node scripts/devpost-copy-preflight.mjs
node --no-warnings --experimental-strip-types --test scripts/judge-ai-proof.test.mjs
```

The tests passed **10/10** for Devpost copy behavior and **8/8** for the executable AI proof on Node 24.22.1, including an independent child-process execution. The actual draft's copy check exited 1 with:

- `public_repository_url_missing_or_invalid`
- `public_video_url_missing_or_invalid`
- `unresolved_placeholders`

These are correct and expected blockers until genuine public assets are produced. The copy preflight tests syntax and claims scaffolding only; it does not independently verify GitHub visibility, YouTube playback, full application functionality, payment or actual Devpost submission.

## Remaining cutover

This turn improves judge-facing accuracy and reproducibility, but the canonical clean Node 22/pnpm 12 full release could not run in the partial current checkout. No configured PayPal Sandbox credentials or separate buyer payment evidence are available here.

The next P0 step remains the complete `node scripts/clean-release-checkout.mjs --export-public` on the real private repository with pinned Node 22, followed by genuine invoice sent/PAID retrieval/exact signed webhook evidence. Only then publish the sanitized MIT repository, capture the actual product video under three minutes, verify public YouTube playback signed out, replace the draft placeholders, and submit Devpost. Internal target November 9 at 3:00 p.m. Eastern; official deadline November 12, 2026 at noon Pacific.

**Decision:** Turn 127 complete as a copy/truth handoff improvement. The hackathon entry is **not submission-ready**.
