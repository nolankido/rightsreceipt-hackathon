# RightsReceipt Devpost Draft

**Status (November 6, 2026):** Submission draft, NOT SUBMITTED. The public repository URL, YouTube video, and genuine PayPal Sandbox acceptance remain unverified. Keep release and payment claims conditional until evidence exists.

**Before copying into Devpost:** Run `node scripts/devpost-copy-preflight.mjs` from the repository root. It intentionally blocks this unfinished draft while public source and YouTube links are placeholders. After inserting independently checked public URLs, rerun the tool and manually verify every feature and payment claim. A structural pass never means the external links work, the video meets the time limit or the entry was submitted.

## Project title

RightsReceipt

## Tagline

Turn vague creative-use requests into human-approved rights, PayPal invoices, and verifiable permission receipts.

## Short description

RightsReceipt helps independent creators handle licensing requests without letting AI make legal, pricing, consent, or payment decisions.

A buyer describes how they want to use an image. A deterministic source-span extractor highlights explicit rights and contradictions, while a locally trained AI classifier offers read-only suggestions across twelve rights fields. The creator reviews and approves exact terms, a deterministic policy sets the quote, and the buyer independently accepts. RightsReceipt implements PayPal Sandbox invoicing, authenticated financial-status checks, webhook verification, and a minimized verifiable permission receipt. The local judge rehearsal uses injected provider responses, not actual PayPal settlement; genuine payment acceptance is a separate release gate.

## Inspiration

Creators often receive messages like "Can we use this photo in an ad?" That sounds simple, but it leaves important questions unanswered: which channels, which countries, how long, how many impressions, whether modification is allowed, whether attribution is required, whether the use is exclusive, and whether sublicensing or AI training is allowed.

The problem is not only payment. It is making sure both sides understand the same permission before money changes hands.

RightsReceipt treats the licensing conversation as a structured transaction while keeping consequential authority with people and deterministic systems.

## What it does

RightsReceipt implements a focused licensing workflow for one deliberately narrow visual-media use case:

- buyer request intake in plain English;
- AI-assisted extraction of requested rights with source evidence and abstention;
- explicit clarification for unresolved terms;
- creator review and correction of all material rights;
- deterministic integer-cent pricing from a versioned creator policy;
- separate creator approval and buyer acceptance;
- PayPal Sandbox invoice creation, sending and payment-state verification;
- verified webhook and reconciliation handling;
- permission lifecycle for paid, canceled and refunded states;
- canonical rights receipt with SHA-256 integrity checks;
- private receipt access plus minimized public verification;
- safe recovery for interrupted or uncertain invoice operations.

The canonical demonstration licenses the image "Harbor After Rain" from creator Maya Chen to Cedar & Tide for paid social use in the United States and Canada. The seeded policy produces a deterministic USD 425.00 quote.

## How AI is used

AI is advisory, not authoritative.

RightsReceipt separates two complementary approaches. The deterministic extractor identifies explicit licensing terms, preserves source text excerpts, and flags unresolved or contradictory requests. A small supervised lexical classifier trained with scikit-learn proposes candidate labels for twelve supported rights fields. Its linear margins are not calibrated probabilities, and its labels do not carry evidence citations or authority.

The classifier is named `rightsreceipt-synthetic-lexical`. It uses project-authored synthetic training data, twelve independent heads and portable TypeScript inference from SHA-256-checked, quantized model weights. It is a genuine learned model, **not a hosted LLM**, but its synthetic validation cannot establish real-world reliability. Held-out evaluation recorded erroneous high-margin answers to contradictory requests, so automatic rights resolution remains disallowed.

Human review is mandatory. Neither AI component may set prices, approve a license, accept on another person's behalf, create financial authority, confirm PayPal payment, activate permission or decide refunds. The creator must explicitly resolve all material terms before the deterministic quote and buyer acceptance.

**Recording requirement:** Show the real learned-model diagnostic at `/model` as well as the licensing rehearsal. The **Run application rehearsal** path scripts participants and injects PayPal-like replies; the separate **Run read-only AI diagnostic** path executes the local model. Label the two paths separately and never describe simulated payment as genuine PayPal acceptance.

## How PayPal is used

PayPal is central to the commercial state of the workflow.

The release uses PayPal Sandbox for:

- OAuth server authentication;
- Invoicing v2 draft creation;
- explicit invoice sending;
- PayPal-hosted buyer payment handoff;
- authoritative invoice status retrieval;
- webhook verification;
- payment reconciliation;
- lifecycle updates that determine whether permission can become active.

RightsReceipt never treats browser redirects, AI output, local simulation or an unverified webhook as payment evidence.

**Release evidence status (draft):** Genuine buyer-paid Sandbox acceptance, authenticated PAID financial retrieval, and an exact-invoice signature-verified webhook have not been independently confirmed in this submission packet. Do not describe the local injected-provider rehearsal as genuine PayPal payment. Replace this status only after the real private acceptance records are obtained.

