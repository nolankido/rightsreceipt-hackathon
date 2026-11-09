# Turn 122: judge evidence and accurate video claim handoff

**Date:** November 5, 2026  
**Scope:** Submission presentation and proof traceability; no provider or deployment mutation  
**Release status:** NOT READY

## Why this was the next improvement

The project had strong internal release hardening but lacked the final judging-criteria evidence matrix explicitly called for in the submission index. The existing video storyboard used unconditional phrases about PayPal payment evidence and receipt issuance, even though its own warnings correctly acknowledged that genuine Sandbox settlement had not been independently verified. A rushed recording could therefore make the spoken claim stronger than the actual on-screen source.

Before making this change, we checked available execution routes. The current workspace exposes Node 24.22.1, not the pinned Node 22.13+ under major 23, has no full authenticated checkout, and has no configured PayPal Sandbox credentials or PayPal connector. We did not attempt invoice creation, buyer payment, external callback registration, repository publication, YouTube upload or Devpost entry. Execution of those account-bound gates must remain visible rather than be replaced by another local success label.

## Changed files

- [`docs/submission/JUDGING_EVIDENCE_MATRIX.md`](../submission/JUDGING_EVIDENCE_MATRIX.md): new traceable map of Stage One entry requirements, five equally weighted Stage Two criteria, exact source/demo paths, known evidence gaps, timeline-to-screen proof, and release-day sequence.
- [`docs/submission/VIDEO_STORYBOARD.md`](../submission/VIDEO_STORYBOARD.md): added a link to proof requirements and conditional language for the opening, the financial segment and receipt issuance. Genuinely authenticated Sandbox footage and local injection now require distinct narration.
- [`docs/submission/README.md`](../submission/README.md): surfaces the matrix at the top and removes the now-obsolete 'missing matrix' item.
- `PROJECT_STATUS.md`: records the completion and open release blockers without claiming submission readiness.

## Verification and limits

- Rechecked [official rules](https://paypalaihackathon.devpost.com/rules) for the official five equally weighted categories and the local-demo, license, YouTube-duration and deadline rules.
- Inspected the private repository tree to bind examples to actual files and commands. Check all newly referenced relative Markdown paths against the exact private `main` tree before committing.
- Documentation-only changes: link verification and Markdown/source review are appropriate. No focused Node tests or full release tests can close an external evidence gap.
- The current Sandbox case remains hypothetical from this environment. The completed document **does not** certify live PayPal settlement, public playback or actual Devpost submission.

## Acceptance criteria

1. A new reader can find the actual AI inference route and separately identify simulated versus authenticated PayPal behavior.
2. Every Stage Two claim names a product source and a corresponding truthful presentation proof, with unsupported impact/uniqueness assertions excluded.
3. A creator filming before genuine acceptance cannot reuse the stronger financial or receipt narration without an explicit inconsistency.
4. The primary release P0 tasks remain in their correct order and none is marked complete without evidence.

## Next unit

On a full clean Windows checkout with Node 22 and pnpm 12, run `node scripts/clean-release-checkout.mjs --export-public` and save its actual full release record. Configure the approved Sandbox merchant/buyer/callback path, bind the collector before payment, and complete genuine financial acceptance. Only then move the verified one-commit public export and actual functional MP4 toward signed-out publication and Devpost submission. The target remains November 9, 2026 at 3:00 p.m. Eastern.
