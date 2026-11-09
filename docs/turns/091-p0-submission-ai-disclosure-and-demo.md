# Turn 091: Ground the mandatory AI disclosures and release-video capture

**Date:** November 4, 2026  
**Priority:** P0 submission completeness and truthful presentation  
**Baseline:** private `main` after Turn 090

## Submission gap addressed

RightsReceipt's Devpost draft did not name the actual AI training/inference stack in its mandatory tools list. It still contained a placeholder to list the AI tools later, even though the implemented model and its limitations are documented. The 2:35 to 2:50 video storyboard also risked presenting source-grounded deterministic extraction as a learned model, and it did not explicitly distinguish the local judge console's injected PayPal evidence from a real Sandbox settlement.

Under the [official hackathon rules](https://paypalaihackathon.devpost.com/rules), a submission must disclose the tools used, provide a working demo, a public licensed repository, and a publicly visible functioning YouTube video under three minutes. The judges may rely on the video alone.

## Changes made

- **`docs/submission/DEVPOST_DRAFT.md`** now names the real supervised classifier technology (Python, scikit-learn `SGDClassifier`, twelve field heads, 768 lexical features, source-authored synthetic dataset, SHA-256 checked portable TypeScript inference) separately from deterministic source-span extraction and clarification.
- It states the source-grounded deterministic extractor can show evidence while the learned classifier offers read-only label diagnostics without calibrated probability or legal/pricing authority. The held-out contradiction errors mean automatic resolution is not approved.
- The draft now includes concrete local judge run instructions using Node 22 and no paid model service, and identifies the local injected-provider rehearsal as distinct from actual Sandbox settlement. The fake AI-tools placeholder was removed. Final GitHub and YouTube link fields remain unfilled intentionally.
- **`docs/submission/VIDEO_STORYBOARD.md`** now requires actual learned inference output in the AI segment; deterministic highlighting or an invented score must not be passed off as live AI. The payment segment requires genuine provider footage before making actual-payment claims. If that evidence is unavailable, simulations must be clearly labeled and the external acceptance gate remains open.
- **`docs/submission/JUDGE_QUICKSTART.md`** adds a real offline-model verification route on the intended Node version: `node --no-warnings --experimental-strip-types scripts/evaluate-portable-local.mjs --check` plus the portable model test file. It explains why the functional three-journey judge console alone does not prove the trained AI component.

## Verified evidence and limitations

Source cross-reference checks confirmed that:

- The model card identifies twelve independent one-vs-rest classifier heads over 768 unigram/bigram features trained with scikit-learn.
- The actual `scripts/evaluate-portable-local.mjs` supports `--check`, reads and hashes the pinned model and synthetic validation data, performs local inference, verifies no quote authority and compares the committed validation report.
- The referenced portable model test file exists in the private repository.
- The Devpost draft no longer contains its missing-AI-tools placeholder, but still explicitly requires real public repository/video URLs.
- The new video storyboard requires actual inference and a properly grounded PayPal segment.

These are **static source and documentation consistency checks**, not a run of `pnpm release:verify` or a real payment. Node 22.16.0 is present locally, but the full private repository is not mounted and the pinned pnpm release is not cached in this environment; the local git checkout cannot reach GitHub. Existing three-file standalone judge tests from a prior checkout have passed, but they do not verify the current source or live AI inference. No release is marked passed and no external submission has been made.

## Release path, unchanged

1. Obtain a complete clean checkout and run `pnpm submission:candidate:verify`, `pnpm public:export:verify`, and **`pnpm release:verify`** with pinned Node 22 / pnpm 12.8.2. Preserve the tool-generated logs and exact commit identity.
2. Execute a **genuine** Sandbox create/send, separate buyer payment, authenticated PAID GET and matching verified webhook. Never share credentials or private payment URLs.
3. Export and publish **a separate sanitized one-commit public repository**, not the private development history.
4. Record actual browser/model behavior and independently grounded Sandbox footage for a public YouTube demo under three minutes, then populate its real URL and the public repository link in the Devpost draft.
5. Submit Devpost and retain confirmation by the **internal November 9, 2026 at 3:00 p.m. Eastern** target, ahead of the **official November 12, 2026 at 3:00 p.m. Eastern** cutoff. Keep a functioning judge path available through December 15.

**No GitHub Actions, production PayPal requests, paid APIs, public repository publication, YouTube upload or Devpost submission occurred in this turn.**