## How we built it

Primary technologies:

- TypeScript
- React
- Hono
- Vite
- Cloudflare Worker/D1 architecture
- SQLite-compatible local verification
- PayPal Invoicing v2 Sandbox APIs
- local source-grounded extraction and diagnostic ML
- Web Crypto SHA-256
- Vitest plus deterministic Node/browser verification

No paid AI API is required for the core demo.

## Challenges

The hardest part was not creating an invoice. It was defining authority boundaries.

A licensing workflow has several independent facts that must never be conflated:

- what the buyer asked for;
- what the AI inferred;
- what the creator approved;
- what the buyer accepted;
- what price the creator's policy produced;
- whether PayPal actually recorded payment;
- whether permission is currently active.

RightsReceipt models those separately and preserves exact version references so retries, network uncertainty and webhook reordering do not silently change the commercial agreement.

## Accomplishments

Highlights intended for the final release:

- one coherent creator-to-buyer licensing flow;
- deterministic USD 425.00 seeded quote;
- human-in-the-loop rights decisions;
- idempotent invoice operation and recovery design;
- verified payment-state pipeline;
- tamper-evident canonical receipt;
- minimized public verification;
- extensive deterministic local and browser regression coverage;
- one-command local judge rehearsal;
- independent, SHA-256-verified actual-model proof on two synthetic requests with an explicit contradiction warning and `paymentEvidence: "none"`.

Only keep accomplishments in the final Devpost entry if they are verified on the release commit.

## What we learned

The most useful AI pattern for this problem is not autonomous decision-making. It is structured uncertainty.

The system becomes safer and more useful when AI is allowed to say "I found evidence for these fields, but these other terms are missing or contradictory" and then hands authority back to the people involved.

The same principle applies to payments. A payment screen, redirect or model statement is not proof of settlement. Financial state needs an authoritative provider source, verified events and reconciliation.

## What's next

Potential post-hackathon work:

- broader creator-configurable licensing policies;
- additional media and territory models;
- stronger real-world labeled evaluation for the extraction model;
- external signing or anchoring of receipts;
- creator identity and ownership verification integrations;
- additional PayPal commerce workflows.

RightsReceipt is not legal advice and does not prove copyright ownership or identity.

## Functional demo

**Required public repository:** [PUBLIC_REPOSITORY_URL]

**Local judge walkthrough:** From the repository root on Node 22.13+ (but below Node 23), run `node scripts/judge-local-console.mjs`, open the localhost address printed by the command, and choose **Run application rehearsal**. The browser report demonstrates actual local application handlers, three transaction journeys, failure recovery and database resets. It uses a disposable in-memory database, scripted people and simulated PayPal provider responses; it is not real-money or actual Sandbox settlement.

**Actual trained model:** The same local judge console provides **Run read-only AI diagnostic** at `/model`, which launches a credential-stripped Node 22 child process, loads the bundled SHA-256-verified supervised lexical classifier, and runs actual inference alongside separate deterministic source-span extraction on two synthetic requests. This model exhibit is separate from the injected-provider licensing rehearsal and cannot approve rights, determine pricing, or verify payment.

**Reproducible AI proof (no PayPal call):** From the repository root on pinned Node 22, run `node --no-warnings --experimental-strip-types scripts/judge-ai-proof.mjs`. The actual model executes and returns a minimal JSON summary with the verified model hash, two synthetic requests, 24 field comparisons, a contradiction warning, `modelExecution: "real_local_inference"`, and `paymentEvidence: "none"`. This command is checked by the full judge release gate but is not a substitute for visual functionality, licensed rights, real-world model validation, or genuine Sandbox payment. The separate portable-model evaluator is available at `node --no-warnings --experimental-strip-types scripts/evaluate-portable-local.mjs --check`. The `/model` browser route must still be confirmed working in the final release before submission.

**Hosted demo:** Omit this field unless a signed-out accessible running deployment has independently passed its security and functional checks.

## Video

YouTube: [PUBLIC_UNDER_3_MINUTE_VIDEO_URL]

## Tools used

- PayPal Developer Platform, Sandbox only
- PayPal Invoicing v2
- **Python and scikit-learn (SGDClassifier):** train a supervised, twelve-field lexical diagnostic model using 768 binary unigram/bigram features and project-authored synthetic examples. The model is unapproved for automatic rights resolution.
- **Portable TypeScript inference and Web Crypto:** evaluate pinned, SHA-256-checked quantized classifier weights locally without a paid inference API. Candidate margins are not calibrated probabilities.
- **Deterministic source-span extraction and clarification:** preserve verbatim evidence, detect absent or contradictory material rights, and ask for human clarification. This is a separate rule-based component, not the learned classifier.
- TypeScript / React / Hono / Vite
- Cloudflare Worker/D1 architecture
